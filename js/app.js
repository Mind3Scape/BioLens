/* Точка входа: состояние, роутер, обработчики. */

import * as db from './db.js';
import * as S from './store.js';
import * as MED from './meds.js';
import * as SYS from './systems.js';
import * as PP from './passport.js';
import * as V from './views.js';
import { $, $$, esc, toast, sheet, confirmSheet } from './ui.js';
import { icon } from './icons.js';
import { fetchModels, checkKey, summarize, askArchive, mealFeedback, chat, VOICE_RULES } from './openrouter.js';
import { scan } from './scan.js';
import { fillDemo, clearDemo, hasDemo } from './demo.js';
import * as TG from './telegram.js';
import * as BK from './backup.js';

const app = {
  route: 'summary',
  param: {},
  stack: [],
  docFilter: 'all',
  modelTab: 'vision',
  modelQuery: '',
  modelFree: false,
  modelLimit: 25,
  models: null,
  modelsLoading: false,
  keyState: '',
  aiSummary: '',
  aiSummaryError: '',
  aiMarker: {},
  infoOpen: {},
  aiFood: '',
  aiMeal: '',          // подсказка «что съесть» — живёт до конца дня
  aiMealBusy: false,
  chat: [],
  asking: false,
  obStep: 1,
  foodDate: null,
  medDate: null,      // выбранный день недели на экране лекарств
  archiveOpen: false, // архив на главной раскрыт целиком
};
window.__biolens = app;

/* Три двери внизу: день, тело, разговор. Лекарства, тарелка, хроника и
   уведомления — это места, куда заходят в свой момент и возвращаются назад,
   поэтому они лежат в стеке, а не в доке. */
const TABS = ['summary', 'markers', 'ask'];

/* ── рендер ──────────────────────────────────────────────────── */

