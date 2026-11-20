import { api } from './ui.js';

const bound = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const normalize = text => text.toLocaleLowerCase('ru').replaceAll('ё', 'е');
const words = text => text.match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu) || [];
const matchCount = (tokens, patterns) => tokens.filter(word => patterns.some(prefix => word.startsWith(prefix))).length;
const tones = {
  calm: ['тих', 'тишин', 'неж', 'спокой', 'медл', 'книг', 'читал', 'какао', 'домашн', 'выдох', 'уют', 'чашк', 'плед', 'отдых', 'peace', 'calm', 'quiet'],
  joy: ['друз', 'люб', 'семь', 'счаст', 'радо', 'улыб', 'смея', 'смех', 'обня', 'праздн', 'встрет', 'тепл', 'вместе', 'happy', 'friends', 'laugh'],
  dream: ['дожд', 'скуч', 'туман', 'печал', 'грус', 'ностальг', 'вспом', 'одино', 'мечт', 'снил', 'ноч', 'разлук', 'слез', 'dream', 'rain', 'miss'],
  energy: ['танц', 'концерт', 'бег', 'беж', 'велосип', 'прыг', 'шум', 'гром', 'мч', 'ритм', 'фестив', 'сцен', 'матч', 'движ', 'dance', 'party', 'run'],
};
const scenes = [
  [['коф', 'каф', 'какао'], 'За чашкой у окна'],
  [['парк', 'листв', 'алле'], 'По тропинкам старого парка'],
  [['прогул', 'гуля', 'пешком'], 'Там, где мы гуляли'],
  [['мор', 'пляж', 'волн', 'берег'], 'У самой кромки воды'],
  [['поезд', 'вагон', 'перрон'], 'За окном поезда'],
  [['книг', 'читал', 'читат', 'библиотек'], 'Между страницами любимой книги'],
  [['дожд', 'луж', 'ливен'], 'Пока за окном дождь'],
  [['концерт', 'фестив', 'сцен'], 'До последней ноты'],
  [['велосип', 'беж', 'пробеж', 'бег'], 'В ритме долгой дороги'],
  [['музей', 'галере', 'выставк'], 'Среди картин и света'],
  [['кухн', 'пекл', 'пирог', 'готовил'], 'Тепло на нашей кухне'],
  [['друз', 'встрет', 'обня', 'родным'], 'Время для близких людей'],
  [['лес', 'елк', 'сосн', 'деревь'], 'Под кронами высоких деревьев'],
  [['горн', 'горы', 'вершин'], 'На высоте среди облаков'],
  [['рассвет', 'утрен', 'утром'], 'Когда просыпается город'],
  [['закат', 'сумерк', 'вечер'], 'Пока не погас свет'],
];
const fallbacks = { calm: 'Тихие мгновения этого дня', joy: 'Маленькие радости этого дня', dream: 'То, что хочется запомнить', energy: 'День в быстром ритме' };
const modeNames = { calm: 'минимализм с матовой бумагой', dream: 'кино с мягким плёночным зерном', joy: 'импрессионизм с мягкими мазками', energy: 'геометрию с чёткими плоскостями' };
const ambientTitles = {
  calm: ['Тихие касания', 'Воздух в комнате', 'Свет сквозь шторы', 'Белые поля'],
  dream: ['Синие сумерки', 'Письма в тумане', 'Эхо вдали', 'После дождя'],
  joy: ['Солнечные блики', 'Зелёный полдень', 'Чай на двоих', 'Лёгкий свет'],
  energy: ['Пульс города', 'Точки движения', 'Быстрый маршрут', 'За поворотом'],
};
const tempos = { calm: [66, 72, 68, 76], dream: [69, 77, 73, 81], joy: [92, 98, 88, 104], energy: [122, 128, 116, 134] };

function hash(value) {
  let result = 7;
  for (const c of String(value)) result = (Math.imul(result, 31) + c.charCodeAt(0)) >>> 0;
  return result;
}

function photoSamples(img) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 54;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 54, 54);
  const values = ctx.getImageData(0, 0, 54, 54).data;
  const samples = [];
  for (let i = 0; i < values.length; i += 8) {
    if (values[i + 3] >= 110) samples.push([values[i], values[i + 1], values[i + 2]]);
  }
  return samples;
}

