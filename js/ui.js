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
  const x = i => 3 + i * ((w - 6) / (pts.length - 1));
  const y = v => h - 4 - ((v - min) / span) * (h - 8);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">
    <path d="${d}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(last.value).toFixed(1)}" r="3.4" fill="${dotFill}"/>
  </svg>`;
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

  const padL = 10, padR = 16, padT = 22, padB = 34;
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

  /* Коридор нормы: заливка по сегментам (границы у лабораторий разные)
     плюс тонкие линии по краям — так видно, где именно проходит граница. */
  let band = '', edges = '';
  const seg = (i) => {
    const p = pts[i];
    const x0 = i === 0 ? padL : X(times[i]);
    const x1 = i === pts.length - 1 ? w - padR : X(times[i + 1]);
    return { p, x0, x1 };
  };
  for (let i = 0; i < pts.length; i++) {
    const { p, x0, x1 } = pts.length === 1
      ? { p: pts[0], x0: padL, x1: w - padR }
      : seg(i);
    if (p.refLow == null && p.refHigh == null) continue;
    const top = Y(p.refHigh ?? vMax), bot = Y(p.refLow ?? vMin);
    const width = Math.max(0, x1 - x0);
    band += `<rect x="${x0.toFixed(1)}" y="${top.toFixed(1)}" width="${width.toFixed(1)}" height="${Math.max(0, bot - top).toFixed(1)}" fill="var(--ok-soft)"/>`;
    if (p.refHigh != null) edges += `<line x1="${x0.toFixed(1)}" y1="${top.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${top.toFixed(1)}" stroke="var(--ok-dot)" stroke-opacity=".5" stroke-width="1"/>`;
    if (p.refLow != null) edges += `<line x1="${x0.toFixed(1)}" y1="${bot.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${bot.toFixed(1)}" stroke="var(--ok-dot)" stroke-opacity=".5" stroke-width="1"/>`;
    if (pts.length === 1) break;
  }

  /* Числа границ — прямо на коридоре, с подложкой, чтобы читались поверх заливки */
  const last = pts[pts.length - 1];
  const tagOnEdge = (value, y, text) => {
    if (value == null) return '';
    const cy = Math.max(padT + 7, Math.min(padT + innerH - 3, y));
    const wBox = 11 + String(text).length * 5.6;
    return `<rect x="${padL + 1}" y="${(cy - 8).toFixed(1)}" width="${wBox.toFixed(1)}" height="14" rx="7" fill="var(--surface)" opacity=".92"/>
      <text x="${padL + 6}" y="${(cy + 2.5).toFixed(1)}" font-size="9.5" font-weight="700" fill="var(--ok)">${text}</text>`;
  };
  let refTags = '';
  if (last.refHigh != null) refTags += tagOnEdge(last.refHigh, Y(last.refHigh), trim(last.refHigh));
  if (last.refLow != null) refTags += tagOnEdge(last.refLow, Y(last.refLow), trim(last.refLow));
  const bandLabel = (last.refLow != null || last.refHigh != null)
    ? `<text x="${w - padR}" y="${(padT - 8).toFixed(1)}" font-size="9.5" fill="var(--ok)" text-anchor="end" font-weight="700">коридор нормы${unit ? ', ' + esc(unit) : ''}</text>`
    : `<text x="${w - padR}" y="${(padT - 8).toFixed(1)}" font-size="9.5" fill="var(--ink4)" text-anchor="end">границы нормы неизвестны</text>`;

  /* Линия. Разрыв больше двух лет рисуем пунктиром: там ничего не измерялось,
     и сплошная линия соврала бы про плавный переход. */
  const GAP_DAYS = 730;
  const xs = times.map(X), ys = vals.map(Y);
  const m = pts.length > 1 ? tangents(xs, ys) : [];
  let path = '', biggest = null;
  for (let i = 1; i < pts.length; i++) {
    const gapDays = (times[i] - times[i - 1]) / 86400000;
    const d = segment(xs, ys, m, i - 1);
    if (gapDays > GAP_DAYS) {
      path += `<path d="${d}" fill="none" stroke="var(--ink4)" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round"/>`;
      if (!biggest || gapDays > biggest.days) biggest = { days: gapDays, x: (xs[i - 1] + xs[i]) / 2, y: (ys[i - 1] + ys[i]) / 2 };
    } else {
      path += `<path d="${d}" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round"/>`;
    }
  }
  const gapMark = biggest ? (() => {
    const years = Math.round(biggest.days / 365);
    const txt = `нет данных ${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}`;
    const cx = Math.min(w - 48, Math.max(48, biggest.x));
    const cy = Math.max(padT + 12, biggest.y - 12);
    const bw = txt.length * 5 + 12;
    // подложка: иначе подпись садится прямо на границу коридора и обе становятся нечитаемы
    return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(cy - 9).toFixed(1)}" width="${bw.toFixed(1)}" height="14" rx="7" fill="var(--surface)" opacity=".92"/>
      <text x="${cx.toFixed(1)}" y="${(cy + 1.5).toFixed(1)}" font-size="9.5" fill="var(--ink3)" text-anchor="middle">${txt}</text>`;
  })() : '';

  /* Точки: белый ободок отделяет их от заливки коридора, у последней — значение */
  const dots = pts.map((p, i) => {
    const fill = toneDot(p.status);
    const isLast = i === pts.length - 1;
    const cx = xs[i], cy = ys[i];
    const r = isLast ? 5.5 : 3.8;
    let out = `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r + 2.2}" fill="var(--surface)"/>
      <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${fill}"/>`;
    if (isLast) {
      const lx = Math.min(w - 20, Math.max(20, cx));
      const ly = Math.max(padT + 11, cy - 16);
      out += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="11.5" font-weight="800" fill="${toneVar(p.status)}" text-anchor="middle">${trim(p.value)}</text>`;
    }
    return out;
  }).join('');

  // подписи по времени: если история короче года — день и месяц, иначе годы
  const labelIdx = pts.length > 2 ? [0, Math.floor((pts.length - 1) / 2), pts.length - 1] : pts.map((_, i) => i);
  const shortSpan = tSpan < 400 * 86400000;
  const stamp = (iso) => shortSpan ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : iso.slice(0, 4);
  const labels = [...new Set(labelIdx)].map(i => {
    const p = pts[i];
    const cx = Math.min(w - 16, Math.max(16, xs[i]));
    const isLast = i === pts.length - 1;
    return `<text x="${cx.toFixed(1)}" y="${(padT + innerH + 18).toFixed(1)}" font-size="10" fill="${isLast ? 'var(--ink2)' : 'var(--ink3)'}" font-weight="${isLast ? 700 : 500}" text-anchor="middle">${stamp(p.date)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block" font-family="-apple-system,sans-serif">
    ${band}${edges}${bandLabel}${path}${gapMark}${refTags}${dots}${labels}
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
   Зелёный отрезок — норма, серые хвосты — за её пределами, метка — твоё значение
   в цвете состояния. Числа границ подписаны прямо под их местами на шкале. */
export function rangeBar(value, low, high, unit = '', status) {
  const v = Number(value);
  if (!isFinite(v) || (low == null && high == null)) return '';
  const lo = low != null ? Number(low) : null;
  const hi = high != null ? Number(high) : null;

  // рисуем шкалу с запасом по краям, чтобы значение вне нормы было видно
  const span = (hi != null && lo != null) ? (hi - lo) : Math.abs(v) * 0.6 || 1;
  const from = Math.min(lo != null ? lo : v, v) - span * 0.4;
  const to = Math.max(hi != null ? hi : v, v) + span * 0.4;
  const pos = (x) => Math.max(0, Math.min(100, ((x - from) / ((to - from) || 1)) * 100));

  const bandL = lo != null ? pos(lo) : 0;
  const bandR = hi != null ? pos(hi) : 100;
  const at = pos(v);
  const st = status || ((lo != null && v < lo) || (hi != null && v > hi) ? 'out' : 'ok');
  const color = toneDot(st);

  /* Засечка с числом на самой границе коридора: человек должен видеть,
     откуда докуда идёт норма, не переводя взгляд в другое место экрана. */
  const edge = (x, side) => `
    <div style="position:absolute;left:${pos(x)}%;top:6px;width:2px;height:16px;border-radius:2px;background:var(--ok-dot);opacity:.75;transform:translateX(-1px)"></div>
    <div style="position:absolute;left:${pos(x)}%;top:25px;transform:translateX(${side === 'l' ? '-50%' : '-50%'});
      font-size:10.5px;font-weight:750;color:var(--ok);white-space:nowrap">${trim(x)}</div>`;

  return `<div style="margin-top:18px;margin-bottom:2px">
    <div style="position:relative;height:42px">
      <div style="position:absolute;left:0;right:0;top:9px;height:10px;border-radius:99px;background:var(--hair)"></div>
      <div style="position:absolute;left:${bandL}%;width:${Math.max(2, bandR - bandL)}%;top:9px;height:10px;border-radius:99px;background:var(--ok-soft)"></div>
      ${lo != null ? edge(lo, 'l') : ''}
      ${hi != null ? edge(hi, 'r') : ''}
      <div style="position:absolute;left:${at}%;top:2px;width:5px;height:24px;border-radius:99px;background:${color};
        box-shadow:0 0 0 3px var(--surface);transform:translateX(-2.5px)"></div>
    </div>
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
      const range = g.to != null
        ? (i === 0 ? `до ${trim(g.to)}` : `${trim(grades[i - 1].to)}–${trim(g.to)}`)
        : `выше ${trim(grades[grades.length - 2]?.to ?? '')}`;
      const tone = g.tone || 'ok';
      const c = tone === 'out' ? 'var(--bad)' : tone === 'edge' ? 'var(--edge)' : 'var(--ok)';
      const dot = tone === 'out' ? 'var(--bad-dot)' : tone === 'edge' ? 'var(--edge-dot)' : 'var(--ok-dot)';
      const soft = tone === 'out' ? 'var(--bad-soft)' : tone === 'edge' ? 'var(--edge-soft)' : 'var(--ok-soft)';
      return `<div style="display:flex;align-items:center;gap:9px;padding:9px 12px;font-size:12.5px;
        ${on ? `background:${soft};font-weight:750;color:${c}` : 'color:var(--ink3)'}
        ${i ? ';border-top:1px solid var(--hair)' : ''}">
        <span style="width:4px;height:16px;border-radius:2px;background:${dot};opacity:${on ? 1 : 0.28};flex:0 0 auto"></span>
        <span style="flex:1;min-width:0">${esc(g.label)}</span>
        <span style="font-variant-numeric:tabular-nums;${on ? '' : 'color:var(--ink4)'}">${range}</span>
      </div>`;
    }).join('')}
  </div>`;
}

export function bar(value, target, { color = 'var(--ink)' } = {}) {
  const pct = Math.max(0, Math.min(1.35, target ? value / target : 0));
  const over = pct > 1;
  return `<div class="prog" style="background:var(--hair)"><i style="width:${Math.min(100, pct * 100).toFixed(0)}%;background:${over ? 'var(--bad-dot)' : color}"></i></div>`;
}

export { icon, ruDate };
