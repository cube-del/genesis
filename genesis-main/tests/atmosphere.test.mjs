import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRuleAtmosphere } from '../server/rule-atmosphere.mjs';
import { analyzeAtmosphere } from '../server/atmosphere.mjs';

// Two real 2 × 2 JPEGs, ochre and blue. They contain no personal information.
const jpegA = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIAAgg//2Q==';
const jpegB = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIYAyDf/2Q==';
const smallPhoto = data => ({ src: 'data:image/jpeg;base64,' + data });
const input = {
  date: '2026-11-18', text: 'Утром рисовали охрой. К вечеру взяли синие краски.',
  photos: [smallPhoto(jpegA), smallPhoto(jpegB)],
};
const output = {
  title: 'Между охрой и синим', quote: 'К вечеру взяли синие краски.', mood: 'calm', weatherType: 'mist',
  coverText: 'От утренней охры к вечерней синеве',
  warmth: 0.55, energy: 0.24,
  explanation: ['Неспешный рассказ задаёт спокойный ритм.', 'На первом кадре охра, на втором синий цвет.', 'Мягкий переход между цветами передан туманом.'],
};
const success = (value = output, finishReason = 'STOP') => Response.json({
  candidates: [{ finishReason, content: { parts: [{ text: 'Внутреннее рассуждение', thought: true }, { text: JSON.stringify(value) }] } }],
});
const errorWith = (status, match) => error => error.status === status && error.expose === true && (!match || match.test(error.message));

test('one structured Gemini request includes both actual images, ordered, and the original text', async () => {
  let calls = 0;
  const result = await analyzeAtmosphere(input, {
    apiKey: 'demo', model: 'gemini-test',
    async fetchImpl(url, options) {
      calls++;
      assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
      assert.equal(options.headers['x-goog-api-key'], 'demo');
      assert.equal(options.redirect, 'error');
      const body = JSON.parse(options.body);
      assert.equal(body.contents.length, 1);
      assert.ok(body.systemInstruction.parts[0].text.includes('каждый снимок'));
      assert.deepEqual(body.contents[0].parts.slice(0, 2), [jpegA,jpegB].map(data => ({ inlineData: { mimeType: 'image/jpeg', data } })));
      assert.deepEqual(JSON.parse(body.contents[0].parts[2].text), { date: input.date, text: input.text });
      assert.equal(body.generationConfig.responseMimeType, 'application/json');
      assert.deepEqual(body.generationConfig.responseJsonSchema.required.sort(), Object.keys(output).sort());
      return success();
    },
  });
  assert.deepEqual(result, output);
  assert.equal(calls, 1);
});

test('missing key and malformed input never call the provider', async () => {
  let calls = 0;
  const options = { apiKey: 'demo', fetchImpl: async () => { calls++; return success(); } };
  await assert.rejects(analyzeAtmosphere(input, { ...options, apiKey: ' ' }), errorWith(503, /GEMINI_API_KEY/));
  for (const fields of [
    { text: ' ' }, { text: { trim: 1 } }, { date: '2026-02-30' }, { photos: [] }, { photos: Array(6).fill(input.photos[0]) },
    { photos: [{ src: 'https://example.com/photo.jpg' }] }, { photos: [smallPhoto('AAAA')] },
  ]) await assert.rejects(analyzeAtmosphere({ ...input, ...fields }, options), errorWith(400));
  const tooWide = Buffer.from(jpegA, 'base64');
  const frame = tooWide.indexOf(Buffer.from([0xff, 0xc0]));
  tooWide.writeUInt16BE(769, frame + 7);
  await assert.rejects(analyzeAtmosphere({ ...input, photos: [smallPhoto(tooWide.toString('base64'))] }, options), errorWith(400));
  assert.equal(calls, 0);
});

