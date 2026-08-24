/* Экраны приложения. Каждая функция возвращает HTML;
   обработчики висят на data-act и разбираются в app.js. */

import * as S from './store.js';
import * as db from './db.js';
import * as MED from './meds.js';
import { icon } from './icons.js';
import { esc, sparkline, statusLine, dotBar, chart, statusDot, statusTag, statusWord, toneVar, inkTone, toneDot, aiBlock, emptyBlock, ring, bar, rangeBar, gradeScale, gauge, kcalRing } from './ui.js';
import { markerTitle, markerGroup, MARKERS } from './markers.js';
import { info } from './reference.js';
import { tgUserName, tgUser, inTelegram } from './telegram.js';
import { tiles, notices } from './insights.js';
import { SYSTEMS, systemById, mapSystems, coverage } from './systems.js';
import * as PP from './passport.js';

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
/* На главной «плюс» добавляет ЧТО УГОДНО: бланк, файл или тарелку.
   Раньше он молча означал «документ», и снять еду можно было, только
   догадавшись зайти на её экран. */
const addAnyBtn = `<button class="rnd dark" data-act="add-any">${icon('plus', 'ico s')}</button>`;
/* Колокольчик. Всё, что ждёт человека — деньги на счету, непрочитанные бланки,
   непроверенные назначения, — живёт здесь, а не поперёк главной. */
const bellBtn = (n) => `<button class="rnd" data-act="notices" aria-label="Уведомления">${icon('bell', 'ico s')}${n ? `<i class="bdot">${n > 9 ? '9' : n}</i>` : ''}</button>`;

/* Знак приложения: линза и одна волна пульса внутри неё. Тот же силуэт,
   что на иконке — чтобы приложение узнавалось и внутри, и на рабочем столе. */
