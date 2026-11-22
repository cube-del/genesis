import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { createDaytraceServer } from '../server.mjs';

const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j+kwAAAAASUVORK5CYII=';
const example = {
  date: '2026-04-14', title: 'Тихий вечер у реки', text: 'Тихий вечер у реки. Прохладный ветер.',
  quote: 'Тихий вечер у реки.', mood: 'calm', weather: 'Туман', palette: ['#553443', '#445577'],
  warmth: .44, energy: .18, photos: [{ name: 'река.png', src: 'data:image/png;base64,' + image }],
  track: { title: 'Шёпот воды', artist: 'DayTrace', kind: 'ambient', bpm: 72, variant: 1 },
  explanation: ['Тихий ритм текста.'], voice: false
};

async function listen(dir, publicDir, options) {
  const server = await createDaytraceServer({ vaultDir: dir, publicDir, ...options });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const url = 'http://127.0.0.1:' + server.address().port;
  let cookie;
  return {
    async request(route, method = 'GET', body, headers = {}) {
      const response = await fetch(url + route, {
        method,
        headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined
      });
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    },
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); })
  };
}
async function fixture(t, seed = false, options) {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daytrace-test-'));
  const dir = path.join(workspace, 'vault');
  const publicDir = path.join(workspace, 'public');
  await mkdir(path.join(publicDir, 'images'), { recursive: true });
  await writeFile(path.join(publicDir, 'index.html'), '<html lang="ru"><title>DayTrace</title></html>');
  if (seed) {
    await writeFile(path.join(publicDir, 'images', 'seed.png'), Buffer.from(image, 'base64'));
    const demos = Array.from({ length: 6 }, (_, i) => ({ ...example, id: 'sample-' + i, photos: [{name: 'seed.png', src:'/images/seed.png'}] }));
    await writeFile(path.join(publicDir, 'demo.json'), JSON.stringify(demos));
  }
  const client = await listen(dir, publicDir, options);
  t.after(async () => { await client.close(); await rm(workspace, { recursive: true, force: true }); });
  return { client, dir, publicDir };
}
function unzip(archive) {
  const files = new Map();
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const size = archive.readUInt32LE(offset + 18);
    const nameSize = archive.readUInt16LE(offset + 26);
    const name = archive.subarray(offset + 30, offset + 30 + nameSize).toString();
    const start = offset + 30 + nameSize + archive.readUInt16LE(offset + 28);
    const content = archive.subarray(start, start + size);
    files.set(name.substring(name.indexOf('/') + 1), archive.readUInt16LE(offset + 8) === 8 ? inflateRawSync(content) : content);
    offset = start + size;
  }
  assert.equal(archive.readUInt32LE(offset), 0x02014b50);
  assert.equal(archive.readUInt32LE(archive.length - 22), 0x06054b50);
  return files;
}

test('этюды можно прослушать до сохранения, а выбор переносит WAV и его профиль в папку дня', async t => {
  const {client} = await fixture(t, false, {publicDir:path.resolve(import.meta.dirname, '../public')});
  assert.equal((await client.request('/api/music/studies')).status,403);
  await client.request('/');
  const created=await (await client.request('/api/days','POST',example)).json();
  const url='/api/days/'+created.id;
  const studies=await (await client.request('/api/music/studies')).json();
  assert.deepEqual(studies.map(track=>track.bpm),[82,132]);
  const audio=await (await client.request(studies[1].src)).arrayBuffer();
  assert.deepEqual((await (await client.request(url)).json()).track,created.track);
  assert.equal((await client.request(url+'/track','PUT',{track:{studyId:'missing'}})).status,400);
  const save=()=>client.request(url+'/track','PUT',{track:{studyId:studies[1].studyId}});
  const updated=await (await save()).json();
  assert.equal(updated.track.bpm,132);
  assert.deepEqual(updated.photos,created.photos);
  assert.equal(updated.text,created.text);
  assert.equal((await (await save()).json()).track.src,updated.track.src);
  const files=unzip(Buffer.from(await (await client.request(url+'/zip')).arrayBuffer()));
  const stored=JSON.parse(files.get('memory.json'));
  assert.equal(stored.track.studyId,studies[1].studyId);
  assert.deepEqual(files.get(stored.track.src),Buffer.from(audio));
  assert.ok(files.get('memory.html').toString().includes(studies[1].title));
});

