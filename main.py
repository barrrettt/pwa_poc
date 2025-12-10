from fastapi import FastAPI, HTTPException
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

# Load environment variables
load_dotenv()

app = FastAPI()

# Servir archivos estáticos
app.mount("/static", StaticFiles(directory="static"), name="static")

# Subscriptions file
SUBSCRIPTIONS_FILE = Path("subscriptions.json")

def load_subscriptions():
    """Load subscriptions from JSON file"""
    if SUBSCRIPTIONS_FILE.exists():
        with open(SUBSCRIPTIONS_FILE, "r") as f:
            return json.load(f)
    return []

def save_subscriptions(subscriptions):
    """Save subscriptions to JSON file"""
    with open(SUBSCRIPTIONS_FILE, "w") as f:
        json.dump(subscriptions, f, indent=2)

# Load subscriptions on startup
subscriptions = load_subscriptions()


class TestResponse(BaseModel):
    data: str


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict


class NotificationPayload(BaseModel):
    title: str
    body: str
    icon: str = "/static/icon-192.png"


@app.get("/", response_class=HTMLResponse)
async def root():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        return f.read()


@app.get("/api/test", response_model=TestResponse)
async def test_endpoint():
    print("📡 Test endpoint called")
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
    # Check if already subscribed
    for sub in subscriptions:
        if sub["endpoint"] == subscription.endpoint:
            return {"status": "already_subscribed"}
    
    subscriptions.append(subscription.model_dump())
    save_subscriptions(subscriptions)
    print(f"New subscription added. Total subscriptions: {len(subscriptions)}")
    return {"status": "subscribed", "total": len(subscriptions)}


@app.post("/api/unsubscribe")
async def unsubscribe(subscription: PushSubscription):
    """Remove push subscription"""
    global subscriptions
    initial_count = len(subscriptions)
    subscriptions = [s for s in subscriptions if s["endpoint"] != subscription.endpoint]
    removed = initial_count - len(subscriptions)
    save_subscriptions(subscriptions)
    
    return {"status": "unsubscribed", "removed": removed, "total": len(subscriptions)}


@app.post("/api/send-notification")
async def send_notification(payload: NotificationPayload):
    """Send push notification to all subscribers"""
    if not subscriptions:
        return {"status": "no_subscribers", "sent": 0}
    
    # Get VAPID keys from environment (as strings from npx web-push)
    vapid_private_key = os.getenv("VAPID_PRIVATE_KEY")
    vapid_public_key = os.getenv("VAPID_PUBLIC_KEY")
    vapid_email = os.getenv("VAPID_CLAIM_EMAIL", "mailto:test@example.com")
    
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
    
    sent_count = 0
    failed_count = 0
    
    for subscription in subscriptions[:]:  # Copy list to safely modify during iteration
        try:
            webpush(
                subscription_info=subscription,
                data=json.dumps(notification_data),
                vapid_private_key=vapid_private_key,
                vapid_claims={"sub": vapid_email}
            )
            sent_count += 1
        except WebPushException as e:
            print(f"Failed to send notification: {e}")
            failed_count += 1
            # Remove invalid subscription
            if e.response and e.response.status_code in [404, 410]:
                subscriptions.remove(subscription)
                save_subscriptions(subscriptions)
        except Exception as e:
            print(f"Error sending notification: {e}")
            failed_count += 1
    
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