const distance = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const hex = rgb => '#' + rgb.map(c => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase();

function colorProfile(pixels) {
  if (!pixels.length) return { palette: ['#FFFFFF'], warmth: 0.5, light: 1, saturation: 0 };
  const centers = [pixels[Math.floor(pixels.length / 2)]];
  while (centers.length < 5) {
    let best = null, farthest = 100;
    for (const sample of pixels) {
      const d = Math.min(...centers.map(center => distance(center, sample)));
      if (d > farthest) { best = sample; farthest = d; }
    }
    if (!best) break;
    centers.push(best);
  }
  let sums;
  for (let pass = 0; pass < 7; pass++) {
    sums = centers.map(() => [0, 0, 0, 0]);
    for (const sample of pixels) {
      let index = 0, nearest = Infinity;
      centers.forEach((center, i) => {
        const d = distance(center, sample);
        if (d < nearest) { index = i; nearest = d; }
      });
      const acc = sums[index];
      acc[0] += sample[0]; acc[1] += sample[1]; acc[2] += sample[2]; acc[3]++;
    }
    sums.forEach((sum, i) => { if (sum[3]) centers[i] = sum.slice(0, 3).map(c => c / sum[3]); });
  }
  const palette = centers.map((rgb, i) => [hex(rgb), sums[i][3]]).filter(pair => pair[1]).sort((a, b) => b[1] - a[1]).map(pair => pair[0]);
  let warmth = 0, light = 0, saturation = 0;
  for (const [r, g, b] of pixels) {
    warmth += (r - b) / 300;
    light += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    saturation += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  }
  return { palette, warmth: bound(0.5 + warmth / pixels.length), light: light / pixels.length, saturation: saturation / pixels.length };
}

export async function analyzeDay(text, photos) {
  const groups = await Promise.all(photos.map(async photo => {
    const img = new Image();
    img.src = photo.src;
    try { await img.decode(); } catch { throw Error('Браузер не смог прочитать фото «' + photo.name + '». Загрузите JPEG, PNG или WebP.'); }
    return photoSamples(img);
  }));
  const profile = colorProfile(groups.flat());
  const tokens = words(normalize(text));
  const scores = {
    calm: (1 - profile.saturation) * 0.65 + 0.12,
    joy: profile.warmth * 0.65 + profile.light * 0.32,
    dream: (1 - profile.light) * 0.8 + (1 - profile.warmth) * 0.22,
    energy: profile.saturation * 0.94,
  };
  for (const category of Object.keys(scores)) scores[category] += matchCount(tokens, tones[category]);
  const mood = Object.keys(scores).sort((a, b) => scores[b] - scores[a])[0];
  const textEnergy = ({ calm: 0.23, dream: 0.34, joy: 0.61, energy: 0.86 })[mood];
  const energy = bound(textEnergy * 0.78 + profile.saturation * 0.22);
  const warmth = bound(profile.warmth * 0.69 + ({ calm: 0.65, joy: 0.91, dream: 0.35, energy: 0.64 })[mood] * 0.31);
  const sentences = text.trim().split(/(?<=[.?!…])\s+|\n+/u).filter(Boolean);
  const rank = s => matchCount(words(normalize(s)), tones[mood]) * 1.3 + (s.length >= 18 && s.length < 160 ? 1 : 0);
  const sentence = [...sentences].sort((a, b) => rank(b) - rank(a))[0] || text;
  const quote = sentence.length <= 170 ? sentence : sentence.slice(0, 166).replace(/\s+\S*$/, '') + '…';
  const scene = scenes.map(([patterns, title]) => [matchCount(tokens, patterns), title]).sort((a, b) => b[0] - a[0])[0];
  const firstWords = words(sentences[0] || '');
  let title = scene[0] ? scene[1] : fallbacks[mood];
  if (firstWords.length >= 3 && firstWords.length <= 7 && firstWords.join(' ').length < 120 && /\p{Script=Cyrillic}/u.test(firstWords.join(' '))) {
    title = firstWords.join(' ');
    title = title[0].toLocaleUpperCase('ru') + title.slice(1);
  }
  const rainy = matchCount(tokens, ['дожд', 'ливен', 'ливн', 'луж', 'rain']);
  const weatherType = rainy ? 'rain_glass' : mood === 'energy' ? 'wind_sparks' : (profile.light < 0.38 || mood === 'dream') ? 'mist' : warmth > 0.55 ? 'warm_haze' : 'clear_light';
  const weather = { rain_glass: 'Дождь на стекле', wind_sparks: 'Ветер и искры', mist: 'Туман', warm_haze: 'Тёплая дымка', clear_light: 'Ясный свет' }[weatherType];
  const weatherReason = {
    rain_glass: 'Упоминание дождя в записи превращается в капли на стекле.',
    wind_sparks: 'Подвижный ритм рассказа добавляет в кадр искры и ветер.',
    mist: 'Приглушённый свет или задумчивый тон рассказа добавляют лёгкий туман.',
    warm_haze: 'Тёплые оттенки и мягкий тон записи превращаются в золотую дымку.',
    clear_light: 'Светлые открытые тона снимков сохраняют в кадре ощущение воздуха.',
  }[weatherType];
  const hints = [...new Set(tokens.filter(t => tones[mood].some(prefix => t.startsWith(prefix))))].slice(0, 3);
  const explanation = [
    (hints.length ? 'Слова «' + hints.join('», «') + '» в рассказе определили ' : 'Сочетание света и цветовой насыщенности определило ') + modeNames[mood] + '.',
    'Палитра взята из ' + (photos.length === 1 ? 'снимка' : 'всех снимков') + '. Преобладающий тон ' + profile.palette[0] + ', средняя светлота ' + Math.round(profile.light * 100) + '%.',
    weatherReason,
  ];
  return { title, quote, mood, warmth, energy, weather, weatherType, palette: profile.palette, explanation };
}

export async function pickTrack(day, previousTrack) {
  const mood = Object.hasOwn(ambientTitles, day.mood) ? day.mood : 'calm';
  let variant = ((previousTrack?.variant ?? (hash(day.title + day.date) % 4 - 1)) + 1) % 4;
  if (!previousTrack) {
    const recent = day.recentTracks || [];
    for (let step = 0; step < 3 && recent.some(t => t.title === ambientTitles[mood][variant]); step++) variant = (variant + 1) % 4;
  }
  const rhythm = { calm: 'редкие мягкие удары', dream: 'размеренный пульс', joy: 'лёгкий подвижный ритм', energy: 'быстрый плотный пульс' }[mood];
  try {
    const catalog = await api('/api/music?' + new URLSearchParams({ mood, variant }), { signal: AbortSignal.timeout(6500) });
    if (catalog.track?.src && catalog.track.title !== previousTrack?.title) return { ...catalog.track, reason: 'Трек из Spotify подобран по атмосфере записи.' };
  } catch { /* The original score is available offline. */ }
  return { kind: 'ambient', title: ambientTitles[mood][variant], artist: 'DayTrace Studio', bpm: tempos[mood][variant], variant,
    reason: 'В этой оригинальной композиции ' + rhythm + ' поддерживает настроение записи.' };
}

export function fileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error('Не удалось прочитать файл «' + file.name + '».'));
    reader.readAsDataURL(file);
  });
}