function render() {
  const view = $('#view');
  const s = db.settings();
  applyTheme(s.theme);

  let html = '';
  if (!s.onboarded) html = V.onboarding(app);
  else if (app.route === 'summary') html = V.summary(app);
  else if (app.route === 'markers') html = V.markers(app);
  else if (app.route === 'markers-all') html = V.markersAll(app);
  else if (app.route === 'system') html = V.systemView(app);
  else if (app.route === 'gaps') html = V.gapsView(app);
  else if (app.route === 'passport') html = V.passportView(app);
  else if (app.route === 'colors') html = V.colorsView(app);
  else if (app.route === 'notices') html = V.noticesView(app);
  else if (app.route === 'marker') html = V.markerDetail(app);
  else if (app.route === 'timeline') html = V.timeline(app);
  else if (app.route === 'meds') html = V.medsView(app);
  else if (app.route === 'med') html = V.medDetail(app);
  else if (app.route === 'doc') html = V.docView(app);
  else if (app.route === 'inbox') html = V.inbox(app);
  else if (app.route === 'food') html = V.food(app);
  else if (app.route === 'meal') html = V.mealView(app);
  else if (app.route === 'ask') html = V.ask(app);
  else if (app.route === 'due') html = V.due(app);
  else if (app.route === 'doctor') html = V.doctor(app);
  else if (app.route === 'settings') html = V.settingsView(app);
  else if (app.route === 'models') html = V.modelsView(app);

  view.innerHTML = html;
  /* Подсвечиваем вкладку только там, где экран действительно ей принадлежит.
     Хроника, документ и «для врача» ничьи — гореть «Здоровью», пока ты не там,
     значит врать про своё же положение. */
  const OWNER = { marker: 'markers', system: 'markers', 'markers-all': 'markers', gaps: 'markers' };
  $('#tabbar').innerHTML = s.onboarded ? V.tabbar(OWNER[app.route] || app.route) : '';
  // док пересобирается вместе с экраном — сжатое состояние надо вернуть на место
  if (dockMini) $('#dock')?.classList.add('mini');

  /* Компактная шапка берёт название прямо с экрана: один источник правды,
     и она не может разойтись с крупным заголовком под ней. */
  const bar = $('#topbar');
  const title = view.querySelector('h1, h2')?.textContent || '';
  bar.innerHTML = s.onboarded
    ? `${app.stack.length ? `<button class="rnd" data-act="back">${V.backIcon()}</button>` : '<div class="spacer"></div>'}
       <div class="tt">${esc(title)}</div><div class="spacer"></div>`
    : '';
  bar.classList.toggle('on', s.onboarded && view.scrollTop > 46);
  TG.setBackButton(app.stack.length > 0);
  hydrateImages(view);

  /* Выбранный фильтр может стоять за краем ленты — с шестью фильтрами в Хронике
     человек нажимал «Назначения» и терял из виду, что он вообще выбран. */
  const on = $('.segs.scroll .seg.on');
  if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  if (app.route === 'ask') {
    const inp = $('#askInput');
    if (inp) {
      inp.onkeydown = (e) => { if (e.key === 'Enter') sendQuestion(inp.value); };
      if (app.focusAsk) { inp.focus(); app.focusAsk = false; }
    }
    view.scrollTop = view.scrollHeight;
  }
  const mq = $('#modelQuery');
  if (mq) {
    mq.oninput = debounce(() => {
      app.modelQuery = mq.value; app.modelLimit = 25;
      const p = view.scrollTop; render(); $('#view').scrollTop = p;
      const f = $('#modelQuery'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
    }, 220);
  }
}

function applyTheme(mode) {
  const tgScheme = TG.tgTheme();
  const auto = tgScheme ? tgScheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = mode === 'dark' || (mode === 'auto' && auto);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/* Ссылки на снимки создаются на каждую перерисовку, а перерисовка идёт почти
   на каждый клик. Без общего кэша память в WebView Телеграма росла десятками
   мегабайт за минуту листания Хроники, и приложение перезагружалось само. */
const blobUrls = new Map();
async function hydrateImages(root) {
  for (const img of $$('img[data-blob]', root)) {
    const id = img.dataset.blob;
    let url = blobUrls.get(id);
    if (!url) {
      url = await db.getBlobUrl(id);
      if (!url) continue;
      blobUrls.set(id, url);
      if (blobUrls.size > 40) {                 // держим только недавние
        const oldest = blobUrls.keys().next().value;
        URL.revokeObjectURL(blobUrls.get(oldest));
        blobUrls.delete(oldest);
      }
    }
    img.src = url;
  }
}

/* ── плавающий док ──────────────────────────────────────────────
   Листаешь вниз — панель сжимается до одних значков и отдаёт экрану свои
   тридцать пикселей; листаешь вверх или доходишь до начала — разворачивается
   с подписями. Так ведёт себя нижняя панель в новой версии системы, и это
   единственный честный способ уменьшить её, не отнимая ни одной вкладки. */
let dockMini = false, lastScrollY = 0;

function watchDock() {
  const view = $('#view');
  view.addEventListener('scroll', () => {
    const y = view.scrollTop;
    $('#topbar')?.classList.toggle('on', y > 46 && !!$('#dock'));
    const dock = $('#dock');
    if (!dock) { lastScrollY = y; return; }
    if (y > lastScrollY + 5 && y > 70 && !dockMini) { dockMini = true; dock.classList.add('mini'); }
    else if ((y < lastScrollY - 7 || y < 40) && dockMini) { dockMini = false; dock.classList.remove('mini'); }
    lastScrollY = y;
  }, { passive: true });
}

function go(route, param = {}) {
  if (TABS.includes(route)) app.stack = [];
  else app.stack.push({ route: app.route, param: app.param });
  app.route = route; app.param = param;
  // новый экран начинается сверху — значит и док разворачивается
  dockMini = false; lastScrollY = 0;
  render();
  $('#view').scrollTop = 0;
}
function back() {
  const prev = app.stack.pop();
  app.route = prev?.route || 'summary';
  app.param = prev?.param || {};
  dockMini = false; lastScrollY = 0;      // экран начинается сверху — док разворачиваем
  render();
}

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function plural(n, a, b, c) {
  const x = Math.abs(n) % 100, y = x % 10;
  if (x > 10 && x < 20) return c;
  if (y > 1 && y < 5) return b;
  if (y === 1) return a;
  return c;
}

/* ── действия ────────────────────────────────────────────────── */

/* Человеческий текст вместо технической ошибки браузера */
function humanError(e) {
  const m = String(e?.name === 'QuotaExceededError' ? 'quota' : (e?.message || e));
  if (/quota|QuotaExceeded/i.test(m)) return 'На устройстве кончилось место. Сохрани копию файлом и удали лишние документы.';
  if (/NetworkError|Failed to fetch|нет связи/i.test(m)) return 'Нет связи — попробуй ещё раз.';
  return m.length > 140 ? 'Что-то пошло не так. Попробуй ещё раз.' : m;
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  // без ловушки любая ошибка внутри уходила в пустоту: экран не менялся, тоста не было
  handleAction(el).catch(err => { console.error(err); toast(humanError(err)); });
});

async function handleAction(el) {
  const act = el.dataset.act;
  const view = $('#view');
  if (act !== 'take') TG.haptic(['wipe', 'del-doc', 'del-meal', 'reparse', 'med-del', 'med-stop'].includes(act) ? 'warning' : 'light');

  switch (act) {
    case 'back': back(); break;
    case 'tab': go(el.dataset.tab); break;
    /* Переход на экран, у которого нет своей вкладки: лекарства, тарелка,
       хроника. Он ложится в стек, и «назад» возвращает туда, откуда пришли. */
    case 'go': {
      go(el.dataset.r);
      if (el.dataset.r === 'models' && !app.models && !db.cachedModels()?.length && db.settings().apiKey) loadModels();
      break;
    }
    case 'notices': go('notices'); break;
    case 'system': go('system', { id: el.dataset.id }); break;
    case 'settings':
      go('settings');
      db.storageInfo().then(info => { if (info) { app.storage = info; if (app.route === 'settings') render(); } });
      break;
    case 'inbox': go('inbox'); break;
    case 'due': go('due'); break;
    case 'doctor': go('doctor'); break;
    case 'doctor-questions': await doctorQuestions(); break;
    case 'copy-doctor': {
      const txt = doctorText();
      navigator.clipboard?.writeText(txt).then(() => toast('Скопировано — можно вставить в мессенджер'), () => toast('Не смог скопировать'));
      break;
    }
    case 'marker': go('marker', { key: el.dataset.key }); break;
    case 'doc': go('doc', { id: el.dataset.id }); break;
    case 'meal': go('meal', { id: el.dataset.id }); break;
    case 'med': go('med', { id: el.dataset.id }); break;

    /* ── лечение ── */
    case 'take': {
      /* Отметка приёма — самое частое действие в приложении и самое дешёвое
         в откате: повторное нажатие снимает её. Ничего не спрашиваем. */
      const rec = await MED.mark(el.dataset.id, el.dataset.date, el.dataset.slot);
      TG.haptic(rec ? 'success' : 'light');
      const pos = view.scrollTop; render(); $('#view').scrollTop = pos;
      if (db.settings().autoCloud) BK.scheduleCloudSave();
      break;
    }
    case 'med-ok': {
      await MED.confirmMed(el.dataset.id);
      toast('Принято — курс подтверждён');
      const pos = view.scrollTop; render(); $('#view').scrollTop = pos;
      if (db.settings().autoCloud) BK.scheduleCloudSave();
      break;
    }
    case 'med-keep': {
      await MED.keepTaking(el.dataset.id);
      toast('Оставил в расписании');
      render();
      if (db.settings().autoCloud) BK.scheduleCloudSave();
      break;
    }
    case 'med-stop': {
      const m = MED.state.meds.find(x => x.id === el.dataset.id);
      if (await confirmSheet('Закончил принимать?',
        `${m?.name || 'Курс'} уйдёт из расписания дня. Сам курс и отметки приёма останутся в истории — вернуть можно одной кнопкой.`, 'Закончил')) {
        await MED.setStatus(el.dataset.id, 'stopped');
        toast('Убрал из расписания'); render();
        if (db.settings().autoCloud) BK.scheduleCloudSave();
      }
      break;
    }
    case 'med-resume': {
      await MED.setStatus(el.dataset.id, 'active');
      toast('Вернул в расписание'); render();
      if (db.settings().autoCloud) BK.scheduleCloudSave();
      break;
    }
    case 'med-del': {
      const m = MED.state.meds.find(x => x.id === el.dataset.id);
      if (await confirmSheet('Удалить курс?',
        `${m?.name || 'Курс'} и все отметки о его приёме исчезнут. Если ты просто закончил принимать — лучше «Закончил принимать»: история останется.`, 'Удалить', true)) {
        await MED.removeMed(el.dataset.id);
        toast('Удалено');
        if (db.settings().autoCloud) BK.scheduleCloudSave();
        back();
      }
      break;
    }
    case 'food-day': {
      app.foodDate = el.dataset.date; app.aiMeal = '';
      const pos = view.scrollTop; render(); $('#view').scrollTop = pos;
      break;
    }
    case 'meal-idea': await mealIdea(); break;
    case 'med-day': {
      // переключение дня недели не должно дёргать экран
      app.medDate = el.dataset.date;
      const pos = view.scrollTop; render(); $('#view').scrollTop = pos;
      break;
    }
    /* ── паспорт здоровья ── */
    case 'pp-blood': PP.save({ blood: PP.state().blood === el.dataset.v ? '' : el.dataset.v }); render(); break;
    case 'pp-rh': PP.save({ rh: PP.state().rh === el.dataset.v ? '' : el.dataset.v }); render(); break;
    case 'pp-del': {
      PP.removeItem(el.dataset.kind, el.dataset.id);
      const pos = view.scrollTop; render(); $('#view').scrollTop = pos;
      if (db.settings().autoCloud) BK.scheduleCloudSave();
      break;
    }
    case 'pp-add': passportSheet(el.dataset.kind); break;

    case 'copy-gaps': {
      const have = new Set(S.markerList().map(m => m.key));
      const lines = SYS.mapSystems(S.markerList()).filter(x => x.missing.length)
        .map(x => `${x.title}: ${x.missingTitles.join(', ')}`);
      navigator.clipboard?.writeText(lines.join('\n')).then(() => toast('Список скопирован'), () => toast('Не смог скопировать'));
      break;
    }
    case 'copy-missing': {
      const s = SYS.systemById(el.dataset.id);
      const have = new Set(S.markerList().map(m => m.key));
      const txt = s.core.filter(k => !have.has(k)).map(k => SYS.markerTitle(k)).join(', ');
      navigator.clipboard?.writeText(txt).then(() => toast('Список скопирован'), () => toast('Не смог скопировать'));
      break;
    }
    case 'archive-toggle': {
      app.archiveOpen = !app.archiveOpen;
      const pos = view.scrollTop; render(); $('#view').scrollTop = pos;
      break;
    }
    case 'med-new': medSheet(null); break;
    case 'med-edit': medSheet(el.dataset.id); break;

    case 'dfilter': app.docFilter = el.dataset.kind; render(); break;

    case 'add': pickFiles(); break;
    case 'add-any': addAnySheet(); break;
    case 'scan': await doScan(); break;
    case 'add-meal': await addMealFlow(true); break;
    case 'pick-meal': await addMealFlow(false); break;

    case 'retry': {
      const d = S.state.docs.find(x => x.id === el.dataset.id);
      if (d) { d.status = 'queued'; await db.put('docs', d); render(); runQueue(); }
      break;
    }
    case 'del-doc': {
      if (await confirmSheet('Удалить документ?', 'Оригинал и все распознанные из него числа исчезнут.', 'Удалить', true)) {
        await S.deleteDoc(el.dataset.id); toast('Удалено'); back();
      }
      break;
    }
    case 'del-meal': {
      if (await confirmSheet('Удалить запись о еде?', 'Фото и расчёт исчезнут.', 'Удалить', true)) {
        await S.deleteMeal(el.dataset.id); toast('Удалено'); back();
      }
      break;
    }
    case 'use-file-date': {
      const d = S.state.docs.find(x => x.id === el.dataset.id);
      if (d?.fileDate) { await S.setDocDate(d.id, d.fileDate); toast('Дата поставлена'); render(); }
      break;
    }
    case 'pick-date': pickDate(el.dataset.id); break;
    case 'mine': {
      const r = await S.confirmPatient(el.dataset.id);
      if (r.ok && r.requeued) { toast('Ставлю в очередь на разбор'); render(); runQueue(); }
      else if (r.ok) { toast('Учёл в твоих линиях'); render(); }
      else { toast(r.reason); render(); }
      break;
    }
    case 'undup': {
      const d = S.state.docs.find(x => x.id === el.dataset.id);
      if (d) { d.status = 'queued'; d.duplicateOf = null; await db.put('docs', d); render(); runQueue(); }
      break;
    }
    case 'confirm-meas': {
      const input = $(`input[data-fix="${el.dataset.id}"]`);
      const v = input ? parseFloat(String(input.value).replace(',', '.')) : NaN;
      if (isFinite(v)) await S.fixMeasurement(el.dataset.id, v); else await S.confirmMeasurement(el.dataset.id);
      if (db.settings().autoCloud) BK.scheduleCloudSave();
      toast('Принято'); render();
      break;
    }

    case 'toggle-info': {
      app.infoOpen = app.infoOpen || {};
      const k = el.dataset.key;
      app.infoOpen[k] = !app.infoOpen[k];
      const pos = view.scrollTop; render(); $('#view').scrollTop = pos;
      break;
    }
    case 'explain': await explainMarker(el.dataset.key); break;
    case 'ask-preset': sendQuestion(el.dataset.q); break;
    case 'ask-send': sendQuestion($('#askInput')?.value || ''); break;
    case 'food-feedback': await foodFeedback(); break;
    case 'copy-due': {
      const txt = S.dueList().map(m => `${m.title} (последний раз ${S.ruShort(m.last.date)})`).join(', ');
      navigator.clipboard?.writeText(txt); toast('Список скопирован');
      break;
    }

    /* настройки */
    case 'save-key': {
      const k = $('#apiKey').value.trim();
      db.saveSettings({ apiKey: k });
      TG.cloudSet('apiKey', k);
      app.keyState = 'сохранён'; toast('Ключ сохранён'); render();
      break;
    }
    case 'check-key': {
      const key = $('#apiKey').value.trim();
      db.saveSettings({ apiKey: key });
      app.keyState = 'проверяю…'; render();
      TG.cloudSet('apiKey', key);
      try {
        const info = await checkKey(key);
        app.keyState = `принят${info.limit ? ` · лимит $${info.limit}` : ''}`;
        toast('Ключ работает');
        if (!app.models) await loadModels();
      } catch (err) { app.keyState = err.message; toast(err.message); }
      render();
      break;
    }
    case 'refresh-models': await loadModels(); break;
    case 'model-tab': app.modelTab = el.dataset.tab; app.modelLimit = 25; render(); break;
    case 'model-free': app.modelFree = el.dataset.v === '1'; app.modelLimit = 25; render(); break;
    case 'model-more': app.modelLimit = (app.modelLimit || 25) + 25; render(); break;
    case 'pick-model': {
      const id = el.dataset.id;
      if (app.modelTab === 'chat') { db.saveSettings({ modelChat: id }); TG.cloudSet('modelChat', id); }
      else { db.saveSettings({ modelVision: id, modelChat: db.settings().modelChat || id }); TG.cloudSet('modelVision', id); }
      toast('Модель выбрана'); render();
      break;
    }
    case 'reparse': {
      if (await confirmSheet('Переразобрать весь архив?',
        `${S.state.docs.length} документов пройдут через модель ${db.settings().modelVision || '—'} заново. Это займёт время и потратит токены. Правки, сделанные руками, потеряются.`, 'Переразобрать')) {
        await S.requeueAll(); go('inbox'); runQueue();
      }
      break;
    }
    case 'sex': db.saveSettings({ sex: el.dataset.v, sexSet: true }); render(); break;
    case 'theme': db.saveSettings({ theme: el.dataset.v }); render(); break;
    case 'save-profile': {
      db.saveSettings({
        birthYear: +$('#birthYear').value || 1990,
        heightCm: +$('#heightCm').value || 175,
        weightKg: +$('#weightKg').value || 75,
      });
      toast('Профиль сохранён');
      break;
    }
    case 'export': await exportAll(); break;
    case 'import': await importAll(); break;
    case 'toggle-cloud': {
      const on = !db.settings().autoCloud;
      db.saveSettings({ autoCloud: on });
      if (on) BK.scheduleCloudSave();
      toast(on ? 'Копия в облаке включена' : 'Копия в облаке выключена');
      render();
      break;
    }
    case 'cloud-save': {
      toast('Сохраняю копию…');
      const r = await BK.saveToCloud();
      toast(r.ok ? `Копия сохранена · ${Math.round(r.bytes / 1024)} КБ` : r.reason);
      render();
      break;
    }
    case 'cloud-restore': {
      const info = await BK.cloudInfo();
      if (!info) { toast('В облаке пока пусто'); break; }
      const when = new Date(info.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      if (await confirmSheet('Восстановить из облака?',
        `Копия от ${when}: ${info.docs} документов, ${info.meas} замеров. Числа вернутся, снимки — нет: они остались на прежнем устройстве. Уже имеющееся не тронется.`, 'Восстановить')) {
        toast('Восстанавливаю…');
        const r = await BK.restoreFromCloud();
        toast(r.ok ? `Вернул ${r.meas} замеров` : r.reason);
        app.aiSummary = ''; render(); refreshSummary(true);
      }
      break;
    }
    case 'cloud-forget': {
      if (await confirmSheet('Стереть копию в облаке?', 'Данные на этом устройстве останутся, но на новом телефоне восстанавливать будет нечего.', 'Стереть', true)) {
        await BK.forgetCloud(); toast('Копия стёрта'); render();
      }
      break;
    }
    case 'wipe': {
      if (await confirmSheet('Удалить всё без следа?',
        'Документы, числа, еда и настройки исчезнут с этого устройства И из копии в облаке Телеграма. Восстановить будет нельзя.', 'Удалить всё', true)) {
        // иначе на следующем запуске приложение предлагало «вернуть архив из облака»
        try { await BK.forgetCloud(); } catch {}
        await db.wipeAll();
        location.reload();
      }
      break;
    }

    case 'demo-fill': {
      toast('Заполняю пример…');
      await fillDemo();
      db.saveSettings({ onboarded: true });
      app.aiSummary = ''; app.hasDemo = true;
      go('summary');
      refreshSummary(true);
      break;
    }
    case 'demo-clear': {
      await clearDemo();
      app.hasDemo = false; app.aiSummary = '';
      toast('Демо убрано'); render();
      break;
    }

    /* знакомство */
    case 'ob-next': {
      if (app.obStep === 1) {
        db.saveSettings({
          birthYear: +$('#birthYear')?.value || 1990,
          heightCm: +$('#heightCm')?.value || 175,
          weightKg: +$('#weightKg')?.value || 75,
        });
        app.obStep = 2;
        if (!app.models) loadModels();
      } else if (app.obStep === 2) {
        app.obStep = 3;
      }
      render();
      break;
    }
    case 'ob-skip': app.obStep = 3; render(); break;
    case 'ob-done': db.saveSettings({ onboarded: true }); go('summary'); break;
  }
}

/* ── файлы ───────────────────────────────────────────────────── */

function pickFiles() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*,application/pdf'; inp.multiple = true;
  inp.onchange = async () => {
    if (!inp.files?.length) return;
    await intake([...inp.files]);
  };
  inp.click();
}

async function doScan() {
  if (await TG.canUseStreamCamera()) {
    const shots = await scan();
    if (shots?.length) { await intake(shots); return; }
    if (shots !== null) return;            // пользователь просто закрыл сканер
  }
  const one = await TG.nativeCameraFile();  // запасной путь: системная камера
  if (one) await intake([one]);
}

async function intake(files) {
  const s = db.settings();
  if (!s.onboarded) db.saveSettings({ onboarded: true });
  // пример и настоящий архив не должны стоять в одних линиях (сама чистка — в store)
  if (hasDemo()) { app.hasDemo = false; toast('Убрал демо-пример — дальше только твои документы'); }
  const hasPdf = files.some(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
  if (hasPdf) toast('Разбираю PDF на страницы…');
  const added = await S.addFiles(files, {
    onProgress: (p) => { if (p.stage === 'pdf' && p.page) toast(`${p.file}: страница ${p.page} из ${p.total}`, 1200); },
  });
  toast(`Взял ${added.length} ${plural(added.length, 'файл', 'файла', 'файлов')}`);
  go('inbox');
  runQueue();
}

let queueRunning = false;
async function runQueue() {
  if (queueRunning) return;
  const s = db.settings();
  if (!s.apiKey || !s.modelVision) {
    toast('Файлы сохранил. Чтобы их прочитать, нужен ключ — вот здесь', 3600);
    go('settings');
    return;
  }
  queueRunning = true;
  let errs = 0;
  try {
    /* Пока очередь шла, человек мог докинуть ещё файлов или нажать
       «Переразобрать» — раньше они просто повисали до следующего запуска. */
    for (let pass = 0; pass < 20; pass++) {
      await S.processQueue(() => { if (['inbox', 'summary'].includes(app.route)) render(); });
      errs += S.state.queue.errors.length;
      if (!S.state.docs.some(d => d.status === 'queued')) break;
    }
  } catch (e) {
    toast(humanError(e));
  } finally {
    // без finally один сбой в отрисовке навсегда запирал очередь
    queueRunning = false;
  }
  if (db.settings().autoCloud) BK.scheduleCloudSave();
  /* Про найденные назначения говорим отдельно: человек фотографировал лист
     ради них, и они уже встали в расписание дня — это надо сказать вслух. */
  const fresh = MED.unconfirmed().length;
  if (fresh) toast(`Нашёл ${fresh} ${plural(fresh, 'назначение', 'назначения', 'назначений')} — проверь дозу и время`, 4200);
  else toast(errs ? `Готово, но ${errs} не прочитал` : 'Разобрал всё');
  await refreshSummary(true);
  render();
}

/* ── еда ─────────────────────────────────────────────────────── */

async function addMealFlow(useCamera) {
  const s = db.settings();
  if (!s.apiKey || !s.modelVision) { toast('Сначала ключ и модель в настройках'); go('settings'); return; }

  let file = null;
  if (useCamera) {
    if (await TG.canUseStreamCamera()) {
      const shots = await scan();
      file = shots?.[0] || null;
    }
    if (!file) file = await TG.nativeCameraFile();
  } else {
    file = await new Promise(res => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => res(inp.files?.[0] || null);
      inp.click();
    });
  }
  if (!file) return;

  go('food');
  const meal = await S.addMeal(file);
  render();
  if (meal.status === 'error') toast(meal.error);
  else if (meal.status === 'skipped') toast('Это не похоже на еду');
  else {
    toast(`${meal.title}: ${Math.round(meal.nutrition.kcal)} ккал`);
    if (db.settings().autoCloud) BK.scheduleCloudSave();
    foodFeedback();
  }
}

/* «Что съесть на ужин» — единственное место, где приложение говорит о еде
   вперёд, а не назад. Поэтому в запрос идёт всё, что делает совет безопасным:
   остаток дня, цель из анализов и ЗАПИСАННЫЕ АЛЛЕРГИИ. */
async function mealIdea() {
  const today = S.todayISO();
  const plan = S.mealPlan(today);
  const goal = S.foodGoal();
  const pp = PP.state();
  const next = plan.next;
  app.aiMealBusy = true; render();
  try {
    const { text } = await chat({
      model: db.settings().modelChat || db.settings().modelVision,
      temperature: 0.5, maxTokens: 380,
      messages: [
        { role: 'system', content: 'Ты подсказываешь человеку, что съесть в ближайший приём пищи. ' + VOICE_RULES },
        { role: 'user', content: [
          `Сегодня съедено ${plan.eaten} ккал из ориентира ${plan.target}. Осталось примерно ${plan.left} ккал.`,
          next ? `Ближайший приём пищи: ${next.title}, на него по рамке приходится около ${next.target} ккал.` : '',
          S.dayFoodText(today),
          goal ? `Цель по анализам: ${goal.text}.` : '',
          pp.allergies.length ? `АЛЛЕРГИИ (ничего из этого предлагать нельзя): ${pp.allergies.map(a => a.name).join(', ')}.` : '',
          pp.conditions.length ? `Хронические болезни: ${pp.conditions.map(a => a.name).join(', ')}.` : '',
          '',
          'Предложи два-три конкретных варианта блюда на этот приём пищи: обычная еда, которую можно купить или приготовить дома. У каждого — примерные калории и белок. Без добавок и БАДов. Коротко, до 60 слов.',
        ].filter(Boolean).join('\n') },
      ],
    });
    app.aiMeal = text.trim();
  } catch (e) { app.aiMeal = ''; toast(e.message); }
  app.aiMealBusy = false; render();
}

async function foodFeedback() {
  const goal = S.foodGoal();
  const today = S.todayISO();
  const text = S.dayFoodText(today);
  if (!S.mealsOn(today).length) { toast('Сегодня ещё нечего оценивать'); return; }
  try {
    app.aiFood = 'думаю…'; render();
    app.aiFood = await mealFeedback(text, goal?.text || '');
  } catch (e) { app.aiFood = ''; toast(e.message); }
  render();
}

/* ── ИИ-тексты ───────────────────────────────────────────────── */

async function refreshSummary(force = false) {
  const s = db.settings();
  if (!s.apiKey || !(s.modelChat || s.modelVision)) return;
  if (!S.markerKeys().length) return;
  if (app.aiSummary && !force) return;
  try {
    app.aiSummaryError = '';
    app.aiSummary = await summarize(S.buildContext());
  } catch (e) {
    app.aiSummaryError = e.message;
  }
  render();
}

async function explainMarker(key) {
  const series = S.seriesFor(key);
  if (!series.length) return;
  const title = series[series.length - 1].title;
  const body = series.map(p => `${p.date}: ${p.value} ${p.unit} (норма ${S.fmtRef(p)}${p.lab ? ', ' + p.lab : ''})`).join('\n');
  app.aiMarker[key] = 'думаю…'; render();
  try {
    const { text } = await chat({
      model: db.settings().modelChat || db.settings().modelVision,
      temperature: 0.3, maxTokens: 400,
      messages: [
        { role: 'system', content: 'Ты комментируешь один показатель из архива анализов человека. ' + VOICE_RULES },
        { role: 'user', content: `Показатель: ${title}\nЗамеры:\n${body}\n\nЧто видно в этой линии?` },
      ],
    });
    app.aiMarker[key] = text.trim();
  } catch (e) { app.aiMarker[key] = ''; toast(e.message); }
  render();
}

async function sendQuestion(q) {
  const question = (q || '').trim();
  if (!question) return;
  const inp = $('#askInput'); if (inp) inp.value = '';
  app.chat.push({ role: 'user', text: question });
  app.asking = true; render();
  try {
    const answer = await askArchive(question, S.buildContext(), app.chat.slice(0, -1));
    app.chat.push({ role: 'assistant', text: answer });
  } catch (e) {
    app.chat.push({ role: 'assistant', text: 'Не получилось: ' + e.message });
  }
  app.asking = false; render();
}

function doctorText() {
  const s = db.settings();
  const age = new Date().getFullYear() - (s.birthYear || 1990);
  const bad = S.markerList().filter(m => !m.stale && (m.status === 'out' || m.status === 'edge'));
  /* Список лекарств идёт первым: на приёме об этом спрашивают раньше,
     чем о цифрах, и текст в мессенджере должен отвечать на тот же вопрос,
     что и экран. */
  const taking = MED.state.meds.filter(m => ['active', 'ask'].includes(MED.statusOf(m)));
  const lines = [
    `${s.sex === 'f' ? 'Женщина' : 'Мужчина'}, ${age} лет, рост ${s.heightCm} см, вес ${s.weightKg} кг.`,
    /* Аллергии идут раньше всего остального: это первое, что должен узнать
       любой, кто будет что-то назначать. */
    ...PP.doctorLines(),
    ...(taking.length ? ['', 'Принимаю сейчас:',
      ...taking.map(m => `• ${m.name}${m.dose ? ` ${m.dose}` : ''} — ${MED.scheduleText(m)}${MED.progressOf(m).total ? `, ${MED.courseText(m)}` : ''}${m.docDate ? `, назначено ${S.ruShort(m.docDate)}` : ''}`)] : []),
    '',
    'Вне нормы сейчас:',
    ...(bad.length ? bad.map(m => `• ${m.title}: ${S.trim(m.last.value)} ${m.unit} (норма ${S.fmtRef(m.last)}), замер ${S.ruShort(m.last.date)}${m.count > 1 ? `, было ${S.trim(m.series[0].value)} в ${m.series[0].date.slice(0, 4)}` : ''}`) : ['• нет']),
    '',
    'Обследования:',
    ...S.state.docs.filter(d => d.status === 'ready' && (d.type === 'imaging' || d.conclusion)).slice(0, 5)
      .map(d => `• ${d.title} (${S.ruShort(d.date)})${d.conclusion ? ': ' + String(d.conclusion).slice(0, 140) : ''}`),
  ];
  return lines.join('\n');
}

async function doctorQuestions() {
  app.aiDoctor = 'думаю…'; render();
  try {
    const { text } = await chat({
      model: db.settings().modelChat || db.settings().modelVision,
      temperature: 0.3, maxTokens: 500,
      messages: [
        { role: 'system', content: 'Ты помогаешь человеку подготовиться к приёму врача по его архиву анализов. Только вопросы, которые стоит задать врачу. ' + VOICE_RULES },
        { role: 'user', content: S.buildContext() + '\n\nСформулируй три коротких вопроса врачу — каждый с числом и датой из данных выше. Пронумеруй.' },
      ],
    });
    app.aiDoctor = text.trim();
  } catch (e) { app.aiDoctor = ''; toast(e.message); }
  render();
}

/* ── модели ──────────────────────────────────────────────────── */

async function loadModels() {
  app.modelsLoading = true; render();
  try {
    const list = await fetchModels();
    // семейства, которые обычно уверенно читают таблицы в бланках
    const PREFERRED = ['google/gemini', 'openai/gpt', 'anthropic/claude', 'qwen/qwen', 'mistralai/pixtral', 'x-ai/grok'];
    const rank = (m) => {
      const i = PREFERRED.findIndex(p => m.id.startsWith(p));
      return i === -1 ? 99 : i;
    };
    list.sort((a, b) => {
      const av = a.inputs.includes('image') ? 0 : 1, bv = b.inputs.includes('image') ? 0 : 1;
      if (av !== bv) return av - bv;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (a.free !== b.free) return a.free ? -1 : 1;     // бесплатные впереди равных
      const ap = a.promptPrice == null ? Infinity : a.promptPrice;
      const bp = b.promptPrice == null ? Infinity : b.promptPrice;
      return ap - bp;
    });
    app.models = list;
    db.cacheModels(list);
    toast(`Загрузил ${list.length} моделей`);
  } catch (e) { toast(e.message); }
  app.modelsLoading = false; render();
}

/* ── мелкие диалоги ──────────────────────────────────────────── */

function pickDate(docId) {
  const doc = S.state.docs.find(d => d.id === docId);
  const s = sheet(`<h2>Дата документа</h2>
    <p class="sm" style="margin:8px 0 14px">Дата забора или исследования — по ней показатель встанет в линию.</p>
    <input type="date" id="dateInput" value="${doc?.fileDate || ''}" max="${S.todayISO()}">
    <button class="btn" data-ok style="margin-top:14px">Поставить</button>`);
  s.root.querySelector('[data-ok]').onclick = async () => {
    const v = s.root.querySelector('#dateInput').value;
    if (v > S.todayISO()) { toast('Дата из будущего — так не бывает'); return; }
    if (v) { await S.setDocDate(docId, v); toast('Дата поставлена'); }
    s.close(); render();
  };
}

/* Ручной курс и правка распознанного — одна и та же форма.
   Внутри шторки нарочно нет data-act: глобальный обработчик кликов ловит
   только экраны, а не поля ввода. */
function medSheet(id) {
  const m = id ? MED.state.meds.find(x => x.id === id) : null;
  const picked = new Set(m?.slots || []);
  let food = m?.food || null;

  const slotChips = () => MED.SLOTS.map(s =>
    `<button class="chip ${picked.has(s.id) ? 'sel' : ''}" data-slot-pick="${s.id}">${s.title}</button>`).join('');
  const foodChips = () => [['before', 'До еды'], ['with', 'Во время'], ['after', 'После еды'], ['', 'Не важно']].map(([v, t]) =>
    `<button class="chip ${(food || '') === v ? 'sel' : ''}" data-food-pick="${v}">${t}</button>`).join('');

  const s = sheet(`
    <h2>${m ? 'Курс лечения' : 'Новое лекарство'}</h2>
    <p class="sm" style="margin:8px 0 16px;line-height:1.5">Пиши ровно так, как назначил врач. Приложение ничего не подставляет само.</p>
    <label class="lab">Название</label>
    <input type="text" id="mName" value="${esc(m?.name || '')}" placeholder="Например, Аторвастатин" autocomplete="off">
    <div class="row" style="gap:10px;margin-top:12px">
      <div class="grow"><label class="lab">Разовая доза</label><input type="text" id="mDose" value="${esc(m?.dose || '')}" placeholder="10 мг"></div>
      <div class="grow"><label class="lab">Сколько дней</label><input type="number" id="mDays" value="${m?.durationDays || ''}" placeholder="без срока" min="1" max="3650"></div>
    </div>
    <label class="lab" style="margin-top:14px">Когда принимать</label>
    <div class="chips" id="mSlots">${slotChips()}</div>
    <label class="lab" style="margin-top:14px">Еда</label>
    <div class="chips" id="mFood">${foodChips()}</div>
    <label class="lab" style="margin-top:14px">Начало курса</label>
    <input type="date" id="mStart" value="${m?.startDate || S.todayISO()}">
    <label class="lab" style="margin-top:14px">Как принимать (необязательно)</label>
    <input type="text" id="mNote" value="${esc(m?.instructions || '')}" placeholder="запивать водой">
    <button class="btn" data-save style="margin-top:16px">${m ? 'Сохранить' : 'Добавить'}</button>
    <div class="disc">Курс на 10 дней закончится сам — я перестану напоминать и оставлю его в истории.</div>`);

  s.root.querySelector('#mSlots').onclick = (e) => {
    const b = e.target.closest('[data-slot-pick]'); if (!b) return;
    const v = b.dataset.slotPick;
    picked.has(v) ? picked.delete(v) : picked.add(v);
    s.root.querySelector('#mSlots').innerHTML = slotChips();
  };
  s.root.querySelector('#mFood').onclick = (e) => {
    const b = e.target.closest('[data-food-pick]'); if (!b) return;
    food = b.dataset.foodPick || null;
    s.root.querySelector('#mFood').innerHTML = foodChips();
  };
  s.root.querySelector('[data-save]').onclick = async () => {
    const name = s.root.querySelector('#mName').value.trim();
    if (!name) { toast('Без названия не сохраню'); return; }
    const days = parseInt(s.root.querySelector('#mDays').value, 10);
    const start = s.root.querySelector('#mStart').value || S.todayISO();
    const saved = await MED.saveMed({
      id: m?.id,
      name,
      dose: s.root.querySelector('#mDose').value.trim() || null,
      slots: [...picked],
      durationDays: isFinite(days) && days > 0 ? days : null,
      endDate: isFinite(days) && days > 0 ? null : (m?.endDate || null),
      startDate: start,
      food,
      instructions: s.root.querySelector('#mNote').value.trim() || null,
      confirmed: true,          // человек написал это своими руками
      askedOk: true,
    });
    s.close();
    toast(m ? 'Сохранил' : `Добавил: ${saved.name}`);
    if (!m) { app.route = 'med'; app.param = { id: saved.id }; app.stack.push({ route: 'meds', param: {} }); }
    render();
    if (db.settings().autoCloud) BK.scheduleCloudSave();
  };
}

/* Запись в паспорт здоровья. Никаких подсказок-автодополнений: приложение
   не должно подсовывать человеку диагнозы, которых он не называл. */
function passportSheet(kind) {
  const def = PP.KINDS[kind];
  const s = sheet(`<h2>Добавить ${def.one}</h2>
    <p class="sm" style="margin:8px 0 16px;line-height:1.5">${def.hint}. Пиши как есть — своими словами.</p>
    <label class="lab">Название</label>
    <input type="text" id="ppName" placeholder="${kind === 'allergies' ? 'Пенициллин' : kind === 'conditions' ? 'Гипертония' : 'Аппендэктомия'}" autocomplete="off">
    <label class="lab" style="margin-top:14px">${kind === 'allergies' ? 'Что происходит (необязательно)' : kind === 'surgeries' ? 'Когда (необязательно)' : 'Уточнение (необязательно)'}</label>
    <input type="text" id="ppNote" placeholder="${kind === 'allergies' ? 'сыпь, отёк' : kind === 'surgeries' ? '2019' : 'с 2020 года'}" autocomplete="off">
    <button class="btn" data-save style="margin-top:16px">Добавить</button>
    ${kind === 'allergies' ? `<div class="disc">Аллергии сверяются с назначениями: если врач выпишет лекарство из той же группы, приложение попросит переспросить. Оно ничего не отменяет.</div>` : ''}`);
  s.root.querySelector('[data-save]').onclick = async () => {
    const name = s.root.querySelector('#ppName').value.trim();
    if (!name) { toast('Без названия не сохраню'); return; }
    await PP.addItem(kind, name, s.root.querySelector('#ppNote').value);
    s.close(); render(); toast('Записал');
    if (db.settings().autoCloud) BK.scheduleCloudSave();
  };
}

/* Что добавляем? Раньше «плюс» молча означал «документ», и снять еду можно
   было, только случайно забредя на её экран. Теперь одна дверь на всё. */
function addAnySheet() {
  const row = (act, ic, title, sub) => `<div class="gi" data-pick="${act}">${icon(ic, 'ico s')}
    <div class="t"><div class="nm" style="font-size:14.5px">${title}</div><div class="sm">${sub}</div></div></div>`;
  const s = sheet(`<h2>Что добавим?</h2>
    <div class="grp" style="margin-top:14px">
      ${row('scan', 'camera', 'Снять бланк камерой', 'анализ, назначение, заключение')}
      ${row('file', 'file', 'Загрузить файл или PDF', 'из галереи или выписку из лаборатории')}
      ${row('meal', 'forkknife', 'Снять тарелку', 'калории, белки-жиры-углеводы')}
    </div>`);
  s.root.onclick = async (e) => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    s.close();
    if (b.dataset.pick === 'scan') await doScan();
    else if (b.dataset.pick === 'file') pickFiles();
    else await addMealFlow(true);
  };
}