export const logoMark = (size = 44) => `<svg class="logo" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
  <circle cx="32" cy="32" r="23" fill="none" stroke="currentColor" stroke-width="3.6"/>
  <path d="M15 32h5.5l4.5-9.5L32 43l4.5-11H49" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/* ══ СВОДКА ══════════════════════════════════════════════════ */

export function summary(app) {
  const today = S.todayISO();
  const queue = S.state.docs.filter(d => ['queued', 'reading'].includes(d.status)).length;

  if (!S.state.docs.length && !MED.state.meds.length) {
    return `<div class="head"><div class="grow" style="display:flex;align-items:center;gap:10px">
        ${logoMark(30)}<h1>BioLens</h1></div>${avatarBtn}</div>`
      + emptyBlock('camera', 'Начни с того, что есть',
      'Закинь всё подряд — скриншоты анализов, фото бланков, <b>PDF из лаборатории</b> и <b>листы назначений</b>. Назначения сам разложу по утрам и вечерам, анализы сложу в линии по годам.',
      `<button class="btn" data-act="add">${icon('camera', 'ico s')}Закинуть файлы</button>
       <button class="btn ghost" data-act="scan" style="margin-top:10px">${icon('camera', 'ico s')}Снять камерой</button>`);
  }

  const nn = notices(app).length;
  let html = head('Сегодня', dayTitle(today), bellBtn(nn) + avatarBtn + addAnyBtn);

  /* Разбор идёт прямо сейчас — это не предупреждение, а работа на глазах.
     Одна тонкая строка, а не карточка во всю высоту. */
  if (queue) {
    const done = S.state.queue.total ? S.state.queue.done : 0;
    html += `<div class="card flat tap" data-act="inbox" style="padding:10px 13px">
      <div class="row"><div class="spin"></div>
        <div class="grow"><div class="nm" style="font-size:13.5px">Разбираю ещё ${queue}</div>
          <div class="sm">${S.state.queue.total ? `${done} из ${S.state.queue.total} · можно закрыть приложение` : 'сейчас начну'}</div></div>
        ${chevron()}</div></div>`;
  }

  html += tileGrid(app);
  html += markerStrip(app);
  html += todayBlock(app, today);
  html += archive(app);

  /* «Дополнительно» из макета: двери, за которыми лежат списки. Числа рядом
     важнее названий — по ним видно, стоит ли туда заходить сегодня. Архива
     документов здесь нет намеренно: его полка стоит выше на этом же экране,
     и второй вход в одно место — обещание, что там что-то другое. */
  const dueCount = S.dueList().length;
  const allCount = S.markerKeys().length;
  html += `<div class="cap">Дополнительно</div>
  <div class="grp">
    ${dueCount ? `<div class="gi" data-act="go" data-r="due">${icon('clock', 'ico s')}<div class="t">Пора пересдать</div>
      <div class="v">${dueCount}</div>${chevron()}</div>` : ''}
    ${allCount ? `<div class="gi" data-act="go" data-r="markers-all">${icon('chartline', 'ico s')}<div class="t">Все показатели списком</div>
      <div class="v">${allCount}</div>${chevron()}</div>` : ''}
    <div class="gi" data-act="go" data-r="passport">${icon('shield', 'ico s')}<div class="t">Паспорт здоровья</div>
      <div class="v">${passportSummary()}</div>${chevron()}</div>
    <div class="gi" data-act="doctor">${icon('stethoscope', 'ico s')}<div class="t">Страница для врача</div>${chevron()}</div>
  </div>`;

  html += `<div class="disc">Приложение хранит факты и напоминает о назначенном. Диагнозов не ставит.</div>`;
  return html;
}

/* ── дашборд наблюдений ──────────────────────────────────────────
   Плитки по две в ряд. Каждая — не кнопка, а короткое наблюдение о человеке:
   что вне нормы, что сдвинулось, сколько принято сегодня, чего в архиве нет
   вовсе. Раньше на этом месте лежала одна широкая карточка со сводкой и
   стопка предупреждений — «куча статистики», как это и называлось.

   Цвет здесь работает по строгому правилу: светофор (зелёный, оранжевый,
   красный) означает СОСТОЯНИЕ ЗДОРОВЬЯ и больше ничего. Синий, фиолетовый
   и бирюзовый — дела, а не диагнозы: приём лекарств, изученность, еда. */
function tileGrid(app) {
  const list = tiles(app);
  const ai = app.aiSummary
    ? `<div class="tile2 wide t-ai">
        <div class="tk">${icon('sparkle', 'ico s')}<span>что я заметил</span></div>
        <div class="ap">${esc(app.aiSummary).replace(/\n/g, '<br>')}</div>
      </div>`
    : (db.settings().apiKey && S.markerKeys().length && !app.aiSummaryError
        ? `<div class="tile2 wide t-ai quiet"><div class="tk">${icon('sparkle', 'ico s')}<span>смотрю, что изменилось…</span></div></div>`
        : '');
  if (!list.length && !ai) return '';
  return `<div class="tiles">${ai}${list.map(tileEl).join('')}</div>`;
}

function tileEl(t, i) {
  const attrs = Object.entries(t.data || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  /* Счётчик и показатель говорят разными углами плитки.
     У счётчика (приём, еда, изученность) в углу стоит ПРОЦЕНТ, а по низу идёт
     точечная полоса из макета: кольцо в 24 пикселя показывало ту же долю, но
     прочесть по нему «сколько осталось» было нельзя.
     У показателя в углу — линия его состояния: маленькая, но той же породы,
     что и большой график. */
  const corner = t.ring != null ? `<div class="tpct">${Math.round(Math.max(0, Math.min(1, t.ring)) * 100)}%</div>` : '';
  /* И линия, и точечная полоса живут ВНИЗУ плитки, во всю ширину. В углу
     линия отнимала место у подписи: «СТАЛО ЛУЧШЕ» обрезалось до «СТАЛО …»,
     а плитка без имени перестаёт быть наблюдением. Внизу график ещё и
     втрое крупнее — по нему видно движение, а не только последнюю точку. */
  const foot = t.spark ? `<div class="tline">${statusLine(t.spark, { w: 150, h: 30, fluid: true })}</div>`
    : t.ring != null ? dotBar(t.ring)
    : '';
  return `<button class="tile2 t-${t.tone}" style="animation-delay:${Math.min(i, 6) * 28}ms" data-act="${esc(t.act)}"${attrs}>
    <div class="tk">${t.icon ? `<span class="tic">${icon(t.icon, 'ico s')}</span>` : ''}<span>${esc(t.kind)}</span></div>
    ${corner}
    <div class="tv${t.small ? ' short' : ''}">${esc(t.value)}${t.suffix ? `<span class="ts">${esc(t.suffix)}</span>` : ''}</div>
    <div class="tt">${esc(t.title)}</div>
    <div class="td">${esc(t.sub)}</div>
    ${foot}
  </button>`;
}

/* ── лента показателей ───────────────────────────────────────────
   Лучшее из трёх мест, сведённое в одну карточку.

   У Ornament на главной идёт горизонтальная лента биомаркеров: в ширину
   одной нашей плитки помещается показатель целиком — число, свежесть и
   ЛИНИЯ. Это отвечает на вопрос, на который плитки не отвечали: не «что у
   меня плохо прямо сейчас», а «куда оно движется». Оттуда же — возраст
   замера справа от названия: «2 мес.» честнее, чем дата, которую надо
   вычитать в уме.

   Из макета — подача «выше / ниже нормы»: число цветом, а под ним словами и
   сам коридор числами. Цвет читается за долю секунды, слово не даёт
   ошибиться, коридор отвечает «а сколько должно быть».

   Наше правило, которое никто из них не соблюдает: показатель без второго
   замера в ленту не попадает. Лента — про движение; одна точка движения не
   имеет, и её место в списке, а не здесь. */

const ruAgo = (days) => {
  if (days <= 1) return 'сегодня';
  if (days < 14) return `${days} дн.`;
  if (days < 60) return `${Math.round(days / 7)} нед.`;
  const mo = Math.round(days / 30);
  return mo < 24 ? `${mo} мес.` : `${Math.floor(days / 365)} г.`;
};

function markerStrip(app) {
  const list = S.markerList().filter(m => !m.stale && m.count > 1).slice(0, 8);
  if (list.length < 2) return '';

  const cards = list.map(m => {
    /* Коридор показываем только когда он есть: «не указана» на карточке —
       это шум там, где человек ждёт числа. */
    const hasRef = m.last.refLow != null || m.last.refHigh != null;
    const ref = hasRef ? S.fmtRef(m.last) : '';
    return `<button class="mcard" data-act="marker" data-key="${esc(m.key)}">
      <div class="mc-top"><span class="mc-nm">${esc(m.title)}</span><span class="mc-ago">${esc(ruAgo(m.daysOld))}</span></div>
      <div class="mc-val" style="color:${inkTone(m.status)}">${esc(S.trim(m.last.value))}<span>${esc(m.unit || '')}</span></div>
      <div class="mc-ch">${statusLine(m.series, { w: 134, h: 44 })}</div>
      <div class="mc-ft">
        <span style="color:${toneVar(m.status)}">${esc(statusWord(m.status, m.last.value, m.last.refLow, m.last.refHigh))}</span>
        ${ref ? `<span class="mc-ref">${esc(ref)}</span>` : ''}
      </div>
    </button>`;
  }).join('');

  return `<div class="caprow"><div class="cap">Показатели</div>
    <button class="capln" data-act="go" data-r="markers-all">все ${S.markerKeys().length}${chevron()}</button></div>
    <div class="mstrip">${cards}</div>`;
}

/* ── день на главной ─────────────────────────────────────────────
   Тот же день, что и на экране лекарств, но другим ракурсом: горизонтальная
   лента, где точки стоят на СВОИХ часах, а тонкая метка показывает, сколько
   дня уже прошло. Весь день одним взглядом — а подробности этажом ниже,
   на своём экране. */

/* Ось ленты: от шести утра до полуночи. Всё раньше шести прижимается к началу —
   в этих часах приёмов не бывает, а растягивать ради них ленту значит сжать
   остальной день. */
const AX_FROM = 6 * 60, AX_TO = 24 * 60;
const axPos = (min) => Math.max(6, Math.min(94, ((min - AX_FROM) / (AX_TO - AX_FROM)) * 100));
const minutesOf = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function todayBlock(app, date) {
  if (!MED.state.meds.length) {
    return `<div class="grp"><div class="gi" data-act="add">${icon('pill', 'ico s')}
      <div class="t">Сфотографируй назначение врача</div>
      <div class="v">разложу по дню</div>${chevron()}</div></div>`;
  }
  const d = MED.dayCount(date);
  if (!d.total) return '';

  const plan = MED.planFor(date);
  const byId = Object.fromEntries(plan.map(s => [s.id, s]));
  const now = nowMinutes();
  const nowPos = axPos(now);

  /* Три части: утро, день, вечер. «На ночь» на ленте нет вовсе — ночные
     приёмы считаются вместе с вечером, а на экране лекарств у них своя
     строка со своим временем. */
  const STRIP = [
    { id: 'morning', at: '08:00', icon: 'sunrise', ids: ['morning'] },
    { id: 'day', at: '14:00', icon: 'sun', ids: ['day'] },
    { id: 'evening', at: '20:00', icon: 'moon', ids: ['evening', 'night'] },
  ];

  const nodes = STRIP.map(sd => {
    const items = sd.ids.flatMap(id => (byId[id] ? byId[id].items : []));
    const total = items.length;
    const taken = items.filter(i => i.taken).length;
    const state = !total ? 'nil' : taken === total ? 'done' : 'todo';
    const left = axPos(minutesOf(sd.at));
    return `<span class="dn ${state}" style="left:${left.toFixed(1)}%">
      <i>${state === 'done' ? icon('check', 'ico s') : total ? `<b>${total - taken}</b>` : ''}</i>
      <em>${icon(sd.icon, 'ico s')}</em></span>`;
  }).join('');

  /* Весь день, а не только текущая часть: человек хочет видеть утро, день и
     вечер разом и отмечать что угодно, не уходя с главной. */
  const groups = MED.SLOTS.map(sl => {
    const cur = byId[sl.id];
    if (!cur || !cur.items.length) return '';
    const taken = cur.items.filter(i => i.taken).length;
    return `<div class="dgrp">
      <div class="dgh"><span class="tic sm-ic">${icon(sl.icon, 'ico s')}</span><b>${sl.title}</b><span>${sl.at}</span>
        <em>${taken === cur.items.length ? 'принято' : `${cur.items.length - taken} из ${cur.items.length}`}</em></div>
      ${cur.items.map(i => medRow(i, sl.id, date)).join('')}
    </div>`;
  }).join('');

  return `<div class="cap">Сегодня</div>
  <div class="card">
    <div class="row tap" data-act="go" data-r="meds" style="align-items:baseline">
      <div class="grow"><div class="nm" style="font-size:13px;font-weight:750">${
        d.left ? `Осталось ${d.left} ${plural(d.left, 'приём', 'приёма', 'приёмов')}` : 'Сегодня всё принято'}</div></div>
      <div class="sm">${d.taken} из ${d.total}</div>${chevron()}
    </div>
    <div class="dstrip">
      <i class="dl"></i><i class="dl on" style="width:${nowPos.toFixed(1)}%"></i>
      <i class="dcur" style="left:${nowPos.toFixed(1)}%"></i>
      ${nodes}
    </div>
    ${groups}
  </div>`;
}

/* Строка приёма: отметка слева, лекарство посередине, час отметки справа.
   Стрелка здесь лишняя — вся строка и так открывается, а знак «открывается»
   спорил бы с кружком. */
function medRow(item, slotId, date, { lock = false } = {}) {
  const m = item.med;
  const p = MED.progressOf(m, date);
  const sub = [
    m.dose ? esc(m.dose) : null,
    MED.foodText(m.food),
    p.total ? `день ${Math.max(1, p.day)} из ${p.total}` : null,
  ].filter(Boolean).join(' · ');
  /* Будущий день отмечать нельзя: «принял завтра» — это неправда, а здесь
     на неправде строится вся история приёма. */
  const mark = lock
    ? `<span class="tick lock" aria-hidden="true"></span>`
    : `<button class="tick${item.taken ? ' on' : ''}" data-act="take" data-id="${esc(m.id)}" data-slot="${esc(slotId)}" data-date="${esc(date)}"
        aria-label="${item.taken ? 'Отменить отметку' : 'Отметить приём'}">${icon('check', 'ico s')}</button>`;
  /* Час отметки справа: день превращается из списка галочек в запись —
     «принял в 08:42». Это же отвечает на вопрос «я точно пил утром?». */
  const when = item.taken && item.at ? `<div class="tmk">${hhmm(new Date(item.at))}</div>` : '';
  return `<div class="med-row${item.taken ? ' done' : ''}" data-act="med" data-id="${esc(m.id)}">
    ${mark}
    <div class="grow">
      <div class="nm">${esc(m.name)}</div>
      <div class="sm">${sub || 'доза не указана — допиши'}</div>
    </div>
    ${when}
  </div>`;
}

/* ══ КОЛОКОЛЬЧИК ═════════════════════════════════════════════
   Всё, что ждёт человека, в одном списке. Главная больше не начинается
   с предупреждений — она начинается с того, ради чего её открыли. */

export function noticesView(app) {
  const list = notices(app);
  let html = backHeadWide('Уведомления', list.length ? `${list.length} ${plural(list.length, 'дело', 'дела', 'дел')}` : 'пока тихо');
  if (!list.length) {
    return html + emptyBlock('bell', 'Ничего не ждёт',
      'Здесь появится то, что требует твоего ответа: непрочитанные бланки, назначения без подтверждения, кончившиеся деньги на счету модели.');
  }
  html += `<div class="grp">${list.map(n => {
    const attrs = Object.entries(n.data || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
    return `<div class="gi ntc" data-act="${esc(n.act)}"${attrs}>
      <span class="nico ${esc(n.tone)}">${icon(n.icon, 'ico s')}</span>
      <div class="t"><div class="nm" style="font-size:14px">${esc(n.title)}</div>
        <div class="sm">${esc(n.sub)}</div></div>
      ${chevron()}</div>`;
  }).join('')}</div>`;
  html += `<div class="disc">Приложение живёт внутри Телеграма и не шлёт push-уведомлений. Всё, что важно, ждёт здесь.</div>`;
  return html;
}

/* ── архив внизу главной ─────────────────────────────────────────
   Один блок, а не россыпь: превью документов, строки добавления и
   раскрытие «показать все» живут внутри одной карточки. Раньше архив
   обещал тринадцать файлов, а показывал шесть, и дальше идти было некуда. */
function archive(app) {
  const all = S.state.docs;
  let html = '';
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
      <div class="gi" data-act="go" data-r="timeline">${icon('calendar', 'ico s')}<div class="t">Хроника по годам</div>${chevron()}</div>
    </div>
  </div>`;
  return html;
}

