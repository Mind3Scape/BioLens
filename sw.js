/* Оболочка кэшируется, данные — никогда: они и так лежат в IndexedDB.
   Запросы к openrouter.ai проходят мимо кэша всегда. */

const CACHE = 'biolens-v7';
const SHELL = [
  './', './index.html', './css/app.css',
  './js/app.js', './js/db.js', './js/store.js', './js/views.js',
  './js/ui.js', './js/markers.js', './js/openrouter.js', './js/icons.js', './js/scan.js', './js/demo.js', './js/telegram.js', './js/backup.js', './js/pdfdoc.js',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;            // OpenRouter и прочее — напрямую
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
