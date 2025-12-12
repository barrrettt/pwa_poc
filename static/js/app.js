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
        // Load initial history on connect
        renderHistory([]);
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Backend sends history_update with full history
        if (data.type === 'history_update') {
            renderHistory(data.history);
        }
    };
    
    ws.onclose = () => {
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
    };
}

// Infinite scroll state
let currentPage = 1;
let isLoadingHistory = false;
let hasMoreHistory = true;
let totalEvents = 0;
let loadedEventIds = new Set(); // Track loaded event IDs to avoid duplicates
let scrollObserver = null; // Global observer instance

// Render history from backend data (for WebSocket updates)
function renderHistory(historyData) {
    // If list is empty (first load), load first page
    if (historyList.children.length === 0 || 
        (historyList.children.length === 1 && historyList.querySelector('.empty-message'))) {
        currentPage = 1;
        hasMoreHistory = true;
        historyList.innerHTML = '';
        loadedEventIds.clear();
        loadHistoryPage();
        return;
    }
    
    // Otherwise, check for new events and prepend them
    if (!historyData || historyData.length === 0) return;
    
    // Get the most recent events (reversed order - newest first)
    const reversedHistory = historyData.slice().reverse();
    
    // Find new events (those not in our loaded set)
    const newEvents = reversedHistory.filter(event => {
        const eventId = `${event.timestamp}-${event.type}`;
        return !loadedEventIds.has(eventId);
    });
    
    // Prepend new events at the top (before loading indicator if it exists)
    const loadingIndicator = document.getElementById('loadingIndicator');
    const insertPosition = loadingIndicator || null;
    
    newEvents.forEach((event, index) => {
        const eventId = `${event.timestamp}-${event.type}`;
        loadedEventIds.add(eventId);
        
        const historyItem = document.createElement('li');
        historyItem.className = 'history-item';
        historyItem.style.animation = 'slideIn 0.3s ease-out';
        
        const date = new Date(event.timestamp * 1000);
        const timestamp = date.toLocaleString('es-ES');
        const eventNumber = index + 1; // New events are numbered from 1
        
        historyItem.innerHTML = `
            <div class="event-content">
                <div class="event-name">${eventNumber}. ${event.type}</div>
                <div class="event-details">
                    ${event.message}<br>
                    ${Object.keys(event.details).length > 0 ? `<strong>Detalles:</strong> ${JSON.stringify(event.details)}<br>` : ''}
                    <strong>Timestamp:</strong> ${timestamp}
                </div>
            </div>
        `;
        
        // Insert at the beginning (but before loading indicator if it exists)
        if (insertPosition) {
            historyList.insertBefore(historyItem, insertPosition);
        } else {
            historyList.insertBefore(historyItem, historyList.firstChild);
        }
    });
    
    // Update total counter
    totalEvents = historyData.length;
    const historyTitle = document.querySelector('.history-title');
    if (historyTitle) {
        historyTitle.textContent = `📝 Histórico de Eventos (${totalEvents})`;
    }
}

// Load a single page of history
async function loadHistoryPage() {
    if (isLoadingHistory || !hasMoreHistory) return;
    
    isLoadingHistory = true;
    
    try {
        const response = await fetch(`/api/history?page=${currentPage}&limit=5`);
        const data = await response.json();
        
        totalEvents = data.total;
        hasMoreHistory = data.hasMore;
        
        // Update counter in the title
        const historyTitle = document.querySelector('.history-title');
        if (historyTitle) {
            historyTitle.textContent = `📝 Histórico de Eventos (${totalEvents})`;
        }
        
        // If first page and no events
        if (currentPage === 1 && data.history.length === 0) {
            historyList.innerHTML = '<li class="empty-message">No hay eventos todavía. ¡Pulsa el botón!</li>';
            isLoadingHistory = false;
            return;
        }
        
        // Remove empty message if exists
        const emptyMessage = historyList.querySelector('.empty-message');
        if (emptyMessage) {
            emptyMessage.remove();
        }
        
        // Render events (already come in reverse order from backend)
        data.history.forEach((event, index) => {
            const eventId = `${event.timestamp}-${event.type}`;
            loadedEventIds.add(eventId); // Track this event
            
            const historyItem = document.createElement('li');
            historyItem.className = 'history-item';
            
            const date = new Date(event.timestamp * 1000);
            const timestamp = date.toLocaleString('es-ES');
            const eventNumber = (currentPage - 1) * 5 + index + 1;
            
            historyItem.innerHTML = `
                <div class="event-content">
                    <div class="event-name">${eventNumber}. ${event.type}</div>
                    <div class="event-details">
                        ${event.message}<br>
                        ${Object.keys(event.details).length > 0 ? `<strong>Detalles:</strong> ${JSON.stringify(event.details)}<br>` : ''}
                        <strong>Timestamp:</strong> ${timestamp}
                    </div>
                </div>
            `;
            
            historyList.appendChild(historyItem);
        });
        
        // Remove old loading indicator first
        let loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
        
        // Add loading indicator at the end if there's more
        if (hasMoreHistory) {
            loadingIndicator = document.createElement('li');
            loadingIndicator.id = 'loadingIndicator';
            loadingIndicator.className = 'loading-indicator';
            loadingIndicator.textContent = 'Cargando más eventos...';
            historyList.appendChild(loadingIndicator);
            
            // Re-observe the new loading indicator
            if (scrollObserver && loadingIndicator) {
                scrollObserver.observe(loadingIndicator);
            }
        }
        
        currentPage++;
    } catch (error) {
        console.error('Error loading history page:', error);
    } finally {
        isLoadingHistory = false;
    }
}

