/* Лечение: курсы лекарств и отметки приёма.

   Модуль намеренно отдельный от store.js: анализы — это прошлое, которое
   уже случилось, а лечение — это сегодняшний день, у него своя логика
   (слоты дня, сроки курса, отметки). Зависит только от db.js, поэтому
   store.js может свободно его импортировать. */

import * as db from './db.js';

/* ── календарь дня ───────────────────────────────────────────────
   `new Date().toISOString()` даёт дату по Гринвичу: в Москве в час ночи
   она показывает вчерашний день, и утренняя таблетка попадала бы во вчера.
   Дата дня должна быть местной — здесь это важнее, чем где-либо ещё. */
export function todayISO(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/* ── части дня ───────────────────────────────────────────────────
   Четыре, а не «утро-день-вечер»: «на ночь» пишут в назначениях отдельно
   и часто это единственный приём (статины, некоторые давление). */
export const SLOTS = [
  { id: 'morning', title: 'Утро',    when: 'до 12:00',      at: '08:00' },
  { id: 'day',     title: 'День',    when: '12:00 – 18:00', at: '14:00' },
  { id: 'evening', title: 'Вечер',   when: 'после 18:00',   at: '20:00' },
  { id: 'night',   title: 'На ночь', when: 'перед сном',    at: '22:30' },
];
export const slotTitle = (id) => SLOTS.find(s => s.id === id)?.title || id;

export function currentSlot(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 18) return 'day';
  if (h < 23) return 'evening';
  return 'night';
}

/* Раскладка по частям дня, когда в назначении написана только частота.
   Это общепринятый разнос приёмов, а не медицинское решение: человек
   всегда может передвинуть приём руками в карточке курса. */
export function slotsForPerDay(n) {
  const k = Math.max(1, Math.min(4, Math.round(Number(n) || 1)));
  return [['morning'], ['morning', 'evening'], ['morning', 'day', 'evening'], ['morning', 'day', 'evening', 'night']][k - 1];
}

/* ── состояние ───────────────────────────────────────────────── */

export const state = { meds: [], intakes: [] };

export async function loadAll() {
  const [meds, intakes] = await Promise.all([db.all('meds'), db.all('intakes')]);
  state.meds = meds.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  state.intakes = intakes;
  return state;
}

/* Отметка приёма — одна на курс-день-часть дня. Ключ составной, поэтому
   двойное нажатие не может породить две записи об одной таблетке. */
const intakeId = (medId, date, slot) => `${medId}|${date}|${slot}`;

export function intakeOf(medId, date, slot) {
  return state.intakes.find(x => x.id === intakeId(medId, date, slot)) || null;
}

/* ── жизнь курса ─────────────────────────────────────────────────
   Курс живёт между startDate и endDate. Если срок не написан, endDate нет:
   такие курсы («принимать постоянно») идут до тех пор, пока человек сам
   не скажет «закончил». */

export function endOf(med) {
  if (med.endDate) return med.endDate;
  if (med.durationDays && med.startDate) return addDays(med.startDate, med.durationDays - 1);
  return null;
}

/* Сколько дней курса прошло и сколько осталось */
export function progressOf(med, date = todayISO()) {
  const end = endOf(med);
  const total = med.durationDays || (end && med.startDate ? daysBetween(med.startDate, end) + 1 : null);
  const day = med.startDate ? daysBetween(med.startDate, date) + 1 : null;
  const left = end ? daysBetween(date, end) : null;
  return { day, total, left, end };
}

/* Назначение без срока, найденное в старом документе, — самое опасное место:
   человек мог давно всё пропить, а приложение будет каждое утро уверенно
   показывать таблетку. Такие курсы не идут в расписание, пока человек не
   ответит «принимаю» или «закончил». */
export const ASK_AFTER_DAYS = 90;

export function needsAsk(med, date = todayISO()) {
  if (med.status !== 'active' || med.askedOk) return false;
  if (endOf(med)) return false;
  if (!med.startDate) return true;
  return daysBetween(med.startDate, date) > ASK_AFTER_DAYS;
}