// Goertzel bins across four octaves form a chromagram. Compare its pitch-class
// distribution with all transpositions of the Krumhansl–Schmuckler profiles.
function tonalMode(buffer, length) {
  const stride = Math.max(1, Math.floor(buffer.sampleRate / 6000));
  const rate = buffer.sampleRate / stride, frameSize = 2048;
  const signal = buffer.getChannelData(0), frame = new Float32Array(frameSize), chroma = new Float64Array(12);
  const notes = Array.from({ length: 48 }, (_, i) => {
    const midi = 36 + i, hz = 440 * 2 ** ((midi - 69) / 12);
    return { pitch: midi % 12, coeff: 2 * Math.cos(2 * Math.PI * hz / rate) };
  });
  const window = Float32Array.from({length: frameSize}, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (frameSize - 1)));
  const step = Math.max(frameSize * stride, Math.floor(length / 24));
  for (let start = 0; start + frameSize * stride <= length; start += step) {
    for (let i = 0; i < frameSize; i++) {
      let sum = 0;
      for (let j = 0; j < stride; j++) sum += signal[start + i * stride + j];
      frame[i] = sum / stride * window[i];
    }
    for (const { pitch, coeff } of notes) {
      let prev = 0, older = 0;
      for (let i = 0; i < frameSize; i++) {
        const current = frame[i] + coeff * prev - older;
        older = prev; prev = current;
      }
      chroma[pitch] += Math.sqrt(Math.max(0, prev * prev + older * older - coeff * prev * older));
    }
  }
  const largest = Math.max(...chroma);
  if (largest < 0.01 || chroma.filter(x => x > largest * 0.21).length < 3) return null;
  const profiles = {
    major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    minor: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  };
  const mean = chroma.reduce((a, b) => a + b, 0) / 12;
  const best = {};
  for (const [mode, profile] of Object.entries(profiles)) {
    const pMean = profile.reduce((a, b) => a + b, 0) / 12;
    best[mode] = -1;
    for (let root = 0; root < 12; root++) {
      let corr = 0, p2 = 0, c2 = 0;
      for (let i = 0; i < 12; i++) {
        const p = profile[i] - pMean, c = chroma[(i + root) % 12] - mean;
        corr += p * c; p2 += p * p; c2 += c * c;
      }
      best[mode] = Math.max(best[mode], corr / (Math.sqrt(p2 * c2) || 1));
    }
  }
  if (Math.max(best.major, best.minor) < 0.45 || Math.abs(best.major - best.minor) < 0.06) return null;
  return best.major > best.minor ? 'major' : 'minor';
}

