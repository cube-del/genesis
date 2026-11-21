import { validateAtmosphereInput } from './atmosphere.mjs';
import { coverTextLimit, quoteFragments } from './cover-text.mjs';

const tones = {
  calm: { base: .22, label: 'спокойствие', signs: /^(тих|спокой|нетороп|медлен|мягк|уют|тепл|какао|чай|закат|вечер|calm|quiet|slow|soft|warm|sunset)/iu },
  joy: { base: .63, label: 'радость', signs: /^(радост|радова|весел|сме[хя]|смеял|улыб|празд|встреч|обня|счаст|танц|аплод|joy|laugh|smile|happy|celebrat|dance)/iu },
  dream: { base: .36, label: 'мечтательность', signs: /^(задум|вспом|мечт|одино|пуст|туман|сумер|снил|луна|эхо|воспомин|груст|печал|расстав|тоск|скуча|утрат|dream|remember|wonder|mist|moon|echo)/iu },
  energy: { base: .84, label: 'энергия', signs: /^(напряж|сроч|тревож|испуг|страш|дедлайн|сдач|рыв|бег|беж|гон|спеш|успет|сирен|резк|ночь|deadline|rush|race|tense|fast|urgent)/iu }
};
const weatherClues = {
  rain: /^(дожд|капл|ливен|луж|мокр|rain|puddle|drizzl)/iu,
  wind: /^(ветер|ветр|порыв|искр|wind|gust|spark)/iu,
  mist: /^(туман|дымк|мгл|fog|mist)/iu
};
const words = value => value.match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu) || [];
const normalize = word => word.toLowerCase().replaceAll('ё', 'е');
const score = value => Number.isFinite(value) && value >= 0 && value <= 1;
const shortLine = (text, limit) => {
  if (Array.from(text).length <= limit) return text;
  const prefix = Array.from(text).slice(0, limit - 1).join('');
  return (prefix.replace(/\s+\S*$/u, '') || prefix).replace(/[\s,;:–—-]+$/u, '') + '…';
};

const connector = /^(?:и|а|но|о|об|у|к|в|во|на|из|с|со|за|до|для|по|под|над|между|как|что|когда|чтобы|перед|the|a|and|or|at|of|in|with)$/iu;
const filler = /^(?:я|мы|они|он|она|это|был[аио]?|были|сегодня|тогда|просто|очень|потом|вдруг|пошли|шли|домой|было|день|it|we|was|went|today)$/iu;
const modifier = /^(?:так|очень|совсем|особенно|слишком|такая|такой|было|был|была|были|стало|оказалась|оказался|any|very|really)$/iu;

// Evaluate negation within a clause. A contrast or a new sentence starts a new scope.
function readStory(text) {
  const evidence = Object.fromEntries(Object.keys(tones).map(mood => [mood, new Map()]));
  const present = [], muted = [];
  let weight = 1;
  for (const clause of text.split(/([.!?;\n]+|[,—:]|(?<!\p{L})(?:но|зато|однако|but|yet)(?!\p{L}))/iu)) {
    if (/^(?:но|зато|однако|but|yet)$/iu.test(clause)) { weight = 1.65; continue; }
    if (/^[.!?;\n]/u.test(clause)) weight = 1;
    const terms = words(clause);
    let negated = false, remaining = 0, start = 0;
    terms.forEach((word, index) => {
      const token = normalize(word);
      if (/^(?:не|ни|без|нет|not|no|without)$/u.test(token)) {
        negated = !/^(?:только|лишь|only)$/iu.test(terms[index + 1] || '');
        remaining = 2; start = index;
        return;
      }
      if (/^(?:и|а|and)$/u.test(token)) negated = false;
      const absent = negated || /^(?:не (?:было|стало)|нет)(?: |$)/iu.test(terms.slice(index + 1, index + 3).join(' '));
      if (!absent) present.push(word);
      for (const [mood, tone] of Object.entries(tones)) {
        if (!tone.signs.test(token)) continue;
        if (absent) {
          muted.push(negated ? terms.slice(start, index + 1).join(' ') : terms.slice(index, index + 3).join(' '));
        } else {
          const clues = evidence[mood];
          clues.set(word, Math.max(clues.get(word) || 0, weight));
        }
      }
      if (!modifier.test(token)) {
        // An adjective can negate its noun too («не радостная встреча»).
        const adjective = /(?:ая|яя|ую|юю|ый|ий|ой|ые|ие|ое|ее|ых|их|ого|ему|ому)$/iu.test(token);
        if (--remaining <= 0 || !adjective) negated = false;
      }
    });
  }
  const totals = Object.entries(evidence).map(([mood, clues]) =>
    ({ mood, clues: [...clues.keys()], value: [...clues.values()].reduce((a, b) => a + b, 0) }));
  const best = totals.sort((a, b) => b.value - a.value)[0];
  return { ...best, tokens: present, muted: muted.at(-1) };
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
    return { quote, rank: Math.min(hits, 3) * 1.8 + Math.min(6, detailScore(terms)) * .6 +
      (terms.length >= 3 ? 1 : 0) - Math.max(0, terms.length - 14) * .17 };
  }).sort((a, b) => b.rank - a.rank)[0].quote;
  return { ...story, title: dayTitle(fragments, chosen), quote: chosen, coverText: shortLine(chosen.replace(/\s+/gu, ' '), coverTextLimit) };
}

