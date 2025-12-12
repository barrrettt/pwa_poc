const CACHE_NAME = 'pwa-poc-v22';
const urlsToCache = [
  '/',
  '/static/manifest.json',
  '/static/icon-192.png',
  '/static/icon-512.png',
  '/static/js/firebase-config.js'
];

// Firebase configuration for SW
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase config object
const firebaseConfig = {
  apiKey: "AIzaSyAXfasYzYVL-zCArx_agaYPwctWq8RwThY",
  authDomain: "barret-firebase.firebaseapp.com",
  projectId: "barret-firebase",
  storageBucket: "barret-firebase.firebasestorage.app",
  messagingSenderId: "340392912968",
  appId: "1:340392912968:web:3c60652e1347853ac1107d",
  measurementId: "G-5260Q382VC"
};

// Initialize Firebase in Service Worker
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle background messages from FCM
messaging.onBackgroundMessage((payload) => {
  console.log('📬 SW: Background FCM message received:', payload);
  console.log('📬 SW: payload.data:', payload.data);
  console.log('📬 SW: payload.notification:', payload.notification);
  
  // When sending data-only messages, FCM puts everything in payload.data
  const data = payload.data || {};
  const notification = payload.notification || {};
  
  const notificationTitle = data.title || notification.title || 'New notification';
  const notificationOptions = {
    body: data.body || notification.body || 'No body',
    icon: data.icon || notification.icon || notification.image || '/static/icon-192.png',
    badge: data.badge || '/static/icon-192.png',
    tag: data.tag || 'fcm-notification',
    data: data
  };
  
  console.log('📬 SW: Showing notification with title:', notificationTitle);
  console.log('📬 SW: Notification options:', notificationOptions);
  
  return self.registration.showNotification(notificationTitle, notificationOptions);
});

console.log('🔥 SW: Firebase messaging initialized');

// Also handle push events directly for FCM data-only messages
self.addEventListener('push', event => {
  console.log('📬 SW: Push event received');
  
  if (!event.data) {
    console.log('⚠️ SW: Push event has no data');
    return;
  }
  
  try {
    const payload = event.data.json();
    console.log('📬 SW: Push payload:', payload);
    
    // Handle FCM data-only messages
    if (payload.data) {
      const data = payload.data;
      const notificationTitle = data.title || 'New notification';
      const notificationOptions = {
        body: data.body || 'No body',
        icon: data.icon || '/static/icon-192.png',
        badge: data.badge || '/static/icon-192.png',
        tag: data.tag || 'fcm-notification',
        data: data
      };
      
      console.log('📬 SW: Showing FCM notification from push event:', notificationTitle);
      event.waitUntil(
        self.registration.showNotification(notificationTitle, notificationOptions)
      );
    }
  } catch (error) {
    console.error('❌ SW: Error handling push event:', error);
  }
});

// Install event - cache resources
self.addEventListener('install', event => {
  console.log('🔧 SW: Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ SW: Cache opened');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Get device fingerprint from clients or cache
async function getDeviceFingerprint() {
  try {
    // Try to get from clients (if any window is open)
    const allClients = await clients.matchAll({ includeUncontrolled: true, type: 'window' });
    if (allClients.length > 0) {
      const response = await new Promise((resolve) => {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
          resolve(event.data);
        };
        allClients[0].postMessage({ type: 'GET_FINGERPRINT' }, [messageChannel.port2]);
        setTimeout(() => resolve(null), 1000);
      });
      
      if (response && response.fingerprint) {
        return response.fingerprint;
      }
    }
    
    // Fallback: get from cache or generate
    const cache = await caches.open(CACHE_NAME);
    const fingerprintKey = 'sw-fingerprint';
    const cachedResponse = await cache.match(fingerprintKey);
    
    if (cachedResponse) {
      const data = await cachedResponse.json();
      return data.fingerprint;
    }
    
    // Generate new fingerprint for SW
    const fingerprint = 'sw-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    await cache.put(fingerprintKey, new Response(JSON.stringify({ fingerprint })));
    
    return fingerprint;
  } catch (e) {
    console.error('❌ SW: Error getting fingerprint:', e);
    return 'sw-unknown';
  }
}

async function sendHeartbeat() {
  try {
    const fingerprint = await getDeviceFingerprint();
    console.log('💓 SW: Sending heartbeat...', fingerprint.substring(0, 16) + '...');
    
    const response = await fetch('/api/heartbeat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fingerprint })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ SW: Heartbeat sent:', data.registered_at);
      return true;
    } else {
      console.error('❌ SW: Heartbeat failed with status:', response.status);
      return false;
    }
  } catch (e) {
    console.error('❌ SW: Error sending heartbeat:', e);
    return false;
  }
}

// Periodic Background Sync event - send heartbeat every 5 minutes
self.addEventListener('periodicsync', event => {
  console.log('⏰ SW: Periodic sync event triggered:', event.tag);
  
  if (event.tag === 'heartbeat-sync') {
    event.waitUntil(sendHeartbeat());
  }
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  console.log('🚀 SW: Activate event');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ SW: Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Network first for HTML, cache first for static assets
self.addEventListener('fetch', event => {
  // Don't cache POST requests or other non-GET methods
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Network first for HTML pages
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clone the response before caching
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // Cache first for static assets
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Clone the request
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          // Cache static resources and GET API calls
          if (event.request.url.includes('/static/') || 
              (event.request.url.includes('/api/') && event.request.method === 'GET')) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          
          return response;
        }).catch(() => {
          // Network failed, try to return cached response
          return caches.match(event.request);
        });
      })
  );
});

// Push event - handle incoming push notifications
self.addEventListener('push', event => {
  console.log('Push notification received:', event);
  console.log('Push data:', event.data);
  
  let notificationData = {
    title: 'PWA POC',
    body: 'Nueva notificación',
    icon: '/static/icon-192.png',
    badge: '/static/icon-192.png'
  };
  
  if (event.data) {
    try {
      const dataText = event.data.text();
      console.log('Push data text:', dataText);
      
      if (dataText) {
        notificationData = JSON.parse(dataText);
        console.log('Parsed notification data:', notificationData);
      }
    } catch (e) {
      console.error('Error parsing push data:', e);
      notificationData.body = event.data.text() || 'Nueva notificación';
    }
  }
  
  const options = {
    body: notificationData.body,
    icon: notificationData.icon || '/static/icon-192.png',
    badge: notificationData.badge || '/static/icon-192.png',
    vibrate: [200, 100, 200],
    tag: notificationData.tag || 'pwa-notification',
    timestamp: notificationData.timestamp || Date.now(),
    requireInteraction: false,
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
      url: '/'
    },
    actions: [
      {
        action: 'explore',
        title: 'Ver'
      },
      {
        action: 'close',
        title: 'Cerrar'
      }
    ]
  };
  
  console.log('Showing notification with options:', options);
  
  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
      .then(() => console.log('Notification shown successfully'))
      .catch(err => console.error('Error showing notification:', err))
  );
});

// Notification click event
self.addEventListener('notificationclick', event => {
  console.log('Notification clicked:', event);
  
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  } else if (event.action === 'close') {
    // Just close
  } else {
    // Default action - open app
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clientList => {
          // Check if there's already a window open
          for (let client of clientList) {
            if (client.url === '/' && 'focus' in client) {
              return client.focus();
            }
          }
          // If not, open a new window
          if (clients.openWindow) {
            return clients.openWindow('/');
          }
        })
    );
  }
});
