import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicResolver } from '../server/music.mjs';

const request = (params = {}) => {
  const url = new URL('http://localhost/api/music');
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, item);
  }
  return url;
};
const credentials = {SPOTIFY_CLIENT_ID:'test-client', SPOTIFY_CLIENT_SECRET:'test-secret'};
const response = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {status, headers});
const offline = () => createMusicResolver({env:{}, fetchImpl: () => assert.fail('Подбор без ключей должен работать офлайн.')});

test('по четырём настроениям возвращаются 16 различных записей Spotify без ключей и сетевых запросов', async () => {
  const resolve = offline();
  const ids = new Set();
  for (const mood of ['calm','dream','joy','energy']) {
    for (let variant = 0; variant < 4; variant++) {
      const {track} = await resolve(request({mood, variant}));
      assert.equal(track.source, 'spotify-catalog');
      assert.equal(track.kind, 'link');
      assert.equal(track.url, 'https://open.spotify.com/track/' + track.id);
      assert.match(track.id, /^[A-Za-z0-9]{22}$/);
      assert.ok(track.title && track.artist && !track.src);
      ids.add(track.id);
    }
  }
  assert.equal(ids.size,16);
});

test('теплота и энергия меняют выбор, история и предыдущий трек исключаются по ссылке или ID', async () => {
  const resolve = offline();
  const prefs = {mood:'joy', warmth: .84, energy:.35};
  const {track:first} = await resolve(request(prefs));
  assert.equal(first.title, 'Friday Morning');
  const {track:louder} = await resolve(request({...prefs, energy:.91}));
  assert.match(louder.title, /Get Lucky/);
  const {track:warmer} = await resolve(request({mood:'calm', warmth:.86, energy:.13}));
  const {track:cooler} = await resolve(request({mood:'calm', warmth:.34, energy:.13}));
  assert.notEqual(warmer.id,cooler.id);
  const {track:next} = await resolve(request({...prefs, previous:first.url + '?si=xyz', recent:louder.id}));
  assert.ok(![first.id,louder.id].includes(next.id));
  const {track:third} = await resolve(request({...prefs, previous:next.id, recent:[first.url,'spotify:track:' + louder.id]}));
  assert.ok(![first.id,louder.id,next.id].includes(third.id));
  const defaults = await resolve(request());
  assert.deepEqual(await resolve(request({mood:'constructor',warmth:'NaN',energy:'',variant:'invalid'})),defaults);
});

function liveFixture({preview = null, override = {}, toResponse} = {}) {
  const log = [];
  let currentTime = 1000;
  const resolve = createMusicResolver({env:credentials, now:() => currentTime, fetchImpl:async (target, options) => {
    const u = new URL(target);
    log.push({u,options});
    if (u.pathname === '/api/token') return response({access_token:'token',expires_in:3600});
    if (toResponse) return toResponse();
    const id = '0123456789abcdefghijkl';
    return response({tracks:{items:[{
      id, name:'Concert Recording', artists:[{name:'Khruangbin'}], external_urls:{spotify:'https://open.spotify.com/track/' + id},
      preview_url:preview, is_playable:true, ...override
    }]}});
  }});
  return {resolve, log, advance:ms => { currentTime += ms; }};
}
const search = request({mood:'joy', warmth:.84, energy:.35});

test('живой поиск сохраняет Spotify-ссылку и метаданные при preview_url=null', async () => {
  const {resolve,log} = liveFixture();
  const {track} = await resolve(search);
  assert.deepEqual([track.kind,track.source,track.title,track.artist],['link','spotify-api','Concert Recording','Khruangbin']);
  assert.ok(!track.src);
  assert.equal(log.length,2);
  assert.equal(log[0].options.body,'grant_type=client_credentials');
  assert.equal(log[1].u.searchParams.get('type'),'track');
  assert.equal(log[1].u.searchParams.get('market'),'KZ');
  assert.match(log[1].u.searchParams.get('q'),/Khruangbin/);
  assert.equal(log[1].options.headers.Authorization,'Bearer token');
  assert.deepEqual(await resolve(search),{track});
  assert.equal(log.length,2);
  const {track:reroll} = await resolve(request({mood:'joy',warmth:.84,energy:.35,previous:track.url}));
  assert.notEqual(reroll.id,track.id);
});

test('новые предложения всегда возвращают ссылку для официального плеера, включая ответы со старым preview_url', async () => {
  for (const target of ['https://p.scdn.co/mp3-preview/demo-fixture','https://unrelated.example/file.mp3',null]) {
    const {track} = await liveFixture({preview:target}).resolve(search);
    assert.equal(track.kind,'link');
    assert.equal(track.source,'spotify-api');
    assert.ok(!track.src);
  }
});

test('закрытый регион, неверный объект, пустой ответ и сбой провайдера оставляют доступным каталог ссылок', async () => {
  const cases = [
    {override:{id:'invalid'}}, {override:{available_markets:['GB']}}, {override:{is_playable:false}},
    {override:{artists:[{name:'Another artist'}]}}, {override:{external_urls:{spotify:'https://unrelated.example/'}}},
    {toResponse:() => response({tracks:{items:[]}})}, {toResponse:() => response({},403)},
    {toResponse:() => { throw Error('offline'); }}
  ];
  for (const input of cases) {
    const {track} = await liveFixture(input).resolve(search);
    assert.equal(track.source,'spotify-catalog');
    assert.equal(track.title,'Friday Morning');
    assert.equal(track.kind,'link');
  }
});

test('Spotify Retry-After останавливает повторные обращения до указанного времени', async () => {
  const {resolve,log,advance} = liveFixture({toResponse:() => response({},429,{'retry-after':'30'})});
  await resolve(search);
  await resolve(search);
  assert.equal(log.length,2);
  advance(31000);
  await resolve(search);
  assert.equal(log.length,3);
});

test('темп Deezer принимается только для совпавшего трека с известным BPM', async () => {
  const { deezerTempo } = await import('../server/music.mjs');
  for (const [id,bpm,expected] of [[123,104.4,104.4],[124,104.4,null],[123,0,null]]) {
    const result = await deezerTempo('123', async url => {
      assert.equal(url, 'https://api.deezer.com/track/123');
      return Response.json({ id,bpm });
    });
    assert.equal(result.bpm,expected);
  }
  assert.deepEqual(await deezerTempo('123', () => { throw Error('offline'); }), {bpm:null});
});
