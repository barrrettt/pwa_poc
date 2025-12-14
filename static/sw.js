const CACHE_NAME = 'pwa-poc-v28';
const urlsToCache = [];

// ⚠️ NO CACHING ENABLED - All requests go to network
// This is for development/debugging purposes

// Firebase configuration for SW
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase config object
// NOTE: Firebase API Keys are designed to be public in client-side apps
// Security is controlled by Firebase Security Rules, not API key secrecy
// See: https://firebase.google.com/docs/projects/api-keys
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
  console.log('📬 SW: ===== FCM BACKGROUND MESSAGE HANDLER FIRED =====');
  console.log('📬 SW: Background FCM message received:', payload);
  console.log('📬 SW: payload.data:', payload.data);
  console.log('📬 SW: payload.notification:', payload.notification);
  console.log('📬 SW: payload.from:', payload.from);
  console.log('📬 SW: payload.fcmMessageId:', payload.fcmMessageId);
  
  // When sending data-only messages, FCM puts everything in payload.data
  const data = payload.data || {};
  const notification = payload.notification || {};
  
  console.log('📬 SW: Extracted data object:', JSON.stringify(data));
  console.log('📬 SW: data.title:', data.title);
  console.log('📬 SW: data.body:', data.body);
  console.log('📬 SW: data.tag:', data.tag);
  
  const notificationTitle = data.title || notification.title || 'New notification';
  const notificationOptions = {
    body: data.body || notification.body || 'No body',
    icon: data.icon || notification.icon || notification.image || '/static/icon-192.png',
    badge: data.badge || '/static/icon-192.png',
    tag: data.tag || `fcm-${Date.now()}`, // Use unique tag if not provided
    vibrate: [200, 100, 200],
    data: data
  };
  
  console.log('📬 SW: Showing notification with title:', notificationTitle);
  console.log('📬 SW: Notification options:', notificationOptions);
  console.log('📬 SW: ===== END FCM HANDLER =====');
  
  return self.registration.showNotification(notificationTitle, notificationOptions);
});

console.log('🔥 SW: Firebase messaging initialized');

// Install event - no caching
self.addEventListener('install', event => {
  console.log('🔧 SW v26: Install event (NO CACHE MODE)');
  // Force immediate activation without caching
  self.skipWaiting();
});

// Activate event - clean old caches and take control immediately
self.addEventListener('activate', event => {
  console.log('🔧 SW v26: Activate event - Cleaning all old caches');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          console.log('🗑️ SW v26: Deleting cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      console.log('✅ SW v26: Taking control of all clients');
      return self.clients.claim();
    })
  );
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

// Fetch event - NETWORK ONLY (no caching at all)
self.addEventListener('fetch', event => {
  // Always fetch from network, never use cache
  event.respondWith(
    fetch(event.request).catch(error => {
      console.error('❌ SW: Network request failed:', event.request.url, error);
      throw error;
    })
  );
});

// Push event - handle incoming push notifications (WebPush and FCM)
self.addEventListener('push', event => {
  console.log('📡 Push notification received:', event);
  console.log('📡 Push data:', event.data);
  
  // Skip if no data
  if (!event.data) {
    console.log('⏭️ No data in push event, skipping');
    return;
  }
  
  let notificationData;
  
  try {
    const dataText = event.data.text();
    console.log('📡 Push data text:', dataText);
    
    if (!dataText) {
      console.log('⏭️ Empty data text, skipping');
      return;
    }
    
    // Try to parse as JSON
    const parsedData = JSON.parse(dataText);
    console.log('📡 Parsed data:', parsedData);
    
    // Check if it's an FCM message (has 'from' or 'fcmMessageId' or nested 'data' field)
    if (parsedData.from || parsedData.fcmMessageId || (parsedData.data && !parsedData.title)) {
      console.log('🔥 Detected FCM message, processing...');
      
      // Extract data from FCM structure
      const fcmData = parsedData.data || {};
      notificationData = {
        title: fcmData.title || 'FCM Notification',
        body: fcmData.body || 'No body',
        icon: fcmData.icon || '/static/icon-192.png',
        badge: fcmData.badge || '/static/icon-192.png',
        tag: fcmData.tag || 'fcm-notification'
      };
    } else {
      // WebPush message - check if it has title and body
      if (!parsedData.title || !parsedData.body) {
        console.log('⏭️ Missing title or body, not a valid WebPush message, skipping');
        return;
      }
      notificationData = parsedData;
    }
  } catch (e) {
    console.error('❌ Error parsing push data:', e);
    console.log('⏭️ Failed to parse, skipping notification');
    return;
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