test('импорт Google Фото ограничивает выбор, сохраняет байты выбранных фото и закрывает сессию', async t => {
  const calls = [];
  const { client } = await fixture(t, false, { googlePhotosClientId: 'test-client', googlePhotosFetch: async (address, options) => {
    const url = new URL(address);
    assert.equal(options.headers.Authorization, 'Bearer selected-photos-token');
    calls.push(url.pathname);
    if (url.pathname === '/v1/sessions') {
      assert.deepEqual(JSON.parse(options.body), { pickingConfig: { maxItemCount: '3' } });
      return Response.json({ id: 'pick-1', pickerUri: 'https://photos.google.com/picker/session' });
    }
    if (url.pathname === '/v1/sessions/pick-1') return Response.json(options.method === 'DELETE' ? {} : { mediaItemsSet: true });
    if (url.pathname === '/v1/mediaItems') {
      assert.equal(url.searchParams.get('sessionId'), 'pick-1');
      if (url.searchParams.has('pageToken')) return Response.json({ mediaItems: [{ type: 'VIDEO', mediaFile: { filename: 'clip.mov' } }] });
      return Response.json({ nextPageToken: 'page2', mediaItems: [
        { type: 'PHOTO', mediaFile: { filename: 'наш день.png', baseUrl: 'https://lh3.googleusercontent.com/picture' } },
        { type: 'PHOTO', mediaFile: { filename: 'big.jpg', baseUrl: 'https://lh3.googleusercontent.com/big' } }
      ] });
    }
    if (url.pathname === '/big=d') return new Response('large', { headers: { 'content-length': String(51 * 1024 * 1024) } });
    if (url.href === 'https://lh3.googleusercontent.com/picture=d') return Response.redirect('https://lh3.googleusercontent.com/content', 302);
    assert.equal(url.href, 'https://lh3.googleusercontent.com/content');
    return new Response(Buffer.from(image, 'base64'));
  } });
  const base = '/api/google-photos/sessions', auth = { authorization: 'Bearer selected-photos-token' };
  assert.equal((await client.request('/api/google-photos/config')).status, 403);
  await client.request('/');
  assert.deepEqual(await (await client.request('/api/google-photos/config')).json(), { clientId: 'test-client' });
  assert.equal((await client.request(base, 'POST', { limit: 5 })).status, 401);
  assert.equal((await client.request(base, 'POST', { limit: 6 }, auth)).status, 400);
  assert.equal((await client.request(base, 'POST', { limit: 3 }, { ...auth, origin: 'https://example.org' })).status, 403);
  const session = await (await client.request(base, 'POST', { limit: 3 }, auth)).json();
  const path = base + '/' + session.id;
  assert.deepEqual(await (await client.request(path, 'GET', undefined, auth)).json(), { mediaItemsSet: true });
  const result = await (await client.request(path + '/photos', 'GET', undefined, auth)).json();
  assert.deepEqual(result, { photos: [{ name: 'наш день.png', src: 'data:image/png;base64,' + image }], skipped: ['big.jpg', 'clip.mov'] });
  assert.equal((await client.request('/api/days', 'POST', { ...example, photos: result.photos })).status, 201);
  assert.equal((await client.request(path, 'DELETE', undefined, auth)).status, 200);
  assert.equal(calls.at(-1), '/v1/sessions/pick-1');
});

