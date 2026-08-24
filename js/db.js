/* BioLens — локальное хранилище.
   Всё живёт в браузере: IndexedDB для документов/замеров/еды, localStorage для настроек.
   Наружу уходит только то, что ты сам отправляешь в модель OpenRouter. */

const DB_NAME = 'biolens';
const DB_VER = 2;   // 2 — появились курсы лечения (meds) и отметки приёма (intakes)

let _db = null;

export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, DB_VER);
    rq.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('docs')) {
        const s = db.createObjectStore('docs', { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('status', 'status');
        s.createIndex('profile', 'profile');
      }
      if (!db.objectStoreNames.contains('meas')) {
        const s = db.createObjectStore('meas', { keyPath: 'id' });
        s.createIndex('key', 'key');
        s.createIndex('docId', 'docId');
        s.createIndex('date', 'date');
        s.createIndex('profile', 'profile');
      }
      if (!db.objectStoreNames.contains('meals')) {
        const s = db.createObjectStore('meals', { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('profile', 'profile');
      }
      if (!db.objectStoreNames.contains('chat')) {
        const s = db.createObjectStore('chat', { keyPath: 'id' });
        s.createIndex('ts', 'ts');
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'id' });
      }
      /* Лечение. Курс — что назначено, отметка — что человек принял.
         Разными хранилищами: отметок за месяц набегает под сотню, и они
         не должны переписываться вместе с курсом. */
      if (!db.objectStoreNames.contains('meds')) {
        const s = db.createObjectStore('meds', { keyPath: 'id' });
        s.createIndex('docId', 'docId');
        s.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains('intakes')) {
        const s = db.createObjectStore('intakes', { keyPath: 'id' });
        s.createIndex('medId', 'medId');
        s.createIndex('date', 'date');
      }
    };
    rq.onsuccess = () => { _db = rq.result; res(_db); };
    rq.onerror = () => rej(rq.error);
    /* Открытая в другой вкладке старая версия не даёт обновить схему.
       Без этой ветки приложение молча висело бы на белом экране. */
    rq.onblocked = () => rej(new Error('BioLens открыт в другой вкладке — закрой её и обнови эту'));
  });
}

/* Браузер вправе вытеснить хранилище, когда на телефоне кончается место, —
   и архив здоровья исчезнет без предупреждения. Просим отметить его как
   постоянное: в Телеграме и на Android это обычно даётся молча. */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}

export async function storageInfo() {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est) return null;
    return {
      usedMb: Math.round((est.usage || 0) / 1048576 * 10) / 10,
      quotaMb: Math.round((est.quota || 0) / 1048576),
      persisted: await navigator.storage.persisted?.().catch(() => null),
    };
  } catch { return null; }
}

function tx(store, mode = 'readonly') {
  return open().then(db => db.transaction(store, mode).objectStore(store));
}

const wrap = (rq) => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });

export const put = (store, val) => tx(store, 'readwrite').then(s => wrap(s.put(val)));
export const get = (store, id) => tx(store).then(s => wrap(s.get(id)));
export const del = (store, id) => tx(store, 'readwrite').then(s => wrap(s.delete(id)));
export const all = (store) => tx(store).then(s => wrap(s.getAll()));
export const byIndex = (store, index, value) => tx(store).then(s => wrap(s.index(index).getAll(value)));
export const clearStore = (store) => tx(store, 'readwrite').then(s => wrap(s.clear()));

