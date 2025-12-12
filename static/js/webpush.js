// WebPush (VAPID) Module
let swRegistration = null;
let isSubscribed = false;
let deviceFingerprint = '';
let subscribeButton = null;

export function initWebPush(swReg, fingerprint, buttonElement) {
    swRegistration = swReg;
    deviceFingerprint = fingerprint;
    subscribeButton = buttonElement;
    
    checkSubscription();
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function checkSubscription() {
    if (!swRegistration) return;
    
    const subscription = await swRegistration.pushManager.getSubscription();
    const hasLocalSubscription = !(subscription === null);
    
    try {
        const response = await fetch(`/api/check-subscription/${deviceFingerprint}`);
        const data = await response.json();
        const hasServerSubscription = data.is_subscribed;
        
        if (hasLocalSubscription && !hasServerSubscription) {
            isSubscribed = false;
        } else if (!hasLocalSubscription && hasServerSubscription) {
            if (subscription) {
                await fetch('/api/unsubscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subscription: subscription,
                        device_fingerprint: deviceFingerprint
                    })
                });
            }
            isSubscribed = false;
        } else {
            isSubscribed = hasLocalSubscription && hasServerSubscription;
        }
    } catch (error) {
        isSubscribed = hasLocalSubscription;
    }
    
    updateSubscribeButton();
}

function updateSubscribeButton() {
    if (!subscribeButton) return;
    
    if (isSubscribed) {
        subscribeButton.textContent = '🔕 Cancelar';
        subscribeButton.style.background = 'linear-gradient(135deg, #f44336 0%, #e61616ff 100%)';
    } else {
        subscribeButton.textContent = '🔔 Suscribirse';
        subscribeButton.style.background = 'linear-gradient(135deg, #4CAF50 0%, #2ecb36ff 100%)';
    }
}

async function subscribeToPush() {
    console.log('🔔 Suscribirse a notificaciones');
    try {
        if (!('Notification' in window)) {
            alert('⚠️ Tu navegador no soporta notificaciones push.\n\nAsegúrate de:\n1. Usar HTTPS (o localhost)\n2. Tener Chrome 90+\n3. Instalar la app como PWA');
            return;
        }
        
        if (!swRegistration) return;
        
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
        
        // Check if there's an existing subscription and remove it first
        const existingSubscription = await swRegistration.pushManager.getSubscription();
        if (existingSubscription) {
            console.log('⚠️ Existing subscription found, unsubscribing first...');
            await existingSubscription.unsubscribe();
        }
        
        const response = await fetch('/api/vapid-public-key');
        const data = await response.json();
        const applicationServerKey = urlBase64ToUint8Array(data.publicKey);
        
        const subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });
        
        console.log('Device fingerprint:', deviceFingerprint.substring(0, 16) + '...');
        
        const subscriptionWithFingerprint = {
            ...subscription.toJSON(),
            device_fingerprint: deviceFingerprint
        };
        
        const subscribeResponse = await fetch('/api/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(subscriptionWithFingerprint)
        });
        
        await subscribeResponse.json();
        isSubscribed = true;
        updateSubscribeButton();
        
    } catch (error) {
        console.error('Error subscribing to push:', error);
        alert('❌ Error al suscribirse: ' + error.message);
    }
}

async function unsubscribeFromPush() {
    try {
        const subscription = await swRegistration.pushManager.getSubscription();
        
        if (subscription) {
            await subscription.unsubscribe();
            
            const subscriptionWithFingerprint = {
                ...subscription.toJSON(),
                device_fingerprint: deviceFingerprint
            };
            
            await fetch('/api/unsubscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(subscriptionWithFingerprint)
            });
        }
        
        isSubscribed = false;
        updateSubscribeButton();
        
    } catch (error) {
        console.error('Error unsubscribing:', error);
    }
}

export function toggleWebPushSubscription() {
    if (isSubscribed) {
        unsubscribeFromPush();
    } else {
        subscribeToPush();
    }
}

export async function sendWebPushNotification() {
    try {
        const response = await fetch('/api/send-notification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: '📡 WebPush - Prueba Manual',
                body: 'Mensaje de prueba enviado desde PWA (frontend)',
                icon: '/static/icon-192.png'
            })
        });
        
        const result = await response.json();
        console.log('Notification sent:', result);
        return result;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

export async function clearWebPushSubscriptions() {
    try {
        const response = await fetch('/api/clear-subscriptions', {
            method: 'POST'
        });
        
        const result = await response.json();
        console.log('Subscriptions cleared:', result);
        
        if (isSubscribed) {
            isSubscribed = false;
            updateSubscribeButton();
        }
        
        return result;
    } catch (error) {
        console.error('Error clearing subscriptions:', error);
        throw error;
    }
}
