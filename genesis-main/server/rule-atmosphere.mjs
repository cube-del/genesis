import { validateAtmosphereInput } from './atmosphere.mjs';
import { coverTextLimit, quoteFragments } from './cover-text.mjs';
import { normalize, storyTerms, words } from '../public/story-terms.js';

const tones = {
  calm: {
    base: .22, label: 'спокойствие',
    signs: /^(тих|спокой|нетороп|медлен|мягк|уют|тепл|какао|чай|кофе|закат|вечер|плед|свеч|камин|берег|штиль|отдых|прогул|нежн|ровн|кухн|пирог|книг|читал|рассвет|покой|умиротвор|гармон|молча|calm|quiet|slow|soft|warm|sunset|cozy|tea|coffee|peace|gentle)/iu
  },
  joy: {
    base: .63, label: 'радость',
    signs: /^(радост|радова|весел|сме[хя]|смеял|улыб|празд|встреч|обня|счаст|танц|аплод|побед|ура|классн|восторг|солнц|солнеч|цветен|подар|сюрприз|друз|фестивал|отпуск|пляж|влюб|светл|вдохнов|любим|здоров|прекрасн|чудесн|joy|laugh|smile|happy|celebrat|dance|sun|bright|love|win|great)/iu
  },
  dream: {
    base: .36, label: 'мечтательность',
    signs: /^(задум|вспом|мечт|одино|пуст|туман|сумер|снил|луна|звезд|космос|эхо|воспомин|груст|печал|расстав|тоск|скуча|утрат|ностальг|размышл|тишин|бессон|поезд|даль|снег|сугроб|иней|листопад|осен|тень|устал|выгор|облак|звездопад|dream|remember|wonder|mist|moon|star|echo|nostalg|lonely|melanchol)/iu
  },
  energy: {
    base: .84, label: 'энергия',
    signs: /^(напряж|сроч|тревож|испуг|страш|дедлайн|сдач|рыв|бег|беж|гон|спеш|успет|сирен|резк|ночь|адреналин|драйв|трениров|спорт|концерт|рок|неон|трасс|шторм|гроз|молн|взрыв|ритм|пульс|огон|битв|хакатон|защит|релиз|прорыв|шум|толп|скорост|deadline|rush|race|tense|fast|urgent|neon|concert|storm|energy|hype)/iu
  }
};

const weatherClues = {
  rain: /^(дожд|капл|ливен|ливн|луж|мокр|морос|гроз|зонт|rain|puddle|drizzl|storm)/iu,
  snow: /^(снег|снеж|сугроб|метел|снегопад|мороз|иней|вьюг|гололед|зима|зимн|льдин|snow|frost|winter|blizzard|ice)/iu,
  stars: /^(звезд|созвезд|космос|луна|лунн|полнолун|млечн|бессон|полуноч|астроном|star|constell|moon|cosmos|midnight)/iu,
  neon: /^(неон|вывеск|витрин|фары|фар|трасс|мегаполис|клуб|прожектор|лазер|метро|небоскреб|кибер|neon|headlight|subway|citylight|club|cyber)/iu,
  bokeh: /^(свеч|гирлянд|фонар|костер|костр|камин|бенгаль|огоньк|огонек|фонарик|ламп|ночник|candle|lantern|fireplace|fairylight|bokeh|bonfire)/iu,
  petals: /^(лист|листопад|лепест|цветен|сакур|алле|клен|берез|осенн|весенн|сад|парк|лесн|лес$|цветы|цветок|leaf|leaves|petal|blossom|autumn|sakura|forest)/iu,
  wind: /^(ветер|ветр|порыв|искр|вихр|ураган|сквозняк|wind|gust|spark|breeze)/iu,
  mist: /^(туман|дымк|мгл|пасмур|облак|сырост|fog|mist|haze)/iu
};

const score = value => Number.isFinite(value) && value >= 0 && value <= 1;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const shortLine = (text, limit) => {
  if (Array.from(text).length <= limit) return text;
  const prefix = Array.from(text).slice(0, limit - 1).join('');
  return (prefix.replace(/\s+\S*$/u, '') || prefix).replace(/[\s,;:–—-]+$/u, '') + '…';
};

