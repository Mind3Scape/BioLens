/* Экраны приложения. Каждая функция возвращает HTML;
   обработчики висят на data-act и разбираются в app.js. */

import * as S from './store.js';
import * as db from './db.js';
import * as MED from './meds.js';
import { icon } from './icons.js';
import { esc, sparkline, chart, statusDot, statusTag, statusWord, toneVar, inkTone, aiBlock, emptyBlock, ring, bar, rangeBar, gradeScale, miniRange, stackBar } from './ui.js';
import { markerTitle, markerGroup, MARKERS } from './markers.js';
import { info } from './reference.js';
import { tgUserName, tgUser, inTelegram } from './telegram.js';

const head = (title, sub, right = '') => `
  <div class="head">
    <div class="grow"><h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
    ${right}
  </div>`;

const backHead = (title, sub) => `
  <div class="head">
    <button class="rnd" data-act="back">${backIcon()}</button>
    <div class="grow"><h2>${esc(title)}</h2>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
  </div>`;

/* Шапка с кнопкой «назад» и местом под действия справа: Хроника перестала
   быть вкладкой и открывается с главной, значит выход с неё должен быть виден
   и в браузере, где системной кнопки «назад» нет. */
const backHeadWide = (title, sub, right = '') => `
  <div class="head">
    <button class="rnd" data-act="back">${backIcon()}</button>
    <div class="grow"><h1 style="font-size:23px">${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
    ${right}
  </div>`;

/* ⚠️Класс `ico` нельзя: в нём `fill:currentColor`, а CSS сильнее атрибута
   `fill="none"` — галочка заливалась и превращалась в жирный чёрный треугольник.
   У линейных знаков свой класс со своей заливкой. */
export const backIcon = () => `<svg class="chev back" viewBox="0 0 24 24"><polyline points="14.5,5 7.5,12 14.5,19"/></svg>`;

/* Один знак «это открывается» на всё приложение — тонкий, тише текста рядом. */
const chevron = () => `<svg class="chev" viewBox="0 0 24 24"><polyline points="9.5,5 16.5,12 9.5,19"/></svg>`;

const avatarBtn = `<button class="rnd" data-act="settings">${icon('user', 'ico s')}</button>`;
const addBtn = `<button class="rnd dark" data-act="add">${icon('plus', 'ico s')}</button>`;

/* ══ СВОДКА ══════════════════════════════════════════════════ */

export function summary(app) {
  const today = S.todayISO();
  const ready = S.state.docs.filter(d => d.status === 'ready');
  const queue = S.state.docs.filter(d => ['queued', 'reading'].includes(d.status)).length;
  const needsAttention = S.state.docs.filter(d => ['needs-date', 'error', 'skipped', 'duplicate', 'foreign', 'needs-file'].includes(d.status) || (d.status === 'ready' && d.pageErrors?.length)).length;
  const plan = MED.planFor(today);

  if (!S.state.docs.length && !MED.state.meds.length) {
    return head('BioLens', '') + emptyBlock('camera', 'Начни с того, что есть',
      'Закинь всё подряд — скриншоты анализов, фото бланков, <b>PDF из лаборатории</b> и <b>листы назначений</b>. Назначения сам разложу по утрам и вечерам, анализы сложу в линии по годам.',
      `<button class="btn" data-act="add">${icon('camera', 'ico s')}Закинуть файлы</button>
       <button class="btn ghost" data-act="scan" style="margin-top:10px">${icon('camera', 'ico s')}Снять камерой</button>`);
  }

  let html = head('Здоровье', dayTitle(today), avatarBtn + addBtn);

  if (queue) {
    const done = S.state.queue.total ? S.state.queue.done : 0;
    html += `<div class="card">
      <div class="row">
        <div class="spin"></div>
        <div class="grow"><div class="nm">Разбираю ещё ${queue}</div>
          <div class="sm">${S.state.queue.total ? `${done} из ${S.state.queue.total} · можно закрыть приложение` : 'сейчас начну'}</div></div>
        <button class="mini" data-act="inbox">Открыть</button>
      </div>
      <div class="prog" style="margin-top:10px"><i style="width:${S.state.queue.total ? Math.round(done / S.state.queue.total * 100) : 4}%"></i></div>
    </div>`;
  }

  html += dashboard(app);
  html += medsToday(app, today, plan);

  if (app.aiSummary) {
    html += aiBlock('что изменилось', esc(app.aiSummary).replace(/\n/g, '<br>'),
      [`${ready.length} документов`, `${S.markerKeys().length} показателей`]);
  } else if (app.aiSummaryError) {
    html += `<div class="card"><div class="row">${icon('warning', 'ico s')}<div class="grow sm">${esc(app.aiSummaryError)}</div>
      <button class="mini" data-act="settings">Настройки</button></div></div>`;
  } else if (db.settings().apiKey && S.markerKeys().length) {
    html += `<div class="card"><div class="row"><div class="spin"></div><div class="grow sm">Смотрю, что изменилось…</div></div></div>`;
  }

  /* Три бывшие карточки во всю ширину — теперь три строки одной группы.
     Каждая из них раньше занимала по 70 пикселей ради одной мысли. */
  const rows = [];
  const due = S.dueList()[0];
  if (due) rows.push(['due', 'clock', `${due.title} — пора пересдать`, due.daysOld > 700 ? `${Math.floor(due.daysOld / 365)} года` : S.ruShort(due.last.date), {}]);
  const goal = S.foodGoal();
  if (goal) {
    const t = S.dayTotals(today);
    rows.push(['tab', 'forkknife', `Питание: ${goal.goal}`, t.count ? `${t.kcal} ккал` : 'пусто', { tab: 'food' }]);
  }
  rows.push(['doctor', 'stethoscope', 'Страница для врача', '', {}]);
  html += `<div class="grp">${rows.map(([act, ic, title, value, data]) => `
    <div class="gi" data-act="${act}"${data.tab ? ` data-tab="${data.tab}"` : ''}>
      ${icon(ic, 'ico s')}
      <div class="t">${esc(title)}</div>
      ${value ? `<div class="v">${esc(value)}</div>` : ''}
      ${chevron()}
    </div>`).join('')}</div>`;

  html += archive(app, needsAttention);

  html += `<div class="disc">Приложение хранит факты и напоминает о назначенном. Диагнозов не ставит.</div>`;
  return html;
}

/* ── дашборд состояния ───────────────────────────────────────────
   Первое, что человек видит утром. Три числа в строку, под ними — то, что
   действительно вне нормы. Раньше числа стояли залитыми плитками и съедали
   четверть первого экрана, весив больше, чем сами показатели. */
function dashboard(app) {
  const list = S.markerList().filter(m => !m.stale);
  if (!list.length) {
    const anyDocs = S.state.docs.some(d => d.status === 'ready');
    return `<div class="card flat"><div class="row">${icon('chartline', 'ico s')}
      <div class="grow"><div class="nm" style="font-size:14px">${anyDocs ? 'Чисел пока нет' : 'Здесь будет твоё состояние'}</div>
        <div class="sm">${anyDocs ? 'В разобранных документах не нашлось таблиц с показателями' : 'Закинь анализ — и увидишь, что в норме, а что нет'}</div></div>
      <button class="mini" data-act="add">Добавить</button></div></div>`;
  }
  const out = list.filter(m => m.status === 'out').length;
  const edge = list.filter(m => m.status === 'edge').length;
  const ok = list.filter(m => m.status === 'ok').length;
  const lastDate = list.map(m => m.last.date).filter(Boolean).sort().slice(-1)[0];
  const attention = S.attentionList();
  const shown = attention.slice(0, 2);

  /* Одна полоса вместо трёх крупных чисел: доля видна мгновенно, а сами числа
     стоят подписью под ней. Раньше это была четверть первого экрана. */
  const legend = [
    out ? `<span class="c-out">${out}</span> вне нормы` : null,
    edge ? `<span class="c-edge">${edge}</span> у границы` : null,
    ok ? `${ok} в норме` : null,
  ].filter(Boolean).join(' · ');

  return `<div class="card">
    <div class="row" style="align-items:baseline">
      <div class="grow"><div class="nm" style="font-size:13px;font-weight:750">Состояние</div></div>
      <div class="sm">${lastDate ? `бланк ${S.ruShort(lastDate)}` : ''}</div>
    </div>
    ${stackBar([
      { n: out, color: 'var(--bad-dot)' },
      { n: edge, color: 'var(--edge-dot)' },
      { n: ok, color: 'var(--hair2)' },
    ])}
    <div class="sm" style="margin-top:7px">${legend}</div>
    ${shown.length ? `<div class="divide"></div>${shown.map(attRow).join('<div class="divide"></div>')}` : ''}
    <div class="divide"></div>
    <div class="row" style="cursor:pointer" data-act="tab" data-tab="markers">
      <div class="grow sm">${attention.length > shown.length ? `Ещё ${attention.length - shown.length} требуют внимания · ` : ''}все ${list.length} ${plural(list.length, 'показатель', 'показателя', 'показателей')}</div>
      ${chevron()}
    </div>
  </div>`;
}

/* Показатель вне нормы: название, число и полоска, на которой видно,
   НАСКОЛЬКО он вышел за коридор. Слова «выше нормы» этого не говорят. */
function attRow(m) {
  const st = m.status;
  return `<div class="att" data-act="marker" data-key="${esc(m.key)}">
    <div class="row" style="align-items:baseline;gap:8px">
      <div class="grow nm">${esc(m.title)}</div>
      <div class="val" style="color:${inkTone(st)}">${S.trim(m.last.value)}<span class="unit">${esc(m.unit)}</span></div>
    </div>
    ${miniRange(m.last.value, m.last.refLow, m.last.refHigh, st)}
    <div class="row" style="gap:6px">
      <div class="grow sm">${statusWord(st, m.last.value, m.last.refLow, m.last.refHigh)} · норма ${esc(S.fmtRef(m.last))}</div>
      ${sparkline(m.series, { w: 50, h: 18 })}
    </div>
  </div>`;
}

/* ── приём лекарств на сегодня ──────────────────────────────────
   Лента дня: утро, день, вечер и ночь стоят ВСЕГДА, даже пустые. Раньше
   показывались только те части, где что-то назначено, и человек видел
   «утро и вечер» без всякого объяснения, куда делись остальные.
   Нажатие на часть дня открывает её список; по умолчанию открыта текущая. */
function medsToday(app, date, plan) {
  const meds = MED.state.meds;
  if (!meds.length) {
    return `<div class="grp"><div class="gi" data-act="tab" data-tab="meds">
      ${icon('pill', 'ico s')}
      <div class="t">Сфотографируй назначение врача</div>
      ${chevron()}</div></div>`;
  }

  let html = '';
  const check = MED.unconfirmed();
  if (check.length) {
    html += `<div class="grp"><div class="gi" data-act="tab" data-tab="meds">
      ${icon('warning', 'ico s')}
      <div class="t">${check.length === 1 ? 'Назначение не проверено' : 'Не проверены назначения'}</div>
      <div class="v">${check.length === 1 ? 'сверь с листом' : `${check.length} шт.`}</div>
      ${chevron()}</div></div>`;
  }

  const ask = MED.askMeds(date);
  if (ask.length) {
    html += `<div class="card note">
      <div class="row">${icon('clock', 'ico s')}<div class="grow"><div class="nm" style="font-size:13.5px">Ты ещё принимаешь ${esc(ask[0].name)}?</div>
        <div class="sm">Назначено ${ask[0].docDate ? S.ruDate(ask[0].docDate) : 'давно'}, срок не указан — в расписание не ставлю</div></div></div>
      <div class="chips" style="margin-top:10px">
        <button class="chip on" data-act="med-keep" data-id="${esc(ask[0].id)}">Принимаю</button>
        <button class="chip" data-act="med-stop" data-id="${esc(ask[0].id)}">Уже закончил</button>
      </div>
      ${ask.length > 1 ? `<div class="sm" style="margin-top:8px">И ещё ${ask.length - 1} ${plural(ask.length - 1, 'курс ждёт', 'курса ждут', 'курсов ждут')} ответа</div>` : ''}
    </div>`;
  }

  const d = MED.dayCount(date);
  if (!plan.length) {
    const act = MED.activeMeds(date).length;
    return html + `<div class="grp"><div class="gi" data-act="tab" data-tab="meds">
      ${icon('pill', 'ico s')}
      <div class="t">${act ? 'У курсов не указано время приёма' : 'Курсов сейчас нет'}</div>
      ${chevron()}</div></div>`;
  }

  html += `<div class="cap">Приём лекарств</div>`;
  html += `<div class="card">${dayRibbon(app, date, plan, d)}</div>`;
  return html;
}

/* Лента дня + список выбранной части. Живёт отдельной функцией: тем же
   блоком пользуется вкладка «Лекарства», и расходиться они не должны. */
