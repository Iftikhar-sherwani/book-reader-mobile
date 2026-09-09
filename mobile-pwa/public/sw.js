// Service Worker for Book Reader Mobile
const CACHE_NAME = 'book-reader-cache-v1';
const RUNTIME_CACHE = 'book-reader-runtime-v1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './pdfjs/pdf.worker.min.mjs',
  './icons/pwa-192x192.png',
  './icons/pwa-512x512.png',
  './icons/maskable-icon-512x512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png',
];

// Install: Precache core static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Precache partial failure (will cache on fetch):', err);
      });
    })
  );
  // Do not automatically skipWaiting; wait for user or manual update
});

// Activate: Clean up obsolete caches & claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Offline-first with cache fallback & dynamic asset caching
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip chrome-extension and unsupported schemes
  if (!url.protocol.startsWith('http')) return;

  // Navigation requests: Network-first with offline fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          return caches.match('./index.html')
            .then((res) => res || caches.match('index.html'))
            .then((res) => res || new Response('Offline: Please reopen when connected.', { headers: { 'Content-Type': 'text/html' } }));
        })
    );
    return;
  }

  // Static assets (JS, CSS, Images, Fonts, PDF.js assets)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version immediately
        return cachedResponse;
      }

      // If not in cache, fetch from network and store copy in runtime cache
      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
          return networkResponse;
        })
        .catch((err) => {
          // If offline and not in cache, return fallback if appropriate
          console.warn('Fetch offline fallback failed for:', request.url, err);
          return new Response('', { status: 408, statusText: 'Request Offline' });
        });
    })
  );
});

// Listen for message from app (e.g. skipWaiting on update)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
