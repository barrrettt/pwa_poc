const CACHE_NAME = 'pwa-poc-v2';
const urlsToCache = [
  '/',
  '/static/manifest.json',
  '/static/icon-192.png',
  '/static/icon-512.png'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  // Don't cache POST requests or other non-GET methods
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }
  
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
    tag: 'pwa-notification',
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
