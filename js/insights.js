/* Что приложение поняло про человека — и о чём стоит сказать.

   Два списка, оба считаются из уже имеющихся данных:
   • tiles()   — плитки дашборда на главной: короткие наблюдения о себе;
   • notices() — колокольчик: то, что ждёт действия и раньше висело
                 предупреждениями поперёк главной.

   Правило для плиток одно: плитка — это НАБЛЮДЕНИЕ, а не кнопка. Если сказать
   нечего, плитки нет. Пустых карточек с прочерками здесь не бывает.

   У каждой плитки свой знак: таблетка, вилка, часы. Шесть одинаковых
   прямоугольников с цифрами глаз не различает — за них цепляется значок,
   а не заголовок мелкими буквами. */

import * as S from './store.js';
import * as MED from './meds.js';
import * as PP from './passport.js';
import { markerTitle } from './markers.js';


/* ── плитки дашборда ─────────────────────────────────────────── */

export function tiles(app) {
  const today = S.todayISO();
  const list = S.markerList();
  const out = [];

  /* Анатомия плитки — из макета, одна на все четыре: белый кружок со знаком,
     процент в углу, подпись обычным начертанием, крупное число со СЕРЫМ
     хвостом «из скольких», точечная полоса внизу. Раньше у каждой плитки было
     по три строки текста своим кеглем — шесть разных рассказов на одном
     экране. Теперь это счётчики одного рода: «сколько из скольких».

     Конкретика («какой именно показатель вне нормы») ушла ниже — в ленту
     показателей: там у неё есть число, коридор и линия пути, а на плитке
     помещалась только половина правды. */

  /* 1. Еда — всегда, даже когда сегодня пусто: счётчик дня, который
        появляется через раз, перестают искать глазами. */
  const t = S.dayTotals(today);
  const tg = S.dayTargets();
  out.push({
    id: 'food', icon: 'forkknife', tone: 'food',
    label: 'Съедено',
    value: `${Math.round(t.kcal)}`,
    tail: `/ ${tg.kcal} ккал`,
    pct: tg.kcal ? Math.min(1, t.kcal / tg.kcal) : 0,
    act: 'go', data: { r: 'food' },
  });

  /* 2. Приём лекарств — первое, что меняется в течение дня. */
  const d = MED.dayCount(today);
  if (d.total) {
    out.push({
      id: 'meds', icon: 'pill', tone: 'take',
      label: 'Приём лекарств',
      value: `${d.taken}`,
      tail: `/ ${d.total} ${plural(d.total, 'приём', 'приёма', 'приёмов')}`,
      pct: d.taken / d.total,
      act: 'go', data: { r: 'meds' },
    });
  }

  /* 3–4. Состояние архива: сколько вне нормы и сколько просрочено.
        Ноль здесь — хорошая новость, и её тоже надо показать. */
  const fresh = list.filter(m => !m.stale);
  if (list.length) {
    const bad = fresh.filter(m => m.status === 'out').length;
    out.push({
      id: 'out', icon: 'warning', tone: bad ? 'out' : 'ok',
      label: 'Вне нормы',
      value: `${bad}`,
      tail: `/ ${list.length} ${plural(list.length, 'анализ', 'анализа', 'анализов')}`,
      pct: list.length ? bad / list.length : 0,
      act: 'go', data: { r: 'markers' },
    });

    const due = S.dueList().length;
    out.push({
      id: 'due', icon: 'clock', tone: 'due',
      label: 'Пора пересдать',
      value: `${due}`,
      tail: `/ ${list.length} ${plural(list.length, 'анализ', 'анализа', 'анализов')}`,
      pct: list.length ? due / list.length : 0,
      act: 'due', data: {},
    });
  }

  return out;
}

function plural(n, a, b, c) {
  const x = Math.abs(n) % 100, y = x % 10;
  if (x > 10 && x < 20) return c;
  if (y > 1 && y < 5) return b;
  if (y === 1) return a;
  return c;
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
      id: 'queue', icon: 'hourglass', tone: 'slate', kind: 'разбор',
      title: `Разбираю ещё ${queue}`,
      sub: S.state.queue.total ? `${S.state.queue.done} из ${S.state.queue.total} · можно закрыть приложение` : 'сейчас начну',
      act: 'inbox', data: {},
    });
  }

  /* Ошибка модели — не новость главного экрана. Это разговор про деньги
     и ключи, и место ему здесь. */
  if (app.aiSummaryError) {
    out.push({
      id: 'ai', icon: 'warning', tone: 'edge', kind: 'связь с ИИ',
      title: humanAiError(app.aiSummaryError),
      sub: 'разбор документов и ответы пока не работают',
      act: 'settings', data: {},
    });
  }

  /* Противоречие «назначено то, на что аллергия» — самое важное, что
     приложение вообще может сказать. Первым в списке и красным. */
  for (const c of PP.conflictingMeds(MED.state.meds.filter(m => ['active', 'ask'].includes(MED.statusOf(m, today))))) {
    out.unshift({
      id: 'allergy-' + c.med.id, icon: 'warning', tone: 'out', kind: 'аллергия',
      title: `${c.med.name} и твоя аллергия на ${c.hits[0].allergy.name}`,
      sub: 'переспроси врача — приложение ничего не отменяет само',
      act: 'med', data: { id: c.med.id },
    });
  }

  /* Пустой паспорт при живых назначениях — не тревога, а честный пробел:
     без аллергий сверять назначения не с чем. */
  if (PP.isEmpty() && MED.state.meds.length) {
    out.push({
      id: 'passport', icon: 'shield', tone: 'slate', kind: 'паспорт здоровья',
      title: 'Аллергии не записаны',
      sub: 'первый вопрос на приёме — и я смогу сверять с ним назначения',
      act: 'go', data: { r: 'passport' },
    });
  }

  const check = MED.unconfirmed();
  if (check.length) {
    out.push({
      id: 'rx-check', icon: 'pill', tone: 'edge', kind: 'назначения',
      title: check.length === 1 ? `Сверь назначение: ${check[0].name}` : `${check.length} ${plural(check.length, 'назначение не проверено', 'назначения не проверены', 'назначений не проверены')}`,
      sub: 'дозу и время я прочитал с фотографии — ошибка тут опаснее пропуска',
      act: check.length === 1 ? 'med' : 'go',
      data: check.length === 1 ? { id: check[0].id } : { r: 'meds' },
    });
  }

  for (const m of MED.askMeds(today)) {
    out.push({
      id: 'ask-' + m.id, icon: 'clock', tone: 'edge', kind: 'приём',
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
      id: 'docs', icon: 'file', tone: 'edge', kind: 'архив',
      title: attention.length === 1 ? 'Документ ждёт тебя' : `${attention.length} документов ждут тебя`,
      sub: 'нет даты, не прочитан или похож на дубль',
      act: 'inbox', data: {},
    });
  }

  const doubts = S.state.meas.filter(m => !m.confirmed).length;
  if (doubts) {
    out.push({
      id: 'doubts', icon: 'eye', tone: 'slate', kind: 'проверка чисел',
      title: `${doubts} ${doubts === 1 ? 'число прочитано' : 'чисел прочитано'} неуверенно`,
      sub: 'открой документ и сверь с оригиналом — это десять секунд',
      act: 'inbox', data: {},
    });
  }

  const due = S.dueList();
  if (due.length) {
    out.push({
      id: 'due', icon: 'clock', tone: 'slate', kind: 'пересдать',
      title: due.length === 1 ? `${due[0].title} — пора пересдать` : `${due.length} ${plural(due.length, 'показатель', 'показателя', 'показателей')} пора пересдать`,
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
