/* Доменный слой: документы → замеры → линии показателей.
   Здесь же — сборка контекста для ИИ и связка «анализы ↔ еда». */

import * as db from './db.js';
import { matchMarker, toCanonical, defaultRef, markerTitle, markerUnit, markerGroup, statusOf, MARKERS, RCV, RECHECK } from './markers.js';
import { analyzeDocument, analyzeMeal } from './openrouter.js';
import { isPdf, pdfToImages } from './pdfdoc.js';

export const state = {
  docs: [], meas: [], meals: [],
  queue: { total: 0, done: 0, running: false, errors: [] },
};

export async function loadAll() {
  const [docs, meas, meals] = await Promise.all([db.all('docs'), db.all('meas'), db.all('meals')]);
  state.docs = docs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  state.meas = meas;
  state.meals = meals.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  return state;
}

/* ── приём файлов ────────────────────────────────────────────── */

export async function addFiles(files, { onProgress } = {}) {
  const added = [];
  for (const f of files) {
    const pdf = isPdf(f);
    if (!pdf && !f.type.startsWith('image/')) continue;

    const fileDate = f.lastModified ? new Date(f.lastModified).toISOString().slice(0, 10) : null;
    const base = {
      id: db.uid('d'), fileName: f.name || (pdf ? 'документ.pdf' : 'снимок'),
      addedAt: new Date().toISOString(), fileDate,
      status: 'queued', type: null, title: null, date: null, dateConfidence: 0,
      lab: null, conclusion: null, note: null, error: null, model: null,
    };

    if (pdf) {
      // PDF разбираем на страницы прямо здесь: модель читает картинки, а не файлы
      let res;
      try {
        onProgress?.({ file: base.fileName, stage: 'pdf' });
        res = await pdfToImages(f, { onPage: (n, total) => onProgress?.({ file: base.fileName, stage: 'pdf', page: n, total }) });
      } catch (e) {
        base.status = 'error';
        base.error = e.message || 'не смог открыть PDF';
        base.isPdf = true;
        await db.put('docs', base);
        state.docs.unshift(base);
        added.push(base);
        continue;
      }
      if (res.encrypted) {
        base.status = 'error';
        base.error = 'PDF под паролем — сними защиту и загрузи снова';
        base.isPdf = true;
        await db.put('docs', base);
        state.docs.unshift(base);
        added.push(base);
        continue;
      }

      const pageIds = [];
      for (const page of res.pages) {
        const id = db.uid('b');
        await db.putBlob(id, page);
        pageIds.push(id);
      }
      base.isPdf = true;
      base.pages = pageIds;
      base.blobId = pageIds[0] || null;
      base.pageCount = res.total;
      base.pagesSkipped = Math.max(0, res.total - res.rendered);
    } else {
      const blobId = db.uid('b');
      await db.putBlob(blobId, await db.shrinkImage(f));
      base.blobId = blobId;
      base.pages = [blobId];
    }

    await db.put('docs', base);
    state.docs.unshift(base);
    added.push(base);
  }
  return added;
}

/* Разбор очереди. onTick(doc, index) — чтобы экран показывал живой прогресс. */
export async function processQueue(onTick, { model } = {}) {
  // разбираем в том порядке, в каком человек их добавил
  const queued = state.docs
    .filter(d => d.status === 'queued' || d.status === 'error')
    .sort((a, b) => (a.addedAt || '').localeCompare(b.addedAt || ''));
  state.queue = { total: queued.length, done: 0, running: true, errors: [] };
  for (const doc of queued) {
    try {
      doc.status = 'reading';
      onTick?.(doc);
      const pages = (doc.pages && doc.pages.length) ? doc.pages : [doc.blobId];
      const results = [];
      const pageErrors = [];
      let usedModel = null;
      for (let i = 0; i < pages.length; i++) {
        doc.readingPage = pages.length > 1 ? { n: i + 1, of: pages.length } : null;
        onTick?.(doc);
        const dataUrl = await db.getBlobDataUrl(pages[i]);
        if (!dataUrl) continue;
        try {
          const { data, modelUsed } = await analyzeDocument(dataUrl, { model });
          usedModel = modelUsed || usedModel;
          results.push(data);
        } catch (e) {
          // одна страница не должна хоронить весь документ
          pageErrors.push({ page: i + 1, error: e.message || String(e) });
        }
        if (i < pages.length - 1) await new Promise(r => setTimeout(r, 400));  // не давим на лимиты модели
      }
      doc.readingPage = null;
      if (!results.length) throw new Error(pageErrors[0]?.error || 'модель ничего не вернула');
      doc.pageErrors = pageErrors.length ? pageErrors : null;
      doc.pagesRead = results.length;
      await applyDocResult(doc, results.length > 1 ? mergePages(results) : results[0], usedModel);
    } catch (e) {
      doc.status = 'error';
      doc.error = e.message || String(e);
      state.queue.errors.push({ id: doc.id, error: doc.error });
      await db.put('docs', doc);
    }
    state.queue.done++;
    onTick?.(doc);
  }
  state.queue.running = false;
  onTick?.(null);
  return state.queue;
}

