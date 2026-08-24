/* Примитивы интерфейса: шторки, тосты, графики.
   График здесь один на всё приложение — он же рисует ступенчатый коридор нормы. */

import { icon } from './icons.js';
import { trim, ruDate } from './store.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(msg, ms = 2600) {
  $$('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function sheet(html, { onClose } = {}) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet"><div class="grab"></div>${html}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  document.body.appendChild(bg);
  function close() { bg.remove(); onClose?.(); }
  return { el: bg, root: bg.querySelector('.sheet'), close };
}

export function confirmSheet(title, text, okLabel = 'Да', danger = false) {
  return new Promise(res => {
    const s = sheet(`
      <h2>${esc(title)}</h2>
      <p class="sm" style="margin:8px 0 18px;font-size:14px;line-height:1.5">${esc(text)}</p>
      <button class="btn" data-ok style="${danger ? 'background:var(--bad-dot)' : ''}">${esc(okLabel)}</button>
      <button class="btn ghost" data-no style="margin-top:9px">Отмена</button>`);
    s.root.querySelector('[data-ok]').onclick = () => { s.close(); res(true); };
    s.root.querySelector('[data-no]').onclick = () => { s.close(); res(false); };
  });
}

export function statusDot(status) {
  return `<span class="dot ${status === 'ok' ? '' : status}"></span>`;
}

/* Цвет состояния всегда идёт со словом: цвет читается быстро, слово не даёт ошибиться. */
export function statusWord(status, value, low, high) {
  if (status === 'out') {
    if (high != null && Number(value) > Number(high)) return 'выше нормы';
    if (low != null && Number(value) < Number(low)) return 'ниже нормы';
    return 'вне нормы';
  }
  if (status === 'edge') return 'у границы';
  if (status === 'ok') return 'в норме';
  return 'норма не указана';
}

export function statusTag(status, value, low, high) {
  const cls = status === 'unknown' ? '' : status === 'out' ? 'out' : status === 'edge' ? 'edge' : 'ok';
  return `<span class="tag ${cls}">${statusWord(status, value, low, high)}</span>`;
}

export const toneVar = (status) =>
  status === 'out' ? 'var(--bad)' : status === 'edge' ? 'var(--edge)' : status === 'ok' ? 'var(--ok)' : 'var(--ink3)';
/* Для чисел: «в норме» остаётся обычным чёрным — иначе экран заливает зелёным
   и красное перестаёт бросаться в глаза. Цветом выделяем только то, что важно. */
export const inkTone = (status) =>
  status === 'out' ? 'var(--bad)' : status === 'edge' ? 'var(--edge)' : 'var(--ink)';
export const toneDot = (status) =>
  status === 'out' ? 'var(--bad-dot)' : status === 'edge' ? 'var(--edge-dot)' : status === 'ok' ? 'var(--ok-dot)' : 'var(--ink4)';

export function aiBlock(kicker, text, sources = []) {
  return `<div class="ai">
    <div class="hd">${icon('sparkle', 'ico s')}<span class="t">${esc(kicker)}</span></div>
    <p>${text}</p>
    ${sources.length ? `<div class="src">${sources.map(s => `<span class="schip">${esc(s)}</span>`).join('')}</div>` : ''}
  </div>`;
}

export function emptyBlock(iconName, title, text, btn) {
  return `<div class="empty">
    <div style="display:flex;justify-content:center;color:var(--ink4)">${icon(iconName, 'ico l')}</div>
    <div class="t">${esc(title)}</div>
    <div class="d">${text}</div>
    ${btn ? `<div style="margin-top:20px">${btn}</div>` : ''}
  </div>`;
}

