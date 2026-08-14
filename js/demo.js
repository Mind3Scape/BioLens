/* Демонстрационный архив: чтобы посмотреть приложение до того,
   как вставишь ключ и загрузишь свои бланки. Удаляется одной кнопкой. */

import * as db from './db.js';
import * as S from './store.js';
import * as MED from './meds.js';
import { defaultRef } from './markers.js';

const LABS = ['Инвитро', 'Гемотест', 'поликлиника №4', 'KDL'];

/* [ключ, единица, [ [дата, значение] ... ] ] */
const SERIES = [
  ['vitamin_d', 'нг/мл', [['2019-02-11', 9], ['2021-03-14', 12], ['2022-02-17', 8], ['2024-11-08', 12], ['2025-10-02', 21], ['2026-07-18', 48]]],
  ['bilirubin_total', 'мкмоль/л', [['2017-06-05', 14], ['2019-02-11', 17], ['2021-03-14', 18.2], ['2023-04-04', 19], ['2024-11-08', 24], ['2026-07-18', 27.4]]],
  ['alt', 'Ед/л', [['2019-02-11', 28], ['2021-03-14', 31], ['2023-04-04', 39], ['2024-11-08', 51], ['2026-07-18', 58]]],
  ['ldl', 'ммоль/л', [['2018-05-20', 3.9], ['2019-02-11', 3.7], ['2024-11-08', 3.2], ['2026-07-18', 2.9]]],
  ['hemoglobin', 'г/л', [['2016-03-02', 149], ['2018-05-20', 152], ['2019-02-11', 147], ['2021-03-14', 148], ['2023-04-04', 155], ['2026-07-18', 152]]],
  ['glucose', 'ммоль/л', [['2018-05-20', 5.0], ['2021-03-14', 5.1], ['2023-04-04', 5.3], ['2026-07-18', 5.1]]],
  ['ferritin', 'нг/мл', [['2021-03-14', 75], ['2024-11-08', 46], ['2026-07-18', 34]]],
  ['tsh', 'мЕд/л', [['2021-03-14', 2.1], ['2023-04-04', 2.4]]],
];

const DOCS = [
  { date: '2026-07-18', title: 'Кровь, расширенная', type: 'blood', lab: 'Гемотест' },
  { date: '2026-07-22', title: 'УЗИ брюшной полости', type: 'imaging', lab: 'Гемотест', conclusion: 'Печень обычных размеров, структура однородная, очаговых изменений не выявлено.' },
  { date: '2025-10-02', title: 'Кровь, биохимия', type: 'blood', lab: 'Инвитро' },
  { date: '2024-11-08', title: 'Кровь, биохимия', type: 'blood', lab: 'Гемотест' },
  { date: '2023-04-04', title: 'Кровь, общий анализ', type: 'blood', lab: 'поликлиника №4' },
  { date: '2022-02-17', title: 'Витамин D, 25-ОН', type: 'blood', lab: 'поликлиника №4' },
  { date: '2021-03-14', title: 'Кровь, биохимия', type: 'blood', lab: 'Инвитро' },
  { date: '2019-02-11', title: 'Кровь, биохимия', type: 'blood', lab: 'Инвитро' },
  { date: '2018-05-20', title: 'Диспансеризация', type: 'blood', lab: 'поликлиника №4' },
  { date: '2017-06-05', title: 'Кровь, биохимия', type: 'blood', lab: 'KDL' },
  { date: '2016-03-02', title: 'Кровь, общий анализ', type: 'blood', lab: 'поликлиника №4' },
  { date: '2025-05-14', title: 'Флюорография', type: 'imaging', lab: 'поликлиника №4', conclusion: 'Патологических изменений в лёгких не выявлено.' },
];