function dayRibbon(app, date, plan, d) {
  const nowId = MED.currentSlot();
  const byId = Object.fromEntries(plan.map(s => [s.id, s]));
  /* Выбрана та часть дня, на которую человек нажал; иначе — текущая,
     а если в ней уже всё принято, ближайшая, где ещё есть дела.
     Нажать можно и на пустую часть — тогда внизу честно написано, что на это
     время ничего не назначено. Раньше выбор пустой части молча откатывался,
     и кнопка выглядела сломанной. */
  const sel = (app.medSlot && MED.SLOTS.some(s => s.id === app.medSlot)) ? app.medSlot
    : (MED.nowSlot(date)?.id || nowId);
  const cur = byId[sel];

  const done = d.total && d.taken === d.total;
  const left = MED.SLOTS.map(s => {
    const has = byId[s.id];
    const takenIn = has ? has.items.filter(i => i.taken).length : 0;
    const total = has ? has.items.length : 0;
    // ⚠️не 'empty': этот класс в приложении уже занят пустым экраном
    // с отступом в 34 пикселя, и плитка раздувалась втрое
    const state = !total ? 'nil' : takenIn === total ? 'done' : 'todo';
    return `<button class="part ${state} ${sel === s.id ? 'on' : ''} ${nowId === s.id ? 'now' : ''}"
      data-act="med-part" data-slot="${s.id}">
      <div class="pn">${s.title}</div>
      <div class="pv">${state === 'nil' ? '—' : state === 'done' ? icon('check', 'ico s') : `${total - takenIn}`}</div>
    </button>`;
  }).join('');

  // «осталось 3» и «1 из 4» — одно и то же число двумя способами; хватает одного
  let html = `<div class="nm" style="font-size:13px;font-weight:750;margin-bottom:9px">${
    done ? 'Сегодня всё принято' : `Осталось ${d.left} ${plural(d.left, 'приём', 'приёма', 'приёмов')}`}</div>`;
  html += `<div class="ribbon">${left}</div>`;

  html += `<div class="divide"></div>`;
  if (!cur || !cur.items.length) {
    // «на ночь» уже содержит предлог — иначе выходило «На «на ночь»»
    const s = MED.SLOTS.find(x => x.id === sel);
    const when = !s ? 'на это время' : s.id === 'night' ? 'на ночь' : 'на ' + s.title.toLowerCase();
    html += `<div class="sm" style="padding:5px 0 3px">${when[0].toUpperCase() + when.slice(1)} ничего не назначено.</div>`;
  } else {
    html += cur.items.map(i => medRow(i, sel, date)).join('');
  }
  return html;
}

/* Строка приёма: отметка слева, лекарство посередине. Стрелка здесь лишняя —
   вся строка и так открывается, а знак «открывается» спорил бы с кружком. */
function medRow(item, slotId, date) {
  const m = item.med;
  const p = MED.progressOf(m, date);
  const sub = [
    m.dose ? esc(m.dose) : null,
    MED.foodText(m.food),
    p.total ? `день ${Math.max(1, p.day)} из ${p.total}` : null,
  ].filter(Boolean).join(' · ');
  return `<div class="med-row${item.taken ? ' done' : ''}" data-act="med" data-id="${esc(m.id)}">
    <button class="tick${item.taken ? ' on' : ''}" data-act="take" data-id="${esc(m.id)}" data-slot="${esc(slotId)}" data-date="${esc(date)}"
      aria-label="${item.taken ? 'Отменить отметку' : 'Отметить приём'}">${icon('check', 'ico s')}</button>
    <div class="grow">
      <div class="nm">${esc(m.name)}</div>
      <div class="sm">${sub || 'доза не указана — допиши'}</div>
    </div>
  </div>`;
}

/* ── архив внизу главной ─────────────────────────────────────────
   Один блок, а не россыпь: превью документов, строки добавления и
   раскрытие «показать все» живут внутри одной карточки. Раньше архив
   обещал тринадцать файлов, а показывал шесть, и дальше идти было некуда. */
function archive(app, needsAttention) {
  const all = S.state.docs;
  let html = '';
  if (needsAttention) {
    html += `<div class="grp"><div class="gi" data-act="inbox">
      ${icon('warning', 'ico s')}
      <div class="t">${needsAttention} ${plural(needsAttention, 'документ ждёт', 'документа ждут', 'документов ждут')} тебя</div>
      <div class="v">нет даты или не прочитан</div>
      ${chevron()}</div></div>`;
  }

  const addRows = `
    <div class="gi" data-act="scan">${icon('camera', 'ico s')}<div class="t">Снять бланк камерой</div>${chevron()}</div>
    <div class="gi" data-act="add">${icon('file', 'ico s')}<div class="t">Загрузить файл или PDF</div>${chevron()}</div>`;

  if (!all.length) {
    return html + `<div class="cap">Архив</div>
      <div class="grp">${addRows}</div>
      <div class="sm" style="text-align:center;padding:0 10px 6px">Анализы, снимки, выписки и назначения — всё хранится здесь</div>`;
  }

  const open = !!app.archiveOpen;
  const sorted = [...all].sort((a, b) => (b.date || b.addedAt || '').localeCompare(a.date || a.addedAt || ''));
  const shown = open ? sorted : sorted.slice(0, 8);

  html += `<div class="cap">Архив</div>
  <div class="card" style="padding:12px 13px 4px">
    <div class="row" style="align-items:baseline;margin-bottom:9px">
      <div class="grow nm" style="font-size:13px;font-weight:750">${all.length} ${plural(all.length, 'файл', 'файла', 'файлов')}</div>
      <div class="sm">${open ? 'все' : `последние ${shown.length}`}</div>
    </div>
    <div class="grid">${shown.map(docTile).join('')}</div>
    <div class="glist">
      ${all.length > 8 ? `<div class="gi" data-act="archive-toggle">${icon('package', 'ico s')}
        <div class="t">${open ? 'Свернуть' : `Показать все ${all.length}`}</div>${chevron()}</div>` : ''}
      ${addRows}
      <div class="gi" data-act="tab" data-tab="timeline">${icon('calendar', 'ico s')}<div class="t">Хроника по годам</div>${chevron()}</div>
    </div>
  </div>`;
  return html;
}

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const dayTitle = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${S.ruDayMonth(iso)}`;
};

/* ══ ПОКАЗАТЕЛИ ══════════════════════════════════════════════ */

export function markers(app) {
  const list = S.markerList();
  if (!list.length) {
    return head('Показатели', '') + emptyBlock('chartline', 'Пока нет ни одной линии',
      'Как только разберу первый анализ, здесь появятся показатели — каждый со своей историей.',
      `<button class="btn" data-act="add">Закинуть анализ</button>`);
  }

  const groups = { all: 'Все', ...Object.fromEntries([...new Set(list.map(m => m.group))].map(g => [g, GROUP_TITLES[g] || 'Прочее'])) };
  const filter = app.markerFilter || 'all';
  const shown = filter === 'all' ? list : list.filter(m => m.group === filter);

  const attention = shown.filter(m => !m.stale && (m.status === 'out' || m.status === 'edge'));
  const fine = shown.filter(m => !m.stale && m.status === 'ok');
  const unknown = shown.filter(m => !m.stale && m.status === 'unknown');
  const stale = shown.filter(m => m.stale);

  /* «Последний забор» — дата последнего бланка С ЧИСЛАМИ. Раньше сюда попадало
     любое свежее УЗИ, и подпись обещала анализ, которого не было. */
  const lastDate = list.map(m => m.last.date).filter(Boolean).sort().slice(-1)[0];

  let html = head('Показатели', `${list.length} ${plural(list.length, 'показатель', 'показателя', 'показателей')}${lastDate ? ` · последний ${S.ruShort(lastDate)}` : ''}`, avatarBtn + addBtn);
  html += `<div class="segs scroll">${Object.entries(groups).map(([k, t]) =>
    `<button class="seg ${filter === k ? 'on' : ''}" data-act="filter" data-group="${k}">${esc(t)}</button>`).join('')}</div>`;

  const section = (title, arr) => arr.length ? `<div class="cap">${title} · ${arr.length}</div><div class="card list">${arr.map(row).join('')}</div>` : '';
  html += section('Требует внимания', attention);

  html += section('В норме', fine);
  html += section('Норма не указана', unknown);
  html += section('Давно не мерил', stale);
  return html;
}

const GROUP_TITLES = { blood: 'Кровь', liver: 'Печень', lipids: 'Липиды', iron: 'Железо', hormones: 'Гормоны', vitamins: 'Витамины', kidney: 'Почки', sugar: 'Сахар', other: 'Прочее' };

/* Строка списка. Раньше справа под числом висела разница вроде «+3.4» — без
   единицы и без ответа на вопрос «с какого момента». Направление и так видно
   по линии слева, поэтому справа осталось одно: сколько сейчас и в чём. */
function row(m) {
  const ref = (m.last.refLow != null || m.last.refHigh != null) ? `норма ${S.fmtRef(m.last)}` : 'норма не указана';
  const sub = m.stale
    ? `последний раз ${S.ruDate(m.last.date)}`
    : `${ref}${m.last.refSource === 'типовая' ? ' (общая для взрослых)' : ''} · ${m.count} ${plural(m.count, 'замер', 'замера', 'замеров')}`;
  const st = m.stale ? 'unknown' : m.status;
  return `<div class="it" data-act="marker" data-key="${esc(m.key)}">
    ${statusDot(st)}
    <div class="grow"><div class="nm">${esc(m.title)}</div><div class="sm">${esc(sub)}</div></div>
    ${m.stale ? '' : sparkline(m.series, { w: 58, h: 24 })}
    <div style="text-align:right;min-width:52px">
      <div class="val ${m.last.confidence < 0.75 ? 'doubt' : ''}" style="color:${inkTone(st)}">${S.trim(m.last.value)}</div>
      <div class="unit" style="display:block;margin:1px 0 0">${esc(m.unit)}</div>
    </div>
  </div>`;
}

function plural(n, a, b, c) {
  const x = Math.abs(n) % 100, y = x % 10;
  if (x > 10 && x < 20) return c;
  if (y > 1 && y < 5) return b;
  if (y === 1) return a;
  return c;
}

/* ══ ОДИН ПОКАЗАТЕЛЬ ═════════════════════════════════════════ */

export function markerDetail(app) {
  const key = app.param.key;
  const series = S.seriesFor(key);
  if (!series.length) return backHead('Показатель', '') + `<div class="card">Замеров нет.</div>`;

  const last = series[series.length - 1];
  const title = key.startsWith('raw:') ? last.title : markerTitle(key);
  const unit = last.unit;
  const st = last.status;
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const base = series.filter(p => p.date < yearAgo).slice(-1)[0] || series[0];
  const diff = base && base !== last ? +(last.value - base.value).toFixed(2) : null;

  let html = backHead(title, `${series.length} ${plural(series.length, 'замер', 'замера', 'замеров')} · ${unit}`);

  const days = S.distinctDays(series);
  const showDiff = diff != null && days > 1;
  // настоящее ли это изменение или разброс измерения
  const sig = base && base !== last ? S.changeSignificance(key, base.value, last.value) : null;
  /* Сколько времени прошло между сравниваемыми замерами и та ли лаборатория —
     без этого «-0.23 за год» появляется у двух бланков, сданных подряд. */
  const gapDays = base && base !== last ? Math.round((Date.parse(last.date) - Date.parse(base.date)) / 86400000) : 0;
  const sameLab = !base || (base.lab || '') === (last.lab || '');
  const period = gapDays >= 300 ? 'за год' : gapDays >= 45 ? `за ${Math.round(gapDays / 30)} мес.` : 'с прошлого раза';
  const twoLabsCloseInTime = showDiff && gapDays < 45 && !sameLab;
  /* Раньше разница показывалась крупно и в цвете, а отдельной карточкой ниже
     приложение само же её опровергало: «считать изменением рано». Теперь оговорка
     стоит прямо в строке разницы — одно место, одна мысль, без спора с собой. */
  const noise = showDiff && (twoLabsCloseInTime || sig?.significant === false);
  const tone = showDiff && !noise ? S.changeTone(key, base.value, last.value, last.refLow, last.refHigh) : 'flat';
  html += `<div class="card">
    <div class="hero">
      <div class="big" style="color:${inkTone(st)}">${S.trim(last.value)}</div>
      <div class="u">${esc(unit)}</div>
      <div class="grow" style="text-align:right">
        ${statusTag(st, last.value, last.refLow, last.refHigh)}
        <div class="sm" style="margin-top:5px">${S.ruDate(last.date)}${showDiff ? ` · <span class="delta ${tone}">${diff > 0 ? '+' : ''}${S.trim(diff)} ${period}</span>` : ''}</div>
        ${noise ? `<div class="sm" style="margin-top:2px;font-size:11.5px">${twoLabsCloseInTime ? 'но лаборатории разные' : 'это в пределах разброса'}</div>` : ''}
      </div>
    </div>
    ${rangeBar(last.value, last.refLow, last.refHigh, unit, st)}
    ${gradeScale(last.value, MARKERS[key]?.grades)}
    <div class="sm" style="margin-top:12px;line-height:1.5">${last.refLow != null || last.refHigh != null
        ? `Норма <b>${esc(S.fmtRef(last))} ${esc(unit)}</b> — ${last.refSource === 'типовая'
            ? `в бланке границ не было, взял типовую для взрослых${MARKERS[key]?.refBySex ? ` (${db.settings().sex === 'f' ? 'женских' : 'мужских'} — пол меняется в настройках)` : ''}`
            : `так написано в бланке${last.lab ? ' ' + esc(last.lab) : ''}`}`
        : 'Границы нормы в бланке не указаны — сказать «много» или «мало» не по чему'}</div>
  </div>`;

  /* График сразу за числом: сначала «сколько сейчас», потом «как шло». Всё
     остальное — объяснения, оговорки, список замеров — идёт после. */
  if (series.length === 1) {
    html += `<div class="card" style="padding:20px 16px 16px;text-align:center">
      ${chart(series, { unit })}
      <div class="sm" style="margin-top:6px;line-height:1.5">Пока это <b>точка, а не линия</b>. Одно число не говорит, растёт оно или падает.</div>
    </div>`;
  } else {
    html += `<div class="card">${chart(series, { unit })}</div>`;
  }

  /* Объяснение простым языком: сначала «что это», остальное — по нажатию,
     чтобы экран не превращался в справочник. */
  const ref = info(key);
  if (ref) {
    const open = !!app.infoOpen?.[key];
    html += `<div class="card">
      <div class="row" style="align-items:flex-start">
        ${icon('eye', 'ico s')}
        <div class="grow">
          <div class="cap" style="padding:0 0 6px">Что это значит</div>
          <div class="sm" style="font-size:14px;line-height:1.55;color:var(--ink)">${esc(ref.what)}</div>
        </div>
      </div>
      ${!open && st === 'out' && ref.redFlag ? `
        <div class="divide"></div>
        <div class="row" style="align-items:flex-start">${icon('warning', 'ico s')}
          <div class="grow sm" style="line-height:1.55">${esc(ref.redFlag)}</div></div>` : ''}
      ${open ? `
        <div class="divide"></div>
        <div class="cap" style="padding:0 0 5px">Почему бывает выше</div>
        <div class="sm" style="line-height:1.55">${esc(ref.high)}</div>
        <div class="divide"></div>
        <div class="cap" style="padding:0 0 5px">Почему бывает ниже</div>
        <div class="sm" style="line-height:1.55">${esc(ref.low)}</div>
        <div class="divide"></div>
        <div class="cap" style="padding:0 0 5px">Как сдавать правильно</div>
        <div class="sm" style="line-height:1.55">${esc(ref.prep)}</div>
        ${ref.friends?.length ? `
        <div class="divide"></div>
        <div class="cap" style="padding:0 0 7px">Смотрят вместе с этим</div>
        <div class="chips">${ref.friends.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}
        <div class="divide"></div>
        <div class="row" style="align-items:flex-start">${icon('warning', 'ico s')}
          <div class="grow sm" style="line-height:1.55">${esc(ref.redFlag)}</div></div>
      ` : ''}
      <div class="divide"></div>
      <button class="mini" data-act="toggle-info" data-key="${esc(key)}">${open ? 'Свернуть' : 'Подробнее: выше, ниже, как сдавать'}</button>
    </div>`;
  }

  /* Оговорки — одним списком коротких строк. Каждая из них по отдельности
     важна: без них разброс метода и разница лабораторий читаются как динамика.
     Но шестью серыми абзацами подряд они превращались в стену, которую человек
     пролистывает целиком. Одна карточка, одна мысль на строку. */
  const notes = [];
  const labs = S.labsIn(series);

  if (twoLabsCloseInTime) {
    notes.push(`Последние два замера сделаны ${gapDays === 0 ? 'в один день' : `с разницей в ${gapDays} ${plural(gapDays, 'день', 'дня', 'дней')}`} и <b>в разных лабораториях</b> — за такой срок показатель не меняется, это разница метода, а не твоя.`);
  } else if (showDiff && sig?.significant === false) {
    notes.push(`Разница <b>${Math.abs(Math.round(sig.percent))}%</b> меньше естественного разброса этого показателя (около ${Math.round(sig.rcv)}%) — так колеблется даже стабильный результат.`);
  } else if (showDiff && sig?.significant === true) {
    notes.push(`Изменение на <b>${Math.abs(Math.round(sig.percent))}%</b> выходит за естественный разброс (около ${Math.round(sig.rcv)}%) — похоже на настоящий сдвиг.`);
  }
  if (labs.length > 1 && !twoLabsCloseInTime) {
    notes.push(`Замеры из разных лабораторий (${esc(labs.join(', '))}) — методы и калибровка у них не совпадают. Надёжнее сравнивать анализы одной.`);
  }
  const mk = MARKERS[key];
  if (mk?.note) notes.push(esc(mk.note));
  if (last.separated) notes.push('В бланке рядом стоял похожий по названию показатель — держу их <b>раздельно</b>, чтобы не склеить разное в одну линию.');
  if (series.some(m => m.sameDay)) notes.push('В один день есть несколько измерений — это повторные замеры, разницу между ними за изменение не считаю.');

  const converted = series.filter(p => p.converted);
  if (converted.length) {
    const ex = converted[converted.length - 1];
    notes.push(`В бланках были разные единицы — привёл всё к <b>${esc(unit)}</b>. Например, ${S.ruDate(ex.date)}: было ${S.trim(ex.rawValue)} ${esc(ex.rawUnit)}, на графике ${S.trim(ex.value)} ${esc(unit)}.`);
  }
  const names = [...new Set(series.map(p => p.nameRaw).filter(Boolean))];
  if (names.length > 1) notes.push(`В разных бланках назывался по-разному: ${names.map(esc).join(', ')} — это один показатель.`);

  if (notes.length) {
    html += `<div class="card">
      <div class="cap" style="padding:0 0 10px">Что учесть · ${notes.length}</div>
      ${notes.map(t => `<div class="nline"><span>${t}</span></div>`).join('')}
    </div>`;
  }

  if (app.aiMarker?.[key]) {
    html += aiBlock('что я вижу', esc(app.aiMarker[key]).replace(/\n/g, '<br>'));
  } else if (db.settings().apiKey && series.length > 1) {
    html += `<div class="card flat"><div class="row"><button class="mini" data-act="explain" data-key="${esc(key)}">${icon('sparkle', 'ico s')} Что ты об этом думаешь?</button></div></div>`;
  }

  html += `<div class="cap">Все замеры</div><div class="card list">`;
  html += [...series].reverse().map((p, i, arr) => {
    const nxt = arr[i + 1];
    const d = nxt ? +(p.value - nxt.value).toFixed(2) : null;
    const dTone = nxt ? S.changeTone(key, nxt.value, p.value, p.refLow, p.refHigh) : 'flat';
    return `<div class="it" data-act="doc" data-id="${esc(p.docId)}">
      ${statusDot(p.status)}
      <div class="grow"><div class="nm" style="font-size:14px">${S.ruDate(p.date)}</div>
        <div class="sm">${esc(p.lab || 'лаборатория не указана')}${p.converted ? ` · в бланке ${S.trim(p.rawValue)} ${esc(p.rawUnit)}` : ''}</div></div>
      ${d != null && !p.sameDay ? `<div class="delta ${dTone}">${d > 0 ? '+' : ''}${S.trim(d)}</div>` : ''}
      <div class="val ${p.confidence < 0.75 ? 'doubt' : ''}" style="min-width:46px;text-align:right;color:${inkTone(p.status)}">${S.trim(p.value)}</div>
    </div>`;
  }).join('');
  html += `</div>`;

  html += `<div class="disc">${last.refSource === 'типовая'
    ? 'Это не диагноз. Границ в бланке не было — я взял общие для взрослых, у твоей лаборатории они могут отличаться. Обсуди с врачом.'
    : 'Это не диагноз. Границы нормы — из бланка лаборатории. Обсуди с врачом.'}</div>`;
  return html;
}