export function uid(prefix = 'i') {
  return prefix + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/* ── картинки ───────────────────────────────────────────────── */

export async function putBlob(id, blob) {
  await put('blobs', { id, blob });
  return id;
}
export async function getBlobUrl(id) {
  const r = await get('blobs', id);
  if (!r || !r.blob) return null;
  return URL.createObjectURL(r.blob);
}
export async function getBlobDataUrl(id) {
  const r = await get('blobs', id);
  if (!r || !r.blob) return null;
  return blobToDataUrl(r.blob);
}
export function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

/* Сжатие: длинная сторона <= max, jpeg. Бланки читаются и в 1600px,
   а трафик и деньги за токены картинки экономятся заметно. */
export async function shrinkImage(file, max = 1600, quality = 0.85) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  let { width, height } = bitmap;
  const scale = Math.min(1, max / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const cv = document.createElement('canvas');
  cv.width = width; cv.height = height;
  cv.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', quality));
  return blob || file;
}

/* ── настройки (localStorage: маленькие, синхронные) ─────────── */

const SKEY = 'biolens.settings';
const defaults = {
  apiKey: '',
  modelVision: 'stealth/ox-alpha',   // бесплатная, видит картинки, окно на миллион токенов
  modelChat: 'stealth/ox-alpha',
  profileName: 'Я',
  sex: 'm',
  sexSet: false,     // пол не выбран явно: подставлять мужские нормы молча нельзя
  birthYear: 1988,
  heightCm: 182,
  weightKg: 79,
  onboarded: false,
  units: {},          // ключ показателя → предпочтительная единица
  theme: 'light',   // светлая по умолчанию; тёмную включают руками
  lastModelsFetch: 0,
  autoCloud: true,          // копия «скелета» в облако Телеграма
  lastCloudBackup: null,
  cloudBytes: 0,
  tgUserId: null,
  themeMigrated: 0,
  modelMigrated: 0,
};

/* модели, которые стояли по умолчанию в прошлых сборках */
const WAS_DEFAULT = ['', 'google/gemini-2.5-flash'];

export function settings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SKEY) || '{}');
    // разовый переезд: раньше темой правил Телеграм, теперь по умолчанию светлая
    let touched = false;
    if (saved.theme === 'auto' && !saved.themeMigrated) {
      saved.theme = 'light'; saved.themeMigrated = 1; touched = true;
    }
    /* Разовый переезд на бесплатную модель с окном в миллион токенов.
       Переселяем только тех, у кого стояла модель по умолчанию: если человек
       выбрал модель руками, его выбор чужой и трогать его нельзя. */
    if (!saved.modelMigrated) {
      if (WAS_DEFAULT.includes(saved.modelVision || '')) saved.modelVision = defaults.modelVision;
      if (WAS_DEFAULT.includes(saved.modelChat || '')) saved.modelChat = defaults.modelChat;
      saved.modelMigrated = 1; touched = true;
    }
    if (!saved.modelVision) { saved.modelVision = defaults.modelVision; touched = true; }
    if (!saved.modelChat) { saved.modelChat = defaults.modelChat; touched = true; }
    if (touched) localStorage.setItem(SKEY, JSON.stringify(saved));
    return { ...defaults, ...saved };
  } catch { return { ...defaults }; }
}
export function saveSettings(patch) {
  const s = { ...settings(), ...patch };
  localStorage.setItem(SKEY, JSON.stringify(s));
  return s;
}

/* кэш списка моделей, чтобы не дёргать сеть на каждый вход */
export function cachedModels() {
  try { return JSON.parse(localStorage.getItem('biolens.models') || 'null'); } catch { return null; }
}
export function cacheModels(list) {
  localStorage.setItem('biolens.models', JSON.stringify(list));
  saveSettings({ lastModelsFetch: Date.now() });
}

/* ── выгрузка и полное удаление ──────────────────────────────── */

export async function exportAll() {
  const [docs, meas, meals, meds, intakes] = await Promise.all(
    [all('docs'), all('meas'), all('meals'), all('meds'), all('intakes')]);
  // ключ OpenRouter в выгрузку не кладём: файл человек может кому-то переслать
  const { apiKey, ...profile } = settings();
  return {
    exportedAt: new Date().toISOString(),
    profile,
    docs: docs.map(d => ({ ...d })),
    measurements: meas,
    meals: meals.map(m => ({ ...m })),
    meds, intakes,
  };
}

export async function wipeAll() {
  await Promise.all(['docs', 'meas', 'meals', 'chat', 'blobs', 'meds', 'intakes'].map(clearStore));
  localStorage.removeItem('biolens.models');
  localStorage.removeItem(SKEY);
}