function paperSvg(title, date, lab, rows) {
  const lines = rows.map((r, i) => `
    <text x="26" y="${150 + i * 30}" font-size="15" fill="#2a2c33">${r[0]}</text>
    <text x="374" y="${150 + i * 30}" font-size="15" font-weight="700" fill="#15161b" text-anchor="end">${r[1]}</text>
    <line x1="26" y1="${160 + i * 30}" x2="374" y2="${160 + i * 30}" stroke="#e6e6e8" stroke-dasharray="2 3"/>`).join('');
  /* Лист держим портретным, как настоящая бумага: в превью архива документ
     узнают по форме страницы, а альбомный обрубок ни на что не похож. */
  const h = Math.max(533, 170 + rows.length * 30);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="${h}" viewBox="0 0 400 ${h}">
    <rect width="400" height="${h}" fill="#fbfbf9"/>
    <text x="26" y="48" font-size="17" font-weight="700" fill="#15161b">${title}</text>
    <text x="26" y="72" font-size="13" fill="#7b7d86">${lab} · ${date}</text>
    <line x1="26" y1="96" x2="374" y2="96" stroke="#15161b" stroke-width="1.5"/>
    <text x="26" y="122" font-size="11" letter-spacing="1" fill="#9a9ca3">ПОКАЗАТЕЛЬ</text>
    <text x="374" y="122" font-size="11" letter-spacing="1" fill="#9a9ca3" text-anchor="end">РЕЗУЛЬТАТ</text>
    ${lines}
  </svg>`;
}

async function svgBlob(svg) {
  return new Blob([svg], { type: 'image/svg+xml' });
}

export async function fillDemo() {
  const sex = db.settings().sex;

  for (const d of DOCS) {
    const rows = [];
    for (const [key, unit, points] of SERIES) {
      const p = points.find(x => x[0] === d.date);
      if (p) rows.push([titleOf(key), `${p[1]} ${unit}`]);
    }
    const blobId = db.uid('b');
    await db.putBlob(blobId, await svgBlob(paperSvg(d.title, d.date.split('-').reverse().join('.'), d.lab, rows.length ? rows : [['Заключение', '—']])));

    const doc = {
      id: db.uid('d'), blobId, fileName: 'демо.svg', addedAt: new Date().toISOString(),
      status: 'ready', type: d.type, title: d.title, date: d.date, dateConfidence: 1,
      lab: d.lab, conclusion: d.conclusion || null, note: null, demo: true,
      markersCount: rows.length, model: 'демо-данные',
    };
    await db.put('docs', doc);
    S.state.docs.push(doc);

    for (const [key, unit, points] of SERIES) {
      const p = points.find(x => x[0] === d.date);
      if (!p) continue;
      const ref = defaultRef(key, sex);
      const rec = {
        id: db.uid('m'), docId: doc.id, key, nameRaw: titleOf(key), title: titleOf(key),
        value: p[1], unit, rawValue: p[1], rawUnit: unit, converted: false,
        refLow: ref?.[0] ?? null, refHigh: ref?.[1] ?? null, refSource: 'бланк',
        date: d.date, lab: d.lab, confidence: 1, confirmed: true, demo: true,
      };
      await db.put('meas', rec);
      S.state.meas.push(rec);
    }
  }

  // одно сомнительное число — чтобы был виден пунктир и правка
  const doubt = S.state.meas.find(m => m.key === 'glucose' && m.date === '2021-03-14');
  if (doubt) { doubt.confidence = 0.45; doubt.confirmed = false; await db.put('meas', doubt); }

  /* Лист назначений — чтобы в примере было видно, как приём лекарств
     раскладывается по утрам и вечерам сам, с фотографии. */
  const rxStart = MED.addDays(S.todayISO(), -4);
  /* Курсов нарочно много и все разные: три раза в день, через день, только
     на ночь, «по требованию» без времени. На таком наборе сразу видно, как
     день выглядит загруженным и что происходит с лентой и неделей. */
  const RX = [
    { name: 'Урсосан', dose: '250 мг', form: 'капсула', slots: ['morning', 'evening'], durationDays: 30, food: 'after', freqText: '2 раза в день', instructions: 'запивать водой' },
    { name: 'Витамин D3', dose: '5000 МЕ', form: 'капли', slots: ['morning'], durationDays: 60, food: 'with', freqText: '1 раз в день' },
    { name: 'Омепразол', dose: '20 мг', form: 'капсула', slots: ['morning'], durationDays: 14, food: 'before', freqText: 'утром натощак' },
    { name: 'Амоксициллин', dose: '500 мг', form: 'таблетка', slots: ['morning', 'day', 'evening'], durationDays: 7, food: 'after', freqText: '3 раза в день, 7 дней' },
    { name: 'Магний B6', dose: '2 таблетки', form: 'таблетка', slots: ['day', 'night'], durationDays: 30, food: 'with', freqText: 'утром и на ночь' },
    { name: 'Аторвастатин', dose: '10 мг', form: 'таблетка', slots: ['night'], durationDays: 90, freqText: 'на ночь' },
    { name: 'Мовалис', dose: '7.5 мг', form: 'таблетка', slots: ['day'], everyNDays: 2, durationDays: 20, food: 'after', freqText: 'через день после еды' },
    { name: 'Нурофен', dose: '400 мг', form: 'таблетка', slots: [], freqText: 'при головной боли, не чаще 3 раз в сутки' },
  ];
  {
    const blobId = db.uid('b');
    await db.putBlob(blobId, await svgBlob(paperSvg('Лист назначений', rxStart.split('-').reverse().join('.'), 'приём терапевта',
      RX.map(r => [`${r.name} ${r.dose}`, `${r.freqText}, ${r.durationDays} дн.`]))));
    const doc = {
      id: db.uid('d'), blobId, fileName: 'демо-назначение.svg', addedAt: new Date().toISOString(),
      status: 'ready', type: 'prescription', title: 'Лист назначений', date: rxStart, dateConfidence: 1,
      lab: 'приём терапевта', conclusion: null, note: null, demo: true,
      markersCount: 0, medsCount: RX.length, model: 'демо-данные',
    };
    await db.put('docs', doc);
    S.state.docs.push(doc);
    for (const r of RX) {
      const med = await MED.saveMed({ ...r, docId: doc.id, startDate: rxStart, source: 'ai', confirmed: false, confidence: 0.9, demo: true });
      // в примере часть приёмов уже отмечена — иначе не видно, как это выглядит
      for (let back = 4; back >= 1; back--) {
        const day = MED.addDays(S.todayISO(), -back);
        for (const slot of med.slots) {
          if (back === 2 && slot === 'evening') continue;      // один честный пропуск
          await MED.mark(med.id, day, slot, 'taken');
        }
      }
    }
  }

  // пара блюд за сегодня
  const today = S.todayISO();
  const meals = [
    { title: 'Овсянка с ягодами и орехами', kcal: 420, protein_g: 12, fat_g: 14, sat_fat_g: 2.1, carbs_g: 58, sugar_g: 12, fiber_g: 9, cholesterol_mg: 0, sodium_mg: 140,
      items: [{ name: 'овсянка', grams: 220 }, { name: 'черника', grams: 60 }, { name: 'грецкий орех', grams: 20 }],
      micros: [{ name: 'Магний', amount: 96, unit: 'мг', pct_dv: 24 }, { name: 'Железо', amount: 3.1, unit: 'мг', pct_dv: 17 }] },
    { title: 'Курица с гречкой и салатом', kcal: 610, protein_g: 45, fat_g: 18, sat_fat_g: 4.6, carbs_g: 62, sugar_g: 5, fiber_g: 8, cholesterol_mg: 105, sodium_mg: 620,
      items: [{ name: 'куриная грудка', grams: 180 }, { name: 'гречка', grams: 200 }, { name: 'салат с маслом', grams: 120 }],
      micros: [{ name: 'Витамин B6', amount: 1.1, unit: 'мг', pct_dv: 65 }, { name: 'Калий', amount: 980, unit: 'мг', pct_dv: 21 }] },
    { title: 'Творог с мёдом', kcal: 240, protein_g: 26, fat_g: 8, sat_fat_g: 5.0, carbs_g: 16, sugar_g: 14, fiber_g: 0, cholesterol_mg: 30, sodium_mg: 90,
      items: [{ name: 'творог 5%', grams: 180 }, { name: 'мёд', grams: 15 }],
      micros: [{ name: 'Кальций', amount: 210, unit: 'мг', pct_dv: 21 }] },
  ];
  /* Час у блюда настоящий: завтрак утром, обед днём — иначе оба падают
     в один приём пищи и раскладка дня выглядит сломанной. */
  const atHour = (h) => { const d = new Date(); d.setHours(h, 20, 0, 0); return d.toISOString(); };
  const hours = [8, 13, 15];   // завтрак, обед и перекус — ужин в примере ещё впереди
  for (const [i, m] of meals.entries()) {
    const blobId = db.uid('b');
    await db.putBlob(blobId, await svgBlob(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#efeee9"/><circle cx="150" cy="150" r="96" fill="#fff"/><circle cx="150" cy="150" r="62" fill="#e8e2d2"/><text x="150" y="285" font-size="13" fill="#8d909a" text-anchor="middle" font-family="sans-serif">демо-фото</text></svg>`));
    const meal = {
      id: db.uid('f'), blobId, at: atHour(hours[i] || 21), date: today, status: 'ready',
      title: m.title, items: m.items, micros: m.micros, confidence: 0.7, demo: true,
      nutrition: { kcal: m.kcal, protein_g: m.protein_g, fat_g: m.fat_g, sat_fat_g: m.sat_fat_g, carbs_g: m.carbs_g, sugar_g: m.sugar_g, fiber_g: m.fiber_g, cholesterol_mg: m.cholesterol_mg, sodium_mg: m.sodium_mg },
    };
    await db.put('meals', meal);
    S.state.meals.push(meal);
  }

  await S.loadAll();
}

export async function clearDemo() {
  for (const d of S.state.docs.filter(x => x.demo)) await S.deleteDoc(d.id);
  for (const m of S.state.meals.filter(x => x.demo)) await S.deleteMeal(m.id);
  await S.loadAll();
}

export const hasDemo = () => S.state.docs.some(d => d.demo);

function titleOf(key) {
  return {
    vitamin_d: 'Витамин D, 25-ОН', bilirubin_total: 'Билирубин общий', alt: 'АЛТ', ldl: 'Холестерин ЛПНП',
    hemoglobin: 'Гемоглобин', glucose: 'Глюкоза', ferritin: 'Ферритин', tsh: 'ТТГ',
  }[key] || key;
}
