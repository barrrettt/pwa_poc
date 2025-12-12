// Main App - PWA POC
// Imports from modules
import { connectWebSocket, sendWebSocketMessage } from './websocket.js';
import { generateDeviceFingerprint } from './fingerprint.js';
import { initHistory, renderHistory, setupInfiniteScroll, clearHistory } from './history.js';
import { initWebPush, toggleWebPushSubscription, sendWebPushNotification, clearWebPushSubscriptions } from './webpush.js';
import { initFCM, toggleFCMSubscription, sendFCMNotification, clearFCMSubscriptions } from './fcm.js';
import { initDiagnostics, updateDiagnosticPanel, updateActivityMonitor, registerPeriodicSync, sendHeartbeat } from './diagnostics.js';

// Global state
let swRegistration = null;
let deviceFingerprint = '';

// PWA Install prompt
let deferredPrompt;
const installPrompt = document.getElementById('installPrompt');
const installButton = document.getElementById('installButton');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installPrompt.style.display = 'block';
});

installButton.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response: ${outcome}`);
        deferredPrompt = null;
        installPrompt.style.display = 'none';
    }
});

// Test endpoint
const testButton = document.getElementById('testButton');
testButton.addEventListener('click', async () => {
    try {
        testButton.disabled = true;
        testButton.textContent = '⏳ Probando...';
        
        const response = await fetch('/api/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fingerprint: deviceFingerprint
            })
        });
        const result = await response.json();
        console.log('✅ Test response:', result);
        
    } catch (error) {
        console.error('❌ Test error:', error);
    } finally {
        testButton.disabled = false;
        testButton.textContent = '🧪 Test Endpoint';
    }
});

// Scroll to top button
const scrollToTopBtn = document.getElementById('scrollToTop');
window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
        scrollToTopBtn.classList.add('visible');
    } else {
        scrollToTopBtn.classList.remove('visible');
    }
});

scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// WebPush buttons
const subscribeButton = document.getElementById('subscribeButton');
const sendNotificationButton = document.getElementById('sendNotificationButton');
const clearSubscriptionsButton = document.getElementById('clearSubscriptionsButton');

subscribeButton.addEventListener('click', () => toggleWebPushSubscription());

sendNotificationButton.addEventListener('click', async () => {
    try {
        sendNotificationButton.disabled = true;
        sendNotificationButton.textContent = '📤 Enviando...';
        
        await sendWebPushNotification();
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        sendNotificationButton.disabled = false;
        sendNotificationButton.textContent = '📨 Enviar';
    }
});

clearSubscriptionsButton.addEventListener('click', async () => {
    if (!confirm('¿Estás seguro de que quieres borrar TODAS las suscripciones?')) {
        return;
    }
    
    try {
        clearSubscriptionsButton.disabled = true;
        clearSubscriptionsButton.textContent = '⏳ Borrando...';
        
        await clearWebPushSubscriptions();
        
    } catch (error) {
        console.error('Error clearing subscriptions:', error);
    } finally {
        clearSubscriptionsButton.disabled = false;
        clearSubscriptionsButton.textContent = '🗑️ Borrar Subs';
    }
});

// FCM buttons
const subscribeFCMButton = document.getElementById('subscribeFCMButton');
const clearFCMSubscriptionsButton = document.getElementById('clearFCMSubscriptionsButton');
const sendFCMButton = document.getElementById('sendFCMButton');

subscribeFCMButton.addEventListener('click', () => toggleFCMSubscription());

clearFCMSubscriptionsButton.addEventListener('click', async () => {
    if (!confirm('¿Borrar todas las suscripciones FCM del servidor?')) {
        return;
    }
    
    try {
        clearFCMSubscriptionsButton.disabled = true;
        clearFCMSubscriptionsButton.textContent = '⏳ Borrando...';
        
        await clearFCMSubscriptions();
        
    } catch (error) {
        console.error('❌ Error clearing FCM subscriptions:', error);
        alert('❌ Error al borrar suscripciones: ' + error.message);
    } finally {
        clearFCMSubscriptionsButton.disabled = false;
        clearFCMSubscriptionsButton.textContent = '🗑️ Borrar Subs';
    }
});

sendFCMButton.addEventListener('click', async () => {
    try {
        sendFCMButton.disabled = true;
        sendFCMButton.textContent = '📤 Enviando...';
        
        await sendFCMNotification();
        
    } catch (error) {
        console.error('❌ FCM send error:', error);
        alert('❌ Error al enviar: ' + error.message);
    } finally {
        sendFCMButton.disabled = false;
        sendFCMButton.textContent = '📨 Enviar';
    }
});

// Clear history button
const clearHistoryButton = document.getElementById('clearHistoryButton');
clearHistoryButton.addEventListener('click', () => {
    sendWebSocketMessage({ type: 'clear_history' });
    clearHistory();
});

// Activity monitor refresh button
const activityRefresh = document.getElementById('activityRefresh');
activityRefresh.addEventListener('click', async () => {
    activityRefresh.disabled = true;
    activityRefresh.textContent = '⏳ Consultando...';
    await updateActivityMonitor();
    activityRefresh.disabled = false;
    activityRefresh.textContent = '🔄 Actualizar';
});

// Auto-update activity every 5 seconds
setInterval(updateActivityMonitor, 5000);

// Heartbeat fallback (frontend)
function startFrontendHeartbeat() {
    sendHeartbeat();
    setInterval(sendHeartbeat, 10 * 1000);
}

// Service Worker message listener
navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GET_FINGERPRINT') {
        event.ports[0].postMessage({ fingerprint: deviceFingerprint });
    }
});

// Initialize app
(async function init() {
    console.log('🚀 PWA POC inicializando...');
    
    // Generate device fingerprint FIRST
    deviceFingerprint = await generateDeviceFingerprint();
    
    // Display fingerprint in UI
    const fingerprintValueEl = document.getElementById('fingerprintValue');
    if (fingerprintValueEl) {
        fingerprintValueEl.textContent = deviceFingerprint.substring(0, 16) + '...';
        fingerprintValueEl.title = deviceFingerprint;
    }
    
    // Fetch and display app version
    try {
        const response = await fetch('/api/version');
        const data = await response.json();
        const versionEl = document.getElementById('appVersion');
        if (versionEl) {
            versionEl.textContent = `v${data.version}`;
        }
    } catch (error) {
        console.error('Error fetching version:', error);
    }
    
    // Initialize history module
    const historyList = document.getElementById('historyList');
    initHistory(historyList);
    
    // Connect WebSocket with history callback
    connectWebSocket(renderHistory);
    
    // Setup infinite scroll
    setupInfiniteScroll();
    
    // Register Service Worker AFTER fingerprint is ready
    if ('serviceWorker' in navigator) {
        console.log('✅ Service Worker inicializado');
        
        try {
            const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            swRegistration = registration;
            
            // Initialize modules with SW registration and fingerprint
            initDiagnostics(swRegistration, deviceFingerprint);
            updateDiagnosticPanel();
            
            await navigator.serviceWorker.ready;
            
            // Initialize push modules after SW is ready
            initWebPush(swRegistration, deviceFingerprint, subscribeButton);
            initFCM(swRegistration, deviceFingerprint, subscribeFCMButton);
            
            // Register periodic sync with fallback
            registerPeriodicSync(startFrontendHeartbeat);
            
        } catch (error) {
            console.error('❌ Error registrando Service Worker:', error);
            updateDiagnosticPanel();
        }
    } else {
        console.error('❌ Service Workers no soportado');
    }
    
    // Start activity monitor after everything is ready
    setTimeout(updateActivityMonitor, 2000);
})();
