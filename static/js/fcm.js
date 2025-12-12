// Firebase Cloud Messaging Module
let swRegistration = null;
let isSubscribedFCM = false;
let currentFCMToken = null;
let deviceFingerprint = '';
let subscribeFCMButton = null;

export function initFCM(swReg, fingerprint, buttonElement) {
    swRegistration = swReg;
    deviceFingerprint = fingerprint;
    subscribeFCMButton = buttonElement;
    
    checkFCMSubscriptionStatus();
}

async function checkFCMSubscriptionStatus() {
    try {
        const response = await fetch(`/api/fcm/check-subscription/${deviceFingerprint}`);
        const data = await response.json();
        isSubscribedFCM = data.is_subscribed;
        updateSubscribeFCMButton();
    } catch (error) {
        console.error('Error checking FCM subscription:', error);
    }
}

function updateSubscribeFCMButton() {
    if (!subscribeFCMButton) return;
    
    if (isSubscribedFCM) {
        subscribeFCMButton.textContent = '🔕 Cancelar';
        subscribeFCMButton.style.background = 'linear-gradient(135deg, #f44336 0%, #ee1d1dff 100%)';
    } else {
        subscribeFCMButton.textContent = '🔔 Suscribirse';
        subscribeFCMButton.style.background = 'linear-gradient(135deg, #4CAF50 0%, #28e432ff 100%)';
    }
}

async function subscribeToFCM() {
    console.log('🔥 Subscribing to Firebase FCM...');
    
    if (!window.firebaseMessaging) {
        alert('❌ Firebase no está inicializado todavía. Espera un momento.');
        return;
    }
    
    try {
        subscribeFCMButton.disabled = true;
        subscribeFCMButton.textContent = '⏳ Suscribiendo...';
        
        const permission = await Notification.requestPermission();
        
        if (permission !== 'granted') {
            alert('❌ Necesitas aceptar las notificaciones');
            subscribeFCMButton.disabled = false;
            updateSubscribeFCMButton();
            return;
        }
        
        const token = await window.getFirebaseToken(window.firebaseMessaging, {
            vapidKey: window.firebaseVapidKey,
            serviceWorkerRegistration: swRegistration
        });
        
        if (token) {
            console.log('✅ FCM Token:', token);
            currentFCMToken = token;
            
            const response = await fetch('/api/fcm/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token: token,
                    device_fingerprint: deviceFingerprint
                })
            });
            
            const result = await response.json();
            console.log('✅ FCM subscription registered:', result);
            
            window.onFirebaseMessage(window.firebaseMessaging, (payload) => {
                console.log('📬 Foreground FCM message received:', payload);
            });
            
            isSubscribedFCM = true;
            updateSubscribeFCMButton();
            
        } else {
            console.error('❌ No registration token available');
            alert('❌ No se pudo obtener el token FCM');
        }
        
    } catch (error) {
        console.error('❌ FCM subscription error:', error);
        alert('❌ Error al suscribirse: ' + error.message);
    } finally {
        subscribeFCMButton.disabled = false;
        if (!isSubscribedFCM) {
            updateSubscribeFCMButton();
        }
    }
}

async function unsubscribeFromFCM() {
    console.log('🔥 Unsubscribing from Firebase FCM...');
    
    try {
        subscribeFCMButton.disabled = true;
        subscribeFCMButton.textContent = '⏳ Desuscribiendo...';
        
        const response = await fetch('/api/fcm/unsubscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                token: currentFCMToken || '',
                device_fingerprint: deviceFingerprint
            })
        });
        
        const result = await response.json();
        console.log('✅ FCM unsubscription:', result);
        
        currentFCMToken = null;
        isSubscribedFCM = false;
        updateSubscribeFCMButton();
        
    } catch (error) {
        console.error('❌ FCM unsubscription error:', error);
        alert('❌ Error al desuscribirse: ' + error.message);
    } finally {
        subscribeFCMButton.disabled = false;
    }
}

export function toggleFCMSubscription() {
    if (isSubscribedFCM) {
        unsubscribeFromFCM();
    } else {
        subscribeToFCM();
    }
}

export async function clearFCMSubscriptions() {
    try {
        const response = await fetch('/api/fcm/clear-subscriptions', {
            method: 'POST'
        });
        
        const result = await response.json();
        console.log('✅ FCM subscriptions cleared:', result);
        
        isSubscribedFCM = false;
        currentFCMToken = null;
        updateSubscribeFCMButton();
        
        return result;
    } catch (error) {
        console.error('❌ Error clearing FCM subscriptions:', error);
        throw error;
    }
}

export async function sendFCMNotification() {
    try {
        const response = await fetch('/api/fcm/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: '🔥 Firebase FCM Test',
                body: `FCM notification sent at ${new Date().toLocaleTimeString()}`,
                icon: '/static/icon-192.png'
            })
        });
        
        const result = await response.json();
        console.log('✅ FCM notification sent:', result);
        return result;
    } catch (error) {
        console.error('❌ FCM send error:', error);
        throw error;
    }
}
