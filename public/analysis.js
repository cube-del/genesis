import { api } from './ui.js';

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
  const body = { date, text, expectedProvider, photos: frames.map(({ src }) => ({ src })) };
  const result = await api('/api/atmosphere', { method: 'POST', body, signal });
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
