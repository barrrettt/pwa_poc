"""WebPush (VAPID) notification handler"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pywebpush import webpush, WebPushException
from pathlib import Path
import json
import os
import time
from datetime import datetime

router = APIRouter()

# Data file
SUBSCRIPTIONS_FILE = Path("data/subscriptions.json")


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict
    device_fingerprint: str


class NotificationPayload(BaseModel):
    title: str
    body: str
    icon: str = "/static/icon-192.png"


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


# Load subscriptions on module import
subscriptions = load_subscriptions()


@router.post("/api/subscribe")
async def subscribe(subscription: PushSubscription, add_history_callback=None, broadcast_callback=None):
    """Store push subscription"""
    global subscriptions
    
    # Remove old subscription from same device
    subscriptions[:] = [
        sub for sub in subscriptions 
        if sub.get("device_fingerprint") != subscription.device_fingerprint
    ]
    
    # Add new subscription
    subscriptions.append(subscription.model_dump())
    save_subscriptions(subscriptions)
    print(f"✅ New subscription from device: {subscription.device_fingerprint[:16]}...")
    print(f"📊 Total subscriptions: {len(subscriptions)}")
    
    # Add to history if callback provided
    if add_history_callback and broadcast_callback:
        add_history_callback(
            event_type="subscription",
            message="📱 Dispositivo suscrito",
            details={
                "device": subscription.device_fingerprint[:16],
                "total": len(subscriptions)
            }
        )
        await broadcast_callback()
    
    return {"status": "subscribed", "total": len(subscriptions)}


@router.post("/api/unsubscribe")
async def unsubscribe(subscription: PushSubscription, add_history_callback=None, broadcast_callback=None):
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
    
    # Add to history if callback provided
    if add_history_callback and broadcast_callback:
        add_history_callback(
            event_type="subscription",
            message="📴 Dispositivo desuscrito",
            details={
                "device": subscription.device_fingerprint[:16],
                "total": len(subscriptions)
            }
        )
        await broadcast_callback()
    
    return {"status": "unsubscribed", "removed": removed, "total": len(subscriptions)}


@router.get("/api/check-subscription/{fingerprint}")
async def check_subscription(fingerprint: str):
    """Check if a device is subscribed"""
    is_subscribed = any(
        sub.get("device_fingerprint") == fingerprint 
        for sub in subscriptions
    )
    return {"is_subscribed": is_subscribed}


@router.post("/api/clear-subscriptions")
async def clear_subscriptions(add_history_callback=None, broadcast_callback=None):
    """Clear all subscriptions"""
    global subscriptions
    count = len(subscriptions)
    subscriptions.clear()
    save_subscriptions(subscriptions)
    print(f"🗑️ Cleared all subscriptions ({count} removed)")
    
    # Add to history if callback provided
    if add_history_callback and broadcast_callback:
        add_history_callback(
            event_type="subscription",
            message="🗑️ Todas las suscripciones eliminadas",
            details={
                "removed": count,
                "total": 0
            }
        )
        await broadcast_callback()
    
    return {"status": "cleared", "removed": count}


@router.post("/api/send-notification")
async def send_notification(payload: NotificationPayload, add_history_callback=None, broadcast_callback=None):
    """Send push notification to all subscribers"""
    print("=" * 50)
    print("📬 Send notification endpoint called")
    print(f"📊 Total subscriptions: {len(subscriptions)}")
    
    if not subscriptions:
        print("⚠️ No subscribers found")
        return {"status": "no_subscribers", "sent": 0}
    
    # Get VAPID keys from environment
    vapid_private_key = os.getenv("VAPID_PRIVATE_KEY")
    vapid_public_key = os.getenv("VAPID_PUBLIC_KEY")
    vapid_email = os.getenv("VAPID_CLAIM_EMAIL", "mailto:test@example.com")
    
    print(f"🔑 VAPID keys configured: {bool(vapid_private_key and vapid_public_key)}")
    
    if not vapid_private_key or not vapid_public_key:
        raise HTTPException(status_code=500, detail="VAPID keys not configured")
    
    # Generate unique tag
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
    
    for idx, subscription in enumerate(subscriptions[:]):
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
    
    # Add to history if callback provided
    if add_history_callback and broadcast_callback:
        add_history_callback(
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
        await broadcast_callback()
    
    return {
        "status": "sent",
        "sent": sent_count,
        "failed": failed_count,
        "total_subscribers": len(subscriptions),
        "tag": notification_tag
    }


def send_periodic_notifications():
    """Send periodic notifications every 10 minutes"""
    from dotenv import load_dotenv
    load_dotenv()
    
    # Wait 30 seconds before first notification
    time.sleep(30)
    
    while True:
        try:
            print("=" * 50)
            print("⏰ Sending periodic backend notifications...")
            print(f"🕐 Time: {datetime.now().strftime('%H:%M:%S')}")
            
            current_subscriptions = load_subscriptions()
            
            if not current_subscriptions:
                print("⚠️ No subscribers for periodic notifications")
                time.sleep(10 * 60)
                continue
            
            vapid_private_key = os.getenv("VAPID_PRIVATE_KEY")
            vapid_email = os.getenv("VAPID_EMAIL") or "mailto:admin@example.com"
            
            if not vapid_private_key:
                print("❌ VAPID_PRIVATE_KEY not configured")
                continue
            
            notification_data = {
                "title": "⏰ WebPush - Notificación Periódica",
                "body": "Mensaje automático enviado desde BACK (backend)",
                "icon": "/static/icon-192.png",
                "badge": "/static/icon-192.png",
                "tag": f"backend-periodic-{int(time.time())}",
                "timestamp": int(time.time() * 1000)
            }
            
            print(f"📦 Notification data: {notification_data}")
            
            sent_count = 0
            failed_count = 0
            
            for idx, subscription in enumerate(current_subscriptions):
                try:
                    print(f"📤 Sending to subscription {idx + 1}/{len(current_subscriptions)}...")
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
            
        except Exception as e:
            print(f"❌ Error in periodic notification thread: {e}")
        
        # Wait 10 minutes before next notification
        time.sleep(10 * 60)
