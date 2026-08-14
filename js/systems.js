/* Системы организма.

   Список показателей — это алфавит. Человек же думает не «АЛТ и ГГТ», а
   «печень». Здесь мы собираем показатели в системы тела и считаем главное,
   чего не умеет плоский список: ЧТО ИЗУЧЕНО, А ЧТО НЕТ.

   Ключевые показатели (core) — это не «обязательная программа» и не
   назначение. Это то, что обычно входит в базовую проверку системы: если
   их нет ни в одном бланке, приложение честно говорит «про эту систему я
   почти ничего не знаю», вместо того чтобы молчать.

   Зависит только от markers.js — поэтому модуль можно звать откуда угодно. */

import { MARKERS, markerTitle } from './markers.js';

export const SYSTEMS = [
  {
    id: 'blood', title: 'Кровь', icon: 'drop', tint: 'wine',
    about: 'клетки крови: кислород, свёртывание, воспаление',
    groups: ['blood'],
    core: ['hemoglobin', 'erythrocytes', 'leukocytes', 'platelets', 'esr'],
  },
  {
    id: 'heart', title: 'Сердце и сосуды', icon: 'heartbeat', tint: 'indigo',
    about: 'жиры крови — то, из чего растут бляшки',
    groups: ['lipids'],
    core: ['cholesterol_total', 'ldl', 'hdl', 'triglycerides'],
  },
  {
    id: 'sugar', title: 'Сахар и обмен', icon: 'lightning', tint: 'amber',
    about: 'как тело справляется с глюкозой',
    groups: ['sugar'],
    core: ['glucose', 'hba1c'],
  },
  {
    id: 'liver', title: 'Печень', icon: 'recycle', tint: 'moss',
    about: 'фильтр организма: ферменты и белок',
    groups: ['liver'],
    core: ['alt', 'ast', 'ggt', 'bilirubin_total', 'albumin'],
  },
  {
    id: 'kidney', title: 'Почки', icon: 'waves', tint: 'cyan',
    about: 'что выводится из крови и что остаётся',
    groups: ['kidney'],
    core: ['creatinine', 'urea', 'uric_acid'],
  },
  {
    id: 'hormones', title: 'Гормоны', icon: 'sun', tint: 'violet',
    about: 'щитовидка и то, что задаёт темп',
    groups: ['hormones'],
    core: ['tsh', 't4_free'],
  },
  {
    id: 'vitamins', title: 'Витамины и железо', icon: 'leaf', tint: 'teal',
    about: 'запасы, из которых тело берёт силы',
    groups: ['vitamins', 'iron'],
    core: ['vitamin_d', 'vitamin_b12', 'ferritin', 'iron'],
  },
  {
    id: 'other', title: 'Воспаление и минералы', icon: 'fire', tint: 'slate',
    about: 'СРБ, кальций, калий и прочее из бланков',
    groups: ['other'],
    core: ['crp', 'calcium', 'potassium', 'magnesium'],
  },
];

export const systemById = (id) => SYSTEMS.find(s => s.id === id) || null;

/* В какую систему попадает показатель. Свои строки из бланка (raw:) и всё
   незнакомое идут в «Прочее» — теряться не должно ничего. */
const GROUP_TO_SYSTEM = (() => {
  const map = {};
  for (const s of SYSTEMS) for (const g of s.groups) map[g] = s.id;
  return map;
})();

export const systemOf = (group) => GROUP_TO_SYSTEM[group] || 'other';

/* Раскладка живых показателей по системам.
   list — то, что отдаёт store.markerList(). Возвращаем систему целиком:
   что измерено, чего не хватает, что вне нормы и когда мерили в последний раз. */
export function mapSystems(list) {
  const byId = Object.fromEntries(SYSTEMS.map(s => [s.id, []]));
  for (const m of list) (byId[systemOf(m.group)] ||= []).push(m);

  return SYSTEMS.map(s => {
    const markers = byId[s.id] || [];
    const have = new Set(markers.map(m => m.key));
    const missing = s.core.filter(k => !have.has(k));
    const fresh = markers.filter(m => !m.stale);
    const out = fresh.filter(m => m.status === 'out').length;
    const edge = fresh.filter(m => m.status === 'edge').length;
    const lastDate = markers.map(m => m.last?.date).filter(Boolean).sort().slice(-1)[0] || null;
    const daysOld = lastDate ? Math.round((Date.now() - Date.parse(lastDate)) / 86400000) : null;
    return {
      ...s,
      markers,
      coreHave: s.core.length - missing.length,
      coreTotal: s.core.length,
      missing,
      missingTitles: missing.map(k => markerTitle(k)),
      out, edge,
      lastDate, daysOld,
      /* Состояние системы одним словом. «Не изучена» — это не «здорова»:
         пустая система и система без отклонений выглядят по-разному. */
      state: !markers.length ? 'blank'
        : out ? 'out'
        : edge ? 'edge'
        : markers.every(m => m.stale) ? 'stale'
        : 'ok',
    };
  });
}

/* Общая изученность: сколько ключевых показателей вообще когда-либо сдавалось.
   Одно число, ради которого стоит открыть экран: «18 из 28». */
export function coverage(list) {
  const have = new Set(list.map(m => m.key));
  const all = SYSTEMS.flatMap(s => s.core);
  const known = all.filter(k => have.has(k)).length;
  const mapped = mapSystems(list);
  return {
    known, total: all.length,
    pct: all.length ? known / all.length : 0,
    systemsTouched: mapped.filter(s => s.markers.length).length,
    systemsTotal: SYSTEMS.length,
    blank: mapped.filter(s => !s.markers.length),
  };
}

export { markerTitle };