async function applyDocResult(doc, data, modelUsed) {
  doc.model = modelUsed || null;
  doc.raw = data;

  if (data.is_medical === false) {
    doc.status = 'skipped';
    doc.title = 'Не медицинский документ';
    doc.note = 'Похоже, это не бланк и не снимок — ничего не сохранил';
    await db.put('docs', doc);
    return;
  }

  doc.type = data.doc_type || 'other';
  doc.title = data.title || 'Документ';
  doc.lab = data.lab || null;
  doc.conclusion = data.conclusion || null;
  doc.note = data.note || null;
  doc.patientName = data.patient_name || null;
  doc.dateConfidence = Number(data.date_confidence ?? 0);

  let date = normDate(data.date);
  if (!date) { doc.status = 'needs-date'; doc.date = null; }
  else { doc.date = date; doc.status = 'ready'; }

  // дубль: тот же тип, та же дата, столько же показателей
  const dup = state.docs.find(d => d.id !== doc.id && d.date && d.date === doc.date && d.type === doc.type && d.status === 'ready');
  if (dup && (data.markers || []).length && dup.markersCount === (data.markers || []).length) {
    doc.status = 'duplicate';
    doc.duplicateOf = dup.id;
  }

  doc.markersCount = (data.markers || []).length;
  await db.put('docs', doc);

  // старые замеры этого документа стираем — перезалив должен быть чистым
  const old = await db.byIndex('meas', 'docId', doc.id);
  for (const m of old) await db.del('meas', m.id);
  state.meas = state.meas.filter(m => m.docId !== doc.id);

  if (doc.status === 'duplicate') return;

  const sex = db.settings().sex;
  /* Два разных названия из ОДНОГО бланка не могут быть одним показателем.
     Если словарь всё же свёл их вместе — второе останется отдельной строкой,
     иначе на графике появятся две точки в один день и выдуманная «динамика». */
  const takenKeys = new Map();
  for (const raw of (data.markers || [])) {
    if (raw.value == null || !isFinite(Number(raw.value))) continue;
    const hit = matchMarker(raw.name);
    let key = hit ? hit.key : ('raw:' + (raw.name || '').toLowerCase().trim());
    let collided = false;
    const rawName = (raw.name || '').trim();
    if (takenKeys.has(key) && takenKeys.get(key) !== rawName.toLowerCase()) {
      key = 'raw:' + rawName.toLowerCase();
      collided = true;
    } else {
      takenKeys.set(key, rawName.toLowerCase());
    }
    const conv = hit ? toCanonical(key, raw.value, raw.unit) : { value: Number(raw.value), unit: raw.unit || '', converted: false, factor: 1 };

    let refLow = raw.ref_low, refHigh = raw.ref_high;
    if (hit && conv.factor !== 1) {
      if (refLow != null) refLow = +(refLow * conv.factor).toFixed(4);
      if (refHigh != null) refHigh = +(refHigh * conv.factor).toFixed(4);
    }
    let refSource = (refLow != null || refHigh != null) ? 'бланк' : null;
    if (refLow == null && refHigh == null && hit) {
      const d = defaultRef(key, sex);
      if (d) { refLow = d[0]; refHigh = d[1]; refSource = 'типовая'; }
    }

    const rec = {
      id: db.uid('m'), docId: doc.id, key,
      nameRaw: raw.name || '', title: hit ? markerTitle(key) : (raw.name || ''),
      value: conv.value, unit: conv.unit || raw.unit || '',
      rawValue: Number(raw.value), rawUnit: raw.unit || '',
      converted: !!conv.converted, unknownUnit: !!conv.unknownUnit,
      refLow: refLow ?? null, refHigh: refHigh ?? null, refSource,
      date: doc.date, lab: doc.lab || null,
      confidence: Number(raw.confidence ?? 1), confirmed: Number(raw.confidence ?? 1) >= 0.75,
      matchExact: hit && !collided ? hit.exact : false,
      separated: collided,     // «не смешал с соседней строкой того же бланка»
    };
    await db.put('meas', rec);
    state.meas.push(rec);
  }
}

