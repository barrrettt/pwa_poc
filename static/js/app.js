// Service Worker Registration (will be initialized at the end)
let swRegistration = null;

// Install prompt
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

// Test endpoint functionality
const testButton = document.getElementById('testButton');
const historyList = document.getElementById('historyList');

testButton.addEventListener('click', async () => {
    try {
        testButton.disabled = true;
        testButton.textContent = '⏳ Probando...';
        
        // Call the API with fingerprint
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

// Scroll to top functionality
const scrollToTopBtn = document.getElementById('scrollToTop');

// Show/hide button based on scroll position
window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
        scrollToTopBtn.classList.add('visible');
    } else {
        scrollToTopBtn.classList.remove('visible');
    }
});

// Scroll to top when clicked
scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// Push Notifications functionality
const subscribeButton = document.getElementById('subscribeButton');
const sendNotificationButton = document.getElementById('sendNotificationButton');
let isSubscribed = false;
let ws = null;
let deviceFingerprint = '';

// Initialize WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('🔌 WebSocket connected - waiting for history from server...');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('📨 WebSocket message:', data);
        
        // Backend sends history_update with full history
        if (data.type === 'history_update') {
            renderHistory(data.history);
        }
    };
    
    ws.onclose = () => {
        console.log('🔌 WebSocket disconnected, reconnecting...');
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
    };
}

// Render history from backend data
function renderHistory(historyData) {
    console.log('🎨 Rendering history. Items:', historyData.length, historyData);
    console.trace('🔍 renderHistory called from:');
    historyList.innerHTML = '';
    
    // Update counter in the title
    const historyTitle = document.querySelector('.history-title');
    if (historyTitle) {
        historyTitle.textContent = `📝 Histórico de Eventos (${historyData ? historyData.length : 0})`;
    }
    
    if (!historyData || historyData.length === 0) {
        historyList.innerHTML = '<li class="empty-message">No hay eventos todavía. ¡Pulsa el botón!</li>';
        return;
    }
    
    // Render in reverse order (newest first)
    historyData.slice().reverse().forEach(event => {
        const historyItem = document.createElement('li');
        historyItem.className = 'history-item';
        
        const date = new Date(event.timestamp * 1000);
        const timestamp = date.toLocaleString('es-ES');
        
        historyItem.innerHTML = `
            <div class="event-name">${event.type}</div>
            <div class="event-details">
                ${event.message}<br>
                ${Object.keys(event.details).length > 0 ? `<strong>Detalles:</strong> ${JSON.stringify(event.details)}<br>` : ''}
                <strong>Timestamp:</strong> ${timestamp}
            </div>
        `;
        
        historyList.appendChild(historyItem);
    });
}

// Listen for messages from Service Worker (for fingerprint requests)
navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GET_FINGERPRINT') {
        // Respond with fingerprint through the message port
        event.ports[0].postMessage({ fingerprint: deviceFingerprint });
    }
});

// Initialize push notifications
if ('serviceWorker' in navigator && 'PushManager' in window) {
    navigator.serviceWorker.ready.then(registration => {
        swRegistration = registration;
        checkSubscription();
    });
}

async function checkSubscription() {
    if (!swRegistration) {
        console.log('Service Worker not registered yet');
        return;
    }
    const subscription = await swRegistration.pushManager.getSubscription();
    isSubscribed = !(subscription === null);
    updateSubscribeButton();
}

function updateSubscribeButton() {
    if (isSubscribed) {
        subscribeButton.textContent = '🔕 Cancelar';
        subscribeButton.style.background = 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)';
    } else {
        subscribeButton.textContent = '🔔 Suscribirse';
        subscribeButton.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
    }
}

