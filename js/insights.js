/* Что приложение поняло про человека — и о чём стоит сказать.

   Два списка, оба считаются из уже имеющихся данных:
   • tiles()   — плитки дашборда на главной: короткие наблюдения о себе;
   • notices() — колокольчик: то, что ждёт действия и раньше висело
                 предупреждениями поперёк главной.

   Правило для плиток одно: плитка — это НАБЛЮДЕНИЕ, а не кнопка. Если сказать
   нечего, плитки нет. Пустых карточек с прочерками здесь не бывает. */

import * as S from './store.js';
import * as MED from './meds.js';
import { coverage } from './systems.js';
import * as PP from './passport.js';
import { markerTitle } from './markers.js';

const RU_MONTH = (n) => n === 1 ? 'месяц' : n < 5 ? 'месяца' : 'месяцев';

/* ── плитки дашборда ─────────────────────────────────────────── */

export function tiles(app) {
  const today = S.todayISO();
  const list = S.markerList();
  const out = [];

  /* 1. Приём лекарств. Первое, что меняется в течение дня, — значит первое,
        что человек ищет глазами. */
  const d = MED.dayCount(today);
  if (d.total) {
    const slot = MED.nowSlot(today);
    out.push({
      id: 'meds',
      kind: 'приём сегодня',
      value: `${d.taken}`, suffix: `/${d.total}`,
      title: d.left ? `Осталось ${d.left}` : 'Всё принято',
      sub: d.left && slot ? `ближайшее — ${slot.title.toLowerCase()}, ${slot.at}` : 'сегодня можно выдохнуть',
      tone: d.left ? 'take' : 'ok',
      act: 'go', data: { r: 'meds' },
      ring: d.total ? d.taken / d.total : 0,
    });
  }

  /* 2. Еда — ВСЕГДА, даже когда сегодня пусто. Это счётчик дня наравне с
        приёмом лекарств: если он появляется через раз, его перестают искать.
        Ноль здесь честный, а не пустая карточка с прочерком. */
  const t = S.dayTotals(today);
  const tg = S.dayTargets();
  const goal = S.foodGoal();
  out.push({
    id: 'food',
    kind: 'съедено сегодня',
    value: `${Math.round(t.kcal)}`, suffix: 'ккал',
    title: t.count
      ? `${t.count} ${t.count === 1 ? 'приём' : t.count < 5 ? 'приёма' : 'приёмов'} пищи`
      : 'Ещё ничего не снято',
    sub: t.count
      ? `Б ${Math.round(t.protein_g)} · Ж ${Math.round(t.fat_g)} · У ${Math.round(t.carbs_g)}`
      : goal ? `цель из анализов: ${goal.goal}` : `ориентир дня — ${tg.kcal} ккал`,
    tone: 'food',
    act: 'go', data: { r: 'food' },
    ring: tg.kcal ? Math.min(1, t.kcal / tg.kcal) : 0,
  });

  /* 3. Что вне нормы прямо сейчас — с линией, а не одним числом:
        «12 два года подряд» и «12 впервые» — разные новости. */
  const bad = list.filter(m => !m.stale && m.status === 'out')[0]
    || list.filter(m => !m.stale && m.status === 'edge')[0];
  if (bad) {
    out.push({
      id: 'out',
      kind: bad.status === 'out' ? 'вне нормы' : 'у границы',
      value: S.trim(bad.last.value), suffix: bad.unit,
      title: bad.title,
      sub: `норма ${S.fmtRef(bad.last)} · ${S.ruShort(bad.last.date)}`,
      tone: bad.status === 'out' ? 'out' : 'edge',
      act: 'marker', data: { key: bad.key },
      spark: bad.series,
    });
  }

  /* 4. Настоящий сдвиг за год — уже отфильтрованный от разброса лабораторий. */
  const sh = S.shifts(3).filter(m => m.deltaTone !== 'flat')[0] || S.shifts(1)[0];
  if (sh && sh.base) {
    const diff = +(sh.last.value - sh.base.value).toFixed(2);
    const months = Math.max(1, Math.round(sh.gapDays / 30));
    const better = S.changeTone(sh.key, sh.base.value, sh.last.value, sh.last.refLow, sh.last.refHigh);
    out.push({
      id: 'shift',
      kind: better === 'better' ? 'стало лучше' : better === 'worse' ? 'ушло дальше' : 'сдвинулось',
      value: `${diff > 0 ? '+' : ''}${S.trim(diff)}`, suffix: sh.unit,
      title: sh.title,
      sub: `за ${months} ${RU_MONTH(months)} · было ${S.trim(sh.base.value)}`,
      tone: better === 'better' ? 'ok' : better === 'worse' ? 'out' : 'slate',
      act: 'marker', data: { key: sh.key },
      spark: sh.series,
    });
  }

  /* 5. Изученность тела. Единственная плитка про то, чего ЕЩЁ НЕТ:
        пустая система — это не «здоров», это «неизвестно». */
  const cov = coverage(list);
  if (list.length) {
    const blank = cov.blank.length;
    out.push({
      id: 'coverage',
      kind: 'изучено',
      value: `${cov.known}`, suffix: `/${cov.total}`,
      title: blank ? `${blank} ${blank === 1 ? 'система' : blank < 5 ? 'системы' : 'систем'} без единого анализа` : 'все системы затронуты',
      sub: blank ? cov.blank.slice(0, 3).map(s => s.title.toLowerCase()).join(', ') : `${cov.systemsTouched} из ${cov.systemsTotal} систем`,
      tone: 'study',
      act: 'go', data: { r: 'markers' },
      ring: cov.pct,
    });
  }

  /* 6. Что пора пересдать: срок из рекомендаций, а не выдумка. */
  const due = S.dueList()[0];
  if (due) {
    const months = Math.max(1, Math.floor(due.daysOld / 30));
    out.push({
      id: 'due',
      kind: 'пора пересдать',
      value: `${months}`, suffix: RU_MONTH(months),
      title: due.title,
      sub: `последний раз ${S.ruShort(due.last.date)}`,
      tone: 'slate',
      act: 'due', data: {},
    });
  }

  /* 7. Дисциплина приёма — то немногое, что человек делает сам. */
  const streak = takeStreak(today);
  if (streak >= 3) {
    out.push({
      id: 'streak',
      kind: 'без пропусков',
      value: `${streak}`, suffix: streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней',
      title: 'Принимаешь по расписанию',
      sub: 'считаю только то, что отмечено',
      tone: 'ok',
      act: 'go', data: { r: 'meds' },
    });
  }

  return out;
}

