let context, analyser, memoryFilter, master, streamOutput, spectrum;
let active = null;
let duck = false;
let smoothBands = { bass: 0, mid: 0, high: 0, level: 0 };

export function spotifyLinks(track) {
  if (!track) return null;
  let id = '';
  if (['spotify-catalog','spotify-api'].includes(track.source) && /^[A-Za-z0-9]{22}$/.test(track.id)) id = track.id;
  if (!id && track.url) {
    try {
      const url = new URL(track.url);
      if (url.origin === 'https://open.spotify.com' && !url.username && !url.password) {
        id = /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?track\/([a-zA-Z0-9]{22})\/?$/i.exec(url.pathname)?.[1];
      }
    } catch { return null; }
  }
  return id ? {
    url:'https://open.spotify.com/track/' + id,
    embed:'https://open.spotify.com/embed/track/' + id,
    automatic:track.kind==='preview' || ['spotify-catalog','spotify-api'].includes(track.source)
  } : null;
}

function audioGraph() {
  if (context) return context;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) throw new Error('Этот браузер не поддерживает воспроизведение звука.');
  context = new Context();
  analyser = context.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.68;
  spectrum = new Uint8Array(analyser.frequencyBinCount);
  memoryFilter = context.createBiquadFilter();
  memoryFilter.type = 'lowpass';
  memoryFilter.frequency.value = 20000;
  memoryFilter.Q.value = 0.7;
  master = context.createGain();
  master.gain.value = duck ? 0.2 : 0.82;
  analyser.connect(memoryFilter);
  memoryFilter.connect(master);
  master.connect(context.destination);
  if (context.createMediaStreamDestination) {
    streamOutput = context.createMediaStreamDestination();
    master.connect(streamOutput);
  }
  return context;
}

// Acoustic "from past to present" ritual: low-pass sweeps 350 Hz -> 20 kHz over 1.8 s.
export function triggerMemoryReveal(seconds = 1.8) {
  if (!context || !memoryFilter) return;
  const now = context.currentTime;
  memoryFilter.frequency.cancelScheduledValues(now);
  memoryFilter.frequency.setValueAtTime(350, now);
  memoryFilter.frequency.exponentialRampToValueAtTime(20000, now + Math.max(0.2, seconds));
}

export function playingDay() { return active?.id ?? null; }
export function recordingAudio() { return streamOutput?.stream.getAudioTracks()[0] ?? null; }
export function elapsedSeconds() {
  if (!active?.started) return 0;
  const elapsed = active.element ? active.element.currentTime : (active.offset || 0) + (context.currentTime - active.start);
  return Math.max(0, Math.min(active.duration, elapsed));
}
export function progress() {
  if (!active?.started) return 0;
  return elapsedSeconds() / Math.max(0.01, active.duration);
}

// Real-time 3-band analysis: Bass (20-150 Hz), Mid (150-2000 Hz), High (2000-12000 Hz).
export function audioBands() {
  if (!active?.started || !analyser || !context) {
    smoothBands.bass *= 0.86; smoothBands.mid *= 0.86; smoothBands.high *= 0.86; smoothBands.level *= 0.86;
    return { ...smoothBands };
  }
  analyser.getByteFrequencyData(spectrum);
  const binHz = context.sampleRate / analyser.fftSize;
  const avgRange = (loHz, hiHz) => {
    const start = Math.max(1, Math.floor(loHz / binHz));
    const end = Math.min(spectrum.length - 1, Math.max(start, Math.ceil(hiHz / binHz)));
    let sum = 0;
    for (let i = start; i <= end; i++) sum += spectrum[i];
    return sum / ((end - start + 1) * 255);
  };
  const bass = avgRange(20, 150);
  const mid = avgRange(150, 2000);
  const high = avgRange(2000, 12000);
  const level = bass * 0.45 + mid * 0.35 + high * 0.2;
  smoothBands.bass += (bass - smoothBands.bass) * 0.35;
  smoothBands.mid += (mid - smoothBands.mid) * 0.28;
  smoothBands.high += (high - smoothBands.high) * 0.32;
  smoothBands.level += (level - smoothBands.level) * 0.32;
  return { ...smoothBands };
}

export function audioLevel() {
  return audioBands().level;
}

export function setDucking(on) {
  duck = Boolean(on);
  if (master) master.gain.setTargetAtTime(duck ? 0.2 : 0.82, context.currentTime, 0.12);
}

export function stopTrack() {
  const previous = active;
  active = null;
  if (!previous) return;
  clearTimeout(previous.timeout);
  if (previous.element) {
    previous.element.onended = previous.element.onerror = null;
    previous.element.pause();
    previous.element.removeAttribute('src');
    previous.element.load();
  }
  for (const node of previous.nodes) {
    if (node.stop) { try { node.stop(); } catch {} }
    node.disconnect();
  }
  previous.end?.();
}

const scores = {
  calm:   { bass: [50, 46, 53, 48], scale: [0, 3, 7, 10, 14], step: 1.5, wave: 'sine' },
  dream:  { bass: [45, 53, 48, 43], scale: [0, 4, 7, 9, 14], step: 1, wave: 'sine' },
  joy:    { bass: [53, 48, 50, 46], scale: [0, 4, 7, 12, 16], step: 0.75, wave: 'triangle' },
  energy: { bass: [43, 46, 41, 48], scale: [0, 3, 7, 12, 15], step: 0.5, wave: 'triangle' }
};