// Generate device fingerprint with high uniqueness
async function generateDeviceFingerprint() {
    // Check if we have a stored fingerprint in localStorage
    let storedFingerprint = localStorage.getItem('device_fingerprint');
    if (storedFingerprint) {
        console.log('Using stored fingerprint:', storedFingerprint.substring(0, 16) + '...');
        return storedFingerprint;
    }
    
    // Collect comprehensive device characteristics
    const characteristics = [];
    
    // Basic browser info
    characteristics.push(navigator.userAgent);
    characteristics.push(navigator.language);
    characteristics.push(navigator.languages ? navigator.languages.join(',') : '');
    characteristics.push(navigator.platform);
    characteristics.push(navigator.hardwareConcurrency || 'unknown');
    characteristics.push(navigator.deviceMemory || 'unknown');
    
    // Screen info
    characteristics.push(screen.width + 'x' + screen.height);
    characteristics.push(screen.availWidth + 'x' + screen.availHeight);
    characteristics.push(screen.colorDepth);
    characteristics.push(screen.pixelDepth);
    characteristics.push(window.devicePixelRatio || 1);
    
    // Timezone
    characteristics.push(new Date().getTimezoneOffset());
    characteristics.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
    
    // Location info
    characteristics.push(window.location.origin);
    characteristics.push(window.location.protocol);
    
    // Display mode
    characteristics.push(window.matchMedia('(display-mode: standalone)').matches ? 'pwa' : 'browser');
    
    // Canvas fingerprint (more unique)
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(0, 0, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('PWA POC 🔒', 2, 2);
        characteristics.push(canvas.toDataURL());
    } catch (e) {
        characteristics.push('canvas-blocked');
    }
    
    // WebGL fingerprint
    try {
        const gl = document.createElement('canvas').getContext('webgl');
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        characteristics.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
        characteristics.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
    } catch (e) {
        characteristics.push('webgl-blocked');
    }
    
    // Add random component if first time (to ensure absolute uniqueness)
    const randomSeed = crypto.getRandomValues(new Uint8Array(16));
    characteristics.push(Array.from(randomSeed).map(b => b.toString(16).padStart(2, '0')).join(''));
    
    // Generate hash
    const data = characteristics.join('|');
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fingerprint = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Store in localStorage for consistency
    localStorage.setItem('device_fingerprint', fingerprint);
    console.log('Generated new fingerprint:', fingerprint.substring(0, 16) + '...');
    
    return fingerprint;
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

async function subscribeToPush() {
    try {
        // Check if notifications are supported
        if (!('Notification' in window)) {
            console.error('❌ ERROR: Este navegador no soporta notificaciones');
            alert('⚠️ Tu navegador no soporta notificaciones push.\n\nAsegúrate de:\n1. Usar HTTPS (o localhost)\n2. Tener Chrome 90+\n3. Instalar la app como PWA');
            return;
        }
        
        console.log('🔔 Notification API disponible');
        console.log('📊 Notification.permission:', Notification.permission);
        console.log('🌐 window.isSecureContext:', window.isSecureContext);
        console.log('📱 Display mode:', window.matchMedia('(display-mode: standalone)').matches ? 'PWA' : 'Browser');
        
        if (!swRegistration) {
            console.error('❌ ERROR: Service Worker no está registrado');
            return;
        }
        
        // Request notification permission
        const permission = await Notification.requestPermission();
        console.log('✅ Permission result:', permission);
        
        if (permission !== 'granted') {
            console.error('ERROR: Permiso de notificaciones denegado');
            return;
        }
        
        // Get VAPID public key
        const response = await fetch('/api/vapid-public-key');
        const data = await response.json();
        const applicationServerKey = urlBase64ToUint8Array(data.publicKey);
        
        // Subscribe
        const subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });
        
        // Use global device fingerprint
        console.log('Device fingerprint:', deviceFingerprint.substring(0, 16) + '...');
        
        // Add fingerprint to subscription
        const subscriptionWithFingerprint = {
            ...subscription.toJSON(),
            device_fingerprint: deviceFingerprint
        };
        
        // Send subscription to server
        const subscribeResponse = await fetch('/api/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(subscriptionWithFingerprint)
        });
        
        const result = await subscribeResponse.json();
        isSubscribed = true;
        updateSubscribeButton();
        
        // Update diagnostic panel
        updateDiagnosticPanel();
        
    } catch (error) {
        console.error('Error subscribing to push:', error);
    }
}