/* ══ ХРОНИКА ═════════════════════════════════════════════════ */

export function timeline(app) {
  const all = S.state.docs;
  if (!all.length) {
    return backHeadWide('Хроника', '') + emptyBlock('calendar', 'Здесь будет твоя история',
      'Анализы, снимки, заключения врачей и PDF из лаборатории — всё по годам, в одном месте.',
      `<button class="btn" data-act="add">Закинуть документы</button>`);
  }

  const filter = app.docFilter || 'all';
  const kinds = { all: 'Всё', blood: 'Анализы', imaging: 'Снимки', conclusion: 'Заключения', prescription: 'Назначения', other: 'Другое' };
  const inKind = (d) => {
    if (filter === 'all') return true;
    if (filter === 'blood') return ['blood', 'urine'].includes(d.type);
    if (filter === 'imaging') return d.type === 'imaging';
    if (filter === 'conclusion') return d.type === 'conclusion';
    if (filter === 'prescription') return d.type === 'prescription';
    return !['blood', 'urine', 'imaging', 'conclusion', 'prescription'].includes(d.type);   // «Другое» ловит всё остальное
  };
  const shown = all.filter(inKind);

  // документы, которым нужно внимание, показываем отдельно и всегда — они не должны теряться
  const pending = shown.filter(d => ['queued', 'reading', 'needs-date', 'error', 'skipped', 'duplicate', 'foreign', 'needs-file'].includes(d.status));
  const done = shown.filter(d => d.status === 'ready');

  // «разобрано 12 из 12» — новость только тогда, когда что-то ещё не разобрано
  const ready = all.filter(d => d.status === 'ready').length;
  let html = backHeadWide('Хроника', `${all.length} ${plural(all.length, 'файл', 'файла', 'файлов')}${ready < all.length ? ` · разобрано ${ready}` : ''}`, avatarBtn + addBtn);
  html += `<div class="segs scroll">${Object.entries(kinds).map(([k, t]) =>
    `<button class="seg ${filter === k ? 'on' : ''}" data-act="dfilter" data-kind="${k}">${esc(t)}</button>`).join('')}</div>`;

  if (pending.length) {
    html += `<div class="cap">Ждут тебя · ${pending.length}</div><div class="card list">`;
    html += pending.map(d => docRow(d, true)).join('');
    html += `</div>`;
  }

  const byYear = {};
  for (const d of done) {
    const y = d.date ? d.date.slice(0, 4) : 'без даты';
    (byYear[y] ||= []).push(d);
  }
  const years = Object.keys(byYear).sort((a, b) => {
    if (a === 'без даты') return -1;
    if (b === 'без даты') return 1;
    return b.localeCompare(a);
  });

  for (const y of years) {
    html += `<div class="cap">${esc(y)}</div><div class="card list">`;
    html += byYear[y].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(d => docRow(d, false)).join('');
    html += `</div>`;
  }

  if (!shown.length) {
    html += `<div class="card"><div class="sm" style="line-height:1.5">В этой группе пусто. Нажми «Всё» — там лежат все ${all.length} ${plural(all.length, 'файл', 'файла', 'файлов')}.</div></div>`;
  }

  // пробелы во времени — только когда есть на чём их считать
  const span = S.yearsSpan();
  if (span && filter === 'all') {
    const have = new Set(all.filter(d => d.date).map(d => d.date.slice(0, 4)));
    const gaps = [];
    for (let y = +span.from.slice(0, 4); y <= +span.to.slice(0, 4); y++) if (!have.has(String(y))) gaps.push(y);
    if (gaps.length) {
      html += `<div class="card flat"><div class="row">${icon('hourglass', 'ico s')}
        <div class="grow"><div class="nm" style="font-size:14px">Пробел: ${gaps.slice(0, 3).join(', ')}${gaps.length > 3 ? '…' : ''}</div>
          <div class="sm">Ни одного документа за ${gaps.length === 1 ? 'этот год' : 'эти годы'} — если что-то было, закинь</div></div>
        <button class="mini" data-act="add">Добавить</button></div></div>`;
    }
  }
  return html;
}

/* Сырое сообщение от модели или браузера человеку ничего не говорит */
function humanFail(err) {
  const m = String(err || '');
  if (/402|не хватает средств/i.test(m)) return 'На счету OpenRouter кончились средства — пополни, и я дочитаю.';
  if (/401|не принят/i.test(m)) return 'Ключ OpenRouter не принят. Проверь его в настройках.';
  if (/429|Слишком часто/i.test(m)) return 'Модель попросила подождать — попробуй через пару минут.';
  if (/оборвался/i.test(m)) return m;
  if (/две минуты|таймаут|timeout/i.test(m)) return 'Модель не ответила вовремя. Попробуй ещё раз или выбери другую.';
  if (/интернет|связи|network|fetch/i.test(m)) return 'Не было связи. Попробуй ещё раз.';
  if (/пароль/i.test(m)) return m;
  if (/JSON|Unexpected/i.test(m)) return 'Модель ответила не по форме. Попробуй ещё раз или возьми другую модель.';
  return m || 'Не понял, что пошло не так. Попробуй ещё раз.';
}

const STATUS_BADGE = {
  queued:      ['в очереди', 'ждёт разбора'],
  reading:     ['читаю', 'сейчас разбираю'],
  'needs-date':['нет даты', 'без даты не встанет в линию'],
  error:       ['не прочитал', null],
  skipped:     ['не медицинский', 'ничего не сохранил'],
  duplicate:   ['дубль', 'такой документ уже есть'],
  foreign:     ['чужое имя', 'в бланке другой пациент'],
  'needs-file':['нет снимка', 'вернулся из копии без картинки'],
};

