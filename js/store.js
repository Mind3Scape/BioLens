/* Доменный слой: документы → замеры → линии показателей.
   Здесь же — сборка контекста для ИИ и связка «анализы ↔ еда». */

import * as db from './db.js';
import { matchMarker, toCanonical, defaultRef, markerTitle, markerUnit, markerGroup, statusOf, MARKERS, RCV, RECHECK, NO_RECHECK, UNIT_SPLIT } from './markers.js';
import { analyzeDocument, analyzeMeal } from './openrouter.js';
import { isPdf, pdfToImages } from './pdfdoc.js';
import * as MED from './meds.js';
import * as PP from './passport.js';
/* Дата «сегодня» по местному времени живёт в meds.js — там она критична.
   Отдаём её дальше отсюда, чтобы экраны не считали день по Гринвичу. */
export { todayISO } from './meds.js';

export const state = {
  docs: [], meas: [], meals: [],
  rev: 0,   // счётчик правок: по нему сбрасывается готовый разбор линий
  queue: { total: 0, done: 0, running: false, errors: [] },
};

/* Любая правка замеров обязана пройти через это — иначе экраны покажут старое. */
export function touch() { state.rev++; }

export async function loadAll() {
  const [docs, meas, meals] = await Promise.all([db.all('docs'), db.all('meas'), db.all('meals'), MED.loadAll()]);
  state.docs = docs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  state.meas = meas;
  state.meals = meals.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  touch();
  return state;
}

/* ── приём файлов ────────────────────────────────────────────── */

/* Демонстрационный архив исчезает, как только появляется первый настоящий файл.
   Живёт здесь, а не в demo.js, чтобы срабатывать на ЛЮБОМ пути добавления. */
export async function dropDemo() {
  const docs = state.docs.filter(d => d.demo);
  const meals = state.meals.filter(m => m.demo);
  for (const d of docs) await deleteDoc(d.id);
  for (const m of meals) await deleteMeal(m.id);
  return docs.length + meals.length;
}

export async function addFiles(files, { onProgress } = {}) {
  if (files.length) await dropDemo();
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
      base.renderErrors = res.failed?.length ? res.failed : null;
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
    /* Документ мог быть удалён, пока очередь до него шла: ссылка в массиве
       осталась бы живой, и запись вернула бы его вместе с числами обратно. */
    if (!state.docs.includes(doc)) { state.queue.done++; continue; }
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
      if (!state.docs.includes(doc)) continue;      // удалили, пока читали страницы
      if (!results.length) throw new Error(pageErrors[0]?.error || 'модель ничего не вернула');
      doc.pageErrors = pageErrors.length ? pageErrors : null;
      doc.pagesRead = results.length;
      await applyDocResult(doc, results.length > 1 ? mergePages(results) : results[0], usedModel);
    } catch (e) {
      if (state.docs.includes(doc)) {
        doc.status = 'error';
        doc.error = e.message || String(e);
        state.queue.errors.push({ id: doc.id, error: doc.error });
        await db.put('docs', doc);
      }
    }
    state.queue.done++;
    onTick?.(doc);
  }
  state.queue.running = false;
  onTick?.(null);
  return state.queue;
}

/* Имя пациента с бланка. Приложение хранит архив ОДНОГО человека: если
   сфотографировать бланк жены или родителя, его числа молча встанут в твои
   линии и испортят всю картину. Имя из бланка модель читает всегда — здесь
   мы им наконец пользуемся. */
const nameParts = (s) => (s || '').toLowerCase()
  .replace(/ё/g, 'е').replace(/[^а-яa-z\s]/gi, ' ').replace(/\s+/g, ' ').trim()
  .split(' ').filter(Boolean);

/* Фамилия целиком + первая буква имени. В бланках одно и то же имя пишут
   и «Иванов Иван Иванович», и «Иванов И.И.» — по полным словам это выглядело бы
   как два разных человека, и свои же анализы уходили бы в «чужие». */