async function unsubscribeFromPush() {
    try {
        const subscription = await swRegistration.pushManager.getSubscription();
        
        if (subscription) {
            await subscription.unsubscribe();
            
            // Use global device fingerprint
            
            // Add fingerprint to subscription
            const subscriptionWithFingerprint = {
                ...subscription.toJSON(),
                device_fingerprint: deviceFingerprint
            };
            
            // Notify server
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

subscribeButton.addEventListener('click', () => {
    if (isSubscribed) {
        unsubscribeFromPush();
    } else {
        subscribeToPush();
    }
});

sendNotificationButton.addEventListener('click', async () => {
    try {
        sendNotificationButton.disabled = true;
        sendNotificationButton.textContent = '📤 Enviando...';
        
        const response = await fetch('/api/send-notification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: 'PWA POC - Prueba',
                body: `Notificación de prueba enviada a las ${new Date().toLocaleTimeString()}`,
                icon: '/static/icon-192.png'
            })
        });
        
        const result = await response.json();
        console.log('Notification sent:', result);
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        sendNotificationButton.disabled = false;
        sendNotificationButton.textContent = '📬 Enviar Notificación de Prueba';
    }
});

// Clear subscriptions functionality
const clearSubscriptionsButton = document.getElementById('clearSubscriptionsButton');

clearSubscriptionsButton.addEventListener('click', async () => {
    if (!confirm('¿Estás seguro de que quieres borrar TODAS las suscripciones?')) {
        return;
    }
    
    try {
        clearSubscriptionsButton.disabled = true;
        clearSubscriptionsButton.textContent = '⏳ Borrando...';
        
        const response = await fetch('/api/clear-subscriptions', {
            method: 'POST'
        });
        
        const result = await response.json();
        console.log('Subscriptions cleared:', result);
        
        // Update subscription state if current device was subscribed
        if (isSubscribed) {
            isSubscribed = false;
            updateSubscribeButton();
        }
        
    } catch (error) {
        console.error('Error clearing subscriptions:', error);
    } finally {
        clearSubscriptionsButton.disabled = false;
        clearSubscriptionsButton.textContent = '🗑️ Borrar Subs';
    }
});

// Clear history functionality
const clearHistoryButton = document.getElementById('clearHistoryButton');

clearHistoryButton.addEventListener('click', () => {
    // Send clear event to server via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'clear_history' }));
    }
});

// Background Activity Monitor
const activityRefresh = document.getElementById('activityRefresh');
const activityTime = document.getElementById('activityTime');
const activityStatus = document.getElementById('activityStatus');

