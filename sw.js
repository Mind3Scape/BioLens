/* Оболочка кэшируется, данные — никогда: они и так лежат в IndexedDB.
   Запросы к openrouter.ai проходят мимо кэша всегда. */

const CACHE = 'biolens-v13';
const SHELL = [
  './', './index.html', './css/app.css',
  './js/app.js', './js/db.js', './js/store.js', './js/views.js',
  './js/ui.js', './js/markers.js', './js/openrouter.js', './js/icons.js', './js/scan.js', './js/demo.js', './js/telegram.js', './js/backup.js', './js/pdfdoc.js', './js/reference.js', './js/meds.js',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

/* Сначала кэш, обновление — в фоне.
   Гонка «сеть против трёх секунд» решалась ДЛЯ КАЖДОГО ФАЙЛА отдельно: на
   слабой связи один модуль приезжал новый, соседний отдавался старый из кэша,
   и приложение работало из двух разных сборок сразу. Теперь в пределах одного
   запуска все файлы берутся из одного поколения кэша, а новая версия
   применяется целиком после перезагрузки. */
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;            // OpenRouter и прочее — напрямую
  if (e.request.method !== 'GET') return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request);
    if (cached) {
      // тихо освежаем на будущее, но текущему запуску отдаём согласованный набор
      fetch(e.request).then(r => { if (r && r.ok) cache.put(e.request, r.clone()); }).catch(() => {});
      return cached;
    }
    try {
      const r = await fetch(e.request);
      if (r && r.ok) cache.put(e.request, r.clone());
      return r;
    } catch {
      return (await cache.match('./index.html')) || Response.error();
    }
  })());
});
