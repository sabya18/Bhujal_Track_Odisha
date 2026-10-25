const CACHE_NAME = 'bhujal-track-pwa-v119';

// Critical frontend shell assets with relative paths
const STATIC_ASSETS = [
  './',
  'index.html',
  'login.html',
  'styles.css?v=119',
  'app.js?v=119',
  'manifest.json',
  'wells_initial.js',
  'icon-512.png',
  'logo.png'
];

// Install Event - Pre-cache critical frontend shell assets
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Pre-caching Bhujal Track shell assets');
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[Service Worker] Note on pre-caching:', err);
      });
    })
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache version:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Stale-while-revalidate / network-first for navigation & shell, pass APIs through
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Pass through backend API calls or dynamic uploads
  if (url.pathname.includes('/api/') || url.pathname.includes('/uploads/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ 
          success: false, 
          offline: true, 
          message: 'You are currently offline. Field records will sync when reconnected.' 
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Network-first for GeoJSON and data assets (ensures fresh datasets without stale redirect caches)
  if (url.pathname.includes('/data/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // For HTML documents: Network-first falling back to cache
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cached => cached || caches.match('index.html') || caches.match('./'));
        })
    );
    return;
  }

  // For static assets (CSS, JS, images, fonts): Cache-first with stale-while-revalidate
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        // Fetch fresh copy in background to update cache
        fetch(request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return networkResponse;
      });
    })
  );
});