test('анализ атмосферы доступен владельцу и учитывает показанного в форме провайдера', async t => {
  let calls = 0;
  const { client } = await fixture(t, false, { atmosphereAnalyzer(input, { signal }) {
    calls++;
    assert.equal(input.text, example.text);
    assert.equal(signal.aborted, false);
    return { mood: 'dream', weatherType: 'rain_glass' };
  } });
  assert.equal((await client.request('/api/atmosphere', 'POST', { text: example.text })).status, 403);
  await client.request('/');
  const { analysisSource } = await (await client.request('/api/atmosphere/status')).json();
  assert.ok(['local-rules','local-model','gemini'].includes(analysisSource));
  const stale = await client.request('/api/atmosphere', 'POST', { text: example.text, expectedProvider: 'previous' });
  assert.equal(stale.status, 409);
  assert.equal(calls, 0);
  const result = await client.request('/api/atmosphere', 'POST', { text: example.text, expectedProvider: analysisSource });
  assert.deepEqual(await result.json(), { mood: 'dream', weatherType: 'rain_glass', analysisSource });
  assert.equal(calls, 1);
  assert.deepEqual(await (await client.request('/api/days')).json(), []);
});

test('первая загрузка импортирует шесть папок, повторный запуск сохраняет изменения', async t => {
  const { client, dir, publicDir } = await fixture(t, true);
  assert.equal((await (await client.request('/api/days')).json()).length, 6);
  await Promise.all([
    client.request('/api/days/sample-1/favorite', 'PUT', { favorite: true }),
    client.request('/api/days/sample-1/track', 'PUT', { track: { ...example.track, title: 'Утренний свет' } })
  ]);
  const second = await listen(dir, publicDir);
  try {
    const list = await (await second.request('/api/days')).json();
    assert.equal(list.length, 6);
    const day = list.find(item => item.id === 'sample-1');
    assert.equal(day.favorite, true);
    assert.equal(day.track.title, 'Утренний свет');
  } finally { await second.close(); }
});

test('создание папки, оригинал, частичное чтение и переносимый ZIP', async t => {
  const { client, dir } = await fixture(t);
  await client.request('/');
  const coverText = 'У реки под прохладным ветром';
  const created = await client.request('/api/days', 'POST', { ...example, coverText });
  assert.equal(created.status, 201);
  const day = await created.json();
  const media = await client.request(day.photos[0].src, 'GET', undefined, { Range: 'bytes=0-7' });
  assert.equal(media.status, 206);
  assert.equal(Buffer.from(await media.arrayBuffer()).toString('hex'), '89504e470d0a1a0a');
  const [folder] = await readdir(dir);
  assert.ok(folder.includes('Тихий-вечер-у-реки'));
  assert.equal(await readFile(path.join(dir, folder, 'entry.txt'), 'utf8'), example.text);
  const archive = await client.request('/api/days/' + day.id + '/zip');
  assert.equal(archive.status, 200);
  const files = unzip(Buffer.from(await archive.arrayBuffer()));
  assert.equal(files.get('entry.txt').toString(), example.text);
  const passport = JSON.parse(files.get('memory.json'));
  assert.deepEqual(files.get(passport.photos[0].src), Buffer.from(image, 'base64'));
  assert.equal(passport.photos[0].name, 'река.png');
  assert.equal(passport.track.title, example.track.title);
  assert.equal(day.coverText, coverText);
  assert.equal(passport.coverText, coverText);
  assert.equal(passport.quote, example.quote);
  const postcard = files.get('memory.html').toString();
  assert.ok(postcard.includes('src="photos/01.png"'));
  assert.ok(postcard.includes(example.title));
  assert.ok(postcard.includes('<p class="cover-caption">' + coverText + '</p>'));
  assert.ok(postcard.includes('data:text/javascript;base64,'));
});

