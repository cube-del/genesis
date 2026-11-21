import { validateAtmosphereInput } from './atmosphere.mjs';
import { coverTextLimit, quoteFragments } from './cover-text.mjs';

const tones = {
  calm: { base: .22, label: 'спокойствие', signs: /^(тих|спокой|нетороп|медлен|мягк|уют|тепл|какао|чай|закат|вечер|calm|quiet|slow|soft|warm|sunset)/iu },
  joy: { base: .63, label: 'радость', signs: /^(радост|весел|сме[хя]|смеял|улыб|празд|встреч|обня|счаст|танц|аплод|joy|laugh|smile|happy|celebrat|dance)/iu },
  dream: { base: .36, label: 'мечтательность', signs: /^(задум|вспом|мечт|одино|пуст|туман|сумер|снил|луна|эхо|воспомин|dream|remember|wonder|mist|moon|echo)/iu },
  energy: { base: .84, label: 'энергия', signs: /^(напряж|сроч|дедлайн|сдач|рыв|бег|беж|гон|спеш|успет|сирен|резк|ночь|deadline|rush|race|tense|fast|urgent)/iu }
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

function dayTitle(fragments, quote) {
  const joins = /^(и|а|но|о|об|у|к|в|во|на|из|с|со|за|до|для|по|под|над|между|как|что|когда|чтобы|the|a|and|or|at|of|in|with)$/iu;
  const pinned = fragments.flatMap(part => part.split(/[,;:.!?…—]+/u)).map(words)
    .find(part => part.length >= 3 && part.length <= 7 &&
      part.every(word => word.length <= 24) && !joins.test(part.at(-1)));
  const terms = pinned || words(quote).filter(word => word.length <= 24).slice(0, 7);
  while (terms.length > 3 && joins.test(terms.at(-1))) terms.pop();
  if (terms.length < 3) return terms.length ? 'День в памяти «' + terms.join(' ') + '»' : 'Память дня в дневнике';
  const title = terms.join(' ');
  return title[0].toUpperCase() + title.slice(1);
}

function textProfile(text) {
  const tokens = words(text);
  const evidence = Object.entries(tones).map(([mood, tone]) => {
    const clues = [...new Map(tokens.filter(word => tone.signs.test(normalize(word)))
      .map(word => [normalize(word), word])).values()];
    return { mood, clues };
  }).sort((a, b) => b.clues.length - a.clues.length);
  const { mood, clues } = evidence[0];
  const fragments = quoteFragments(text);
  const chosen = fragments.map(quote => {
    const terms = words(quote), size = terms.length;
    const hits = terms.filter(word => tones[mood].signs.test(normalize(word))).length;
    return { quote, rank: Math.min(hits, 4) * 3 + (size >= 3 ? 2 : 0) + Math.min(size, 12) / 12 - Math.max(0, size - 18) / 30 };
  }).sort((a, b) => b.rank - a.rank)[0].quote;
  return {
    title: dayTitle(fragments, chosen), quote: chosen,
    coverText: shortLine(chosen.replace(/\s+/gu, ' '), coverTextLimit), mood, clues, tokens
  };
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
      clues.length
        ? `Слова «${clues.slice(0, 4).join('», «')}» подсказали режим «${tone.label}». Цитата взята дословно из рассказа.`
        : 'В рассказе мало явных признаков настроения. Выбрана спокойная композиция и дословная цитата.',
      'Основные оттенки всех снимков образуют палитру открытки.' + (photo ? ' Свет по кадрам: ' + photo.detail + '.' : ''),
      weatherNote
    ]
  };
}