/* Сколько дней подряд закрыты все назначенные приёмы. Сегодня не считаем:
   день ещё идёт, и незакрытый вечер не должен обнулять неделю. */
function takeStreak(today = S.todayISO()) {
  let n = 0;
  for (let i = 1; i <= 30; i++) {
    const date = MED.addDays(today, -i);
    const c = MED.dayCount(date);
    if (!c.total) { if (n) break; else continue; }
    if (c.taken === c.total) n++; else break;
  }
  return n;
}

/* ── колокольчик ─────────────────────────────────────────────────
   Всё, что ждёт человека, живёт в одном месте. Раньше это были карточки
   поперёк главной: «не хватает средств», «3 документа ждут», «назначение не
   проверено» — каждая перебивала собой то, ради чего человек открыл экран. */

export function notices(app = {}) {
  const today = S.todayISO();
  const out = [];

  const queue = S.state.docs.filter(d => ['queued', 'reading'].includes(d.status)).length;
  if (queue) {
    out.push({
      id: 'queue', icon: 'hourglass', tone: 'slate',
      title: `Разбираю ещё ${queue}`,
      sub: S.state.queue.total ? `${S.state.queue.done} из ${S.state.queue.total} · можно закрыть приложение` : 'сейчас начну',
      act: 'inbox', data: {},
    });
  }

  /* Ошибка модели — не новость главного экрана. Это разговор про деньги
     и ключи, и место ему здесь. */
  if (app.aiSummaryError) {
    out.push({
      id: 'ai', icon: 'warning', tone: 'edge',
      title: humanAiError(app.aiSummaryError),
      sub: 'разбор документов и ответы пока не работают',
      act: 'settings', data: {},
    });
  }

  /* Противоречие «назначено то, на что аллергия» — самое важное, что
     приложение вообще может сказать. Первым в списке и красным. */
  for (const c of PP.conflictingMeds(MED.state.meds.filter(m => ['active', 'ask'].includes(MED.statusOf(m, today))))) {
    out.unshift({
      id: 'allergy-' + c.med.id, icon: 'warning', tone: 'out',
      title: `${c.med.name} и твоя аллергия на ${c.hits[0].allergy.name}`,
      sub: 'переспроси врача — приложение ничего не отменяет само',
      act: 'med', data: { id: c.med.id },
    });
  }

  /* Пустой паспорт при живых назначениях — не тревога, а честный пробел:
     без аллергий сверять назначения не с чем. */
  if (PP.isEmpty() && MED.state.meds.length) {
    out.push({
      id: 'passport', icon: 'shield', tone: 'slate',
      title: 'Аллергии не записаны',
      sub: 'первый вопрос на приёме — и я смогу сверять с ним назначения',
      act: 'go', data: { r: 'passport' },
    });
  }

  const check = MED.unconfirmed();
  if (check.length) {
    out.push({
      id: 'rx-check', icon: 'pill', tone: 'edge',
      title: check.length === 1 ? `Сверь назначение: ${check[0].name}` : `${check.length} назначения не проверены`,
      sub: 'дозу и время я прочитал с фотографии — ошибка тут опаснее пропуска',
      act: check.length === 1 ? 'med' : 'go',
      data: check.length === 1 ? { id: check[0].id } : { r: 'meds' },
    });
  }

  for (const m of MED.askMeds(today)) {
    out.push({
      id: 'ask-' + m.id, icon: 'clock', tone: 'edge',
      title: `Ты ещё принимаешь ${m.name}?`,
      sub: `назначено ${m.docDate ? S.ruDate(m.docDate) : 'давно'}, срок не указан — в расписание не ставлю`,
      act: 'med', data: { id: m.id },
    });
  }

  const attention = S.state.docs.filter(d =>
    ['needs-date', 'error', 'skipped', 'duplicate', 'foreign', 'needs-file'].includes(d.status)
    || (d.status === 'ready' && d.pageErrors?.length));
  if (attention.length) {
    out.push({
      id: 'docs', icon: 'file', tone: 'edge',
      title: attention.length === 1 ? 'Документ ждёт тебя' : `${attention.length} документов ждут тебя`,
      sub: 'нет даты, не прочитан или похож на дубль',
      act: 'inbox', data: {},
    });
  }

  const doubts = S.state.meas.filter(m => !m.confirmed).length;
  if (doubts) {
    out.push({
      id: 'doubts', icon: 'eye', tone: 'slate',
      title: `${doubts} ${doubts === 1 ? 'число прочитано' : 'чисел прочитано'} неуверенно`,
      sub: 'открой документ и сверь с оригиналом — это десять секунд',
      act: 'inbox', data: {},
    });
  }

  const due = S.dueList();
  if (due.length) {
    out.push({
      id: 'due', icon: 'clock', tone: 'slate',
      title: due.length === 1 ? `${due[0].title} — пора пересдать` : `${due.length} показателей пора пересдать`,
      sub: `${due[0].title} последний раз ${S.ruShort(due[0].last.date)}`,
      act: 'due', data: {},
    });
  }

  return out;
}

/* Сырое сообщение модели человеку ничего не говорит */
export function humanAiError(err) {
  const m = String(err || '');
  if (/402|не хватает средств/i.test(m)) return 'На счету OpenRouter кончились деньги';
  if (/401|не принят/i.test(m)) return 'Ключ OpenRouter не принят';
  if (/429|Слишком часто/i.test(m)) return 'Модель попросила подождать';
  if (/интернет|связи|network|fetch/i.test(m)) return 'Не было связи с моделью';
  return m.length > 60 ? 'Модель не ответила' : m;
}

export { markerTitle };