const connector = /^(?:и|а|но|о|об|у|к|в|во|на|из|с|со|за|до|для|по|под|над|между|как|что|когда|чтобы|перед|the|a|and|or|at|of|in|with)$/iu;
const filler = /^(?:я|мы|они|он|она|это|был[аио]?|были|сегодня|тогда|просто|очень|потом|вдруг|пошли|шли|домой|было|день|it|we|was|went|today)$/iu;
function readStory(text) {
  const evidence = Object.fromEntries(Object.keys(tones).map(mood => [mood, new Map()]));
  const present = [], muted = [];
  for (const {word, token, negatedPhrase, weight} of storyTerms(text)) {
    if (!negatedPhrase) present.push(word);
    for (const [mood, tone] of Object.entries(tones)) {
      if (!tone.signs.test(token)) continue;
      if (negatedPhrase) muted.push(negatedPhrase);
      else {
        const clues = evidence[mood];
        clues.set(word, Math.max(clues.get(word) || 0, weight));
      }
    }
  }
  const exclamations = (text.match(/!/g) || []).length;
  const ellipses = (text.match(/…|\.{3}/g) || []).length;
  const totals = Object.entries(evidence).map(([mood, clues]) => ({
    mood,
    clues: [...clues.keys()],
    value: [...clues.values()].reduce((a, b) => a + b, 0)
  }));
  const scores = Object.fromEntries(totals.map(item => [item.mood, item.value]));
  const best = [...totals].sort((a, b) => b.value - a.value)[0];
  return { ...best, scores, totals, tokens: present, muted: muted.at(-1), exclamations, ellipses };
}

function detailScore(terms) {
  return terms.reduce((sum, word) => sum + (connector.test(word) || filler.test(word) ? 0 : 1), 0);
}

function dayTitle(fragments, quote) {
  const candidates = [];
  for (const fragment of fragments) {
    for (const clause of fragment.split(/[,;:.!?…—]+/u)) {
      // Drop short time asides as a unit; keep the action and its setting together.
      const compact = clause.replace(/(?<!\p{L})(?:впервые|снова|в первый раз) за (?:неделю|месяц|год|день)(?!\p{L})/giu, '');
      const terms = words(compact.replace(/^\s*(?:когда|пока|чтобы|как только)\s+/iu, ''));
      for (let i = 0; i <= Math.max(0, terms.length - 7); i++) {
        const part = terms.slice(i, i + 7);
        if (part.length < 3 || part.some(word => word.length > 24) || connector.test(part.at(-1))) continue;
        const complete = part.length === terms.length;
        const rank = Math.min(5, detailScore(part)) + (complete ? 4 : 0) +
          (fragment === quote ? .65 : 0) - (/^[а-яё]{3,}(?:ывая|ивая|аясь|ившись)$/iu.test(part[0]) ? 1.5 : 0) - (i ? 1 : 0) - (filler.test(part[0]) ? .9 : 0);
        candidates.push({ part, rank });
      }
    }
  }
  const terms = candidates.sort((a, b) => b.rank - a.rank)[0]?.part ||
    words(quote).filter(word => word.length <= 24).slice(0, 7);
  while (terms.length > 3 && connector.test(terms.at(-1))) terms.pop();
  if (terms.length < 3) return terms.length ? 'День в памяти «' + terms.join(' ') + '»' : 'Память дня в дневнике';
  const title = terms.join(' ');
  return title[0].toUpperCase() + title.slice(1);
}

function textProfile(text) {
  const story = readStory(text);
  const fragments = quoteFragments(text);
  const chosen = fragments.map(quote => {
    const terms = words(quote);
    const hits = terms.filter(word => story.clues.includes(word)).length;
    return {
      quote,
      rank: Math.min(hits, 3) * 1.8 + Math.min(6, detailScore(terms)) * .6 +
        (terms.length >= 3 ? 1 : 0) - Math.max(0, terms.length - 14) * .17
    };
  }).sort((a, b) => b.rank - a.rank)[0].quote;
  return { ...story, title: dayTitle(fragments, chosen), quote: chosen, coverText: shortLine(chosen.replace(/\s+/gu, ' '), coverTextLimit) };
}

function hueFamilyName(hue) {
  if (!Number.isFinite(hue)) return '';
  if (hue >= 15 && hue < 56) return 'золотисто-янтарный акцент';
  if (hue >= 56 && hue < 165) return 'природная зелень';
  if (hue >= 165 && hue < 258) return 'холодная синева';
  if (hue >= 258 && hue < 335) return 'неоново-фиолетовый акцент';
  return 'тёплый багровый акцент';
}

