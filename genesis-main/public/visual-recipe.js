import { maxManualBpm, minManualBpm, photoInterval } from './rhythm.js';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const unit = (value, fallback) => Number.isFinite(value) ? clamp(value) : fallback;
const mix = (a, b, t) => a + (b - a) * t;
const luma = ([r, g, b]) => .2126 * r + .7152 * g + .0722 * b;
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const hex = values => '#' + values.map(value => Math.round(clamp(value) * 255).toString(16).padStart(2, '0')).join('');
const percent = value => Math.round(value * 100) + '%';

// Stems provide evidence in the original story. Unmentioned characteristics
// stay near neutral; the category used to filter the archive isn't an input.
const clues = {
  alone: /^(одиноче|наедине|уедин|одинок|одному$|одной$|один$|одна$|alone$|solitary)/u,
  pair: /^(вдвоем|вместе|обоих|двоих|партнер|together|couple)/u,
  crowd: /^(толп|друз|компани|команд|коллег|концерт|собрани|гостями|фестивал|вечеринк|одноклассник|семьей|crowd|friends|festival|party|team)/u,
  sensory: /^(запах|пахл|пахн|аромат|вкус|шершав|бархат|шерст|мокр|хруст|шорох|шелест|тепл|холодн|горяч|пальц|кож|кофе|стекл|смол|коробк|ламп|асфальт|табличк|кружк|smell|scent|taste|rough|crisp|velvet|touch|coffee|lamp)/u,
  abstract: /^(мысл|дума|подум|кажет|казал|словно|чувств|смысл|мечт|вспом|памят|тоск|рефлекс|надежд|осозна|осмыс|рассужд|представ|размыш|сожал|wonder|thought|dream|remember|believ|reflect)/u,
  weary: /^(устал|устав|выдохс|вымот|измот|груст|пустот|опустош|тоск|печал|обессил|tired|weary|exhaust|sad|sorrow|empty)/u,
  strained: /^(тревог|тревож|паник|нерв|напряж|сроч|дедлайн|спеш|опозд|правк|стресс|испуг|боял|страш|rush|stress|anxio|panic|deadline)/u,
  memory: /^(ностальг|вспомин|вспом|памят|помню|детств|прощ|расстав|последн|ностальжи|nostalg|remember|childhood|farewell)/u,
  joyful: /^(радост|счаст|улыб|ликов|смеял|весел|happy|joy|smile)/u,
  rain: /^(дожд|ливн|ливен|морос|луж|rain|drizzl)/u
};

export function analyzeTextStructure(value = '') {
  const text = String(value).toLowerCase().replaceAll('ё', 'е');
  const words = text.match(/[\p{L}\p{N}]+/gu) || [];
  const sentences = text.split(/[.!?…]+|\n+/u).filter(part => /[\p{L}\p{N}]/u.test(part));
  const averageWords = words.length / Math.max(1, sentences.length);
  const punctuation = (text.match(/[,;:.!?…—]/gu) || []).length / Math.max(1, words.length);
  const sentenceFlow = words.length ? clamp(.13 + averageWords / 21 - .58 * punctuation) : .5;
  const evidence = {};
  for (const [name, pattern] of Object.entries(clues)) {
    const hits = words.reduce((sum, word) => sum + Number(pattern.test(word)), 0);
    evidence[name] = 1 - Math.exp(-1.1 * hits);
  }
  const socialDensity = clamp(.48 + .75 * evidence.crowd + .09 * evidence.pair - .65 * evidence.alone);
  const reflectiveness = clamp(.46 + .65 * evidence.abstract - .55 * evidence.sensory);
  return { ...evidence, socialDensity, reflectiveness, averageWords, punctuation, sentenceFlow };
}

function photoProfile(day, palette) {
  const luminances = palette.map(luma);
  const mean = array => array.reduce((sum, number) => sum + number, 0) / array.length;
  const average = mean(luminances);
  return {
    luma: unit(day.photoLight?.luma, average),
    contrast: unit(day.photoLight?.contrast, Math.sqrt(mean(luminances.map(value => (value - average) ** 2)))),
    warmth: unit(day.photoLight?.warmth, clamp(.5 + mean(palette.map(([r, , b]) => r - b))))
  };
}

