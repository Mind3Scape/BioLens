/* Слой общения с OpenRouter. Ключ — твой, лежит в этом браузере.
   Здесь же промпты: разбор бланка, разбор тарелки, вопрос по архиву. */

import { settings, cachedModels } from './db.js';

const BASE = 'https://openrouter.ai/api/v1';

function headers(key) {
  return {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': location.origin || 'https://biolens.local',
    'X-Title': 'BioLens',
  };
}

export async function fetchModels() {
  const r = await fetch(`${BASE}/models`);
  if (!r.ok) throw new Error('Не удалось получить список моделей (' + r.status + ')');
  const j = await r.json();
  return (j.data || []).map(m => ({
    id: m.id,
    name: m.name || m.id,
    ctx: m.context_length || 0,
    inputs: m.architecture?.input_modalities || [],
    promptPrice: price(m.pricing?.prompt),
    completionPrice: price(m.pricing?.completion),
    imagePrice: price(m.pricing?.image),
    variablePrice: Number(m.pricing?.prompt) < 0,
    free: price(m.pricing?.prompt) === 0 && price(m.pricing?.completion) === 0,
    reasoning: m.reasoning || null,          // обязана ли модель думать перед ответом
    maxOut: m.top_provider?.max_completion_tokens || 0,
  }));
}

/* у роутеров цена отрицательная — это «зависит от выбранной модели», а не скидка */
function price(v) { const n = Number(v || 0); return n < 0 ? null : n; }

export function seesImages(model) {
  return (model.inputs || []).includes('image');
}

export async function checkKey(key) {
  const r = await fetch(`${BASE}/key`, { headers: headers(key) });
  if (!r.ok) throw new Error(r.status === 401 ? 'Ключ не принят' : 'Ошибка проверки ключа (' + r.status + ')');
  const j = await r.json();
  const d = j.data || {};
  return {
    label: d.label || 'ключ активен',
    limit: d.limit,
    usage: d.usage,
    freeTier: d.is_free_tier,
  };
}

/* Единая точка запроса. Возвращает текст ответа.
   Если модель не умеет response_format — тихо повторяем без него. */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* Ни один запрос не имеет права висеть вечно: зависшая страница останавливала
   всю очередь разбора без единого сообщения на экране. */
const TIMEOUT = 120000;
const TIMEOUT_THINKING = 240000;   // думающая модель молчит дольше — но не вечно

/* ── модели, которые обязаны рассуждать ──────────────────────
   Такая модель сначала думает «про себя», и токены размышления идут из того же
   лимита, что и ответ. По умолчанию она думает на полную: бланк на шестьдесят
   строк успевал упереться в лимит ещё до первой строки таблицы, а человек
   смотрел на «ответ оборвался». Поэтому просим думать коротко, размышление в
   ответ не тянем и даём запас токенов сверх самого ответа. */
const THINKS_ANYWAY = ['stealth/ox-alpha'];
const THINK_ROOM = 8000;

function thinksBeforeAnswer(id) {
  if (THINKS_ANYWAY.includes(id)) return true;
  const m = (cachedModels() || []).find(x => x.id === id);
  return !!(m?.reasoning?.mandatory || m?.reasoning?.default_enabled);
}

