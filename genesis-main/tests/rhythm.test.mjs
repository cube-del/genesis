import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioSignals, colorProfile, photoLight } from '../public/analysis.js';
import { photoInterval, rhythmDescription, tempoLabel } from '../public/rhythm.js';

function pulses(bpm) {
  const sampleRate = 12000, length = sampleRate * 12, signal = new Float32Array(length);
  if (bpm) {
    for (let i = 0; i < length; i++) {
      const beat = (i / sampleRate * bpm / 60) % 1;
      if (beat < .14) signal[i] = Math.sin(i / sampleRate * 400 * Math.PI) * .5 * (1 - beat / .14);
    }
  }
  return { length, sampleRate, numberOfChannels: 1, getChannelData: () => signal };
}

test('measured pulse keeps the fast tempo and silence uses the same fallback as a link without BPM', () => {
  const slow = audioSignals(pulses(72)).bpm, fast = audioSignals(pulses(144)).bpm;
  assert.ok(Math.abs(slow - 72) <= 1, 'slow BPM ' + slow);
  assert.ok(Math.abs(fast - 144) <= 1, 'fast BPM ' + fast);
  assert.ok(photoInterval({ bpm: slow }) > photoInterval({ bpm: fast }) * 1.9);
  const silent = { kind: 'file', bpm: audioSignals(pulses(null)).bpm };
  assert.equal(silent.bpm, null);
  assert.equal(photoInterval(silent), 8000);
  assert.equal(photoInterval({ kind: 'link' }), 8000);
  assert.equal(tempoLabel(silent), 'Темп не определён');
  assert.match(rhythmDescription({ photos: [{}, {}], track: silent }), /каждые 8 с/u);
  const link = { kind: 'link', bpm: 96, bpmSource: 'manual' };
  assert.equal(photoInterval(link), 5000);
  assert.match(tempoLabel(link), /Задано вручную.*96 BPM/u);
});

test('pitch classes, centroid and attacks respond independently to the waveform', () => {
  function synth(notes, pulsed = false) {
    const sampleRate = 16000, length = sampleRate * 4;
    const hz = notes.map(midi => 440 * 2 ** ((midi - 69) / 12));
    const data = Float32Array.from({length}, (_, i) => {
      const t = i / sampleRate;
      const wave = hz.reduce((sum, f) => sum + Math.sin(t * f * Math.PI * 2), 0);
      return wave * .15 * (pulsed ? Math.exp(-30 * (t % .5)) : 1);
    });
    const silent = new Float32Array(length);
    return audioSignals({ length, sampleRate, numberOfChannels: 2, getChannelData: channel => channel ? data : silent });
  }
  assert.equal(synth([60, 64, 67]).mode, 'major');
  const minor = synth([60, 63, 67]);
  assert.equal(minor.mode, 'minor');
  assert.ok(minor.modeConfidence > .2);
  const low = synth([57]), high = synth([93]), beats = synth([57], true);
  assert.equal(low.mode, undefined);
  assert.ok(Math.abs(low.spectralCentroidHz - 220) < 5);
  assert.ok(Math.abs(high.spectralCentroidHz - 1760) < 15);
  assert.ok(high.brightness > low.brightness + .3);
  assert.ok(beats.percussiveness > low.percussiveness + .35);
  assert.equal(beats.envelope.length, 56);
  assert.ok(beats.envelope.every(v => v >= 0 && v <= 1));
  assert.equal(audioSignals(pulses(null)).brightness, undefined);
});

test('palette centers recover source colours in dominance order, with separate measured light', () => {
  const brown = [60, 31, 13], ochre = [161, 92, 40], ivory = [251, 232, 212];
  const pixels = [...Array(15).fill(ochre), ...Array(8).fill(brown), ivory];
  assert.deepEqual(colorProfile(pixels), ['#A15C28', '#3C1F0D', '#FBE8D4']);
  assert.ok(photoLight(pixels).warmth > .7);
  assert.ok(photoLight(pixels).contrast > .1);
  assert.ok(photoLight([ivory]).luma > photoLight([brown]).luma);
});

test('переменный пульс даёт запасной интервал, ручной темп имеет собственную подпись', async () => {
  const slow = pulses(72), fast = pulses(144), samples = new Float32Array(slow.length + fast.length);
  samples.set(slow.getChannelData(0)); samples.set(fast.getChannelData(0), slow.length);
  const track = audioSignals({ ...slow, length: samples.length, getChannelData: () => samples });
  assert.equal(track.bpm, null);
  assert.equal(photoInterval(track), 8000);
  const { tappedTempo, deezerTrackId } = await import('../public/rhythm.js');
  assert.equal(tappedTempo([0, 500, 1000]), null);
  assert.equal(tappedTempo([0, 500, 990, 1500]), 120);
  assert.match(tempoLabel({ kind: 'file', bpm: 120, bpmSource: 'tap' }), /вашим ударам/);
  assert.match(tempoLabel({ kind: 'link', bpm: 104.4, bpmSource: 'deezer' }), /Deezer.*104,4/);
  assert.equal(deezerTrackId(new URL('https://www.deezer.com/us/track/1109737')), '1109737');
  assert.equal(deezerTrackId(new URL('https://example.com/track/1109737')), null);
});

test('длинная запись с тихим вступлением измеряется по последующим фрагментам', () => {
  const phrase = pulses(96), length = 9 * phrase.length, samples = new Float32Array(length);
  for (let i = 3; i < 9; i++) samples.set(phrase.getChannelData(0), i * phrase.length);
  assert.equal(audioSignals({ ...phrase, length, getChannelData: () => samples }).bpm, 96);
  const changed = pulses(144).getChannelData(0);
  for (let i = 6; i < 9; i++) samples.set(changed, i * phrase.length);
  assert.equal(audioSignals({ ...phrase, length, getChannelData: () => samples }).bpm, null);
});
