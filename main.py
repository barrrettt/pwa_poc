"""
PWA POC - Main Application
Clean main file with modular push notification handlers
"""
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import json
from pathlib import Path
import logging
from typing import List
import threading
import time
from datetime import datetime

# Import push notification modules
from back_modules import webpush_handler, fcm_handler

# App version
APP_VERSION = "1.0.16"

# Load environment variables
load_dotenv()

# Initialize Firebase
fcm_handler.init_firebase()

# Initialize FastAPI
app = FastAPI()

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Data files
HISTORY_FILE = Path("data/history.json")
BACKGROUND_ACTIVITY_FILE = Path("data/background_activity.json")


# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"🔌 Cliente conectado. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print(f"🔌 Cliente desconectado. Quedan: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        
        # Remove disconnected connections
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)


manager = ConnectionManager()


# Data models
class TestRequest(BaseModel):
    fingerprint: str = ""


class TestResponse(BaseModel):
    data: str


# Helper functions
def load_history():
    """Load history from JSON file"""
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE, "r") as f:
                content = f.read().strip()
                if content:
                    return json.loads(content)
        except (json.JSONDecodeError, Exception) as e:
            print(f"⚠️ Error loading history: {e}. Starting with empty list.")
    return []


def save_history(history_data):
    """Save history to JSON file"""
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(HISTORY_FILE, "w") as f:
        json.dump(history_data, f, indent=2)


def load_background_activity():
    """Load background activity log from JSON file"""
    if BACKGROUND_ACTIVITY_FILE.exists():
        try:
            with open(BACKGROUND_ACTIVITY_FILE, "r") as f:
                content = f.read().strip()
                if content:
                    return json.loads(content)
        except (json.JSONDecodeError, Exception) as e:
            print(f"⚠️ Error loading background activity: {e}. Starting with empty dict.")
    return {}


def save_background_activity(activity_log):
    """Save background activity log to JSON file"""
    BACKGROUND_ACTIVITY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(BACKGROUND_ACTIVITY_FILE, "w") as f:
        json.dump(activity_log, f, indent=2)


def add_history_event(event_type: str, message: str, details: dict = None):
    """Add event to history and broadcast to all clients"""
    event = {
        "type": event_type,
        "message": message,
        "details": details or {},
        "timestamp": time.time()
    }
    print(f"🔵 Adding event to history: {event_type} - {message}")
    history.append(event)
    # Keep only last 1000 events
    if len(history) > 1000:
        history.pop(0)
    save_history(history)
    print(f"💾 History saved. Total events: {len(history)}")
    return event


async def broadcast_history():
    """Broadcast only the latest event to all connected clients (not entire history)"""
    if history:
        latest_event = history[-1]  # Get last event only
        await manager.broadcast({
            "type": "history_update", 
            "event": latest_event  # Single event, not entire array
        })
    else:
        await manager.broadcast({
            "type": "history_update",
            "event": None
        })


# Load data on startup
history = load_history()


# ============================================================================
# COMMON ROUTES
# ============================================================================

@app.get("/", response_class=HTMLResponse)
async def root():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        return f.read()


@app.get("/manifest.json")
async def manifest():
    return FileResponse("static/manifest.json")


@app.get("/sw.js")
async def service_worker():
    return FileResponse("static/sw.js", media_type="application/javascript")


@app.get("/api/version")
async def get_version():
    """Return app version"""
    return {"version": APP_VERSION}


@app.get("/api/vapid-public-key")
async def get_vapid_public_key():
    """Return the VAPID public key for push subscription"""
    public_key = os.getenv("VAPID_PUBLIC_KEY")
    if not public_key:
        raise HTTPException(status_code=500, detail="VAPID public key not configured")
    return {"publicKey": public_key}


# ============================================================================
# WEBSOCKET
# ============================================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global history
    
    await manager.connect(websocket)
    
    # Reload history from file before sending (ensures fresh data)
    history = load_history()
    
    # Don't send initial history via WebSocket - frontend loads from API
    # This prevents sending large amounts of data on every reconnect
    
    try:
        while True:
            # Receive messages from client (if needed in future)
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Future: could handle client-to-server messages here
            
    except WebSocketDisconnect:
        pass  # Normal disconnect
    except Exception:
        pass  # Connection error
    finally:
        manager.disconnect(websocket)


# ============================================================================
# HISTORY API
# ============================================================================

@app.get("/api/history")
async def get_history(page: int = 1, limit: int = 20):
    """Get paginated history"""
    total = len(history)
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    
    # Return events in reverse order (newest first) and paginate
    reversed_history = list(reversed(history))
    paginated_history = reversed_history[start_idx:end_idx]
    
    return {
        "history": paginated_history,
        "total": total,
        "page": page,
        "limit": limit,
        "hasMore": end_idx < total
    }


@app.post("/api/history/clear")
async def clear_history():
    """Clear history and broadcast to all clients"""
    global history
    print("🗑️ Clearing history...")
    history.clear()
    save_history(history)
    print(f"📡 Broadcasting clear to {len(manager.active_connections)} clients...")
    # Broadcast clear signal to all clients
    await manager.broadcast({'type': 'history_clear'})
    print("✅ History cleared and broadcasted")
    return {"status": "cleared"}


# ============================================================================
# TEST ENDPOINT
# ============================================================================

