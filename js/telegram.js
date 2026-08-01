/* Обвязка Telegram Mini App.
   Приложение обязано работать и без Телеграма — здесь всё «если есть, то используем». */

const tg = window.Telegram?.WebApp || null;

export const inTelegram = !!(tg && tg.initData !== undefined && tg.platform && tg.platform !== 'unknown');

export function initTelegram({ onBack, onThemeChange } = {}) {
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
  if (!tg?.BackButton) return;
  try { visible ? tg.BackButton.show() : tg.BackButton.hide(); } catch {}
}

export function haptic(kind = 'light') {
  if (!tg?.HapticFeedback) return;
  try {
    if (kind === 'success' || kind === 'error' || kind === 'warning') tg.HapticFeedback.notificationOccurred(kind);
    else tg.HapticFeedback.impactOccurred(kind);
  } catch {}
}

export function tgTheme() {
  return tg?.colorScheme || null;
}

export function tgUserName() {
  const u = tg?.initDataUnsafe?.user;
  return u ? (u.first_name || u.username || null) : null;
}

/* Облако Телеграма: ключ и выбор модели переживают переустановку приложения
   и переезжают на другое устройство. Сами анализы туда НЕ уходят — они тяжёлые и приватные. */
export function cloudGet(key) {
  return new Promise((res) => {
    if (!tg?.CloudStorage) return res(null);
    try { tg.CloudStorage.getItem(key, (err, val) => res(err ? null : (val || null))); }
    catch { res(null); }
  });
}
export function cloudSet(key, value) {
  return new Promise((res) => {
    if (!tg?.CloudStorage) return res(false);
    try { tg.CloudStorage.setItem(key, String(value), (err) => res(!err)); }
    catch { res(false); }
  });
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
