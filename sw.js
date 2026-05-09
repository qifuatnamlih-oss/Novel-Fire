const CACHE_NAME = 'novelfire-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/detail.html',
  '/read.html',
  '/style.css',
  '/script.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then(fetchRes => {
          // Jika yang direquest adalah gambar dari Supabase, simpan ke cache secara otomatis
          if (event.request.url.includes('supabase.co/storage')) {
              return caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request.url, fetchRes.clone());
                  return fetchRes;
              });
          }
          return fetchRes;
      });
    })
  );
});