// Setup infinite scroll observer
function setupInfiniteScroll() {
    scrollObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && hasMoreHistory && !isLoadingHistory) {
                    loadHistoryPage();
                }
            });
        },
        {
            root: null, // Use viewport instead of container
            rootMargin: '200px',
            threshold: 0.1
        }
    );
    
    // Observe the loading indicator
    const checkAndObserve = () => {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            scrollObserver.observe(loadingIndicator);
        } else if (hasMoreHistory) {
            setTimeout(checkAndObserve, 100);
        }
    };
    
    checkAndObserve();
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
        return;
    }
    
    // Check local subscription
    const subscription = await swRegistration.pushManager.getSubscription();
    const hasLocalSubscription = !(subscription === null);
    
    // Check server subscription status
    try {
        const response = await fetch(`/api/check-subscription/${deviceFingerprint}`);
        const data = await response.json();
        const hasServerSubscription = data.is_subscribed;
        
        // If there's a mismatch, sync them
        if (hasLocalSubscription && !hasServerSubscription) {
            isSubscribed = false;
        } else if (!hasLocalSubscription && hasServerSubscription) {
            // Remove from server since we don't have it locally
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
        // Fallback to local check only
        isSubscribed = hasLocalSubscription;
    }
    
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
    console.log('🔔 Suscribirse a notificaciones');
    try {
        // Check if notifications are supported
        if (!('Notification' in window)) {
            alert('⚠️ Tu navegador no soporta notificaciones push.\n\nAsegúrate de:\n1. Usar HTTPS (o localhost)\n2. Tener Chrome 90+\n3. Instalar la app como PWA');
            return;
        }
        
        if (!swRegistration) {
            return;
        }
        
        // Request notification permission
        const permission = await Notification.requestPermission();
        
        if (permission !== 'granted') {
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
    console.log('📨 Enviar notificación');
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

// Firebase FCM Subscribe functionality
const subscribeFCMButton = document.getElementById('subscribeFCMButton');
const clearFCMSubscriptionsButton = document.getElementById('clearFCMSubscriptionsButton');
const sendFCMButton = document.getElementById('sendFCMButton');

let isSubscribedFCM = false;
let currentFCMToken = null;

// Check FCM subscription status on load
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
    if (isSubscribedFCM) {
        subscribeFCMButton.textContent = '🔥 Desuscribirse (FCM)';
        subscribeFCMButton.style.background = 'linear-gradient(135deg, #D32F2F 0%, #C62828 100%)';
    } else {
        subscribeFCMButton.textContent = '🔥 Suscribirse (FCM)';
        subscribeFCMButton.style.background = 'linear-gradient(135deg, #FF6F00 0%, #FFA000 100%)';
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
        
        // Request notification permission
        const permission = await Notification.requestPermission();
        
        if (permission !== 'granted') {
            alert('❌ Necesitas aceptar las notificaciones');
            subscribeFCMButton.disabled = false;
            updateSubscribeFCMButton();
            return;
        }
        
        // Get FCM token
        const token = await window.getFirebaseToken(window.firebaseMessaging, {
            vapidKey: window.firebaseVapidKey,
            serviceWorkerRegistration: swRegistration
        });
        
        if (token) {
            console.log('✅ FCM Token:', token);
            currentFCMToken = token;
            
            // Send token to backend
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
            
            // Listen for foreground messages (only log, SW will show notification)
            window.onFirebaseMessage(window.firebaseMessaging, (payload) => {
                console.log('📬 Foreground FCM message received:', payload);
                // Don't show notification here - let SW handle it
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
        
        // Send unsubscribe request to backend
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

subscribeFCMButton.addEventListener('click', () => {
    if (isSubscribedFCM) {
        unsubscribeFromFCM();
    } else {
        subscribeToFCM();
    }
});

clearFCMSubscriptionsButton.addEventListener('click', async () => {
    if (!confirm('¿Borrar todas las suscripciones FCM del servidor?')) {
        return;
    }
    
    try {
        clearFCMSubscriptionsButton.disabled = true;
        clearFCMSubscriptionsButton.textContent = '⏳ Borrando...';
        
        const response = await fetch('/api/fcm/clear-subscriptions', {
            method: 'POST'
        });
        
        const result = await response.json();
        console.log('✅ FCM subscriptions cleared:', result);
        
        // Update local state
        isSubscribedFCM = false;
        currentFCMToken = null;
        updateSubscribeFCMButton();
        
    } catch (error) {
        console.error('❌ Error clearing FCM subscriptions:', error);
        alert('❌ Error al borrar suscripciones: ' + error.message);
    } finally {
        clearFCMSubscriptionsButton.disabled = false;
        clearFCMSubscriptionsButton.textContent = '🗑️ Borrar Subs (FCM)';
    }
});

sendFCMButton.addEventListener('click', async () => {
    console.log('📨 Sending FCM notification...');
    
    try {
        sendFCMButton.disabled = true;
        sendFCMButton.textContent = '📤 Enviando...';
        
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
        
    } catch (error) {
        console.error('❌ FCM send error:', error);
        alert('❌ Error al enviar: ' + error.message);
    } finally {
        sendFCMButton.disabled = false;
        sendFCMButton.textContent = '📨 Enviar FCM';
    }
});

// Clear subscriptions functionality
const clearSubscriptionsButton = document.getElementById('clearSubscriptionsButton');

clearSubscriptionsButton.addEventListener('click', async () => {
    console.log('🗑️ Limpiar suscripciones');
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
        
        // Reset pagination state
        currentPage = 1;
        hasMoreHistory = true;
        loadedEventIds.clear();
        historyList.innerHTML = '<li class="empty-message">No hay eventos todavía. ¡Pulsa el botón!</li>';
        
        // Update counter
        const historyTitle = document.querySelector('.history-title');
        if (historyTitle) {
            historyTitle.textContent = `📝 Histórico de Eventos (0)`;
        }
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
                const secondsAgo = Math.floor(minutesAgo * 60);
                activityTime.textContent = `Hace ${secondsAgo} segundo${secondsAgo !== 1 ? 's' : ''} ✅`;
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

// Auto-update activity every 5 seconds to show real-time seconds
setInterval(updateActivityMonitor, 5000);

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
console.log('🚀 PWA POC inicializando...');

// Update diagnostic panel on load
updateDiagnosticPanel();

if ('serviceWorker' in navigator) {
    console.log('✅ Service Worker inicializado');
    
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(registration => {
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
            console.error('❌ Error registrando Service Worker:', error);
            updateDiagnosticPanel();
        });
} else {
    console.error('❌ Service Workers no soportado');
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
            
            // Update diagnostic based on permission
            if (status.state === 'granted') {
                // Register periodic sync every 10 seconds
                await registration.periodicSync.register('heartbeat-sync', {
                    minInterval: 10 * 1000  // 10 seconds
                });
                
                // Check registered syncs
                const tags = await registration.periodicSync.getTags();
                
                diagPeriodicSync.textContent = '✅ Activo (10s)';
                diagPeriodicSync.className = 'diagnostic-value success';
                
                // Start fallback anyway since Periodic Sync might not work in browser mode
                startFrontendHeartbeat();
            } else if (status.state === 'prompt') {
                diagPeriodicSync.textContent = '⚠️ Pendiente';
                diagPeriodicSync.className = 'diagnostic-value warning';
                startFrontendHeartbeat();
            } else {
                diagPeriodicSync.textContent = '❌ Denegado';
                diagPeriodicSync.className = 'diagnostic-value error';
                startFrontendHeartbeat();
            }
        } else {
            diagPeriodicSync.textContent = '❌ No soportado';
            diagPeriodicSync.className = 'diagnostic-value error';
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
    // Send initial heartbeat
    sendFrontendHeartbeat();
    
    // Set interval for subsequent heartbeats
    setInterval(sendFrontendHeartbeat, 10 * 1000); // Every 10 seconds
}

async function sendFrontendHeartbeat() {
    if (!deviceFingerprint) {
        console.log('⏳ Esperando fingerprint...');
        return;
    }
    
    try {
        console.log('💓 Heartbeat');
        
        const response = await fetch('/api/heartbeat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fingerprint: deviceFingerprint })
        });
        
        if (response.ok) {
            const data = await response.json();
        } else {
            // Silent fail
        }
    } catch (error) {
        // Silent fail
    }
}

// Initialize device fingerprint and connect WebSocket
(async function init() {
    // Generate device fingerprint
    deviceFingerprint = await generateDeviceFingerprint();
    
    // Display fingerprint in UI
    const fingerprintValueEl = document.getElementById('fingerprintValue');
    if (fingerprintValueEl) {
        fingerprintValueEl.textContent = deviceFingerprint.substring(0, 16) + '...';
        fingerprintValueEl.title = deviceFingerprint; // Full fingerprint on hover
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
    
    // Connect WebSocket (after all functions are defined)
    connectWebSocket();
    
    // Setup infinite scroll
    setupInfiniteScroll();
    
    // Check FCM subscription status
    checkFCMSubscriptionStatus();
    
    // Start activity monitor after fingerprint is ready
    setTimeout(updateActivityMonitor, 2000);
})();
