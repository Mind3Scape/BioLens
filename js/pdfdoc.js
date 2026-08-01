/* PDF → картинки.

   Модели читают снимки, а не PDF, поэтому страницы рендерим прямо на устройстве
   через pdf.js и дальше ведём их тем же путём, что и фотографии бланков.
   Сам файл никуда не уходит: рендер локальный. */

const MAX_PAGES = 12;      // дальше разбор становится долгим и дорогим
const TARGET_W = 1400;     // ширина страницы: мелкий шрифт бланка ещё читается, а рендер вдвое быстрее
const PAGE_TIMEOUT = 45000; // страница, которая не нарисовалась за это время, считается сбойной

let pdfjs = null;

async function lib() {
  if (pdfjs) return pdfjs;
  // при сбое НЕ оставляем половину загруженной библиотеки — иначе следующая
  // попытка молча зависнет на неподключённом рабочем потоке
  const mod = await import('./vendor/pdf.min.mjs');
  mod.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
  pdfjs = mod;
  return pdfjs;
}

/* Никакой рендер не имеет права висеть вечно: лучше честная ошибка страницы. */
function withTimeout(promise, ms, msg) {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg)), ms); }),
  ]);
}

export const isPdf = (file) =>
  file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));

/* Возвращает { pages: File[], total, rendered, encrypted } */
export async function pdfToImages(file, { onPage } = {}) {
  const pdf = await lib();
  const buf = await file.arrayBuffer();

  let doc;
  try {
    doc = await pdf.getDocument({ data: buf, isEvalSupported: false, useSystemFonts: true }).promise;
  } catch (e) {
    if (/password/i.test(e?.message || '')) return { pages: [], total: 0, rendered: 0, encrypted: true };
    throw new Error('Не смог открыть PDF: ' + (e?.message || 'файл повреждён'));
  }

  const total = doc.numPages;
  const take = Math.min(total, MAX_PAGES);
  const pages = [];
  const base = (file.name || 'документ').replace(/\.pdf$/i, '');

  const failed = [];
  for (let n = 1; n <= take; n++) {
    const canvas = document.createElement('canvas');
    try {
      const page = await doc.getPage(n);
      const first = page.getViewport({ scale: 1 });
      const scale = Math.min(2, Math.max(1, TARGET_W / first.width));
      const viewport = page.getViewport({ scale });

      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      // бланки часто с прозрачным фоном — подкладываем белый, иначе текст утонет
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      /* intent:'print' — важнее, чем кажется. При обычном режиме pdf.js рисует
         страницу по кадрам экрана, а свёрнутое приложение кадров не получает:
         разбор PDF замирал навсегда, стоило человеку выйти из Телеграма.
         В печатном режиме рендер идёт сам по себе и в фоне доходит до конца. */
      await withTimeout(
        page.render({ canvasContext: ctx, viewport, intent: 'print', background: '#fff' }).promise,
        PAGE_TIMEOUT, `страница ${n}: рендер занял слишком долго`);

      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.82));
      if (blob) {
        pages.push(new File([blob], `${base}-стр${n}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified }));
      }
      page.cleanup();
    } catch (e) {
      failed.push({ page: n, error: e?.message || 'страница не нарисовалась' });
    }
    canvas.width = canvas.height = 0;
    onPage?.(n, take);
  }

  try { await doc.destroy(); } catch {}
  if (!pages.length && failed.length) throw new Error(failed[0].error);
  return { pages, total, rendered: pages.length, encrypted: false, failed };
}
