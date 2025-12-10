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
        print(f"📡 WebSocket connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print(f"📡 WebSocket disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        print(f"📤 Broadcasting to {len(self.active_connections)} connections: {message.get('type', 'unknown')}")
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"❌ Error broadcasting to websocket: {e}")
                disconnected.append(connection)
        
        # Remove disconnected connections
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)
        
        if disconnected:
            print(f"🧹 Cleaned {len(disconnected)} dead connections. Remaining: {len(self.active_connections)}")

manager = ConnectionManager()

app = FastAPI()

# Servir archivos estáticos
app.mount("/static", StaticFiles(directory="static"), name="static")

# Data files
SUBSCRIPTIONS_FILE = Path("data/subscriptions.json")
HISTORY_FILE = Path("data/history.json")

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
    # Keep only last 50 events
    if len(history) > 50:
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
    
    print(f"🔌 New WebSocket connection attempt from {websocket.client}")
    await manager.connect(websocket)
    print(f"✅ WebSocket connected. Total connections: {len(manager.active_connections)}")
    
    # Send current history to the new client
    try:
        await websocket.send_json({'type': 'history_update', 'history': history})
        print(f"📤 Sent current history to new client ({len(history)} events)")
    except Exception as e:
        print(f"❌ Error sending initial history: {e}")
    
    try:
        while True:
            # Receive messages from client
            data = await websocket.receive_text()
            message = json.loads(data)
            print(f"📨 Received message: {message}")
            
            # Process message and broadcast to all clients
            if message.get('type') == 'clear_history':
                history.clear()
                save_history(history)
                await manager.broadcast({'type': 'history_update', 'history': history})
                print("🗑️ History cleared and broadcast to all clients")
            
    except WebSocketDisconnect:
        print(f"🔌 WebSocket disconnect event")
    except Exception as e:
        print(f"❌ WebSocket error: {e}")
    finally:
        manager.disconnect(websocket)
        print(f"🧹 Cleanup complete. Remaining connections: {len(manager.active_connections)}")


@app.get("/api/history")
async def get_history():
    """Get current history"""
    return {"history": history}


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
    print("=" * 50)
    print("📡 Test endpoint called")
    print(f"👤 Fingerprint: {request.fingerprint[:16] if request.fingerprint else 'Unknown'}...")
    print(f"📊 Current history length: {len(history)}")
    print(f"🔌 Active WebSocket connections: {len(manager.active_connections)}")
    
    # Add to history
    event = add_history_event(
        "test", 
        "🧪 Test endpoint called", 
        {
            "data": "test ok",
            "fingerprint": request.fingerprint[:16] if request.fingerprint else "Unknown"
        }
    )
    print(f"✅ Event added: {event}")
    print(f"📊 New history length: {len(history)}")
    
    # Broadcast history update
    await manager.broadcast({"type": "history_update", "history": history})
    print("📤 Broadcast sent to all connections")
    print("=" * 50)
    
    return {"data": "test ok"}


@app.get("/api/vapid-public-key")
async def get_vapid_public_key():
    """Return the VAPID public key for push subscription"""
    public_key = os.getenv("VAPID_PUBLIC_KEY")
    if not public_key:
        raise HTTPException(status_code=500, detail="VAPID public key not configured")
    return {"publicKey": public_key}


@app.post("/api/subscribe")
async def subscribe(subscription: PushSubscription):
    """Store push subscription"""
    # Remove old subscription from same device (based on fingerprint)
    subscriptions[:] = [
        sub for sub in subscriptions 
        if sub.get("device_fingerprint") != subscription.device_fingerprint
    ]
    
    # Add new subscription
    subscriptions.append(subscription.dict())
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
    return {"subscribed": is_subscribed}


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


if __name__ == "__main__":
    import uvicorn
    
    # Suprimir el error de ConnectionResetError en Windows
    logging.getLogger("asyncio").setLevel(logging.CRITICAL)
    
    print("🚀 Server starting...")
    print("📱 Local: http://localhost:8000")
    print("🌐 For mobile: Use ngrok (see README.md)")
    print("   Run: ngrok http 8000")
    print("⚠️  Close terminal to stop server")
    
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        log_level="info"
    )