function docRow(d, showBadge) {
  const ms = S.state.meas.filter(m => m.docId === d.id);
  /* Раньше справа стояла цветная точка — и что она означает, знал только я.
     Теперь там число: сколько показателей этого бланка вышли за границы.
     Если всё в порядке, справа пусто: тишина — тоже ответ. */
  const known = ms.filter(m => m.refLow != null || m.refHigh != null);
  const outCount = known.filter(m => (m.refLow != null && m.value < m.refLow) || (m.refHigh != null && m.value > m.refHigh)).length;
  const badge = STATUS_BADGE[d.status];
  const rx = MED.state.meds.filter(m => m.docId === d.id).length;
  const parts = [
    d.date ? S.ruDayMonth(d.date) : (badge ? null : 'дата не разобрана'),
    d.lab,
    ms.length ? `${ms.length} ${plural(ms.length, 'показатель', 'показателя', 'показателей')}` : null,
    rx ? `${rx} ${plural(rx, 'лекарство', 'лекарства', 'лекарств')}` : null,
    d.isPdf ? `PDF · ${d.pageCount || (d.pages || []).length} ${plural(d.pageCount || 1, 'страница', 'страницы', 'страниц')}` : null,
  ].filter(Boolean);
  const sub = showBadge && badge
    ? [badge[1] || d.error || '', esc(d.fileName || '')].filter(Boolean).join(' · ')
    : parts.join(' · ');

  return `<div class="it" data-act="doc" data-id="${esc(d.id)}">
    <div style="width:20px;color:var(--ink4);display:flex;justify-content:center">${icon(docIcon(d.type, d.isPdf), 'ico s')}</div>
    <div class="grow"><div class="nm">${esc(d.title || d.fileName || 'Документ')}</div>
      <div class="sm">${esc(sub)}</div></div>
    ${showBadge && badge
      ? (['queued', 'reading'].includes(d.status) ? `<div class="spin"></div>` : `<span class="mini">${esc(badge[0])}</span>`)
      : (outCount ? `<div style="text-align:right;min-width:44px">
          <div class="val c-out" style="font-size:15px">${outCount}</div>
          <div class="unit" style="display:block;margin:1px 0 0">вне нормы</div></div>` : '')}
  </div>`;
}

/* Плитка архива: сама страница документа, а не рассказ о ней.
   Справа вверху — единственное число, ради которого стоит открыть бланк:
   сколько показателей вышли за границы. У документов, которым нужно
   внимание, там стоит восклицательный знак, а не число. */
function docTile(d) {
  const ms = S.state.meas.filter(m => m.docId === d.id);
  const known = ms.filter(m => m.refLow != null || m.refHigh != null);
  const outCount = known.filter(m => (m.refLow != null && m.value < m.refLow) || (m.refHigh != null && m.value > m.refHigh)).length;
  const busy = ['queued', 'reading'].includes(d.status);
  const problem = ['needs-date', 'error', 'skipped', 'duplicate', 'foreign', 'needs-file'].includes(d.status);
  const shot = (d.pages && d.pages[0]) || d.blobId || null;
  const pages = d.pageCount || (d.pages || []).length;

  const badge = problem ? `<div class="bdg wait">!</div>`
    : busy ? `<div class="bdg wait">…</div>`
    : outCount ? `<div class="bdg">${outCount}</div>` : '';

  /* Подпись — только дата: название всё равно не помещается в 70 пикселей,
     а сам документ узнаётся по своей же шапке на превью. Полное название
     ждёт на экране документа. */
  return `<button class="tile" data-act="doc" data-id="${esc(d.id)}" title="${esc(d.title || d.fileName || '')}">
    <div class="ph">
      ${shot ? `<img data-blob="${esc(shot)}" alt="" loading="lazy">` : icon(docIcon(d.type, d.isPdf), 'ico l')}
      ${badge}
      ${pages > 1 ? `<div class="pg">${pages}</div>` : ''}
    </div>
    <div class="d2">${tileDate(d, busy)}</div>
  </button>`;
}

/* В семьдесят пикселей влезает только короткая дата; год добавляем,
   лишь когда документ не этого года. */
function tileDate(d, busy) {
  if (!d.date) return busy ? '…' : 'без даты';
  const [y, m, day] = d.date.split('-');
  return `${day}.${m}${y === S.todayISO().slice(0, 4) ? '' : '.' + y.slice(2)}`;
}

function docIcon(type, isPdf) {
  const byType = { blood: 'drop', urine: 'drop', imaging: 'waves', conclusion: 'stethoscope', prescription: 'pill', vaccination: 'firstaid' }[type];
  return byType || (isPdf ? 'file' : 'file');
}

/* ══ ДОКУМЕНТ ════════════════════════════════════════════════ */

export function docView(app) {
  const doc = S.state.docs.find(d => d.id === app.param.id);
  if (!doc) return backHead('Документ', '') + `<div class="card">Документ не найден.</div>`;
  /* Порядок как в бланке — по группам, внутри по названию: иначе список
     выглядит случайной кучей и глазами по нему не пройтись. */
  const GORDER = ['blood', 'lipids', 'sugar', 'liver', 'kidney', 'iron', 'vitamins', 'hormones', 'other'];
  const ms = S.state.meas.filter(m => m.docId === doc.id).slice().sort((a, b) => {
    const ga = GORDER.indexOf(markerGroup(a.key)), gb = GORDER.indexOf(markerGroup(b.key));
    if (ga !== gb) return (ga < 0 ? 99 : ga) - (gb < 0 ? 99 : gb);
    return (a.title || '').localeCompare(b.title || '', 'ru');
  });
  const doubts = ms.filter(m => m.confidence < 0.75);

  let html = backHead(doc.title || 'Документ',
    [doc.date ? S.ruDate(doc.date) : 'дата не разобрана', doc.lab,
     ms.length ? `${ms.length} ${plural(ms.length, 'показатель', 'показателя', 'показателей')}` : null].filter(Boolean).join(' · '));

  const pages = (doc.pages && doc.pages.length) ? doc.pages : (doc.blobId ? [doc.blobId] : []);
  if (pages.length) {
    html += `<div class="card" style="padding:12px">
      ${pages.map((b, i) => `<img class="shot-big" data-blob="${esc(b)}" alt="страница ${i + 1}" style="${i ? 'margin-top:8px' : ''}"/>`).join('')}
      ${doc.isPdf ? `<div class="sm" style="margin-top:9px">PDF, ${doc.pageCount || pages.length} ${plural(doc.pageCount || pages.length, 'страница', 'страницы', 'страниц')}</div>` : ''}
      ${doc.pagesSkipped ? `<div class="sm" style="margin-top:8px">Разобрал первые ${pages.length} — остальные ${doc.pagesSkipped} пропустил, чтобы не тратить лишнего</div>` : ''}
      ${doc.pageErrors ? `<div class="sm" style="margin-top:8px;color:var(--bad)">Страницы ${doc.pageErrors.map(e => e.page).join(', ')} прочитать не вышло: ${esc(humanFail(doc.pageErrors[0].error))}</div>` : ''}
    </div>`;
  } else {
    html += `<div class="card flat"><div class="row">${icon('warning', 'ico s')}
      <div class="grow"><div class="nm" style="font-size:14px">Оригинал остался на прежнем устройстве</div>
        <div class="sm">Числа восстановлены из облака Телеграма, снимок — нет. Можно закинуть его заново</div></div>
      <button class="mini" data-act="add">Добавить</button></div></div>`;
  }

  if (doc.status === 'needs-date') {
    html += `<div class="card note">
      <div class="row">${icon('warning', 'ico s')}<div class="grow"><div class="nm" style="font-size:14px">Дата не читается</div></div></div>
      <div class="sm" style="margin:8px 0 11px">${doc.fileDate ? `Файл создан <b>${S.ruDate(doc.fileDate)}</b>. Взять эту дату?` : 'Укажи дату вручную — без неё показатели не встанут в линию.'}</div>
      <div class="chips">
        ${doc.fileDate ? `<button class="chip on" data-act="use-file-date" data-id="${esc(doc.id)}">Да, ${S.ruShort(doc.fileDate)}</button>` : ''}
        <button class="chip" data-act="pick-date" data-id="${esc(doc.id)}">Выбрать дату</button>
      </div>
    </div>`;
  }

  if (doc.status === 'duplicate') {
    html += `<div class="card flat"><div class="row">${icon('recycle', 'ico s')}
      <div class="grow"><div class="nm" style="font-size:14px">Похоже на дубль</div>
        <div class="sm">Такой же документ за эту дату уже есть — показатели не задваивал</div></div>
      <button class="mini" data-act="undup" data-id="${esc(doc.id)}">Всё равно учесть</button></div></div>`;
  }

  /* Чужой бланк. Архив рассчитан на одного человека: числа родственника,
     влившись в твои линии, тихо испортят всю картину. */
  if (doc.status === 'foreign') {
    html += `<div class="card note">
      <div class="row">${icon('warning', 'ico s')}<div class="grow"><div class="nm" style="font-size:14px">В бланке другое имя</div></div></div>
      <div class="sm" style="margin:8px 0 11px;line-height:1.5">Здесь написано <b>${esc(doc.patientName || 'другое имя')}</b>, а в остальном архиве — другой человек. Числа сохранил, но в твои линии не поставил: смешивать анализы разных людей нельзя.</div>
      <div class="chips">
        <button class="chip on" data-act="mine" data-id="${esc(doc.id)}">Это мои анализы</button>
        <button class="chip" data-act="del-doc" data-id="${esc(doc.id)}">Удалить документ</button>
      </div>
    </div>`;
  }

  if (doc.status === 'error') {
    html += `<div class="card note">
      <div class="row">${icon('warning', 'ico s')}<div class="grow"><div class="nm" style="font-size:14px">Не смог прочитать</div></div></div>
      <div class="sm" style="margin:8px 0 11px;line-height:1.5">${esc(humanFail(doc.error))}</div>
      <div class="chips">
        <button class="chip on" data-act="retry" data-id="${esc(doc.id)}">Попробовать ещё раз</button>
        <button class="chip" data-act="add">Снять заново</button>
      </div>
    </div>`;
  }

  if (doc.status === 'skipped') {
    html += `<div class="card note">
      <div class="row">${icon('eye', 'ico s')}<div class="grow"><div class="nm" style="font-size:14px">Похоже, это не бланк</div></div></div>
      <div class="sm" style="margin:8px 0 11px;line-height:1.5">Я не увидел здесь медицинского документа и ничего не сохранил. Если это всё-таки анализ — попробую ещё раз.</div>
      <button class="chip on" data-act="retry" data-id="${esc(doc.id)}">Всё-таки разобрать</button>
    </div>`;
  }

  if (doc.status === 'needs-file') {
    html += `<div class="card note">
      <div class="row">${icon('warning', 'ico s')}<div class="grow"><div class="nm" style="font-size:14px">Снимок остался на прежнем устройстве</div></div></div>
      <div class="sm" style="margin:8px 0 11px;line-height:1.5">Этот документ пришёл из копии без картинки, и разобрать его заново нечем. Загрузи бланк снова — числа встанут на место.</div>
      <button class="chip on" data-act="add">Загрузить снимок</button>
    </div>`;
  }

  if (['queued', 'reading'].includes(doc.status)) {
    html += `<div class="card flat"><div class="row"><div class="spin"></div>
      <div class="grow"><div class="nm" style="font-size:14px">${doc.status === 'reading' ? 'Читаю прямо сейчас' : 'В очереди на разбор'}</div>
        <div class="sm">${doc.readingPage ? `страница ${doc.readingPage.n} из ${doc.readingPage.of}` : 'можно свернуть приложение — разбор продолжится'}</div></div></div></div>`;
  }

  // документ, у которого часть страниц не прочиталась, — это не «разобрано»
  if (doc.status === 'ready' && doc.pageErrors?.length) {
    html += `<div class="card note">
      <div class="row">${icon('warning', 'ico s')}<div class="grow"><div class="nm" style="font-size:14px">Прочитал не всё</div></div></div>
      <div class="sm" style="margin:8px 0 11px;line-height:1.5">${doc.pageErrors.length} ${plural(doc.pageErrors.length, 'страница', 'страницы', 'страниц')} из ${doc.pageCount || '?'} не поддались, значит часть показателей сюда не попала.</div>
      <button class="chip on" data-act="retry" data-id="${esc(doc.id)}">Дочитать</button>
    </div>`;
  }

  if (doc.conclusion) {
    html += `<div class="card"><div class="cap" style="padding:0 0 8px">Заключение</div>
      <div class="sm" style="font-size:14px;line-height:1.55;color:var(--ink)">${esc(doc.conclusion)}</div></div>`;
  }

  /* Назначения из этого документа — рядом со снимком, чтобы сверять глазами,
     не уходя с экрана: доза читается с оригинала выше. */
  const rx = MED.state.meds.filter(m => m.docId === doc.id);
  if (rx.length) {
    const today = S.todayISO();
    html += `<div class="cap">Назначено · ${rx.length}</div><div class="card list">`;
    html += rx.map(m => `<div class="it" data-act="med" data-id="${esc(m.id)}">
      ${icon('pill', 'ico s')}
      <div class="grow"><div class="nm">${esc(m.name)}${m.dose ? ` · ${esc(m.dose)}` : ''}</div>
        <div class="sm">${esc(MED.scheduleText(m))} · ${esc(MED.courseText(m, today))}${!m.confirmed ? ' · не проверено' : ''}</div></div>
      ${chevron()}</div>`).join('');
    html += `</div>`;
    html += `<div class="sm" style="margin:-4px 4px 14px;line-height:1.5">Сверь дозу и частоту с оригиналом выше — я мог прочитать почерк неверно. Приёмы уже стоят в расписании дня.</div>`;
  }

  if (doubts.length) {
    html += `<div class="card note">
      <div class="row">${icon('eye', 'ico s')}<div class="grow"><div class="nm" style="font-size:14px">${doubts.length === 1 ? 'Одно число прочитал неуверенно' : `${doubts.length} чисел прочитал неуверенно`}</div>
        <div class="sm">Сверь с оригиналом выше — это десять секунд</div></div></div>
      ${doubts.map(m => `<div class="divide"></div>
        <div class="row"><div class="grow"><div class="nm" style="font-size:14px">${esc(m.title)}</div>
          <div class="sm">впиши, как напечатано в бланке${m.rawUnit || m.unit ? `, в ${esc(m.rawUnit || m.unit)}` : ''}${m.converted ? ` · в линии это будет ${S.trim(m.value)} ${esc(m.unit)}` : ''}</div></div>
          <input type="text" inputmode="decimal" value="${S.trim(m.rawValue ?? m.value)}" data-fix="${esc(m.id)}" style="width:92px;text-align:right;font-weight:700">
          <button class="mini" data-act="confirm-meas" data-id="${esc(m.id)}">Ок</button></div>`).join('')}
    </div>`;
  }

  if (ms.length) {
    html += `<div class="cap">Что распознано</div><div class="card list">`;
    /* Тот же вид строки, что на «Показателях» и в сводке: точка, имя, норма,
       число. Слово «в норме» зелёным жирным стояло рядом с зелёной точкой,
       которая уже это сказала, — цвет работал вхолостую семь строк подряд. */
    html += ms.map(m => {
      const st = m.refLow != null || m.refHigh != null
        ? (m.value < (m.refLow ?? -Infinity) ? 'out' : m.value > (m.refHigh ?? Infinity) ? 'out' : 'ok') : 'unknown';
      return `<div class="it" data-act="marker" data-key="${esc(m.key)}">
        ${statusDot(st)}
        <div class="grow"><div class="nm">${esc(m.title)}</div>
          <div class="sm">${m.refSource ? `норма ${esc(S.fmtRef(m))}${m.refSource === 'типовая' ? ' (общая для взрослых)' : ''}` : 'норма не указана'}</div></div>
        <div style="text-align:right;min-width:50px">
          <div class="val ${m.confidence < 0.75 ? 'doubt' : ''}" style="color:${inkTone(st)}">${S.trim(m.value)}</div>
          <div class="unit" style="display:block;margin:1px 0 0">${esc(m.unit)}</div>
        </div>
      </div>`;
    }).join('');
    html += `</div>`;
  }

  if (doc.note) html += `<div class="card flat"><div class="row">${icon('warning', 'ico s')}<div class="grow sm">${esc(doc.note)}</div></div></div>`;
  html += `<div class="grp"><div class="gi" data-act="del-doc" data-id="${esc(doc.id)}">${icon('trash', 'ico s')}
    <div class="t" style="color:var(--bad)">Удалить документ</div>${chevron()}</div></div>`;
  return html;
}

