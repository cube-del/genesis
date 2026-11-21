import { api } from './ui.js';
import { frameComposition } from './composition.js';

const bound = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));

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

function photoLight(samples) {
  const count = samples.length || 1;
  let light = 0, lightSquared = 0, tint = 0;
  for (const [r, g, b] of samples) {
    const luma = (.2126 * r + .7152 * g + .0722 * b) / 255;
    light += luma;
    lightSquared += luma ** 2;
    tint += (r - b) / 255;
  }
  const luma = light / count;
  return { luma, contrast: Math.sqrt(Math.max(0, lightSquared / count - luma ** 2)), warmth: bound(.5 + tint / count) };
}

const distance = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const hex = rgb => '#' + rgb.map(c => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase();

function colorProfile(pixels) {
  if (!pixels.length) return ['#FFFFFF'];
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
  return centers.map((rgb, i) => [hex(rgb), sums[i][3]]).filter(pair => pair[1]).sort((a, b) => b[1] - a[1]).map(pair => pair[0]);
}

const weatherNames = { rain_glass: 'Дождь на стекле', wind_sparks: 'Ветер и искры', mist: 'Туман', warm_haze: 'Тёплая дымка', clear_light: 'Ясный свет' };

async function preparePhoto(photo) {
  const img = new Image();
  img.src = photo.src;
  try { await img.decode(); } catch { throw Error('Не удалось открыть фото «' + photo.name + '». Попробуйте JPEG, PNG или WebP.'); }
  const scale = Math.min(1, 768 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { src: canvas.toDataURL('image/jpeg', 0.8), samples: photoSamples(canvas) };
}

export async function analyzeDay(text, photos, { date, expectedProvider, signal, onPrepared } = {}) {
  const frames = await Promise.all(photos.map(preparePhoto));
  signal?.throwIfAborted();
  const palette = colorProfile(frames.flatMap(frame => frame.samples));
  onPrepared?.();
  const body = { date, text, expectedProvider, photos: frames.map(({ src, samples }) => ({ src, light: photoLight(samples) })) };
  const result = await api('/api/atmosphere', { method: 'POST', body, signal });
  const focus = photos[0]?.focus;
  if (focus && result.explanation?.length >= 2) {
    const layout = frameComposition(photos[0], result.mood);
    const horizontal = { left: 'слева', right: 'справа', center: 'по центру' }[layout.align];
    const detail = focus.manual ? 'центр кадра выбрали вы' : 'центр кадра выбран по цветовым границам и контрасту';
    result.explanation[1] += ' На обложке ' + detail + '. Подпись ' + (layout.top ? 'сверху' : 'снизу') + ', ' + horizontal + '.';
  }
  return { ...result, weather: weatherNames[result.weatherType], palette };
}

export async function pickTrack(day, previousTrack, signal) {
  const variant = previousTrack ? (Number(previousTrack.variant) || 0) + 1 : 0;
  const query = new URLSearchParams({ mood: day.mood, warmth: day.warmth, energy: day.energy, variant });
  if (previousTrack?.url) query.set('previous', previousTrack.url);
  for (const track of day.recentTracks || []) {
    if (track?.url) query.append('recent', track.url);
  }
  const { track } = await api('/api/music?' + query, { signal });
  if (!track?.url) throw Error('Не удалось подобрать трек Spotify. Попробуйте ещё раз.');
  return track;
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

function pulseBpm(pulse, rate, hop) {
  const average = pulse.reduce((a, b) => a + b, 0) / pulse.length;
  const correlations = [];
  for (let lag = 32; lag <= 101; lag++) {
    let corr = 0, a2 = 0, b2 = 0;
    for (let i = lag; i < pulse.length; i++) {
      const a = pulse[i] - average, b = pulse[i - lag] - average;
      corr += a * b; a2 += a * a; b2 += b * b;
    }
    correlations[lag] = corr / Math.sqrt(a2 * b2 || 1);
  }
  const peaks = [];
  for (let lag = 33; lag <= 100; lag++) {
    if (correlations[lag] >= correlations[lag - 1] && correlations[lag] >= correlations[lag + 1]) peaks.push(lag);
  }
  const strongest = peaks.reduce((best, lag) => correlations[lag] > correlations[best] ? lag : best, peaks[0]);
  if (average > .00015 && correlations[strongest] > .22) {
    const lag = peaks.find(candidate => correlations[candidate] >= correlations[strongest] - .07 &&
      Math.abs(strongest - candidate * Math.round(strongest / candidate)) <= 2) ?? strongest;
    const before = correlations[lag - 1], peak = correlations[lag], after = correlations[lag + 1];
    const offset = before + after === 2 * peak ? 0 : .5 * (before - after) / (before - 2 * peak + after);
    return Math.round(60 * rate / (hop * (lag + offset)));
  }
  return null;
}

// Compare the onset envelope with delayed copies to estimate the musical pulse.
// No tempo is reported for silence, unpitched noise or an ambiguous pulse.
function analyzeExcerpt(buffer, includeMode = true) {
  const rate = buffer.sampleRate, hop = Math.max(1, Math.round(rate / 100));
  const length = Math.min(buffer.length, Math.floor(rate * 30));
  if (length < hop * 30) return { bpm: null };
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const envelope = [], highs = [], levels = [];
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
    highs.push(Math.max(0, high - precedingHigh));
    envelope.push(Math.max(0, rms - preceding) + Math.max(0, high - precedingHigh) * 0.6);
    if (envelope.length % 8 === 0) {
      levels.push(Math.sqrt(windowPower / (8 * hop))); windowPower = 0;
    }
    preceding = rms; precedingHigh = high;
  }
  const energy = bound(Math.sqrt(total / length) * 3.4);
  const brightness = bound(crossings / length * rate / 7200);
  let bpm = null, pulseStatus = 'weak';
  levels.sort((a, b) => a - b);
  const quiet = levels[Math.floor(levels.length * 0.1)] || 0;
  const loud = levels[Math.floor(levels.length * 0.9)] || 0;
  if (loud - quiet > 0.08 * loud && envelope.length >= 300) {
    // Smooth adjacent bins so that a beat falling between two bins does not
    // give its double-length lag a systematic advantage.
    const smooth = bins => bins.map((value, index) =>
      ((bins[index - 1] || 0) + 2 * value + (bins[index + 1] || 0)) / 4);
    const pulse = smooth(envelope), treblePulse = smooth(highs);
    const sections = [], highSections = [];
    for (let start = 0; start + 600 <= pulse.length; start += 300) {
      sections.push(pulseBpm(pulse.slice(start, start + 600), rate, hop));
      highSections.push(pulseBpm(treblePulse.slice(start, start + 600), rate, hop));
    }
    const globalBpm = pulseBpm(pulse, rate, hop);
    const reliable = sections.filter(Number.isFinite);
    // Hi-hat and snare can change metre while the kick repeats its old subdivision.
    const highVotes = highSections.filter(Number.isFinite);
    const differentMetre = highVotes.length >= 2 && highVotes.filter(value => globalBpm &&
      [0.5, 1, 2].every(multiple => Math.abs(value / globalBpm / multiple - 1) > .06)).length > highVotes.length / 2;
    const octaveConflict = globalBpm && highVotes.length >= 3 && highVotes.filter(value =>
      [.5, 2].some(multiple => Math.abs(value / globalBpm / multiple - 1) < .055)).length > highVotes.length / 2;
    if (octaveConflict) {
      pulseStatus = 'ambiguous';
    } else if (!differentMetre && globalBpm && (sections.length < 2 || (reliable.length >= Math.ceil(sections.length * .6) &&
        reliable.filter(value => Math.abs(value / globalBpm - 1) <= .055).length >= reliable.length * .75))) {
      bpm = globalBpm;
    } else if (!globalBpm && highVotes.length >= 3 && highVotes.length >= sections.length * .75 &&
        Math.max(...highVotes) / Math.min(...highVotes) < 1.045) {
      const highBpm = Math.round(highVotes.reduce((sum, value) => sum + value, 0) / highVotes.length);
      if (reliable.filter(value => Math.abs(value / highBpm - 1) <= .055).length >= 2) bpm = highBpm;
    } else if (differentMetre || reliable.length >= 2 && Math.max(...reliable) / Math.min(...reliable) > 1.12) {
      pulseStatus = 'variable';
    }
  }
  return { bpm, pulseStatus: bpm ? 'steady' : pulseStatus, energy, brightness, mode: includeMode && energy > 0.008 ? tonalMode(buffer, length) : null };
}

export function audioSignals(buffer) {
  const result = analyzeExcerpt(buffer);
  // A quiet intro or a change after the first verse should not define a whole song.
  if (buffer.length <= 60 * buffer.sampleRate) return result;
  const length = Math.round(12 * buffer.sampleRate);
  const estimates = [result.bpm];
  for (const fraction of [.5, .85]) {
    const start = Math.floor((buffer.length - length) * fraction);
    const excerpt = { sampleRate: buffer.sampleRate, length, numberOfChannels: buffer.numberOfChannels,
      getChannelData: channel => buffer.getChannelData(channel).subarray(start, start + length) };
    estimates.push(analyzeExcerpt(excerpt, false).bpm);
  }
  const values = estimates.filter(Number.isFinite);
  if (!['variable', 'ambiguous'].includes(result.pulseStatus) && values.length >= 2 && Math.max(...values) / Math.min(...values) < 1.06) {
    const bpm = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    return { ...result, bpm, pulseStatus: 'steady' };
  }
  return { ...result, bpm: null, pulseStatus: values.length >= 2 ? 'variable' : result.bpm ? 'weak' : result.pulseStatus };
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
  if (audio.bpm) audio.bpmSource = 'measured';
  audio.reason = audio.mode
    ? 'В аудио вероятен ' + (audio.mode === 'major' ? 'мажор' : 'минор') + '.'
    : 'Вы выбрали этот звук для дня.';
  return audio;
}
