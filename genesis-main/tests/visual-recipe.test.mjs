import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTextStructure, buildVisualRecipe, gradeColor } from '../public/visual-recipe.js';

const base = {
  mood: 'dream', weatherType: 'rain_glass', energy: .26,
  palette: ['#483125', '#ce9e64', '#cebb90', '#795226'],
  text: 'Я остался один. Устал. Шёл домой.', track: { kind: 'file', bpm: 72, mode: 'minor' }
};
const recipe = patch => buildVisualRecipe({ ...base, ...patch });
const sound = patch => recipe({ track: { ...base.track, ...patch } });

test('one mood yields different framing, pace and texture from independently varied text evidence', () => {
  const solo = recipe({});
  const crowd = recipe({ text: 'Вся компания и друзья были на концерте и вместе обсуждали каждый поворот вечера.' });
  assert.ok(solo.whitespace >= .35 && solo.whitespace <= .45);
  assert.ok(crowd.whitespace < solo.whitespace - .16);
  assert.ok(crowd.cutSharpness < solo.cutSharpness);
  const abstract = analyzeTextStructure('Вспомнил мечты. Кажется, я размышляю о смысле.');
  const concrete = analyzeTextStructure('Пальцы на шершавой кружке. Пахло горячим кофе и смолой.');
  assert.ok(abstract.reflectiveness > concrete.reflectiveness + .5);
  assert.deepEqual(recipe({ mood: 'joy' }), solo);
});

test('BPM, mode, centroid and onsets address independent visual channels', () => {
  assert.ok(sound({ bpm: 140 }).intervalMs < sound({ bpm: 70 }).intervalMs);
  assert.ok(sound({ bpm: 140 }).particleSpeed > sound({ bpm: 70 }).particleSpeed);
  assert.ok(sound({ bpm: 140 }).motionSpeed > sound({ bpm: 70 }).motionSpeed);
  assert.equal(sound({ bpm: 140 }).whitespace, sound({ bpm: 70 }).whitespace);
  assert.ok(sound({ mode: 'minor' }).whitespace > sound({ mode: 'major' }).whitespace);
  assert.ok(sound({ mode: 'minor' }).saturation < sound({ mode: 'major' }).saturation);
  assert.ok(sound({ brightness: .1 }).grain > sound({ brightness: .9 }).grain);
  assert.ok(sound({ brightness: .1 }).brushRadius > sound({ brightness: .9 }).brushRadius);
  assert.ok(sound({ percussiveness: .9 }).cutSharpness > sound({ percussiveness: .1 }).cutSharpness);
  assert.ok(sound({ percussiveness: .9 }).geometry > sound({ percussiveness: .1 }).geometry);
  assert.match(sound({ brightness: .22, spectralCentroidHz: 405 }).explanation.texture, /405 Гц/u);
});

test('bright tired scene retains light, explicit rain still reads as rain, native hues survive grading', () => {
  const sunny = { luma: .85, warmth: .68, contrast: .18 };
  const tired = recipe({ photoLight: sunny });
  const rested = recipe({ photoLight: sunny, text: 'Я остался один. Шёл домой.' });
  assert.equal(tired.weatherType, 'warm_haze');
  assert.ok(tired.exposure > 1);
  assert.ok(tired.saturation < rested.saturation);
  assert.ok(tired.motionSpeed < rested.motionSpeed);
  assert.ok(tired.whitespace >= rested.whitespace);
  assert.equal(recipe({ photoLight: sunny, text: 'Устал. Начался дождь.' }).weatherType, 'rain_glass');
  const memory = recipe({ photoLight: sunny, text: 'Помню детство и ту охру на старой лампе.' });
  assert.ok(memory.amberShift >= 5 && memory.amberShift <= 8 && memory.halation > .4);
  const channels = val => [1,3,5].map(i => parseInt(val.slice(i,i + 2), 16));
  for (const color of memory.palette) {
    const [r,g,b] = channels(color); assert.ok(r > g && g > b);
  }
  assert.equal(gradeColor([.2,.4,.6], { saturation:1, contrast:1, exposure:1, amberShift:0, shadowCool:0 }), '#336699');
});

