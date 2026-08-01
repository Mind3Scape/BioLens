/* Память архива.

   Три уровня, от самого надёжного к самому полному:
   1. Устройство — IndexedDB. Быстро, но живёт ровно до чистки кэша Телеграма.
   2. Облако Телеграма — автоматическая копия «скелета»: числа, даты, лаборатории,
      еда. Переезжает на любое устройство с тем же аккаунтом. Оригиналы снимков
      туда не влезают (лимит около 4 МБ), и мы об этом честно говорим.
   3. Файл — полная копия вместе со снимками, руками, когда захочешь.  */

import * as db from './db.js';
import * as S from './store.js';
import * as TG from './telegram.js';

const CHUNK = 3800;          // запас к лимиту Телеграма в 4096 символов на ключ
const MAX_CHUNKS = 900;      // ключей всего 1024, оставляем место настройкам
const KEY_META = 'bk_meta';
const keyOf = (i) => 'bk_' + i;

/* ── что кладём в облако ───────────────────────────────────── */

function skeleton() {
  const s = db.settings();
  return {
    v: 1,
    at: new Date().toISOString(),
    uid: TG.tgUser()?.id || null,
    profile: { sex: s.sex, birthYear: s.birthYear, heightCm: s.heightCm, weightKg: s.weightKg },
    docs: S.state.docs.filter(d => !d.demo).map(d => ({
      i: d.id, t: d.title, y: d.date, k: d.type, l: d.lab, s: d.status,
      c: d.conclusion || null, n: d.note || null, f: d.fileName || null, m: d.markersCount || 0,
      fd: d.fileDate || null, pn: d.patientName || null, sg: d.markerSig || null,
      pdf: d.isPdf ? 1 : 0, pc: d.pageCount || 0,
    })),
    meas: S.state.meas.filter(m => !m.demo).map(m => ({
      i: m.id, d: m.docId, k: m.key, t: m.title, r: m.nameRaw,
      v: m.value, u: m.unit, rv: m.rawValue, ru: m.rawUnit, cv: m.converted ? 1 : 0,
      lo: m.refLow, hi: m.refHigh, rs: m.refSource, y: m.date, l: m.lab,
      c: m.confidence, ok: m.confirmed ? 1 : 0,
    })),
    meals: S.state.meals.filter(x => !x.demo).map(x => ({
      i: x.id, a: x.at, y: x.date, t: x.title, n: x.nutrition, it: x.items, mi: x.micros, cf: x.confidence,
    })),
  };
}

function restoreSkeleton(data) {
  const docs = (data.docs || []).map(d => ({
    id: d.i, blobId: null, pages: [], fileName: d.f, addedAt: data.at, fileDate: d.fd || null,
    /* Статусы, требующие работы очереди, при восстановлении не воскрешаем:
       файла на этом устройстве нет, и разбор упал бы с невнятной ошибкой. */
    status: ['queued', 'reading', 'error'].includes(d.s) ? 'needs-file' : (d.s || 'ready'),
    type: d.k, title: d.t, date: d.y, dateConfidence: 1,
    lab: d.l, conclusion: d.c, note: d.n, markersCount: d.m, imageLost: true,
    patientName: d.pn || null, markerSig: d.sg || null,
    isPdf: !!d.pdf, pageCount: d.pc || 0, raw: d.raw || null,
  }));
  const meas = (data.meas || []).map(m => ({
    id: m.i, docId: m.d, key: m.k, title: m.t, nameRaw: m.r,
    value: m.v, unit: m.u, rawValue: m.rv, rawUnit: m.ru, converted: !!m.cv,
    refLow: m.lo ?? null, refHigh: m.hi ?? null, refSource: m.rs,
    date: m.y, lab: m.l, confidence: m.c ?? 1, confirmed: !!m.ok,
  }));
  const meals = (data.meals || []).map(x => ({
    id: x.i, blobId: null, at: x.a, date: x.y, status: 'ready',
    title: x.t, nutrition: x.n, items: x.it || [], micros: x.mi || [], confidence: x.cf, imageLost: true,
  }));
  return { docs, meas, meals };
}