async function post(body, key, signal, timeout = TIMEOUT) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  const onAbort = () => ac.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    return await fetch(`${BASE}/chat/completions`, {
      method: 'POST', headers: headers(key), body: JSON.stringify(body), signal: ac.signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError' && !signal?.aborted) {
      throw new Error(`Модель не ответила за ${Math.round(timeout / 60000)} мин — попробуй ещё раз или выбери другую`);
    }
    throw new Error('Нет связи с OpenRouter — проверь интернет');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function chat({ messages, model, schema = null, temperature = 0.2, maxTokens = 3000, signal, tries = 3 }) {
  const s = settings();
  const key = s.apiKey;
  if (!key) throw new Error('Сначала вставь ключ OpenRouter в настройках');
  if (!model) throw new Error('Не выбрана модель');

  const thinks = thinksBeforeAnswer(model);
  const body = { model, messages, temperature, max_tokens: thinks ? maxTokens + THINK_ROOM : maxTokens };
  if (thinks) body.reasoning = { effort: 'low', exclude: true };
  if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'result', strict: true, schema } };
  const timeout = thinks ? TIMEOUT_THINKING : TIMEOUT;

  let r = await post(body, key, signal, timeout);

  // бесплатные модели часто просят подождать — подождём и попробуем ещё, это дешевле, чем терять страницу
  for (let attempt = 1; attempt < tries && (r.status === 429 || r.status >= 500); attempt++) {
    const wait = r.status === 429 ? attempt * 4000 : attempt * 1500;
    await sleep(wait);
    r = await post(body, key, signal, timeout);
  }

  if (!r.ok && schema) {
    const txt = await r.text();
    if (/response_format|json_schema|structured/i.test(txt)) {
      delete body.response_format;
      body.messages = withJsonNudge(messages);
      r = await post(body, key, signal, timeout);
    } else {
      throw new Error(apiError(r.status, txt));
    }
  }
  if (!r.ok) throw new Error(apiError(r.status, await r.text()));

  const j = await r.json();
  const choice = j.choices?.[0];
  const msg = choice?.message;
  const text = typeof msg?.content === 'string'
    ? msg.content
    : (Array.isArray(msg?.content) ? msg.content.map(p => p.text || '').join('') : '');

  /* Ответ, обрезанный по лимиту токенов, — это половина таблицы бланка.
     Раньше он падал безымянной ошибкой разбора JSON. */
  if (choice?.finish_reason === 'length') {
    throw new Error('Ответ модели оборвался на середине — в бланке слишком много строк. Сними его двумя кадрами или возьми модель помощнее.');
  }
  if (!text.trim()) throw new Error('Модель вернула пустой ответ');
  return { text, usage: j.usage || null, modelUsed: j.model || model };
}

function withJsonNudge(messages) {
  const copy = messages.map(m => ({ ...m }));
  copy.unshift({ role: 'system', content: 'Отвечай ТОЛЬКО валидным JSON без markdown-обёртки и без пояснений.' });
  return copy;
}

function apiError(status, txt) {
  let detail = txt;
  try { detail = JSON.parse(txt)?.error?.message || txt; } catch {}
  if (status === 401) return 'Ключ OpenRouter не принят. Проверь его в настройках.';
  if (status === 402) return 'На счету OpenRouter не хватает средств.';
  if (status === 429) return 'Слишком часто — модель просит подождать.';
  if (status === 404) return 'Такой модели нет. Обнови список в настройках.';
  return `OpenRouter: ${detail || status}`;
}

export function parseJson(text) {
  if (!text) throw new Error('Пустой ответ модели');
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf('{'), last = t.lastIndexOf('}');
  if (first > 0 || last < t.length - 1) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

/* ── разбор медицинского документа ──────────────────────────── */

const DOC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_medical', 'doc_type', 'title', 'date', 'date_confidence', 'lab', 'patient_name', 'markers', 'meds', 'conclusion', 'note'],
  properties: {
    is_medical: { type: 'boolean' },
    doc_type: { type: 'string', enum: ['blood', 'urine', 'imaging', 'conclusion', 'prescription', 'vaccination', 'other'] },
    title: { type: 'string' },
    date: { type: ['string', 'null'] },
    date_confidence: { type: 'number' },
    lab: { type: ['string', 'null'] },
    patient_name: { type: ['string', 'null'] },
    conclusion: { type: ['string', 'null'] },
    note: { type: ['string', 'null'] },
    markers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'value', 'unit', 'ref_low', 'ref_high', 'confidence'],
        properties: {
          name: { type: 'string' },
          value: { type: ['number', 'null'] },
          unit: { type: ['string', 'null'] },
          ref_low: { type: ['number', 'null'] },
          ref_high: { type: ['number', 'null'] },
          confidence: { type: 'number' },
        },
      },
    },
    /* Назначения. Схема нарочно подробная: чем меньше модель домысливает,
       тем меньше шансов, что человек примет не то и не тогда. */
    meds: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'dose', 'form', 'per_day', 'times_of_day', 'every_n_days', 'frequency_text', 'duration_days', 'end_date', 'food', 'instructions', 'confidence'],
        properties: {
          name: { type: 'string' },
          dose: { type: ['string', 'null'] },
          form: { type: ['string', 'null'] },
          per_day: { type: ['number', 'null'] },
          times_of_day: { type: 'array', items: { type: 'string', enum: ['morning', 'day', 'evening', 'night'] } },
          every_n_days: { type: ['number', 'null'] },
          frequency_text: { type: ['string', 'null'] },
          duration_days: { type: ['number', 'null'] },
          end_date: { type: ['string', 'null'] },
          food: { type: ['string', 'null'] },
          instructions: { type: ['string', 'null'] },
          confidence: { type: 'number' },
        },
      },
    },
  },
};

