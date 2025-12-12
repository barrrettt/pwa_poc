"""Firebase Cloud Messaging handler"""
from fastapi import APIRouter
from pydantic import BaseModel
from pathlib import Path
import json
import firebase_admin
from firebase_admin import credentials, messaging

router = APIRouter()

# Data file
FCM_TOKENS_FILE = Path("data/fcm_tokens.json")


class FCMSubscription(BaseModel):
    token: str
    device_fingerprint: str


class FCMNotificationPayload(BaseModel):
    title: str
    body: str
    icon: str = "/static/icon-192.png"


def init_firebase():
    """Initialize Firebase Admin SDK"""
    try:
        cred = credentials.Certificate("secrets/barret-firebase-service-account.json")
        firebase_admin.initialize_app(cred)
        print("✅ Firebase Admin SDK initialized")
        return True
    except Exception as e:
        print(f"⚠️ Firebase Admin SDK initialization failed: {e}")
        return False


def load_fcm_tokens():
    """Load FCM tokens from JSON file"""
    if FCM_TOKENS_FILE.exists():
        try:
            with open(FCM_TOKENS_FILE, "r") as f:
                content = f.read().strip()
                if content:
                    return json.loads(content)
        except (json.JSONDecodeError, Exception) as e:
            print(f"⚠️ Error loading FCM tokens: {e}. Starting with empty list.")
    return []


def save_fcm_tokens(tokens):
    """Save FCM tokens to JSON file"""
    FCM_TOKENS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(FCM_TOKENS_FILE, "w") as f:
        json.dump(tokens, f, indent=2)


# Load tokens on module import
fcm_tokens = load_fcm_tokens()


@router.post("/api/fcm/subscribe")
async def fcm_subscribe(subscription: FCMSubscription, add_history_callback=None, broadcast_callback=None):
    """Store FCM token"""
    global fcm_tokens
    
    # Remove old token from same device
    fcm_tokens = [
        token for token in fcm_tokens
        if token.get("device_fingerprint") != subscription.device_fingerprint
    ]
    
    # Add new token
    fcm_tokens.append(subscription.model_dump())
    save_fcm_tokens(fcm_tokens)
    print(f"✅ New FCM token from device: {subscription.device_fingerprint[:16]}...")
    print(f"📊 Total FCM tokens: {len(fcm_tokens)}")
    
    # Add to history if callback provided
    if add_history_callback and broadcast_callback:
        add_history_callback(
            event_type="fcm_subscription",
            message="🔥 Dispositivo suscrito a FCM",
            details={
                "device": subscription.device_fingerprint[:16],
                "total": len(fcm_tokens)
            }
        )
        await broadcast_callback()
    
    return {"status": "subscribed", "total": len(fcm_tokens)}


@router.post("/api/fcm/unsubscribe")
async def fcm_unsubscribe(subscription: FCMSubscription, add_history_callback=None, broadcast_callback=None):
    """Remove FCM token"""
    global fcm_tokens
    initial_count = len(fcm_tokens)
    fcm_tokens = [
        token for token in fcm_tokens
        if token.get("device_fingerprint") != subscription.device_fingerprint
    ]
    removed = initial_count - len(fcm_tokens)
    save_fcm_tokens(fcm_tokens)
    print(f"🗑️ Removed FCM token from device: {subscription.device_fingerprint[:16]}...")
    print(f"📊 Total FCM tokens: {len(fcm_tokens)}")
    
    # Add to history if callback provided
    if add_history_callback and broadcast_callback:
        add_history_callback(
            event_type="fcm_subscription",
            message="🔥 Dispositivo desuscrito de FCM",
            details={
                "device": subscription.device_fingerprint[:16],
                "total": len(fcm_tokens)
            }
        )
        await broadcast_callback()
    
    return {"status": "unsubscribed", "removed": removed, "total": len(fcm_tokens)}


@router.get("/api/fcm/check-subscription/{fingerprint}")
async def fcm_check_subscription(fingerprint: str):
    """Check if a device is subscribed to FCM"""
    is_subscribed = any(
        token.get("device_fingerprint") == fingerprint 
        for token in fcm_tokens
    )
    return {"is_subscribed": is_subscribed}


@router.post("/api/fcm/clear-subscriptions")
async def fcm_clear_subscriptions(add_history_callback=None, broadcast_callback=None):
    """Clear all FCM subscriptions"""
    global fcm_tokens
    count = len(fcm_tokens)
    fcm_tokens.clear()
    save_fcm_tokens(fcm_tokens)
    print(f"🗑️ Cleared all FCM subscriptions ({count} removed)")
    
    # Add to history if callback provided
    if add_history_callback and broadcast_callback:
        add_history_callback(
            event_type="fcm_subscription",
            message="🗑️ Todas las suscripciones FCM eliminadas",
            details={
                "removed": count,
                "total": 0
            }
        )
        await broadcast_callback()
    
    return {"status": "cleared", "removed": count}


@router.post("/api/fcm/send")
async def fcm_send_notification(payload: FCMNotificationPayload, add_history_callback=None, broadcast_callback=None):
    """Send FCM notification to all subscribed devices"""
    print("=" * 50)
    print("🔥 FCM: Send notification endpoint called")
    print(f"📊 Total FCM tokens: {len(fcm_tokens)}")
    
    if not fcm_tokens:
        print("⚠️ No FCM subscribers found")
        return {"status": "no_subscribers", "sent": 0}
    
    sent_count = 0
    failed_count = 0
    
    for idx, token_data in enumerate(fcm_tokens[:]):
        try:
            token = token_data.get("token")
            if not token:
                continue
            
            print(f"📤 Sending FCM to device {idx + 1}/{len(fcm_tokens)}: {token_data.get('device_fingerprint', 'unknown')[:16]}...")
            
            # Send only data payload to trigger onBackgroundMessage in SW
            # If we use notification field, browser shows it automatically and SW handler doesn't fire
            message = messaging.Message(
                data={
                    "title": payload.title,
                    "body": payload.body,
                    "icon": payload.icon or "/static/icon-192.png",
                    "badge": "/static/icon-192.png"
                },
                token=token,
                webpush=messaging.WebpushConfig(
                    headers={
                        "Urgency": "high"
                    }
                )
            )
            
            response = messaging.send(message)
            print(f"✅ FCM sent successfully: {response}")
            sent_count += 1
            
        except messaging.UnregisteredError:
            print(f"❌ Token is invalid or unregistered, removing...")
            fcm_tokens.remove(token_data)
            save_fcm_tokens(fcm_tokens)
            failed_count += 1
        except Exception as e:
            print(f"❌ Error sending FCM to device {idx + 1}: {e}")
            failed_count += 1
    
    print(f"📊 FCM Results: Sent={sent_count}, Failed={failed_count}")
    print("=" * 50)
    
    # Add to history if callback provided
    if add_history_callback and broadcast_callback:
        add_history_callback(
            event_type="fcm_notification",
            message=f"🔥 FCM enviada: {payload.title}",
            details={
                "title": payload.title,
                "body": payload.body,
                "sent": sent_count,
                "failed": failed_count
            }
        )
        await broadcast_callback()
    
    return {
        "status": "sent",
        "sent": sent_count,
        "failed": failed_count,
        "total_subscribers": len(fcm_tokens)
    }