function ambient(day, state, offsetSec = 0) {
  const score = scores[day.mood] || scores.calm;
  const beat = 60 / Math.max(45, Math.min(165, Number(day.track?.bpm) || 78));
  const key = [...(day.track?.title || '')].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, Number(day.track?.variant) || 0);
  const rootShift = (key % 6) - 2;
  const remaining = Math.max(1, 30 - offsetSec);
  const mix = context.createGain();
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = day.mood === 'energy' ? 2600 : 1800;
  mix.connect(filter); filter.connect(analyser);
  state.nodes.push(mix, filter);
  const start = context.currentTime + 0.04;
  mix.gain.setValueAtTime(0.01, start);
  mix.gain.linearRampToValueAtTime(0.8, start + Math.min(0.4, remaining * 0.2));
  mix.gain.setValueAtTime(0.8, start + Math.max(0.2, remaining - 1.2));
  mix.gain.linearRampToValueAtTime(0, start + remaining);
  function note(pitch, when, length, level, wave, attack) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const end = Math.min(when + length, start + remaining);
    if (end <= when + 0.05) return;
    oscillator.type = wave;
    oscillator.frequency.value = 440 * 2 ** ((pitch + rootShift - 69) / 12);
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(level, Math.min(when + attack, end - 0.03));
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(envelope); envelope.connect(mix);
    oscillator.start(when); oscillator.stop(end + 0.01);
    state.nodes.push(oscillator, envelope);
  }
  const chordLength = beat * 4;
  const startBar = Math.floor(offsetSec / chordLength);
  for (let bar = startBar; bar * chordLength < 30; bar++) {
    const base = score.bass[(bar + key % 4) % 4];
    const barTime = bar * chordLength - offsetSec;
    const time = start + Math.max(0, barTime);
    if (barTime >= -0.2) {
      note(base - 12, time, chordLength * 0.97, 0.22, 'sine', 0.07);
      note(base + 7, time, chordLength * 1.08, 0.075, 'triangle', 0.38);
    }
    for (let i = 0; i * score.step < 4; i++) {
      const pos = (key % 5 + bar * 2 + i * 3) % score.scale.length;
      const rel = barTime + i * score.step * beat;
      if (rel < 0) continue;
      const when = start + rel;
      if (when > start + remaining - 0.08) break;
      note(base + score.scale[pos] + 12, when, beat * 1.65, i % 2 ? 0.12 : 0.15, score.wave, 0.018);
      if (day.mood === 'energy' && i % 2 === 0) note(base - 20, when, beat * 0.48, 0.16, 'sine', 0.008);
    }
  }
  state.start = start;
  state.offset = offsetSec;
}

export async function seekTrack(fraction) {
  if (!active?.started) return false;
  const clamped = Math.max(0, Math.min(0.98, Number(fraction) || 0));
  const target = clamped * active.duration;
  if (active.element) {
    active.element.currentTime = target;
    clearTimeout(active.timeout);
    active.timeout = setTimeout(() => { if (active) stopTrack(); }, Math.max(200, (active.duration - target) * 1000 + 80));
    return true;
  }
  if (active.day?.track?.kind === 'ambient') {
    const { day, end } = active;
    return playTrack(day, end, { offsetSeconds: target, reveal: false });
  }
  return false;
}

export async function playTrack(day, onEnd, { reveal = false, offsetSeconds = 0 } = {}) {
  stopTrack();
  const track = day.track;
  if (spotifyLinks(track)) throw new Error('Послушайте трек в плеере Spotify.');
  if (!track || track.kind === 'link' || (track.kind !== 'ambient' && !track.src)) {
    throw new Error('У этой песни нет доступного фрагмента. Её можно открыть по ссылке.');
  }
  const ctx = audioGraph();
  const state = { id: day.id, day, nodes: [], end: onEnd, started: false, duration: 30, offset: offsetSeconds };
  active = state;
  try {
    await ctx.resume();
    if (active !== state) return false;
    if (reveal) triggerMemoryReveal(1.8);
    else if (memoryFilter) {
      memoryFilter.frequency.cancelScheduledValues(ctx.currentTime);
      memoryFilter.frequency.setValueAtTime(20000, ctx.currentTime);
    }
    if (track.kind === 'ambient') ambient(day, state, offsetSeconds);
    else {
      const element = new Audio();
      element.crossOrigin = 'anonymous';
      element.preload = 'auto';
      const source = ctx.createMediaElementSource(element);
      source.connect(analyser);
      state.nodes.push(source);
      state.element = element;
      element.src = track.src;
      state.timeout = setTimeout(() => { if (active === state) stopTrack(); }, 12000);
      await element.play();
      if (active !== state) return false;
      clearTimeout(state.timeout);
      if (Number.isFinite(element.duration)) state.duration = Math.min(30, element.duration);
      if (offsetSeconds > 0) element.currentTime = Math.min(offsetSeconds, Math.max(0, state.duration - .25));
      element.onended = element.onerror = () => { if (active === state) stopTrack(); };
    }
    if (active !== state) return false;
    state.started = true;
    const remainingMs = Math.max(200, (state.duration - (state.element ? state.element.currentTime : offsetSeconds)) * 1000 + 40);
    state.timeout = setTimeout(() => { if (active === state) stopTrack(); }, remainingMs);
    return true;
  } catch (error) {
    if (active !== state) return false;
    stopTrack();
    throw new Error('Не удалось воспроизвести фрагмент. Проверьте доступность аудио.', { cause: error });
  }
}
