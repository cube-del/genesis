import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioSignals } from '../public/analysis.js';
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