/* Одна выписка — один документ: собираем страницы в единый результат.
   Дату, лабораторию и название берём с первой страницы, где они вообще есть. */
function mergePages(pages) {
  const good = pages.filter(p => p && p.is_medical !== false);
  if (!good.length) return { is_medical: false };
  const first = (field) => good.map(p => p[field]).find(v => v != null && v !== '');
  const markers = [];
  const seen = new Set();
  for (const p of good) {
    for (const m of (p.markers || [])) {
      const key = `${(m.name || '').toLowerCase().trim()}|${m.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push(m);
    }
  }
  const conclusions = good.map(p => p.conclusion).filter(Boolean);
  return {
    is_medical: true,
    doc_type: first('doc_type') || 'other',
    title: first('title') || 'Документ',
    date: first('date') || null,
    date_confidence: Math.max(...good.map(p => Number(p.date_confidence || 0))),
    lab: first('lab') || null,
    patient_name: first('patient_name') || null,
    conclusion: conclusions.length ? [...new Set(conclusions)].join('\n\n') : null,
    note: good.map(p => p.note).filter(Boolean)[0] || null,
    markers,
  };
}

function normDate(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const y = String(s).match(/(19|20)\d{2}/);
  return y ? `${y[0]}-01-01` : null;
}

export async function setDocDate(docId, date) {
  const doc = state.docs.find(d => d.id === docId);
  if (!doc) return;
  doc.date = date; doc.status = 'ready'; doc.dateConfidence = 1;
  await db.put('docs', doc);
  const ms = await db.byIndex('meas', 'docId', docId);
  for (const m of ms) { m.date = date; await db.put('meas', m); }
  state.meas.forEach(m => { if (m.docId === docId) m.date = date; });
}

export async function fixMeasurement(measId, value) {
  const m = state.meas.find(x => x.id === measId);
  if (!m) return;
  m.value = Number(value); m.confidence = 1; m.confirmed = true; m.editedByHuman = true;
  await db.put('meas', m);
}

export async function confirmMeasurement(measId) {
  const m = state.meas.find(x => x.id === measId);
  if (!m) return;
  m.confidence = 1; m.confirmed = true;
  await db.put('meas', m);
}

export async function deleteDoc(docId) {
  const doc = state.docs.find(d => d.id === docId);
  const blobs = new Set([...(doc?.pages || []), doc?.blobId].filter(Boolean));
  for (const b of blobs) await db.del('blobs', b);
  const ms = await db.byIndex('meas', 'docId', docId);
  for (const m of ms) await db.del('meas', m.id);
  await db.del('docs', docId);
  state.docs = state.docs.filter(d => d.id !== docId);
  state.meas = state.meas.filter(m => m.docId !== docId);
}

/* Полный переразбор — например, после смены модели. */
export async function requeueAll() {
  for (const d of state.docs) {
    d.status = 'queued'; d.error = null;
    await db.put('docs', d);
  }
}

/* ── линии показателей ───────────────────────────────────────── */

export function seriesFor(key) {
  const list = state.meas
    .filter(m => m.key === key && m.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(m => ({ ...m, status: statusOf(m.value, m.refLow, m.refHigh) }));
  // помечаем замеры одной даты: это не динамика, а два измерения одного дня
  const byDate = {};
  for (const m of list) (byDate[m.date] ||= []).push(m);
  for (const m of list) m.sameDay = byDate[m.date].length > 1;
  return list;
}

/* Сколько в серии по-настоящему разных дней — по нему решаем, есть ли динамика вообще */
export function distinctDays(series) {
  return new Set(series.map(m => m.date)).size;
}

export function markerKeys() {
  return [...new Set(state.meas.map(m => m.key))];
}

/* Список для вкладки «Показатели»: сначала то, что вне нормы, потом ровное, потом протухшее. */
export function markerList() {
  const out = [];
  for (const key of markerKeys()) {
    const s = seriesFor(key);
    if (!s.length) continue;
    const last = s[s.length - 1];
    const prev = s.length > 1 ? s[s.length - 2] : null;
    const st = statusOf(last.value, last.refLow, last.refHigh);
    const daysOld = last.date ? Math.round((Date.now() - new Date(last.date)) / 86400000) : 9999;
    out.push({
      key,
      title: key.startsWith('raw:') ? last.title : markerTitle(key),
      unit: last.unit || markerUnit(key),
      group: key.startsWith('raw:') ? 'other' : markerGroup(key),
      count: s.length, last, prev, status: st, daysOld,
      stale: daysOld > 730,
      delta: prev ? +(last.value - prev.value).toFixed(2) : null,
      series: s,
    });
  }
  const rank = { out: 0, edge: 1, ok: 2, unknown: 3 };
  return out.sort((a, b) => {
    if (a.stale !== b.stale) return a.stale ? 1 : -1;
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return b.count - a.count;
  });
}

export function attentionList() { return markerList().filter(m => !m.stale && (m.status === 'out' || m.status === 'edge')); }

/* Что сдвинулось за последний год — для Сводки */
export function shifts(limit = 3) {
  const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  return markerList()
    .filter(m => m.count > 1 && m.last.date >= yearAgo)
    .map(m => {
      const past = m.series.filter(x => x.date < yearAgo);
      const base = past.length ? past[past.length - 1] : m.series[0];
      const change = base && base.value ? (m.last.value - base.value) / Math.abs(base.value) : 0;
      return { ...m, base, change };
    })
    .filter(m => Math.abs(m.change) > 0.08 || m.status !== 'ok')
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, limit);
}

/* Настоящее ли это изменение или разброс измерения.
   Возвращает {percent, significant, rcv} — rcv null, если для показателя данных нет. */
export function changeSignificance(key, from, to) {
  if (!isFinite(from) || !isFinite(to) || !from) return { percent: null, significant: null, rcv: null };
  const percent = ((to - from) / Math.abs(from)) * 100;
  const rcv = RCV[key] ?? null;
  return { percent, rcv, significant: rcv == null ? null : Math.abs(percent) >= rcv };
}

/* Что пора пересдать — сроки из рекомендаций, где они есть */
export function dueList() {
  return markerList().map(m => {
    const rule = RECHECK[m.key];
    const bad = m.status === 'out' || m.status === 'edge';
    const months = rule ? (bad ? rule.bad : rule.ok) : (bad ? 6 : 12);
    const every = months * 30;
    return { ...m, every, months, due: m.daysOld >= every, overdue: m.daysOld - every, fromGuideline: !!rule };
  }).filter(m => m.due).sort((a, b) => b.overdue - a.overdue);
}

/* Активная цель по питанию — из анализов. Питание влияет далеко не на всё,
   поэтому список показателей здесь намеренно короткий. */
const FOOD_LINKED = {
  ldl:               { goal: 'снизить ЛПНП', watch: ['sat_fat_g', 'fiber_g', 'cholesterol_mg'] },
  cholesterol_total: { goal: 'снизить общий холестерин', watch: ['sat_fat_g', 'fiber_g', 'cholesterol_mg'] },
  triglycerides:     { goal: 'снизить триглицериды', watch: ['sugar_g', 'carbs_g', 'kcal'] },
  glucose:           { goal: 'выровнять сахар', watch: ['sugar_g', 'carbs_g', 'fiber_g'] },
  hba1c:             { goal: 'выровнять сахар', watch: ['sugar_g', 'carbs_g', 'fiber_g'] },
  uric_acid:         { goal: 'снизить мочевую кислоту', watch: ['protein_g', 'sugar_g'] },
  ferritin:          { goal: 'поднять железо', watch: ['iron_rich'] },
  vitamin_d:         { goal: 'поднять витамин D', watch: [] },
};

export function foodGoal() {
  const cands = markerList().filter(m => FOOD_LINKED[m.key] && (m.status === 'out' || m.status === 'edge'));
  if (!cands.length) return null;
  const m = cands[0];
  const link = FOOD_LINKED[m.key];
  return {
    key: m.key, title: m.title, value: m.last.value, unit: m.unit,
    refLow: m.last.refLow, refHigh: m.last.refHigh, status: m.status,
    date: m.last.date, goal: link.goal, watch: link.watch,
    text: `${link.goal} (сейчас ${m.last.value} ${m.unit}, норма ${fmtRef(m.last)}, замер от ${ruDate(m.last.date)})`,
  };
}

/* ── еда ─────────────────────────────────────────────────────── */

export async function addMeal(file, { model } = {}) {
  const blobId = db.uid('b');
  const small = await db.shrinkImage(file, 1200, 0.82);
  await db.putBlob(blobId, small);
  const meal = {
    id: db.uid('f'), blobId, at: new Date().toISOString(), date: new Date().toISOString().slice(0, 10),
    status: 'reading', title: null, nutrition: null, items: [], note: null,
  };
  await db.put('meals', meal);
  state.meals.unshift(meal);

  try {
    const goal = foodGoal();
    const dataUrl = await db.getBlobDataUrl(blobId);
    const { data } = await analyzeMeal(dataUrl, { model, goalHint: goal?.text || '' });
    if (data.is_food === false) {
      meal.status = 'skipped'; meal.title = 'Это не еда';
    } else {
      meal.status = 'ready';
      meal.title = data.title || 'Блюдо';
      meal.items = data.items || [];
      meal.note = data.note || null;
      meal.confidence = Number(data.confidence ?? 0.6);
      meal.nutrition = {
        kcal: num(data.kcal), protein_g: num(data.protein_g), fat_g: num(data.fat_g),
        sat_fat_g: num(data.sat_fat_g), carbs_g: num(data.carbs_g), sugar_g: num(data.sugar_g),
        fiber_g: num(data.fiber_g), cholesterol_mg: num(data.cholesterol_mg), sodium_mg: num(data.sodium_mg),
      };
      meal.micros = data.micros || [];
    }
  } catch (e) {
    meal.status = 'error'; meal.error = e.message || String(e);
  }
  await db.put('meals', meal);
  return meal;
}

export async function deleteMeal(id) {
  const m = state.meals.find(x => x.id === id);
  if (m?.blobId) await db.del('blobs', m.blobId);
  await db.del('meals', id);
  state.meals = state.meals.filter(x => x.id !== id);
}

const num = (v) => { const n = Number(v); return isFinite(n) ? Math.round(n * 10) / 10 : 0; };

export function mealsOn(date) {
  return state.meals.filter(m => m.date === date && m.status === 'ready');
}

export function dayTotals(date) {
  const list = mealsOn(date);
  const t = { kcal: 0, protein_g: 0, fat_g: 0, sat_fat_g: 0, carbs_g: 0, sugar_g: 0, fiber_g: 0, cholesterol_mg: 0, sodium_mg: 0 };
  for (const m of list) for (const k of Object.keys(t)) t[k] += (m.nutrition?.[k] || 0);
  for (const k of Object.keys(t)) t[k] = Math.round(t[k] * 10) / 10;
  t.count = list.length;
  return t;
}

/* Ориентиры на день. Это не назначение, а общеизвестные дневные рамки,
   от которых удобно считать «много / мало». */
export function dayTargets() {
  const s = db.settings();
  const male = s.sex !== 'f';
  const kcal = male ? 2400 : 1900;
  return {
    kcal,
    fiber_g: male ? 30 : 25,
    sat_fat_g: Math.round(kcal * 0.07 / 9),   // <7% калорий — рамка при высоком ЛПНП
    sugar_g: male ? 36 : 25,
    sodium_mg: 2300,
    cholesterol_mg: 300,
    protein_g: Math.round((s.weightKg || 75) * 1.2),
  };
}

/* ── контекст для ИИ ─────────────────────────────────────────── */

export function buildContext({ maxMarkers = 40 } = {}) {
  const s = db.settings();
  const age = new Date().getFullYear() - (s.birthYear || 1990);
  const lines = [];
  lines.push(`Человек: ${s.sex === 'f' ? 'женщина' : 'мужчина'}, ${age} лет, рост ${s.heightCm} см, вес ${s.weightKg} кг.`);
  lines.push(`Документов в архиве: ${state.docs.filter(d => d.status === 'ready').length}. Показателей: ${markerKeys().length}.`);
  lines.push('');
  lines.push('ПОКАЗАТЕЛИ (последний замер и вся история):');
  for (const m of markerList().slice(0, maxMarkers)) {
    const hist = m.series.map(p => `${p.date}: ${p.value}`).join('; ');
    lines.push(`- ${m.title} [${m.unit}] норма ${fmtRef(m.last)} (${m.last.refSource || 'нет'}). Сейчас ${m.last.value} (${ruStatus(m.status)}), замеров ${m.count}. История: ${hist}`);
  }
  const concl = state.docs.filter(d => d.conclusion).slice(0, 8);
  if (concl.length) {
    lines.push('');
    lines.push('ЗАКЛЮЧЕНИЯ И СНИМКИ:');
    for (const d of concl) lines.push(`- ${d.date || 'без даты'} · ${d.title}: ${String(d.conclusion).slice(0, 300)}`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const t = dayTotals(today);
  if (t.count) {
    lines.push('');
    lines.push(`ЕДА СЕГОДНЯ (${t.count} приёма): ${t.kcal} ккал, белки ${t.protein_g} г, жиры ${t.fat_g} г (насыщенные ${t.sat_fat_g} г), углеводы ${t.carbs_g} г (сахар ${t.sugar_g} г), клетчатка ${t.fiber_g} г, холестерин ${t.cholesterol_mg} мг, натрий ${t.sodium_mg} мг.`);
  }
  return lines.join('\n');
}

export function dayFoodText(date) {
  const list = mealsOn(date);
  if (!list.length) return 'Сегодня ничего не записано.';
  const t = dayTotals(date);
  const rows = list.map(m => `- ${m.title}: ${m.nutrition.kcal} ккал, нас. жиры ${m.nutrition.sat_fat_g} г, клетчатка ${m.nutrition.fiber_g} г, сахар ${m.nutrition.sugar_g} г`);
  const tg = dayTargets();
  return `${rows.join('\n')}\n\nИтого за день: ${t.kcal} ккал (ориентир ${tg.kcal}), насыщенные жиры ${t.sat_fat_g} г (рамка ${tg.sat_fat_g}), клетчатка ${t.fiber_g} г (ориентир ${tg.fiber_g}), сахар ${t.sugar_g} г, холестерин ${t.cholesterol_mg} мг.`;
}

/* ── мелочи форматирования ───────────────────────────────────── */

export function fmtRef(m) {
  if (!m) return '—';
  if (m.refLow != null && m.refHigh != null) return `${trim(m.refLow)}–${trim(m.refHigh)}`;
  if (m.refHigh != null) return `до ${trim(m.refHigh)}`;
  if (m.refLow != null) return `от ${trim(m.refLow)}`;
  return 'не указана';
}
export const trim = (n) => (Math.round(Number(n) * 100) / 100).toString();

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export function ruDate(iso) {
  if (!iso) return 'без даты';
  const [y, m, d] = iso.split('-').map(Number);
  if (m === 1 && d === 1) return String(y);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
export function ruShort(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
export function ruStatus(s) {
  return { ok: 'в норме', edge: 'у границы', out: 'вне нормы', unknown: 'норма неизвестна' }[s] || '';
}
export function yearsSpan() {
  const ds = state.docs.filter(d => d.date).map(d => d.date).sort();
  return ds.length ? { from: ds[0], to: ds[ds.length - 1] } : null;
}
export { MARKERS };
