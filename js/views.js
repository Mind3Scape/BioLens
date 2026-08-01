/* Экраны приложения. Каждая функция возвращает HTML;
   обработчики висят на data-act и разбираются в app.js. */

import * as S from './store.js';
import * as db from './db.js';
import { icon } from './icons.js';
import { esc, sparkline, chart, statusDot, aiBlock, emptyBlock, ring, bar } from './ui.js';
import { markerTitle } from './markers.js';
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

const backIcon = () => `<svg class="ico s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5,5 7.5,12 14.5,19"/></svg>`;

const avatarBtn = `<button class="rnd" data-act="settings">${icon('user', 'ico s')}</button>`;
const addBtn = `<button class="rnd dark" data-act="add">${icon('plus', 'ico s')}</button>`;

/* ══ СВОДКА ══════════════════════════════════════════════════ */

export function summary(app) {
  const ready = S.state.docs.filter(d => d.status === 'ready');
  const span = S.yearsSpan();
  const queue = S.state.docs.filter(d => ['queued', 'reading'].includes(d.status)).length;
  const needsAttention = S.state.docs.filter(d => ['needs-date', 'error', 'skipped', 'duplicate'].includes(d.status)).length;

  if (!ready.length && !queue) {
    return head('BioLens', '') + emptyBlock('camera', 'Начни с того, что есть',
      'Открой галерею и <b>закинь всё подряд</b> — старые скриншоты анализов, фото бланков, PDF из лаборатории. Разберусь сам: год, лабораторию, показатели. Даже <b>пять картинок</b> уже дадут первую линию.',
      `<button class="btn" data-act="add">${icon('camera', 'ico s')}Закинуть скриншоты</button>
       <button class="btn ghost" data-act="scan" style="margin-top:10px">${icon('camera', 'ico s')}Снять бланк камерой</button>`);
  }

  let html = head('Сводка', span ? `${ready.length} документов · с ${S.ruDate(span.from)}` : `${ready.length} документов`, avatarBtn + addBtn);

  if (queue) {
    const done = S.state.queue.total ? S.state.queue.done : 0;
    html += `<div class="card">
      <div class="row">
        <div class="spin"></div>
        <div class="grow"><div class="nm">Разбираю ещё ${queue}</div>
          <div class="sm">${S.state.queue.total ? `${done} из ${S.state.queue.total} · можно закрыть приложение` : 'сейчас начну'}</div></div>
        <button class="mini" data-act="inbox">Открыть</button>
      </div>
      <div class="prog" style="margin-top:11px"><i style="width:${S.state.queue.total ? Math.round(done / S.state.queue.total * 100) : 4}%"></i></div>
    </div>`;
  }

  if (app.aiSummary) {
    html += aiBlock('что изменилось', esc(app.aiSummary).replace(/\n/g, '<br>'),
      [`${ready.length} документов`, `${S.markerKeys().length} показателей`]);
  } else if (app.aiSummaryError) {
    html += `<div class="card"><div class="row">${icon('warning', 'ico s')}<div class="grow sm">${esc(app.aiSummaryError)}</div>
      <button class="mini" data-act="settings">Настройки</button></div></div>`;
  } else if (db.settings().apiKey && S.markerKeys().length) {
    html += `<div class="card"><div class="row"><div class="spin"></div><div class="grow sm">Смотрю, что изменилось…</div></div></div>`;
  }

  const shifts = S.shifts(3);
  if (shifts.length) {
    html += `<div class="cap">Сдвинулось за год</div><div class="card list">`;
    html += shifts.map(m => {
      const dir = m.change > 0 ? '+' : '';
      const good = (m.status === 'ok');
      return `<div class="it" data-act="marker" data-key="${esc(m.key)}">
        ${statusDot(m.status)}
        <div class="grow"><div class="nm">${esc(m.title)}</div>
          <div class="sm">было ${S.trim(m.base?.value ?? '—')} · норма ${esc(S.fmtRef(m.last))}</div></div>
        ${sparkline(m.series)}
        <div style="text-align:right"><div class="val">${S.trim(m.last.value)}<span class="unit">${esc(m.unit)}</span></div>
          <div class="delta ${good ? 'up' : 'down'}">${dir}${Math.round(m.change * 100)}%</div></div>
      </div>`;
    }).join('');
    html += `</div>`;
  }

  const due = S.dueList().slice(0, 2);
  for (const d of due) {
    html += `<div class="card flat"><div class="row">${icon('clock', 'ico s')}
      <div class="grow"><div class="nm" style="font-size:14px">${esc(d.title)} — ${d.daysOld > 700 ? Math.floor(d.daysOld / 365) + ' года не мерил' : 'пора пересдать'}</div>
        <div class="sm">Последний раз — ${S.ruDate(d.last.date)}</div></div>
      <button class="mini" data-act="due">Что ещё</button></div></div>`;
  }

  if (needsAttention) {
    html += `<div class="card flat"><div class="row">${icon('warning', 'ico s')}
      <div class="grow"><div class="nm" style="font-size:14px">${needsAttention} документов ждут тебя</div>
        <div class="sm">Не разобрал дату, не смог прочитать или нашёл дубль</div></div>
      <button class="mini" data-act="inbox">Открыть</button></div></div>`;
  }

  const goal = S.foodGoal();
  if (goal) {
    const t = S.dayTotals(new Date().toISOString().slice(0, 10));
    html += `<div class="card tap" data-act="tab" data-tab="food">
      <div class="row">${icon('forkknife', 'ico s')}
        <div class="grow"><div class="nm">Цель по питанию: ${esc(goal.goal)}</div>
          <div class="sm">${t.count ? `сегодня ${t.count} приёма · ${t.kcal} ккал` : 'сегодня ещё ничего не записано'}</div></div>
        ${icon('plus', 'ico s')}
      </div></div>`;
  }

  html += `<div class="card tap" data-act="doctor">
    <div class="row">${icon('stethoscope', 'ico s')}
      <div class="grow"><div class="nm">Страница для врача</div>
        <div class="sm">Вся картина за годы на один экран — вместо пакета бумаг</div></div>
      ${icon('file', 'ico s')}
    </div></div>`;

  html += `<div class="disc">Приложение показывает факты и динамику, не ставит диагнозов и не назначает лечение.</div>`;
  return html;
}

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

  const last = S.state.docs.filter(d => d.status === 'ready' && d.date).sort((a, b) => b.date.localeCompare(a.date))[0];

  let html = head('Показатели', `${list.length} маркеров${last ? ` · последний забор ${S.ruShort(last.date)}` : ''}`, avatarBtn + addBtn);
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

