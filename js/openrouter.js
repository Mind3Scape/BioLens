/* Слой общения с OpenRouter. Ключ — твой, лежит в этом браузере.
   Здесь же промпты: разбор бланка, разбор тарелки, вопрос по архиву. */

import { settings } from './db.js';

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

export async function chat({ messages, model, schema = null, temperature = 0.2, maxTokens = 3000, signal, tries = 3 }) {
  const s = settings();
  const key = s.apiKey;
  if (!key) throw new Error('Сначала вставь ключ OpenRouter в настройках');
  if (!model) throw new Error('Не выбрана модель');

  const body = { model, messages, temperature, max_tokens: maxTokens };
  if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'result', strict: true, schema } };

  let r = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers: headers(key), body: JSON.stringify(body), signal });

  // бесплатные модели часто просят подождать — подождём и попробуем ещё, это дешевле, чем терять страницу
  for (let attempt = 1; attempt < tries && (r.status === 429 || r.status >= 500); attempt++) {
    const wait = r.status === 429 ? attempt * 4000 : attempt * 1500;
    await sleep(wait);
    r = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers: headers(key), body: JSON.stringify(body), signal });
  }

  if (!r.ok && schema) {
    const txt = await r.text();
    if (/response_format|json_schema|structured/i.test(txt)) {
      delete body.response_format;
      body.messages = withJsonNudge(messages);
      r = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers: headers(key), body: JSON.stringify(body), signal });
    } else {
      throw new Error(apiError(r.status, txt));
    }
  }
  if (!r.ok) throw new Error(apiError(r.status, await r.text()));

  const j = await r.json();
  const msg = j.choices?.[0]?.message;
  const text = typeof msg?.content === 'string'
    ? msg.content
    : (Array.isArray(msg?.content) ? msg.content.map(p => p.text || '').join('') : '');
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
  required: ['is_medical', 'doc_type', 'title', 'date', 'date_confidence', 'lab', 'patient_name', 'markers', 'conclusion', 'note'],
  properties: {
    is_medical: { type: 'boolean' },
    doc_type: { type: 'string', enum: ['blood', 'urine', 'imaging', 'conclusion', 'vaccination', 'other'] },
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
  },
};

const DOC_PROMPT = `Ты разбираешь фотографию или скриншот медицинского документа.

Верни JSON строго по схеме:
- is_medical: false, если это не медицинский документ (переписка, чек, случайное фото). Тогда остальные поля пустые.
- doc_type: blood (анализ крови), urine, imaging (флюорография, УЗИ, рентген, МРТ), conclusion (заключение врача, выписка), vaccination, other.
- title: короткое человеческое название на русском, например «Кровь, биохимия» или «УЗИ брюшной полости».
- date: дата ЗАБОРА или исследования в формате YYYY-MM-DD. Если виден только год — YYYY-01-01. Если даты нет вообще — null.
- date_confidence: 0..1, насколько ты уверен в дате.
- lab: название лаборатории или клиники, если видно.
- patient_name: имя пациента, если видно (нужно, чтобы не смешать архивы разных людей).
- markers: ВСЕ числовые показатели из таблицы. name — точно как в бланке. value — число (десятичный разделитель — точка). unit — единица как в бланке. ref_low/ref_high — границы нормы ИЗ ЭТОГО БЛАНКА, если они там есть, иначе null.
- confidence у каждого показателя: 1.0 — прочитано уверенно; 0.5 и ниже — цифра смазана, есть сомнение между вариантами (например 5.1 и 51).
- conclusion: текст заключения или вывода, если он есть (для снимков и приёмов врача).
- note: коротко, если что-то мешает чтению (обрезан край, блик, плохой фокус).

Не выдумывай показатели, которых не видно. Не переводи единицы — пиши как в бланке. Не ставь диагнозов.`;

export async function analyzeDocument(dataUrl, { model, signal } = {}) {
  const s = settings();
  const use = model || s.modelVision;
  const { text, usage, modelUsed } = await chat({
    model: use,
    schema: DOC_SCHEMA,
    temperature: 0,
    maxTokens: 4000,
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

export async function analyzeMeal(dataUrl, { model, goalHint = '', signal } = {}) {
  const s = settings();
  const use = model || s.modelVision;
  const prompt = `Ты оцениваешь блюдо на фотографии.

Верни JSON строго по схеме:
- is_food: false, если на фото не еда.
- title: короткое название блюда по-русски.
- items: что видно на тарелке, с оценкой веса в граммах.
- kcal, protein_g, fat_g, sat_fat_g, carbs_g, sugar_g, fiber_g, cholesterol_mg, sodium_mg — на всю порцию, целыми или с одним знаком.
- micros: 3–6 самых заметных микроэлементов и витаминов (название по-русски, количество, единица, процент от суточной нормы).
- confidence: 0..1 — насколько уверенно оценён вес порции.
- note: одна короткая фраза, если что-то мешает оценке (не видно соуса, непонятен размер порции).

Оценивай по виду порции, честно. Лучше средняя оценка, чем выдуманная точность.${goalHint ? '\n\nУчитывай, что у человека сейчас важна цель: ' + goalHint : ''}`;

  const { text, usage, modelUsed } = await chat({
    model: use, schema: MEAL_SCHEMA, temperature: 0.1, maxTokens: 2000, signal,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }],
  });
  return { data: parseJson(text), usage, modelUsed };
}

/* ── тексты: сводка, ответ на вопрос, оценка дня по еде ─────── */

export const VOICE_RULES = `Правила языка, обязательные к соблюдению:
1. В каждом утверждении — конкретное число и окно времени.
2. Максимум два предложения.
3. Ссылайся на дату документа, если делаешь вывод.
4. Никаких диагнозов и назначений лечения. Можно сказать «стоит обсудить с врачом».
5. Если данных мало — так и скажи, не придумывай тенденцию.
6. Спокойный тон. Не пугай, не подгоняй, без восклицательных знаков.
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
