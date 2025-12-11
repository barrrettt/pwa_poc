from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pywebpush import webpush, WebPushException
from dotenv import load_dotenv
import os
import json
import base64
from pathlib import Path
import logging
import asyncio
from typing import List
import threading
import time
from datetime import datetime

# App version
APP_VERSION = "1.0.4"

# Load environment variables
load_dotenv()

app = FastAPI()

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
            except Exception as e:
                disconnected.append(connection)
        
        # Remove disconnected connections
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)

manager = ConnectionManager()

app = FastAPI()

# Servir archivos estáticos
app.mount("/static", StaticFiles(directory="static"), name="static")

# Data files
SUBSCRIPTIONS_FILE = Path("data/subscriptions.json")
HISTORY_FILE = Path("data/history.json")
BACKGROUND_ACTIVITY_FILE = Path("data/background_activity.json")

def load_subscriptions():
    """Load subscriptions from JSON file"""
    if SUBSCRIPTIONS_FILE.exists():
        try:
            with open(SUBSCRIPTIONS_FILE, "r") as f:
                content = f.read().strip()
                if content:
                    return json.loads(content)
        except (json.JSONDecodeError, Exception) as e:
            print(f"⚠️ Error loading subscriptions: {e}. Starting with empty list.")
    return []

def save_subscriptions(subscriptions):
    """Save subscriptions to JSON file"""
    SUBSCRIPTIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SUBSCRIPTIONS_FILE, "w") as f:
        json.dump(subscriptions, f, indent=2)

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

def save_history(history):
    """Save history to JSON file"""
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)

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
    import time
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

# Load data on startup
subscriptions = load_subscriptions()
history = load_history()


class TestResponse(BaseModel):
    data: str


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict
    device_fingerprint: str  # Unique device identifier


class NotificationPayload(BaseModel):
    title: str
    body: str
    icon: str = "/static/icon-192.png"


class TestRequest(BaseModel):
    fingerprint: str = ""


@app.get("/", response_class=HTMLResponse)
async def root():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        return f.read()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global history
    
    await manager.connect(websocket)
    
    # Send current history to the new client
    try:
        await websocket.send_json({"type": "history_update", "history": history})
    except Exception as e:
        pass  # Client will reconnect if needed
    
    try:
        while True:
            # Receive messages from client
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Process message and broadcast to all clients
            if message.get('type') == 'clear_history':
                history.clear()
                save_history(history)
                await manager.broadcast({'type': 'history_update', 'history': history})
            
    except WebSocketDisconnect:
        pass  # Normal disconnect
    except Exception:
        pass  # Connection error
    finally:
        manager.disconnect(websocket)


@app.get("/api/history")
async def get_history(page: int = 1, limit: int = 5):
    """Get paginated history"""
    # Calculate pagination
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
    """Clear history"""
    global history
    history.clear()
    save_history(history)
    await manager.broadcast({'type': 'history_update', 'history': history})
    return {"status": "cleared"}


@app.post("/api/test", response_model=TestResponse)
async def test_endpoint(request: TestRequest):
    print(f"📡 Test - {request.fingerprint[:16] if request.fingerprint else 'Unknown'}...")
    
    # Add to history
    event = add_history_event(
        "test", 
        "🧪 Test endpoint called", 
        {
            "data": "test ok",
            "fingerprint": request.fingerprint[:16] if request.fingerprint else "Unknown"
        }
    )
    
    # Broadcast history update
    await manager.broadcast({"type": "history_update", "history": history})
    
    return {"data": "test ok"}


@app.get("/api/vapid-public-key")
async def get_vapid_public_key():
    """Return the VAPID public key for push subscription"""
    public_key = os.getenv("VAPID_PUBLIC_KEY")
    if not public_key:
        raise HTTPException(status_code=500, detail="VAPID public key not configured")
    return {"publicKey": public_key}


@app.get("/api/version")
async def get_version():
    """Return app version"""
    return {"version": APP_VERSION}


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


@app.post("/api/subscribe")
async def subscribe(subscription: PushSubscription):
    """Store push subscription"""
    # Remove old subscription from same device (based on fingerprint)
    subscriptions[:] = [
        sub for sub in subscriptions 
        if sub.get("device_fingerprint") != subscription.device_fingerprint
    ]
    
    # Add new subscription
    subscriptions.append(subscription.model_dump())
    save_subscriptions(subscriptions)
    print(f"✅ New subscription from device: {subscription.device_fingerprint[:16]}...")
    print(f"📊 Total subscriptions: {len(subscriptions)}")
    
    # Add to history and broadcast
    add_history_event(
        event_type="subscription",
        message=f"📱 Dispositivo suscrito",
        details={
            "device": subscription.device_fingerprint[:16],
            "total": len(subscriptions)
        }
    )
    await manager.broadcast({"type": "history_update", "history": history})
    
    return {"status": "subscribed", "total": len(subscriptions)}