test('озвученная открытка переносится в ZIP с WAV или с браузерным синтезом', async t => {
  const {client} = await fixture(t);
  await client.request('/');
  const day = await (await client.request('/api/days', 'POST', { ...example, voice: true })).json();
  assert.ok(day.id);
  const archive = unzip(Buffer.from(await (await client.request('/api/days/' + day.id + '/zip')).arrayBuffer()));
  const page = archive.get('memory.html').toString();
  assert.ok(page.includes('<blockquote class="cover-caption">«' + example.quote + '»</blockquote>'));
  assert.ok(page.includes('id="voice"'));
  assert.ok(page.includes('SpeechSynthesisUtterance'));
  if (day.voiceSrc) {
    assert.equal(archive.get('voiceover.wav').toString('ascii', 8, 12), 'WAVE');
    const response = await client.request(day.voiceSrc);
    assert.equal(response.headers.get('content-type'), 'audio/wav');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), archive.get('voiceover.wav'));
  } else assert.equal(day.voiceFallback, true);
});

test('частичная запись не остаётся на диске после ошибки', async t => {
  const { client, dir } = await fixture(t);
  await client.request('/');
  for (const photos of [[], [...example.photos, { name: 'error.jpg', src: '/images/seed.png' }]]) {
    const rejected = await client.request('/api/days', 'POST', { ...example, photos });
    assert.equal(rejected.status, 400);
  }
  assert.deepEqual(await readdir(dir), []);
  assert.deepEqual(await (await client.request('/api/days')).json(), []);
});

test('паспорт сохраняет источник анализа, ID трека и источник Spotify после создания, смены и перезапуска', async t => {
  const {client, dir, publicDir} = await fixture(t);
  await client.request('/');
  const original = {
    kind:'link', title:'Friday Morning', artist:'Khruangbin', bpm:null,
    id:'недоверенное значение', url:'https://open.spotify.com/track/2M45IIrFLjMgsNSSxee31h?si=test', source:'spotify-catalog'
  };
  const day = await (await client.request('/api/days', 'POST', {...example, analysisSource:'gemini', track:original})).json();
  assert.equal(day.analysisSource,'gemini');
  assert.equal(day.track.id,'2M45IIrFLjMgsNSSxee31h');
  assert.equal(day.track.source,'spotify-catalog');
  assert.equal(day.track.url,'https://open.spotify.com/track/' + day.track.id);
  const changeUrl = '/api/days/' + day.id + '/track';
  const invalid = await client.request(changeUrl,'PUT',{track:{...original, url:'https://example.org/sample'}});
  assert.equal(invalid.status,400);
  const next = {kind:'link',title:'Cirrus',artist:'Bonobo',bpm:null,url:'https://open.spotify.com/track/2t805HJ6cLjFfxstV88h5G',source:'spotify-api'};
  const updated = await (await client.request(changeUrl,'PUT',{track:next})).json();
  assert.equal(updated.track.id,'2t805HJ6cLjFfxstV88h5G');
  assert.equal(updated.track.source,'spotify-api');
  assert.equal(updated.analysisSource,'gemini');
  const {track,analysisSource} = JSON.parse(unzip(Buffer.from(await (await client.request('/api/days/' + day.id + '/zip')).arrayBuffer())).get('memory.json'));
  assert.equal(track.source,'spotify-api');
  assert.equal(analysisSource,'gemini');
  const manual = await (await client.request('/api/days','POST',{ ...example, analysisSource:'local-model', track:{kind:'link',url:'https://example.org/concert',title:'Концерт',artist:'Автор',bpm:null} })).json();
  assert.equal(manual.analysisSource,'local-model');
  assert.ok(!manual.track.id && !manual.track.source);
  // An older passport retains its origin metadata and recovers its canonical ID.
  const folders = await readdir(dir);
  const pathname = path.join(dir,folders.find(name => name.endsWith(day.id.slice(0,8))),'memory.json');
  const legacy = JSON.parse(await readFile(pathname,'utf8'));
  delete legacy.track.id;
  await writeFile(pathname,JSON.stringify(legacy));
  const restarted = await listen(dir,publicDir);
  try {
    const recovered = await (await restarted.request('/api/days/' + day.id)).json();
    assert.equal(recovered.track.id,updated.track.id);
    assert.equal(recovered.track.source,'spotify-api');
  } finally { await restarted.close(); }
});