export function gradeColor(color, recipe) {
  const [r, g, b] = color;
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b), span = hi - lo;
  const light = (hi + lo) / 2;
  const sat = span ? clamp(span / (1 - Math.abs(2 * light - 1)) * recipe.saturation) : 0;
  let hue = 0;
  if (span) {
    if (hi === r) hue = (g - b) / span;
    else if (hi === g) hue = 2 + (b - r) / span;
    else hue = 4 + (r - g) / span;
    hue = (hue * 60 + 360) % 360;
    const toAmber = ((39 - hue + 540) % 360) - 180;
    hue += clamp(toAmber, -recipe.amberShift, recipe.amberShift) * 4 * light * (1 - light);
  }
  const amplitude = sat * Math.min(light, 1 - light);
  const y = luma(color);
  return hex([0, 8, 4].map((offset, channel) => {
    const k = (offset + hue / 30 + 12) % 12;
    const hsl = light - amplitude * clamp(Math.min(k - 3, 9 - k), -1, 1);
    const cool = recipe.shadowCool * Math.max(0, .5 - y) * [-.09, .015, .095][channel];
    return ((hsl - .5) * recipe.contrast + .5 + cool) * recipe.exposure;
  }));
}

const skies = {
  mist: 'Туман', warm_haze: 'Тёплая дымка', clear_light: 'Ясный свет',
  rain_glass: 'Дождь на стекле', wind_sparks: 'Ветер и искры'
};
function storedSky(day) {
  const code = day.weatherType || day.weather?.effect_type;
  if (Object.hasOwn(skies, code)) return code;
  const label = String(day.weather?.label || day.weather || '').toLowerCase();
  if (/дожд|ливень|rain/u.test(label)) return 'rain_glass';
  if (/ветер|искр|wind/u.test(label)) return 'wind_sparks';
  if (/туман|mist|fog/u.test(label)) return 'mist';
  if (/дымк|т[её]пл|haze/u.test(label)) return 'warm_haze';
  return 'clear_light';
}