const nameKey = (s) => {
  const w = nameParts(s);
  const surname = w.find(x => x.length > 2);
  if (!surname) return '';
  const rest = w.filter(x => x !== surname);
  return surname + (rest.length ? '|' + rest[0][0] : '');
};

/* Совпадением считаем и случай, когда у одного имени инициала нет вовсе */
function sameName(a, b) {
  if (!a || !b) return true;
  const [sa, ia] = a.split('|'), [sb, ib] = b.split('|');
  if (sa !== sb) return false;
  return !ia || !ib || ia === ib;
}

/* Чьё имя чаще всего встречается в архиве — тот и владелец.
   Разбираемый прямо сейчас документ из подсчёта исключаем: иначе первый же
   чужой бланк объявит владельцем себя и проверка станет бессмысленной. */
export function archiveOwner(exceptDocId = null) {
  const count = new Map();
  for (const d of state.docs) {
    if (d.id === exceptDocId) continue;
    if (!['ready', 'needs-date', 'duplicate'].includes(d.status)) continue;
    const k = nameKey(d.patientName);
    if (!k) continue;
    count.set(k, (count.get(k) || 0) + 1);
  }
  let best = null;
  for (const [k, n] of count) if (!best || n > best.n) best = { key: k, n };
  return best;
}

function looksForeign(doc) {
  const mine = archiveOwner(doc.id);
  const theirs = nameKey(doc.patientName);
  if (!mine || !theirs) return false;          // сравнивать не с чем — не мешаем
  if (mine.n < 2) return false;                // по одному документу владельца не назначаем
  return !sameName(mine.key, theirs);
}

async function applyDocResult(doc, data, modelUsed, { trustPatient = false } = {}) {
  doc.model = modelUsed || null;
  doc.raw = data;

  if (data.is_medical === false) {
    doc.status = 'skipped';
    doc.title = 'Не медицинский документ';
    doc.note = 'Похоже, это не бланк и не снимок — ничего не сохранил';
    await db.put('docs', doc);
    // старые числа обязаны уйти вместе со статусом, иначе экран говорит одно, а графики другое
    await clearMeasurements(doc.id);
    await MED.clearForDoc(doc.id);
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
  doc.mixedDates = data.mixedDates || null;
  if (!date) { doc.status = 'needs-date'; doc.date = null; }
  else { doc.date = date; doc.status = 'ready'; }


  /* Дубль — только если совпал СОСТАВ, а не количество строк. Раньше два разных
     анализа одного дня с одинаковым числом строк объявлялись дублем, и данные
     второго молча пропадали. */
  doc.markerSig = markerSignature(data.markers);
  const dup = state.docs.find(d => d.id !== doc.id && d.date && d.date === doc.date
    && d.status === 'ready' && d.markerSig && d.markerSig === doc.markerSig);
  if (dup && (data.markers || []).length) {
    doc.status = 'duplicate';
    doc.duplicateOf = dup.id;
  }

  // чужой бланк не должен молча влиться в архив
  if (doc.status === 'ready' && !trustPatient && !doc.patientConfirmed && looksForeign(doc)) {
    doc.status = 'foreign';
    doc.foreignOf = archiveOwner(doc.id)?.key || null;
  }

  doc.markersCount = (data.markers || []).length;
  doc.medsCount = (data.meds || []).length;
  await db.put('docs', doc);

  // старые замеры этого документа стираем — перезалив должен быть чистым
  await clearMeasurements(doc.id);

  // дубль и чужой бланк в линии не попадают: числа остаются в документе, но не в графиках
  if (['duplicate', 'foreign'].includes(doc.status)) { await MED.clearForDoc(doc.id); return; }

  /* Назначения ставим в расписание сразу: ради этого человек и фотографирует
     лист назначений. Дубль и чужой бланк сюда не доходят — иначе одна и та же
     таблетка удвоилась бы в утреннем списке. */
  await MED.syncFromDoc(doc, data.meds);

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
    // единица может переводить показатель в его «двойник» с другой шкалой
    const uNorm = (raw.unit || '').toLowerCase().replace(/\s/g, '');
    if (hit && UNIT_SPLIT[key]?.[uNorm]) key = UNIT_SPLIT[key][uNorm];

    let conv = hit ? toCanonical(key, raw.value, raw.unit) : { value: Number(raw.value), unit: raw.unit || '', converted: false, factor: 1 };

    /* Единица, которой нет в таблице пересчёта, — самая тихая из возможных бед:
       ферритин в нг/дл встал бы в одну линию с нг/мл и нарисовал падение в десять
       раз. Такой замер живёт отдельной линией, пока единицу не научимся считать. */
    if (hit && conv.unknownUnit) {
      key = `raw:${key}|${(raw.unit || '').toLowerCase().trim()}`;
      conv = { value: Number(raw.value), unit: raw.unit || '', converted: false, factor: 1, unknownUnit: true };
    }

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
      nameRaw: raw.name || '',
      title: conv.unknownUnit && hit ? `${markerTitle(hit.key)} (${raw.unit})`
        : (hit && !collided ? markerTitle(key) : (rawName || raw.name || '')),
      value: conv.value, unit: conv.unit || raw.unit || '',
      rawValue: Number(raw.value), rawUnit: raw.unit || '',
      converted: !!conv.converted, unknownUnit: !!conv.unknownUnit,
      refLow: refLow ?? null, refHigh: refHigh ?? null, refSource,
      date: normDate(raw._date) || doc.date, lab: doc.lab || null,
      confidence: Number(raw.confidence ?? 1), confirmed: Number(raw.confidence ?? 1) >= 0.75,
      matchExact: hit && !collided ? hit.exact : false,
      separated: collided,     // «не смешал с соседней строкой того же бланка»
    };
    await db.put('meas', rec);
    state.meas.push(rec);
  }
  touch();
}