test('загруженная аудиодорожка попадает в ZIP, замена обновляет и портативную открытку', async t => {
  const {client} = await fixture(t);
  await client.request('/');
  const wav = Buffer.alloc(46);
  wav.write('RIFF'); wav.writeUInt32LE(38, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(2, 40);
  const track = {kind:'file', title:'Личная запись', artist:'Автор', bpm:null, mode:'minor', energy:.2,
    brightness:.32, percussiveness:.18, modeConfidence:.71, spectralCentroidHz:706,
    src:'data:audio/wav;base64,' + wav.toString('base64')};
  const photoLight = { luma:.78, contrast:.11, warmth:.72 };
  const day = await (await client.request('/api/days', 'POST', {...example, photoLight, track})).json();
  const archiveUrl = '/api/days/' + day.id + '/zip';
  const archive = unzip(Buffer.from(await (await client.request(archiveUrl)).arrayBuffer()));
  const passport = JSON.parse(archive.get('memory.json'));
  assert.equal(passport.track.mode, 'minor');
  assert.deepEqual(passport.photoLight, photoLight);
  for (const property of ['brightness', 'percussiveness', 'modeConfidence', 'spectralCentroidHz']) {
    assert.equal(passport.track[property], track[property]);
  }
  assert.deepEqual(archive.get(passport.track.src), wav);
  assert.ok(archive.get('memory.html').toString().includes(passport.track.src));
  await client.request('/api/days/' + day.id + '/track', 'PUT', {track: example.track});
  assert.equal((await client.request(day.track.src)).status, 404);
  const updated = unzip(Buffer.from(await (await client.request(archiveUrl)).arrayBuffer()));
  const replacement = JSON.parse(updated.get('memory.json'));
  assert.deepEqual(replacement.photoLight, photoLight);
  assert.equal(replacement.track.spectralCentroidHz, undefined);
  assert.ok(!updated.has(passport.track.src));
  assert.ok(updated.get('memory.html').toString().includes(example.track.title));
});

test('доступ по токену ограничен выбранными днями и отзывается вместе с медиа', async t => {
  const { client } = await fixture(t, true);
  await client.request('/');
  const forwarded = { 'x-forwarded-for': '192.0.2.10' };
  assert.equal((await client.request('/api/days', 'GET', undefined, forwarded)).status, 403);
  assert.equal((await client.request('/api/days/sample-1/zip', 'GET', undefined, forwarded)).status, 403);
  assert.equal((await client.request('/api/days/sample-1/favorite', 'PUT', { favorite: true }, { origin: 'https://unrelated.example' })).status, 403);
  const api = '/api/share/day/sample-1';
  assert.deepEqual(await (await client.request(api)).json(), { enabled: false, url: null });
  const tokenOf = async (shareApi, enabled = true) => {
    const result = await (await client.request(shareApi, 'PUT', { enabled })).json();
    return result.url?.split('/').pop();
  };
  const token = await tokenOf(api);
  const route = '/api/public/day/' + token;
  const { days } = await (await client.request(route, 'GET', undefined, forwarded)).json();
  assert.equal(days.length, 1);
  const src = days[0].photos[0].src;
  assert.equal((await client.request(src, 'GET', undefined, forwarded)).status, 200);
  assert.equal((await client.request(src.replace('sample-1', 'sample-2'), 'GET', undefined, forwarded)).status, 404);
  const archiveToken = await tokenOf('/api/share/archive');
  const archive = await (await client.request('/api/public/archive/' + archiveToken, 'GET', undefined, forwarded)).json();
  assert.equal(archive.days.length, 6);
  await tokenOf(api, false);
  assert.equal((await client.request(src)).status, 404);
  assert.equal((await client.request(route)).status, 404);
  assert.notEqual(await tokenOf(api), token);
  await tokenOf('/api/share/archive', false);
  assert.equal((await client.request(archive.days[0].photos[0].src)).status, 404);
});

test('later demo revisions reach an existing vault with bundled audio and keep deleted demo days deleted', async t => {
  const { client, dir, publicDir } = await fixture(t, true);
  assert.equal(await readFile(path.join(dir, '.seeded'), 'utf8'), '1');
  const wav = Buffer.alloc(46);
  wav.write('RIFF', 0); wav.writeUInt32LE(38, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(2, 40);
  await mkdir(path.join(publicDir, 'audio'));
  await writeFile(path.join(publicDir, 'audio', 'pair.wav'), wav);
  const demos = JSON.parse(await readFile(path.join(publicDir, 'demo.json'), 'utf8'));
  const track = { kind: 'file', title: 'Пара', artist: 'DayTrace', bpm: 82, bpmSource: 'measured', src: '/audio/pair.wav',
    brightness: .24, percussiveness: .4, mode: 'major', modeConfidence: .74, spectralCentroidHz: 476 };
  demos.push({ ...demos[0], id: 'control-pair', seedRevision: 2, track });
  await writeFile(path.join(publicDir, 'demo.json'), JSON.stringify(demos));
  const removed = (await readdir(dir)).find(name => name.endsWith('_sample-0'));
  await rm(path.join(dir, removed), { recursive: true });
  await client.close();
  for (let restart = 0; restart < 2; restart++) {
    const next = await listen(dir, publicDir);
    try {
      const list = await (await next.request('/api/days')).json();
      assert.equal(list.length, 6);
      assert.ok(!list.some(day => day.id === 'sample-0'));
      const pair = list.find(day => day.id === 'control-pair');
      assert.equal(pair.seedRevision, undefined);
      assert.equal(pair.track.spectralCentroidHz, 476);
      assert.deepEqual(Buffer.from(await (await next.request(pair.track.src)).arrayBuffer()), wav);
      assert.equal(await readFile(path.join(dir, '.seeded'), 'utf8'), '2');
    } finally { await next.close(); }
  }
});

test('standalone memory.html bundles postcardLayout, drawPostcardDesign and parametric recipe without runtime errors', async t => {
  const { client } = await fixture(t);
  await client.request('/');
  const linkTrack = {
    kind: 'link', url: 'https://open.spotify.com/track/3W2ZcrRsInZbjWylOi6KhZ',
    source: 'spotify-catalog', title: 'You & Me', artist: 'Disclosure',
    bpm: 142, bpmSource: 'catalog', mode: 'minor', energy: .93, brightness: .79, percussiveness: .88
  };
  const created = await (await client.request('/api/days', 'POST', { ...example, track: linkTrack, voice: true })).json();
  assert.equal(created.track.bpm, 142);
  assert.equal(created.track.bpmSource, 'catalog');
  assert.equal(created.track.percussiveness, .88);
  const archive = unzip(Buffer.from(await (await client.request('/api/days/' + created.id + '/zip')).arrayBuffer()));
  const page = archive.get('memory.html').toString();
  assert.match(page, /const postcardLayout=/);
  assert.match(page, /const drawPostcardDesign=/);
  assert.match(page, /--card-paper:/);
  assert.match(page, /--plate-w:/);
  assert.match(page, /--photo-filter:saturate\(/);
  assert.match(page, /Тембр «/);
  const scriptMatch = page.match(/<script type="module">([\s\S]+)<\/script>/);
  assert.ok(scriptMatch);
  // Execute the embedded drawPostcardDesign and drawSoundSignature with a minimal 2D mock context to verify zero ReferenceError.
  const calls = [];
  const ctx = new Proxy({}, { get: (_, prop) => (...args) => calls.push([prop, args.length]) });
  const runner = new Function('ctx',
    scriptMatch[1].replace(/\(\s*async function openPostcard[\s\S]*$/, 'return { postcardLayout, drawPostcardDesign, drawSoundSignature };')
  );
  const { postcardLayout: layoutFn, drawPostcardDesign: drawFn, drawSoundSignature: sigFn } = runner(ctx);
  const recipeArg = JSON.parse(scriptMatch[1].match(/drawPostcardDesign,\s*(\{[\s\S]+\})\)$/)?.[1] || 'null');
  assert.ok(recipeArg && Number.isFinite(recipeArg.whitespace) && recipeArg.envelope.length === 56);
  const box = layoutFn(880, 1100, recipeArg);
  assert.ok(box.w > 0 && box.h > 0);
  drawFn(ctx, 880, 1100, recipeArg);
  sigFn(ctx, 880, 1100, recipeArg, 0.5);
  assert.ok(calls.some(([name]) => name === 'stroke'));
});

test('video upload saves MP4/WebM + poster, streams with Range 206, exports in ZIP and renders video in memory.html', async t => {
  const { client } = await fixture(t);
  await client.request('/');
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypisom'), Buffer.from([0, 0, 2, 0, 1, 2, 3, 4])]);
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01]);
  const videoPhotos = [
    { name: 'улица.mp4', kind: 'video', src: 'data:video/mp4;base64,' + mp4.toString('base64'), poster: 'data:image/png;base64,' + image, duration: 11.4 },
    { name: 'вечер.webm', kind: 'video', src: 'data:video/webm;base64,' + webm.toString('base64'), duration: 6.2 }
  ];
  const res = await client.request('/api/days', 'POST', { ...example, videoMotion: 0.72, photos: videoPhotos });
  assert.equal(res.status, 201);
  const day = await res.json();
  assert.equal(day.videoMotion, 0.72);
  assert.equal(day.photos[0].kind, 'video');
  assert.equal(day.photos[0].duration, 11.4);
  assert.ok(day.photos[0].poster.endsWith('/photos/01-poster.png'));
  const ranged = await client.request(day.photos[0].src, 'GET', undefined, { range: 'bytes=0-11' });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('content-type'), 'video/mp4');
  assert.equal(ranged.headers.get('accept-ranges'), 'bytes');
  assert.deepEqual(Buffer.from(await ranged.arrayBuffer()), mp4.subarray(0, 12));
  const webmRes = await client.request(day.photos[1].src);
  assert.equal(webmRes.status, 200);
  assert.equal(webmRes.headers.get('content-type'), 'video/webm');
  const archive = unzip(Buffer.from(await (await client.request('/api/days/' + day.id + '/zip')).arrayBuffer()));
  assert.deepEqual(archive.get('photos/01.mp4'), mp4);
  assert.deepEqual(archive.get('photos/01-poster.png'), Buffer.from(image, 'base64'));
  assert.deepEqual(archive.get('photos/02.webm'), webm);
  const page = archive.get('memory.html').toString();
  assert.match(page, /<video[^>]+src="photos\/01\.mp4"[^>]+poster="photos\/01-poster\.png"/);
  const bad = await client.request('/api/days', 'POST', {
    ...example, photos: [{ name: 'fake.mp4', kind: 'video', src: 'data:video/mp4;base64,' + Buffer.from('not-a-video-file').toString('base64') }]
  });
  assert.equal(bad.status, 400);
});

