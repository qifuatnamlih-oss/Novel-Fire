const CACHE_NAME = 'novelfire-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/detail.html',
  '/read.html',
  '/css/style.css',
  '/js/script.js',
  '/js/modules/auth.js',
  '/js/modules/data-service.js',
  '/js/modules/supabase-client.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        const isSupabase = event.request.url.includes('supabase.co');
        
        if (networkResponse.status === 200 && (isSupabase || event.request.destination === 'image')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      // Strategi: Stale-While-Revalidate
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