export function buildVisualRecipe(day = {}) {
  const basePalette = (Array.isArray(day.palette) ? day.palette : []).filter(c => /^#[0-9a-f]{6}$/i.test(c));
  if (!basePalette.length) basePalette.push('#877f72', '#d5cfc3');
  const colors = basePalette.map(rgb);
  const photo = photoProfile(day, colors);
  const text = analyzeTextStructure(day.text || day.quote || '');
  const track = day.track || {};
  const dayEnergy = unit(day.energy, .5);
  const energy = unit(track.energy, .5);
  const brightness = unit(track.brightness, .5);
  const percussion = unit(track.percussiveness, .35);
  const minor = track.mode === 'minor' ? unit(track.modeConfidence, 1) : 0;
  const bpm = Number.isFinite(track.bpm) && track.bpm >= minManualBpm && track.bpm <= maxManualBpm ? track.bpm : null;
  const pace = bpm === null ? 1 : clamp(bpm / 90, .35, 1.9);
  const brightQuiet = clamp((photo.luma - .5) / .22) * text.weary * (1 - text.rain);
  const hasVideoMotion = Number.isFinite(day.videoMotion);
  const videoMotion = hasVideoMotion ? clamp(day.videoMotion) : null;
  const motionShift = hasVideoMotion ? (videoMotion - .35) : 0;
  const tension = clamp(.72 * text.strained + .28 * dayEnergy + .18 * Math.max(0, motionShift));
  const nostalgia = text.memory * clamp(.45 + photo.warmth);
  const cutSharpness = clamp(.65 * (1 - text.sentenceFlow) + .35 * percussion + .16 * motionShift);
  const whitespace = clamp(.025 + .31 * (1 - text.socialDensity) + .11 * minor +
    .06 * (1 - dayEnergy) + .10 * brightQuiet - .035 * tension - .12 * motionShift, .045, .45);
  const recipe = {
    basePalette, textSignals: text, bpm, intervalMs: photoInterval(track), cutSharpness, whitespace,
    videoMotion,
    saturation: clamp(.73 + .19 * dayEnergy + .13 * energy + .13 * text.joyful -
      .12 * minor - .15 * text.weary - .085 * brightQuiet, .51, 1.23),
    contrast: clamp(.85 + .2 * cutSharpness + .17 * tension + .1 * photo.contrast - .1 * brightQuiet + .12 * motionShift, .78, 1.32),
    exposure: 1 + .105 * brightQuiet + .022 * nostalgia,
    amberShift: 8 * nostalgia, shadowCool: tension * (.4 + .6 * photo.contrast),
    halation: clamp(.8 * nostalgia + .24 * brightQuiet),
    mist: clamp(.04 + .58 * text.reflectiveness + .24 * brightQuiet - .12 * tension - .14 * Math.max(0, motionShift)),
    brushRadius: 1 + 2.7 * (1 - brightness) + 2 * text.reflectiveness,
    grain: clamp(.10 + .64 * (1 - brightness) + .17 * nostalgia),
    geometry: clamp(.06 + .33 * percussion + .26 * tension + .23 * (1 - text.sentenceFlow) +
      .18 * text.socialDensity + .15 * brightness * tension + .22 * motionShift),
    beatReactivity: percussion * .85,
    motionSpeed: clamp(pace * (.8 + .44 * (1 - text.sentenceFlow)) * (1 - .42 * brightQuiet) * (1 + .25 * motionShift), .22, 1.8),
    particleSpeed: clamp(pace * (.89 + .17 * energy) * (1 + .22 * motionShift), .31, 1.85),
    typeWeight: Math.round(420 + 110 * (1 - text.sentenceFlow) + 110 * tension + 30 * text.socialDensity),
    weatherType: brightQuiet >= .36 ? 'warm_haze' : storedSky(day)
  };
  const voiceRate = clamp(.88 + .12 * dayEnergy + .06 * (1 - text.sentenceFlow) + .06 * tension -
    .05 * text.reflectiveness - .03 * minor, .84, 1.12);
  const voicePitch = clamp(.96 + .05 * text.joyful + .02 * tension - .04 * text.weary - .03 * minor, .90, 1.04);
  const voiceWarmth = clamp(.58 + .26 * (1 - brightness) + .18 * nostalgia - .24 * tension);
  const voiceGender = (tension >= .42 || (photo.warmth < .45 && dayEnergy > .5)) ? 'male' : 'female';
  const voiceLabel = voiceRate <= .93
    ? (voiceWarmth >= .56 ? 'тихий и тёплый' : 'неспешный и сдержанный')
    : voiceRate >= 1.04 ? 'собранный и быстрый' : 'ровный и мягкий';
  recipe.voice = {
    rate: Number(voiceRate.toFixed(2)),
    sapiRate: Math.round(clamp((voiceRate - .98) * 10, -2, 2)),
    pitch: Number(voicePitch.toFixed(2)),
    warmth: Number(voiceWarmth.toFixed(2)),
    gender: voiceGender,
    label: voiceLabel
  };
  recipe.artTechniques = [
    recipe.brushRadius >= 3.6 && { id: 'impressionism', name: 'Живописная мягкость', ref: 'импрессионизм / Клод Моне' },
    recipe.whitespace >= .28 && { id: 'ma', name: 'Воздух в композиции', ref: 'японский минимализм (Ма)' },
    recipe.geometry >= .55 && { id: 'constructivism', name: 'Геометрические оси и ритм', ref: 'конструктивизм / Кандинский' },
    (recipe.halation >= .35 || recipe.amberShift >= 3) && { id: 'film', name: 'Тёплое зерно и ореол', ref: 'аналоговая киноплёнка' },
    (recipe.contrast >= 1.1 || recipe.shadowCool >= .2) && { id: 'high_contrast', name: 'Холодные тени и графика', ref: 'контрастная печать' }
  ].filter(Boolean);
  if (!recipe.artTechniques.length) {
    recipe.artTechniques.push({ id: 'editorial', name: 'Сдержанный отпечаток', ref: 'альбомная печать' });
  }
  recipe.weatherLabel = skies[recipe.weatherType];
  recipe.palette = colors.map(color => gradeColor(color, recipe));
  const sorted = recipe.palette.map(rgb).sort((a, b) => luma(a) - luma(b));
  const chromaOf = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b);
  const chromatic = [...sorted].sort((a, b) => chromaOf(b) - chromaOf(a))[0];
  const midSwatch = sorted[Math.floor(sorted.length / 2)];
  // Tinted archival matte paper drawn genuinely from the graded palette (never bleached stark white).
  const paperBase = midSwatch.map((ch, i) => mix(mix(ch, sorted.at(-1)[i], .46), chromatic[i], .24));
  const paperLuma = luma(paperBase);
  const liftedPaper = paperLuma < .58
    ? paperBase.map(ch => clamp(ch + (.58 - paperLuma) * .88, .12, .78))
    : paperLuma > .76
      ? paperBase.map((ch, i) => clamp(mix(ch, midSwatch[i], .45), .12, .76))
      : paperBase.map(ch => clamp(ch, .12, .78));
  recipe.paper = hex(liftedPaper);
  recipe.ink = hex(sorted[0].map(channel => mix(channel, .06, .62)));
  // Deepest chromatic tone from the photograph's native palette for the immersive museum day view.
  const deepSource = chromatic.map((channel, i) => mix(sorted[0][i], channel, .58));
  const deepLuma = Math.max(.001, luma(deepSource));
  const targetLuma = .105;
  const toneScale = Math.min(.72, targetLuma / deepLuma);
  recipe.backdrop = hex(deepSource.map(channel => clamp(channel * toneScale + .028, .04, .22)));
  recipe.backdropSurface = hex(deepSource.map(channel => clamp(channel * toneScale * 1.48 + .055, .075, .29)));
  recipe.backdropAccent = hex(sorted.at(-1).map((channel, i) => mix(channel, chromatic[i], .25)));

  // Artistic style of the Contact Sheet & Sound Signature (purely parametric, never keyed on day.mood).
  recipe.signatureStyle = recipe.geometry >= .55 ? 'constructivism'
    : (recipe.halation >= .35 || recipe.amberShift >= 3) ? 'film'
    : recipe.whitespace >= .30 ? 'ma'
    : 'impressionism';
  const artModes = {
    impressionism: 'impressionism_monet',
    constructivism: 'suprematism_kandinsky',
    ma: 'minimalism_wabisabi',
    film: 'cinema_35mm'
  };
  recipe.artMode = artModes[recipe.signatureStyle];
  // Contact Sheet mat & borders strictly follow the day's color grade (dark moody photos get a deep graded mat;
  // brighter scenes get a distinctly color-graded archival matte board — never harsh white).
  const darkSheet = photo.luma < .48 || recipe.signatureStyle === 'film' || recipe.signatureStyle === 'constructivism';
  const darkMat = midSwatch.map((ch, i) => clamp(mix(deepSource[i] * toneScale * 1.75, ch * .44, .48) + .04, .09, .30));
  recipe.sheetDark = darkSheet;
  recipe.sheetBg = darkSheet ? hex(darkMat) : recipe.paper;
  const lightInk = sorted.at(-1).map((ch, i) => clamp(mix(ch, [.96, .94, .90][i], .62), .80, .95));
  const darkInk = sorted[0].map(ch => clamp(mix(ch, .05, .74), .04, .18));
  recipe.sheetInk = darkSheet ? hex(lightInk) : hex(darkInk);
  const inkRgb = darkSheet ? lightInk : darkInk;
  const bgRgb = darkSheet ? darkMat : liftedPaper;
  recipe.sheetMuted = hex(inkRgb.map((ch, i) => mix(ch, bgRgb[i], .28)));
  recipe.sheetRule = hex(inkRgb.map((ch, i) => mix(ch, bgRgb[i], .68)));
  recipe.frameBorder = hex(chromatic.map((ch, i) => mix(ch, bgRgb[i], darkSheet ? .46 : .44)));
  recipe.frameHighlight = hex(chromatic.map((ch, i) => mix(ch, inkRgb[i], darkSheet ? .44 : .32)));
  const signatureNames = {
    impressionism: 'акварельная линия горизонта (импрессионизм)',
    constructivism: 'геометрические пики и оси (конструктивизм)',
    ma: 'живая каллиграфическая линия туши (принцип Ма)',
    film: 'оптическая 35мм звуковая дорожка (киноплёнка)'
  };
  recipe.signatureLabel = signatureNames[recipe.signatureStyle];

  // 56-point musical loudness envelope: measured from real audio when present,
  // otherwise synthesized deterministically from BPM, energy and percussiveness.
  if (Array.isArray(track.envelope) && track.envelope.length >= 16) {
    recipe.envelope = track.envelope.map(v => clamp(Number(v) || 0));
  } else {
    const seed = [...String(track.title || day.title || 'day')].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 17);
    const freq = (bpm || 80) / 28;
    recipe.envelope = Array.from({ length: 56 }, (_, i) => {
      const t = i / 55;
      const arch = .32 + .68 * Math.sin(Math.PI * (0.1 + 0.8 * t));
      const pulse = Math.pow(Math.abs(Math.sin(t * Math.PI * freq + (seed % 7))), 1 + percussion * 2.4);
      const drift = .5 + .5 * Math.sin(t * 7.3 + (seed % 11) * .7);
      return Number(clamp(arch * (.24 + .52 * energy + .38 * pulse * (.35 + .65 * percussion) + .16 * drift * (1 - percussion))).toFixed(2));
    });
  }

  const social = text.socialDensity < .23 ? 'Уединение' : text.socialDensity > .72 ? 'Люди и общий план' : 'Масштаб рассказа';
  const texture = Number.isFinite(track.brightness)
    ? (Number.isFinite(track.spectralCentroidHz)
      ? `Яркость звука ${percent(brightness)} (центр спектра ${Math.round(track.spectralCentroidHz)} Гц)`
      : `Характер звука: яркость ${percent(brightness)}`)
    : 'Для звука задана нейтральная яркость';
  const beat = Number.isFinite(track.percussiveness) ? 'ударность ' + percent(percussion) : 'базовая ударность';
  const seconds = (recipe.intervalMs / 1000).toLocaleString('ru', { maximumFractionDigits: 1 });
  const timing = bpm
    ? (track.bpmSource === 'manual' ? 'Задано вручную '
      : track.bpmSource === 'tap' ? 'По вашим ударам · '
      : track.bpmSource === 'deezer' ? 'По данным Deezer · '
      : track.bpmSource === 'catalog' ? 'По каталогу Spotify · ' : '') + bpm + ' BPM'
    : 'Темп неизвестен, взят базовый интервал';
  const cut = cutSharpness >= .68 ? 'резкая склейка в бит' : 'плавный crossfade по музыкальной фразе';
  recipe.explanation = {
    composition: `${social}${minor ? ' и минорный лад' : ''}. Поля занимают ${percent(whitespace)} площади карточки. Слов на предложение в среднем — ${text.averageWords.toLocaleString('ru', {maximumFractionDigits:1})}. Интонация задаёт плотность линий и вес шрифта.`,
    color: `Палитра снимков ${basePalette.slice(0, 2).join(', ')}. Насыщенность ${percent(recipe.saturation)}, контраст ${percent(recipe.contrast)}.` +
      (nostalgia > .35 ? ` Воспоминания в тексте смещают средние тона до ${Math.round(recipe.amberShift)}° к янтарю и дают ореол в светах.` : ''),
    texture: `${texture}, ${beat}. Размер мазка ${recipe.brushRadius.toLocaleString('ru', {maximumFractionDigits:1})} px. Звуковой автограф встроен как ${recipe.signatureLabel}.`,
    rhythm: `${timing}. Интервал ${seconds} с, скорость дрейфа ${recipe.motionSpeed.toLocaleString('ru', {maximumFractionDigits:2})}×. Монтаж кадров — ${cut}.` +
      (hasVideoMotion ? ` Динамика движения в видео (${percent(videoMotion)}) дополнительно влияет на ритм и контраст.` : ''),
    weather: brightQuiet >= .36
      ? 'Светлый снимок и усталость в рассказе дают тёплую дымку. Света чуть усилены, краски приглушены, движение замедлено.'
      : (day.explanation?.[2] || `Для записи выбран эффект «${recipe.weatherLabel}».`) +
        ` Скорость частиц ${recipe.particleSpeed.toLocaleString('ru', {maximumFractionDigits:2})}×.`,
    voice: `Тембр «${voiceLabel}» (темп чтения ${voiceRate.toLocaleString('ru', {maximumFractionDigits:2})}×): подобран по энергии дня, ритму фраз и звучанию трека.`
  };
  return recipe;
}