/* ══ ПРИЁМ И РАЗБОР ══════════════════════════════════════════ */

export function inbox(app) {
  const q = S.state.docs.filter(d => ['queued', 'reading'].includes(d.status));
  const problems = S.state.docs.filter(d => ['needs-date', 'error', 'skipped', 'duplicate', 'foreign', 'needs-file'].includes(d.status) || (d.status === 'ready' && d.pageErrors?.length));
  const recent = S.state.docs.filter(d => d.status === 'ready').slice(0, 6);

  let html = backHead('Разбор', q.length ? `${S.state.queue.done} из ${S.state.queue.total || q.length}` : `${problems.length} ${plural(problems.length, 'документ ждёт', 'документа ждут', 'документов ждут')} тебя`);

  if (q.length) {
    const pct = S.state.queue.total ? Math.round(S.state.queue.done / S.state.queue.total * 100) : 5;
    const rp = q[0].readingPage;
    html += `<div class="card"><div class="prog"><i style="width:${pct}%"></i></div>
      <div class="sm" style="margin-top:10px">Читаю ${esc(q[0].fileName || 'документ')}${rp ? ` · страница ${rp.n} из ${rp.of}` : ''}… Можно закрыть приложение — допишу в фоне.</div></div>`;
  }

  if (!q.length && !problems.length && recent.length) {
    html += `<div class="card"><div class="row">${icon('check', 'ico s')}<div class="grow"><div class="nm">Всё разобрано</div>
      <div class="sm">${recent.length} последних документов в хронике</div></div></div></div>`;
  }

  for (const d of problems) {
    const kind = {
      'ready': ['Прочитал не всё', `${(d.pageErrors || []).length} ${plural((d.pageErrors || []).length, 'страница', 'страницы', 'страниц')} не поддались — часть показателей не попала в архив`],
      'needs-date': ['Дата не читается', 'Без даты показатели не встают в линию'],
      'error': ['Не смог прочитать', humanFail(d.error)],
      'skipped': ['Похоже, это не медицинский документ', 'Ничего не сохранил'],
      'duplicate': ['Дубль', 'Такой же документ за эту дату уже есть'],
      'foreign': ['В бланке другое имя', 'Числа не попали в линии — открой и подтверди, что это твоё'],
      'needs-file': ['Снимок остался на прежнем устройстве', 'Числа есть, картинки нет — загрузи бланк заново'],
    }[d.status];
    html += `<div class="card">
      <div class="row">
        <div class="thumb" style="width:44px;aspect-ratio:3/4"><img data-blob="${esc(d.blobId)}" alt=""></div>
        <div class="grow"><div class="nm">${esc(kind[0])}</div><div class="sm">${esc(d.fileName || d.title || '')}${kind[1] ? ' · ' + esc(kind[1]) : ''}</div></div>
        <button class="mini" data-act="doc" data-id="${esc(d.id)}">Открыть</button>
      </div>
      ${d.status === 'error' ? `<div class="divide"></div><div class="row"><button class="mini" data-act="retry" data-id="${esc(d.id)}">Попробовать ещё раз</button>
        <button class="mini warn" data-act="del-doc" data-id="${esc(d.id)}">Удалить</button></div>` : ''}
    </div>`;
  }

  if (recent.length) {
    html += `<div class="cap">Разобрано</div><div class="card list">`;
    html += recent.map(d => `<div class="it" data-act="doc" data-id="${esc(d.id)}">
      ${icon(docIcon(d.type), 'ico s')}
      <div class="grow"><div class="nm">${esc(d.title)}</div><div class="sm">${d.date ? S.ruDate(d.date) : '—'}${d.lab ? ' · ' + esc(d.lab) : ''}</div></div>
      <div class="sm">${S.state.meas.filter(m => m.docId === d.id).length} показ.</div>
    </div>`).join('');
    html += `</div>`;
  }

  html += `<button class="btn ghost" data-act="add">Добавить ещё</button>`;
  return html;
}

/* ══ ЛЕКАРСТВА ═══════════════════════════════════════════════ */

export function medsView(app) {
  const date = S.todayISO();
  const all = MED.state.meds;
  const plan = MED.planFor(date);
  const d = MED.dayCount(date);
  const active = MED.activeMeds(date);

  const addBtnMed = `<button class="rnd dark" data-act="med-new">${icon('plus', 'ico s')}</button>`;
  let html = head('Лекарства', dayTitle(date), avatarBtn + addBtnMed);

  if (!all.length) {
    return html + emptyBlock('pill', 'Назначения — сюда',
      'Сфотографируй рецепт, лист назначений или выписку. Прочитаю <b>что, сколько раз в день и сколько дней</b> принимать — и разложу по утрам, дням и вечерам.',
      `<button class="btn" data-act="add">${icon('camera', 'ico s')}Снять назначение</button>
       <button class="btn ghost" data-act="med-new" style="margin-top:10px">Добавить лекарство руками</button>`)
      + `<div class="disc">Приложение только помнит назначенное врачом. Оно ничего не назначает и не отменяет.</div>`;
  }

  /* Про непроверенное здесь молчим: это написано в каждой строке курса ниже.
     Одна мысль в одном месте — иначе экран превращается в напоминалку. */
  const check = MED.unconfirmed();

  const ask = MED.askMeds(date);
  if (ask.length) {
    html += `<div class="cap">Ещё принимаешь? · ${ask.length}</div>`;
    for (const m of ask) {
      html += `<div class="card note">
        <div class="row">${icon('clock', 'ico s')}
          <div class="grow"><div class="nm" style="font-size:14px">${esc(m.name)}${m.dose ? ` · ${esc(m.dose)}` : ''}</div>
            <div class="sm">Назначено ${m.docDate ? S.ruDate(m.docDate) : 'давно'}, срок не указан. В расписание не ставлю, пока не ответишь</div></div></div>
        <div class="chips" style="margin-top:11px">
          <button class="chip on" data-act="med-keep" data-id="${esc(m.id)}">Принимаю</button>
          <button class="chip" data-act="med-stop" data-id="${esc(m.id)}">Закончил</button>
          <button class="chip" data-act="med" data-id="${esc(m.id)}">Открыть</button>
        </div></div>`;
    }
  }

  if (plan.length) {
    // тот же блок, что на главной: расписание дня не должно выглядеть
    // в двух местах по-разному
    html += `<div class="cap">Сегодня</div><div class="card">${dayRibbon(app, date, plan, d)}</div>`;
  } else if (active.length) {
    html += `<div class="card flat"><div class="row">${icon('warning', 'ico s')}
      <div class="grow sm">У активных курсов не указано время приёма — открой курс и поставь утро, день или вечер.</div></div></div>`;
  }

  const later = all.filter(m => MED.statusOf(m, date) === 'later');
  const past = all.filter(m => ['done', 'stopped'].includes(MED.statusOf(m, date)));

  if (active.length) {
    html += `<div class="cap">Курсы · ${active.length}</div><div class="card list">`;
    html += active.map(m => medCourseRow(m, date)).join('');
    html += `</div>`;
  }
  if (later.length) {
    html += `<div class="cap">Начнутся позже</div><div class="card list">${later.map(m => medCourseRow(m, date)).join('')}</div>`;
  }
  if (past.length) {
    html += `<div class="cap">Закончены · ${past.length}</div><div class="card list">${past.slice(0, 12).map(m => medCourseRow(m, date)).join('')}</div>`;
  }

  html += `<div class="grp">
    <div class="gi" data-act="med-new">${icon('plus', 'ico s')}<div class="t">Добавить лекарство руками</div>${chevron()}</div>
    <div class="gi" data-act="add">${icon('camera', 'ico s')}<div class="t">Снять назначение врача</div>${chevron()}</div>
  </div>`;
  html += `<div class="disc">Приложение не звонит и не шлёт уведомлений — оно живёт внутри Телеграма. Лечение назначает врач: здесь оно только записано.</div>`;
  return html;
}

function medCourseRow(m, date) {
  const st = MED.statusOf(m, date);
  const unchecked = m.source === 'ai' && !m.confirmed;
  return `<div class="it" data-act="med" data-id="${esc(m.id)}">
    <div class="grow"><div class="nm">${esc(m.name)}${m.dose ? ` · ${esc(m.dose)}` : ''}</div>
      <div class="sm">${esc(MED.scheduleText(m))} · ${esc(MED.courseText(m, date))}${unchecked ? ' · не проверено' : ''}</div></div>
    ${chevron()}</div>`;
}

/* ══ ОДИН КУРС ═══════════════════════════════════════════════ */