const DOC_PROMPT = `Ты разбираешь фотографию или скриншот медицинского документа.

Верни JSON строго по схеме:
- is_medical: false, если это не медицинский документ (переписка, чек, случайное фото). Тогда остальные поля пустые.
- doc_type: blood (анализ крови), urine, imaging (флюорография, УЗИ, рентген, МРТ), conclusion (заключение врача, выписка), prescription (рецепт, лист назначений, схема лечения), vaccination, other.
- title: короткое человеческое название на русском, например «Кровь, биохимия» или «УЗИ брюшной полости».
- date: дата ЗАБОРА или исследования в формате YYYY-MM-DD. Если виден только год — YYYY-01-01. Если даты нет вообще — null.
- date_confidence: 0..1, насколько ты уверен в дате.
- lab: название лаборатории или клиники, если видно.
- patient_name: имя пациента, если видно (нужно, чтобы не смешать архивы разных людей).
- markers: ВСЕ числовые показатели из таблицы. name — точно как в бланке. value — число (десятичный разделитель — точка). unit — единица как в бланке. ref_low/ref_high — границы нормы ИЗ ЭТОГО БЛАНКА, если они там есть, иначе null.
- confidence у каждого показателя: 1.0 — прочитано уверенно; 0.5 и ниже — цифра смазана, есть сомнение между вариантами (например 5.1 и 51).
- meds: НАЗНАЧЕННЫЕ ЛЕКАРСТВА — всё, что в этом документе врач велел принимать. Они встречаются не только в рецепте: в выписке, в заключении приёма, в схеме лечения. Если назначений нет — пустой массив.
- conclusion: текст заключения или вывода, если он есть (для снимков и приёмов врача).
- note: коротко, если что-то мешает чтению (обрезан край, блик, плохой фокус).

Поля каждого лекарства:
- name: название ровно как написано (торговое или действующее вещество). Не переводи, не заменяй аналогом, не исправляй.
- dose: разовая доза с единицей, как написано: «10 мг», «1 таблетка», «5 капель», «2 ЕД».
- form: таблетка, капсула, капли, спрей, инъекция, мазь — если указано.
- per_day: сколько РАЗ В СУТКИ принимать. «1 раз в день» → 1, «дважды в день» → 2, «каждые 8 часов» → 3.
- times_of_day: только если время указано словами — morning (утро), day (день, обед), evening (вечер), night (на ночь, перед сном). Если время не написано — пустой массив, не угадывай.
- every_n_days: 1 для ежедневного приёма; 2 — если «через день»; 7 — если «раз в неделю».
- frequency_text: как частота написана в документе, дословно и коротко.
- duration_days: сколько ДНЕЙ принимать. «10 дней» → 10, «2 недели» → 14, «1 месяц» → 30, «3 месяца» → 90. «Постоянно», «длительно», «пожизненно» и отсутствие срока → null.
- end_date: YYYY-MM-DD, только если дата окончания написана прямо.
- food: «до еды», «во время еды», «после еды», «натощак» — как написано, иначе null.
- instructions: одна короткая фраза с остальным важным (запивать водой, под язык, не совмещать с молоком) — только если это написано в документе.
- confidence у лекарства: 1.0 — прочитано уверенно; 0.5 и ниже — почерк или доза читаются с сомнением.

Строгие правила чтения — от них зависит, не получит ли человек выдуманное число:
- Колонка результата и колонка референсных значений стоят в таблице рядом. value бери СТРОГО из колонки результата, границы — из колонки норм.
- Не выдумывай показатели, которых не видно.
- Если число не читается — value: null и confidence: 0. Никогда не подставляй правдоподобное значение вместо нечитаемого.
- Границы нормы бери только из этого бланка. Не подставляй их по памяти: пустое поле честнее выдуманного.
- Результат вида «<0.5» или «>1000» — верни само число, а в note напиши, что в бланке стоял знак.
- Нечисловые результаты («отрицательно», «не обнаружено», «++») в markers не клади.
- Дат на бланке обычно несколько: бери дату забора или исследования, не дату печати и не дату выдачи.
- Единицы не переводи — пиши как в бланке.
- Диагнозов не ставь.

Правила для лекарств — здесь цена ошибки выше, чем в анализах:
- Ни одного лекарства сверх тех, что написаны в документе. Не добавляй «обычно к этому назначают».
- Дозу, частоту и срок бери только из документа. Не написано — null. Пустое поле человек допишет сам, выдуманное он примет как правду.
- Не пересчитывай дозу и не переводи в другие единицы.
- Отменённые и зачёркнутые назначения не бери.
- Списки «противопоказано», «отменить», «непереносимость» — это НЕ назначения, в meds их не клади.
- Если в документе назначений нет — meds: [], и ничего не выдумывай.
Если is_medical: false — title: "", markers: [], meds: [], остальные поля null.`;

