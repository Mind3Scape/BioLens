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
      fd: d.fileDate || null,
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
    id: d.i, blobId: null, fileName: d.f, addedAt: data.at, fileDate: d.fd || null,
    status: d.s || 'ready', type: d.k, title: d.t, date: d.y, dateConfidence: 1,
    lab: d.l, conclusion: d.c, note: d.n, markersCount: d.m, imageLost: true,
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

export async function saveToCloud() {
  if (!TG.inTelegram()) return { ok: false, reason: 'нет Телеграма' };
  const data = skeleton();
  const json = JSON.stringify(data);
  const chunks = [];
  for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK));
  if (chunks.length > MAX_CHUNKS) {
    return { ok: false, reason: 'архив перерос облако Телеграма — сохрани копию файлом' };
  }

  for (let i = 0; i < chunks.length; i++) {
    const ok = await TG.cloudSet(keyOf(i), chunks[i]);
    if (!ok) return { ok: false, reason: 'облако Телеграма не приняло копию' };
  }
  await TG.cloudSet(KEY_META, JSON.stringify({
    n: chunks.length, at: data.at, docs: data.docs.length, meas: data.meas.length, meals: data.meals.length,
  }));

  // подчистить хвост прошлой, более длинной копии
  const keys = await TG.cloudKeys();
  const stale = keys.filter(k => k.startsWith('bk_') && k !== KEY_META && +k.slice(3) >= chunks.length);
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
  const keys = Array.from({ length: meta.n }, (_, i) => keyOf(i));
  const parts = [];
  // getItems берёт пачками, не будем испытывать лимиты — по 20 ключей
  for (let i = 0; i < keys.length; i += 20) {
    const got = await TG.cloudGetMany(keys.slice(i, i + 20));
    for (const k of keys.slice(i, i + 20)) parts.push(got[k] || '');
  }
  try { return JSON.parse(parts.join('')); } catch { return null; }
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
  const mine = keys.filter(k => k.startsWith('bk_'));
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
  if (withImages) {
    data.images = {};
    for (const d of S.state.docs.filter(x => !x.demo && x.blobId)) {
      const url = await db.getBlobDataUrl(d.blobId);
      if (url) data.images[d.id] = url;
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
    if (images[d.id]) {
      const blob = await (await fetch(images[d.id])).blob();
      d.blobId = db.uid('b');
      await db.putBlob(d.blobId, blob);
      d.imageLost = false;
    }
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