test('legacy entries and links without measured audio keep neutral defaults and truthful labels', () => {
  const legacy = buildVisualRecipe({ weather: 'Туман', track: { kind: 'link', bpm: null } });
  assert.equal(legacy.weatherType, 'mist');
  assert.equal(legacy.bpm, null);
  assert.equal(legacy.intervalMs, 8000);
  assert.match(legacy.analysis.find(item => item.id === 'audio').detail, /Темп неизвестен/u);
  assert.match(legacy.explanation.texture, /нейтральная/u);
  for (const value of Object.values(legacy)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
});

test('control pair and high-energy office night span distinct artistic poles and voice profiles', async () => {
  const { readFile } = await import('node:fs/promises');
  const demo = JSON.parse(await readFile(new URL('../public/demo.json', import.meta.url), 'utf8'));
  const [exam, flat, office] = ['after-exam', 'last-apartment', 'office-night'].map(id => demo.find(day => day.id === id));
  assert.equal(exam.mood, flat.mood);
  const a = buildVisualRecipe(exam), b = buildVisualRecipe(flat), c = buildVisualRecipe(office);
  assert.ok(a.whitespace >= .4 && a.whitespace > b.whitespace + .15);
  assert.ok(a.mist > b.mist + .15);
  assert.ok(a.cutSharpness >= .68 && b.cutSharpness < .68);
  assert.ok(a.intervalMs > b.intervalMs && b.intervalMs > c.intervalMs);
  assert.equal(a.amberShift, 0);
  assert.ok(b.amberShift >= 5 && b.amberShift <= 8 && b.halation > .5);
  assert.ok(b.saturation < 1 && a.saturation < b.saturation);
  assert.ok(c.geometry >= .7 && c.typeWeight >= 540 && c.shadowCool > .25);
  assert.ok(c.voice.rate > a.voice.rate && c.voice.sapiRate > a.voice.sapiRate);
  assert.ok(c.artTechniques.some(t => t.id === 'constructivism'));
  assert.ok(b.artTechniques.some(t => t.id === 'film'));
  assert.ok(a.artTechniques.some(t => t.id === 'ma'));
  const channels = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
  for (const color of b.palette) { const [r, , blue] = channels(color); assert.ok(r > blue); }
  for (const color of a.palette.slice(2)) { const [r, , blue] = channels(color); assert.ok(blue > r); }
  assert.match(b.explanation.color, /янтар/u);
  assert.match(a.explanation.composition, /уединении.*Минорный лад/u);
  assert.match(c.explanation.voice, /Тембр/u);
});

test('sound signature chooses distinct artistic styles, builds backdrop from native palette, and draws cleanly', async () => {
  const { drawSoundSignature, signatureHitBox } = await import('../public/postcard.js');
  const { readFile } = await import('node:fs/promises');
  const demo = JSON.parse(await readFile(new URL('../public/demo.json', import.meta.url), 'utf8'));
  const byId = id => buildVisualRecipe(demo.find(day => day.id === id));
  const exam = byId('after-exam'), flat = byId('last-apartment'), office = byId('office-night'), forest = byId('forest');
  assert.equal(exam.signatureStyle, 'ma');
  assert.equal(flat.signatureStyle, 'film');
  assert.equal(office.signatureStyle, 'constructivism');
  assert.equal(forest.signatureStyle, 'impressionism');
  for (const r of [exam, flat, office, forest]) {
    assert.match(r.backdrop, /^#[0-9a-f]{6}$/);
    assert.equal(r.envelope.length, 56);
    const box = signatureHitBox(880, 1100, r);
    assert.equal(box.vertical, r.signatureStyle === 'film');
    const ops = [];
    const ctx = new Proxy({}, { get: (_, prop) => (...args) => ops.push(prop) });
    drawSoundSignature(ctx, 880, 1100, r, 0.45, { bass: .5, mid: .4, high: .3 }, 0.6);
    assert.ok(ops.length > 20);
  }
});

test('contact sheet lays out 1 to 5 photos distinctly for all four artistic modes within stage bounds', async () => {
  const { contactSheetLayout, drawPostcardDesign } = await import('../public/postcard.js');
  const styles = ['impressionism', 'constructivism', 'ma', 'film'];
  for (const signatureStyle of styles) {
    const recipe = {
      signatureStyle, whitespace: signatureStyle === 'ma' ? .42 : .16,
      palette: ['#1d242b', '#4f6270', '#8fa3b0', '#e3ebf0'],
      sheetBg: '#f2f0ea', sheetInk: '#1d1f1b', sheetRule: '#cccccc', sheetDark: signatureStyle === 'film',
      envelope: Array(56).fill(.5)
    };
    for (let count = 1; count <= 5; count++) {
      const sheet = contactSheetLayout(880, 1100, recipe, count);
      assert.equal(sheet.slots.length, count);
      assert.equal(sheet.filmPerforations, signatureStyle === 'film');
      if (signatureStyle === 'constructivism') assert.ok(sheet.powerCell && sheet.powerCell.w > 40);
      for (const [i, slot] of sheet.slots.entries()) {
        assert.equal(slot.index, i);
        assert.equal(slot.label, `[0${i + 1}]`);
        assert.ok(slot.x >= 0 && slot.x + slot.w <= 880, `${signatureStyle}/${count}/${i} x bounds`);
        assert.ok(slot.y >= sheet.stage.y && slot.y + slot.h <= sheet.stage.y + sheet.stage.h, `${signatureStyle}/${count}/${i} y bounds`);
        assert.ok(slot.w >= 200 && slot.h >= 240, `${signatureStyle}/${count}/${i} readable size (${slot.w}x${slot.h})`);
        if (count === 1) {
          const share = (slot.w * slot.h) / (sheet.stage.w * sheet.stage.h);
          assert.ok(share >= .58, `${signatureStyle}/1 should fill stage generously (${(share * 100).toFixed(0)}%)`);
        }
        if (signatureStyle === 'film') assert.match(slot.timecode, /^00:00:\d{2}$/);
        if (signatureStyle === 'impressionism') assert.equal(slot.softEdge, true);
      }
      const ops = [];
      const ctx = new Proxy({}, { get: (_, prop) => (...args) => ops.push(prop) });
      drawPostcardDesign(ctx, 880, 1100, recipe, count, { bass: .5, mid: .4, high: .3 });
      assert.ok(ops.includes('strokeRect'));
    }
  }
});

test('videoMotion continuously shapes rhythm, contrast, geometry and whitespace', () => {
  const calmVid = recipe({ videoMotion: .08 });
  const fastVid = recipe({ videoMotion: .88 });
  assert.ok(fastVid.motionSpeed > calmVid.motionSpeed);
  assert.ok(fastVid.geometry > calmVid.geometry);
  assert.ok(fastVid.contrast > calmVid.contrast);
  assert.ok(fastVid.whitespace < calmVid.whitespace);
  assert.match(fastVid.explanation.rhythm, /Динамика движения в видео \(88%\)/u);
});

test('contact sheet mat and photo frame match the day color grade instead of stark white', async () => {
  const { readFile } = await import('node:fs/promises');
  const demo = JSON.parse(await readFile(new URL('../public/demo.json', import.meta.url), 'utf8'));
  const hexLuma = value => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255);
    return .2126 * r + .7152 * g + .0722 * b;
  };
  for (const day of demo) {
    const r = buildVisualRecipe(day);
    for (const key of ['sheetBg', 'frameBorder', 'frameHighlight']) {
      assert.match(r[key], /^#[0-9a-f]{6}$/, `${day.id}.${key}`);
    }
    assert.ok(hexLuma(r.sheetBg) <= 0.80, `${day.id}.sheetBg should stay color-graded, not white (${r.sheetBg})`);
    assert.ok(hexLuma(r.frameBorder) <= 0.80, `${day.id}.frameBorder should stay color-graded (${r.frameBorder})`);
    assert.deepEqual(r.analysis.map(item => item.id), ['text', 'photo', 'weather', 'audio']);
  }
  const exam = buildVisualRecipe(demo.find(d => d.id === 'after-exam'));
  const flat = buildVisualRecipe(demo.find(d => d.id === 'last-apartment'));
  const channels = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
  const [er, , eb] = channels(exam.frameBorder);
  const [fr, , fb] = channels(flat.frameBorder);
  assert.ok(eb >= er, `after-exam frameBorder should lean cool (${exam.frameBorder})`);
  assert.ok(fr > fb, `last-apartment frameBorder should lean warm (${flat.frameBorder})`);
});

test('visual analysis excludes negated cues and explains actual tempo and saved Gemini weather', () => {
  const text = 'Я не устал и не был один. Позже встретил друзей.';
  const result = buildVisualRecipe({
    text, analysisSource:'gemini', weatherType:'mist', explanation:['', '', 'Gemini выбрал туман по мягкому свету кадров.'],
    photoLight:{luma:.38, contrast:.22, warmth:.5},
    photos:[{kind:'image'}, {kind:'image'}],
    track:{kind:'link', bpm:74, bpmSource:'catalog', mode:'minor'}
  });
  const items = Object.fromEntries(result.analysis.map(item => [item.id, item]));
  assert.deepEqual(result.textSignals.matches.weary, []);
  assert.deepEqual(result.textSignals.matches.alone, []);
  assert.match(items.text.detail, /«друзей»/u);
  assert.equal(items.photo.headline, 'Приглушённый свет');
  assert.match(items.weather.detail, /Gemini выбрал туман/u);
  assert.equal(items.audio.headline, '74 BPM');
  assert.match(items.audio.effect, /6,5 с/u);
  assert.match(items.audio.detail, /каталогу Spotify/u);
});

test('поворот использует фразы из записи и меняет обработку даже на одном кадре', async () => {
  const {suggestTurn, buildTurnFrame} = await import('../public/day-turn.js');
  const day = {...base, text:'Нервничала из-за срочной правки. Но наконец отпустило.', photos:[{src:'one.jpg'}]};
  const turn = suggestTurn(day);
  assert.ok(turn && day.text.includes(turn.before.quote) && day.text.includes(turn.after.quote));
  assert.equal(turn.before.photoIndex,turn.after.photoIndex);
  assert.notEqual(buildTurnFrame(day,turn.before).filter,buildTurnFrame(day,turn.after).filter);
  assert.equal(suggestTurn({...day,text:'Мы не только слушали музыку, но и танцевали.'}),null);
  assert.equal(suggestTurn({...day,text:'Гуляли вдоль реки.'}),null);
  assert.equal(buildTurnFrame(day,{quote:'Паника не отступала.',photoIndex:0}).treatment,'Резче свет и тени');
});