export async function analyzeDocument(dataUrl, { model, signal } = {}) {
  const s = settings();
  const use = model || s.modelVision;
  const { text, usage, modelUsed } = await chat({
    model: use,
    schema: DOC_SCHEMA,
    temperature: 0,
    maxTokens: 12000,   // плотный бланк — это 60+ строк таблицы, на 4000 ответ обрывался
    signal,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: DOC_PROMPT },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    }],
  });
  return { data: parseJson(text), usage, modelUsed };
}

/* ── разбор тарелки ─────────────────────────────────────────── */

const MEAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_food', 'title', 'items', 'kcal', 'protein_g', 'fat_g', 'sat_fat_g', 'carbs_g', 'sugar_g', 'fiber_g', 'cholesterol_mg', 'sodium_mg', 'micros', 'confidence', 'note'],
  properties: {
    is_food: { type: 'boolean' },
    title: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'grams'],
        properties: { name: { type: 'string' }, grams: { type: 'number' } },
      },
    },
    kcal: { type: 'number' }, protein_g: { type: 'number' }, fat_g: { type: 'number' },
    sat_fat_g: { type: 'number' }, carbs_g: { type: 'number' }, sugar_g: { type: 'number' },
    fiber_g: { type: 'number' }, cholesterol_mg: { type: 'number' }, sodium_mg: { type: 'number' },
    micros: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'amount', 'unit', 'pct_dv'],
        properties: { name: { type: 'string' }, amount: { type: 'number' }, unit: { type: 'string' }, pct_dv: { type: 'number' } },
      },
    },
    confidence: { type: 'number' },
    note: { type: ['string', 'null'] },
  },
};

/* goalHint сюда НЕ передаётся намеренно: модель, которой сообщили желаемый ответ,
   подгоняет под него оценку жиров и калорий. Совет по цели даёт mealFeedback —
   отдельным вызовом и уже по посчитанным числам. */