test('импорт Google Фото скачивает видео через =dv и сохраняет его в день', async t => {
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypisom'), Buffer.from([0, 0, 2, 0, 1, 2, 3, 4])]);
  const { client } = await fixture(t, false, { googlePhotosClientId: 'test-client', googlePhotosFetch: async (address) => {
    const url = new URL(address);
    if (url.pathname === '/v1/sessions') return Response.json({ id: 'pick-v', pickerUri: 'https://photos.google.com/picker/v' });
    if (url.pathname === '/v1/sessions/pick-v') return Response.json({ mediaItemsSet: true });
    if (url.pathname === '/v1/mediaItems') {
      return Response.json({ mediaItems: [{ type: 'VIDEO', mediaFile: { filename: 'прогулка.mp4', baseUrl: 'https://lh3.googleusercontent.com/vid1' } }] });
    }
    if (url.href === 'https://lh3.googleusercontent.com/vid1=dv') return Response.redirect('https://rr1.googlevideo.com/videoplayback?id=1', 302);
    assert.equal(url.href, 'https://rr1.googlevideo.com/videoplayback?id=1');
    return new Response(mp4);
  } });
  await client.request('/');
  const auth = { authorization: 'Bearer tok' };
  const session = await (await client.request('/api/google-photos/sessions', 'POST', { limit: 2 }, auth)).json();
  const res = await (await client.request('/api/google-photos/sessions/' + session.id + '/photos', 'GET', undefined, auth)).json();
  assert.deepEqual(res, {
    photos: [{ name: 'прогулка.mp4', kind: 'video', src: 'data:video/mp4;base64,' + mp4.toString('base64') }],
    skipped: []
  });
  assert.equal((await client.request('/api/days', 'POST', { ...example, photos: res.photos })).status, 201);
});

