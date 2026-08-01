/* Оболочка кэшируется, данные — никогда: они и так лежат в IndexedDB.
   Запросы к openrouter.ai проходят мимо кэша всегда. */

const CACHE = 'biolens-v10';
const SHELL = [
  './', './index.html', './css/app.css',
  './js/app.js', './js/db.js', './js/store.js', './js/views.js',
  './js/ui.js', './js/markers.js', './js/openrouter.js', './js/icons.js', './js/scan.js', './js/demo.js', './js/telegram.js', './js/backup.js', './js/pdfdoc.js', './js/reference.js',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

/* Сеть вперёд, но не бесконечно: на слабой связи в метро приложение раньше
   просто не открывалось, хотя в кэше лежала рабочая копия. Ждём сеть три
   секунды, дальше показываем кэш — и всё равно дообновляем его в фоне. */
const NET_WAIT = 3000;

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;            // OpenRouter и прочее — напрямую
  if (e.request.method !== 'GET') return;

  const fromNet = fetch(e.request).then(r => {
    if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  });

  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (!cached) {
      try { return await fromNet; }
      catch { return (await caches.match('./index.html')) || Response.error(); }
    }
    const slow = new Promise(res => setTimeout(() => res(null), NET_WAIT));
    const winner = await Promise.race([fromNet.catch(() => null), slow]);
    return winner || cached;
  })());
});