const passportSummary = () => PP.isEmpty() ? 'не заполнен' : PP.summaryLine();

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const dayTitle = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${S.ruDayMonth(iso)}`;
};

/* ══ ТЕЛО: СИСТЕМЫ ОРГАНИЗМА ═════════════════════════════════
   Плоский список показателей — это алфавит: сорок строк, по которым нельзя
   понять главного. Человек думает системами: печень, почки, кровь. И самое
   важное, чего список не говорил никогда, — ЧЕГО НЕТ. Пустая система это не
   «здоров», это «не смотрели ни разу». */

/* Сводка состояний (из макета): одна полоса, поделённая цветами по долям, и
   те же числа словами. Отвечает на «сколько у меня плохо» одним взглядом —
   раньше это число надо было собирать по списку. Серые здесь — «замер старше
   двух лет»: неизвестность показываем честно, а не прячем в конец. */
function statusSummary(list) {
  const n = { out: 0, edge: 0, ok: 0, stale: 0 };
  for (const m of list) (m.stale ? n.stale++ : n[m.status] === undefined ? 0 : n[m.status]++);
  const total = n.out + n.edge + n.ok + n.stale;
  if (!total) return '';
  const segs = [
    ['var(--ok-dot)', n.ok, 'в норме'],
    ['var(--edge-dot)', n.edge, 'у границы'],
    ['var(--bad-dot)', n.out, 'вне нормы'],
    ['var(--hair2)', n.stale, 'устарели'],
  ].filter(([, k]) => k > 0);
  const bar = segs.map(([c, k]) => `<i style="flex:${k};background:${c}"></i>`).join('');
  const words = segs.map(([c, k, w]) => `<span><b style="color:${c === 'var(--hair2)' ? 'var(--ink3)' : c}">${k}</b> ${w}</span>`).join('');
  return `<div class="ssum"><div class="ssb">${bar}</div><div class="ssw">${words}</div></div>`;
}

export function markers(app) {
  const list = S.markerList();
  if (!list.length) {
    return head('Здоровье', '') + emptyBlock('heartbeat', 'Тело пока не изучено',
      'Как только разберу первый анализ, здесь загорятся системы: кровь, печень, почки, гормоны. И будет видно, про какие из них я ещё ничего не знаю.',
      `<button class="btn" data-act="add">Закинуть анализ</button>`);
  }

  const sys = mapSystems(list);
  const cov = coverage(list);
  const attention = list.filter(m => !m.stale && (m.status === 'out' || m.status === 'edge'));

  let html = head('Здоровье', `${list.length} ${plural(list.length, 'показатель', 'показателя', 'показателей')} · ${cov.systemsTouched} ${plural(cov.systemsTouched, 'система', 'системы', 'систем')} из ${cov.systemsTotal}`, avatarBtn + addBtn);

  /* Герой экрана отвечает на вопрос, ради которого сюда заходят: что я знаю
     о себе и чего не знаю. Дуга — как шкала прибора: видно, что стрелка едва
     сдвинулась. Ряд клеточек, стоявший тут раньше, показывал то же число,
     но читался как узор на обоях. */
  const gapsCount = sys.reduce((n, x) => n + x.missing.length, 0);
  html += `<div class="card">
    <div class="row" style="gap:14px;align-items:center">
      <div class="gg">${gauge(cov.pct, { size: 88, stroke: 9 })}<b>${Math.round(cov.pct * 100)}<span>%</span></b></div>
      <div class="grow">
        <div class="nm" style="font-size:15px;font-weight:760">Что я знаю о теле</div>
        <div class="sm" style="margin-top:3px">Сдано <b style="color:var(--ink)">${cov.known}</b> из ${cov.total} базовых анализов${cov.blank.length ? `, ${cov.blank.length} ${plural(cov.blank.length, 'система', 'системы', 'систем')} не тронуто вовсе` : ''}</div>
      </div>
    </div>
    ${statusSummary(list)}
    ${gapsCount ? `<div class="divide"></div>
      <div class="row tap" data-act="go" data-r="gaps">
        <span class="nico teal">${icon('target', 'ico s')}</span>
        <div class="grow"><div class="nm" style="font-size:14px">Что доисследовать</div>
          <div class="sm">${gapsCount} ${plural(gapsCount, 'анализ', 'анализа', 'анализов')}, которых я не видел ни в одном бланке</div></div>
        ${chevron()}
      </div>` : ''}
  </div>`;

  html += `<div class="syst">${sys.map(sysCard).join('')}</div>`;

  if (attention.length) {
    html += `<div class="cap">Требует внимания · ${attention.length}</div>
      <div class="card list">${attention.map(row).join('')}</div>`;
  }

  html += `<div class="grp">
    <div class="gi" data-act="go" data-r="markers-all">${icon('chartline', 'ico s')}<div class="t">Все показатели списком</div>
      <div class="v">${list.length}</div>${chevron()}</div>
    <div class="gi" data-act="due">${icon('clock', 'ico s')}<div class="t">Что пора пересдать</div>
      <div class="v">${S.dueList().length || '—'}</div>${chevron()}</div>
    <div class="gi" data-act="go" data-r="colors">${icon('eye', 'ico s')}<div class="t">Что значат цвета</div>${chevron()}</div>
  </div>`;
  return html;
}

/* Карточка системы. Заливка — своим цветом системы (он ничего не говорит о
   здоровье, это просто её краска), точки — сколько базовых анализов сдано,
   и главное: прямо написано, чего не хватает. Раньше карточка сообщала
   «1 показатель · 18.07» — и человек не мог понять, много это или мало. */
function sysCard(s) {
  const gap = s.missing.length;
  /* Зелёная галочка ставится, ТОЛЬКО когда базовый набор сдан целиком.
     Иначе «всё хорошо» стояло рядом с «не хватает 4 из 5» — и означало
     всего лишь «то единственное, что я видел, в норме». */
  const badge = s.out ? `<span class="sysb out">${s.out}</span>`
    : s.edge ? `<span class="sysb edge">${s.edge}</span>`
    : (s.state === 'ok' && !gap) ? `<span class="sysb ok">${icon('check', 'ico s')}</span>` : '';
  const sub = !s.markers.length
    ? `нет ни одного из ${s.coreTotal}`
    : s.state === 'stale' ? `последний раз ${S.ruShort(s.lastDate)}`
    : gap ? `не хватает ${gap} из ${s.coreTotal}` : `всё сдано · ${S.ruShort(s.lastDate)}`;
  return `<button class="sysc s-${s.state} tint-${s.tint}" data-act="system" data-id="${esc(s.id)}">
    <div class="sysh"><span class="sysi">${icon(s.icon, 'ico s')}</span>${badge}</div>
    <div class="sysn">${esc(s.title)}</div>
    <div class="sysd">${s.core.map((k, i) => `<i class="${i < s.coreHave ? 'on' : ''}"></i>`).join('')}</div>
    <div class="syss${gap ? ' gap' : ''}">${esc(sub)}</div>
  </button>`;
}

/* ── что доисследовать ───────────────────────────────────────────
   Экран отвечает ровно на один вопрос — «чего я про себя не знаю». Не
   назначение и не список покупок: повод спросить врача, что из этого нужно
   именно тебе. Поэтому здесь есть кнопка «скопировать», а не «заказать». */

export function gapsView(app) {
  const list = S.markerList();
  const sys = mapSystems(list).filter(s => s.missing.length);
  const total = sys.reduce((n, s) => n + s.missing.length, 0);
  const cov = coverage(list);

  let html = backHeadWide('Что доисследовать', `${total} ${plural(total, 'анализ', 'анализа', 'анализов')} · сдано ${cov.known} из ${cov.total}`);

  if (!total) {
    return html + emptyBlock('check', 'Белых пятен нет',
      'Базовый набор по всем системам у тебя сдан. Дальше дело не в новых анализах, а в том, чтобы вовремя пересдавать уже знакомые.',
      `<button class="btn ghost" data-act="due">Что пора пересдать</button>`);
  }

  html += `<div class="card flat"><div class="row" style="align-items:flex-start">${icon('eye', 'ico s')}
    <div class="grow sm" style="line-height:1.55">Это обычный базовый набор для каждой системы, а не назначение. Я вижу только то, что попало в бланки: если анализ сдавался на бумаге и в приложение не попал — для меня его нет.</div></div></div>`;

  for (const s of sys) {
    html += `<div class="card gapc tint-${s.tint}">
      <div class="row tap" data-act="system" data-id="${esc(s.id)}">
        <span class="sysi">${icon(s.icon, 'ico s')}</span>
        <div class="grow"><div class="nm">${esc(s.title)}</div>
          <div class="sm">${s.markers.length ? `сдано ${s.coreHave} из ${s.coreTotal}` : 'система не тронута вовсе'} · ${esc(s.about)}</div></div>
        ${chevron()}
      </div>
      <div class="chips" style="margin-top:11px">${s.missingTitles.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
    </div>`;
  }

  html += `<button class="btn" data-act="copy-gaps">Скопировать весь список</button>`;
  html += `<div class="disc">Список удобно показать врачу или отдать в лабораторию. Что именно сдавать и как часто — решает врач, а не приложение.</div>`;
  return html;
}

/* ── одна система ────────────────────────────────────────────── */

export function systemView(app) {
  const def = systemById(app.param.id);
  if (!def) return backHead('Система', '') + `<div class="card">Не найдено.</div>`;
  const list = S.markerList();
  const s = mapSystems(list).find(x => x.id === def.id);

  let html = backHead(def.title, def.about);

  html += `<div class="card">
    <div class="row" style="align-items:baseline">
      <div class="grow"><div class="nm" style="font-size:13px;font-weight:750">Изучено</div></div>
      <div class="sm"><b style="color:var(--ink)">${s.coreHave}</b> из ${s.coreTotal} базовых анализов</div>
    </div>
    <div class="sysd big" style="margin-top:9px">${def.core.map((k, i) => `<i class="${i < s.coreHave ? 'on' : ''}"></i>`).join('')}</div>
    ${s.lastDate ? `<div class="sm" style="margin-top:9px">Последний бланк с этими числами — ${S.ruDate(s.lastDate)}${s.daysOld > 400 ? `, это ${Math.floor(s.daysOld / 365)} ${plural(Math.floor(s.daysOld / 365), 'год', 'года', 'лет')} назад` : ''}.</div>` : ''}
  </div>`;

  if (s.missing.length) {
    html += `<div class="card note">
      <div class="row">${icon('eye', 'ico s')}<div class="grow"><div class="nm" style="font-size:14px">Чего я не видел</div></div></div>
      <div class="sm" style="margin:8px 0 11px;line-height:1.5">Этих анализов нет ни в одном бланке. Это не значит, что с ними что-то не так — я просто ничего о них не знаю.</div>
      <div class="chips">${s.missingTitles.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
      <button class="mini" data-act="copy-missing" data-id="${esc(def.id)}" style="margin-top:11px">Скопировать список для лаборатории</button>
    </div>`;
  }

  if (s.markers.length) {
    const fresh = s.markers.filter(m => !m.stale);
    const old = s.markers.filter(m => m.stale);
    if (fresh.length) html += `<div class="cap">Что известно · ${fresh.length}</div><div class="card list">${fresh.map(row).join('')}</div>`;
    if (old.length) html += `<div class="cap">Давно не мерил · ${old.length}</div><div class="card list">${old.map(row).join('')}</div>`;
  } else {
    html += emptyBlock(def.icon, 'Пусто',
      'Ни одного числа по этой системе в архиве нет. Появится бланк — всё встанет сюда само.',
      `<button class="btn ghost" data-act="add">Закинуть анализ</button>`);
  }

  html += `<div class="disc">Ключевые анализы — обычный базовый набор для этой системы, а не назначение. Что сдавать именно тебе, решает врач.</div>`;
  return html;
}

/* Плоский список — на случай, когда ищешь конкретную строку из бланка */
export function markersAll(app) {
  const list = S.markerList();
  const attention = list.filter(m => !m.stale && (m.status === 'out' || m.status === 'edge'));
  const fine = list.filter(m => !m.stale && m.status === 'ok');
  const unknown = list.filter(m => !m.stale && m.status === 'unknown');
  const stale = list.filter(m => m.stale);
  const lastDate = list.map(m => m.last.date).filter(Boolean).sort().slice(-1)[0];

  let html = backHeadWide('Все показатели', `${list.length} ${plural(list.length, 'показатель', 'показателя', 'показателей')}${lastDate ? ` · последний ${S.ruShort(lastDate)}` : ''}`, addBtn);
  const section = (title, arr) => arr.length ? `<div class="cap">${title} · ${arr.length}</div><div class="card list">${arr.map(row).join('')}</div>` : '';
  html += section('Требует внимания', attention);
  html += section('В норме', fine);
  html += section('Норма не указана', unknown);
  html += section('Давно не мерил', stale);
  return html;
}

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
    ${m.stale ? '' : statusLine(m.series, { w: 58, h: 24 })}
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
        ${d.blobId
          ? `<div class="thumb" style="width:44px;aspect-ratio:3/4"><img data-blob="${esc(d.blobId)}" alt=""></div>`
          : `<span class="nico">${icon(docIcon(d.type, d.isPdf), 'ico s')}</span>`}
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
  const today = S.todayISO();
  const week = weekDays(today);
  const date = week.includes(app.medDate) ? app.medDate : today;
  const all = MED.state.meds;
  const plan = MED.planFor(date);
  const d = MED.dayCount(date);
  const active = MED.activeMeds(date);

  const addBtnMed = `<button class="rnd dark" data-act="med-new">${icon('plus', 'ico s')}</button>`;
  let html = backHeadWide('Лекарства', dayTitle(today), addBtnMed);

  if (!all.length) {
    return html + emptyBlock('pill', 'Назначения — сюда',
      'Сфотографируй рецепт, лист назначений или выписку. Прочитаю <b>что, сколько раз в день и сколько дней</b> принимать — и разложу по утрам, дням и вечерам.',
      `<button class="btn" data-act="add">${icon('camera', 'ico s')}Снять назначение</button>
       <button class="btn ghost" data-act="med-new" style="margin-top:10px">Добавить лекарство руками</button>`)
      + `<div class="disc">Приложение только помнит назначенное врачом. Оно ничего не назначает и не отменяет.</div>`;
  }

  /* Про непроверенное здесь молчим: это написано в каждой карточке курса ниже
     и висит на колокольчике. Одна мысль в одном месте. */
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

  /* Неделя и день — одним блоком. Сверху семь дней с кольцами: сразу видно,
     где были пропуски. Ниже — сам день сверху вниз, от утра к ночи. */
  html += `<div class="card">
    ${weekStrip(week, date, today)}
    <div class="divide"></div>
    ${dayHead(date, today, d)}
    ${plan.length || active.length
      ? dayTimeline(app, date, today)
      : `<div class="sm" style="padding:4px 0 2px">На этот день ничего не назначено.</div>`}
  </div>`;

  if (!plan.length && active.length) {
    html += `<div class="card flat"><div class="row">${icon('warning', 'ico s')}
      <div class="grow sm">У активных курсов не указано время приёма — открой курс и поставь утро, день или вечер.</div></div></div>`;
  }

  const later = all.filter(m => MED.statusOf(m, date) === 'later');
  const past = all.filter(m => ['done', 'stopped'].includes(MED.statusOf(m, date)));

  if (active.length) {
    html += `<div class="cap">Курсы · ${active.length}</div>`;
    html += active.map(m => medCourseCard(m, date, week, today)).join('');
  }
  if (later.length) {
    html += `<div class="cap">Начнутся позже</div><div class="card list">${later.map(m => medCourseRow(m, date)).join('')}</div>`;
  }
  if (past.length) {
    html += `<div class="cap">Закончены · ${past.length}</div><div class="card list">${past.slice(0, 12).map(m => medCourseRow(m, date)).join('')}</div>`;
  }

  html += `<div class="grp">
    <div class="gi" data-act="add">${icon('camera', 'ico s')}<div class="t">Снять назначение врача</div>${chevron()}</div>
    <div class="gi" data-act="med-new">${icon('plus', 'ico s')}<div class="t">Добавить лекарство руками</div>${chevron()}</div>
  </div>`;
  html += `<div class="disc">Приложение не звонит и не шлёт уведомлений — оно живёт внутри Телеграма. Лечение назначает врач: здесь оно только записано.</div>`;
  return html;
}

/* ── неделя ──────────────────────────────────────────────────────
   Семь дней с понедельника. Кольцо показывает, сколько приёмов закрыто:
   пропуск видно, не открывая ни одного курса. Нажатие переключает день —
   отметить забытую утреннюю таблетку можно задним числом. */
const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

function weekDays(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const shift = (new Date(y, m - 1, d).getDay() + 6) % 7;   // неделя начинается с понедельника
  const monday = MED.addDays(iso, -shift);
  return Array.from({ length: 7 }, (_, i) => MED.addDays(monday, i));
}

function weekStrip(week, date, today) {
  return `<div class="wk">${week.map((d, i) => {
    const c = MED.dayCount(d);
    const future = d > today;
    const cls = [d === date ? 'on' : '', d === today ? 'now' : '', future ? 'fut' : ''].filter(Boolean).join(' ');
    const pct = c.total ? c.taken / c.total : 0;
    return `<button class="wd ${cls}" data-act="med-day" data-date="${d}">
      <span class="wdn">${WD[i]}</span>
      <span class="wdr">${c.total ? ring(future ? 0 : pct, { size: 30, stroke: 2.6, color: 'currentColor' }) : ''}
        <b>${+d.slice(8, 10)}</b></span>
    </button>`;
  }).join('')}</div>`;
}

function dayHead(date, today, d) {
  const rel = date === today ? 'Сегодня'
    : date === MED.addDays(today, -1) ? 'Вчера'
    : date === MED.addDays(today, 1) ? 'Завтра'
    : S.ruDayMonth(date);
  const sub = !d.total ? 'ничего не назначено'
    : d.left ? `осталось ${d.left} ${plural(d.left, 'приём', 'приёма', 'приёмов')}`
    : 'всё принято';
  return `<div class="row" style="align-items:baseline;margin-bottom:10px">
    <div class="grow"><div class="nm" style="font-size:14px;font-weight:760">${rel}${date === today ? '' : `, ${S.ruDayMonth(date)}`}</div></div>
    <div class="sm">${sub}</div>
    ${date !== today ? `<button class="mini" data-act="med-day" data-date="${today}" style="min-height:30px;padding:5px 11px">Сегодня</button>` : ''}
  </div>`;
}

/* ── таймлайн дня ────────────────────────────────────────────────
   День идёт сверху вниз: утро, день, вечер, ночь — всегда все четыре, со
   своим временем и точкой на линии. Раньше это были четыре плитки, из которых
   человек видел «утро и вечер» и не понимал, куда делось остальное. */
function dayTimeline(app, date, today) {
  const plan = MED.planFor(date);
  const byId = Object.fromEntries(plan.map(s => [s.id, s]));
  const order = MED.SLOTS.map(s => s.id);
  const nowIdx = order.indexOf(MED.currentSlot());
  const isToday = date === today;
  const future = date > today;

  const now = nowMinutes();
  const nowRow = `<div class="tlnow"><b>${hhmm(new Date())}</b><span></span><i></i></div>`;
  let nowPlaced = !isToday;

  return `<div class="tl">${MED.SLOTS.map((s, i) => {
    const cur = byId[s.id];
    const items = cur ? cur.items : [];
    const taken = items.filter(x => x.taken).length;
    const passed = future ? false : (!isToday || i < nowIdx);
    const isNow = isToday && i === nowIdx;
    /* Метку «сейчас» ставим и на пустую часть дня: иначе в спокойный час
       таймлайн выглядит так, будто время в нём остановилось. */
    const state = !items.length ? 'nil'
      : taken === items.length ? 'done'
      : isNow ? 'now'
      : passed ? 'miss'
      : 'wait';
    const note = !items.length ? 'ничего'
      : state === 'done' ? 'принято'
      : state === 'miss' ? `не отмечено ${items.length - taken}`
      : `${items.length - taken} из ${items.length}`;
    /* Настоящее время идёт между частями дня — как черта «сейчас» в календаре.
       Без неё утро и вечер стоят в вакууме: непонятно, где ты в этом дне. */
    let before = '';
    if (!nowPlaced && now < minutesOf(s.at)) { before = nowRow; nowPlaced = true; }
    return before + `<div class="tls ${state}${isNow ? ' at' : ''}">
      <div class="tlt">${s.at}</div>
      <div class="tlx"><i></i></div>
      <div class="tlc">
        <div class="tlh"><b>${s.title}</b><span>${note}</span></div>
        ${items.map(x => medRow(x, s.id, date, { lock: future })).join('')}
      </div>
    </div>`;
  }).join('')}${nowPlaced ? '' : nowRow}</div>`;
}

/* Карточка курса: что это, когда принимать и как шла неделя.
   Семь клеток внизу стоят в тех же колонках, что и неделя наверху, —
   видно, в какие дни лекарство вообще положено пить. */
function medCourseCard(m, date, week, today) {
  const unchecked = m.source === 'ai' && !m.confirmed;
  const p = MED.progressOf(m, date);
  const slots = (m.slots || []);
  return `<div class="card crs tap" data-act="med" data-id="${esc(m.id)}">
    <div class="row">
      <div class="grow"><div class="nm">${esc(m.name)}${m.dose ? ` · ${esc(m.dose)}` : ''}</div>
        <div class="sm">${esc(MED.scheduleText(m))}${MED.foodText(m.food) ? ', ' + MED.foodText(m.food) : ''}</div></div>
      ${unchecked ? `<span class="tag edge">сверь</span>` : ''}
      ${chevron()}
    </div>
    <div class="wkrow">${week.map(d => {
      const on = MED.isOnToday(m, d);
      const marks = slots.map(s => MED.intakeOf(m.id, d, s)?.status);
      const full = on && marks.length && marks.every(x => x === 'taken');
      const some = on && marks.some(x => x === 'taken');
      const cls = [!on ? 'off' : full ? 'full' : some ? 'part' : '', d > today ? 'fut' : '', d === date ? 'sel' : ''].filter(Boolean).join(' ');
      return `<i class="${cls}"></i>`;
    }).join('')}</div>
    <div class="sm" style="margin-top:7px">${esc(MED.courseText(m, date))}${p.total ? ` · осталось ${Math.max(0, p.total - Math.max(1, p.day))} ${plural(Math.max(0, p.total - Math.max(1, p.day)), 'день', 'дня', 'дней')}` : ''}</div>
  </div>`;
}

function medCourseRow(m, date) {
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
      <div class="big" style="font-size:34px">${p.total ? `${Math.max(1, Math.min(p.day, p.total))}<span style="font-size:16px;font-weight:650;color:var(--ink3);margin-left:9px;letter-spacing:0">из ${p.total}</span>` : '—'}</div>
      <div class="grow sm" style="text-align:right">${p.total ? 'день курса' : stWord}</div>
    </div>
    ${p.total ? `<div class="prog" style="margin-top:10px"><i style="width:${Math.max(2, Math.min(100, Math.round((p.day / p.total) * 100)))}%"></i></div>` : ''}
    <div class="divide"></div>
    <div class="kv"><span class="k">Когда принимать</span><span class="v">${esc(MED.scheduleText(m))}${MED.foodText(m.food) ? ', ' + MED.foodText(m.food) : ''}</span></div>
    <div class="kv"><span class="k">Срок</span><span class="v">${m.startDate ? S.ruShort(m.startDate) : '—'}${p.end ? ` – ${S.ruShort(p.end)}` : ' · без окончания'}</span></div>
    ${m.instructions ? `<div class="kv"><span class="k">Как принимать</span><span class="v">${esc(m.instructions)}</span></div>` : ''}
    ${m.freqText ? `<div class="sm" style="margin-top:9px">В назначении написано: «${esc(m.freqText)}»</div>` : ''}
  </div>`;

  /* Назначенное лекарство из группы, на которую записана аллергия. Приложение
     не отменяет и не предлагает замену — показывает противоречие между двумя
     своими записями и отправляет к тому, кто назначал. */
  const conflict = PP.conflictsFor(m.name);
  if (conflict.length) {
    html += `<div class="card note danger">
      <div class="row">${icon('warning', 'ico s')}<div class="grow"><div class="nm" style="font-size:14px;color:var(--bad)">Переспроси врача</div></div></div>
      <div class="sm" style="margin:8px 0 0;line-height:1.55">У тебя записана аллергия на <b>${esc(conflict[0].allergy.name)}</b>${conflict[0].group ? `, а ${esc(m.name)} — это ${esc(conflict[0].group)}, та же группа` : ''}${conflict[0].allergy.note ? ` (${esc(conflict[0].allergy.note)})` : ''}. Курс я не трогаю и замену не предлагаю: покажи это тому, кто выписал.</div>
    </div>`;
  }

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
        const [y, mo, dd] = d.date.split('-').map(Number);
        const wd = WD[(new Date(y, mo - 1, dd).getDay() + 6) % 7];
        return `<div class="daycell ${cls}" title="${d.date}"><em>${wd}</em><span>${dd}</span></div>`;
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
  const week = weekDays(today);
  const date = week.includes(app.foodDate) ? app.foodDate : today;
  const meals = S.mealsOn(date);
  const t = S.dayTotals(date);
  const tg = S.dayTargets();
  const goal = S.foodGoal();
  const plan = S.mealPlan(date);

  /* Еда переехала в нижние двери, поэтому шапка корневая: возвращаться отсюда
     некуда, а стрелка «назад» в корне экрана — обещание, которого нет. */
  let html = head('Еда', date === today ? 'сегодня' : S.ruDate(date),
    `<button class="rnd dark" data-act="add-meal">${icon('camera', 'ico s')}</button>`);

  /* Неделя теми же кольцами, что у лекарств: можно вернуться на любой день
     и посмотреть, что было съедено. Раньше «Тарелка» знала только сегодня. */
  html += `<div class="card">
    <div class="fwk">${week.map((d, i) => {
      const dt = S.dayTotals(d);
      const future = d > today;
      const pct = tg.kcal ? Math.min(1, dt.kcal / tg.kcal) : 0;
      return `<button class="wd ${d === date ? 'on' : ''} ${d === today ? 'now' : ''} ${future ? 'fut' : ''}"
        data-act="food-day" data-date="${d}">
        <span class="wdn">${WD[i]}</span>
        <span class="wdr">${dt.count ? ring(pct, { size: 30, stroke: 2.6, color: 'var(--teal)' }) : ''}<b>${+d.slice(8, 10)}</b></span>
      </button>`;
    }).join('')}</div>
  </div>`;

  if (goal) {
    html += `<div class="card note tap" data-act="marker" data-key="${esc(goal.key)}">
      <div class="row">${icon('target', 'ico s')}
        <div class="grow"><div class="nm" style="font-size:14px">Цель из анализов: ${esc(goal.goal)}</div>
          <div class="sm">${esc(goal.title)} ${S.trim(goal.value)} ${esc(goal.unit)} · норма ${esc(S.fmtRef(goal))} · замер от ${S.ruDate(goal.date)}</div></div>
      </div>
    </div>`;
  }

  if (!meals.length) {
    html += emptyBlock('forkknife', date === today ? 'Сфотографируй тарелку' : 'В этот день ничего не снято',
      goal
        ? `Я посчитаю калории, белки-жиры-углеводы и то, что важно для цели «${esc(goal.goal)}»: <b>насыщенные жиры, клетчатку, холестерин</b>.`
        : 'Я посчитаю калории, белки-жиры-углеводы, клетчатку и главные микроэлементы.',
      date === today ? `<button class="btn" data-act="add-meal">${icon('camera', 'ico s')}Снять еду</button>
       <button class="btn ghost" data-act="pick-meal" style="margin-top:10px">Выбрать из галереи</button>` : '');
    if (date === today) html += mealPlanCard(plan, app);
    return html;
  }

  /* Одно кольцо вместо четырёх: заполненная часть — съеденные калории, и она
     сама разбита на белки, жиры и углеводы. Четыре кольца показывали четыре
     доли от четырёх разных рамок, и суть в них не читалась. */
  const kP = t.protein_g * 4, kF = t.fat_g * 9, kC = t.carbs_g * 4;
  const parts = [
    { kcal: kP, color: 'var(--s-indigo)' },
    { kcal: kF, color: 'var(--s-violet)' },
    { kcal: kC, color: 'var(--s-cyan)' },
  ];
  parts.frame = Math.max(tg.kcal, kP + kF + kC);
  html += `<div class="card">
    <div class="row" style="gap:16px;align-items:center">
      <div class="kring">${kcalRing(parts, { size: 128, stroke: 13 })}
        <b>${Math.round(t.kcal)}<em>из ${tg.kcal}</em></b></div>
      <div class="grow">
        <div class="mleg">
          ${[['Белки', t.protein_g, kP, 'var(--s-indigo)', 'egg'], ['Жиры', t.fat_g, kF, 'var(--s-violet)', 'avocado'], ['Углеводы', t.carbs_g, kC, 'var(--s-cyan)', 'bread']]
            .map(([label, g, kc, color, ic]) => `<div class="ml">
              <span class="tic sm-ic" style="--accent:${color}">${icon(ic, 'ico s')}</span>
              <span class="mn">${label}</span>
              <span class="mv">${Math.round(g)} г<em> · ${Math.round(kc)} ккал</em></span>
            </div>`).join('')}
        </div>
        <div class="sm" style="margin-top:8px">${t.count} ${plural(t.count, 'приём', 'приёма', 'приёмов')}${date === today && plan.left ? ` · осталось ${plan.left} ккал` : ''}</div>
      </div>
    </div>
  </div>`;

  html += mealPlanCard(plan, app, date === today);

  /* Полосы под кольцом — только то, чего в кольце нет: клетчатка, насыщенные
     жиры и сахар. Белки-жиры-углеводы уже нарисованы дугами. */
  const focus = goal?.watch?.includes('sat_fat_g')
    ? [['sat_fat_g', 'Насыщенные жиры', 'г', tg.sat_fat_g, true], ['fiber_g', 'Клетчатка', 'г', tg.fiber_g, false], ['cholesterol_mg', 'Холестерин', 'мг', tg.cholesterol_mg, true]]
    : goal?.watch?.includes('sugar_g')
      ? [['sugar_g', 'Сахар', 'г', tg.sugar_g, true], ['fiber_g', 'Клетчатка', 'г', tg.fiber_g, false], ['sat_fat_g', 'Насыщенные жиры', 'г', tg.sat_fat_g, true]]
      : [['fiber_g', 'Клетчатка', 'г', tg.fiber_g, false], ['sat_fat_g', 'Насыщенные жиры', 'г', tg.sat_fat_g, true], ['sugar_g', 'Сахар', 'г', tg.sugar_g, true]];

  html += `<div class="card">${focus.map(([k, label, unit, target, lowerBetter]) => {
    const v = t[k] || 0;
    const over = lowerBetter && v > target;
    return `<div style="margin-bottom:11px">
      <div class="row" style="margin-bottom:5px"><div class="grow sm" style="color:var(--ink)">${label}</div>
        <div class="sm" style="${over ? 'color:var(--bad);font-weight:700' : ''}">${S.trim(v)} / ${target} ${unit}</div></div>
      ${bar(v, target, { color: 'var(--ink)' })}
    </div>`;
  }).join('')}</div>`;

  if (app.aiFood) html += aiBlock('по цели', esc(app.aiFood).replace(/\n/g, '<br>'));

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

/* Завтрак-обед-ужин помечены теми же знаками, что утро-день-вечер на ленте
   лекарств: один язык времени на всё приложение. */
const MEAL_ICON = { breakfast: 'sunrise', lunch: 'sun', dinner: 'moon', snack: 'forkknife' };

/* Раскладка дня по приёмам пищи. Это не диета: обычная рамка «четверть на
   завтрак, треть на обед, треть на ужин», разложенная по дневному ориентиру.
   Ценность в одной строке — «на ужин остаётся 700 ккал». */
function mealPlanCard(plan, app, isToday = true) {
  const rows = plan.rows.map(r => {
    const done = r.count > 0;
    const pct = r.target ? Math.min(1, r.kcal / r.target) : 0;
    return `<div class="mrow ${done ? 'done' : ''} ${plan.next && plan.next.id === r.id && isToday ? 'next' : ''}">
      <div class="row" style="margin-bottom:5px;gap:7px">
        <span class="tic sm-ic">${icon(MEAL_ICON[r.id], 'ico s')}</span>
        <div class="grow sm" style="color:var(--ink);font-weight:650">${r.title}${plan.next && plan.next.id === r.id && isToday ? ' · впереди' : ''}</div>
        <div class="sm">${done ? `${Math.round(r.kcal)} из ~${r.target} ккал` : `~${r.target} ккал`}</div>
      </div>
      ${bar(r.kcal, r.target, { color: 'var(--teal)', warn: false })}
    </div>`;
  }).join('');

  const ask = db.settings().apiKey && isToday
    ? `<button class="mini" data-act="meal-idea" style="margin-top:12px">${icon('sparkle', 'ico s')} ${app.aiMealBusy ? 'думаю…' : `Что съесть${plan.next ? ' на ' + plan.next.title.toLowerCase() : ' дальше'}?`}</button>`
    : `<div class="sm" style="margin-top:11px">С ключом OpenRouter я подберу, что именно съесть — с учётом цели из анализов и записанных аллергий.</div>`;

  return `<div class="cap">Как разложить день</div>
  <div class="card">
    ${rows}
    ${app.aiMeal ? `<div class="divide"></div><div class="sm" style="font-size:13.5px;line-height:1.55;color:var(--ink2)">${esc(app.aiMeal).replace(/\n/g, '<br>')}</div>` : ''}
    ${ask}
    <div class="sm" style="margin-top:10px">Рамка простая: четверть дня на завтрак, треть на обед, треть на ужин. Это ориентир, а не назначение диеты.</div>
  </div>`;
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
  let html = head('Чат', `вижу ${S.state.docs.filter(d => d.status === 'ready').length} документов и ${S.markerKeys().length} показателей`, avatarBtn);

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

  /* Пустой текст в пузырь не пускаем: белый прямоугольник без единой буквы
     человек читает как поломку приложения, а не как молчание модели. */
  /* У пузыря ИИ — знак-искра на плече (из макета): в длинном диалоге глаз
     различает стороны по форме, а не вчитываясь. Свои реплики — чернильные
     справа, им значок не нужен: «я» и так знаю, где я. */
  html += msgs.map(m => {
    const text = String(m.text || '').trim();
    const body = text ? esc(text) : `<span style="color:var(--ink3)">модель ничего не прислала — спроси ещё раз</span>`;
    return m.role === 'user'
      ? `<div class="bubble me">${body}</div>`
      : `<div class="airow"><span class="aimk">${icon('sparkle', 'ico s')}</span><div class="bubble im">${body}</div></div>`;
  }).join('');
  if (app.asking) { /* индикатор ниже переопределён той же формой */ }
  if (app.asking) html += `<div class="airow"><span class="aimk">${icon('sparkle', 'ico s')}</span><div class="bubble im"><div class="row"><div class="spin"></div><span class="sm">думаю…</span></div></div></div>`;
  // одной фразой: что это такое и чего от него не ждать
  html += `<div class="disc">Помогаю разобраться в твоих анализах: читаю числа из архива и прикидываю, что они могут значить. Диагнозов не ставлю и могу ошибаться.</div>`;

  html += `<div class="composer">
    <input type="text" id="askInput" placeholder="Спроси о своей истории…" style="flex:1">
    <button class="rnd dark" data-act="ask-send" style="width:46px;height:46px;min-width:46px">${icon('sparkle', 'ico s')}</button>
  </div>`;
  return html;
}

/* ══ ЧТО ПЕРЕСДАТЬ ═══════════════════════════════════════════ */

export function due(app) {
  const list = S.dueList();
  let html = backHead('Что пересдать', `${list.length} ${plural(list.length, 'показатель ждёт', 'показателя ждут', 'показателей ждут')} очереди`);
  if (!list.length) return html + emptyBlock('check', 'Всё свежее', 'Ни один показатель не просрочен.');
  /* Справа — сколько месяцев прошло с последнего замера. Раньше там стояло
     «на сколько просрочен», и то же самое на главной считалось от даты
     замера: два разных числа про одно и то же. */
  html += `<div class="card list">${list.map(m => {
    const months = Math.max(1, Math.floor(m.daysOld / 30));
    return `<div class="it" data-act="marker" data-key="${esc(m.key)}">
      ${statusDot(m.stale ? 'unknown' : m.status)}
      <div class="grow"><div class="nm">${esc(m.title)}</div>
        <div class="sm">${esc(S.ruStatus(m.status))} · ${S.ruDate(m.last.date)} · обычно раз в ${m.every === 180 ? 'полгода' : m.every === 270 ? '9 месяцев' : 'год'}</div></div>
      <div style="text-align:right;min-width:52px">
        <div class="val">${months}</div>
        <div class="unit" style="display:block;margin:1px 0 0">мес. назад</div>
      </div>
    </div>`;
  }).join('')}</div>`;
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

  /* Аллергии — первое, что должен увидеть тот, кто будет назначать.
     Раньше этой строки на странице не было вовсе. */
  const pp = PP.state();
  html += `<div class="card ${pp.allergies.length ? 'note danger' : ''}">
    <div class="cap" style="padding:0 0 6px">${pp.allergies.length ? 'Аллергии' : 'Аллергии не записаны'}</div>
    ${pp.allergies.length
      ? pp.allergies.map(a => `<div class="kv"><span class="k" style="color:var(--bad);font-weight:700">${esc(a.name)}</span><span class="v">${esc(a.note || 'реакция не описана')}</span></div>`).join('')
      : `<div class="sm" style="line-height:1.5">Человек их не указывал — это не значит, что их нет. <b>Спросите отдельно.</b></div>
         <button class="mini" data-act="go" data-r="passport" style="margin-top:10px">Заполнить паспорт здоровья</button>`}
    ${pp.conditions.length ? `<div class="divide"></div><div class="kv"><span class="k">Хронические</span><span class="v">${pp.conditions.map(c => esc(c.name)).join(', ')}</span></div>` : ''}
    ${pp.surgeries.length ? `<div class="kv"><span class="k">Операции</span><span class="v">${pp.surgeries.map(c => esc(c.name) + (c.note ? ` (${esc(c.note)})` : '')).join(', ')}</span></div>` : ''}
  </div>`;

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

  /* Выбор модели — это триста строк списка. Раньше он лежал прямо здесь, и
     настройки превращались в свиток, в котором «удалить всё» и «пол» жили
     через сотню моделей друг от друга. Теперь это отдельная комната. */
  html += `<div class="grp">
    <div class="gi" data-act="go" data-r="models">${icon('eye', 'ico s')}<div class="t">Модель для снимков</div>
      <div class="v">${s.modelVision ? esc(shortModel(s.modelVision)) : 'не выбрана'}</div>${chevron()}</div>
    <div class="gi" data-act="go" data-r="models">${icon('chat', 'ico s')}<div class="t">Модель для текстов</div>
      <div class="v">${s.modelChat ? esc(shortModel(s.modelChat)) : 'та же'}</div>${chevron()}</div>
    <div class="gi" data-act="reparse">${icon('recycle', 'ico s')}<div class="t">Переразобрать архив</div>
      <div class="v">${S.state.docs.filter(d => d.status === 'ready').length} док.</div>${chevron()}</div>
    <div class="gi" data-act="${S.state.docs.some(d => d.demo) ? 'demo-clear' : 'demo-fill'}">${icon('sparkle', 'ico s')}
      <div class="t">Демонстрационный архив</div><div class="v">${S.state.docs.some(d => d.demo) ? 'убрать' : 'показать'}</div>${chevron()}</div>
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

/* «google/gemini-2.5-flash» в строку настроек не влезает, а последнее слово
   и есть то, что человек выбирал. */
const shortModel = (id) => String(id).split('/').pop().replace(/:free$/, ' · бесплатно');

/* ══ ВЫБОР МОДЕЛИ ════════════════════════════════════════════ */

export function modelsView(app) {
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

  let html = backHeadWide('Модель', models.length ? `${models.length} моделей · ${vision.length} с картинками` : 'список не загружен');

  html += `<div class="card">
    <div class="kv"><span class="k">Снимки</span><span class="v" style="font-size:12.5px;font-weight:600">${s.modelVision ? esc(s.modelVision) : 'не выбрана'}</span></div>
    <div class="kv"><span class="k">Тексты</span><span class="v" style="font-size:12.5px;font-weight:600">${s.modelChat ? esc(s.modelChat) : 'та же'}</span></div>
    <div class="divide"></div>
    <button class="mini" data-act="refresh-models">${app.modelsLoading ? 'Обновляю…' : 'Обновить список'}</button>
  </div>`;

  if (!models.length) {
    html += `<div class="card"><div class="sm" style="line-height:1.55">Список моделей загружается по ключу OpenRouter. Вставь ключ в настройках и нажми «Обновить список».</div></div>`;
    return html;
  }

  html += `<div class="segs">
    <button class="seg ${app.modelTab !== 'chat' ? 'on' : ''}" data-act="model-tab" data-tab="vision">Для снимков</button>
    <button class="seg ${app.modelTab === 'chat' ? 'on' : ''}" data-act="model-tab" data-tab="chat">Для текстов</button>
  </div>
  <div class="card" style="padding:12px 16px">
    <input type="text" id="modelQuery" placeholder="поиск: gemini, gemma, claude…" value="${esc(app.modelQuery || '')}">
    <div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px">
      <button class="chip ${!freeOnly ? 'sel' : ''}" data-act="model-free" data-v="0">Все · ${pool.length}</button>
      <button class="chip ${freeOnly ? 'sel' : ''}" data-act="model-free" data-v="1">Бесплатные · ${freeCount}</button>
    </div>
    <div class="sm" style="margin-top:9px;line-height:1.45">${app.modelTab === 'chat'
      ? `Любая модель из ${models.length}: этой достаются вопросы по архиву и тексты.`
      : `Только те, что умеют читать картинки — ${pool.length} из ${models.length}. Текстовые модели (например gpt-oss) бланк не увидят.`}</div>
  </div>`;

  if (freeOnly) {
    html += `<div class="card flat"><div class="row">${icon('warning', 'ico s')}
      <div class="grow sm" style="line-height:1.5">У бесплатных моделей свои ограничения: <b>примерно 50 запросов в сутки</b> и очередь в час пик. <b>Сверяй распознанные числа с оригиналом</b> — с любой моделью, платной тоже.</div></div></div>`;
  }

  if (!filtered.length) {
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
  return html;
}

/* ══ ЧТО ЗНАЧАТ ЦВЕТА ════════════════════════════════════════
   Цветовой код на одном экране. Правило приложения: светофор говорит только
   о здоровье, остальные краски — про дела и про то, к какой системе относится
   показатель. Пока это правило нигде не записано для человека, оно живёт
   только у меня в голове — а значит, его нет. */

export function colorsView(app) {
  const row = (color, title, sub) => `<div class="gi" style="cursor:default">
    <span class="swat" style="background:${color}"></span>
    <div class="t"><div class="nm" style="font-size:14px">${esc(title)}</div><div class="sm">${esc(sub)}</div></div>
  </div>`;

  let html = backHeadWide('Что значат цвета', 'три группы, и они не пересекаются');

  html += `<div class="cap">Состояние здоровья · светофор</div>
  <div class="grp">
    ${row('var(--ok-dot)', 'Зелёный — в норме', 'значение внутри границ из бланка')}
    ${row('var(--edge-dot)', 'Оранжевый — у границы', 'ближе 8% к краю коридора: ещё норма, но впритык')}
    ${row('var(--bad-dot)', 'Красный — вне нормы', 'вышло за границы; красной рамкой обведено только противоречие «назначено то, на что аллергия»')}
    ${row('var(--ink4)', 'Серый — неизвестно', 'границ в бланке не было или замер старше двух лет')}
  </div>
  <div class="sm" style="padding:0 4px 10px;line-height:1.5">Рядом с цветом всегда стоит слово или число: цвет ускоряет чтение, но никогда не остаётся единственным сигналом — на случай, если ты не различаешь оттенки.</div>`;

  html += `<div class="cap">Дела · не про здоровье</div>
  <div class="grp">
    ${row('var(--blue)', 'Синий — приём лекарств', 'сколько принято сегодня')}
    ${row('var(--violet)', 'Фиолетовый — изученность', 'сколько базовых анализов сдано')}
    ${row('var(--teal)', 'Бирюзовый — калории', 'внешнее кольцо на «Тарелке» и точки по 100 ккал')}
    ${row('var(--s-indigo)', 'Индиго — белки', 'второе кольцо тарелки')}
    ${row('var(--s-violet)', 'Сиреневый — жиры', 'третье кольцо тарелки')}
    ${row('var(--s-cyan)', 'Циан — углеводы', 'внутреннее кольцо тарелки')}
    ${row('var(--ink)', 'Чернила — сделано', 'отмеченный приём, закрытый день, слово ИИ')}
  </div>
  <div class="cap">Время суток · лента дня на главной</div>
  <div class="grp">
    ${row('var(--s-amber)', 'Тёплый — утро и день', 'знак восхода и солнца, начало полосы дня')}
    ${row('var(--s-indigo)', 'Холодный — вечер', 'знак луны, конец полосы дня')}
  </div>`;

  html += `<div class="cap">Системы организма · просто различают</div>
  <div class="grp">
    ${SYSTEMS.map(sy => `<div class="gi" style="cursor:default">
      <span class="swat" style="background:var(--s-${sy.tint})"></span>
      <div class="t"><div class="nm" style="font-size:14px">${esc(sy.title)}</div></div>
    </div>`).join('')}
  </div>
  <div class="disc">Краски систем не значат «хорошо» или «плохо» — они только помогают отличить печень от почек. Ни одна из них не повторяет зелёный, оранжевый и красный.</div>`;
  return html;
}

/* ══ ПАСПОРТ ЗДОРОВЬЯ ════════════════════════════════════════
   То, что спрашивают первым — и чего приложение про человека не знало.
   Числа из бланков без этой страницы — половина картины, а страница для
   врача без строки «аллергия на пенициллин» просто опасна. */

export function passportView(app) {
  const p = PP.state();
  const meds = MED.state.meds.filter(m => ['active', 'ask'].includes(MED.statusOf(m)));
  const conflicts = PP.conflictingMeds(meds);

  let html = backHeadWide('Паспорт здоровья', PP.isEmpty() ? 'пока пусто' : PP.summaryLine());

  if (PP.isEmpty()) {
    html += `<div class="card flat"><div class="row" style="align-items:flex-start">${icon('shield', 'ico s')}
      <div class="grow sm" style="line-height:1.55">«На что аллергия?» — первый вопрос на приёме и в скорой. Числа из анализов на него не отвечают, а бумажка в кармане теряется. Запиши один раз — и это будет на странице для врача, в ответах ИИ и в сверке назначений.</div></div></div>`;
  }

  /* Конфликт назначения с аллергией — самое важное на экране. Приложение
     ничего не отменяет: оно показывает противоречие между двумя своими
     записями и просит переспросить того, кто назначал. */
  for (const c of conflicts) {
    html += `<div class="card note danger">
      <div class="row">${icon('warning', 'ico s')}<div class="grow"><div class="nm" style="font-size:14px;color:var(--bad)">Переспроси врача про ${esc(c.med.name)}</div></div></div>
      <div class="sm" style="margin:8px 0 11px;line-height:1.55">У тебя записана аллергия на <b>${esc(c.hits[0].allergy.name)}</b>${c.hits[0].group ? `, а это ${esc(c.hits[0].group)} — та же группа` : ''}. Я не отменяю назначенное и не предлагаю замену: покажи эту строку врачу, который выписал.</div>
      <div class="chips"><button class="chip" data-act="med" data-id="${esc(c.med.id)}">Открыть курс</button></div>
    </div>`;
  }

  html += `<div class="card">
    <div class="cap" style="padding:0 0 8px">Группа крови</div>
    <div class="chips">${PP.BLOOD.map(b => `<button class="chip ${p.blood === b ? 'sel' : ''}" data-act="pp-blood" data-v="${esc(b)}">${esc(b)}</button>`).join('')}</div>
    <div class="chips" style="margin-top:8px">${PP.RH.map(r => `<button class="chip ${p.rh === r ? 'sel' : ''}" data-act="pp-rh" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div>
    <div class="sm" style="margin-top:10px">Со слов, а не из анализа: приложение группу крови не измеряет.</div>
  </div>`;

  for (const [kind, def] of Object.entries(PP.KINDS)) {
    const list = p[kind] || [];
    html += `<div class="cap">${esc(def.title)}${list.length ? ` · ${list.length}` : ''}</div>`;
    html += `<div class="grp">`;
    if (!list.length) {
      html += `<div class="gi" style="cursor:default"><span class="nico">${icon(def.icon, 'ico s')}</span>
        <div class="t"><div class="nm" style="font-size:14px">Ничего не записано</div><div class="sm">${esc(def.hint)}</div></div></div>`;
    } else {
      html += list.map(x => `<div class="gi" style="cursor:default">
        <span class="nico ${kind === 'allergies' ? 'out' : ''}">${icon(def.icon, 'ico s')}</span>
        <div class="t"><div class="nm" style="font-size:14px">${esc(x.name)}</div>${x.note ? `<div class="sm">${esc(x.note)}</div>` : ''}</div>
        <button class="rnd" data-act="pp-del" data-kind="${kind}" data-id="${esc(x.id)}" title="Убрать"
          style="width:32px;height:32px;min-width:32px;box-shadow:none;background:var(--field);color:var(--ink3)">${icon('trash', 'ico s')}</button>
      </div>`).join('');
    }
    html += `<div class="gi" data-act="pp-add" data-kind="${kind}">${icon('plus', 'ico s')}
      <div class="t">Добавить ${esc(def.one)}</div>${chevron()}</div>`;
    html += `</div>`;
  }

  html += `<div class="disc">Это твои слова, а не диагноз приложения. Всё хранится на устройстве и уходит только в копию архива — и в модель, когда ты сам задаёшь вопрос.</div>`;
  return html;
}

/* ══ ЗНАКОМСТВО ══════════════════════════════════════════════ */

export function onboarding(app) {
  const s = db.settings();
  const step = app.obStep || 1;

  if (step === 1) {
    const who = tgUserName();
    return `<div class="head"><div style="color:var(--ink)">${logoMark(34)}</div>
      <div class="grow"><h1>${who ? esc(who) + ', это BioLens' : 'BioLens'}</h1><div class="sub">шаг 1 из 3</div></div></div>
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
  /* Четыре двери: день, еда, здоровье, разговор. Еда переехала вниз из
     главной — её открывают по нескольку раз в день, и держать её в глубине
     было дороже, чем отдать ей дверь. Лекарства, хроника и документ
     по-прежнему живут в стеке: туда заходят в свой момент.

     Подпись горит только у той двери, в которой ты стоишь, — панель остаётся
     узкой пилюлей и не отнимает у содержимого целую строку. */
  const items = [
    ['summary', 'house', 'Главная'],
    ['food', 'bowlfood', 'Еда'],
    ['markers', 'heartbeat', 'Здоровье'],
    ['ask', 'chat', 'Чат'],
  ];
  return `<div class="tabs"><div class="dock" id="dock">
    ${items.map(([id, ic, label]) => `<button class="tab ${active === id ? 'on' : ''}" data-act="tab" data-tab="${id}">${icon(ic)}<span>${label}</span></button>`).join('')}
  </div></div>`;
}