/* ── спарклайн для списков ──────────────────────────────────── */
export function sparkline(series, { w = 76, h = 26, color } = {}) {
  const pts = series.filter(p => isFinite(p.value));
  if (pts.length === 0) return '';
  const last = pts[pts.length - 1];
  /* Линия — нейтральная, цветом горит только последняя точка.
     Красная линия читалась бы как «всё падает», хотя она лишь соединяет замеры. */
  const stroke = color || 'var(--ink4)';
  const dotFill = color || toneDot(last.status);
  if (pts.length === 1) {
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><circle cx="${w / 2}" cy="${h / 2}" r="3.4" fill="${dotFill}"/></svg>`;
  }
  const vals = pts.map(p => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = (max - min) || 1;
  const xs = pts.map((_, i) => 4 + i * ((w - 8) / (pts.length - 1)));
  const ys = vals.map(v => h - 5 - ((v - min) / span) * (h - 10));
  // та же плавная интерполяция, что и на большом графике — линии выглядят родными
  const m = tangents(xs, ys);
  const d = pts.slice(1).map((_, i) => segment(xs, ys, m, i)).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">
    <path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${xs[xs.length - 1].toFixed(1)}" cy="${ys[ys.length - 1].toFixed(1)}" r="3.2" fill="${dotFill}"/>
  </svg>`;
}

/* Отрезку между двумя замерами цвет даёт градиент от статуса начала к
   статусу конца: линия перетекает из зелёного в красный там, где показатель
   выходил за границу, — без ступеньки, которую глаз читает как склейку двух
   графиков. Если статус не менялся, обычный штрих без градиента: сотня
   лишних <linearGradient> замедляет рендер списка. */
let GRAD_SEQ = 0;
function tonedSegment(d, x1, y1, x2, y2, c1, c2, sw, defs) {
  if (c1 === c2) return `<path d="${d}" fill="none" stroke="${c1}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const id = 'sg' + (++GRAD_SEQ);
  defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"><stop offset="0.25" stop-color="${c1}"/><stop offset="0.75" stop-color="${c2}"/></linearGradient>`);
  return `<path d="${d}" fill="none" stroke="url(#${id})" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/* ── линия, окрашенная состоянием ────────────────────────────────
   Взято у Ornament и переложено на наш язык цвета. Отрезок горит тем цветом,
   каким был замер на ЕГО КОНЦЕ: жёлтым там, где значение подошло к границе,
   красным — где вышло, зелёным — где вернулось.

   Это не оценка тренда «всё падает» (её мы себе не позволяем), а карта
   состояния во времени: видно не только где человек сейчас, но и каким путём
   он сюда пришёл. Коридор за спиной остаётся серым: если залить его зелёным,
   он начнёт кричать «всё хорошо» через весь график — в том числе там, где
   линия идёт выше него.

   По горизонтали — ВРЕМЯ, а не номер замера: три анализа за месяц и один
   трёхлетней давности не имеют права выглядеть ровной лесенкой. */
export function statusLine(series, { w = 108, h = 42, fluid = false } = {}) {
  const pts = series.filter(p => isFinite(p.value) && p.date);
  if (!pts.length) return '';
  const padX = 4, padY = 6;
  if (pts.length === 1) {
    return `<svg width="${fluid ? '100%' : w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">
      <circle cx="${w / 2}" cy="${h / 2}" r="3.4" fill="${toneDot(pts[0].status)}"/></svg>`;
  }

  const times = pts.map(p => +new Date(p.date));
  const tMin = Math.min(...times), tMax = Math.max(...times);
  const tSpan = (tMax - tMin) || 1;

  /* Границы коридора входят в масштаб: иначе полоса нормы уезжает за край,
     и линия висит непонятно относительно чего. */
  const vals = pts.map(p => p.value);
  const lows = pts.map(p => p.refLow).filter(v => v != null);
  const highs = pts.map(p => p.refHigh).filter(v => v != null);
  let min = Math.min(...vals, ...lows), max = Math.max(...vals, ...highs);
  const span = (max - min) || Math.abs(max) || 1;
  min -= span * 0.1; max += span * 0.1;

  const X = (tt) => padX + ((tt - tMin) / tSpan) * (w - padX * 2);
  const Y = (v) => h - padY - ((v - min) / (max - min)) * (h - padY * 2);
  const xs = times.map(X), ys = vals.map(Y);

  /* Коридор ступеньками: у каждого бланка свои границы, и делать вид,
     что норма всю жизнь была одна, нечестно. */
  let band = '';
  for (let i = 0; i < pts.length; i++) {
    const lo = pts[i].refLow, hi = pts[i].refHigh;
    if (lo == null && hi == null) continue;
    const x0 = i === 0 ? 0 : (xs[i - 1] + xs[i]) / 2;
    const x1 = i === pts.length - 1 ? w : (xs[i] + xs[i + 1]) / 2;
    const yTop = Y(hi != null ? hi : max), yBot = Y(lo != null ? lo : min);
    band += `<rect x="${x0.toFixed(1)}" y="${yTop.toFixed(1)}" width="${Math.max(0, x1 - x0).toFixed(1)}" height="${Math.max(1, yBot - yTop).toFixed(1)}" fill="var(--band)"/>`;
  }

  const m = tangents(xs, ys);
  const defs = [];
  const line = pts.slice(1).map((_, i) =>
    tonedSegment(segment(xs, ys, m, i), xs[i], ys[i], xs[i + 1], ys[i + 1],
      toneDot(pts[i].status), toneDot(pts[i + 1].status), 2, defs)
  ).join('');

  const lx = xs[xs.length - 1].toFixed(1), ly = ys[ys.length - 1].toFixed(1);
  return `<svg width="${fluid ? '100%' : w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${band}${line}
    <circle cx="${lx}" cy="${ly}" r="3.1" fill="${toneDot(pts[pts.length - 1].status)}" stroke="var(--surface)" stroke-width="1.6"/></svg>`;
}

/* ── точечная полоса ─────────────────────────────────────────────
   Из макета: доля дня набирается точками, а не заливается сплошной краской,
   и отдельная засечка показывает, где ты стоишь. Двадцать точек читаются
   как «сколько осталось», чего кольцо в 24 пикселя не умеет. */
export function dotBar(pct, { n = 20 } = {}) {
  const p = Math.max(0, Math.min(1, pct || 0));
  const on = Math.round(p * n);
  const dots = Array.from({ length: n }, (_, i) => `<i${i < on ? ' class="on"' : ''}></i>`).join('');
  return `<div class="dbar">${dots}<b style="left:${(p * 100).toFixed(1)}%"></b></div>`;
}

/* Плавная линия без выдумывания.
   Монотонная кубическая интерполяция (Фрич — Карлсон): кривая проходит через
   все замеры и НИКОГДА не выходит за соседние значения — то есть не рисует
   пиков, которых у человека не было. Для медицинского графика это условие
   важнее красоты, а выглядит всё равно мягче ломаной. */
function tangents(xs, ys) {
  const n = xs.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / ((xs[i + 1] - xs[i]) || 1);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], hyp = Math.hypot(a, b);
    if (hyp > 3) { m[i] = (3 / hyp) * a * d[i]; m[i + 1] = (3 / hyp) * b * d[i]; }
  }
  return m;
}

/* Один отрезок кривой между двумя соседними точками */
function segment(xs, ys, m, i) {
  const dx = xs[i + 1] - xs[i];
  const c1x = xs[i] + dx / 3, c1y = ys[i] + (m[i] * dx) / 3;
  const c2x = xs[i + 1] - dx / 3, c2y = ys[i + 1] - (m[i + 1] * dx) / 3;
  return `M${xs[i].toFixed(1)},${ys[i].toFixed(1)} C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
}

