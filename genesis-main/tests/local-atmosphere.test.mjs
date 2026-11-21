import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestLocalAtmosphere } from '../server/local-atmosphere.mjs';

test('локальная модель получает все снимки для анализа и только рассказ для обложки', async t => {
  const images = Array.from({ length: 5 }, (_, i) => ({ inlineData: { data: 'jpeg' + i } }));
  const photoNotes = ['Капли на окне.', 'Мокрые ветви.', 'Вечернее небо.', 'Свет фонаря.', 'Дорожка в парке.'];
  const payload = { text: 'Ветер стих. Мы вышли на прогулку.', date: '2026-11-20', images };
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    const request = JSON.parse(opts.body);
    if (url.endsWith('/apply-template')) {
      assert.deepEqual(JSON.parse(request.messages[1].content.split('\n')[1]), { text: payload.text });
      return Response.json({ prompt: 'formatted story' });
    }
    if (url.endsWith('/completion')) {
      assert.equal(request.prompt, 'formatted story');
      assert.equal(request.json_schema.properties.coverText.maxLength, 84);
      return Response.json({ content: JSON.stringify({ coverText: 'На прогулку после ветра' }) });
    }
    assert.ok(url.endsWith('/v1/chat/completions'));
    const schema = request.response_format.json_schema.schema.properties;
    assert.match('Ветер над парком', new RegExp(schema.title.pattern));
    assert.doesNotMatch('Ночная улица', new RegExp(schema.title.pattern));
    assert.equal(schema.photoNotes.minItems, images.length);
    assert.equal(schema.photoNotes.maxItems, images.length);
    const content = request.messages[1].content;
    assert.deepEqual(content.slice(0, -1).map(p => p.image_url.url), images.map(p => 'data:image/jpeg;base64,' + p.inlineData.data));
    assert.deepEqual(JSON.parse(content.at(-1).text).fragments, [[0,'Ветер стих.'], [1,'Мы вышли на прогулку.']]);
    const result = { title: 'Ветер над парком', mood: 'calm', weatherType: 'rain_glass', energy: .2,
      warmth: .4, quoteIndex: 1, photoNotes: [...photoNotes, 'Лишнее пояснение.'], weatherNote: 'Капли подчёркивают влажный свет.' };
    return Response.json({ choices: [{ message: { content: JSON.stringify(result) } }] });
  });
  const day = await requestLocalAtmosphere('http://127.0.0.1', {}, 'test-model', payload);
  assert.equal(day.quote, 'Мы вышли на прогулку.');
  assert.equal(day.coverText, 'На прогулку после ветра');
  assert.ok(day.explanation[0].includes(day.quote));
  assert.equal(day.explanation[1], photoNotes.join(' '));
  assert.equal(day.weatherType, 'rain_glass');
});