@app.post("/api/test", response_model=TestResponse)
async def test_endpoint(request: TestRequest):
    print(f"📡 Test - {request.fingerprint[:16] if request.fingerprint else 'Unknown'}...")
    
    # Add to history
    add_history_event(
        "test", 
        "🧪 Test endpoint called", 
        {
            "data": "test ok",
            "fingerprint": request.fingerprint[:16] if request.fingerprint else "Unknown"
        }
    )
    
    # Broadcast only the new event (not entire history)
    await broadcast_history()
    
    return {"data": "test ok"}


# ============================================================================
# BACKGROUND ACTIVITY (SERVICE WORKER HEARTBEAT)
# ============================================================================

@app.post("/api/heartbeat")
async def heartbeat(request: TestRequest):
    """Register background activity from Service Worker"""
    try:
        activity_log = load_background_activity()
        
        fingerprint = request.fingerprint or "unknown"
        current_time = time.time()
        
        activity_log[fingerprint] = {
            "last_activity": current_time,
            "timestamp": datetime.fromtimestamp(current_time).strftime('%Y-%m-%d %H:%M:%S')
        }
        
        save_background_activity(activity_log)
        
        return {
            "status": "ok",
            "fingerprint": fingerprint,
            "registered_at": activity_log[fingerprint]["timestamp"]
        }
    except Exception as e:
        print(f"❌ Error in heartbeat: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/activity/{fingerprint}")
async def get_activity(fingerprint: str):
    """Get last activity time for a fingerprint"""
    try:
        activity_log = load_background_activity()
        
        if fingerprint not in activity_log:
            return {
                "fingerprint": fingerprint,
                "last_activity": None,
                "minutes_ago": None,
                "status": "never_seen"
            }
        
        last_activity = activity_log[fingerprint]["last_activity"]
        current_time = time.time()
        minutes_ago = (current_time - last_activity) / 60
        
        # Determine status
        if minutes_ago < 10:
            status = "active"
        elif minutes_ago < 30:
            status = "idle"
        else:
            status = "inactive"
        
        return {
            "fingerprint": fingerprint,
            "last_activity": activity_log[fingerprint]["timestamp"],
            "seconds_ago": int(current_time - last_activity),
            "minutes_ago": round(minutes_ago, 1),
            "status": status
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# WEBPUSH ROUTES (from webpush_handler module)
# ============================================================================

# Mount WebPush routes with history callbacks
@app.post("/api/subscribe")
async def subscribe_route(subscription: webpush_handler.PushSubscription):
    return await webpush_handler.subscribe(subscription, add_history_event, broadcast_history)


@app.post("/api/unsubscribe")
async def unsubscribe_route(subscription: webpush_handler.PushSubscription):
    return await webpush_handler.unsubscribe(subscription, add_history_event, broadcast_history)


@app.get("/api/check-subscription/{fingerprint}")
async def check_subscription_route(fingerprint: str):
    return await webpush_handler.check_subscription(fingerprint)


@app.post("/api/clear-subscriptions")
async def clear_subscriptions_route():
    return await webpush_handler.clear_subscriptions(add_history_event, broadcast_history)


@app.post("/api/send-notification")
async def send_notification_route(payload: webpush_handler.NotificationPayload):
    return await webpush_handler.send_notification(payload, add_history_event, broadcast_history)


# ============================================================================
# FCM ROUTES (from fcm_handler module)
# ============================================================================

# Mount FCM routes with history callbacks
@app.post("/api/fcm/subscribe")
async def fcm_subscribe_route(subscription: fcm_handler.FCMSubscription):
    return await fcm_handler.fcm_subscribe(subscription, add_history_event, broadcast_history)


@app.post("/api/fcm/unsubscribe")
async def fcm_unsubscribe_route(subscription: fcm_handler.FCMSubscription):
    return await fcm_handler.fcm_unsubscribe(subscription, add_history_event, broadcast_history)


@app.get("/api/fcm/check-subscription/{fingerprint}")
async def fcm_check_subscription_route(fingerprint: str):
    return await fcm_handler.fcm_check_subscription(fingerprint)


@app.post("/api/fcm/clear-subscriptions")
async def fcm_clear_subscriptions_route():
    return await fcm_handler.fcm_clear_subscriptions(add_history_event, broadcast_history)


@app.post("/api/fcm/send")
async def fcm_send_route(payload: fcm_handler.FCMNotificationPayload):
    return await fcm_handler.fcm_send_notification(payload, add_history_event, broadcast_history)


# ============================================================================
# STARTUP
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    
    # Suppress ConnectionResetError on Windows
    logging.getLogger("asyncio").setLevel(logging.CRITICAL)
    
    # Clear background activity log on startup
    if BACKGROUND_ACTIVITY_FILE.exists():
        BACKGROUND_ACTIVITY_FILE.unlink()
        print("🗑️ Cleared background activity log from previous session")
    
    # Start periodic notification thread (WebPush)
    print("🧵 Starting periodic WebPush notification thread...")
    periodic_thread = threading.Thread(target=webpush_handler.send_periodic_notifications, daemon=True)
    periodic_thread.start()
    print("✅ Periodic notification thread started (will send every 10 minutes)")
    
    print("🚀 Server starting...")
    print("📱 Local: http://localhost:8000")
    print("🌐 For mobile: Use ngrok (see README.md)")
    print("   Run: ngrok http 8000")
    print("⚠️  Close terminal to stop server")
    
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        log_level="warning",
        access_log=False
    )