/* Одна выписка — один документ: собираем страницы в единый результат.
   Дату, лабораторию и название берём с первой страницы, где они вообще есть. */
function mergePages(pages) {
  const good = pages.filter(p => p && p.is_medical !== false);
  if (!good.length) return { is_medical: false };
  const first = (field) => good.map(p => p[field]).find(v => v != null && v !== '');
  /* Каждый показатель помним вместе с датой СВОЕЙ страницы: подшивка бланков
     за разные годы одним PDF — обычное дело, и раньше всё уезжало на дату
     первой страницы. Дедуплицируем в пределах одной даты, а не всего файла. */
  const markers = [];
  const seen = new Set();
  for (const p of good) {
    for (const m of (p.markers || [])) {
      const key = `${p.date || ''}|${(m.name || '').toLowerCase().trim()}|${m.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push(p.date ? { ...m, _date: p.date } : m);
    }
  }
  /* Страницы с разными датами — это подшивка разных бланков, а не одна выписка.
     Раньше всё получало дату первой страницы и вставало в график не туда. */
  const dates = [...new Set(good.map(p => p.date).filter(Boolean))];
  const conclusions = good.map(p => p.conclusion).filter(Boolean);
  /* Лист назначений часто идёт двумя страницами, и одно и то же лекарство
     повторяется в шапке продолжения. Считаем повтором совпадение названия
     и дозы: две разные дозы одного вещества — это две строки схемы. */
  const meds = [];
  const medSeen = new Set();
  for (const p of good) {
    for (const m of (p.meds || [])) {
      const k = `${(m.name || '').toLowerCase().trim()}|${(m.dose || '').toLowerCase().trim()}`;
      if (!m.name || medSeen.has(k)) continue;
      medSeen.add(k);
      meds.push(m);
    }
  }
  return {
    is_medical: true,
    meds,
    doc_type: first('doc_type') || 'other',
    title: mergedTitle(good) || first('title') || 'Документ',
    date: dates.length ? dates.slice().sort()[0] : (first('date') || null),
    date_confidence: Math.max(...good.map(p => Number(p.date_confidence || 0))),
    lab: first('lab') || null,
    patient_name: first('patient_name') || null,
    conclusion: conclusions.length ? [...new Set(conclusions)].join('\n\n') : null,
    note: good.map(p => p.note).filter(Boolean)[0] || null,
    mixedDates: dates.length > 1 ? dates : null,
    markers,
  };
}

/* У многостраничной выписки страницы называются по-разному («Чекап: биохимия»,
   «Чекап: гормоны»). Брать заголовок первой страницы — врать про остальные:
   берём общую часть до двоеточия, если она у всех одна. */
function mergedTitle(pages) {
  const titles = [...new Set(pages.map(p => (p.title || '').trim()).filter(Boolean))];
  if (titles.length <= 1) return titles[0] || null;
  const heads = [...new Set(titles.map(t => t.split(':')[0].trim()))];
  return heads.length === 1 ? heads[0] : titles[0];
}

/* Состав бланка: по нему отличаем настоящий дубль от другого анализа того же дня. */
async function clearMeasurements(docId) {
  const old = await db.byIndex('meas', 'docId', docId);
  for (const m of old) await db.del('meas', m.id);
  state.meas = state.meas.filter(m => m.docId !== docId);
  touch();
}

function markerSignature(markers) {
  const list = (markers || [])
    .map(m => `${(m.name || '').toLowerCase().trim()}=${m.value}`)
    .sort();
  return list.length ? list.join(';') : null;
}

/* Дата должна существовать в календаре и не быть из будущего.
   Модель иногда читает 2062 вместо 2026 или 31.02 — такая дата уводит показатель
   в конец линии и объявляет его «последним замером». Лучше честно спросить. */
function validDay(iso) {
  const [y, mo, d] = iso.split('-').map(Number);
  if (!y || !mo || !d) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return false;
  if (y < 1950) return false;
  return dt.getTime() <= Date.now() + 2 * 86400000;   // запас на часовые пояса
}

function normDate(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    return validDay(iso) ? iso : null;
  }
  const y = String(s).match(/(19|20)\d{2}/);
  if (!y) return null;
  const iso = `${y[0]}-01-01`;
  return validDay(iso) ? iso : null;
}

/* «Да, это мои анализы» — разбираем сохранённый ответ модели заново,
   уже не спрашивая про имя. Второго обращения к модели не требуется. */
export async function confirmPatient(docId) {
  const doc = state.docs.find(d => d.id === docId);
  if (!doc) return { ok: false, reason: 'Документ не найден' };
  doc.patientConfirmed = true;
  if (doc.raw) {
    await applyDocResult(doc, doc.raw, doc.model, { trustPatient: true });
    return { ok: true };
  }
  /* Копия из облака не несёт ответ модели: переразобрать нечего.
     Честно говорим об этом и ставим документ в очередь, если снимок на месте. */
  if ((doc.pages || []).length || doc.blobId) {
    doc.status = 'queued';
    await db.put('docs', doc);
    return { ok: true, requeued: true };
  }
  doc.status = 'needs-file';
  await db.put('docs', doc);
  return { ok: false, reason: 'Числа этого бланка не сохранились в копии — загрузи снимок заново' };
}

export async function setDocDate(docId, date) {
  const doc = state.docs.find(d => d.id === docId);
  if (!doc) return;
  doc.date = date; doc.status = 'ready'; doc.dateConfidence = 1;
  await db.put('docs', doc);
  const ms = await db.byIndex('meas', 'docId', docId);
  for (const m of ms) { m.date = date; await db.put('meas', m); }
  state.meas.forEach(m => { if (m.docId === docId) m.date = date; });
  /* Назначение без прочитанной даты начинало курс «сегодня». Как только дата
     появилась, курс обязан пересчитать начало и окончание — иначе «день 1 из 10»
     врёт на столько дней, сколько бланк пролежал непрочитанным. Курсы, которые
     человек уже правил руками, не трогаем: его слово главнее. */
  await MED.rebaseByDoc(docId, date);
  touch();
}

/* Человек вводит число ТАК, КАК ОНО НАПЕЧАТАНО В БЛАНКЕ, — а в архиве значение
   живёт в канонической единице. Раньше введённое число клалось в линию как есть:
   витамин D «75 нмоль/л» из бланка становился 75 нг/мл вместо 30, креатинин
   ошибался в 88 раз. Пересчитываем той же таблицей, что и при разборе. */
export async function fixMeasurement(measId, rawValue) {
  const m = state.meas.find(x => x.id === measId);
  if (!m) return;
  const v = Number(rawValue);
  if (!isFinite(v)) return;
  const conv = m.key.startsWith('raw:')
    ? { value: v, converted: false }
    : toCanonical(m.key, v, m.rawUnit || m.unit);
  m.rawValue = v;
  m.value = isFinite(conv.value) ? conv.value : v;
  m.converted = !!conv.converted;
  m.confidence = 1; m.confirmed = true; m.editedByHuman = true;
  await db.put('meas', m);
  touch();
}

export async function confirmMeasurement(measId) {
  const m = state.meas.find(x => x.id === measId);
  if (!m) return;
  m.confidence = 1; m.confirmed = true;
  await db.put('meas', m);
  touch();
}

export async function deleteDoc(docId) {
  const doc = state.docs.find(d => d.id === docId);
  const blobs = new Set([...(doc?.pages || []), doc?.blobId].filter(Boolean));
  for (const b of blobs) await db.del('blobs', b);
  const ms = await db.byIndex('meas', 'docId', docId);
  for (const m of ms) await db.del('meas', m.id);
  // назначения жили в этом документе — вместе с ним уходят и они
  await MED.clearForDoc(docId);
  await db.del('docs', docId);
  state.docs = state.docs.filter(d => d.id !== docId);
  state.meas = state.meas.filter(m => m.docId !== docId);
  touch();
}

/* Полный переразбор — например, после смены модели. */
export async function requeueAll() {
  for (const d of state.docs) {
    d.status = 'queued'; d.error = null;
    await db.put('docs', d);
  }
}

/* ── линии показателей ───────────────────────────────────────── */

/* Линии считаются на каждый экран, а замеров с годами становятся тысячи.
   Поэтому раскладываем их по показателям один раз и держим готовое до следующей
   правки данных — иначе каждый переход по вкладкам заново перебирает весь архив. */
let cache = { rev: -1, series: null, list: null };
export function invalidate() { cache.rev = -1; }

function allSeries() {
  if (cache.rev === state.rev && cache.series) return cache.series;
  const map = new Map();
  /* Как только появился хоть один настоящий замер, демонстрационные числа
     из линий исчезают. Смешанная история — выдуманные значения вперемешку
     с настоящими — хуже, чем отсутствие истории вообще. */
  const hasReal = state.meas.some(m => !m.demo);
  for (const m of state.meas) {
    if (!m.date) continue;
    if (hasReal && m.demo) continue;
    if (!map.has(m.key)) map.set(m.key, []);
    map.get(m.key).push({ ...m, status: statusOf(m.value, m.refLow, m.refHigh) });
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    // помечаем замеры одной даты: это не динамика, а два измерения одного дня
    const byDate = {};
    for (const m of list) (byDate[m.date] ||= []).push(m);
    for (const m of list) m.sameDay = byDate[m.date].length > 1;
  }
  cache = { rev: state.rev, series: map, list: null };
  return map;
}

export function seriesFor(key) {
  return allSeries().get(key) || [];
}

/* Сколько в серии по-настоящему разных дней — по нему решаем, есть ли динамика вообще */
export function distinctDays(series) {
  return new Set(series.map(m => m.date)).size;
}

export function markerKeys() {
  return [...allSeries().keys()];
}

/* Список для вкладки «Показатели»: сначала то, что вне нормы, потом ровное, потом протухшее. */
export function markerList() {
  const map = allSeries();
  if (cache.list) return cache.list;
  const out = [];
  for (const [key, s] of map) {
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
      deltaTone: prev ? changeTone(key, prev.value, last.value, last.refLow, last.refHigh) : 'flat',
      series: s,
    });
  }
  const rank = { out: 0, edge: 1, ok: 2, unknown: 3 };
  out.sort((a, b) => {
    if (a.stale !== b.stale) return a.stale ? 1 : -1;
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return b.count - a.count;
  });
  cache.list = out;
  return out;
}

export function attentionList() { return markerList().filter(m => !m.stale && (m.status === 'out' || m.status === 'edge')); }

/* Что действительно сдвинулось — для Сводки.
   Три фильтра, и все три нужны. Без них два бланка, сданные подряд в разных
   лабораториях, выглядят как «изменение за год», хотя тело за сутки не менялось:
   1) между замерами должно пройти хотя бы полтора месяца;
   2) сдвиг должен превышать естественный разброс метода (RCV);
   3) сравниваем с самым старым замером внутри последнего года, а не с чем попало. */
const MIN_GAP_DAYS = 45;

export function shifts(limit = 3) {
  const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  return markerList()
    .filter(m => m.count > 1 && m.last.date >= yearAgo)
    .map(m => {
      const past = m.series.filter(x => x.date < yearAgo);
      const base = past.length ? past[past.length - 1] : m.series[0];
      const change = base && base.value ? (m.last.value - base.value) / Math.abs(base.value) : 0;
      const gapDays = base ? (Date.parse(m.last.date) - Date.parse(base.date)) / 86400000 : 0;
      const sig = base ? changeSignificance(m.key, base.value, m.last.value) : null;
      return { ...m, base, change, gapDays, sig };
    })
    .filter(m => m.gapDays >= MIN_GAP_DAYS)
    /* Есть порог из базы — сверяемся с ним. Нет порога (Лп(а), СОЭ, свои строки
       из бланка) — требуем заметного сдвига, иначе шум объявлялся динамикой. */
    .filter(m => m.sig?.rcv != null ? m.sig.significant === true : Math.abs(m.change) > 0.2)
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

/* Цвет изменения по смыслу, а не по знаку.
   «Вверх» само по себе не хорошо и не плохо: для ЛПВП рост — это хорошо,
   для ЛПНП — плохо. Считаем, приблизилось значение к норме или ушло от неё.
   Если сдвиг меньше естественного разброса метода — цвета нет вовсе. */
export function changeTone(key, from, to, refLow, refHigh) {
  const a = Number(from), b = Number(to);
  if (!isFinite(a) || !isFinite(b) || a === b) return 'flat';
  const sig = changeSignificance(key, a, b);
  if (sig.significant === false) return 'flat';
  const off = (v) => Math.max(0, (refLow ?? -Infinity) - v) + Math.max(0, v - (refHigh ?? Infinity));
  const dA = off(a), dB = off(b);
  if (!isFinite(dA) || !isFinite(dB)) return 'flat';
  if (dB < dA) return 'better';
  if (dB > dA) return 'worse';
  return 'flat';
}

/* Замеры из разных лабораторий сравнивать в лоб нельзя: методы и калибровка разные.
   Возвращает список лабораторий, если их в линии больше одной. */
export function labsIn(series) {
  return [...new Set(series.map(m => (m.lab || '').trim()).filter(Boolean))];
}

/* Что пора пересдать — сроки из рекомендаций, где они есть */
/* Через сколько этот показатель обычно пересдают. Нужно экрану показателя:
   «что делать дальше» без срока — совет ни о чём. */
export function recheckMonths(key, status) {
  if (NO_RECHECK.includes(key)) return null;
  const rule = RECHECK[key];
  const bad = status === 'out' || status === 'edge';
  return rule ? (bad ? rule.bad : rule.ok) : (bad ? 6 : 12);
}

export function dueList() {
  return markerList().filter(m => !NO_RECHECK.includes(m.key)).map(m => {
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
  ldl:               { dir: 'down', goal: 'снизить ЛПНП', watch: ['sat_fat_g', 'fiber_g', 'cholesterol_mg'] },
  cholesterol_total: { dir: 'down', goal: 'снизить общий холестерин', watch: ['sat_fat_g', 'fiber_g', 'cholesterol_mg'] },
  triglycerides:     { dir: 'down', goal: 'снизить триглицериды', watch: ['sugar_g', 'carbs_g', 'kcal'] },
  glucose:           { dir: 'down', goal: 'выровнять сахар', watch: ['sugar_g', 'carbs_g', 'fiber_g'] },
  hba1c:             { dir: 'down', goal: 'выровнять сахар', watch: ['sugar_g', 'carbs_g', 'fiber_g'] },
  uric_acid:         { dir: 'down', goal: 'снизить мочевую кислоту', watch: ['protein_g', 'sugar_g'] },
  ferritin:          { dir: 'up',   goal: 'поднять железо', watch: ['iron_rich'] },
  vitamin_d:         { dir: 'up',   goal: 'поднять витамин D', watch: [] },
};

/* Цель по питанию обязана смотреть, в КАКУЮ сторону отклонение.
   Без этой проверки высокий ферритин (перегрузка железом или воспаление)
   давал совет «поднять железо», а низкий холестерин — «снизить холестерин». */
export function foodGoal() {
  const cands = markerList().filter(m => {
    const link = FOOD_LINKED[m.key];
    if (!link || (m.status !== 'out' && m.status !== 'edge')) return false;
    const tooHigh = m.last.refHigh != null && m.last.value >= m.last.refHigh - 0.0001;
    const tooLow = m.last.refLow != null && m.last.value <= m.last.refLow + 0.0001;
    return link.dir === 'down' ? tooHigh : tooLow;
  });
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
  await dropDemo();
  const blobId = db.uid('b');
  const small = await db.shrinkImage(file, 1200, 0.82);
  await db.putBlob(blobId, small);
  const meal = {
    id: db.uid('f'), blobId, at: new Date().toISOString(), date: MED.todayISO(),
    status: 'reading', title: null, nutrition: null, items: [], note: null,
  };
  await db.put('meals', meal);
  state.meals.unshift(meal);

  try {
    const goal = foodGoal();
    const dataUrl = await db.getBlobDataUrl(blobId);
    const { data } = await analyzeMeal(dataUrl, { model });
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

/* ── как разложить день ──────────────────────────────────────────
   Не диета и не назначение: обычная рамка «завтрак четверть, обед треть,
   ужин треть, перекусы остаток», разложенная на дневной ориентир по калориям.
   Нужна затем, чтобы вечером было видно не «съедено 1030», а «на ужин
   остаётся 700» — это единственное, что человеку в этот момент важно. */
export const MEAL_SLOTS = [
  { id: 'breakfast', title: 'Завтрак', share: 0.25, till: 11 },
  { id: 'lunch',     title: 'Обед',    share: 0.35, till: 16 },
  { id: 'dinner',    title: 'Ужин',    share: 0.30, till: 21 },
  { id: 'snack',     title: 'Перекусы', share: 0.10, till: 24 },
];

export function mealPlan(date = MED.todayISO()) {
  const tg = dayTargets();
  const list = mealsOn(date);
  const byId = Object.fromEntries(MEAL_SLOTS.map(m => [m.id, { ...m, target: Math.round(tg.kcal * m.share), kcal: 0, protein: 0, count: 0 }]));
  for (const m of list) {
    const h = new Date(m.at).getHours();
    const slot = MEAL_SLOTS.find(x => h < x.till) || MEAL_SLOTS[3];
    const b = byId[slot.id];
    b.kcal += m.nutrition?.kcal || 0;
    b.protein += m.nutrition?.protein_g || 0;
    b.count++;
  }
  const eaten = list.reduce((n, m) => n + (m.nutrition?.kcal || 0), 0);
  const rows = MEAL_SLOTS.map(m => byId[m.id]);
  const hour = new Date().getHours();
  // ближайший приём пищи, который ещё впереди — про него и говорим
  const next = rows.find(r => !r.count && hour < r.till) || rows.find(r => !r.count) || null;
  return { rows, eaten: Math.round(eaten), target: tg.kcal, left: Math.max(0, Math.round(tg.kcal - eaten)), next };
}

/* ── контекст для ИИ ─────────────────────────────────────────── */

/* 120 показателей — это около 12 КБ текста, для любой современной модели пустяк.
   Прежние 40 молча обрезали архив, и на вопрос «какой у меня гемоглобин»
   модель отвечала «таких данных нет», хотя данные есть. */
export function buildContext({ maxMarkers = 120 } = {}) {
  const s = db.settings();
  const age = new Date().getFullYear() - (s.birthYear || 1990);
  const lines = [];
  lines.push(`Человек: ${s.sex === 'f' ? 'женщина' : 'мужчина'}, ${age} лет, рост ${s.heightCm} см, вес ${s.weightKg} кг.`);
  lines.push(`Документов в архиве: ${state.docs.filter(d => d.status === 'ready').length}. Показателей: ${markerKeys().length}.`);
  lines.push('');
  lines.push('ПОКАЗАТЕЛИ (последний замер и вся история):');
  for (const m of markerList().slice(0, maxMarkers)) {
    const hist = m.series.map(p => `${p.date}: ${p.value}${p.lab ? ` (${p.lab})` : ''}`).join('; ');
    lines.push(`- ${m.title} [${m.unit}] норма ${fmtRef(m.last)} (${m.last.refSource || 'нет'}). Сейчас ${m.last.value} (${ruStatus(m.status)}), замеров ${m.count}. История: ${hist}`);
  }
  const total = markerList().length;
  if (total > maxMarkers) {
    lines.push(`(показаны ${maxMarkers} из ${total} — остальные есть в архиве, просто не поместились сюда)`);
  }
  /* Паспорт здоровья — раньше всего остального: модель, не знающая про
     аллергию и хронические болезни, рассуждает о человеке вслепую. */
  const ppText = PP.contextText();
  if (ppText) { lines.push(''); lines.push(ppText); }

  /* Лекарства идут сразу за показателями: разговор о печени или сахаре без
     знания о том, что человек сейчас принимает, — разговор вслепую. */
  const medText = MED.contextText();
  if (medText) { lines.push(''); lines.push(medText); }

  const concl = state.docs.filter(d => d.conclusion).slice(0, 8);
  if (concl.length) {
    lines.push('');
    lines.push('ЗАКЛЮЧЕНИЯ И СНИМКИ:');
    for (const d of concl) lines.push(`- ${d.date || 'без даты'} · ${d.title}: ${String(d.conclusion).slice(0, 300)}`);
  }
  const today = MED.todayISO();
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
  /* «норма 0–41» — лишнее слово: нулевой нижней границы у показателя не бывает,
     это просто «сколько угодно мало». Читается как «до 41» и на один знак короче. */
  if (m.refLow != null && m.refHigh != null) return Number(m.refLow) === 0 ? `до ${trim(m.refHigh)}` : `${trim(m.refLow)}–${trim(m.refHigh)}`;
  if (m.refHigh != null) return `до ${trim(m.refHigh)}`;
  if (m.refLow != null) return `от ${trim(m.refLow)}`;
  return 'не указана';
}
/* Округление под величину числа: у ТТГ и hs-СРБ значащие цифры живут после
   второго знака, и «0.64» вместо 0.636 — уже потеря смысла. */
export const trim = (n) => {
  const v = Number(n);
  if (!isFinite(v)) return String(n ?? '');
  const digits = Math.abs(v) < 1 ? 3 : 2;
  return (Math.round(v * 10 ** digits) / 10 ** digits).toString();
};

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export function ruDate(iso) {
  if (!iso) return 'без даты';
  const [y, m, d] = iso.split('-').map(Number);
  if (m === 1 && d === 1) return String(y);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
/* Дата без года — для списков, где год уже стоит заголовком раздела.
   Повторять его в каждой строке значит тратить полстроки на то, что и так видно. */
export function ruDayMonth(iso) {
  if (!iso) return 'без даты';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
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