export function medDetail(app) {
  const m = MED.state.meds.find(x => x.id === app.param.id);
  if (!m) return backHead('Курс', '') + `<div class="card">Курс не найден.</div>`;
  const date = S.todayISO();
  const st = MED.statusOf(m, date);
  const p = MED.progressOf(m, date);
  const doc = m.docId ? S.state.docs.find(d => d.id === m.docId) : null;

  let html = backHead(m.name, [m.dose, m.form].filter(Boolean).join(' · ') || 'доза не указана');

  const stWord = { active: 'принимаешь сейчас', done: 'курс закончен', stopped: 'приём остановлен', later: 'ещё не начался', ask: 'нужно подтвердить' }[st];
  /* «5 из 30», полоса и слово о состоянии — об одном и том же. Раньше здесь
     стояли ещё и тег «активен», и подпись «принимаешь сейчас»: четыре способа
     сказать одно. Осталось число, полоса под ним и одна строка словами.
     Начало и окончание — одной строкой: это один отрезок, а не два факта. */
  html += `<div class="card">
    <div class="hero" style="align-items:baseline">
      <div class="big" style="font-size:34px">${p.total ? `${Math.max(1, Math.min(p.day, p.total))}<span style="font-size:16px;font-weight:650;color:var(--ink3);margin-left:6px">из ${p.total}</span>` : '—'}</div>
      <div class="grow sm" style="text-align:right">${p.total ? 'день курса' : stWord}</div>
    </div>
    ${p.total ? `<div class="prog" style="margin-top:10px"><i style="width:${Math.max(2, Math.min(100, Math.round((p.day / p.total) * 100)))}%"></i></div>` : ''}
    <div class="divide"></div>
    <div class="kv"><span class="k">Когда принимать</span><span class="v">${esc(MED.scheduleText(m))}${MED.foodText(m.food) ? ', ' + MED.foodText(m.food) : ''}</span></div>
    <div class="kv"><span class="k">Срок</span><span class="v">${m.startDate ? S.ruShort(m.startDate) : '—'}${p.end ? ` – ${S.ruShort(p.end)}` : ' · без окончания'}</span></div>
    ${m.instructions ? `<div class="kv"><span class="k">Как принимать</span><span class="v">${esc(m.instructions)}</span></div>` : ''}
    ${m.freqText ? `<div class="sm" style="margin-top:9px">В назначении написано: «${esc(m.freqText)}»</div>` : ''}
  </div>`;

  if (m.source === 'ai' && !m.confirmed) {
    html += `<div class="card note">
      <div class="row">${icon('warning', 'ico s')}<div class="grow"><div class="nm" style="font-size:14px">Прочитано с документа — сверь</div></div></div>
      <div class="sm" style="margin:8px 0 11px;line-height:1.5">Название, дозу и время я взял с ${doc ? 'документа' : 'назначения'}${m.confidence < 0.75 ? ', и часть строки читалась неуверенно' : ''}. Ошибка в дозе опаснее пропуска — посмотри на оригинал и подтверди.</div>
      <div class="chips">
        <button class="chip on" data-act="med-ok" data-id="${esc(m.id)}">Всё верно</button>
        <button class="chip" data-act="med-edit" data-id="${esc(m.id)}">Исправить</button>
      </div>
    </div>`;
  }

  if (m.missing?.length) {
    html += `<div class="card note"><div class="row">${icon('warning', 'ico s')}
      <div class="grow"><div class="nm" style="font-size:14px">${m.missing.includes('schedule') ? 'Не знаю, когда принимать' : 'Не знаю дозу'}</div>
        <div class="sm">В документе этого не было, а придумывать нельзя. Допиши — и курс встанет в расписание дня.</div></div></div>
      <button class="chip on" data-act="med-edit" data-id="${esc(m.id)}" style="margin-top:11px">Дописать</button></div>`;
  }

  const days = MED.recentDays(m, 14, date);
  const adh = MED.adherence(m, date);
  if (days.length > 1) {
    html += `<div class="cap">Как шло</div><div class="card">
      <div class="daygrid">${days.map(d => {
        const cls = d.marks.every(x => x === 'taken') ? 'full' : d.some ? 'part' : 'none';
        return `<div class="daycell ${cls}" title="${d.date}"><span>${+d.date.slice(8, 10)}</span></div>`;
      }).join('')}</div>
      ${adh && adh.planned ? `<div class="sm" style="margin-top:11px">Отмечено ${adh.taken} из ${adh.planned} приёмов за ${adh.days} ${plural(adh.days, 'день', 'дня', 'дней')}. Считаются только отмеченные — если принял и забыл отметить, я об этом не знаю.</div>` : ''}
    </div>`;
  }

  if (doc) {
    html += `<div class="cap">Откуда</div>
    <div class="card tap" data-act="doc" data-id="${esc(doc.id)}"><div class="row">
      ${icon(docIcon(doc.type, doc.isPdf), 'ico s')}
      <div class="grow"><div class="nm">${esc(doc.title || doc.fileName || 'Документ')}</div>
        <div class="sm">${doc.date ? S.ruDate(doc.date) : 'дата не разобрана'}${doc.lab ? ' · ' + esc(doc.lab) : ''}</div></div>
      ${chevron()}</div></div>`;
  }

  html += `<div class="grp">
    <div class="gi" data-act="med-edit" data-id="${esc(m.id)}">${icon('note', 'ico s')}<div class="t">Изменить курс</div>${chevron()}</div>
    ${st === 'active' || st === 'ask'
      ? `<div class="gi" data-act="med-stop" data-id="${esc(m.id)}">${icon('check', 'ico s')}<div class="t">Закончил принимать</div>${chevron()}</div>`
      : `<div class="gi" data-act="med-resume" data-id="${esc(m.id)}">${icon('recycle', 'ico s')}<div class="t">Снова принимаю</div>${chevron()}</div>`}
    <div class="gi" data-act="med-del" data-id="${esc(m.id)}">${icon('trash', 'ico s')}<div class="t" style="color:var(--bad)">Удалить курс</div>${chevron()}</div>
  </div>`;

  html += `<div class="disc">Назначено врачом. Дозу и срок меняет только он.</div>`;
  return html;
}

/* ══ ЕДА ═════════════════════════════════════════════════════ */

export function food(app) {
  const today = S.todayISO();
  const date = app.foodDate || today;
  const meals = S.mealsOn(date);
  const t = S.dayTotals(date);
  const tg = S.dayTargets();
  const goal = S.foodGoal();

  let html = head('Тарелка', date === today ? 'сегодня' : S.ruDate(date),
    `<button class="rnd" data-act="settings">${icon('user', 'ico s')}</button><button class="rnd dark" data-act="add-meal">${icon('camera', 'ico s')}</button>`);

  if (goal) {
    html += `<div class="card note tap" data-act="marker" data-key="${esc(goal.key)}">
      <div class="row">${icon('target', 'ico s')}
        <div class="grow"><div class="nm" style="font-size:14px">Цель из анализов: ${esc(goal.goal)}</div>
          <div class="sm">${esc(goal.title)} ${S.trim(goal.value)} ${esc(goal.unit)} · норма ${esc(S.fmtRef(goal))} · замер от ${S.ruDate(goal.date)}</div></div>
      </div>
    </div>`;
  }

  if (!meals.length) {
    html += emptyBlock('forkknife', 'Сфотографируй тарелку',
      goal
        ? `Я посчитаю калории, белки-жиры-углеводы и то, что важно для цели «${esc(goal.goal)}»: <b>насыщенные жиры, клетчатку, холестерин</b>.`
        : 'Я посчитаю калории, белки-жиры-углеводы, клетчатку и главные микроэлементы.',
      `<button class="btn" data-act="add-meal">${icon('camera', 'ico s')}Снять еду</button>
       <button class="btn ghost" data-act="pick-meal" style="margin-top:10px">Выбрать из галереи</button>`);
    return html;
  }

  const focus = goal?.watch?.includes('sat_fat_g')
    ? [['sat_fat_g', 'Насыщенные жиры', 'г', tg.sat_fat_g, true], ['fiber_g', 'Клетчатка', 'г', tg.fiber_g, false], ['cholesterol_mg', 'Холестерин', 'мг', tg.cholesterol_mg, true]]
    : goal?.watch?.includes('sugar_g')
      ? [['sugar_g', 'Сахар', 'г', tg.sugar_g, true], ['fiber_g', 'Клетчатка', 'г', tg.fiber_g, false], ['carbs_g', 'Углеводы', 'г', 250, true]]
      : [['protein_g', 'Белок', 'г', tg.protein_g, false], ['fiber_g', 'Клетчатка', 'г', tg.fiber_g, false], ['sat_fat_g', 'Насыщенные жиры', 'г', tg.sat_fat_g, true]];

  /* Итог дня — одной строкой под числом, без третьей колонки справа: она
     не помещалась и разрывала «2 приёма» пополам. */
  html += `<div class="card">
    <div class="row">
      ${ring(t.kcal / tg.kcal, { size: 52 })}
      <div class="grow"><div class="nm" style="font-size:17px">${Math.round(t.kcal)} ккал <span class="unit">из ${tg.kcal}</span></div>
        <div class="sm">Б ${Math.round(t.protein_g)} · Ж ${Math.round(t.fat_g)} · У ${Math.round(t.carbs_g)} · ${t.count} ${plural(t.count, 'приём', 'приёма', 'приёмов')}</div></div>
    </div>
    <div class="divide"></div>
    ${focus.map(([k, label, unit, target, lowerBetter]) => {
      const v = t[k] || 0;
      // цветом отмечаем только перебор там, где меньше — лучше; остальное просто числа
      const over = lowerBetter && v > target;
      return `<div style="margin-bottom:11px">
        <div class="row" style="margin-bottom:5px"><div class="grow sm" style="color:var(--ink)">${label}</div>
          <div class="sm" style="${over ? 'color:var(--bad);font-weight:700' : ''}">${S.trim(v)} / ${target} ${unit}</div></div>
        ${bar(v, target, { color: 'var(--ink)' })}
      </div>`;
    }).join('')}
  </div>`;

  if (app.aiFood) html += aiBlock('по цели', esc(app.aiFood).replace(/\n/g, '<br>'));
  else if (db.settings().apiKey) html += `<div class="card flat"><button class="mini" data-act="food-feedback">${icon('sparkle', 'ico s')} Как я иду к цели сегодня?</button></div>`;

  /* Блюда — одним списком, а не стопкой отдельных карточек: так же, как
     показатели и документы. Одинаковые вещи должны выглядеть одинаково. */
  html += `<div class="cap">Что съел</div><div class="card list">`;
  for (const m of meals) {
    html += `<div class="it" data-act="meal" data-id="${esc(m.id)}">
      <div class="thumb" style="width:44px;aspect-ratio:1"><img data-blob="${esc(m.blobId)}" alt=""></div>
      <div class="grow"><div class="nm">${esc(m.title || 'Блюдо')}</div>
        <div class="sm">${new Date(m.at).toTimeString().slice(0, 5)} · ${Math.round(m.nutrition?.kcal || 0)} ккал · Б ${Math.round(m.nutrition?.protein_g || 0)} · Ж ${Math.round(m.nutrition?.fat_g || 0)} · У ${Math.round(m.nutrition?.carbs_g || 0)}</div></div>
      ${m.confidence != null && m.confidence < 0.6 ? `<span class="mini">на глаз</span>` : ''}
      ${chevron()}
    </div>`;
  }
  html += `</div>`;

  const pending = S.state.meals.filter(m => m.status === 'reading');
  if (pending.length) html += `<div class="card"><div class="row"><div class="spin"></div><div class="grow sm">Смотрю тарелку…</div></div></div>`;

  html += `<div class="disc">Оценка по фотографии приблизительная — ориентир, а не подсчёт.</div>`;
  return html;
}

export function mealView(app) {
  const m = S.state.meals.find(x => x.id === app.param.id);
  if (!m) return backHead('Блюдо', '') + `<div class="card">Не найдено.</div>`;
  const n = m.nutrition || {};
  let html = backHead(m.title || 'Блюдо', `${S.ruDate(m.date)} · ${new Date(m.at).toTimeString().slice(0, 5)}`);
  html += `<div class="card" style="padding:12px"><img class="shot-big" data-blob="${esc(m.blobId)}" alt=""></div>`;
  html += `<div class="card">
    <div class="kv"><span class="k">Калории</span><span class="v">${Math.round(n.kcal || 0)} ккал</span></div>
    <div class="kv"><span class="k">Белки</span><span class="v">${S.trim(n.protein_g || 0)} г</span></div>
    <div class="kv"><span class="k">Жиры (насыщенные)</span><span class="v">${S.trim(n.fat_g || 0)} г (${S.trim(n.sat_fat_g || 0)} г)</span></div>
    <div class="kv"><span class="k">Углеводы (сахар)</span><span class="v">${S.trim(n.carbs_g || 0)} г (${S.trim(n.sugar_g || 0)} г)</span></div>
    <div class="kv"><span class="k">Клетчатка</span><span class="v">${S.trim(n.fiber_g || 0)} г</span></div>
    <div class="kv"><span class="k">Холестерин</span><span class="v">${Math.round(n.cholesterol_mg || 0)} мг</span></div>
    <div class="kv"><span class="k">Натрий</span><span class="v">${Math.round(n.sodium_mg || 0)} мг</span></div>
  </div>`;
  if (m.items?.length) {
    html += `<div class="cap">Что на тарелке</div><div class="card list">
      ${m.items.map(i => `<div class="it" style="cursor:default"><div class="grow nm">${esc(i.name)}</div><div class="sm">${Math.round(i.grams || 0)} г</div></div>`).join('')}
    </div>`;
  }
  if (m.micros?.length) {
    html += `<div class="cap">Микроэлементы</div><div class="card">
      ${m.micros.map(x => `<div class="kv"><span class="k">${esc(x.name)}</span><span class="v">${S.trim(x.amount)} ${esc(x.unit)}<span class="unit">${x.pct_dv ? ` · ${Math.round(x.pct_dv)}% нормы` : ''}</span></span></div>`).join('')}
    </div>`;
  }
  if (m.note) html += `<div class="card flat"><div class="row">${icon('warning', 'ico s')}<div class="grow sm">${esc(m.note)}</div></div></div>`;
  html += `<button class="btn ghost" data-act="del-meal" data-id="${esc(m.id)}">Удалить запись</button>`;
  return html;
}

/* ══ СПРОСИТЬ ════════════════════════════════════════════════ */