test('invalid model output cannot fabricate a quote or silently produce local data', async () => {
  for (const patch of [
    { quote: 'Этого автор не писал.' }, { title: 'Синий' }, { mood: 'unknown' },
    { weatherType: 'sun' }, { energy: 1.4 }, { warmth: '0.2' }, { explanation: [] },
    { coverText: undefined }, { coverText: ' ' }, { coverText: 'д'.repeat(85) },
  ]) {
    await assert.rejects(analyzeAtmosphere(input, { apiKey: 'demo', fetchImpl: () => success({ ...output, ...patch }) }), errorWith(502));
  }
  await assert.rejects(analyzeAtmosphere(input, { apiKey: 'demo', fetchImpl: () => success(output, 'MAX_TOKENS') }), errorWith(502));
  await assert.rejects(analyzeAtmosphere(input, { apiKey: 'demo', fetchImpl: () => Response.json({promptFeedback: {blockReason:'SAFETY'}}) }), errorWith(422));
});

test('upstream failures communicate key, region, quota and model availability without returning raw details', async () => {
  const cases = [
    [403, 'Permission denied', 503, /GEMINI_API_KEY/], [404, 'not found', 503, /GEMINI_MODEL/],
    [429, 'quota exceeded', 429, /лимит/], [400, 'User location is not supported for the API use.', 503, /регион/],
    [500, 'private-provider-detail', 502, /недоступен/],
  ];
  for (const [code, message, expected, description] of cases) {
    const fetchImpl = () => Response.json({ error:{message} }, { status:code });
    await assert.rejects(analyzeAtmosphere(input, {apiKey:'demo',fetchImpl}), error => errorWith(expected,description)(error) && !error.message.includes(message));
  }
  await assert.rejects(analyzeAtmosphere(input, { apiKey:'demo', fetchImpl:() => new Response('not-json') }), errorWith(502));
  await assert.rejects(analyzeAtmosphere(input, { apiKey:'demo', fetchImpl:() => {throw Error('offline');} }), errorWith(502, /подключение/));
});

test('timeout aborts the request and surfaces a retryable error', async () => {
  const fetchImpl = (_, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(success()), 200);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
  await assert.rejects(analyzeAtmosphere(input, { apiKey:'demo', fetchImpl, timeoutMs:5 }), errorWith(504));
});

test('local rules use the actual quote, distinguish text tones and explain image light', () => {
  const text = 'Спокойный вечер у тихой реки. Долго сидели на ступенях.';
  const photo = { ...smallPhoto(jpegA), light: { luma: .51, contrast: .18, warmth: .67 } };
  const day = analyzeRuleAtmosphere({ ...input, text, photos: [photo] });
  assert.ok(text.includes(day.quote));
  assert.ok(day.title.split(/\s+/u).length >= 3 && day.title.split(/\s+/u).length <= 7);
  assert.equal(day.mood, 'calm');
  assert.equal(day.weatherType, 'warm_haze');
  assert.match(day.explanation[1], /тёплый оттенок/u);

  const night = analyzeRuleAtmosphere({ ...input, text: 'Ночь перед срочной сдачей. Ливень заглушал сирены.', photos: [photo] });
  assert.equal(night.mood, 'energy');
  assert.equal(night.weatherType, 'rain_glass');
  const brief = analyzeRuleAtmosphere({ ...input, text: '🎈' });
  assert.equal(brief.quote, '🎈');
  assert.equal(brief.title, 'Память дня в дневнике');
});

test('Gemini and local rules understand video keyframes, timestamps and motion dynamics', async () => {
  const videoItem = {
    kind: 'video', duration: 14.2, motion: 0.68,
    frames: [
      { src: 'data:image/jpeg;base64,' + jpegA, time: 1.4, light: { luma: .25, contrast: .24, warmth: .42 } },
      { src: 'data:image/jpeg;base64,' + jpegB, time: 7.1, light: { luma: .48, contrast: .28, warmth: .45 } },
      { src: 'data:image/jpeg;base64,' + jpegA, time: 12.8, light: { luma: .52, contrast: .26, warmth: .46 } }
    ]
  };
  let receivedParts = null;
  await analyzeAtmosphere({ ...input, photos: [videoItem, smallPhoto(jpegB)] }, {
    apiKey: 'demo', model: 'gemini-test',
    async fetchImpl(_url, options) {
      const body = JSON.parse(options.body);
      receivedParts = body.contents[0].parts;
      return success();
    }
  });
  assert.ok(receivedParts.some(p => typeof p.text === 'string' && /Видео 1.*14\.2 с.*68%/.test(p.text)));
  assert.equal(receivedParts.filter(p => p.inlineData?.mimeType === 'image/jpeg').length, 4);

  const ruleDay = analyzeRuleAtmosphere({ date: '2026-11-21', text: 'Вышли на улицу и включили камеру.', photos: [videoItem] });
  assert.equal(ruleDay.mood, 'energy');
  assert.equal(ruleDay.weatherType, 'wind_sparks');
  assert.equal(ruleDay.videoMotion, 0.68);
  assert.match(ruleDay.explanation[1], /видео/iu);
  assert.match(ruleDay.explanation[1], /свет усиливается/iu);
});

