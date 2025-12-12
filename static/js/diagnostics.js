// Diagnostics and Activity Monitor Module
let swRegistration = null;
let deviceFingerprint = '';

export function initDiagnostics(swReg, fingerprint) {
    swRegistration = swReg;
    deviceFingerprint = fingerprint;
}

export function updateDiagnosticPanel() {
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

export async function updateActivityMonitor() {
    const activityTime = document.getElementById('activityTime');
    const activityStatus = document.getElementById('activityStatus');
    
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
    
    // Update next notification time
    try {
        const response = await fetch('/api/next-notification');
        const data = await response.json();
        
        const nextNotificationTime = document.getElementById('nextNotificationTime');
        if (!nextNotificationTime) return; // Element doesn't exist yet
        
        if (data.status === 'unknown') {
            nextNotificationTime.textContent = 'Desconocido';
        } else {
            const seconds = data.seconds_remaining;
            if (seconds < 60) {
                nextNotificationTime.textContent = `En ${seconds}s`;
            } else {
                const minutes = Math.floor(seconds / 60);
                const secs = seconds % 60;
                nextNotificationTime.textContent = `En ${minutes}m ${secs}s`;
            }
        }
    } catch (error) {
        // Ignore if endpoint not available yet
    }
}

export async function registerPeriodicSync(onSuccess) {
    const diagPeriodicSync = document.getElementById('diagPeriodicSync');
    
    try {
        if ('periodicSync' in ServiceWorkerRegistration.prototype) {
            const registration = await navigator.serviceWorker.ready;
            
            const status = await navigator.permissions.query({
                name: 'periodic-background-sync',
            });
            
            if (status.state === 'granted') {
                await registration.periodicSync.register('heartbeat-sync', {
                    minInterval: 10 * 1000
                });
                
                await registration.periodicSync.getTags();
                
                diagPeriodicSync.textContent = '✅ Activo (10s)';
                diagPeriodicSync.className = 'diagnostic-value success';
                
                if (onSuccess) onSuccess();
            } else if (status.state === 'prompt') {
                diagPeriodicSync.textContent = '⚠️ Pendiente';
                diagPeriodicSync.className = 'diagnostic-value warning';
                if (onSuccess) onSuccess();
            } else {
                diagPeriodicSync.textContent = '❌ Denegado';
                diagPeriodicSync.className = 'diagnostic-value error';
                if (onSuccess) onSuccess();
            }
        } else {
            diagPeriodicSync.textContent = '❌ No soportado';
            diagPeriodicSync.className = 'diagnostic-value error';
            if (onSuccess) onSuccess();
        }
    } catch (error) {
        console.error('❌ Error registering periodic sync:', error);
        diagPeriodicSync.textContent = '❌ Error';
        diagPeriodicSync.className = 'diagnostic-value error';
        if (onSuccess) onSuccess();
    }
}

export async function sendHeartbeat() {
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
            await response.json();
        }
    } catch (error) {
        // Silent fail
    }
}