test('маршрут Deezer BPM, точка фокуса кадра и ручной ритм сохраняются в день и открытку', async t => {
  const { client } = await fixture(t, false, {
    deezerFetch: async url => {
      assert.equal(url, 'https://api.deezer.com/track/1109737');
      return Response.json({ id: 1109737, bpm: 104.4, title: 'Veridis Quo', artist: { name: 'Daft Punk' } });
    }
  });
  await client.request('/');
  const dz = await (await client.request('/api/music/deezer/1109737')).json();
  assert.deepEqual(dz, { bpm: 104.4, title: 'Veridis Quo', artist: 'Daft Punk' });
  const focus = { x: 0.2, y: 0.72, ratio: 1.5, manual: true };
  const payload = {
    ...example,
    photos: [{ ...example.photos[0], focus }],
    track: { kind: 'link', url: 'https://www.deezer.com/track/1109737', title: dz.title, artist: dz.artist, bpm: 104.4, bpmSource: 'deezer' }
  };
  const created = await (await client.request('/api/days', 'POST', payload)).json();
  assert.deepEqual(created.photos[0].focus, focus);
  assert.equal(created.track.bpmSource, 'deezer');
  const archive = unzip(Buffer.from(await (await client.request('/api/days/' + created.id + '/zip')).arrayBuffer()));
  assert.match(archive.get('memory.html').toString(), /object-position:/);
  const miniWav = Buffer.from('RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x40\x1f\x00\x00\x80\x3e\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00', 'binary');
  const tapped = await (await client.request('/api/days', 'POST', {
    ...example,
    track: { kind: 'file', src: 'data:audio/wav;base64,' + miniWav.toString('base64'), title: 'Ритм', artist: 'Я', bpm: 120, bpmSource: 'tap', pulseStatus: 'variable' }
  })).json();
  assert.equal(tapped.track.bpmSource, 'tap');
  assert.equal(tapped.track.pulseStatus, 'variable');
});

test('удаление записи через DELETE /api/days/:id убирает папку, медиа и ссылку доступа', async t => {
  const { client } = await fixture(t);
  await client.request('/');
  const created = await (await client.request('/api/days', 'POST', example)).json();
  const shared = await (await client.request('/api/share/day/' + created.id, 'PUT', { enabled: true })).json();
  const token = shared.url.split('/').pop();
  assert.equal((await client.request('/api/public/day/' + token)).status, 200);

  const removed = await client.request('/api/days/' + created.id, 'DELETE');
  assert.equal(removed.status, 200);
  assert.deepEqual(await removed.json(), { deleted: created.id });

  const list = await (await client.request('/api/days')).json();
  assert.ok(!list.some(item => item.id === created.id));
  assert.equal((await client.request('/api/days/' + created.id)).status, 404);
  assert.equal((await client.request('/api/public/day/' + token)).status, 404);
  assert.equal((await client.request('/api/days/' + created.id, 'DELETE')).status, 404);
});