async function exportAll() {
  toast('Собираю копию со снимками…');
  const { blob, name, size } = await BK.exportFile({ withImages: true });
  const url = URL.createObjectURL(blob);
  if (!TG.downloadViaTelegram(url, name)) {
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
  }
  toast(`Копия готова · ${(size / 1048576).toFixed(1)} МБ`);
}

async function importAll() {
  const file = await new Promise(res => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = () => res(inp.files?.[0] || null);
    inp.click();
  });
  if (!file) return;
  toast('Читаю копию…');
  const r = await BK.importFile(file);
  if (!r.ok) { toast(r.reason); return; }
  toast(`Вернул ${r.meas} замеров${r.withImages ? ' со снимками' : ''}`);
  app.aiSummary = ''; render(); refreshSummary(true);
}

/* ── старт ───────────────────────────────────────────────────── */

(async function start() {
  // скрипт Телеграма изредка приезжает позже нас — пробуем несколько раз
  const bootTelegram = () => TG.initTelegram({ onBack: () => back(), onThemeChange: () => render() });
  bootTelegram();
  if (!TG.inTelegram()) {
    for (const delay of [300, 900]) {
      setTimeout(() => { if (TG.inTelegram()) { bootTelegram(); render(); } }, delay);
    }
  }

  /* Без хранилища приложение бессмысленно — молчать об этом нельзя.
     Так бывает в приватном режиме браузера и при жёстких настройках приватности. */
  try {
    await db.open();
  } catch (e) {
    document.querySelector('#view').innerHTML = `
      <div class="empty"><div class="t">Не могу открыть хранилище</div>
        <div class="d">Браузер не даёт сохранять данные на этом устройстве — так бывает в режиме инкогнито
        и при полном запрете хранилища для сайтов. Архив анализов без него вести нельзя.<br><br>
        Открой BioLens в обычном окне или разреши сайту хранить данные.</div></div>`;
    return;
  }
  db.requestPersistence();   // просим не вытеснять архив при нехватке места
  await S.loadAll();

  // ключ и модель могли остаться в облаке Телеграма с прошлого устройства
  if (TG.inTelegram()) {
    const s0 = db.settings();
    const [ck, cv, cc] = await Promise.all([TG.cloudGet('apiKey'), TG.cloudGet('modelVision'), TG.cloudGet('modelChat')]);
    const patch = {};
    if (!s0.apiKey && ck) patch.apiKey = ck;
    if (!s0.modelVision && cv) patch.modelVision = cv;
    if (!s0.modelChat && cc) patch.modelChat = cc;
    if (Object.keys(patch).length) { db.saveSettings(patch); }
  }
  app.models = db.cachedModels();
  app.hasDemo = hasDemo();
  render();
  watchDock();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(db.settings().theme));

  // новое устройство: локально пусто, а в облаке лежит копия
  if (TG.inTelegram() && !S.state.docs.length) {
    const info = await BK.cloudInfo();
    if (info?.meas) {
      const when = new Date(info.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long' });
      if (await confirmSheet('Нашёл твой архив в облаке',
        `Копия от ${when}: ${info.docs} документов и ${info.meas} замеров. Вернуть их на это устройство? Снимки останутся на прежнем — вернутся только числа.`, 'Вернуть')) {
        const r = await BK.restoreFromCloud();
        if (r.ok) { db.saveSettings({ onboarded: true }); toast(`Вернул ${r.meas} замеров`); }
      }
    }
  }

  // если что-то осталось в очереди с прошлого раза — доразберём
  if (S.state.docs.some(d => ['queued', 'reading'].includes(d.status))) {
    S.state.docs.forEach(d => { if (d.status === 'reading') d.status = 'queued'; });
    runQueue();
  } else {
    refreshSummary();
  }

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    /* Новая версия приходит целиком: как только новый обработчик взял управление,
       перезагружаемся один раз, чтобы не работать половиной старой сборки. */
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
  }
})();
