const CACHE_NAME = 'novelfire-v1';
const ASSETS = [
  '/',
  '/index',
  '/admin',
  '/detail',
  '/read',
  '/css/style.css',
  '/js/script.js',
  '/js/modules/auth.js',
  '/js/modules/data-service.js',
  '/js/modules/supabase-client.js',
  '/js/admin-logic.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Pembersihan cache lama saat versi berganti
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Menghapus cache lama:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Hanya cache request GET ke Supabase (Data) atau Image
        const isSupabaseGet = event.request.url.includes('supabase.co') && event.request.method === 'GET';
        const isImage = event.request.destination === 'image';
        
        if (networkResponse.status === 200 && (isSupabaseGet || isImage)) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      // Jika ada di cache, berikan segera dan update di background
      if (cachedResponse) {
        // Update cache di background
        event.waitUntil(fetchPromise);
        return cachedResponse;
      }

      return fetchPromise;
    })
  );
});

// Listener untuk pesan dari Admin (Client)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PURGE_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('Service Worker: Cache telah dikosongkan atas perintah Admin.');
    });
  }
});