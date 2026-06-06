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
    caches.match(event.request).then((response) => {
      const fetchPromise = fetch(event.request).then(fetchRes => {
        // Cache gambar DAN data API Supabase secara dinamis
        const isSupabaseData = event.request.url.includes('supabase.co/rest/v1');
        const isSupabaseStorage = event.request.url.includes('supabase.co/storage');

        if ((isSupabaseData || isSupabaseStorage) && fetchRes.status === 200) {
            return caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request.url, fetchRes.clone());
                return fetchRes;
            });
        }
        return fetchRes;
      });

      // Strategi: Stale-While-Revalidate untuk data API
      // Jika ada di cache, kembalikan cache tapi tetap update di background
      if (event.request.url.includes('supabase.co/rest/v1')) {
          return response || fetchPromise;
      }

      return response || fetchPromise;
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