export function ask(app) {
  const msgs = app.chat || [];
  let html = head('Спросить', `вижу ${S.state.docs.filter(d => d.status === 'ready').length} документов и ${S.markerKeys().length} показателей`, avatarBtn);

  if (!db.settings().apiKey) {
    return html + emptyBlock('lock', 'Нужен ключ OpenRouter',
      'Чтобы я мог отвечать, вставь свой ключ в настройках и выбери модель.',
      `<button class="btn" data-act="settings">Открыть настройки</button>`);
  }

  if (!msgs.length) {
    html += `<div class="card"><div class="sm" style="font-size:14px;line-height:1.55;color:var(--ink2)">
      Спроси о своей истории. Я отвечаю <b>только по твоим документам</b> и всегда говорю, откуда взял.</div></div>`;
    html += `<div class="cap">Можно спросить</div><div class="chips" style="margin-bottom:12px">
      ${['Что у меня с печенью за 5 лет?', 'Как менялся витамин D?', 'Что стоит пересдать?', 'Сравни последние два анализа'].map(q =>
      `<button class="chip" data-act="ask-preset" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
  }

  html += msgs.map(m => `<div class="bubble ${m.role === 'user' ? 'me' : 'ai'}">${esc(m.text)}</div>`).join('');
  if (app.asking) html += `<div class="bubble ai"><div class="row"><div class="spin"></div><span class="sm">думаю…</span></div></div>`;
  // именно здесь человек спрашивает «что у меня?» — молчать об ограничениях нельзя
  html += `<div class="disc">Отвечаю только по числам из твоего архива. Это не приём врача: диагнозов не ставлю и лечение не назначаю. Если сейчас плохо — одышка, боль, спутанность — это вопрос к скорой, а не к приложению.</div>`;

  html += `<div class="composer">
    <input type="text" id="askInput" placeholder="Спроси о своей истории…" style="flex:1">
    <button class="rnd dark" data-act="ask-send" style="width:46px;height:46px;min-width:46px">${icon('sparkle', 'ico s')}</button>
  </div>`;
  return html;
}

/* ══ ЧТО ПЕРЕСДАТЬ ═══════════════════════════════════════════ */

export function due(app) {
  const list = S.dueList();
  let html = backHead('Что пересдать', `${list.length} показателей ждут очереди`);
  if (!list.length) return html + emptyBlock('check', 'Всё свежее', 'Ни один показатель не просрочен.');
  html += `<div class="card list">${list.map(m => `
    <div class="it" data-act="marker" data-key="${esc(m.key)}">
      ${statusDot(m.stale ? 'unknown' : m.status)}
      <div class="grow"><div class="nm">${esc(m.title)}</div>
        <div class="sm">${esc(S.ruStatus(m.status))} · последний раз ${S.ruDate(m.last.date)} · обычно раз в ${m.every === 180 ? 'полгода' : m.every === 270 ? '9 месяцев' : 'год'}</div></div>
      <div class="delta down">${Math.floor(m.overdue / 30)} мес.</div>
    </div>`).join('')}</div>`;
  html += `<button class="btn ghost" data-act="copy-due">Скопировать список для лаборатории</button>`;
  html += `<div class="disc">Сроки — простое правило, а не назначение: раз в год, чаще для того, что вышло за границу.</div>`;
  return html;
}

/* ══ ДЛЯ ВРАЧА ═══════════════════════════════════════════════ */

export function doctor(app) {
  const s = db.settings();
  const age = new Date().getFullYear() - (s.birthYear || 1990);
  const list = S.markerList();
  // страница для врача — только то, что действительно за границей; «у границы» здесь шум
  const bad = list.filter(m => !m.stale && m.status === 'out');
  const studies = S.state.docs.filter(d => d.status === 'ready' && (d.type === 'imaging' || d.conclusion))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  const recent = S.state.docs.filter(d => d.status === 'ready' && d.type === 'blood')
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3);

  let html = backHead('Для врача', `собрано ${S.ruDate(S.todayISO())} · одна страница`);

  html += `<div class="card">
    <div class="cap" style="padding:0 0 6px">Кто</div>
    <div class="kv"><span class="k">${s.sex === 'f' ? 'Женщина' : 'Мужчина'}, ${age} лет</span><span class="v">рост ${s.heightCm} · вес ${s.weightKg}</span></div>
    <div class="kv"><span class="k">Документов в архиве</span><span class="v">${S.state.docs.filter(d => d.status === 'ready').length}</span></div>
    <div class="kv"><span class="k">Период наблюдения</span><span class="v">${S.yearsSpan() ? `${S.yearsSpan().from.slice(0, 4)} – ${S.yearsSpan().to.slice(0, 4)}` : '—'}</span></div>
  </div>`;

  if (bad.length) {
    html += `<div class="card"><div class="cap" style="padding:0 0 8px">Что вне нормы сейчас</div><div class="list">
      ${bad.map(m => {
        const first = m.series[0];
        return `<div class="it" style="cursor:default">${statusDot(m.status)}
          <div class="grow"><div class="nm" style="font-size:14px">${esc(m.title)} ${S.trim(m.last.value)} ${esc(m.unit)}</div>
            <div class="sm">норма ${esc(S.fmtRef(m.last))} · ${S.ruShort(m.last.date)}${m.last.lab ? ', ' + esc(m.last.lab) : ''}${m.count > 1 ? ` · было ${S.trim(first.value)} в ${S.ruShort(first.date)}` : ' · единственный замер'}</div></div>
        </div>`;
      }).join('')}
    </div></div>`;
  }

  /* «Что вы принимаете?» — первый вопрос на любом приёме. Раньше ответа
     на этой странице не было вовсе. */
  const today = S.todayISO();
  const taking = MED.state.meds.filter(m => ['active', 'ask'].includes(MED.statusOf(m, today)));
  if (taking.length) {
    html += `<div class="card"><div class="cap" style="padding:0 0 6px">Что принимаю сейчас</div>
      ${taking.map(m => `<div class="kv"><span class="k">${esc(m.name)}${m.dose ? ` ${esc(m.dose)}` : ''}</span>
        <span class="v" style="font-weight:600;font-size:13px">${esc(MED.scheduleText(m))}${MED.progressOf(m, today).total ? ` · ${esc(MED.courseText(m, today))}` : ''}</span></div>`).join('')}
      <div class="sm" style="margin-top:9px">Со слов назначений, которые сфотографированы в приложении.</div>
    </div>`;
  }

  if (recent.length) {
    html += `<div class="card"><div class="cap" style="padding:0 0 6px">Последние анализы</div>
      ${recent.map(d => `<div class="kv"><span class="k">${esc(d.title)}</span><span class="v">${S.ruShort(d.date)}${d.lab ? ' · ' + esc(d.lab) : ''}</span></div>`).join('')}
    </div>`;
  }

  if (studies.length) {
    html += `<div class="card"><div class="cap" style="padding:0 0 6px">Обследования и заключения</div>
      ${studies.map(d => `<div class="kv"><span class="k">${esc(d.title)}</span><span class="v">${S.ruShort(d.date)}</span></div>
        ${d.conclusion ? `<div class="sm" style="margin:-2px 0 8px">${esc(String(d.conclusion).slice(0, 160))}</div>` : ''}`).join('')}
    </div>`;
  }

  const unconfirmed = S.state.meas.filter(m => !m.confirmed).length;
  if (unconfirmed) {
    html += `<div class="card flat"><div class="row">${icon('warning', 'ico s')}
      <div class="grow sm">${unconfirmed} ${plural(unconfirmed, 'число', 'числа', 'чисел')} прочитано неуверенно — в эту страницу они не попали</div></div></div>`;
  }

  if (app.aiDoctor) html += aiBlock('вопросы врачу', esc(app.aiDoctor).replace(/\n/g, '<br>'));
  else if (db.settings().apiKey) html += `<div class="card flat"><button class="mini" data-act="doctor-questions">${icon('sparkle', 'ico s')} Собрать вопросы врачу</button></div>`;

  html += `<button class="btn" data-act="copy-doctor">Скопировать текстом</button>`;
  html += `<div class="disc">Собрано из твоих документов. Это выжимка, а не заключение.</div>`;
  return html;
}

/* ══ НАСТРОЙКИ ═══════════════════════════════════════════════ */