function row(m) {
  const sub = m.stale
    ? `последний раз ${S.ruDate(m.last.date)}`
    : `${m.count} ${plural(m.count, 'замер', 'замера', 'замеров')}${m.last.refSource === 'типовая' ? ' · типовая норма' : ''}`;
  return `<div class="it" data-act="marker" data-key="${esc(m.key)}">
    ${statusDot(m.stale ? 'unknown' : m.status)}
    <div class="grow"><div class="nm">${esc(m.title)}</div><div class="sm">${esc(sub)}</div></div>
    ${m.stale ? '' : sparkline(m.series, { w: 62, h: 24 })}
    <div style="text-align:right;min-width:54px">
      <div class="val ${m.last.confidence < 0.75 ? 'doubt' : ''}">${S.trim(m.last.value)}</div>
      ${m.delta != null && !m.stale ? `<div class="delta">${m.delta > 0 ? '+' : ''}${S.trim(m.delta)}</div>` : ''}
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

  html += `<div class="card">
    <div class="hero">
      <div class="big" style="${st === 'out' ? 'color:var(--warn)' : ''}">${S.trim(last.value)}</div>
      <div class="u">${esc(unit)}</div>
      <div class="grow" style="text-align:right">
        ${diff != null ? `<div class="delta ${diff > 0 ? 'up' : 'down'}" style="font-size:13px">${diff > 0 ? '+' : ''}${S.trim(diff)} за год</div>` : ''}
        <div class="sm">${S.ruDate(last.date)}</div>
      </div>
    </div>
    <div class="row" style="margin-top:12px">${statusDot(st)}
      <div class="sm">${esc(S.ruStatus(st))}${last.refLow != null || last.refHigh != null ? ` · коридор <b>${esc(S.fmtRef(last))}</b>${last.refSource === 'типовая' ? ' (типовая норма, в бланке её не было)' : ''}` : ''}</div>
    </div>
  </div>`;

  if (series.length === 1) {
    html += `<div class="card" style="padding:22px 16px;text-align:center">
      ${chart(series, { unit })}
      <div class="sm" style="margin-top:8px;line-height:1.5">Пока это <b>точка, а не линия</b>. Одно число не говорит, растёт оно или падает.</div>
    </div>`;
  } else {
    html += `<div class="card">${chart(series, { unit })}</div>`;
  }

  // единицы: если что-то пересчитывалось — честно показать
  const converted = series.filter(p => p.converted);
  if (converted.length) {
    const ex = converted[converted.length - 1];
    html += `<div class="card gold">
      <div class="row">${icon('warning', 'ico s')}<div class="grow"><div class="nm" style="font-size:14px">Разные единицы в бланках</div></div></div>
      <div class="sm" style="margin-top:8px;line-height:1.55">Привёл к <b>${esc(unit)}</b>. Например, в бланке от ${S.ruDate(ex.date)} стояло <b>${S.trim(ex.rawValue)} ${esc(ex.rawUnit)}</b> — на графике это <b>${S.trim(ex.value)} ${esc(unit)}</b>.</div>
    </div>`;
  }

  // разные названия
  const names = [...new Set(series.map(p => p.nameRaw).filter(Boolean))];
  if (names.length > 1) {
    html += `<div class="card">
      <div class="cap" style="padding:0 0 8px">В бланках это называлось так</div>
      <div class="chips">${names.map(n => `<span class="chip">${esc(n)}</span>`).join('')}</div>
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
    return `<div class="it" data-act="doc" data-id="${esc(p.docId)}">
      ${statusDot(p.status)}
      <div class="grow"><div class="nm" style="font-size:14px">${S.ruDate(p.date)}</div>
        <div class="sm">${esc(p.lab || 'лаборатория не указана')}${p.converted ? ` · в бланке ${S.trim(p.rawValue)} ${esc(p.rawUnit)}` : ''}</div></div>
      ${d != null ? `<div class="delta">${d > 0 ? '+' : ''}${S.trim(d)}</div>` : ''}
      <div class="val ${p.confidence < 0.75 ? 'doubt' : ''}" style="min-width:46px;text-align:right">${S.trim(p.value)}</div>
    </div>`;
  }).join('');
  html += `</div>`;

  html += `<div class="disc">Это не диагноз. Границы нормы взяты из бланка лаборатории — обсуди с врачом.</div>`;
  return html;
}