async function updateActivityMonitor() {
    try {
        const response = await fetch(`/api/activity/${deviceFingerprint}`);
        const data = await response.json();
        
        if (data.status === 'never_seen') {
            activityTime.textContent = 'Sin actividad registrada';
            activityStatus.textContent = '⏳ Esperando primer heartbeat';
            activityStatus.className = 'activity-value warning';
        } else {
            const minutesAgo = data.minutes_ago;
            
            if (minutesAgo < 1) {
                activityTime.textContent = 'Hace menos de 1 minuto ✅';
            } else if (minutesAgo < 60) {
                activityTime.textContent = `Hace ${Math.floor(minutesAgo)} minuto${Math.floor(minutesAgo) > 1 ? 's' : ''}`;
            } else {
                const hours = Math.floor(minutesAgo / 60);
                activityTime.textContent = `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
            }
            
            // Update status based on minutes
            if (data.status === 'active') {
                activityStatus.textContent = '✅ SW Activo';
                activityStatus.className = 'activity-value active';
            } else if (data.status === 'idle') {
                activityStatus.textContent = '⚠️ SW Inactivo';
                activityStatus.className = 'activity-value idle';
            } else {
                activityStatus.textContent = '❌ SW Probablemente muerto';
                activityStatus.className = 'activity-value inactive';
            }
        }
    } catch (error) {
        console.error('Error fetching activity:', error);
        activityTime.textContent = 'Error al consultar';
        activityStatus.textContent = '❌ Error';
        activityStatus.className = 'activity-value inactive';
    }
}

// Update activity on button click
activityRefresh.addEventListener('click', async () => {
    activityRefresh.disabled = true;
    activityRefresh.textContent = '⏳ Consultando...';
    await updateActivityMonitor();
    activityRefresh.disabled = false;
    activityRefresh.textContent = '🔄 Actualizar';
});

// Auto-update activity every 60 seconds
setInterval(updateActivityMonitor, 60000);

// Initial update after 2 seconds (give SW time to send first heartbeat)
setTimeout(updateActivityMonitor, 2000);

// Function to update diagnostic panel
function updateDiagnosticPanel() {
    const diagSecure = document.getElementById('diagSecure');
    const diagDisplay = document.getElementById('diagDisplay');
    const diagNotification = document.getElementById('diagNotification');
    const diagSW = document.getElementById('diagSW');
    const diagPeriodicSync = document.getElementById('diagPeriodicSync');
    
    // Secure Context
    if (window.isSecureContext) {
        diagSecure.textContent = '✅ Sí';
        diagSecure.className = 'diagnostic-value success';
    } else {
        diagSecure.textContent = '❌ No';
        diagSecure.className = 'diagnostic-value error';
    }
    
    // Display Mode
    const isPWA = window.matchMedia('(display-mode: standalone)').matches;
    if (isPWA) {
        diagDisplay.textContent = '✅ PWA';
        diagDisplay.className = 'diagnostic-value success';
    } else {
        diagDisplay.textContent = '⚠️ Browser';
        diagDisplay.className = 'diagnostic-value warning';
    }
    
    // Notification API
    if ('Notification' in window) {
        const perm = Notification.permission;
        if (perm === 'granted') {
            diagNotification.textContent = '✅ Permitido';
            diagNotification.className = 'diagnostic-value success';
        } else if (perm === 'denied') {
            diagNotification.textContent = '❌ Denegado';
            diagNotification.className = 'diagnostic-value error';
        } else {
            diagNotification.textContent = '⚠️ Pendiente';
            diagNotification.className = 'diagnostic-value warning';
        }
    } else {
        diagNotification.textContent = '❌ No disponible';
        diagNotification.className = 'diagnostic-value error';
    }
    
    // Service Worker
    if ('serviceWorker' in navigator && swRegistration) {
        diagSW.textContent = '✅ Activo';
        diagSW.className = 'diagnostic-value success';
    } else if ('serviceWorker' in navigator) {
        diagSW.textContent = '⏳ Cargando...';
        diagSW.className = 'diagnostic-value warning';
    } else {
        diagSW.textContent = '❌ No disponible';
        diagSW.className = 'diagnostic-value error';
    }
    
    // Periodic Sync - initial check
    if ('periodicSync' in ServiceWorkerRegistration.prototype) {
        diagPeriodicSync.textContent = '⏳ Verificando...';
        diagPeriodicSync.className = 'diagnostic-value warning';
    } else {
        diagPeriodicSync.textContent = '❌ No soportado';
        diagPeriodicSync.className = 'diagnostic-value error';
    }
}

// Initialize Service Worker (at the end after all functions are defined)
console.log('=' .repeat(60));
console.log('🔍 DIAGNÓSTICO DE SOPORTE PWA');
console.log('=' .repeat(60));
console.log('🌐 URL:', window.location.href);
console.log('🔒 Secure Context (HTTPS):', window.isSecureContext);
console.log('📱 Display Mode:', window.matchMedia('(display-mode: standalone)').matches ? 'PWA (Instalada)' : 'Browser');
console.log('🔔 Notification API:', 'Notification' in window ? 'Disponible' : '❌ NO DISPONIBLE');
if ('Notification' in window) {
    console.log('   └─ Permission:', Notification.permission);
}
console.log('⚙️ Service Worker API:', 'serviceWorker' in navigator ? 'Disponible' : '❌ NO DISPONIBLE');
console.log('📲 Push Manager:', 'PushManager' in window ? 'Disponible' : '❌ NO DISPONIBLE');
console.log('⏰ Periodic Sync:', 'periodicSync' in ServiceWorkerRegistration.prototype ? 'Disponible' : '❌ NO DISPONIBLE');
console.log('🔧 User Agent:', navigator.userAgent);
console.log('=' .repeat(60));

// Update diagnostic panel on load
updateDiagnosticPanel();

if ('serviceWorker' in navigator) {
    console.log('✅ Service Workers supported. Secure context:', window.isSecureContext);
    
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(registration => {
            console.log('✅ Service Worker registered:', registration);
            swRegistration = registration;
            
            // Update diagnostic panel
            updateDiagnosticPanel();
            
            // Wait for SW to be ready
            return navigator.serviceWorker.ready;
        })
        .then(() => {
            checkSubscription();
            registerPeriodicSync();
        })
        .catch(error => {
            console.error('❌ Error registering Service Worker:', error);
            updateDiagnosticPanel();
        });
} else {
    const reason = !window.isSecureContext ? '(Requiere HTTPS o localhost)' : '(Navegador no compatible)';
    console.error('❌ Service Workers not supported', reason);
}

// Register Periodic Background Sync for heartbeat
async function registerPeriodicSync() {
    const diagPeriodicSync = document.getElementById('diagPeriodicSync');
    
    try {
        if ('periodicSync' in ServiceWorkerRegistration.prototype) {
            const registration = await navigator.serviceWorker.ready;
            
            // Request permission for periodic background sync
            const status = await navigator.permissions.query({
                name: 'periodic-background-sync',
            });
            
            console.log('⏰ Periodic sync permission:', status.state);
            
            // Update diagnostic based on permission
            if (status.state === 'granted') {
                // Register periodic sync every 5 minutes (300000 ms)
                await registration.periodicSync.register('heartbeat-sync', {
                    minInterval: 5 * 60 * 1000  // 5 minutes
                });
                console.log('✅ Periodic sync registered: heartbeat every 5 minutes');
                
                // Check registered syncs
                const tags = await registration.periodicSync.getTags();
                console.log('📋 Registered periodic syncs:', tags);
                
                diagPeriodicSync.textContent = '✅ Activo (5 min)';
                diagPeriodicSync.className = 'diagnostic-value success';
            } else if (status.state === 'prompt') {
                diagPeriodicSync.textContent = '⚠️ Pendiente';
                diagPeriodicSync.className = 'diagnostic-value warning';
                console.warn('⚠️ Periodic sync permission pending');
                console.log('💡 Starting frontend heartbeat fallback');
                startFrontendHeartbeat();
            } else {
                diagPeriodicSync.textContent = '❌ Denegado';
                diagPeriodicSync.className = 'diagnostic-value error';
                console.warn('⚠️ Periodic sync permission denied');
                console.log('💡 Starting frontend heartbeat fallback');
                startFrontendHeartbeat();
            }
        } else {
            diagPeriodicSync.textContent = '❌ No soportado';
            diagPeriodicSync.className = 'diagnostic-value error';
            console.warn('⚠️ Periodic Background Sync not supported');
            console.log('💡 Fallback: Starting frontend interval for heartbeat');
            startFrontendHeartbeat();
        }
    } catch (error) {
        console.error('❌ Error registering periodic sync:', error);
        diagPeriodicSync.textContent = '❌ Error';
        diagPeriodicSync.className = 'diagnostic-value error';
        // Start fallback on error
        startFrontendHeartbeat();
    }
}

// Fallback: Frontend heartbeat with setInterval (only works when app is open)
function startFrontendHeartbeat() {
    console.log('🔄 Starting frontend heartbeat fallback (every 5 minutes)');
    
    // Send initial heartbeat
    sendFrontendHeartbeat();
    
    // Set interval for subsequent heartbeats
    setInterval(sendFrontendHeartbeat, 5 * 60 * 1000); // Every 5 minutes
}

async function sendFrontendHeartbeat() {
    try {
        console.log('💓 Frontend: Sending heartbeat...', deviceFingerprint.substring(0, 16) + '...');
        
        const response = await fetch('/api/heartbeat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fingerprint: deviceFingerprint })
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Frontend: Heartbeat sent:', data.registered_at);
        } else {
            console.error('❌ Frontend: Heartbeat failed:', response.status);
        }
    } catch (error) {
        console.error('❌ Frontend: Error sending heartbeat:', error);
    }
}

// Initialize device fingerprint and connect WebSocket
(async function init() {
    // Generate device fingerprint
    deviceFingerprint = await generateDeviceFingerprint();
    console.log('🔑 Device fingerprint initialized:', deviceFingerprint.substring(0, 16) + '...');
    
    // Display fingerprint in UI
    const fingerprintValueEl = document.getElementById('fingerprintValue');
    if (fingerprintValueEl) {
        fingerprintValueEl.textContent = deviceFingerprint.substring(0, 16) + '...';
        fingerprintValueEl.title = deviceFingerprint; // Full fingerprint on hover
    }
    
    // Connect WebSocket (after all functions are defined)
    connectWebSocket();
})();
