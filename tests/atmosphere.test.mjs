import { test } from 'node:test';
import assert from 'node:assert/strict';
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