@app.post("/api/unsubscribe")
async def unsubscribe(subscription: PushSubscription):
    """Remove push subscription"""
    global subscriptions
    initial_count = len(subscriptions)
    subscriptions = [
        s for s in subscriptions 
        if s.get("device_fingerprint") != subscription.device_fingerprint
    ]
    removed = initial_count - len(subscriptions)
    save_subscriptions(subscriptions)
    print(f"🗑️ Unsubscribed device: {subscription.device_fingerprint[:16]}...")
    
    # Add to history and broadcast
    add_history_event(
        event_type="subscription",
        message=f"📴 Dispositivo desuscrito",
        details={
            "device": subscription.device_fingerprint[:16],
            "total": len(subscriptions)
        }
    )
    await manager.broadcast({"type": "history_update", "history": history})
    
    return {"status": "unsubscribed", "removed": removed, "total": len(subscriptions)}


@app.get("/api/check-subscription/{fingerprint}")
async def check_subscription(fingerprint: str):
    """Check if a device is subscribed"""
    is_subscribed = any(
        sub.get("device_fingerprint") == fingerprint 
        for sub in subscriptions
    )
    return {"is_subscribed": is_subscribed}


@app.post("/api/clear-subscriptions")
async def clear_subscriptions():
    """Clear all subscriptions"""
    global subscriptions
    count = len(subscriptions)
    subscriptions.clear()
    save_subscriptions(subscriptions)
    print(f"🗑️ Cleared all subscriptions ({count} removed)")
    
    # Add to history and broadcast
    add_history_event(
        event_type="subscription",
        message=f"🗑️ Todas las suscripciones eliminadas",
        details={
            "removed": count,
            "total": 0
        }
    )
    await manager.broadcast({"type": "history_update", "history": history})
    
    return {"status": "cleared", "removed": count}


@app.post("/api/send-notification")
async def send_notification(payload: NotificationPayload):
    """Send push notification to all subscribers"""
    print("=" * 50)
    print("📬 Send notification endpoint called")
    print(f"📊 Total subscriptions: {len(subscriptions)}")
    
    if not subscriptions:
        print("⚠️ No subscribers found")
        return {"status": "no_subscribers", "sent": 0}
    
    # Get VAPID keys from environment (as strings from npx web-push)
    vapid_private_key = os.getenv("VAPID_PRIVATE_KEY")
    vapid_public_key = os.getenv("VAPID_PUBLIC_KEY")
    vapid_email = os.getenv("VAPID_CLAIM_EMAIL", "mailto:test@example.com")
    
    print(f"🔑 VAPID keys configured: {bool(vapid_private_key and vapid_public_key)}")
    
    if not vapid_private_key or not vapid_public_key:
        raise HTTPException(status_code=500, detail="VAPID keys not configured")
    
    # Generate unique tag with timestamp to avoid duplicates across devices
    import time
    notification_tag = f"pwa-poc-{int(time.time())}"
    
    notification_data = {
        "title": payload.title,
        "body": payload.body,
        "icon": payload.icon,
        "badge": "/static/icon-192.png",
        "tag": notification_tag,
        "timestamp": int(time.time() * 1000)
    }
    
    print(f"📦 Notification data: {notification_data}")
    
    sent_count = 0
    failed_count = 0
    
    for idx, subscription in enumerate(subscriptions[:]):  # Copy list to safely modify during iteration
        try:
            print(f"📤 Sending to subscription {idx + 1}/{len(subscriptions)}: {subscription.get('device_fingerprint', 'unknown')[:16]}...")
            webpush(
                subscription_info=subscription,
                data=json.dumps(notification_data),
                vapid_private_key=vapid_private_key,
                vapid_claims={"sub": vapid_email}
            )
            sent_count += 1
            print(f"✅ Sent successfully to subscription {idx + 1}")
        except WebPushException as e:
            print(f"❌ WebPushException for subscription {idx + 1}: {e}")
            print(f"   Status code: {e.response.status_code if e.response else 'N/A'}")
            print(f"   Response text: {e.response.text if e.response else 'N/A'}")
            failed_count += 1
            # Remove invalid subscription
            if e.response and e.response.status_code in [404, 410]:
                subscriptions.remove(subscription)
                save_subscriptions(subscriptions)
                print(f"🗑️ Removed invalid subscription")
        except Exception as e:
            print(f"❌ Error sending notification to subscription {idx + 1}: {e}")
            failed_count += 1
    
    print(f"📊 Results: Sent={sent_count}, Failed={failed_count}")
    print("=" * 50)
    
    # Add to history and broadcast
    add_history_event(
        event_type="notification",
        message=f"🔔 Notificación enviada: {payload.title}",
        details={
            "title": payload.title,
            "body": payload.body,
            "sent": sent_count,
            "failed": failed_count,
            "tag": notification_tag
        }
    )
    await manager.broadcast({"type": "history_update", "history": history})
    
    return {
        "status": "sent",
        "sent": sent_count,
        "failed": failed_count,
        "total_subscribers": len(subscriptions),
        "tag": notification_tag
    }


