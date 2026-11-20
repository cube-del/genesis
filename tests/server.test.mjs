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

async function listen(dir, publicDir) {
  const server = await createDaytraceServer({ vaultDir: dir, publicDir });
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
async function fixture(t, seed = false) {
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
  const client = await listen(dir, publicDir);
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
  const created = await client.request('/api/days', 'POST', example);
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
  const postcard = files.get('memory.html').toString();
  assert.ok(postcard.includes('src="photos/01.png"'));
  assert.ok(postcard.includes(example.title));
  assert.ok(postcard.includes('data:text/javascript;base64,'));
});

test('озвученная открытка переносится в ZIP с WAV или с браузерным синтезом', async t => {
  const {client} = await fixture(t);
  await client.request('/');
  const day = await (await client.request('/api/days', 'POST', { ...example, voice: true })).json();
  assert.ok(day.id);
  const archive = unzip(Buffer.from(await (await client.request('/api/days/' + day.id + '/zip')).arrayBuffer()));
  const page = archive.get('memory.html').toString();
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

test('загруженная аудиодорожка попадает в ZIP, замена обновляет и портативную открытку', async t => {
  const {client} = await fixture(t);
  await client.request('/');
  const wav = Buffer.alloc(46);
  wav.write('RIFF'); wav.writeUInt32LE(38, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(2, 40);
  const track = {kind:'file', title:'Личная запись', artist:'Автор', bpm:null, mode:'minor', energy:.2,
    brightness:.32, src:'data:audio/wav;base64,' + wav.toString('base64')};
  const day = await (await client.request('/api/days', 'POST', {...example, track})).json();
  const archiveUrl = '/api/days/' + day.id + '/zip';
  const archive = unzip(Buffer.from(await (await client.request(archiveUrl)).arrayBuffer()));
  const passport = JSON.parse(archive.get('memory.json'));
  assert.equal(passport.track.mode, 'minor');
  assert.deepEqual(archive.get(passport.track.src), wav);
  assert.ok(archive.get('memory.html').toString().includes(passport.track.src));
  await client.request('/api/days/' + day.id + '/track', 'PUT', {track: example.track});
  assert.equal((await client.request(day.track.src)).status, 404);
  const updated = unzip(Buffer.from(await (await client.request(archiveUrl)).arrayBuffer()));
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