// Compare the onset envelope with delayed copies to estimate the musical pulse.
// No tempo is reported for silence, unpitched noise or an ambiguous pulse.
export function audioSignals(buffer) {
  const rate = buffer.sampleRate, hop = Math.max(1, Math.round(rate / 100));
  const length = Math.min(buffer.length, Math.floor(rate * 30));
  if (length < hop * 30) return { bpm: null };
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const envelope = [], levels = [];
  let windowPower = 0;
  let preceding = 0, precedingHigh = 0, total = 0, crossings = 0, last = 0;
  for (let start = 0; start + hop <= length; start += hop) {
    let power = 0, treble = 0;
    for (let i = start; i < start + hop; i++) {
      let x = 0;
      for (const channel of channels) x += channel[i] / channels.length;
      power += x * x;
      treble += (x - last) ** 2;
      if ((last < 0) !== (x < 0)) crossings++;
      last = x;
    }
    total += power; windowPower += power;
    const rms = Math.sqrt(power / hop), high = Math.sqrt(treble / hop);
    envelope.push(Math.max(0, rms - preceding) + Math.max(0, high - precedingHigh) * 0.6);
    if (envelope.length % 8 === 0) {
      levels.push(Math.sqrt(windowPower / (8 * hop))); windowPower = 0;
    }
    preceding = rms; precedingHigh = high;
  }
  const energy = bound(Math.sqrt(total / length) * 3.4);
  const brightness = bound(crossings / length * rate / 7200);
  let bpm = null, highest = 0;
  const avg = envelope.reduce((a, b) => a + b, 0) / envelope.length;
  levels.sort((a, b) => a - b);
  const quiet = levels[Math.floor(levels.length * 0.1)] || 0;
  const loud = levels[Math.floor(levels.length * 0.9)] || 0;
  if (avg > 0.00015 && loud - quiet > 0.08 * loud && envelope.length >= 300) {
    for (let lag = 33; lag <= 100; lag++) {
      let corr = 0, a2 = 0, b2 = 0;
      for (let i = lag; i < envelope.length; i++) {
        const a = envelope[i] - avg, b = envelope[i - lag] - avg;
        corr += a * b; a2 += a * a; b2 += b * b;
      }
      const score = corr / Math.sqrt(a2 * b2 || 1) * (1 - 0.035 * Math.abs(Math.log2(60 / lag)));
      if (score > highest) { highest = score; bpm = Math.round(60 * rate / (hop * lag)); }
    }
  }
  return { bpm: highest > 0.18 ? bpm : null, energy, brightness, mode: energy > 0.008 ? tonalMode(buffer, length) : null };
}

export async function localTrack(file) {
  const audio = { kind: 'file', src: await fileData(file), title: file.name.replace(/\.[^.]+$/, ''), artist: 'Ваш аудиофайл', bpm: null };
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (AudioContext) {
    const ctx = new AudioContext();
    try { Object.assign(audio, audioSignals(await ctx.decodeAudioData(await file.arrayBuffer()))); }
    catch { throw Error('Не удалось прочитать аудио. Попробуйте MP3 или WAV.'); }
    finally { await ctx.close().catch(() => {}); }
  }
  audio.reason = audio.bpm ? 'В первых 30 секундах аудио измерен темп около ' + audio.bpm + ' BPM.' : 'Вы выбрали этот звук. Чёткий темп в записи не определён.';
  if (audio.mode) audio.reason += ' По распределению нот вероятен ' + (audio.mode === 'major' ? 'мажор' : 'минор') + '.';
  return audio;
}