/* ── облако Телеграма ──────────────────────────────────────── */

/* Запись идёт в ДВА поколения по очереди: пока пишется новое, старое остаётся
   целым. Мета переключается последним действием и только после проверки —
   раньше обрыв в середине уничтожал прошлую копию, а непрошедшая запись меты
   давала бодрое «Копия сохранена» при нечитаемом архиве. */
export async function saveToCloud() {
  if (!TG.inTelegram()) return { ok: false, reason: 'нет Телеграма' };
  const data = skeleton();
  const json = JSON.stringify(data);
  const chunks = [];
  for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK));
  if (chunks.length > MAX_CHUNKS) {
    return { ok: false, reason: 'архив перерос облако Телеграма — сохрани копию файлом' };
  }

  const prev = await cloudInfo();
  const gen = prev?.g === 'b' ? 'a' : 'b';        // пишем в свободное поколение
  const key = (i) => `bk${gen}_${i}`;

  for (let i = 0; i < chunks.length; i++) {
    if (!await TG.cloudSet(key(i), chunks[i])) {
      return { ok: false, reason: 'облако Телеграма не приняло копию — прошлая копия цела' };
    }
  }
  const meta = {
    g: gen, n: chunks.length, at: data.at, len: json.length,
    docs: data.docs.length, meas: data.meas.length, meals: data.meals.length,
  };
  if (!await TG.cloudSet(KEY_META, JSON.stringify(meta))) {
    return { ok: false, reason: 'облако не приняло опись копии — прошлая копия цела' };
  }

  // теперь можно убрать прошлое поколение и хвост старого формата
  const keys = await TG.cloudKeys();
  const stale = keys.filter(k => k !== KEY_META && (
    k.startsWith('bk_') ||
    (k.startsWith(`bk${gen === 'a' ? 'b' : 'a'}_`)) ||
    (k.startsWith(`bk${gen}_`) && +k.slice(4) >= chunks.length)
  ));
  if (stale.length) await TG.cloudRemove(stale);

  db.saveSettings({ lastCloudBackup: data.at, cloudBytes: json.length });
  return { ok: true, at: data.at, bytes: json.length };
}

export async function cloudInfo() {
  if (!TG.inTelegram()) return null;
  const raw = await TG.cloudGet(KEY_META);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function loadFromCloud() {
  const meta = await cloudInfo();
  if (!meta?.n) return null;
  const keys = Array.from({ length: meta.n }, (_, i) => meta.g ? `bk${meta.g}_${i}` : keyOf(i));
  const parts = [];
  // getItems берёт пачками, не будем испытывать лимиты — по 20 ключей
  for (let i = 0; i < keys.length; i += 20) {
    const got = await TG.cloudGetMany(keys.slice(i, i + 20));
    for (const k of keys.slice(i, i + 20)) {
      if (got[k] == null || got[k] === '') return null;   // дырка в копии — лучше честно ничего
      parts.push(got[k]);
    }
  }
  const text = parts.join('');
  if (meta.len && text.length !== meta.len) return null;   // копия неполная
  try { return JSON.parse(text); } catch { return null; }
}

export async function restoreFromCloud() {
  const data = await loadFromCloud();
  if (!data) return { ok: false, reason: 'в облаке пусто' };
  const { docs, meas, meals } = restoreSkeleton(data);

  const haveDocs = new Set(S.state.docs.map(d => d.id));
  const haveMeas = new Set(S.state.meas.map(m => m.id));
  const haveMeals = new Set(S.state.meals.map(m => m.id));

  for (const d of docs) if (!haveDocs.has(d.id)) await db.put('docs', d);
  for (const m of meas) if (!haveMeas.has(m.id)) await db.put('meas', m);
  for (const m of meals) if (!haveMeals.has(m.id)) await db.put('meals', m);

  if (data.profile) db.saveSettings(data.profile);
  await S.loadAll();
  return { ok: true, docs: docs.length, meas: meas.length, meals: meals.length, at: data.at };
}

export async function forgetCloud() {
  const keys = await TG.cloudKeys();
  const mine = keys.filter(k => /^bk[ab]?_/.test(k) || k === KEY_META);
  if (mine.length) await TG.cloudRemove(mine);
  db.saveSettings({ lastCloudBackup: null, cloudBytes: 0 });
}

/* Автосохранение: собираем изменения и пишем в облако не чаще раза в 5 секунд. */
let timer = null, pending = false;
export function scheduleCloudSave() {
  if (!TG.inTelegram()) return;
  pending = true;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!pending) return;
    pending = false;
    await saveToCloud();
  }, 5000);
}