/* ── большой график показателя ──────────────────────────────────
   Коридор нормы подписан числами прямо на границах, линия плавная,
   разрыв в наблюдении — пунктиром. */
export function chart(series, { w = 340, h = 210, unit = '' } = {}) {
  const pts = series.filter(p => isFinite(p.value) && p.date);
  if (!pts.length) return '';

  /* Слева оставлено поле под числа границ: раньше они лежали пилюлями поверх
     заливки и то и дело садились на саму линию замеров. Вынесены за поле —
     читаются всегда, а график остался чистым. */
  const padL = 32, padR = 14, padT = 22, padB = 34;
  const innerW = w - padL - padR, innerH = h - padT - padB;

  const times = pts.map(p => +new Date(p.date));
  const tMin = Math.min(...times), tMax = Math.max(...times);
  const tSpan = (tMax - tMin) || 1;

  const lows = pts.map(p => p.refLow).filter(v => v != null);
  const highs = pts.map(p => p.refHigh).filter(v => v != null);
  const vals = pts.map(p => p.value);
  let vMin = Math.min(...vals, ...(lows.length ? lows : vals));
  let vMax = Math.max(...vals, ...(highs.length ? highs : vals));
  const pad = (vMax - vMin) * 0.22 || Math.abs(vMax * 0.2) || 1;
  vMin -= pad; vMax += pad;
  if (vMin > 0 && vMin < (vMax - vMin) * 0.25) vMin = 0;

  const X = t => padL + ((t - tMin) / tSpan) * innerW;
  const Y = v => padT + innerH - ((v - vMin) / ((vMax - vMin) || 1)) * innerH;

  /* Коридор нормы — очень бледная ЗЕЛЁНАЯ зона со скруглёнными углами.
     Прежде он был серым из осторожности: залитый насыщенным зелёным, коридор
     кричал «всё хорошо» громче, чем точка, вышедшая за границу. Но теперь
     цветом горит сама линия, и серая зона рядом с ней читалась как «тут
     ничего не значит». На 8% зелёный не кричит, зато мгновенно отвечает на
     главный вопрос графика: «линия внутри зелёного или снаружи». */
  let band = '', edges = '';
  const seg = (i) => {
    const p = pts[i];
    const x0 = i === 0 ? padL : X(times[i]);
    const x1 = i === pts.length - 1 ? w - padR : X(times[i + 1]);
    return { p, x0, x1 };
  };
  /* Когда границы во всех бланках одинаковые — а так почти всегда, — коридор
     рисуется ОДНИМ прямоугольником. Ступеньками из соседних плиток он давал
     тонкие светлые швы на стыках: полупрозрачные заливки накладывались на долю
     пикселя, и по серому фону шли вертикальные полосы. */
  const sameRefs = pts.every(p => p.refLow === pts[0].refLow && p.refHigh === pts[0].refHigh);
  const chunks = (pts.length === 1 || sameRefs)
    ? [{ p: pts[0], x0: padL, x1: w - padR }]
    : pts.map((_, i) => seg(i));
  for (const { p, x0, x1 } of chunks) {
    if (p.refLow == null && p.refHigh == null) continue;
    const top = Y(p.refHigh ?? vMax), bot = Y(p.refLow ?? vMin);
    const width = Math.max(0, x1 - x0);
    band += `<rect x="${x0.toFixed(1)}" y="${top.toFixed(1)}" width="${width.toFixed(1)}" height="${Math.max(0, bot - top).toFixed(1)}" rx="8" fill="color-mix(in srgb, var(--ok-dot) 9%, transparent)"/>`;
    const edgeCol = 'color-mix(in srgb, var(--ok-dot) 34%, transparent)';
    if (p.refHigh != null) edges += `<line x1="${x0.toFixed(1)}" y1="${top.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${top.toFixed(1)}" stroke="${edgeCol}" stroke-width="1.2" stroke-dasharray="4 4"/>`;
    if (p.refLow != null) edges += `<line x1="${x0.toFixed(1)}" y1="${bot.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${bot.toFixed(1)}" stroke="${edgeCol}" stroke-width="1.2" stroke-dasharray="4 4"/>`;
  }

  /* Числа границ — прямо на своих линиях, справа, где линия замеров их не задевает.
     Человек должен видеть, откуда докуда идёт норма, не уходя глазами с графика. */
  const last = pts[pts.length - 1];
  const tagOnEdge = (value, y, text) => {
    if (value == null) return '';
    const cy = Math.max(padT + 4, Math.min(padT + innerH, y));
    return `<text x="${(padL - 7).toFixed(1)}" y="${(cy + 3.5).toFixed(1)}" font-size="10" font-weight="650" fill="var(--ink3)" text-anchor="end">${text}</text>`;
  };
  let refTags = '';
  if (last.refHigh != null) refTags += tagOnEdge(last.refHigh, Y(last.refHigh), trim(last.refHigh));
  if (last.refLow != null) refTags += tagOnEdge(last.refLow, Y(last.refLow), trim(last.refLow));
  // одно слово вместо строки-заголовка: что это за серая полоса, ясно и так
  const bandLabel = (last.refLow != null || last.refHigh != null)
    ? `<text x="${padL + 2}" y="${(padT - 7).toFixed(1)}" font-size="9.5" fill="var(--ink4)">норма${unit ? ', ' + esc(unit) : ''}</text>`
    : `<text x="${padL + 2}" y="${(padT - 7).toFixed(1)}" font-size="9.5" fill="var(--ink4)">границы нормы неизвестны</text>`;

  /* Линия. Разрыв больше двух лет рисуем пунктиром: там ничего не измерялось,
     и сплошная линия соврала бы про плавный переход. */
  const GAP_DAYS = 730;
  const xs = times.map(X), ys = vals.map(Y);
  const m = pts.length > 1 ? tangents(xs, ys) : [];
  const defs = [];
  let path = '', biggest = null;
  for (let i = 1; i < pts.length; i++) {
    const gapDays = (times[i] - times[i - 1]) / 86400000;
    const d = segment(xs, ys, m, i - 1);
    if (gapDays > GAP_DAYS) {
      /* Разрыв в наблюдении остаётся серым пунктиром: красить его статусом
         значило бы утверждать, что мы знаем, каким человек был эти годы. */
      path += `<path d="${d}" fill="none" stroke="var(--ink4)" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round"/>`;
      if (!biggest || gapDays > biggest.days) biggest = { days: gapDays, x: (xs[i - 1] + xs[i]) / 2, y: (ys[i - 1] + ys[i]) / 2 };
    } else {
      /* Линия окрашена СОСТОЯНИЕМ (взято у Ornament): между замерами цвет
         перетекает из статуса в статус. «В норме» здесь остаётся чернильным,
         а не зелёным — иначе весь график заливает зелёным и вышедшая точка
         перестаёт бросаться в глаза. Горит только неблагополучие. */
      const c0 = pts[i - 1].status === 'ok' ? 'var(--ink)' : toneDot(pts[i - 1].status);
      const c1 = pts[i].status === 'ok' ? 'var(--ink)' : toneDot(pts[i].status);
      path += tonedSegment(d, xs[i - 1], ys[i - 1], xs[i], ys[i], c0, c1, 3, defs);
    }
  }
  const gapMark = biggest ? (() => {
    const years = Math.round(biggest.days / 365);
    const txt = `нет данных ${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}`;
    // держим подпись левее последнего значения: оно тоже стоит вверху справа
    const cx = Math.min(w - 78, Math.max(padL + 40, biggest.x));
    /* Подпись живёт у верхнего края поля, а не над самим разрывом: привязанная
       к линии, она то и дело садилась на границу коридора, и нечитаемыми
       становились обе. Сверху она не пересекается ни с чем и всегда на месте. */
    const cy = padT + 7;
    const bw = txt.length * 5 + 12;
    return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(cy - 8).toFixed(1)}" width="${bw.toFixed(1)}" height="14" rx="7" fill="var(--field)"/>
      <text x="${cx.toFixed(1)}" y="${(cy + 2).toFixed(1)}" font-size="9.5" fill="var(--ink3)" text-anchor="middle">${txt}</text>`;
  })() : '';

  /* Точки: белый ободок отделяет их от заливки коридора, у последней — значение */
  const dots = pts.map((p, i) => {
    const fill = toneDot(p.status);
    const isLast = i === pts.length - 1;
    const cx = xs[i], cy = ys[i];
    const r = isLast ? 5.5 : 3.8;
    /* Последний замер дышит: тихий пульс говорит «вот где ты сейчас» без
       единого слова. Пульсирует ореол, сама точка неподвижна — данные не
       двигаются, двигается внимание. */
    let out = isLast ? `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${fill}" opacity="0.35" class="pulse-dot"/>` : '';
    out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r + 2.2}" fill="var(--surface)"/>
      <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${fill}"/>`;
    if (isLast) {
      /* Пилюля со значением вместо голой цифры и тонкий отвес до оси: глаз
         сразу связывает «вот это число» с «вот эта дата». У голого текста
         на графике не было ни фона, ни привязки — он висел сам по себе. */
      const label = trim(p.value);
      const bw = String(label).length * 7.2 + 16;
      const lx = Math.min(w - padR - bw / 2, Math.max(padL + bw / 2, cx));
      const ly = Math.max(padT + 13, cy - 18);
      out = `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(padT + innerH).toFixed(1)}"
          stroke="${fill}" stroke-width="1.2" stroke-dasharray="2 3" opacity="0.5"/>` + out;
      out += `<rect x="${(lx - bw / 2).toFixed(1)}" y="${(ly - 12).toFixed(1)}" width="${bw.toFixed(1)}" height="18" rx="9"
          fill="var(--surface)" stroke="${fill}" stroke-width="1.2"/>
        <text x="${lx.toFixed(1)}" y="${(ly + 1).toFixed(1)}" font-size="11.5" font-weight="800" fill="${toneVar(p.status)}" text-anchor="middle">${label}</text>`;
    }
    return out;
  }).join('');

  // подписи по времени: если история короче года — день и месяц, иначе годы
  const labelIdx = pts.length > 2 ? [0, Math.floor((pts.length - 1) / 2), pts.length - 1] : pts.map((_, i) => i);
  const shortSpan = tSpan < 400 * 86400000;
  const stamp = (iso) => shortSpan ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : iso.slice(0, 4);
  const labels = [...new Set(labelIdx)].map(i => {
    const p = pts[i];
    const cx = Math.min(w - 14, Math.max(padL, xs[i]));
    const isLast = i === pts.length - 1;
    return `<text x="${cx.toFixed(1)}" y="${(padT + innerH + 18).toFixed(1)}" font-size="10" fill="${isLast ? 'var(--ink2)' : 'var(--ink3)'}" font-weight="${isLast ? 700 : 500}" text-anchor="middle">${stamp(p.date)}</text>`;
  }).join('');

  /* Мелкие засечки под каждым замером: видно, что точек больше, чем подписей,
     и что они стоят неравномерно — то есть по оси идёт время, а не порядок. */
  const axis = `<line x1="${padL}" y1="${(padT + innerH).toFixed(1)}" x2="${(w - padR).toFixed(1)}" y2="${(padT + innerH).toFixed(1)}" stroke="var(--hair)" stroke-width="1"/>`
    + xs.map(x => `<line x1="${x.toFixed(1)}" y1="${(padT + innerH).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(padT + innerH + 4).toFixed(1)}" stroke="var(--ink4)" stroke-width="1" opacity="0.45"/>`).join('');

  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block" font-family="-apple-system,sans-serif">
    ${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${band}${edges}${bandLabel}${axis}${path}${gapMark}${refTags}${dots}${labels}
  </svg>`;
}

/* кольцо-прогресс для дня еды */
export function ring(pct, { size = 44, stroke = 5, color = 'var(--ink)' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, pct)));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--hair2)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

/* Полоса-коридор: где значение стоит относительно границ нормы.
   Серый отрезок — норма, метка в цвете состояния — твоё значение. Числа границ
   подписаны прямо под их местами на шкале: видно, откуда докуда идёт норма. */
export function rangeBar(value, low, high, unit = '', status) {
  const v = Number(value);
  if (!isFinite(v) || (low == null && high == null)) return '';
  const lo = low != null ? Number(low) : null;
  const hi = high != null ? Number(high) : null;

  /* Гребёнка из макета вместо полосы-таблетки. Шкала набрана вертикальными
     штрихами: зелёные там, где значение попало бы в норму, розовые — где нет.
     Это читается за долю секунды и без легенды: «я стою в зелёной части» или
     «я стою в красной». Прежняя серая полоса требовала сначала найти границы,
     потом сравнить с меткой — три движения глазом вместо одного.

     Штрихи, а не сплошная заливка: сплошная зелёная зона выглядит как
     «одобрено», а гребёнка — как шкала прибора, чем она и является. */
  const span = (hi != null && lo != null) ? (hi - lo) : Math.abs(v) * 0.6 || 1;
  let from = Math.min(lo != null ? lo : v, v) - span * 0.45;
  let to = Math.max(hi != null ? hi : v, v) + span * 0.45;
  if (lo != null && lo >= 0 && from < 0) from = 0;
  const W = 300, H = 52, padX = 3;
  const TOP = 2, TICK_H = 22;
  const X = (x) => padX + ((x - from) / ((to - from) || 1)) * (W - padX * 2);

  const st = status || ((lo != null && v < lo) || (hi != null && v > hi) ? 'out' : 'ok');
  const inBand = (x) => (lo == null || x >= lo) && (hi == null || x <= hi);

  let comb = '';
  const STEP = 4.2;
  for (let x = padX; x <= W - padX; x += STEP) {
    const val = from + ((x - padX) / (W - padX * 2)) * (to - from);
    const ok = inBand(val);
    comb += `<rect x="${x.toFixed(1)}" y="${TOP}" width="1.7" height="${TICK_H}" rx="0.85"
      fill="${ok ? 'color-mix(in srgb, var(--ok-dot) 40%, transparent)' : 'color-mix(in srgb, var(--bad-dot) 30%, transparent)'}"/>`;
  }

  /* Метки: тонкая линия сквозь гребёнку, точка и число под ней. «Ты» —
     цветом состояния: это единственная метка, которая говорит о человеке. */
  const marks = [];
  if (lo != null) marks.push({ x: lo, label: trim(lo), color: 'var(--ink3)', me: false });
  if (hi != null) marks.push({ x: hi, label: trim(hi), color: 'var(--ink3)', me: false });
  marks.push({ x: v, label: 'Ты', color: toneDot(st), me: true });

  const meX = X(v);
  const drawn = marks.map(m => {
    const mx = X(m.x);
    /* Подпись границы, севшая вплотную к «Ты», не рисуется: число всё равно
       стоит строкой ниже, а два наложенных числа не читает никто. */
    const hideLabel = !m.me && Math.abs(mx - meX) < 26;
    return `<line x1="${mx.toFixed(1)}" y1="${TOP}" x2="${mx.toFixed(1)}" y2="${(TOP + TICK_H + 5).toFixed(1)}"
        stroke="${m.color}" stroke-width="${m.me ? 2.2 : 1.2}" stroke-linecap="round"/>
      <circle cx="${mx.toFixed(1)}" cy="${(TOP + TICK_H + 7).toFixed(1)}" r="${m.me ? 2.4 : 1.8}" fill="${m.color}"/>
      ${hideLabel ? '' : `<text x="${mx.toFixed(1)}" y="${(TOP + TICK_H + 22).toFixed(1)}" text-anchor="middle"
        font-size="11.5" font-weight="${m.me ? 800 : 600}" fill="${m.color}">${m.label}</text>`}`;
  }).join('');

  return `<div style="margin-top:16px;margin-bottom:2px">
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" font-family="-apple-system,sans-serif">
      ${comb}${drawn}
    </svg>
  </div>`;
}

/* Клинические ступени — там, где «норма лаборатории» и смысл числа расходятся.
   Классика: витамин D, где 25 нг/мл формально «ниже нормы», а по рекомендациям
   это «недостаточность», а не дефицит. У каждой ступени свой цвет светофора. */
export function gradeScale(value, grades) {
  if (!grades?.length || !isFinite(Number(value))) return '';
  const v = Number(value);
  let activeIdx = grades.findIndex(g => g.to != null && v < g.to);
  if (activeIdx === -1) activeIdx = grades.length - 1;
  /* Лесенка, а не россыпь чипов: ступени идут сверху вниз в том же порядке,
     что и числа, и видно, на какой ступени человек стоит. */
  return `<div style="margin-top:14px;border-radius:14px;overflow:hidden;border:1px solid var(--hair)">
    ${grades.map((g, i) => {
      const on = i === activeIdx;
      // r — подпись диапазона вручную: там, где верхняя граница включающая
      // («1–3», а не «1–3.001»), автоматическая подпись врёт
      const range = g.r || (g.to != null
        ? (i === 0 ? `до ${trim(g.to)}` : `${trim(grades[i - 1].to)}–${trim(g.to)}`)
        : `выше ${trim(grades[grades.length - 2]?.to ?? '')}`);
      const tone = g.tone || 'ok';
      const c = tone === 'out' ? 'var(--bad)' : tone === 'edge' ? 'var(--edge)' : 'var(--ok)';
      const dot = tone === 'out' ? 'var(--bad-dot)' : tone === 'edge' ? 'var(--edge-dot)' : 'var(--ok-dot)';
      const soft = tone === 'out' ? 'var(--bad-soft)' : tone === 'edge' ? 'var(--edge-soft)' : 'var(--ok-soft)';
      return `<div style="display:flex;align-items:center;gap:9px;padding:9px 12px;font-size:12.5px;
        ${on ? `background:${soft};font-weight:750;color:${c}` : 'color:var(--ink3)'}
        ${i ? ';border-top:1px solid var(--hair)' : ''}">
        <span style="width:4px;height:16px;border-radius:2px;background:${on ? dot : 'var(--hair2)'};flex:0 0 auto"></span>
        <span style="flex:1;min-width:0">${esc(g.label)}</span>
        <span style="font-variant-numeric:tabular-nums;${on ? '' : 'color:var(--ink4)'}">${range}</span>
      </div>`;
    }).join('')}
  </div>`;
}


/* Дуга-полукольцо: доля одним взглядом.
   Кольцо целиком читается как «сколько сделано из задуманного», а полукруг —
   как шкала прибора: сразу видно, что стрелка стоит в начале пути. */
export function gauge(pct, { size = 96, stroke = 10 } = {}) {
  const v = Math.max(0, Math.min(1, Number(pct) || 0));
  const r = (size - stroke) / 2;
  const cy = size / 2;
  const d = `M${(stroke / 2).toFixed(1)},${cy} A${r},${r} 0 0 1 ${(size - stroke / 2).toFixed(1)},${cy}`;
  const len = Math.PI * r;
  return `<svg width="${size}" height="${(cy + stroke / 2).toFixed(1)}" viewBox="0 0 ${size} ${(cy + stroke / 2).toFixed(1)}" style="display:block">
    <path d="${d}" fill="none" stroke="var(--hair2)" stroke-width="${stroke}" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="var(--ink)" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${len.toFixed(1)}" stroke-dashoffset="${(len * (1 - v)).toFixed(1)}"
      style="transition:stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)"/>
  </svg>`;
}

/* ── кольцо дня ──────────────────────────────────────────────────
   ОДНО кольцо, а не четыре. Заполненная часть — съеденные калории, и она
   разбита на три дуги: сколько из этих калорий дали белки, жиры и углеводы.
   Так одно кольцо отвечает сразу на два вопроса — «сколько съел» и «из чего
   это было», — а четыре кольца не отвечали толком ни на один. */
export function kcalRing(parts, { size = 132, stroke = 14 } = {}) {
  const c = size / 2, r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const total = parts.reduce((n, p) => n + Math.max(0, p.kcal), 0);
  const frame = Math.max(1, parts.frame || total);
  let acc = 0;
  const arcs = parts.map(p => {
    const share = Math.max(0, p.kcal) / frame;
    const seg = Math.min(1, share) * len;
    const out = `<circle cx="${c}" cy="${c}" r="${r.toFixed(1)}" fill="none" stroke="${p.color}"
      stroke-width="${stroke}" stroke-dasharray="${Math.max(0, seg - 1.5).toFixed(1)} ${(len - seg + 1.5).toFixed(1)}"
      stroke-dashoffset="${(-acc).toFixed(1)}" transform="rotate(-90 ${c} ${c})"
      style="transition:stroke-dasharray .7s cubic-bezier(.22,1,.36,1)"/>`;
    acc += seg;
    return out;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block">
    <circle cx="${c}" cy="${c}" r="${r.toFixed(1)}" fill="none" stroke="var(--hair)" stroke-width="${stroke}"/>
    ${arcs}
  </svg>`;
}


/* warn=false — там, где перебор не значит «вне нормы»: съесть на обед на
   десять килокалорий больше рамки это не болезнь, а красный в этом
   приложении занят состоянием здоровья. */
export function bar(value, target, { color = 'var(--ink)', warn = true } = {}) {
  const pct = Math.max(0, Math.min(1.35, target ? value / target : 0));
  const over = warn && pct > 1;
  return `<div class="prog" style="background:var(--hair)"><i style="width:${Math.min(100, pct * 100).toFixed(0)}%;background:${over ? 'var(--bad-dot)' : color}"></i></div>`;
}

export { icon, ruDate };
