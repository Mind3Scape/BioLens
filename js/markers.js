/* Словарь показателей: канонические ключи, синонимы, единицы и пересчёт.
   Смысл файла — превратить «Fe, сыв.», «ALT», «25(OH)D» из разных бланков
   в одну линию, а нмоль/л и нг/мл — в одно число. */

export const GROUPS = {
  blood:   'Кровь',
  liver:   'Печень',
  lipids:  'Липиды',
  iron:    'Железо',
  hormones:'Гормоны',
  vitamins:'Витамины',
  kidney:  'Почки',
  sugar:   'Сахар',
  other:   'Прочее',
};

/* unit: канон. conv: { 'единица из бланка': коэффициент к канону }
   ref: типовая норма взрослого — используется, ТОЛЬКО если её нет в бланке.
   refBySex: { m:[low,high], f:[low,high] } */
export const MARKERS = {
  hemoglobin: { t:'Гемоглобин', g:'blood', unit:'г/л', conv:{'g/l':1,'г/л':1,'g/dl':10,'г/дл':10},
    refBySex:{m:[132,173],f:[117,155]}, syn:['гемоглобин','hgb','hb','haemoglobin','hemoglobin'] },
  erythrocytes: { t:'Эритроциты', g:'blood', unit:'10¹²/л', conv:{}, refBySex:{m:[4.3,5.7],f:[3.8,5.1]},
    syn:['эритроциты','rbc'] },
  leukocytes: { t:'Лейкоциты', g:'blood', unit:'10⁹/л', conv:{}, ref:[4,9], syn:['лейкоциты','wbc'] },
  platelets: { t:'Тромбоциты', g:'blood', unit:'10⁹/л', conv:{}, ref:[150,400], syn:['тромбоциты','plt'] },
  esr: { t:'СОЭ', g:'blood', unit:'мм/ч', conv:{}, refBySex:{m:[0,15],f:[0,20]}, syn:['соэ','esr','скорость оседания'] },

  glucose: { t:'Глюкоза', g:'sugar', unit:'ммоль/л', conv:{'mmol/l':1,'ммоль/л':1,'mg/dl':1/18.0182,'мг/дл':1/18.0182},
    ref:[4.1,5.9], syn:['глюкоза','glucose','сахар крови','glu'] },
  hba1c: { t:'Гликированный гемоглобин', g:'sugar', unit:'%', conv:{}, ref:[4,6],
    syn:['гликированный гемоглобин','гликозилированный гемоглобин','hba1c','hb a1c','a1c'] },
  insulin: { t:'Инсулин', g:'sugar', unit:'мкЕд/мл', conv:{}, ref:[2.6,24.9], syn:['инсулин','insulin'] },

  cholesterol_total: { t:'Холестерин общий', g:'lipids', unit:'ммоль/л',
    conv:{'mmol/l':1,'ммоль/л':1,'mg/dl':1/38.67,'мг/дл':1/38.67}, ref:[3.3,5.2],
    syn:['холестерин общий','общий холестерин','=холестерин','cholesterol total','total cholesterol'] },
  ldl: { t:'Холестерин ЛПНП', g:'lipids', unit:'ммоль/л',
    conv:{'mmol/l':1,'ммоль/л':1,'mg/dl':1/38.67,'мг/дл':1/38.67}, ref:[0,3.3],
    syn:['лпнп','ldl','холестерин лпнп','низкой плотности'] },
  hdl: { t:'Холестерин ЛПВП', g:'lipids', unit:'ммоль/л',
    conv:{'mmol/l':1,'ммоль/л':1,'mg/dl':1/38.67,'мг/дл':1/38.67}, refBySex:{m:[1.0,2.2],f:[1.2,2.6]},
    syn:['лпвп','hdl','высокой плотности'] },
  triglycerides: { t:'Триглицериды', g:'lipids', unit:'ммоль/л',
    conv:{'mmol/l':1,'ммоль/л':1,'mg/dl':1/88.57,'мг/дл':1/88.57}, ref:[0,1.7],
    syn:['триглицериды','triglycerides','tg'] },

  alt: { t:'АЛТ', g:'liver', unit:'Ед/л', conv:{'u/l':1,'ед/л':1,'iu/l':1},
    refBySex:{m:[0,41],f:[0,33]}, syn:['алт','alt','аланинаминотрансфераза','gpt'] },
  ast: { t:'АСТ', g:'liver', unit:'Ед/л', conv:{'u/l':1,'ед/л':1,'iu/l':1},
    refBySex:{m:[0,40],f:[0,32]}, syn:['аст','ast','аспартатаминотрансфераза','got'] },
  ggt: { t:'ГГТ', g:'liver', unit:'Ед/л', conv:{'u/l':1,'ед/л':1},
    refBySex:{m:[0,55],f:[0,38]}, syn:['ггт','ggt','гамма-глутамил'] },
  alp: { t:'Щелочная фосфатаза', g:'liver', unit:'Ед/л', conv:{'u/l':1,'ед/л':1}, ref:[40,150],
    syn:['щелочная фосфатаза','alp','щф'] },
  bilirubin_total: { t:'Билирубин общий', g:'liver', unit:'мкмоль/л',
    conv:{'мкмоль/л':1,'umol/l':1,'µmol/l':1,'mg/dl':17.104,'мг/дл':17.104}, ref:[3.4,20.5],
    syn:['билирубин общий','общий билирубин','bilirubin total','tbil'] },
  bilirubin_direct: { t:'Билирубин прямой', g:'liver', unit:'мкмоль/л',
    conv:{'мкмоль/л':1,'umol/l':1,'mg/dl':17.104}, ref:[0,5],
    syn:['билирубин прямой','прямой билирубин','билирубин связанный','билирубин конъюгированный'],
    note:'Верхняя граница сильно зависит от метода лаборатории — от 3.4 до 5. Сравнивать значения разных лабораторий нужно осторожно.' },
  albumin: { t:'Альбумин', g:'liver', unit:'г/л', conv:{'г/л':1,'g/l':1,'g/dl':10}, ref:[35,52],
    syn:['альбумин','albumin'] },
  protein_total: { t:'Белок общий', g:'liver', unit:'г/л', conv:{'г/л':1,'g/l':1,'g/dl':10}, ref:[64,83],
    syn:['общий белок','белок общий','total protein'] },

  creatinine: { t:'Креатинин', g:'kidney', unit:'мкмоль/л',
    conv:{'мкмоль/л':1,'umol/l':1,'mg/dl':88.4,'мг/дл':88.4}, refBySex:{m:[62,106],f:[44,80]},
    syn:['креатинин','creatinine','crea'] },
  urea: { t:'Мочевина', g:'kidney', unit:'ммоль/л',
    conv:{'ммоль/л':1,'mmol/l':1,'mg/dl':0.1665,'мг/дл':0.1665}, refBySex:{m:[3.2,7.3],f:[2.6,6.7]},
    syn:['мочевина','urea'],
    note:'После 50 лет верхняя граница выше. Не путать с «азотом мочевины» (BUN) — это другое число.' },
  uric_acid: { t:'Мочевая кислота', g:'kidney', unit:'мкмоль/л',
    conv:{'мкмоль/л':1,'umol/l':1,'mg/dl':59.48}, refBySex:{m:[202,416],f:[143,339]},
    syn:['мочевая кислота','uric acid'] },

  ferritin: { t:'Ферритин', g:'iron', unit:'нг/мл', conv:{'нг/мл':1,'ng/ml':1,'мкг/л':1,'ug/l':1,'µg/l':1},
    refBySex:{m:[20,250],f:[10,120]}, syn:['ферритин','ferritin'],
    note:'Ферритин растёт при любом воспалении — поэтому нормальное число не всегда исключает дефицит железа. Границы у лабораторий расходятся сильнее, чем у других показателей.' },
  iron: { t:'Железо сывороточное', g:'iron', unit:'мкмоль/л',
    conv:{'мкмоль/л':1,'umol/l':1,'mcg/dl':0.179,'мкг/дл':0.179}, refBySex:{m:[11,28],f:[6.6,26]},
    syn:['железо','iron','fe','железо сывороточное','fe сыв'],
    note:'Сильно колеблется в течение суток и после еды. Одно значение мало о чём говорит — смотрят вместе с ферритином и ОЖСС.' },
  transferrin: { t:'Трансферрин', g:'iron', unit:'г/л', conv:{'г/л':1,'g/l':1,'мг/дл':0.01}, ref:[2,3.6],
    syn:['трансферрин','transferrin','сидерофилин'] },

  tsh: { t:'ТТГ', g:'hormones', unit:'мЕд/л', conv:{'мед/л':1,'miu/l':1,'µiu/ml':1,'мкме/мл':1,'uiu/ml':1},
    ref:[0.27,4.2], syn:['ттг','tsh','тиреотропный гормон','тиреотропин'],
    note:'Верхняя граница у разных лабораторий от 4.0 до 5.0 — это один из самых спорных показателей. При беременности нормы свои.' },
  t4_free: { t:'Т4 свободный', g:'hormones', unit:'пмоль/л', conv:{'пмоль/л':1,'pmol/l':1,'нг/дл':12.87}, ref:[10.8,22],
    syn:['т4 свободный','свободный тироксин','free t4','ft4'],
    note:'При беременности границы ниже и меняются по триместрам.' },
  t3_free: { t:'Т3 свободный', g:'hormones', unit:'пмоль/л', conv:{'пмоль/л':1,'pmol/l':1,'пг/мл':1.536}, ref:[3.1,6.8],
    syn:['т3 свободный','свободный трийодтиронин','free t3','ft3'] },
  testosterone: { t:'Тестостерон общий', g:'hormones', unit:'нмоль/л',
    conv:{'нмоль/л':1,'nmol/l':1,'ng/dl':0.0347,'нг/дл':0.0347}, refBySex:{m:[8.64,29],f:[0.29,1.67]},
    syn:['тестостерон общий','общий тестостерон','testosterone'],
    note:'Сдают утром: к вечеру значение заметно ниже. После 50 лет нижняя граница снижается.' },
  cortisol: { t:'Кортизол', g:'hormones', unit:'нмоль/л', conv:{'нмоль/л':1,'nmol/l':1,'мкг/дл':27.59}, ref:[166,507],
    syn:['кортизол','cortisol','гидрокортизон'],
    note:'Границы даны для утренней крови (6–10 часов). Вечером норма другая — примерно 74–291.' },

  vitamin_d: { t:'Витамин D, 25-ОН', g:'vitamins', unit:'нг/мл',
    conv:{'нг/мл':1,'ng/ml':1,'нмоль/л':1/2.496,'nmol/l':1/2.496}, ref:[30,100],
    syn:['витамин d','витамин д','25 oh d','25 гидроксивитамин d','кальцидиол','кальциферол','vitamin d'],
    grades:[{to:20,label:'дефицит'},{to:30,label:'недостаточность'},{to:100,label:'достаточный уровень'},{label:'много, стоит обсудить с врачом'}],
    note:'Лабораторная норма и клинические пороги — разные вещи: дефицитом считают меньше 20, недостаточностью 20–30, целевым уровнем 30–60 нг/мл.' },
  vitamin_b12: { t:'Витамин B12', g:'vitamins', unit:'пг/мл',
    conv:{'пг/мл':1,'pg/ml':1,'пмоль/л':0.738,'pmol/l':0.738}, ref:[197,771],
    syn:['витамин b12','витамин в12','b12','в12','цианокобаламин','кобаламин'],
    note:'Значение у нижнего края нормы (200–350) не исключает нехватку: она бывает видна только по гомоцистеину и метилмалоновой кислоте.' },
  folate: { t:'Фолиевая кислота', g:'vitamins', unit:'нг/мл', conv:{'нг/мл':1,'ng/ml':1,'нмоль/л':1/2.266}, ref:[3.1,20.5],
    syn:['фолиевая кислота','фолаты','folate','витамин b9'] },
  homocysteine: { t:'Гомоцистеин', g:'vitamins', unit:'мкмоль/л', conv:{'мкмоль/л':1,'umol/l':1},
    refBySex:{m:[0,15],f:[0,10]}, syn:['гомоцистеин','homocysteine'],
    note:'После 65 лет верхняя граница шире — около 20. Повышение часто связано с нехваткой B12 или фолиевой кислоты.' },
  magnesium: { t:'Магний', g:'other', unit:'ммоль/л', conv:{'ммоль/л':1,'mmol/l':1}, ref:[0.66,1.07],
    syn:['магний','magnesium','mg'] },
  calcium: { t:'Кальций общий', g:'other', unit:'ммоль/л', conv:{'ммоль/л':1,'mmol/l':1,'mg/dl':1/4.008}, ref:[2.15,2.5],
    syn:['кальций общий','общий кальций','кальций','calcium'],
    note:'Это не то же самое, что ионизированный кальций: у него своя норма 1.16–1.32.' },
  potassium: { t:'Калий', g:'other', unit:'ммоль/л', conv:{'ммоль/л':1,'mmol/l':1}, ref:[3.5,5.1],
    syn:['калий','potassium','k'] },
  crp: { t:'С-реактивный белок', g:'other', unit:'мг/л', conv:{'мг/л':1,'mg/l':1,'мг/дл':10}, ref:[0,5],
    syn:['срб','с реактивный белок','с реактивный','crp','c reactive protein'],
    note:'У этого анализа два смысла. Обычный СРБ ловит воспаление: выше 10 — что-то активно воспаляется. Высокочувствительный (hs-СРБ) оценивает сосудистый риск в тихом диапазоне: до 1 низкий, 1–3 средний, выше 3 высокий.' },
  sodium: { t:'Натрий', g:'other', unit:'ммоль/л', conv:{'ммоль/л':1,'mmol/l':1}, ref:[136,145],
    syn:['натрий','sodium','na'] },
  chloride: { t:'Хлориды', g:'other', unit:'ммоль/л', conv:{'ммоль/л':1,'mmol/l':1}, ref:[98,107],
    syn:['хлор','хлориды','chloride','cl'] },
  calcium_ionized: { t:'Кальций ионизированный', g:'other', unit:'ммоль/л', conv:{'ммоль/л':1,'mmol/l':1}, ref:[1.16,1.32],
    syn:['кальций ионизированный','ионизированный кальций'] },
  bilirubin_indirect: { t:'Билирубин непрямой', g:'liver', unit:'мкмоль/л',
    conv:{'мкмоль/л':1,'umol/l':1,'mg/dl':17.104}, ref:[0,17],
    syn:['билирубин непрямой','непрямой билирубин','билирубин свободный'] },
  non_hdl: { t:'Холестерин не-ЛПВП', g:'lipids', unit:'ммоль/л',
    conv:{'ммоль/л':1,'mmol/l':1,'mg/dl':1/38.67}, ref:[0,3.8],
    syn:['холестерин не лпвп','не лпвп','non hdl'] },
  atherogenic: { t:'Коэффициент атерогенности', g:'lipids', unit:'', conv:{}, ref:[0,3],
    syn:['коэффициент атерогенности','индекс атерогенности'] },
  tibc: { t:'ОЖСС', g:'iron', unit:'мкмоль/л', conv:{'мкмоль/л':1,'umol/l':1}, ref:[45,77],
    syn:['ожсс','общая железосвязывающая способность','tibc'] },
  zinc: { t:'Цинк', g:'other', unit:'мкмоль/л', conv:{'мкмоль/л':1,'umol/l':1,'мкг/л':1/65.38},
    refBySex:{m:[11.1,19.4],f:[10.7,17.4]}, syn:['цинк','zinc'] },
};

