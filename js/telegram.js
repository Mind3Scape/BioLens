/* Обвязка Telegram Mini App.
   Приложение обязано работать и без Телеграма — здесь всё «если есть, то используем». */

const api = () => window.Telegram?.WebApp || null;

/* Проверка именно функцией: скрипт Телеграма может подгрузиться позже нас,
   и «замороженная» константа навсегда решила бы, что мы в обычном браузере. */
export function inTelegram() {
  const t = api();
  return !!(t && t.initData !== undefined && t.platform && t.platform !== 'unknown');
}

export function initTelegram({ onBack, onThemeChange } = {}) {
  const tg = api();
  if (!tg) return { inTelegram: false };

  try { tg.ready(); } catch {}
  try { tg.expand(); } catch {}
  try { tg.disableVerticalSwipes?.(); } catch {}
  try { tg.setHeaderColor?.(tg.colorScheme === 'dark' ? '#0B0C0F' : '#F1F2F5'); } catch {}
  try { tg.setBackgroundColor?.(tg.colorScheme === 'dark' ? '#0B0C0F' : '#F1F2F5'); } catch {}

  // высота: Telegram отдаёт свою, иначе на iOS низ уезжает под клавиатуру и панель
  const applyHeight = () => {
    const h = tg.viewportStableHeight || tg.viewportHeight;
    if (h) document.documentElement.style.setProperty('--tg-height', h + 'px');
  };
  applyHeight();
  tg.onEvent?.('viewportChanged', applyHeight);
  tg.onEvent?.('themeChanged', () => onThemeChange?.(tg.colorScheme));

  if (onBack) {
    tg.BackButton?.onClick?.(() => onBack());
  }

  document.documentElement.classList.add('tg');
  return { inTelegram: true, colorScheme: tg.colorScheme, user: tg.initDataUnsafe?.user || null };
}

export function setBackButton(visible) {
  const tg = api();
  if (!tg?.BackButton) return;
  try { visible ? tg.BackButton.show() : tg.BackButton.hide(); } catch {}
}

export function haptic(kind = 'light') {
  const tg = api();
  if (!tg?.HapticFeedback) return;
  try {
    if (kind === 'success' || kind === 'error' || kind === 'warning') tg.HapticFeedback.notificationOccurred(kind);
    else tg.HapticFeedback.impactOccurred(kind);
  } catch {}
}

export function tgTheme() {
  return api()?.colorScheme || null;
}

export function tgUserName() {
  const u = api()?.initDataUnsafe?.user;
  return u ? (u.first_name || u.username || null) : null;
}

/* Облако Телеграма: ключ и выбор модели переживают переустановку приложения
   и переезжают на другое устройство. Сами анализы туда НЕ уходят — они тяжёлые и приватные. */
export function cloudGet(key) {
  return new Promise((res) => {
    const tg = api();
    if (!tg?.CloudStorage) return res(null);
    try { tg.CloudStorage.getItem(key, (err, val) => res(err ? null : (val || null))); }
    catch { res(null); }
  });
}
export function cloudSet(key, value) {
  return new Promise((res) => {
    const tg = api();
    if (!tg?.CloudStorage) return res(false);
    try { tg.CloudStorage.setItem(key, String(value), (err) => res(!err)); }
    catch { res(false); }
  });
}

export function cloudGetMany(keys) {
  return new Promise((res) => {
    const tg = api();
    if (!tg?.CloudStorage) return res({});
    try { tg.CloudStorage.getItems(keys, (err, vals) => res(err ? {} : (vals || {}))); }
    catch { res({}); }
  });
}
export function cloudKeys() {
  return new Promise((res) => {
    const tg = api();
    if (!tg?.CloudStorage) return res([]);
    try { tg.CloudStorage.getKeys((err, keys) => res(err ? [] : (keys || []))); }
    catch { res([]); }
  });
}
export function cloudRemove(keys) {
  return new Promise((res) => {
    const tg = api();
    if (!tg?.CloudStorage) return res(false);
    try { tg.CloudStorage.removeItems(keys, (err) => res(!err)); }
    catch { res(false); }
  });
}

export function tgUser() {
  return api()?.initDataUnsafe?.user || null;
}

/* Скачивание файла: в Телеграме обычная ссылка-download часто не срабатывает */
export function downloadViaTelegram(url, fileName) {
  const tg = api();
  if (!tg?.downloadFile) return false;
  try { tg.downloadFile({ url, file_name: fileName }); return true; }
  catch { return false; }
}

/* Камера. В Телеграме getUserMedia доступен не везде, поэтому есть запасной путь —
   системная камера через input capture: снимок один, зато работает всегда. */
export function nativeCameraFile() {
  return new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.capture = 'environment';
    inp.onchange = () => res(inp.files?.[0] || null);
    inp.click();
  });
}

export async function canUseStreamCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  // в мобильном Телеграме поток часто запрещён политикой WebView — проверяем разрешением
  try {
    const st = await navigator.permissions?.query?.({ name: 'camera' });
    if (st && st.state === 'denied') return false;
  } catch {}
  return true;
}
