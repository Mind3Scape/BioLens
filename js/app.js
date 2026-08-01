/* Точка входа: состояние, роутер, обработчики. */

import * as db from './db.js';
import * as S from './store.js';
import * as V from './views.js';
import { $, $$, esc, toast, sheet, confirmSheet } from './ui.js';
import { fetchModels, checkKey, summarize, askArchive, mealFeedback, chat } from './openrouter.js';
import { scan } from './scan.js';
import { fillDemo, clearDemo, hasDemo } from './demo.js';
import * as TG from './telegram.js';
import * as BK from './backup.js';

const app = {
  route: 'summary',
  param: {},
  stack: [],
  markerFilter: 'all',
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
  chat: [],
  asking: false,
  obStep: 1,
  foodDate: null,
};
window.__biolens = app;

const TABS = ['summary', 'markers', 'timeline', 'food', 'ask'];

/* ── рендер ──────────────────────────────────────────────────── */

function render() {
  const view = $('#view');
  const s = db.settings();
  applyTheme(s.theme);

  let html = '';
  if (!s.onboarded) html = V.onboarding(app);
  else if (app.route === 'summary') html = V.summary(app);
  else if (app.route === 'markers') html = V.markers(app);
  else if (app.route === 'marker') html = V.markerDetail(app);
  else if (app.route === 'timeline') html = V.timeline(app);
  else if (app.route === 'doc') html = V.docView(app);
  else if (app.route === 'inbox') html = V.inbox(app);
  else if (app.route === 'food') html = V.food(app);
  else if (app.route === 'meal') html = V.mealView(app);
  else if (app.route === 'ask') html = V.ask(app);
  else if (app.route === 'due') html = V.due(app);
  else if (app.route === 'doctor') html = V.doctor(app);
  else if (app.route === 'settings') html = V.settingsView(app);

  view.innerHTML = html;
  $('#tabbar').innerHTML = s.onboarded ? V.tabbar(app.route) : '';
  TG.setBackButton(app.stack.length > 0);
  hydrateImages(view);

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

async function hydrateImages(root) {
  for (const img of $$('img[data-blob]', root)) {
    const url = await db.getBlobUrl(img.dataset.blob);
    if (url) img.src = url;
  }
}

function go(route, param = {}) {
  if (TABS.includes(route)) app.stack = [];
  else app.stack.push({ route: app.route, param: app.param });
  app.route = route; app.param = param;
  render();
  $('#view').scrollTop = 0;
}
function back() {
  const prev = app.stack.pop();
  app.route = prev?.route || 'summary';
  app.param = prev?.param || {};
  render();
}

const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ── действия ────────────────────────────────────────────────── */

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const view = $('#view');
  TG.haptic(['wipe', 'del-doc', 'del-meal', 'reparse'].includes(act) ? 'warning' : 'light');

  switch (act) {
    case 'back': back(); break;
    case 'tab': go(el.dataset.tab); break;
    case 'settings': go('settings'); break;
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

    case 'filter': app.markerFilter = el.dataset.group; render(); break;
    case 'dfilter': app.docFilter = el.dataset.kind; render(); break;

    case 'add': pickFiles(); break;
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
    case 'sex': db.saveSettings({ sex: el.dataset.v }); render(); break;
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
      if (await confirmSheet('Удалить всё без следа?', 'Документы, числа, еда и настройки исчезнут с этого устройства. Восстановить будет нельзя.', 'Удалить всё', true)) {
        await db.wipeAll(); location.reload();
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
});

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
  const hasPdf = files.some(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
  if (hasPdf) toast('Разбираю PDF на страницы…');
  const added = await S.addFiles(files, {
    onProgress: (p) => { if (p.stage === 'pdf' && p.page) toast(`${p.file}: страница ${p.page} из ${p.total}`, 1200); },
  });
  toast(`Взял ${added.length} ${added.length === 1 ? 'файл' : 'файлов'}`);
  go('inbox');
  runQueue();
}

let queueRunning = false;
async function runQueue() {
  if (queueRunning) return;
  const s = db.settings();
  if (!s.apiKey || !s.modelVision) {
    toast('Сначала ключ и модель в настройках');
    go('settings');
    return;
  }
  queueRunning = true;
  await S.processQueue(() => { if (['inbox', 'summary'].includes(app.route)) render(); });
  queueRunning = false;
  if (db.settings().autoCloud) BK.scheduleCloudSave();
  const errs = S.state.queue.errors.length;
  toast(errs ? `Готово, но ${errs} не прочитал` : 'Разобрал всё');
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

async function foodFeedback() {
  const goal = S.foodGoal();
  const today = new Date().toISOString().slice(0, 10);
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
        { role: 'system', content: 'Ты комментируешь один показатель из архива анализов человека. Два предложения, с числами и датами, без диагнозов. По-русски, на «ты».' },
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
  const lines = [
    `${s.sex === 'f' ? 'Женщина' : 'Мужчина'}, ${age} лет, рост ${s.heightCm} см, вес ${s.weightKg} кг.`,
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
        { role: 'system', content: 'Ты помогаешь человеку подготовиться к приёму врача по его архиву анализов. Не ставь диагнозов и не предлагай лечение — только вопросы, которые стоит задать врачу. По-русски, на «ты».' },
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
    <input type="date" id="dateInput" value="${doc?.fileDate || ''}">
    <button class="btn" data-ok style="margin-top:14px">Поставить</button>`);
  s.root.querySelector('[data-ok]').onclick = async () => {
    const v = s.root.querySelector('#dateInput').value;
    if (v) { await S.setDocDate(docId, v); toast('Дата поставлена'); }
    s.close(); render();
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

  await db.open();
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
  }
})();