function circularMeanHue(list) {
  const valid = list.filter(item => Number.isFinite(item.dominantHue));
  if (!valid.length) return null;
  let sx = 0, sy = 0;
  for (const item of valid) {
    const rad = (item.dominantHue * Math.PI) / 180;
    const w = Math.max(0.1, item.chroma ?? 0.3);
    sx += Math.cos(rad) * w;
    sy += Math.sin(rad) * w;
  }
  if (Math.hypot(sx, sy) < 0.01) return null;
  return Number((((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360).toFixed(1));
}

function photoProfile(photos) {
  const validLight = f => f && score(f.luma) && score(f.contrast) && score(f.warmth);
  const meanOf = (list, key) => list.reduce((total, item) => total + item[key], 0) / list.length;
  const optMean = (list, key) => {
    const vals = list.map(item => item[key]).filter(score);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const describe = ({ luma, warmth, chroma, darkShare, dominantHue }) => {
    const light = luma < .30 || (darkShare != null && darkShare > .52)
      ? 'ночной приглушённый свет'
      : luma < .38 ? 'приглушённый свет'
      : luma > .58 ? 'много светлых участков'
      : 'средняя светлота';
    const tint = warmth > .56 ? 'тёплый оттенок' : warmth < .46 ? 'прохладный оттенок' : 'нейтральный оттенок';
    const extra = chroma != null && chroma >= .32 && Number.isFinite(dominantHue) ? ', ' + hueFamilyName(dominantHue) : '';
    return light + ', ' + tint + extra;
  };
  const allFrames = [], motions = [], details = [];
  let hasVideo = false;
  for (const [index, item] of photos.entries()) {
    if (item?.kind === 'video' && Array.isArray(item.frames)) {
      hasVideo = true;
      const vFrames = item.frames.map(f => f?.light).filter(validLight);
      if (!vFrames.length) return null;
      allFrames.push(...vFrames);
      const motion = score(item.motion) ? item.motion : null;
      if (motion != null) motions.push(motion);
      const avg = {
        luma: meanOf(vFrames, 'luma'), contrast: meanOf(vFrames, 'contrast'), warmth: meanOf(vFrames, 'warmth'),
        chroma: optMean(vFrames, 'chroma'), darkShare: optMean(vFrames, 'darkShare'), dominantHue: circularMeanHue(vFrames)
      };
      const deltaLuma = vFrames.length > 1 ? vFrames.at(-1).luma - vFrames[0].luma : 0;
      const shift = deltaLuma > .12 ? ', свет усиливается' : deltaLuma < -.12 ? ', сцена темнеет' : '';
      const dyn = motion == null ? '' : motion >= .45 ? ', высокая динамика движения' : motion <= .16 ? ', спокойное движение' : ', умеренное движение';
      const dur = Number.isFinite(item.duration) && item.duration > 0 ? `${Math.round(item.duration)} с` : 'видео';
      details.push(`${index + 1} (видео · ${dur}${dyn}${shift}) — ${describe(avg)}`);
    } else if (validLight(item?.light)) {
      allFrames.push(item.light);
      details.push(`${index + 1} — ${describe(item.light)}`);
    } else {
      return null;
    }
  }
  if (!allFrames.length) return null;
  const videoMotion = motions.length ? Number((motions.reduce((a, b) => a + b, 0) / motions.length).toFixed(2)) : null;
  const deltaLuma = allFrames.length > 1 ? allFrames.at(-1).luma - allFrames[0].luma : 0;
  return {
    luma: meanOf(allFrames, 'luma'),
    contrast: meanOf(allFrames, 'contrast'),
    warmth: meanOf(allFrames, 'warmth'),
    chroma: optMean(allFrames, 'chroma'),
    darkShare: optMean(allFrames, 'darkShare'),
    brightShare: optMean(allFrames, 'brightShare'),
    dominantHue: circularMeanHue(allFrames),
    deltaLuma,
    hasVideo, videoMotion,
    detail: details.join('; ')
  };
}

// Cross-modal fusion: combine text mood evidence, punctuation cadence, and photo/video visual signals.
function fuseMood(story, photo) {
  const scores = { ...story.scores };
  const hasTextClues = story.clues.length > 0;

  if (story.exclamations > 0) {
    scores.joy += Math.min(0.8, story.exclamations * 0.35);
    scores.energy += Math.min(0.7, story.exclamations * 0.3);
  }
  if (story.ellipses > 0) {
    scores.dream += Math.min(0.75, story.ellipses * 0.35);
  }

  let visualSteered = false;
  if (photo) {
    const visualWeight = hasTextClues ? 0.42 : 1.0;
    const visual = { calm: 0, joy: 0, dream: 0, energy: 0 };

    if (photo.videoMotion != null) {
      if (photo.videoMotion >= .50) visual.energy += 1.6;
      else if (photo.videoMotion >= .36) visual.energy += 0.65;
      else if (photo.videoMotion <= .14 && photo.luma < .42) visual.dream += 1.25;
      else if (photo.videoMotion <= .18) visual.calm += 0.7;
    }

    const chroma = photo.chroma ?? 0.22;
    const darkShare = photo.darkShare ?? (photo.luma < .30 ? 0.55 : 0.15);
    const brightShare = photo.brightShare ?? (photo.luma > .68 ? 0.45 : 0.1);

    if (photo.luma > .58 && photo.warmth > .55 && chroma >= .26) visual.joy += 1.05;
    else if (photo.warmth > .56 && photo.contrast < .22) visual.calm += 0.85;

    const isWarmDarkGlow = photo.warmth >= .55 && (!Number.isFinite(photo.dominantHue) || (photo.dominantHue >= 12 && photo.dominantHue <= 58));
    if (photo.luma < .32 || darkShare >= .52) {
      if (isWarmDarkGlow) visual.calm += 1.05;
      else if (photo.contrast >= .24 && chroma >= .26) visual.energy += 1.1;
      else visual.dream += 1.05;
    }

    if (brightShare >= .44 && chroma < .20 && photo.warmth < .46) visual.dream += 0.75;

    for (const key of Object.keys(visual)) scores[key] += visual[key] * visualWeight;

    const bestVisual = Object.entries(visual).sort((a, b) => b[1] - a[1])[0];
    if (!hasTextClues && bestVisual[1] >= 0.7) visualSteered = true;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!hasTextClues && top[1] < 0.65) return { mood: 'calm', visualSteered: false };
  return { mood: top[0], visualSteered };
}

function chooseWeather({ mood, tokens }, photo) {
  const mentions = clue => tokens.some(word => clue.test(normalize(word)));

  if (mentions(weatherClues.rain)) return ['rain_glass', 'Упоминание дождя или мокрых поверхностей дало слой капель на стекле.'];
  if (mentions(weatherClues.snow)) return ['snow_drift', 'Зимние образы и снег из рассказа превращены в тихий дрейф снежинок.'];
  if (mentions(weatherClues.neon)) return ['neon_pulse', 'Городские огни и ночные витрины из рассказа задали неоновые световые шлейфы.'];
  if (mentions(weatherClues.stars)) return ['starlight', 'Ночное небо и звёзды из рассказа отражены в мерцающем звёздном слое.'];
  if (mentions(weatherClues.bokeh)) return ['amber_bokeh', 'Тёплые фонари, свечи или огни из рассказа перенесены в мягкое янтарное боке.'];
  if (mentions(weatherClues.wind)) return ['wind_sparks', 'Ветер из рассказа передан дрейфом и искрами.'];

  const isWarmGlow = photo && photo.warmth >= .55 && (!Number.isFinite(photo.dominantHue) || (photo.dominantHue >= 12 && photo.dominantHue <= 58));
  const isDarkNeonPhoto = photo && !isWarmGlow && (photo.darkShare ?? 0) >= .50 && (photo.chroma ?? 0) >= .26 && photo.contrast >= .22;
  if (photo?.videoMotion != null && photo.videoMotion >= .48 && mood !== 'calm') {
    if (isDarkNeonPhoto) return ['neon_pulse', 'Ночной контраст, насыщенные огни и динамика видео переданы световыми шлейфами мегаполиса.'];
    return ['wind_sparks', 'Активное движение в видео и динамика кадров переданы ветром и искрами.'];
  }
  if (mood === 'energy' && photo?.contrast >= .2) {
    if (isDarkNeonPhoto) return ['neon_pulse', 'Контрастные ночные кадры и высокий темп рассказа соединены в неоновом пульсе огней.'];
    return ['wind_sparks', 'Контраст снимков усиливает напряжённый ритм рассказа. В сцене появились искры и дрейф.'];
  }

  if (mentions(weatherClues.mist)) return ['mist', 'Туман из рассказа стал мягким слоем над кадром.'];
  if (mentions(weatherClues.petals)) return ['petal_drift', 'Упоминание парка, листвы или цветения задало лёгкий дрейф листьев в палитре дня.'];

  if (photo) {
    const chroma = photo.chroma ?? 0.22;
    const darkShare = photo.darkShare ?? 0;
    const brightShare = photo.brightShare ?? 0;
    const hue = photo.dominantHue;

    if (photo.luma < .28 && darkShare >= .52) {
      if (photo.warmth >= .54) return ['amber_bokeh', 'Глубокие тени и тёплые световые пятна на снимках дополнены мягким янтарным боке.'];
      return ['starlight', 'Ночная глубина и прохладная темнота кадров поддержаны тихим мерцанием звёзд.'];
    }
    if (brightShare >= .44 && photo.warmth <= .44 && chroma <= .21) {
      return ['snow_drift', 'Светлая морозная гамма снимков подсказала лёгкий дрейф снега.'];
    }
    if (photo.luma < .42 && ['calm', 'dream'].includes(mood)) {
      return ['mist', 'Приглушённый свет кадров и тихая интонация дали мягкий слой тумана.'];
    }
    if (photo.warmth > .56 && mood !== 'energy') {
      return ['warm_haze', 'Тёплый оттенок кадров усилен рассеянным золотистым светом.'];
    }
    if (chroma >= .30 && Number.isFinite(hue) && ((hue >= 74 && hue <= 156) || (hue >= 20 && hue <= 48))) {
      return ['petal_drift', 'Насыщенная природная палитра кадров дополнена мягким дрейфом листьев и лепестков.'];
    }
  }

  return ['clear_light', 'Ясный свет оставляет оттенки кадров различимыми и слегка подсвечивает верх композиции.'];
}

export function analyzeRuleAtmosphere(input) {
  const { text } = validateAtmosphereInput(input);
  const story = textProfile(text);
  const photo = photoProfile(input.photos);
  const { title, quote, coverText, clues } = story;
  const { mood, visualSteered } = fuseMood(story, photo);
  const [weatherType, weatherNote] = chooseWeather({ ...story, mood }, photo);
  const tone = tones[mood];
  const motionDelta = photo?.videoMotion != null ? (photo.videoMotion - .32) * .35 : 0;
  const cadenceDelta = Math.min(.09, story.exclamations * .035) - Math.min(.06, story.ellipses * .025);
  const energy = clamp(tone.base + Math.min(.12, Math.max(0, clues.length - 1) * .025) + motionDelta + cadenceDelta);
  return {
    title, quote, coverText, mood, weatherType,
    warmth: Number(((photo?.warmth ?? .5) * .7 + (mood === 'joy' || mood === 'calm' ? .66 : .34) * .3).toFixed(2)),
    energy: Number(energy.toFixed(2)),
    ...(photo?.videoMotion != null ? { videoMotion: photo.videoMotion } : {}),
    explanation: [
      (story.muted ? 'Учтено отрицание «' + story.muted + '». ' : '') + (clues.length
        ? `Слова «${clues.slice(0, 4).join('», «')}» подсказали режим «${tone.label}». Цитата взята дословно из рассказа.`
        : photo?.hasVideo && photo.videoMotion >= .50
          ? 'Высокая динамика движения в видео задала энергичный режим и дословную цитату из рассказа.'
          : visualSteered
            ? `Свет и цветовая насыщенность кадров подсказали режим «${tone.label}», цитата взята дословно из рассказа.`
            : 'В рассказе мало явных признаков настроения. Выбрана спокойная композиция и дословная цитата.'),
      (photo?.hasVideo ? 'Палитра и динамика извлечены из ключевых кадров видео и фото.' : 'Основные оттенки всех снимков образуют палитру открытки.') +
        (photo ? ' Свет по кадрам: ' + photo.detail + '.' : ''),
      weatherNote
    ]
  };
}