export async function analyzeMeal(dataUrl, { model, signal } = {}) {
  const s = settings();
  const use = model || s.modelVision;
  const prompt = `Ты оцениваешь блюдо на фотографии.

Верни JSON строго по схеме:
- is_food: false, если на фото не еда.
- title: короткое название блюда по-русски.
- items: что видно на тарелке, с оценкой веса в граммах.
- kcal, protein_g, fat_g, sat_fat_g, carbs_g, sugar_g, fiber_g, cholesterol_mg, sodium_mg — на всю порцию, целыми или с одним знаком.
- micros: 3–6 самых заметных микроэлементов и витаминов (название по-русски, количество, единица, процент от суточной нормы). Это прикидка по составу блюда, а не измерение: по фотографии содержание микроэлементов увидеть нельзя. Если блюдо непонятное — оставь пустым.
- confidence: 0..1 — насколько уверенно оценён вес порции.
- note: одна короткая фраза, если что-то мешает оценке (не видно соуса, непонятен размер порции).

Оценивай по виду порции, честно. Лучше средняя оценка, чем выдуманная точность.`;

  const { text, usage, modelUsed } = await chat({
    model: use, schema: MEAL_SCHEMA, temperature: 0.1, maxTokens: 2000, signal,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }],
  });
  return { data: parseJson(text), usage, modelUsed };
}

/* ── тексты: сводка, ответ на вопрос, оценка дня по еде ─────── */

export const VOICE_RULES = `Правила языка, обязательные к соблюдению:
1. Называй только те числа и даты, которые есть в данных ниже. Нет числа — не утверждай.
2. Максимум два предложения.
3. Ссылайся на дату документа, если делаешь вывод.
4. Никаких диагнозов, названий болезней и назначений лечения — даже как предположения. Можно сказать «стоит обсудить с врачом».
5. Не советуй добавки, витамины, диеты и тем более отмену лекарств.
6. Если данных мало — так и скажи, не придумывай тенденцию.
7. Разницу меньше 10% изменением не называй. Замеры одного дня и замеры из разных лабораторий динамикой не считай.
8. Спокойный тон. Не пугай, не подгоняй, без восклицательных знаков.
9. Лекарства из списка назначены врачом. Не предлагай менять дозу, время приёма, отменять их или добавлять новые — даже если показатель выглядит связанным с лекарством. Всё, что можно: заметить факт и сказать «это вопрос к врачу».
Пиши по-русски, на «ты».`;

export async function summarize(contextText, { model, signal } = {}) {
  const s = settings();
  const { text } = await chat({
    model: model || s.modelChat || s.modelVision, temperature: 0.3, maxTokens: 500, signal,
    messages: [
      { role: 'system', content: 'Ты — часть приложения «BioLens», которое хранит анализы человека. ' + VOICE_RULES },
      { role: 'user', content: `Вот выжимка архива:\n\n${contextText}\n\nНапиши блок «что изменилось»: два предложения о самом важном сдвиге за последний год. Только текст, без markdown.` },
    ],
  });
  return text.trim();
}

export async function askArchive(question, contextText, history = [], { model, signal } = {}) {
  const s = settings();
  const { text } = await chat({
    model: model || s.modelChat || s.modelVision, temperature: 0.3, maxTokens: 900, signal,
    messages: [
      { role: 'system', content: 'Ты отвечаешь на вопросы человека о его собственном архиве анализов. Отвечай только по данным ниже, не выдумывай. Если данных не хватает — скажи, каких именно. ' + VOICE_RULES + '\nЗдесь можно до четырёх предложений, если вопрос сложный.' },
      { role: 'user', content: `Данные архива:\n\n${contextText}` },
      ...history.slice(-6).map(h => ({ role: h.role, content: h.text })),
      { role: 'user', content: question },
    ],
  });
  return text.trim();
}

export async function mealFeedback(dayText, goalText, { model, signal } = {}) {
  const s = settings();
  const { text } = await chat({
    model: model || s.modelChat || s.modelVision, temperature: 0.3, maxTokens: 400, signal,
    messages: [
      { role: 'system', content: 'Ты комментируешь питание человека в связке с его анализами. ' + VOICE_RULES },
      { role: 'user', content: `Цель по анализам: ${goalText || 'явной цели нет'}\n\nЧто человек съел:\n${dayText}\n\nДай два предложения: первое — факт по цифрам за сегодня относительно цели, второе — одно конкретное, выполнимое предложение на остаток дня. Без диагнозов и без назначения лекарств.` },
    ],
  });
  return text.trim();
}