export function statusOf(med, date = todayISO()) {
  if (med.status === 'stopped') return 'stopped';
  if (med.status === 'done') return 'done';
  const end = endOf(med);
  if (end && date > end) return 'done';
  if (med.startDate && date < med.startDate) return 'later';
  if (needsAsk(med, date)) return 'ask';
  return 'active';
}

export function isOnToday(med, date = todayISO()) {
  if (statusOf(med, date) !== 'active') return false;
  // раз в двое суток, через день и прочие редкие ритмы
  const every = Math.max(1, Math.round(med.everyNDays || 1));
  if (every > 1 && med.startDate) return daysBetween(med.startDate, date) % every === 0;
  return true;
}

export const activeMeds = (date = todayISO()) => state.meds.filter(m => statusOf(m, date) === 'active');
export const askMeds = (date = todayISO()) => state.meds.filter(m => statusOf(m, date) === 'ask');
export const unconfirmed = () => state.meds.filter(m => m.source === 'ai' && !m.confirmed && ['active', 'ask'].includes(statusOf(m)));

/* ── план дня ────────────────────────────────────────────────────
   Возвращает части дня в порядке утро → ночь, пустые части выбрасываются.
   Каждый приём знает, отмечен он или нет: экран не должен считать сам. */
export function planFor(date = todayISO()) {
  const meds = state.meds.filter(m => isOnToday(m, date));
  const out = [];
  for (const slot of SLOTS) {
    const items = meds.filter(m => (m.slots || []).includes(slot.id)).map(m => {
      const intake = intakeOf(m.id, date, slot.id);
      return { med: m, taken: intake?.status === 'taken', skipped: intake?.status === 'skipped', at: intake?.at || null };
    });
    if (items.length) out.push({ ...slot, items });
  }
  return out;
}

export function dayCount(date = todayISO()) {
  const plan = planFor(date);
  const total = plan.reduce((n, s) => n + s.items.length, 0);
  const taken = plan.reduce((n, s) => n + s.items.filter(i => i.taken).length, 0);
  const left = plan.reduce((n, s) => n + s.items.filter(i => !i.taken && !i.skipped).length, 0);
  return { total, taken, left, slots: plan.length };
}

/* Ближайшее незакрытое: чтобы главная могла сказать не «5 приёмов»,
   а «сейчас утро — две таблетки». */
export function nowSlot(date = todayISO()) {
  const plan = planFor(date);
  if (!plan.length) return null;
  const cur = currentSlot();
  const order = SLOTS.map(s => s.id);
  const idx = order.indexOf(cur);
  const byId = Object.fromEntries(plan.map(s => [s.id, s]));
  const pending = (s) => s && s.items.some(x => !x.taken && !x.skipped);
  // текущая часть дня, а если в ней всё отмечено — ближайшая следующая с делом
  for (let i = idx; i < order.length; i++) if (pending(byId[order[i]])) return byId[order[i]];
  /* Вечером могут остаться неотмеченными утренние таблетки: тогда ведём назад,
     к самому раннему пропущенному, а не подсвечиваем часть дня наугад. */
  for (const s of plan) if (pending(s)) return s;
  return byId[cur] || plan[plan.length - 1];
}

/* ── отметки ─────────────────────────────────────────────────── */

export async function mark(medId, date, slot, status = 'taken') {
  const id = intakeId(medId, date, slot);
  const prev = state.intakes.find(x => x.id === id);
  if (prev && prev.status === status) {          // повторное нажатие снимает отметку
    await db.del('intakes', id);
    state.intakes = state.intakes.filter(x => x.id !== id);
    return null;
  }
  const rec = { id, medId, date, slot, status, at: new Date().toISOString() };
  await db.put('intakes', rec);
  state.intakes = [...state.intakes.filter(x => x.id !== id), rec];
  return rec;
}

/* Насколько курс соблюдается: отмечено против ожидаемого за прошедшие дни.
   Сегодняшний день не считаем — он ещё не закончился. */