const norm = (s) => (s || '').toString().toLowerCase()
  .replace(/\u0451/g, 'е')
  .replace(/[.,()\[\]{}\/\\:;+*"'\u00ab\u00bb]/g, ' ')
  .replace(/[-\u2013\u2014]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/* Слова, которые МЕНЯЮТ смысл показателя. Если такое слово есть в названии из бланка,
   но его нет в синониме — это другой показатель, и склеивать их нельзя.
   Именно из-за этого «Холестерин не-ЛПВП» попадал в ЛПВП, а
   «гликированный гемоглобин» — в обычный гемоглобин. */
const MODIFIERS = [
  'не', 'non', 'ионизированный', 'непрямой', 'прямой', 'свободный',
  'гликированный', 'гликозилированный', 'связанный', 'индекс', 'коэффициент',
  'отношение', 'соотношение', 'моча', 'мочи', 'суточной', 'слюне', 'слюны', 'мочевой',
];

const words = (s) => norm(s).split(' ').filter(Boolean);

/* Ищем канонический ключ по названию из бланка.
   Порядок строгий: точное совпадение → самый длинный синоним, все слова которого есть в названии. */
export function matchMarker(rawName) {
  const n = norm(rawName);
  if (!n) return null;
  const nWords = words(rawName);

  for (const [key, m] of Object.entries(MARKERS)) {
    for (const syn of m.syn) if (norm(syn.replace(/^=/, '')) === n) return { key, exact: true };
  }

  let best = null;
  for (const [key, m] of Object.entries(MARKERS)) {
    for (const syn of m.syn) {
      if (syn.startsWith('=')) continue;      // слишком широкое слово — только точное совпадение
      const sWords = words(syn);
      if (!sWords.length) continue;
      const covered = sWords.every(w => nWords.includes(w) || (w.length >= 4 && nWords.some(x => x.startsWith(w))));
      if (!covered) continue;
      const extraModifier = nWords.some(w => MODIFIERS.includes(w) && !sWords.includes(w));
      if (extraModifier) continue;
      const score = sWords.join('').length + sWords.length * 2;
      if (!best || score > best.score) best = { key, score };
    }
  }
  return best ? { key: best.key, exact: false } : null;
}

/* Пересчёт значения из единицы бланка в каноническую.
   Если единицу не знаем — оставляем как есть и честно помечаем. */
export function toCanonical(key, value, unitRaw) {
  const m = MARKERS[key];
  const v = Number(value);
  if (!m || !isFinite(v)) return { value: v, unit: unitRaw || '', converted: false, factor: 1 };
  const u = norm(unitRaw).replace(/\s/g, '');
  if (!u) return { value: v, unit: m.unit, converted: false, factor: 1 };
  const table = m.conv || {};
  for (const [k, f] of Object.entries(table)) {
    if (norm(k).replace(/\s/g, '') === u) {
      return { value: +(v * f).toFixed(4), unit: m.unit, converted: f !== 1, factor: f };
    }
  }
  return { value: v, unit: unitRaw, converted: false, factor: 1, unknownUnit: true };
}

export function defaultRef(key, sex) {
  const m = MARKERS[key];
  if (!m) return null;
  if (m.refBySex) return m.refBySex[sex === 'f' ? 'f' : 'm'] || null;
  return m.ref || null;
}

export function markerTitle(key, fallback) {
  return MARKERS[key]?.t || fallback || key;
}
export function markerUnit(key, fallback) {
  return MARKERS[key]?.unit || fallback || '';
}
export function markerGroup(key) {
  return MARKERS[key]?.g || 'other';
}

/* статус относительно коридора: ok | edge | out | unknown
   edge — в пределах 8% от границы: «у границы», как в макете */
export function statusOf(value, low, high) {
  const v = Number(value);
  if (!isFinite(v) || (low == null && high == null)) return 'unknown';
  if (low != null && v < low) return 'out';
  if (high != null && v > high) return 'out';
  const span = (high != null && low != null) ? (high - low) : null;
  if (span && span > 0) {
    const pad = span * 0.08;
    if ((low != null && v - low <= pad) || (high != null && high - v <= pad)) return 'edge';
  }
  return 'ok';
}
