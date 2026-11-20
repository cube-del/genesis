let context, analyser, master, streamOutput, spectrum;
let active = null;
let duck = false;

function audioGraph() {
  if (context) return context;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) throw new Error('Этот браузер не поддерживает воспроизведение звука.');
  context = new Context();
  analyser = context.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  spectrum = new Uint8Array(analyser.frequencyBinCount);
  master = context.createGain();
  master.gain.value = duck ? 0.2 : 0.82;
  analyser.connect(master);
  master.connect(context.destination);
  if (context.createMediaStreamDestination) {
    streamOutput = context.createMediaStreamDestination();
    master.connect(streamOutput);
  }
  return context;
}

export function playingDay() { return active?.id ?? null; }
export function recordingAudio() { return streamOutput?.stream.getAudioTracks()[0] ?? null; }
export function elapsedSeconds() {
  if (!active?.started) return 0;
  const elapsed = active.element ? active.element.currentTime : context.currentTime - active.start;
  return Math.max(0, Math.min(active.duration, elapsed));
}
export function progress() {
  if (!active?.started) return 0;
  return elapsedSeconds() / active.duration;
}
export function audioLevel() {
  if (!active?.started) return 0;
  analyser.getByteFrequencyData(spectrum);
  let sum = 0;
  for (let i = 1; i < 21; i++) sum += spectrum[i];
  return sum / (20 * 255);
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

function ambient(day, state) {
  const score = scores[day.mood] || scores.calm;
  const beat = 60 / Math.max(45, Math.min(165, Number(day.track?.bpm) || 78));
  const key = [...(day.track?.title || '')].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, Number(day.track?.variant) || 0);
  const rootShift = (key % 6) - 2;
  const mix = context.createGain();
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = day.mood === 'energy' ? 2600 : 1800;
  mix.connect(filter); filter.connect(analyser);
  state.nodes.push(mix, filter);
  const start = context.currentTime + 0.04;
  mix.gain.setValueAtTime(0.01, start);
  mix.gain.linearRampToValueAtTime(0.8, start + 0.4);
  mix.gain.setValueAtTime(0.8, start + 28.7);
  mix.gain.linearRampToValueAtTime(0, start + 30);
  function note(pitch, when, length, level, wave, attack) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const end = Math.min(when + length, start + 30);
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
  for (let bar = 0; bar * chordLength < 30; bar++) {
    const base = score.bass[(bar + key % 4) % 4];
    const time = start + bar * chordLength;
    note(base - 12, time, chordLength * 0.97, 0.22, 'sine', 0.07);
    note(base + 7, time, chordLength * 1.08, 0.075, 'triangle', 0.38);
    for (let i = 0; i * score.step < 4; i++) {
      const pos = (key % 5 + bar * 2 + i * 3) % score.scale.length;
      const when = time + i * score.step * beat;
      if (when > start + 29.9) break;
      note(base + score.scale[pos] + 12, when, beat * 1.65, i % 2 ? 0.12 : 0.15, score.wave, 0.018);
      if (day.mood === 'energy' && i % 2 === 0) note(base - 20, when, beat * 0.48, 0.16, 'sine', 0.008);
    }
  }
  state.start = start;
}

export async function playTrack(day, onEnd) {
  stopTrack();
  const track = day.track;
  if (!track || track.kind === 'link' || (track.kind !== 'ambient' && !track.src)) {
    throw new Error('У этой песни нет доступного фрагмента. Её можно открыть по ссылке.');
  }
  const ctx = audioGraph();
  const state = { id: day.id, nodes: [], end: onEnd, started: false, duration: 30 };
  active = state;
  try {
    await ctx.resume();
    if (active !== state) return false;
    if (track.kind === 'ambient') ambient(day, state);
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
      element.onended = element.onerror = () => { if (active === state) stopTrack(); };
    }
    if (active !== state) return false;
    state.started = true;
    state.timeout = setTimeout(() => { if (active === state) stopTrack(); }, state.duration * 1000 + 40);
    return true;
  } catch (error) {
    if (active !== state) return false;
    stopTrack();
    throw new Error('Не удалось воспроизвести фрагмент. Проверьте доступность аудио.', { cause: error });
  }
}
