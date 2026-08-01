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

/* ── большой график показателя ──────────────────────────────────
   Ступенчатый коридор нормы, разрыв пунктиром, точки по статусу. */
export function chart(series, { w = 340, h = 200, unit = '' } = {}) {
  const pts = series.filter(p => isFinite(p.value) && p.date);
  if (!pts.length) return '';

  const padL = 10, padR = 14, padT = 26, padB = 34;
  const innerW = w - padL - padR, innerH = h - padT - padB;

  const times = pts.map(p => +new Date(p.date));
  const tMin = Math.min(...times), tMax = Math.max(...times);
  const tSpan = (tMax - tMin) || 1;

  const lows = pts.map(p => p.refLow).filter(v => v != null);
  const highs = pts.map(p => p.refHigh).filter(v => v != null);
  const vals = pts.map(p => p.value);
  let vMin = Math.min(...vals, ...(lows.length ? lows : vals));
  let vMax = Math.max(...vals, ...(highs.length ? highs : vals));
  const pad = (vMax - vMin) * 0.18 || Math.abs(vMax * 0.2) || 1;
  vMin -= pad; vMax += pad;
  if (vMin > 0 && vMin < (vMax - vMin) * 0.25) vMin = 0;

  const X = t => padL + ((t - tMin) / tSpan) * innerW;
  const Y = v => padT + innerH - ((v - vMin) / ((vMax - vMin) || 1)) * innerH;

  // коридор нормы: сегменты между соседними точками, границы берутся у левой точки
  let bands = '';
  if (pts.length === 1) {
    const p = pts[0];
    if (p.refLow != null || p.refHigh != null) {
      const top = Y(p.refHigh ?? vMax), bot = Y(p.refLow ?? vMin);
      bands += `<rect x="${padL}" y="${top}" width="${innerW}" height="${Math.max(0, bot - top)}" fill="var(--ok-soft)"/>`;
    }
  } else {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const x0 = i === 0 ? padL : X(+new Date(p.date));
      const x1 = i === pts.length - 1 ? w - padR : X(+new Date(pts[i + 1].date));
      if (p.refLow == null && p.refHigh == null) continue;
      const top = Y(p.refHigh ?? vMax), bot = Y(p.refLow ?? vMin);
      bands += `<rect x="${x0.toFixed(1)}" y="${top.toFixed(1)}" width="${Math.max(0, x1 - x0).toFixed(1)}" height="${Math.max(0, bot - top).toFixed(1)}" fill="var(--ok-soft)"/>`;
      // тонкая вертикаль там, где норма сменилась
      if (i > 0) {
        const prev = pts[i - 1];
        if (prev.refHigh !== p.refHigh || prev.refLow !== p.refLow) {
          bands += `<line x1="${x0.toFixed(1)}" y1="${padT}" x2="${x0.toFixed(1)}" y2="${(padT + innerH).toFixed(1)}" stroke="var(--hair2)" stroke-width="1" stroke-dasharray="3 3"/>`;
        }
      }
    }
  }

  // линия: сплошная между соседними замерами; пунктир там, где между ними больше двух лет.
  // Подписывается только самый большой провал — иначе низ графика превращается в кашу.
  const GAP_DAYS = 730;
  let path = '', gapMarks = '';
  let biggest = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const gapDays = (+new Date(b.date) - +new Date(a.date)) / 86400000;
    const x1 = X(+new Date(a.date)), y1 = Y(a.value), x2 = X(+new Date(b.date)), y2 = Y(b.value);
    if (gapDays > GAP_DAYS) {
      path += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--ink4)" stroke-width="2" stroke-dasharray="5 5"/>`;
      if (!biggest || gapDays > biggest.days) biggest = { days: gapDays, x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
    } else {
      path += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--ink)" stroke-width="2.6" stroke-linecap="round"/>`;
    }
  }
  if (biggest) {
    const years = Math.round(biggest.days / 365);
    gapMarks = `<text x="${Math.min(w - 40, Math.max(40, biggest.x)).toFixed(1)}" y="${(biggest.y - 12).toFixed(1)}" font-size="9.5" fill="var(--ink4)" text-anchor="middle">нет данных ${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}</text>`;
  }

  const dots = pts.map((p, i) => {
    const fill = toneDot(p.status);
    const isLast = i === pts.length - 1;
    const cx = X(+new Date(p.date)), cy = Y(p.value);
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${isLast ? 6 : 4.5}" fill="${fill}"/>` +
      (isLast ? `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="11" fill="none" stroke="${fill}" stroke-opacity=".25" stroke-width="1.5"/>
                 <text x="${Math.min(w - 16, Math.max(16, cx)).toFixed(1)}" y="${Math.max(12, cy - 15).toFixed(1)}" font-size="11" font-weight="700" fill="${fill}" text-anchor="middle">${trim(p.value)}</text>` : '');
  }).join('');

  // подписи годов: первый, последний и по возможности середина
  const labelIdx = pts.length > 2 ? [0, Math.floor((pts.length - 1) / 2), pts.length - 1] : pts.map((_, i) => i);
  // если вся история укладывается в год, год под точками ничего не говорит — нужен день
  const shortSpan = tSpan < 400 * 86400000;
  const stamp = (iso) => shortSpan ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : iso.slice(0, 4);
  const labels = [...new Set(labelIdx)].map(i => {
    const p = pts[i];
    const cx = Math.min(w - 16, Math.max(16, X(+new Date(p.date))));
    const isLast = i === pts.length - 1;
    return `<text x="${cx.toFixed(1)}" y="${(padT + innerH + 18).toFixed(1)}" font-size="10" fill="${isLast ? 'var(--ink)' : 'var(--ink3)'}" font-weight="${isLast ? 700 : 400}" text-anchor="middle">${stamp(p.date)}</text>`;
  }).join('');

  const refNote = (() => {
    const last = pts[pts.length - 1];
    if (last.refLow == null && last.refHigh == null) return '';
    const txt = last.refLow != null && last.refHigh != null ? `${trim(last.refLow)}–${trim(last.refHigh)}` : (last.refHigh != null ? `до ${trim(last.refHigh)}` : `от ${trim(last.refLow)}`);
    return `<text x="${padL}" y="${(padT - 10).toFixed(1)}" font-size="9.5" fill="var(--ink3)">зелёная полоса — норма ${txt} ${esc(unit)}</text>`;
  })();

  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block" font-family="-apple-system,sans-serif">
    ${bands}${refNote}${path}${dots}${labels}${gapMarks}
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
  const edgeLabel = (x, txt) => `<div style="position:absolute;left:${pos(x)}%;top:22px;transform:translateX(-50%);
    font-size:10.5px;font-weight:650;color:var(--ink3);white-space:nowrap">${txt}</div>`;

  return `<div style="margin-top:16px;margin-bottom:6px">
    <div style="position:relative;height:56px">
      <div style="position:absolute;left:0;right:0;top:8px;height:9px;border-radius:99px;background:var(--hair)"></div>
      <div style="position:absolute;left:${bandL}%;width:${Math.max(2, bandR - bandL)}%;top:8px;height:9px;border-radius:99px;background:var(--ok-soft)"></div>
      ${lo != null ? `<div style="position:absolute;left:${bandL}%;top:5px;width:2px;height:15px;background:var(--ok-dot);opacity:.55"></div>` : ''}
      ${hi != null ? `<div style="position:absolute;left:${bandR}%;top:5px;width:2px;height:15px;background:var(--ok-dot);opacity:.55"></div>` : ''}
      ${lo != null ? edgeLabel(lo, trim(lo)) : ''}
      ${hi != null ? edgeLabel(hi, trim(hi)) : ''}
      <div style="position:absolute;left:${at}%;top:2px;width:4px;height:21px;border-radius:99px;background:${color};
        box-shadow:0 0 0 3px var(--surface);transform:translateX(-2px)"></div>
      <div style="position:absolute;left:${at}%;top:37px;transform:translateX(-50%);font-size:12px;font-weight:800;
        color:${toneVar(st)};white-space:nowrap">${trim(v)}${unit ? ' ' + esc(unit) : ''}</div>
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
  return `<div class="chips" style="margin-top:14px">
    ${grades.map((g, i) => {
      const on = i === activeIdx;
      const range = g.to != null
        ? (i === 0 ? `до ${trim(g.to)}` : `${trim(grades[i - 1].to)}–${trim(g.to)}`)
        : `выше ${trim(grades[grades.length - 2]?.to ?? '')}`;
      const tone = g.tone || 'ok';
      return `<span class="chip ${on ? tone : 'off'}">${on ? '● ' : ''}${esc(g.label)} · ${range}</span>`;
    }).join('')}
  </div>`;
}

export function bar(value, target, { color = 'var(--ink)' } = {}) {
  const pct = Math.max(0, Math.min(1.35, target ? value / target : 0));
  const over = pct > 1;
  return `<div class="prog" style="background:var(--hair)"><i style="width:${Math.min(100, pct * 100).toFixed(0)}%;background:${over ? 'var(--bad-dot)' : color}"></i></div>`;
}

export { icon, ruDate };