@app.get("/manifest.json")
async def manifest():
    return FileResponse("static/manifest.json")


@app.get("/sw.js")
async def service_worker():
    return FileResponse("static/sw.js", media_type="application/javascript")


# Background thread for periodic notifications
def send_inactivity_notifications():
    """Send periodic notifications every 10 minutes"""
    # Load env variables in thread context
    from dotenv import load_dotenv
    load_dotenv()
    
    # Wait 30 seconds before first notification (give time for subscriptions)
    time.sleep(30)
    
    while True:
        try:
            print("=" * 50)
            print("⏰ Sending periodic backend notifications...")
            print(f"🕐 Time: {datetime.now().strftime('%H:%M:%S')}")
            
            subscriptions = load_subscriptions()
            
            if not subscriptions:
                print("⚠️ No subscribers for periodic notifications")
                time.sleep(10 * 60)  # Wait 10 minutes before checking again
                continue
            
            vapid_private_key = os.getenv("VAPID_PRIVATE_KEY")
            vapid_email = os.getenv("VAPID_EMAIL") or "mailto:admin@example.com"
            
            if not vapid_private_key:
                print("❌ VAPID_PRIVATE_KEY not configured")
                continue
            
            notification_data = {
                "title": "⏰ Notificación Periódica del Backend",
                "body": f"Notificación automática enviada a las {datetime.now().strftime('%H:%M:%S')}",
                "icon": "/static/icon-192.png",
                "badge": "/static/icon-192.png",
                "tag": f"backend-periodic-{int(time.time())}",
                "timestamp": int(time.time() * 1000)
            }
            
            print(f"📦 Notification data: {notification_data}")
            
            sent_count = 0
            failed_count = 0
            
            for idx, subscription in enumerate(subscriptions):
                try:
                    print(f"📤 Sending to subscription {idx + 1}/{len(subscriptions)}...")
                    webpush(
                        subscription_info=subscription,
                        data=json.dumps(notification_data),
                        vapid_private_key=vapid_private_key,
                        vapid_claims={"sub": vapid_email}
                    )
                    sent_count += 1
                    print(f"✅ Sent successfully to subscription {idx + 1}")
                except WebPushException as e:
                    print(f"❌ WebPushException for subscription {idx + 1}: {e}")
                    failed_count += 1
                except Exception as e:
                    print(f"❌ Error sending notification to subscription {idx + 1}: {e}")
                    failed_count += 1
            
            print(f"📊 Periodic notification results: Sent={sent_count}, Failed={failed_count}")
            print("=" * 50)
            
            # Add to history
            add_history_event(
                "periodic_notification",
                "⏰ Notificación periódica del backend",
                {
                    "time": datetime.now().strftime('%H:%M:%S'),
                    "sent": sent_count,
                    "failed": failed_count
                }
            )
            
        except Exception as e:
            print(f"❌ Error in periodic notification thread: {e}")
        
        # Wait 10 minutes before next notification
        time.sleep(10 * 60)


if __name__ == "__main__":
    import uvicorn
    
    # Suprimir el error de ConnectionResetError en Windows
    logging.getLogger("asyncio").setLevel(logging.CRITICAL)
    
    # Clear background activity log on startup
    if BACKGROUND_ACTIVITY_FILE.exists():
        BACKGROUND_ACTIVITY_FILE.unlink()
        print("🗑️ Cleared background activity log from previous session")
    
    # Start background thread for inactivity notifications
    print("🧵 Starting periodic notification thread...")
    inactivity_thread = threading.Thread(target=send_inactivity_notifications, daemon=True)
    inactivity_thread.start()
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