export function adherence(med, date = todayISO()) {
  if (!med.startDate) return null;
  const end = endOf(med);
  const last = end && end < date ? end : addDays(date, -1);
  const days = daysBetween(med.startDate, last) + 1;
  if (days <= 0) return null;
  const perDay = (med.slots || []).length || 1;
  const every = Math.max(1, Math.round(med.everyNDays || 1));
  const planned = Math.ceil(days / every) * perDay;
  const taken = state.intakes.filter(x => x.medId === med.id && x.status === 'taken' && x.date <= last).length;
  return { planned, taken, days, pct: planned ? Math.min(1, taken / planned) : null };
}

/* Последние дни курса сеткой: сразу видно, где были пропуски */
export function recentDays(med, n = 14, date = todayISO()) {
  const out = [];
  const end = endOf(med);
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(date, -i);
    if (med.startDate && d < med.startDate) continue;
    if (end && d > end) continue;
    const slots = (med.slots || []);
    const marks = slots.map(s => intakeOf(med.id, d, s)?.status || null);
    out.push({ date: d, marks, all: marks.length > 0 && marks.every(m => m === 'taken'), some: marks.some(m => m === 'taken') });
  }
  return out;
}

/* ── создание и правка ───────────────────────────────────────── */

const clean = (s) => (s == null ? null : String(s).trim().replace(/\s+/g, ' ') || null);

/* «после еды», «п/е», «во время приёма пищи» — приводим к трём вариантам */
function normFood(v) {
  const s = (v || '').toLowerCase();
  if (!s) return null;
  if (/до\s*ед|перед\s*ед|натощак|before/.test(s)) return 'before';
  if (/во\s*время|с\s*ед|during|with/.test(s)) return 'with';
  if (/после\s*ед|after/.test(s)) return 'after';
  return null;
}
export const foodText = (v) => ({ before: 'до еды', with: 'во время еды', after: 'после еды' }[v] || null);

