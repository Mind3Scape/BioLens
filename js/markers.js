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
    syn:['гликированный','hba1c','a1c'] },
  insulin: { t:'Инсулин', g:'sugar', unit:'мкЕд/мл', conv:{}, ref:[2.6,24.9], syn:['инсулин','insulin'] },

  cholesterol_total: { t:'Холестерин общий', g:'lipids', unit:'ммоль/л',
    conv:{'mmol/l':1,'ммоль/л':1,'mg/dl':1/38.67,'мг/дл':1/38.67}, ref:[3.3,5.2],
    syn:['холестерин общий','общий холестерин','cholesterol total','chol'] },
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
    conv:{'мкмоль/л':1,'umol/l':1,'mg/dl':17.104}, ref:[0,5.1],
    syn:['билирубин прямой','прямой билирубин','dbil'] },
  albumin: { t:'Альбумин', g:'liver', unit:'г/л', conv:{'г/л':1,'g/l':1,'g/dl':10}, ref:[35,52],
    syn:['альбумин','albumin'] },
  protein_total: { t:'Белок общий', g:'liver', unit:'г/л', conv:{'г/л':1,'g/l':1,'g/dl':10}, ref:[64,83],
    syn:['общий белок','белок общий','total protein'] },

  creatinine: { t:'Креатинин', g:'kidney', unit:'мкмоль/л',
    conv:{'мкмоль/л':1,'umol/l':1,'mg/dl':88.4,'мг/дл':88.4}, refBySex:{m:[62,106],f:[44,80]},
    syn:['креатинин','creatinine','crea'] },
  urea: { t:'Мочевина', g:'kidney', unit:'ммоль/л',
    conv:{'ммоль/л':1,'mmol/l':1,'mg/dl':1/2.8,'мг/дл':1/2.8}, ref:[2.8,7.2],
    syn:['мочевина','urea','bun'] },
  uric_acid: { t:'Мочевая кислота', g:'kidney', unit:'мкмоль/л',
    conv:{'мкмоль/л':1,'umol/l':1,'mg/dl':59.48}, refBySex:{m:[202,416],f:[143,339]},
    syn:['мочевая кислота','uric acid'] },

  ferritin: { t:'Ферритин', g:'iron', unit:'нг/мл', conv:{'нг/мл':1,'ng/ml':1,'мкг/л':1,'ug/l':1,'µg/l':1},
    refBySex:{m:[30,400],f:[13,150]}, syn:['ферритин','ferritin'] },
  iron: { t:'Железо сывороточное', g:'iron', unit:'мкмоль/л',
    conv:{'мкмоль/л':1,'umol/l':1,'mcg/dl':0.179,'мкг/дл':0.179}, refBySex:{m:[11.6,31.3],f:[9,30.4]},
    syn:['железо','iron','fe','железо сывороточное','fe сыв'] },
  transferrin: { t:'Трансферрин', g:'iron', unit:'г/л', conv:{'г/л':1,'g/l':1}, ref:[2,3.6],
    syn:['трансферрин','transferrin'] },

  tsh: { t:'ТТГ', g:'hormones', unit:'мЕд/л', conv:{'мед/л':1,'miu/l':1,'µiu/ml':1,'мкме/мл':1,'uiu/ml':1},
    ref:[0.4,4.0], syn:['ттг','tsh','тиреотропный'] },
  t4_free: { t:'Т4 свободный', g:'hormones', unit:'пмоль/л', conv:{'пмоль/л':1,'pmol/l':1}, ref:[9,19],
    syn:['т4 свободный','free t4','ft4'] },
  t3_free: { t:'Т3 свободный', g:'hormones', unit:'пмоль/л', conv:{'пмоль/л':1,'pmol/l':1}, ref:[2.6,5.7],
    syn:['т3 свободный','free t3','ft3'] },
  testosterone: { t:'Тестостерон общий', g:'hormones', unit:'нмоль/л',
    conv:{'нмоль/л':1,'nmol/l':1,'ng/dl':1/28.84,'нг/дл':1/28.84}, refBySex:{m:[8.6,29],f:[0.3,2.4]},
    syn:['тестостерон','testosterone'] },
  cortisol: { t:'Кортизол', g:'hormones', unit:'нмоль/л', conv:{'нмоль/л':1,'nmol/l':1}, ref:[171,536],
    syn:['кортизол','cortisol'] },

  vitamin_d: { t:'Витамин D, 25-ОН', g:'vitamins', unit:'нг/мл',
    conv:{'нг/мл':1,'ng/ml':1,'нмоль/л':1/2.5,'nmol/l':1/2.5}, ref:[30,100],
    syn:['витамин d','25(oh)d','25-oh','кальциферол','vitamin d','витамин д'] },
  vitamin_b12: { t:'Витамин B12', g:'vitamins', unit:'пг/мл',
    conv:{'пг/мл':1,'pg/ml':1,'пмоль/л':1/0.738,'pmol/l':1/0.738}, ref:[187,883],
    syn:['b12','в12','цианокобаламин','кобаламин'] },
  folate: { t:'Фолиевая кислота', g:'vitamins', unit:'нг/мл', conv:{'нг/мл':1,'ng/ml':1}, ref:[3.1,20.5],
    syn:['фолиевая','folate','фолат'] },
  homocysteine: { t:'Гомоцистеин', g:'vitamins', unit:'мкмоль/л', conv:{'мкмоль/л':1,'umol/l':1}, ref:[5,15],
    syn:['гомоцистеин','homocysteine'] },
  magnesium: { t:'Магний', g:'other', unit:'ммоль/л', conv:{'ммоль/л':1,'mmol/l':1}, ref:[0.66,1.07],
    syn:['магний','magnesium','mg'] },
  calcium: { t:'Кальций', g:'other', unit:'ммоль/л', conv:{'ммоль/л':1,'mmol/l':1,'mg/dl':1/4.008}, ref:[2.15,2.55],
    syn:['кальций','calcium','ca'] },
  potassium: { t:'Калий', g:'other', unit:'ммоль/л', conv:{'ммоль/л':1,'mmol/l':1}, ref:[3.5,5.1],
    syn:['калий','potassium','k'] },
  crp: { t:'С-реактивный белок', g:'other', unit:'мг/л', conv:{'мг/л':1,'mg/l':1}, ref:[0,5],
    syn:['срб','с-реактивный','crp','c-reactive'] },
  zinc: { t:'Цинк', g:'other', unit:'мкмоль/л', conv:{'мкмоль/л':1,'umol/l':1}, ref:[9,18],
    syn:['цинк','zinc'] },
};

const norm = (s) => (s || '').toString().toLowerCase().replace(/ё/g, 'е').replace(/[.,()\-–—]/g, ' ').replace(/\s+/g, ' ').trim();

/* Ищем канонический ключ по названию из бланка.
   Возвращает {key, exact} или null — тогда показатель хранится «как есть». */
export function matchMarker(rawName) {
  const n = norm(rawName);
  if (!n) return null;
  for (const [key, m] of Object.entries(MARKERS)) {
    for (const s of m.syn) {
      const sn = norm(s);
      if (n === sn) return { key, exact: true };
    }
  }
  for (const [key, m] of Object.entries(MARKERS)) {
    for (const s of m.syn) {
      const sn = norm(s);
      if (sn.length >= 3 && (n.startsWith(sn + ' ') || n.includes(' ' + sn) || n.startsWith(sn))) {
        return { key, exact: false };
      }
    }
  }
  return null;
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