test('локальный анализ учитывает область отрицания и конкретную деталь заголовка', () => {
  const analyze = text => analyzeRuleAtmosphere({ ...input, text });
  for (const text of ['Это была не радостная встреча.', 'Радости не было.']) {
    const day = analyze(text);
    assert.notEqual(day.mood, 'joy');
    assert.match(day.explanation[0], /отрицание/iu);
  }
  assert.equal(analyze('Было тревожно, но потом мы улыбались и смеялись.').mood, 'joy');
  assert.equal(analyze('Мы не только улыбались, но и смеялись.').mood, 'joy');
  assert.equal(analyze('Мы не спеша улыбались.').mood, 'joy');
  assert.notEqual(analyze('Дождя не было. Мы пили чай.').weatherType, 'rain_glass');
  const hospital = 'Мы шли домой. За окном больницы впервые за неделю зажгли свет.';
  const day = analyze(hospital);
  assert.match(day.title, /больниц/iu);
  assert.match(day.title, /свет/iu);
  assert.ok(day.title.split(/\s+/u).length <= 7);
  assert.ok(hospital.includes(day.quote));
});

test('cross-modal fusion maps 10 rich scenarios from text, negation and photo visual cues', () => {
  const analyze = (text, light) => analyzeRuleAtmosphere({
    ...input,
    text,
    photos: [{ ...smallPhoto(jpegA), ...(light ? { light } : {}) }]
  });
  assert.equal(analyze('Пошёл густой снег, город затих в сугробах.').weatherType, 'snow_drift');
  assert.notEqual(analyze('Снега не было, мы просто сидели дома.').weatherType, 'snow_drift');
  assert.equal(analyze('Вышли на балкон смотреть на звёзды и луну.').weatherType, 'starlight');
  assert.equal(analyze('Зажгли свечи и тёплые гирлянды на кухне.').weatherType, 'amber_bokeh');
  assert.equal(analyze('Шли по осенней аллее под листопадом.').weatherType, 'petal_drift');
  assert.equal(analyze('Мчались по ночной трассе мимо неоновых витрин!').weatherType, 'neon_pulse');

  const neutral = 'Просто снял кадр по дороге.';
  const coolNight = analyze(neutral, { luma: .18, contrast: .19, warmth: .36, chroma: .16, darkShare: .68, brightShare: .02, dominantHue: 222 });
  assert.equal(coolNight.mood, 'dream');
  assert.equal(coolNight.weatherType, 'starlight');

  const warmLantern = analyze(neutral, { luma: .22, contrast: .25, warmth: .64, chroma: .34, darkShare: .60, brightShare: .04, dominantHue: 34 });
  assert.equal(warmLantern.weatherType, 'amber_bokeh');

  const brightFrost = analyze(neutral, { luma: .78, contrast: .14, warmth: .39, chroma: .11, darkShare: .03, brightShare: .58 });
  assert.equal(brightFrost.weatherType, 'snow_drift');

  const neonNight = analyze(neutral, { luma: .20, contrast: .32, warmth: .42, chroma: .44, darkShare: .64, brightShare: .05, dominantHue: 305 });
  assert.equal(neonNight.mood, 'energy');
  assert.equal(neonNight.weatherType, 'neon_pulse');

  const lushForest = analyze(neutral, { luma: .52, contrast: .18, warmth: .50, chroma: .42, darkShare: .08, brightShare: .08, dominantHue: 118 });
  assert.equal(lushForest.weatherType, 'petal_drift');
});
