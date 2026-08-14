/* Паспорт здоровья: аллергии, хронические болезни, операции, группа крови.

   Почему это важнее очередного графика. Приложение знало про человека всё,
   кроме того, что спрашивают ПЕРВЫМ на любом приёме и в скорой: «на что у вас
   аллергия?», «чем болеете?», «что оперировали?». Числа без этих ответов —
   половина картины, а страница для врача без строки «аллергия на пенициллин»
   просто опасна.

   Второе, ради чего модуль существует: сверка назначений. Если врач выписал
   лекарство из группы, на которую записана аллергия, приложение обязано это
   заметить и попросить переспросить. Оно НИЧЕГО не отменяет и не советует
   замену — только показывает противоречие между двумя своими же записями.

   Хранится в настройках (localStorage) и уезжает в копию архива вместе
   с остальным: терять такое при смене телефона нельзя. */

import * as db from './db.js';

const EMPTY = { blood: '', rh: '', allergies: [], conditions: [], surgeries: [] };

export function state() {
  const p = db.settings().passport;
  return { ...EMPTY, ...(p || {}) };
}

export function save(patch) {
  const next = { ...state(), ...patch };
  db.saveSettings({ passport: next });
  return next;
}

export const KINDS = {
  allergies:  { title: 'Аллергии и реакции', one: 'аллергию', icon: 'ban',
                hint: 'лекарство, еда или что-то ещё — и что именно случается' },
  conditions: { title: 'Хронические болезни', one: 'болезнь', icon: 'heartbeat',
                hint: 'то, что с тобой давно и лечится годами' },
  surgeries:  { title: 'Операции и госпитализации', one: 'операцию', icon: 'firstaid',
                hint: 'что и когда — год достаточно' },
};

export const BLOOD = ['O (I)', 'A (II)', 'B (III)', 'AB (IV)'];
export const RH = ['Rh+', 'Rh−'];

export async function addItem(kind, name, note = '') {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return null;
  const list = state()[kind] || [];
  // одна и та же аллергия дважды — это не запись, а шум
  if (list.some(x => x.name.toLowerCase() === clean.toLowerCase())) return null;
  const item = { id: db.uid('pp'), name: clean, note: String(note || '').trim() || null, at: new Date().toISOString() };
  save({ [kind]: [...list, item] });
  return item;
}

export function removeItem(kind, id) {
  save({ [kind]: (state()[kind] || []).filter(x => x.id !== id) });
}

export const isEmpty = () => {
  const p = state();
  return !p.blood && !p.allergies.length && !p.conditions.length && !p.surgeries.length;
};

export const filled = () => {
  const p = state();
  return (p.blood ? 1 : 0) + p.allergies.length + p.conditions.length + p.surgeries.length;
};

/* ── сверка назначений с аллергиями ──────────────────────────────
   Списки собраны по действующим веществам и торговым названиям, которые
   реально встречаются в российских назначениях. Это НЕ справочник
   взаимодействий и не замена фармацевту: задача одна — заметить, что
   выписанное лекарство из той же группы, на которую записана аллергия. */

const GROUPS = [
  { id: 'penicillin', title: 'пенициллины',
    keys: ['пенициллин', 'амоксициллин', 'ампициллин', 'аугментин', 'амоксиклав', 'флемоксин', 'penicill'],
    drugs: ['пенициллин', 'амоксициллин', 'ампициллин', 'аугментин', 'амоксиклав', 'флемоксин', 'оксациллин', 'бензилпенициллин', 'амписид'] },
  { id: 'cef', title: 'цефалоспорины',
    keys: ['цефалоспорин', 'цефтриаксон', 'цефазолин', 'цефиксим', 'супракс', 'цефуроксим'],
    drugs: ['цефтриаксон', 'цефазолин', 'цефиксим', 'цефуроксим', 'супракс', 'цефепим', 'цефотаксим'] },
  { id: 'sulfa', title: 'сульфаниламиды',
    keys: ['сульфаниламид', 'бисептол', 'сульфаметоксазол', 'ко-тримоксазол', 'котримоксазол'],
    drugs: ['бисептол', 'сульфаметоксазол', 'ко-тримоксазол', 'котримоксазол', 'сульфасалазин'] },
  { id: 'nsaid', title: 'обезболивающие и жаропонижающие (НПВС)',
    keys: ['нпвс', 'аспирин', 'ацетилсалицил', 'ибупрофен', 'нурофен', 'диклофенак', 'кеторол', 'нимесулид', 'анальгин', 'метамизол'],
    drugs: ['аспирин', 'ацетилсалицил', 'ибупрофен', 'нурофен', 'миг', 'диклофенак', 'вольтарен', 'кеторол', 'кеторолак', 'кетопрофен', 'нимесулид', 'найз', 'нимесил', 'мелоксикам', 'анальгин', 'метамизол', 'целекоксиб'] },
  { id: 'macro', title: 'макролиды',
    keys: ['макролид', 'азитромицин', 'сумамед', 'кларитромицин', 'эритромицин'],
    drugs: ['азитромицин', 'сумамед', 'азитрокс', 'кларитромицин', 'клацид', 'эритромицин', 'джозамицин', 'вильпрафен'] },
  { id: 'tetra', title: 'тетрациклины',
    keys: ['тетрациклин', 'доксициклин', 'юнидокс'],
    drugs: ['тетрациклин', 'доксициклин', 'юнидокс', 'миноциклин'] },
  { id: 'quino', title: 'фторхинолоны',
    keys: ['фторхинолон', 'ципрофлоксацин', 'левофлоксацин', 'офлоксацин'],
    drugs: ['ципрофлоксацин', 'ципролет', 'левофлоксацин', 'таваник', 'офлоксацин', 'моксифлоксацин'] },
  { id: 'iodine', title: 'йод и йодсодержащие',
    keys: ['йод', 'iodine', 'контраст'],
    drugs: ['йод', 'повидон-йод', 'бетадин', 'йодомарин', 'калия йодид', 'амиодарон'] },
  { id: 'caine', title: 'местные анестетики',
    keys: ['лидокаин', 'новокаин', 'анестетик', 'ультракаин', 'прокаин'],
    drugs: ['лидокаин', 'новокаин', 'прокаин', 'ультракаин', 'артикаин', 'бупивакаин'] },
  { id: 'statin', title: 'статины',
    keys: ['статин', 'аторвастатин', 'розувастатин', 'симвастатин'],
    drugs: ['аторвастатин', 'розувастатин', 'симвастатин', 'липримар', 'крестор', 'аторис'] },
];

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]+/gi, ' ').trim();

