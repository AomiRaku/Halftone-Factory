const CACHE_NAME = 'halftone-factory-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './factory-main.css',
  './factory-main.js',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function notifyClients(msg) {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => client.postMessage(msg));
  });
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => {
      self.clients.claim();
      notifyClients({ type: 'SW_UPDATED' });
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const accept = req.headers.get('accept') || '';
  const isHTML = req.mode === 'navigate' || accept.includes('text/html');

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (!res.ok || res.type !== 'basic') return res;

          const resForCache = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resForCache));

          if (cached && isHTML) {
            const resForCompare = res.clone();
            Promise.all([cached.text(), resForCompare.text()]).then(([oldText, newText]) => {
              if (oldText !== newText) {
                notifyClients({ type: 'CONTENT_UPDATED' });
              }
            });
          }

          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