/* Ключ для сравнения «то же лекарство или другое»: название без формы и дозы */
export const medKey = (name) => (name || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();

/* Курсы из разобранного документа. Правило одно и жёсткое: чего в бланке
   не написано — того мы не придумываем. Нет частоты — курс появится, но
   попросит человека дописать, а не встанет в расписание с выдуманным «утром».

   Переразбор не должен стирать историю приёма: если то же лекарство уже
   заводилось из этого документа, курс обновляется на месте — отметки
   «принял» привязаны к его id и остаются на своих днях. */
export async function syncFromDoc(doc, list) {
  const made = [];
  const seen = new Set();
  for (const raw of (list || [])) {
    const name = clean(raw.name);
    if (!name) continue;
    seen.add(medKey(name));

    const perDay = Number(raw.per_day) > 0 ? Math.min(6, Math.round(Number(raw.per_day))) : null;
    let slots = (raw.times_of_day || []).filter(s => SLOTS.some(x => x.id === s));
    slots = [...new Set(slots)];
    if (!slots.length && perDay) slots = slotsForPerDay(perDay);

    const durationDays = Number(raw.duration_days) > 0 ? Math.round(Number(raw.duration_days)) : null;
    const startDate = doc.date || todayISO();
    let endDate = /^\d{4}-\d{2}-\d{2}$/.test(raw.end_date || '') ? raw.end_date : null;
    if (!endDate && durationDays) endDate = addDays(startDate, durationDays - 1);

    const prev = state.meds.find(m => m.docId === doc.id && medKey(m.name) === medKey(name));
    const med = {
      id: prev?.id || db.uid('rx'),
      docId: doc.id,
      name,
      dose: clean(raw.dose),
      form: clean(raw.form),
      slots,
      perDay: perDay || slots.length || null,
      everyNDays: Number(raw.every_n_days) > 1 ? Math.round(Number(raw.every_n_days)) : 1,
      freqText: clean(raw.frequency_text),
      durationDays,
      startDate,
      endDate,
      food: normFood(raw.food),
      instructions: clean(raw.instructions),
      // человек мог остановить курс — переразбор документа не воскрешает приём
      status: prev?.status === 'stopped' ? 'stopped' : 'active',
      askedOk: prev?.askedOk || false,
      source: 'ai',
      confirmed: false,
      confidence: Number(raw.confidence ?? 0.6),
      // чего не хватает, чтобы курс встал в расписание сам
      missing: [!slots.length ? 'schedule' : null, !clean(raw.dose) ? 'dose' : null].filter(Boolean),
      docDate: doc.date || null,
      lab: doc.lab || null,
      createdAt: prev?.createdAt || new Date().toISOString(),
    };
    // ничего не изменилось — незачем заново просить человека всё проверять
    if (prev && signature(prev) === signature(med)) med.confirmed = prev.confirmed;
    await db.put('meds', med);
    if (prev) state.meds[state.meds.indexOf(prev)] = med; else state.meds.unshift(med);
    made.push(med);
  }
  // назначение исчезло из документа при переразборе — курс с ним тоже уходит
  for (const m of state.meds.filter(x => x.docId === doc.id && !seen.has(medKey(x.name)))) {
    await removeMed(m.id);
  }
  return made;
}

const signature = (m) => [m.name, m.dose, (m.slots || []).join(','), m.durationDays, m.startDate, m.food].join('|');

/* Дату документа проставили руками — курсы, рождённые из него, начинают
   отсчёт заново. Правленные человеком курсы не трогаем. */
export async function rebaseByDoc(docId, date) {
  if (!date) return 0;
  let n = 0;
  for (const m of state.meds.filter(x => x.docId === docId && x.source === 'ai' && !x.confirmed)) {
    m.startDate = date;
    m.docDate = date;
    if (m.durationDays) m.endDate = addDays(date, m.durationDays - 1);
    await db.put('meds', m);
    n++;
  }
  return n;
}

export async function clearForDoc(docId) {
  const mine = state.meds.filter(m => m.docId === docId);
  for (const m of mine) await removeMed(m.id);
  return mine.length;
}

export async function saveMed(patch) {
  const existing = patch.id ? state.meds.find(m => m.id === patch.id) : null;
  const med = existing
    ? { ...existing, ...patch }
    : {
        docId: null, status: 'active', source: 'manual', confirmed: true,
        confidence: 1, everyNDays: 1, startDate: todayISO(), createdAt: new Date().toISOString(),
        ...patch,
      };
  /* Форма правки передаёт id всегда — у нового курса он пустой. Раньше это
     пустое значение затирало собой сгенерированный ключ, и запись падала
     на самом хранилище: «добавить лекарство руками» просто не работало. */
  if (!med.id) med.id = db.uid('rx');
  med.slots = [...new Set((med.slots || []).filter(s => SLOTS.some(x => x.id === s)))]
    .sort((a, b) => SLOTS.findIndex(x => x.id === a) - SLOTS.findIndex(x => x.id === b));
  med.perDay = med.slots.length || med.perDay || null;
  if (med.durationDays && med.startDate) med.endDate = addDays(med.startDate, med.durationDays - 1);
  med.missing = [!med.slots.length ? 'schedule' : null, !med.dose ? 'dose' : null].filter(Boolean);
  await db.put('meds', med);
  const i = state.meds.findIndex(m => m.id === med.id);
  if (i >= 0) state.meds[i] = med; else state.meds.unshift(med);
  return med;
}

export async function setStatus(id, status) {
  const med = state.meds.find(m => m.id === id);
  if (!med) return null;
  med.status = status;
  if (status === 'stopped' || status === 'done') med.stoppedAt = todayISO();
  if (status === 'active') { med.stoppedAt = null; med.askedOk = true; }
  await db.put('meds', med);
  return med;
}

/* «Да, ещё принимаю» — курс без срока подтверждён на новый круг */
export async function keepTaking(id) {
  const med = state.meds.find(m => m.id === id);
  if (!med) return null;
  med.askedOk = true;
  med.confirmed = true;
  med.startDate = todayISO();     // отсчёт «давно ли назначено» начинается заново
  await db.put('meds', med);
  return med;
}

export async function confirmMed(id) {
  const med = state.meds.find(m => m.id === id);
  if (!med) return null;
  med.confirmed = true;
  await db.put('meds', med);
  return med;
}

export async function removeMed(id, { keepLog = false } = {}) {
  await db.del('meds', id);
  state.meds = state.meds.filter(m => m.id !== id);
  if (!keepLog) {
    const mine = state.intakes.filter(x => x.medId === id);
    for (const x of mine) await db.del('intakes', x.id);
    state.intakes = state.intakes.filter(x => x.medId !== id);
  }
}

/* ── словами ─────────────────────────────────────────────────── */

export function scheduleText(med) {
  const slots = (med.slots || []);
  if (!slots.length) return med.freqText || 'время приёма не указано';
  const every = Math.max(1, Math.round(med.everyNDays || 1));
  const when = slots.map(slotTitle).join(' · ').toLowerCase();
  const rhythm = every > 1 ? `раз в ${every} ${every === 2 ? 'дня' : 'дней'}, ` : '';
  return rhythm + when;
}

export function courseText(med, date = todayISO()) {
  const st = statusOf(med, date);
  const p = progressOf(med, date);
  if (st === 'done') return p.end ? `курс закончен ${p.end.split('-').reverse().join('.')}` : 'курс закончен';
  if (st === 'stopped') return 'приём остановлен';
  if (st === 'later') return `начало ${med.startDate.split('-').reverse().join('.')}`;
  if (p.total && p.day) return `день ${Math.max(1, p.day)} из ${p.total}`;
  return 'без срока окончания';
}

/* Текст для ИИ и для страницы врача. Лекарства обязаны попадать в контекст:
   без них любой разговор о показателях идёт вслепую. */
export function contextText(date = todayISO()) {
  const act = state.meds.filter(m => ['active', 'ask'].includes(statusOf(m, date)));
  if (!act.length) return '';
  const lines = act.map(m => {
    const p = progressOf(m, date);
    return `- ${m.name}${m.dose ? ` ${m.dose}` : ''}: ${scheduleText(m)}${foodText(m.food) ? ', ' + foodText(m.food) : ''}` +
      `${p.total ? `, день ${Math.max(1, p.day)} из ${p.total}` : ', без указанного срока'}` +
      `${m.docDate ? `, назначено ${m.docDate}` : ''}${statusOf(m, date) === 'ask' ? ' (человек ещё не подтвердил, что принимает)' : ''}`;
  });
  const d = dayCount(date);
  return `ЛЕКАРСТВА (назначены человеку, приложение их только напоминает):\n${lines.join('\n')}\nСегодня отмечено ${d.taken} из ${d.total} приёмов.`;
}

/* ── копия архива ────────────────────────────────────────────── */

export function forBackup() {
  return {
    meds: state.meds.map(m => ({
      i: m.id, d: m.docId, n: m.name, ds: m.dose, fm: m.form, sl: m.slots, pd: m.perDay,
      ev: m.everyNDays, ft: m.freqText, du: m.durationDays, sd: m.startDate, ed: m.endDate,
      fo: m.food, ins: m.instructions, st: m.status, sr: m.source, cf: m.confirmed ? 1 : 0,
      co: m.confidence, dd: m.docDate, lb: m.lab, ao: m.askedOk ? 1 : 0, ca: m.createdAt,
    })),
    intakes: state.intakes.map(x => ({ i: x.id, m: x.medId, y: x.date, s: x.slot, st: x.status, a: x.at })),
  };
}

export function fromBackup(data) {
  const meds = (data.meds || []).map(m => ({
    id: m.i, docId: m.d || null, name: m.n, dose: m.ds || null, form: m.fm || null,
    slots: m.sl || [], perDay: m.pd || null, everyNDays: m.ev || 1, freqText: m.ft || null,
    durationDays: m.du || null, startDate: m.sd || null, endDate: m.ed || null,
    food: m.fo || null, instructions: m.ins || null, status: m.st || 'active',
    source: m.sr || 'ai', confirmed: !!m.cf, confidence: m.co ?? 1, docDate: m.dd || null,
    lab: m.lb || null, askedOk: !!m.ao, createdAt: m.ca || new Date().toISOString(),
    missing: [!(m.sl || []).length ? 'schedule' : null, !m.ds ? 'dose' : null].filter(Boolean),
  }));
  const intakes = (data.intakes || []).map(x => ({ id: x.i, medId: x.m, date: x.y, slot: x.s, status: x.st, at: x.a }));
  return { meds, intakes };
}