/* Что мешает этому лекарству. Возвращает список совпадений с аллергиями:
   { allergy, group } — group есть, когда сработала не буква в букву, а группа. */
export function conflictsFor(medName) {
  const n = norm(medName);
  if (n.length < 3) return [];
  const hits = [];
  for (const a of state().allergies) {
    const an = norm(a.name);
    if (!an) continue;
    /* Прямое совпадение названий — только на достаточно длинных словах:
       короткие обрывки дают ложные срабатывания, а ложная тревога в
       медицинском приложении обесценивает настоящую. */
    const direct = an.length >= 4 && (n.includes(an) || an.includes(n));
    if (direct) { hits.push({ allergy: a, group: null }); continue; }
    const g = GROUPS.find(g => g.keys.some(k => an.includes(k)) && g.drugs.some(d => n.includes(d)));
    if (g) hits.push({ allergy: a, group: g.title });
  }
  return hits;
}

/* Есть ли вообще конфликты среди активных курсов — для колокольчика */
export function conflictingMeds(meds) {
  if (!state().allergies.length) return [];
  return meds.map(m => ({ med: m, hits: conflictsFor(m.name) })).filter(x => x.hits.length);
}

/* ── словами: для страницы врача и для ИИ ────────────────────── */

export function summaryLine() {
  const p = state();
  const parts = [];
  if (p.allergies.length) parts.push(`аллергии: ${p.allergies.length}`);
  if (p.conditions.length) parts.push(`болезни: ${p.conditions.length}`);
  if (p.blood) parts.push(p.blood + (p.rh ? ' ' + p.rh : ''));
  return parts.join(' · ') || 'не заполнен';
}

export function contextText() {
  const p = state();
  if (isEmpty()) return '';
  const lines = [];
  if (p.blood) lines.push(`- группа крови: ${p.blood}${p.rh ? ' ' + p.rh : ''}`);
  if (p.allergies.length) lines.push(`- АЛЛЕРГИИ: ${p.allergies.map(a => a.name + (a.note ? ` (${a.note})` : '')).join('; ')}`);
  if (p.conditions.length) lines.push(`- хронические болезни: ${p.conditions.map(a => a.name + (a.note ? ` (${a.note})` : '')).join('; ')}`);
  if (p.surgeries.length) lines.push(`- операции: ${p.surgeries.map(a => a.name + (a.note ? ` (${a.note})` : '')).join('; ')}`);
  return `ПАСПОРТ ЗДОРОВЬЯ (записан самим человеком):\n${lines.join('\n')}`;
}

export function doctorLines() {
  const p = state();
  const out = [];
  if (p.allergies.length) out.push(`Аллергии: ${p.allergies.map(a => a.name + (a.note ? ` — ${a.note}` : '')).join('; ')}`);
  else out.push('Аллергии: не записаны');
  if (p.conditions.length) out.push(`Хронические: ${p.conditions.map(a => a.name).join('; ')}`);
  if (p.surgeries.length) out.push(`Операции: ${p.surgeries.map(a => a.name + (a.note ? ` (${a.note})` : '')).join('; ')}`);
  if (p.blood) out.push(`Группа крови: ${p.blood}${p.rh ? ' ' + p.rh : ''}`);
  return out;
}