/* ── файл: полная копия, со снимками ───────────────────────── */

export async function exportFile({ withImages = true } = {}) {
  const data = skeleton();
  data.full = withImages;
  // ответ модели нужен, чтобы «Это мои анализы» работало и после переезда
  const rawById = new Map(S.state.docs.filter(d => !d.demo && d.raw).map(d => [d.id, d.raw]));
  for (const d of data.docs) if (rawById.has(d.i)) d.raw = rawById.get(d.i);
  if (withImages) {
    data.images = {};
    /* Раньше сохранялась только первая страница: у лабораторной выписки на
       12 страниц «полная копия со снимками» тихо теряла одиннадцать. */
    for (const d of S.state.docs.filter(x => !x.demo)) {
      const pages = (d.pages && d.pages.length) ? d.pages : (d.blobId ? [d.blobId] : []);
      const urls = [];
      for (const b of pages) {
        const url = await db.getBlobDataUrl(b);
        if (url) urls.push(url);
      }
      if (urls.length) data.images[d.id] = urls;
    }
    for (const m of S.state.meals.filter(x => !x.demo && x.blobId)) {
      const url = await db.getBlobDataUrl(m.blobId);
      if (url) data.images['meal:' + m.id] = url;
    }
  }
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const name = `biolens-${new Date().toISOString().slice(0, 10)}.json`;
  return { blob, name, size: blob.size };
}

export async function importFile(file) {
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, reason: 'файл не читается' }; }
  if (!data.meas && !data.docs) return { ok: false, reason: 'это не копия BioLens' };

  const { docs, meas, meals } = restoreSkeleton(data);
  const images = data.images || {};

  const haveDocs = new Set(S.state.docs.map(d => d.id));
  const haveMeas = new Set(S.state.meas.map(m => m.id));
  const haveMeals = new Set(S.state.meals.map(m => m.id));

  for (const d of docs) {
    if (haveDocs.has(d.id)) continue;
    const shots = images[d.id] ? (Array.isArray(images[d.id]) ? images[d.id] : [images[d.id]]) : [];
    for (const url of shots) {
      const blob = await (await fetch(url)).blob();
      const id = db.uid('b');
      await db.putBlob(id, blob);
      d.pages.push(id);
    }
    if (d.pages.length) { d.blobId = d.pages[0]; d.imageLost = false; }
    if (d.status === 'needs-file' && d.pages.length) d.status = 'queued';
    await db.put('docs', d);
  }
  for (const m of meas) if (!haveMeas.has(m.id)) await db.put('meas', m);
  for (const m of meals) {
    if (haveMeals.has(m.id)) continue;
    const img = images['meal:' + m.id];
    if (img) {
      const blob = await (await fetch(img)).blob();
      m.blobId = db.uid('b');
      await db.putBlob(m.blobId, blob);
      m.imageLost = false;
    }
    await db.put('meals', m);
  }
  if (data.profile) db.saveSettings(data.profile);
  await S.loadAll();
  return { ok: true, docs: docs.length, meas: meas.length, meals: meals.length, withImages: !!data.images };
}