export function settingsView(app) {
  const s = db.settings();
  const models = app.models || db.cachedModels() || [];
  const vision = models.filter(m => (m.inputs || []).includes('image'));
  const q = (app.modelQuery || '').toLowerCase().trim();
  const pool = app.modelTab === 'chat' ? models : vision;
  const freeOnly = !!app.modelFree;
  const shownLimit = app.modelLimit || 25;
  const matched = pool
    .filter(m => !freeOnly || m.free)
    .filter(m => !q || m.id.toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q)
      || (/беспл|free/.test(q) && m.free));
  const filtered = matched.slice(0, shownLimit);
  const freeCount = pool.filter(m => m.free).length;

  let html = backHead('Настройки', 'ключ, модель, данные');

  html += `<div class="cap">Ключ OpenRouter</div>
  <div class="card">
    <input type="password" id="apiKey" value="${esc(s.apiKey)}" placeholder="sk-or-v1-…" autocomplete="off">
    <div class="row" style="margin-top:10px">
      <button class="mini" data-act="check-key">Проверить и сохранить</button>
      <div class="grow sm" id="keyState">${app.keyState ? esc(app.keyState) : (s.apiKey ? 'сохранён на этом устройстве' : 'ключа пока нет')}</div>
    </div>
    <div class="divide"></div>
    <div class="sm" style="line-height:1.5">Берётся на openrouter.ai → Keys. Хранится только здесь и уходит напрямую в OpenRouter.</div>
  </div>`;

  html += `<div class="cap">Модель</div>
  <div class="card">
    <div class="kv"><span class="k">Снимки</span><span class="v" style="font-size:12.5px;font-weight:600">${s.modelVision ? esc(s.modelVision) : 'не выбрана'}</span></div>
    <div class="kv"><span class="k">Тексты</span><span class="v" style="font-size:12.5px;font-weight:600">${s.modelChat ? esc(s.modelChat) : 'та же'}</span></div>
    <div class="divide"></div>
    <div class="row">
      <button class="mini" data-act="refresh-models">${app.modelsLoading ? 'Обновляю…' : 'Обновить список'}</button>
      <div class="grow sm">${models.length ? `${models.length} моделей · ${vision.length} с картинками` : 'список не загружен'}</div>
    </div>
  </div>`;

  if (models.length) {
    html += `<div class="segs">
      <button class="seg ${app.modelTab !== 'chat' ? 'on' : ''}" data-act="model-tab" data-tab="vision">Для снимков</button>
      <button class="seg ${app.modelTab === 'chat' ? 'on' : ''}" data-act="model-tab" data-tab="chat">Для текстов</button>
    </div>
    <div class="card" style="padding:12px 16px">
      <input type="text" id="modelQuery" placeholder="поиск: gemini, gemma, claude…" value="${esc(app.modelQuery || '')}">
      <div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px">
        <button class="chip ${!freeOnly ? 'on' : ''}" data-act="model-free" data-v="0">Все · ${pool.length}</button>
        <button class="chip ${freeOnly ? 'on' : ''}" data-act="model-free" data-v="1">Бесплатные · ${freeCount}</button>
      </div>
      <div class="sm" style="margin-top:9px;line-height:1.45">${app.modelTab === 'chat'
        ? `Любая модель из ${models.length}: этой достаются вопросы по архиву и тексты.`
        : `Только те, что умеют читать картинки — ${pool.length} из ${models.length}. Текстовые модели (например gpt-oss) бланк не увидят.`}</div>
    </div>`;

    if (freeOnly) {
      html += `<div class="card flat"><div class="row">${icon('warning', 'ico s')}
        <div class="grow sm" style="line-height:1.5">У бесплатных моделей свои ограничения: <b>примерно 50 запросов в сутки</b> и очередь в час пик. Бланки они читают заметно хуже платных — <b>обязательно сверь распознанные числа с оригиналом</b>. Для пробы годятся, для архива лучше платная.</div></div></div>`;
    }

    if (!filtered.length) {
      // человек ищет модель, которой просто нет в этой вкладке — скажем об этом прямо
      const elsewhere = models.filter(m => !q || m.id.toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q))
        .filter(m => !freeOnly || m.free);
      const blind = elsewhere.filter(m => !(m.inputs || []).includes('image'));
      html += `<div class="card"><div class="sm" style="line-height:1.55">${
        (app.modelTab !== 'chat' && blind.length)
          ? `<b>${esc(blind[0].name)}</b> не умеет читать картинки — такие модели работают только с текстом. Она есть во вкладке <b>«Для текстов»</b>: там ей достанутся вопросы по архиву и формулировки, а бланки будет разбирать другая модель.`
          : freeOnly
            ? 'Среди умеющих читать картинки бесплатных сейчас нет. Сними фильтр или загляни во вкладку «Для текстов».'
            : 'Ничего не нашлось. Попробуй другое слово или обнови список.'}</div>
        ${(app.modelTab !== 'chat' && blind.length) ? `<div class="row" style="margin-top:11px"><button class="mini" data-act="model-tab" data-tab="chat">Открыть «Для текстов»</button></div>` : ''}
      </div>`;
    }

    html += `<div class="card list">`;
    html += filtered.map(m => {
      const chosen = (app.modelTab === 'chat' ? s.modelChat : s.modelVision) === m.id;
      const price = m.variablePrice || m.promptPrice == null ? 'цена зависит от выбранной модели'
        : m.free ? 'бесплатно'
        : `$${(m.promptPrice * 1e6).toFixed(2)}/млн вход · $${(m.completionPrice * 1e6).toFixed(2)}/млн выход`;
      return `<div class="it" data-act="pick-model" data-id="${esc(m.id)}">
        ${chosen ? icon('check', 'ico s') : `<span class="dot unknown"></span>`}
        <div class="grow"><div class="nm" style="font-size:14px">${esc(m.name)}${m.free ? ' <span style="color:var(--ok);font-weight:800">· бесплатно</span>' : ''}</div>
          <div class="sm">${esc(m.id)}</div>
          <div class="sm">${esc(price)}${m.ctx ? ` · ${Math.round(m.ctx / 1000)}k контекст` : ''}</div></div>
        ${(m.inputs || []).includes('image') ? icon('eye', 'ico s') : ''}
      </div>`;
    }).join('');
    html += `</div>`;
    if (matched.length > filtered.length) {
      html += `<button class="btn ghost sm" data-act="model-more" style="margin-bottom:12px">Показать ещё ${Math.min(25, matched.length - filtered.length)} из ${matched.length}</button>`;
    }
  }

  // редкие действия — строками: карточка на каждое делала их громче ежедневного
  const demoOn = S.state.docs.some(d => d.demo);
  html += `<div class="grp">
    <div class="gi" data-act="reparse">${icon('recycle', 'ico s')}<div class="t">Переразобрать архив</div>
      <div class="v">${S.state.docs.filter(d => d.status === 'ready').length} док.</div>${chevron()}</div>
    <div class="gi" data-act="${demoOn ? 'demo-clear' : 'demo-fill'}">${icon('sparkle', 'ico s')}
      <div class="t">Демонстрационный архив</div><div class="v">${demoOn ? 'убрать' : 'показать'}</div>${chevron()}</div>
  </div>`;

  html += `<div class="cap">Профиль</div>
  <div class="card">
    <label class="lab">Пол — от него зависят границы нормы</label>
    <div class="segs" style="margin-bottom:12px">
      <button class="seg ${s.sex !== 'f' ? 'on' : ''}" data-act="sex" data-v="m">Мужской</button>
      <button class="seg ${s.sex === 'f' ? 'on' : ''}" data-act="sex" data-v="f">Женский</button>
    </div>
    <div class="row" style="gap:10px">
      <div class="grow"><label class="lab">Год рождения</label><input type="number" id="birthYear" value="${s.birthYear}"></div>
      <div class="grow"><label class="lab">Рост, см</label><input type="number" id="heightCm" value="${s.heightCm}"></div>
      <div class="grow"><label class="lab">Вес, кг</label><input type="number" id="weightKg" value="${s.weightKg}"></div>
    </div>
    <button class="btn sm ghost" data-act="save-profile" style="margin-top:12px">Сохранить профиль</button>
  </div>`;

  html += `<div class="cap">Вид</div>
  <div class="card">
    <div class="segs" style="margin:0">
      ${[['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([v, t]) =>
        `<button class="seg ${s.theme === v ? 'on' : ''}" data-act="theme" data-v="${v}">${t}</button>`).join('')}
    </div>
  </div>`;

  const u = tgUser();
  const backupAt = s.lastCloudBackup;
  html += `<div class="cap">Вход и память</div>
  <div class="card">
    <div class="row" style="gap:12px">
      <div class="rnd dark" style="width:42px;height:42px">${icon('user', 'ico s')}</div>
      <div class="grow"><div class="nm">${u ? esc([u.first_name, u.last_name].filter(Boolean).join(' ')) : 'Без входа'}</div>
        <div class="sm">${u ? `Телеграм · id ${u.id}` : 'открыто в браузере, не в Телеграме'}</div></div>
    </div>
    <div class="divide"></div>
    <div class="sm" style="line-height:1.55">Отдельного пароля нет: внутри Телеграма ты уже вошёл, и копия архива лежит в <b>твоём</b> облаке.</div>
  </div>`;

  html += `<div class="card">
    <div class="row"><div class="grow"><div class="nm" style="font-size:14px">На этом устройстве</div>
      <div class="sm">${S.state.docs.length} документов · ${S.state.meas.length} замеров · ${MED.state.meds.length} курсов · ${S.state.meals.length} блюд</div></div>
      ${icon('check', 'ico s')}</div>
    <div class="divide"></div>
    <div class="row"><div class="grow"><div class="nm" style="font-size:14px">Копия в облаке Телеграма</div>
      <div class="sm">${inTelegram()
        ? (backupAt ? `последняя — ${new Date(backupAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · ${Math.round((s.cloudBytes || 0) / 1024)} КБ` : 'ещё не делалась')
        : 'доступна только внутри Телеграма'}</div></div>
      <button class="tog ${s.autoCloud ? 'on' : ''}" data-act="toggle-cloud"></button></div>
    <div class="divide"></div>
    <div class="sm" style="line-height:1.6">
      В облако уходят числа, даты, лаборатории, лекарства и еда — этого хватает, чтобы вернуть архив на новом телефоне.
      <b>Снимки туда не помещаются</b> — для них копия файлом.
    </div>
    <div class="divide"></div>
    <div class="row" style="flex-wrap:wrap;gap:8px">
      <button class="mini" data-act="cloud-save">Сохранить копию сейчас</button>
      <button class="mini" data-act="cloud-restore">Восстановить из облака</button>
    </div>
  </div>`;

  html += `<div class="card">
    <div class="row"><div class="grow"><div class="nm" style="font-size:14px">Копия файлом — со снимками</div>
      <div class="sm">Полный архив одним файлом: числа и оригиналы бланков</div></div></div>
    <div class="divide"></div>
    <div class="row" style="flex-wrap:wrap;gap:8px">
      <button class="mini" data-act="export">Сохранить файл</button>
      <button class="mini" data-act="import">Восстановить из файла</button>
    </div>
  </div>`;

  // место на устройстве: архив снимков растёт быстро, а вытеснение хранилища тихое
  const st = app.storage;
  if (st) {
    const full = st.quotaMb ? st.usedMb / st.quotaMb : 0;
    html += `<div class="card">
      <div class="row"><div class="grow"><div class="nm" style="font-size:14px">Место на устройстве</div>
        <div class="sm">${st.usedMb} МБ занято${st.quotaMb ? ` из ${st.quotaMb} МБ` : ''}</div></div></div>
      <div class="prog" style="margin-top:10px"><i style="width:${Math.min(100, Math.round(full * 100))}%;${full > 0.8 ? 'background:var(--bad-dot)' : ''}"></i></div>
      <div class="sm" style="margin-top:9px;line-height:1.5">${st.persisted
        ? 'Архив помечен как постоянный — браузер не сотрёт его, освобождая место.'
        : 'Браузер <b>не дал</b> пометить архив постоянным: при нехватке места он может его стереть. Держи копию файлом.'}</div>
      ${full > 0.8 ? `<div class="sm" style="margin-top:8px;color:var(--bad)">Места почти нет — сохрани копию файлом и удали лишние документы.</div>` : ''}
    </div>`;
  }

  html += `<div class="card">
    <div class="sm" style="line-height:1.6">
      <b>Что уходит наружу:</b> при разборе снимка и при вопросе картинка и выжимка данных уходят в выбранную модель — иначе разбора не будет. В остальное время данные не покидают устройство.
      <br><br>У <b>бесплатных</b> моделей другая политика: площадка вправе хранить запросы и учиться на них. Это медицинские документы — решай сам.
    </div>
    <div class="divide"></div>
    <div class="row" style="flex-wrap:wrap;gap:8px">
      <button class="mini warn" data-act="cloud-forget">Стереть копию в облаке</button>
      <button class="mini warn" data-act="wipe">Удалить всё без следа</button>
    </div>
  </div>`;

  html += `<div class="disc">BioLens · локальное приложение. Ключи и данные — твои.</div>`;
  return html;
}

/* ══ ЗНАКОМСТВО ══════════════════════════════════════════════ */

export function onboarding(app) {
  const s = db.settings();
  const step = app.obStep || 1;

  if (step === 1) {
    const who = tgUserName();
    return `<div class="head"><div class="grow"><h1>${who ? esc(who) + ', это BioLens' : 'BioLens'}</h1><div class="sub">шаг 1 из 3</div></div></div>
    <div class="card"><div class="row">${icon('sparkle', 'ico s')}
      <div class="grow sm" style="color:var(--ink2);line-height:1.55">Кидай сюда скриншоты анализов — я сам прочитаю дату, лабораторию и показатели и сложу их <b style="color:var(--ink)">в линии по годам</b>.</div></div></div>
    <div class="card">
      <label class="lab">Пол — нормы в анализах разные</label>
      <div class="segs" style="margin-bottom:14px">
        <button class="seg ${s.sexSet && s.sex !== 'f' ? 'on' : ''}" data-act="sex" data-v="m">Мужской</button>
        <button class="seg ${s.sexSet && s.sex === 'f' ? 'on' : ''}" data-act="sex" data-v="f">Женский</button>
      </div>
      <div class="row" style="gap:10px">
        <div class="grow"><label class="lab">Год рождения</label><input type="number" id="birthYear" value="${s.birthYear}"></div>
        <div class="grow"><label class="lab">Рост, см</label><input type="number" id="heightCm" value="${s.heightCm}"></div>
        <div class="grow"><label class="lab">Вес, кг</label><input type="number" id="weightKg" value="${s.weightKg}"></div>
      </div>
    </div>
    <button class="btn" data-act="ob-next" ${s.sexSet ? '' : 'disabled'}>Дальше</button>
    ${s.sexSet ? '' : '<div class="sm" style="text-align:center;margin-top:9px">Выбери пол — от него зависят границы нормы у половины показателей</div>'}
    <div class="disc">Эти данные нужны только для границ нормы и остаются на устройстве.</div>`;
  }

  if (step === 2) {
    const models = app.models || db.cachedModels() || [];
    const vision = models.filter(m => (m.inputs || []).includes('image'));
    return `<div class="head"><div class="grow"><h1>Ключ и модель</h1><div class="sub">шаг 2 из 3</div></div></div>
    <div class="card"><div class="sm" style="font-size:14px;line-height:1.55;color:var(--ink2)">
      Разбор снимков делает <b style="color:var(--ink)">модель по твоему выбору</b> через OpenRouter. Ключ берётся на openrouter.ai → Keys и хранится только здесь.</div></div>
    <div class="card">
      <label class="lab">Ключ OpenRouter</label>
      <input type="password" id="apiKey" value="${esc(s.apiKey)}" placeholder="sk-or-v1-…" autocomplete="off">
      <div class="row" style="margin-top:10px"><button class="mini" data-act="check-key">Проверить и сохранить</button>
        <div class="grow sm">${app.keyState ? esc(app.keyState) : ''}</div></div>
    </div>
    ${vision.length ? `<div class="card list" style="max-height:320px;overflow:auto">
      ${vision.slice(0, 14).map(m => `<div class="it" data-act="pick-model" data-id="${esc(m.id)}">
        ${s.modelVision === m.id ? icon('check', 'ico s') : `<span class="dot unknown"></span>`}
        <div class="grow"><div class="nm" style="font-size:14px">${esc(m.name)}</div>
          <div class="sm">${m.variablePrice || m.promptPrice == null ? 'цена зависит от модели' : m.free ? 'бесплатно' : `$${(m.promptPrice * 1e6).toFixed(2)}/млн вход`}</div></div>
      </div>`).join('')}
    </div>` : `<div class="card"><button class="mini" data-act="refresh-models">${app.modelsLoading ? 'Загружаю модели…' : 'Загрузить список моделей'}</button></div>`}
    <button class="btn" data-act="ob-next" ${s.apiKey && s.modelVision ? '' : 'disabled'}>Дальше</button>
    <button class="btn ghost" data-act="ob-skip" style="margin-top:9px">Пропустить пока</button>`;
  }

  return `<div class="head"><div class="grow"><h1>Начнём с пяти</h1><div class="sub">шаг 3 из 3</div></div></div>
  <div class="card"><div class="sm" style="font-size:14px;line-height:1.55;color:var(--ink2)">
    Не разбирай весь архив — <b style="color:var(--ink)">выбери пять последних</b> анализов. Я покажу, что получается, за минуту. Остальные годы добавишь, когда захочешь.</div></div>
  <button class="btn" data-act="add">${icon('camera', 'ico s')}Выбрать из галереи</button>
  <button class="btn ghost" data-act="scan" style="margin-top:10px">${icon('camera', 'ico s')}Снять бланк камерой</button>
  <button class="btn ghost" data-act="demo-fill" style="margin-top:10px">Посмотреть на примере</button>
  <button class="btn ghost" data-act="ob-done" style="margin-top:10px">Позже</button>`;
}

/* ══ ТАБ-БАР ═════════════════════════════════════════════════ */

export function tabbar(active) {
  /* Хроника ушла из дока: все файлы теперь лежат внизу главной, а ходить
     за ними на отдельную вкладку было лишним шагом каждый день. Её место
     заняло то, что нужно утром, днём и вечером. */
  const items = [
    ['summary', 'heartbeat', 'Здоровье'],
    ['meds', 'pill', 'Лекарства'],
    ['markers', 'chartline', 'Показатели'],
    ['food', 'forkknife', 'Тарелка'],
    ['ask', 'chat', 'Спросить'],
  ];
  return `<div class="tabs"><div class="dock" id="dock">
    ${items.map(([id, ic, label]) => `<button class="tab ${active === id ? 'on' : ''}" data-act="tab" data-tab="${id}">${icon(ic)}<span>${label}</span></button>`).join('')}
  </div></div>`;
}