/* ══ ХРОНИКА ═════════════════════════════════════════════════ */

export function timeline(app) {
  const docs = S.state.docs.filter(d => ['ready', 'needs-date', 'duplicate'].includes(d.status));
  if (!docs.length) {
    return head('Хроника', '') + emptyBlock('calendar', 'Здесь будет твоя история',
      'Анализы, снимки, заключения врачей — по годам, в одном месте.',
      `<button class="btn" data-act="add">Закинуть документы</button>`);
  }
  const filter = app.docFilter || 'all';
  const kinds = { all: 'Всё', blood: 'Анализы', imaging: 'Снимки', conclusion: 'Заключения', vaccination: 'Прививки' };
  const shown = filter === 'all' ? docs : docs.filter(d => d.type === filter || (filter === 'blood' && d.type === 'urine'));

  const byYear = {};
  for (const d of shown) {
    const y = d.date ? d.date.slice(0, 4) : 'без даты';
    (byYear[y] ||= []).push(d);
  }
  const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

  let html = head('Хроника', `${docs.length} документов`, avatarBtn + addBtn);
  html += `<div class="segs scroll">${Object.entries(kinds).map(([k, t]) =>
    `<button class="seg ${filter === k ? 'on' : ''}" data-act="dfilter" data-kind="${k}">${esc(t)}</button>`).join('')}</div>`;

  for (const y of years) {
    html += `<div class="cap">${esc(y)}</div><div class="card list">`;
    html += byYear[y].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(d => {
      const ms = S.state.meas.filter(m => m.docId === d.id);
      const worst = ms.reduce((acc, m) => {
        const s = m.refLow != null || m.refHigh != null ? (m.value < (m.refLow ?? -Infinity) || m.value > (m.refHigh ?? Infinity) ? 'out' : 'ok') : 'unknown';
        return s === 'out' ? 'out' : (acc === 'out' ? 'out' : s);
      }, 'unknown');
      return `<div class="it" data-act="doc" data-id="${esc(d.id)}">
        <div class="rnd" style="width:36px;height:36px;box-shadow:none;background:var(--field)">${icon(docIcon(d.type), 'ico s')}</div>
        <div class="grow"><div class="nm">${esc(d.title || 'Документ')}</div>
          <div class="sm">${d.date ? S.ruDate(d.date) : 'дата не разобрана'}${d.lab ? ' · ' + esc(d.lab) : ''}${ms.length ? ` · ${ms.length} ${plural(ms.length, 'показатель', 'показателя', 'показателей')}` : ''}</div></div>
        ${d.status === 'duplicate' ? `<span class="mini">дубль</span>` : statusDot(worst === 'ok' ? 'ok' : worst)}
      </div>`;
    }).join('');
    html += `</div>`;
  }

  // пробелы во времени
  const span = S.yearsSpan();
  if (span) {
    const have = new Set(docs.filter(d => d.date).map(d => d.date.slice(0, 4)));
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

function docIcon(type) {
  return { blood: 'drop', urine: 'drop', imaging: 'waves', conclusion: 'stethoscope', vaccination: 'firstaid' }[type] || 'file';
}

/* ══ ДОКУМЕНТ ════════════════════════════════════════════════ */

export function docView(app) {
  const doc = S.state.docs.find(d => d.id === app.param.id);
  if (!doc) return backHead('Документ', '') + `<div class="card">Документ не найден.</div>`;
  const ms = S.state.meas.filter(m => m.docId === doc.id);
  const doubts = ms.filter(m => m.confidence < 0.75);

  let html = backHead(doc.title || 'Документ',
    [doc.date ? S.ruDate(doc.date) : 'дата не разобрана', doc.lab, ms.length ? `${ms.length} показателей` : null].filter(Boolean).join(' · '));

  if (doc.blobId) {
    html += `<div class="card" style="padding:12px"><img class="shot-big" data-blob="${esc(doc.blobId)}" alt="оригинал"/>
      <div class="row" style="margin-top:10px"><div class="grow sm">${esc(doc.fileName || '')} · оригинал хранится всегда</div>
      <button class="mini warn" data-act="del-doc" data-id="${esc(doc.id)}">Удалить</button></div></div>`;
  } else {
    html += `<div class="card flat"><div class="row">${icon('warning', 'ico s')}
      <div class="grow"><div class="nm" style="font-size:14px">Оригинал остался на прежнем устройстве</div>
        <div class="sm">Числа восстановлены из облака Телеграма, снимок — нет. Можно закинуть его заново</div></div>
      <button class="mini" data-act="add">Добавить</button></div></div>`;
  }

  if (doc.status === 'needs-date') {
    html += `<div class="card gold">
      <div class="row">${icon('warning', 'ico s')}<div class="grow"><div class="nm" style="font-size:14px">Дата не читается</div></div></div>
      <div class="sm" style="margin:8px 0 11px">${doc.fileDate ? `Файл создан <b>${S.ruDate(doc.fileDate)}</b>. Взять эту дату?` : 'Укажи дату вручную — без неё показатели не встанут в линию.'}</div>
      <div class="chips">
        ${doc.fileDate ? `<button class="chip gold" data-act="use-file-date" data-id="${esc(doc.id)}">Да, ${S.ruShort(doc.fileDate)}</button>` : ''}
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

  if (doc.conclusion) {
    html += `<div class="card"><div class="cap" style="padding:0 0 8px">Заключение</div>
      <div class="sm" style="font-size:14px;line-height:1.55;color:var(--ink)">${esc(doc.conclusion)}</div></div>`;
  }

  if (doubts.length) {
    html += `<div class="card gold">
      <div class="row">${icon('eye', 'ico s')}<div class="grow"><div class="nm" style="font-size:14px">${doubts.length === 1 ? 'Одно число прочитал неуверенно' : `${doubts.length} чисел прочитал неуверенно`}</div>
        <div class="sm">Сверь с оригиналом выше — это десять секунд</div></div></div>
      ${doubts.map(m => `<div class="divide"></div>
        <div class="row"><div class="grow"><div class="nm" style="font-size:14px">${esc(m.title)}</div>
          <div class="sm">в бланке ${esc(m.rawUnit || m.unit)}</div></div>
          <input type="text" inputmode="decimal" value="${S.trim(m.value)}" data-fix="${esc(m.id)}" style="width:92px;text-align:right;font-weight:700">
          <button class="mini" data-act="confirm-meas" data-id="${esc(m.id)}">Ок</button></div>`).join('')}
    </div>`;
  }

  if (ms.length) {
    html += `<div class="cap">Что распознано</div><div class="card list">`;
    html += ms.map(m => {
      const st = m.refLow != null || m.refHigh != null
        ? (m.value < (m.refLow ?? -Infinity) ? 'out' : m.value > (m.refHigh ?? Infinity) ? 'out' : 'ok') : 'unknown';
      return `<div class="it" data-act="marker" data-key="${esc(m.key)}">
        ${statusDot(st)}
        <div class="grow"><div class="nm">${esc(m.title)}</div>
          <div class="sm">${m.refSource ? `норма ${esc(S.fmtRef(m))} (${esc(m.refSource)})` : 'норма не указана'}</div></div>
        <div class="val ${m.confidence < 0.75 ? 'doubt' : ''}">${S.trim(m.value)}<span class="unit">${esc(m.unit)}</span></div>
      </div>`;
    }).join('');
    html += `</div>`;
  }

  if (doc.note) html += `<div class="card flat"><div class="row">${icon('warning', 'ico s')}<div class="grow sm">${esc(doc.note)}</div></div></div>`;
  if (doc.model) html += `<div class="disc">Разобрано моделью ${esc(doc.model)}</div>`;
  return html;
}

/* ══ ПРИЁМ И РАЗБОР ══════════════════════════════════════════ */

export function inbox(app) {
  const q = S.state.docs.filter(d => ['queued', 'reading'].includes(d.status));
  const problems = S.state.docs.filter(d => ['needs-date', 'error', 'skipped', 'duplicate'].includes(d.status));
  const recent = S.state.docs.filter(d => d.status === 'ready').slice(0, 6);

  let html = backHead('Разбор', q.length ? `${S.state.queue.done} из ${S.state.queue.total || q.length}` : `${problems.length} требуют внимания`);

  if (q.length) {
    const pct = S.state.queue.total ? Math.round(S.state.queue.done / S.state.queue.total * 100) : 5;
    html += `<div class="card"><div class="prog"><i style="width:${pct}%"></i></div>
      <div class="sm" style="margin-top:10px">Читаю ${esc(q[0].fileName || 'документ')}… Можно закрыть приложение — допишу в фоне.</div></div>`;
  }

  if (!q.length && !problems.length && recent.length) {
    html += `<div class="card"><div class="row">${icon('check', 'ico s')}<div class="grow"><div class="nm">Всё разобрано</div>
      <div class="sm">${recent.length} последних документов в хронике</div></div></div></div>`;
  }

  for (const d of problems) {
    const kind = {
      'needs-date': ['Дата не читается', 'Без даты показатели не встают в линию'],
      'error': ['Не смог прочитать', d.error || ''],
      'skipped': ['Не медицинский документ', 'Похоже на посторонний файл — ничего не сохранил'],
      'duplicate': ['Дубль', 'Такой же документ за эту дату уже есть'],
    }[d.status];
    html += `<div class="card">
      <div class="row">
        <div class="thumb" style="width:44px;aspect-ratio:3/4"><img data-blob="${esc(d.blobId)}" alt=""></div>
        <div class="grow"><div class="nm">${esc(kind[0])}</div><div class="sm">${esc(d.title || d.fileName || '')}${kind[1] ? ' · ' + esc(kind[1]) : ''}</div></div>
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

/* ══ ЕДА ═════════════════════════════════════════════════════ */

export function food(app) {
  const today = new Date().toISOString().slice(0, 10);
  const date = app.foodDate || today;
  const meals = S.mealsOn(date);
  const t = S.dayTotals(date);
  const tg = S.dayTargets();
  const goal = S.foodGoal();

  let html = head('Тарелка', date === today ? 'сегодня' : S.ruDate(date),
    `<button class="rnd" data-act="settings">${icon('user', 'ico s')}</button><button class="rnd dark" data-act="add-meal">${icon('camera', 'ico s')}</button>`);

  if (goal) {
    html += `<div class="card gold tap" data-act="marker" data-key="${esc(goal.key)}">
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

  html += `<div class="card">
    <div class="row">
      ${ring(t.kcal / tg.kcal, { size: 52 })}
      <div class="grow"><div class="nm" style="font-size:17px">${Math.round(t.kcal)} ккал</div>
        <div class="sm">из ориентира ${tg.kcal} · ${t.count} ${plural(t.count, 'приём', 'приёма', 'приёмов')}</div></div>
      <div style="text-align:right"><div class="sm">Б ${Math.round(t.protein_g)} · Ж ${Math.round(t.fat_g)} · У ${Math.round(t.carbs_g)}</div></div>
    </div>
    <div class="divide"></div>
    ${focus.map(([k, label, unit, target, lowerBetter]) => {
      const v = t[k] || 0;
      const over = lowerBetter ? v > target : false;
      const short = !lowerBetter && v < target;
      return `<div style="margin-bottom:11px">
        <div class="row" style="margin-bottom:5px"><div class="grow sm" style="color:var(--ink)">${label}</div>
          <div class="sm ${over ? '' : ''}" style="${over ? 'color:var(--warn);font-weight:700' : short ? '' : 'font-weight:700;color:var(--ink)'}">${S.trim(v)} / ${target} ${unit}</div></div>
        ${bar(v, target, { color: lowerBetter ? 'var(--gold)' : 'var(--ink)' })}
      </div>`;
    }).join('')}
  </div>`;

  if (app.aiFood) html += aiBlock('по цели', esc(app.aiFood).replace(/\n/g, '<br>'));
  else if (db.settings().apiKey) html += `<div class="card flat"><button class="mini" data-act="food-feedback">${icon('sparkle', 'ico s')} Как я иду к цели сегодня?</button></div>`;

  html += `<div class="cap">Что съел</div>`;
  for (const m of meals) {
    html += `<div class="card tap" data-act="meal" data-id="${esc(m.id)}">
      <div class="row">
        <div class="thumb" style="width:52px;aspect-ratio:1"><img data-blob="${esc(m.blobId)}" alt=""></div>
        <div class="grow"><div class="nm">${esc(m.title || 'Блюдо')}</div>
          <div class="sm">${new Date(m.at).toTimeString().slice(0, 5)} · ${Math.round(m.nutrition?.kcal || 0)} ккал · нас. жиры ${S.trim(m.nutrition?.sat_fat_g || 0)} г · клетчатка ${S.trim(m.nutrition?.fiber_g || 0)} г</div></div>
        ${m.confidence != null && m.confidence < 0.6 ? `<span class="mini">на глаз</span>` : ''}
      </div>
    </div>`;
  }

  const pending = S.state.meals.filter(m => m.status === 'reading');
  if (pending.length) html += `<div class="card"><div class="row"><div class="spin"></div><div class="grow sm">Смотрю тарелку…</div></div></div>`;

  html += `<div class="disc">Оценка по фотографии приблизительная: вес порции виден не всегда. Это ориентир, а не точный подсчёт.</div>`;
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
  html += `<div class="disc">Сроки — не медицинское назначение, а простое правило: раз в год для спокойных показателей, чаще для тех, что вышли за границу. Слово врача главнее.</div>`;
  return html;
}

/* ══ ДЛЯ ВРАЧА ═══════════════════════════════════════════════ */

export function doctor(app) {
  const s = db.settings();
  const age = new Date().getFullYear() - (s.birthYear || 1990);
  const list = S.markerList();
  const bad = list.filter(m => !m.stale && (m.status === 'out' || m.status === 'edge'));
  const studies = S.state.docs.filter(d => d.status === 'ready' && (d.type === 'imaging' || d.conclusion))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  const recent = S.state.docs.filter(d => d.status === 'ready' && d.type === 'blood')
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3);

  let html = backHead('Для врача', `собрано ${S.ruDate(new Date().toISOString().slice(0, 10))} · одна страница`);

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
            <div class="sm">норма ${esc(S.fmtRef(m.last))} · ${m.count > 1 ? `было ${S.trim(first.value)} в ${first.date.slice(0, 4)}` : 'единственный замер'} · ${S.ruShort(m.last.date)}</div></div>
        </div>`;
      }).join('')}
    </div></div>`;
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
  html += `<div class="disc">Страница собрана из твоих документов. Это выжимка, а не медицинское заключение.</div>`;
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
      <button class="mini" data-act="save-key">Сохранить</button>
      <button class="mini" data-act="check-key">Проверить</button>
      <div class="grow sm" id="keyState">${app.keyState ? esc(app.keyState) : (s.apiKey ? 'ключ сохранён в этом браузере' : 'ключа пока нет')}</div>
    </div>
    <div class="divide"></div>
    <div class="sm" style="line-height:1.5">Ключ берётся на openrouter.ai → Keys. Он <b>хранится только здесь</b>, на этом устройстве, и уходит напрямую в OpenRouter.</div>
  </div>`;

  html += `<div class="cap">Модель</div>
  <div class="card">
    <div class="row"><div class="grow"><div class="nm" style="font-size:14px">Разбор снимков</div>
      <div class="sm">${s.modelVision ? esc(s.modelVision) : 'не выбрана — без неё бланки не читаются'}</div></div></div>
    <div class="divide"></div>
    <div class="row"><div class="grow"><div class="nm" style="font-size:14px">Тексты и вопросы</div>
      <div class="sm">${s.modelChat ? esc(s.modelChat) : 'та же, что для снимков'}</div></div></div>
    <div class="divide"></div>
    <div class="row">
      <button class="mini" data-act="refresh-models">${app.modelsLoading ? 'Обновляю…' : 'Обновить список'}</button>
      <div class="grow sm">${models.length ? `${models.length} моделей · ${vision.length} умеют картинки` : 'список ещё не загружен'}</div>
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
    </div>`;

    if (freeOnly) {
      html += `<div class="card flat"><div class="row">${icon('warning', 'ico s')}
        <div class="grow sm" style="line-height:1.5">У бесплатных моделей свои ограничения: <b>примерно 50 запросов в сутки</b> и очередь в час пик. Бланки они читают заметно хуже платных — <b>обязательно сверь распознанные числа с оригиналом</b>. Для пробы годятся, для архива лучше платная.</div></div></div>`;
    }

    if (!filtered.length) {
      html += `<div class="card"><div class="sm" style="line-height:1.5">${freeOnly
        ? 'Среди тех, что умеют читать картинки, бесплатных сейчас нет. Сними фильтр или загляни во вкладку «Для текстов» — там бесплатных больше.'
        : 'Ничего не нашлось. Попробуй другое слово или обнови список.'}</div></div>`;
    }

    html += `<div class="card list">`;
    html += filtered.map(m => {
      const chosen = (app.modelTab === 'chat' ? s.modelChat : s.modelVision) === m.id;
      const price = m.variablePrice || m.promptPrice == null ? 'цена зависит от выбранной модели'
        : m.free ? 'бесплатно'
        : `$${(m.promptPrice * 1e6).toFixed(2)}/млн вход · $${(m.completionPrice * 1e6).toFixed(2)}/млн выход`;
      return `<div class="it" data-act="pick-model" data-id="${esc(m.id)}">
        ${chosen ? icon('check', 'ico s') : `<span class="dot unknown"></span>`}
        <div class="grow"><div class="nm" style="font-size:14px">${esc(m.name)}${m.free ? ' <span style="color:var(--gold-ink);font-weight:800">· бесплатно</span>' : ''}</div>
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

  const unread = S.state.docs.filter(d => d.status === 'ready').length;
  html += `<div class="card flat">
    <div class="row">${icon('recycle', 'ico s')}
      <div class="grow"><div class="nm" style="font-size:14px">Переразобрать всё заново</div>
        <div class="sm">${unread} документов пройдут через выбранную модель. Правки, сделанные руками, потеряются</div></div>
      <button class="mini" data-act="reparse">Запустить</button></div>
  </div>`;

  html += `<div class="card flat">
    <div class="row">${icon('sparkle', 'ico s')}
      <div class="grow"><div class="nm" style="font-size:14px">Демонстрационный архив</div>
        <div class="sm">${app.hasDemo ? 'Сейчас в приложении есть демо-документы' : '12 документов за 10 лет — посмотреть, как всё выглядит с данными'}</div></div>
      <button class="mini" data-act="${app.hasDemo ? 'demo-clear' : 'demo-fill'}">${app.hasDemo ? 'Убрать' : 'Показать'}</button></div>
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
    <div class="sm" style="line-height:1.6">
      Отдельного пароля нет и не нужно: внутри Телеграма ты уже вошёл — приложение видит твой аккаунт и держит копию архива в <b>твоём</b> облаке Телеграма.
    </div>
  </div>`;

  html += `<div class="card">
    <div class="row"><div class="grow"><div class="nm" style="font-size:14px">На этом устройстве</div>
      <div class="sm">${S.state.docs.length} документов · ${S.state.meas.length} замеров · ${S.state.meals.length} блюд</div></div>
      ${icon('check', 'ico s')}</div>
    <div class="divide"></div>
    <div class="row"><div class="grow"><div class="nm" style="font-size:14px">Копия в облаке Телеграма</div>
      <div class="sm">${inTelegram()
        ? (backupAt ? `последняя — ${new Date(backupAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · ${Math.round((s.cloudBytes || 0) / 1024)} КБ` : 'ещё не делалась')
        : 'доступна только внутри Телеграма'}</div></div>
      <button class="tog ${s.autoCloud ? 'on' : ''}" data-act="toggle-cloud"></button></div>
    <div class="divide"></div>
    <div class="sm" style="line-height:1.6">
      В облако уходят <b>числа, даты, лаборатории и еда</b> — этого хватает, чтобы восстановить все линии на новом телефоне.
      <b>Снимки туда не помещаются</b> (лимит около 4 МБ), они остаются на устройстве. Хочешь сохранить и оригиналы — сделай копию файлом.
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

  html += `<div class="card">
    <div class="sm" style="line-height:1.6">
      <b>Что уходит наружу:</b> когда я разбираю снимок или отвечаю на вопрос, картинка и выжимка данных уходят в OpenRouter выбранной тобой модели — иначе разбора не будет. В остальное время данные не покидают устройство и твоё облако Телеграма.
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
        <button class="seg ${s.sex !== 'f' ? 'on' : ''}" data-act="sex" data-v="m">Мужской</button>
        <button class="seg ${s.sex === 'f' ? 'on' : ''}" data-act="sex" data-v="f">Женский</button>
      </div>
      <div class="row" style="gap:10px">
        <div class="grow"><label class="lab">Год рождения</label><input type="number" id="birthYear" value="${s.birthYear}"></div>
        <div class="grow"><label class="lab">Рост, см</label><input type="number" id="heightCm" value="${s.heightCm}"></div>
        <div class="grow"><label class="lab">Вес, кг</label><input type="number" id="weightKg" value="${s.weightKg}"></div>
      </div>
    </div>
    <button class="btn" data-act="ob-next">Дальше</button>
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
  const items = [
    ['summary', 'sparkle', 'Сводка'],
    ['markers', 'chartline', 'Показатели'],
    ['timeline', 'calendar', 'Хроника'],
    ['food', 'forkknife', 'Тарелка'],
    ['ask', 'chat', 'Спросить'],
  ];
  return `<div class="tabs"><div class="dock">
    ${items.map(([id, ic, label]) => `<button class="tab ${active === id ? 'on' : ''}" data-act="tab" data-tab="${id}">${icon(ic)}${label}</button>`).join('')}
  </div></div>`;
}