function photoProfile(photos) {
  const frames = photos.map(photo => photo?.light);
  if (!frames.every(frame => frame && score(frame.luma) && score(frame.contrast) && score(frame.warmth))) return null;
  const mean = key => frames.reduce((total, frame) => total + frame[key], 0) / frames.length;
  const describe = ({ luma, warmth }) => {
    const light = luma < .36 ? 'приглушённый свет' : luma > .57 ? 'много светлых участков' : 'средняя светлота';
    const tint = warmth > .56 ? 'тёплый оттенок' : warmth < .46 ? 'прохладный оттенок' : 'нейтральный оттенок';
    return light + ', ' + tint;
  };
  return {
    luma: mean('luma'), contrast: mean('contrast'), warmth: mean('warmth'),
    detail: frames.map((frame, index) => `${index + 1} — ${describe(frame)}`).join('; ')
  };
}

function chooseWeather({ mood, tokens }, photo) {
  const mentions = clue => tokens.some(word => clue.test(normalize(word)));
  if (mentions(weatherClues.rain)) return ['rain_glass', 'Упоминание дождя или мокрых поверхностей дало слой капель на стекле.'];
  if (mentions(weatherClues.wind)) return ['wind_sparks', 'Ветер из рассказа передан дрейфом и искрами.'];
  if (mood === 'energy' && photo?.contrast >= .2) {
    return ['wind_sparks', 'Контраст снимков усиливает напряжённый ритм рассказа. В сцене появились искры и дрейф.'];
  }
  if (mentions(weatherClues.mist)) return ['mist', 'Туман из рассказа стал мягким слоем над кадром.'];
  if (photo?.luma < .42 && ['calm', 'dream'].includes(mood)) {
    return ['mist', 'Приглушённый свет снимков и тихая интонация дали мягкий слой тумана.'];
  }
  if (photo && photo.warmth > .56 && mood !== 'energy') return ['warm_haze', 'Тёплый оттенок снимков усилен рассеянным золотистым светом.'];
  return ['clear_light', 'Ясный свет оставляет оттенки снимков различимыми и слегка подсвечивает верх кадра.'];
}

export function analyzeRuleAtmosphere(input) {
  const { text } = validateAtmosphereInput(input);
  const story = textProfile(text);
  const photo = photoProfile(input.photos);
  const { title, quote, coverText, mood, clues } = story;
  const [weatherType, weatherNote] = chooseWeather(story, photo);
  const tone = tones[mood];
  return {
    title, quote, coverText, mood, weatherType,
    warmth: Number(((photo?.warmth ?? .5) * .7 + (mood === 'joy' || mood === 'calm' ? .66 : .34) * .3).toFixed(2)),
    energy: Number((tone.base + Math.min(.12, Math.max(0, clues.length - 1) * .025)).toFixed(2)),
    explanation: [
      (story.muted ? 'Учтено отрицание «' + story.muted + '». ' : '') + (clues.length
        ? `Слова «${clues.slice(0, 4).join('», «')}» подсказали режим «${tone.label}». Цитата взята дословно из рассказа.`
        : 'В рассказе мало явных признаков настроения. Выбрана спокойная композиция и дословная цитата.'),
      'Основные оттенки всех снимков образуют палитру открытки.' + (photo ? ' Свет по кадрам: ' + photo.detail + '.' : ''),
      weatherNote
    ]
  };
}
