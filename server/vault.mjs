import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { makeZip } from './zip.mjs';
import { spotifyTrackId } from './music.mjs';
import { portablePage } from './portable.mjs';
import { synthesizeVoice } from './voice.mjs';
import { coverTextLimit, normalizeCoverText } from './cover-text.mjs';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const invalid = message => { throw new HttpError(400, message); };
const notFound = () => { throw new HttpError(404, 'Запись или ссылка недоступна.'); };
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const moods = new Set(['calm', 'joy', 'dream', 'energy']);
const weatherTypes = new Set(['rain_glass', 'wind_sparks', 'mist', 'warm_haze', 'clear_light']);
const imageMime = new Map([
  ['image/jpeg', 'jpg'], ['image/jpg', 'jpg'], ['image/png', 'png'],
  ['image/webp', 'webp'], ['image/gif', 'gif'], ['image/avif', 'avif']
]);
const audioMime = new Map([
  ['audio/mpeg', 'mp3'], ['audio/mp3', 'mp3'], ['audio/mp4', 'm4a'],
  ['audio/x-m4a', 'm4a'], ['audio/aac', 'aac'], ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'], ['audio/ogg', 'ogg'], ['audio/webm', 'webm'],
  ['audio/flac', 'flac'], ['audio/x-flac', 'flac']
]);

function stringValue(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    invalid('Проверьте поле «' + label + '».');
  }
  return value.trim();
}
function score(value, label, low = 0, high = 1) {
  if (!Number.isFinite(value) || value < low || value > high) invalid('Недопустимое значение: ' + label);
  return value;
}
function httpUrl(value) {
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && url.href.length < 4096) return url.href;
  } catch { /* Unusable URL. */ }
  invalid('Укажите полную ссылку HTTP или HTTPS.');
}
function unpackDataUrl(src, allowed, maxBytes) {
  if (typeof src !== 'string' || !src.startsWith('data:')) invalid('Файл не прикреплён.');
  const comma = src.indexOf(',');
  const meta = src.slice(5, comma).toLowerCase().split(';');
  const ext = allowed.get(meta[0]);
  if (!ext || meta.at(-1) !== 'base64' || comma < 0 || comma > 120) invalid('Формат файла не поддерживается.');
  const encoded = src.slice(comma + 1);
  if (encoded.length > Math.ceil(maxBytes / 3) * 4) throw new HttpError(413, 'Слишком большой файл.');
  if (!encoded.length || encoded.length % 4 || /[^A-Za-z0-9+/=]/.test(encoded)) invalid('Не удалось прочитать вложение.');
  const data = Buffer.from(encoded, 'base64');
  if (!data.length || data.length > maxBytes) invalid('Не удалось прочитать вложение.');
  return { data, ext };
}
export function imageFormat(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return 'gif';
  if (bytes.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(bytes.toString('ascii', 8, 40))) return 'avif';
  invalid('Файл не распознан как изображение.');
}
async function atomicWrite(file, data) {
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, data, { flag: 'wx' });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true }).catch(() => {});
  }
}
function pretty(value) { return JSON.stringify(value, null, 2) + '\n'; }

function cleanDay(input) {
  if (!input || typeof input !== 'object') invalid('Ожидалась запись дня.');
  const { date, title, mood, weather, palette, text, quote, warmth, energy, photos, explanation, voice, favorite } = input;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) invalid('Проверьте дату дня.');
  if (!moods.has(mood)) invalid('Неизвестное настроение.');
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > 8 || palette.some(color => !/^#[0-9A-Fa-f]{6}$/.test(color))) invalid('Палитра повреждена.');
  if (!Array.isArray(photos) || photos.length < 1 || photos.length > 5) invalid('Добавьте от одной до пяти фотографий.');
  const coverText = normalizeCoverText(input.coverText);
  if (input.coverText !== undefined && !coverText) invalid('Для обложки нужна короткая фраза до ' + coverTextLimit + ' символов.');
  return {
    date, title: stringValue(title, 160, 'Название'), text: stringValue(text, 50000, 'Текст'),
    quote: stringValue(quote, 1000, 'Цитата'), mood, weather: stringValue(weather, 120, 'Погода'),
    ...(coverText ? { coverText } : {}),
    ...(weatherTypes.has(input.weatherType) ? { weatherType: input.weatherType } : {}),
    ...(['gemini', 'local-model'].includes(input.analysisSource) ? { analysisSource: input.analysisSource } : {}),
    palette, warmth: score(warmth, 'теплота'), energy: score(energy, 'энергия'),
    explanation: Array.isArray(explanation) ? explanation.slice(0, 12).map(item => stringValue(item, 1600, 'Объяснение')) : [],
    voice: Boolean(voice), favorite: Boolean(favorite)
  };
}
function cleanTrack(input) {
  if (!input || !['ambient', 'file', 'link', 'preview'].includes(input.kind)) invalid('Выберите дорожку.');
  const track = {
    title: stringValue(input.title, 200, 'Трек'), artist: stringValue(input.artist, 200, 'Исполнитель'),
    bpm: input.bpm == null ? null : score(input.bpm, 'темп', 0, 360), kind: input.kind
  };
  if (input.variant !== undefined) track.variant = score(input.variant, 'вариант', 0, 1000000);
  if (input.reason) track.reason = stringValue(input.reason, 1600, 'Выбор музыки');
  if (input.energy != null) track.energy = score(input.energy, 'энергия аудио');
  if (input.brightness != null) track.brightness = score(input.brightness, 'яркость аудио');
  if (['minor', 'major'].includes(input.mode)) track.mode = input.mode;
  if (input.url) track.url = httpUrl(input.url);
  if (input.kind === 'preview') track.src = httpUrl(input.src);
  if (input.kind === 'link' && !track.url) invalid('Укажите ссылку на трек.');
  const id = spotifyTrackId(track.url);
  if (id) track.id = id;
  if (['spotify-api', 'spotify-catalog'].includes(input.source)) {
    if (!id || !['preview', 'link'].includes(track.kind)) invalid('Для трека Spotify нужна ссылка на запись в Spotify.');
    track.source = input.source;
    track.url = 'https://open.spotify.com/track/' + id;
  }
  return track;
}

// Only filesystem paths produced by this module enter a stored memory passport.
// Public responses replace those paths with URLs scoped to the appropriate audience.
export async function openVault(vaultDir, publicDir) {
  await mkdir(vaultDir, { recursive: true });
  const days = new Map();
  const shareFile = path.join(vaultDir, '.sharing.json');
  let shares = {};
  try { shares = JSON.parse(await readFile(shareFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const dir of await readdir(vaultDir, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name.startsWith('.')) continue;
    const folder = path.join(vaultDir, dir.name);
    const day = JSON.parse(await readFile(path.join(folder, 'memory.json'), 'utf8'));
    if (!validId(day.id) || days.has(day.id)) throw new Error('Некорректный идентификатор в ' + dir.name);
    let passportChanged = false;
    const spotifyId = spotifyTrackId(day.track?.url);
    if (spotifyId && day.track.id !== spotifyId) {
      day.track.id = spotifyId;
      passportChanged = true;
    }
    if (day.voice && !day.voiceSrc && !day.voiceFallback) {
      if (await synthesizeVoice(folder, day)) day.voiceSrc = 'voiceover.wav';
      else day.voiceFallback = true;
      passportChanged = true;
    }
    if (passportChanged) await atomicWrite(path.join(folder, 'memory.json'), pretty(day));
    // The passport is canonical. Recover a missing or stale derived postcard on restart.
    const portable = await portablePage(day);
    const postcard = path.join(folder, 'memory.html');
    if (await readFile(postcard, 'utf8').catch(() => null) !== portable) await atomicWrite(postcard, portable);
    days.set(day.id, { day, folder });
  }

  let pending = Promise.resolve();
  function change(operation) {
    const job = pending.then(operation);
    pending = job.catch(() => {});
    return job;
  }
  function record(id) { return days.get(id) || notFound(); }
  function view(day, share) {
    const prefix = share ? '/shared-media/' + share + '/' : '/media/';
    const route = src => prefix + day.id + '/' + src.split('/').map(encodeURIComponent).join('/');
    return {
      ...day, photos: day.photos.map(photo => ({ ...photo, src: route(photo.src) })),
      ...(day.voiceSrc ? { voiceSrc: route(day.voiceSrc) } : {}),
      track: day.track.kind === 'file' ? { ...day.track, src: route(day.track.src) } : day.track
    };
  }
  function lookupShare(scope, token) {
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) notFound();
    const key = Object.keys(shares).find(k => shares[k] === token && (scope === 'archive' ? k === 'archive' : k.startsWith('day/')));
    return key || notFound();
  }
  async function saveTrack(input, folder) {
    const track = cleanTrack(input);
    if (track.kind === 'file') {
      const { data, ext } = unpackDataUrl(input.src, audioMime, 24 * 1024 * 1024);
      await mkdir(path.join(folder, 'audio'), { recursive: true });
      track.src = 'audio/' + randomUUID().slice(0, 12) + '.' + ext;
      await writeFile(path.join(folder, track.src), data, { flag: 'wx' });
    }
    return track;
  }
  async function create(input, seed = false) {
    const day = cleanDay(input);
    day.id = seed && validId(input.id) ? input.id : randomUUID();
    if (days.has(day.id)) return view(record(day.id).day);
    // The date prefix also avoids reserved Windows device filenames.
    const slug = day.title.replace(/[^\p{L}\p{N} -]/gu, '').replace(/\s+/g, '-').slice(0, 75) || 'день';
    const folder = path.join(vaultDir, day.date + '_' + slug + '_' + day.id.slice(0, 8));
    const staging = path.join(vaultDir, '.new-' + randomUUID());
    await mkdir(path.join(staging, 'photos'), { recursive: true });
    try {
      day.photos = [];
      for (const [index, image] of input.photos.entries()) {
        if (!image || typeof image !== 'object') invalid('Проверьте фотографии.');
        const name = stringValue(image.name, 255, 'Имя фотографии');
        let data;
        if (seed && typeof image.src === 'string' && image.src.startsWith('/images/')) {
          const root = path.resolve(publicDir, 'images');
          const location = path.resolve(publicDir, '.' + image.src);
          if (!location.startsWith(root + path.sep)) invalid('Путь к демофото недоступен.');
          data = await readFile(location);
        } else {
          ({ data } = unpackDataUrl(image.src, imageMime, 12 * 1024 * 1024));
        }
        const src = 'photos/' + String(index + 1).padStart(2, '0') + '.' + imageFormat(data);
        await writeFile(path.join(staging, src), data);
        day.photos.push({ name, src });
      }
      day.track = await saveTrack(input.track, staging);
      if (day.voice) {
        if (await synthesizeVoice(staging, day)) day.voiceSrc = 'voiceover.wav';
        else day.voiceFallback = true;
      }
      await writeFile(path.join(staging, 'entry.txt'), day.text, 'utf8');
      await writeFile(path.join(staging, 'memory.html'), await portablePage(day), 'utf8');
      await writeFile(path.join(staging, 'memory.json'), pretty(day), 'utf8');
      await rename(staging, folder);
      days.set(day.id, { day, folder });
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
    return view(day);
  }

  // Stable seed IDs make recovery safe if the first import was interrupted.
  const seeded = path.join(vaultDir, '.seeded');
  try { await readFile(seeded); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    let demo;
    try { demo = JSON.parse(await readFile(path.join(publicDir, 'demo.json'), 'utf8')); }
    catch (readError) { if (readError.code !== 'ENOENT') throw readError; }
    if (demo) {
      for (const [i, entry] of demo.entries()) await create({ ...entry, id: entry.id || 'demo-' + (i + 1) }, true);
      await atomicWrite(seeded, '1');
    }
  }
  function list(share) {
    return [...days.values()].sort((a,b) => b.day.date.localeCompare(a.day.date)).map(({day}) => view(day, share));
  }
  return {
    list: () => list(), get: id => view(record(id).day), create: input => change(() => create(input)),
    setFavorite: (id, favorite) => change(async () => {
      if (typeof favorite !== 'boolean') invalid('Укажите состояние избранного.');
      const item = record(id);
      const updated = { ...item.day, favorite };
      await atomicWrite(path.join(item.folder, 'memory.json'), pretty(updated));
      item.day = updated;
      return view(updated);
    }),
    updateTrack: (id, input) => change(async () => {
      const item = record(id);
      const previous = item.day.track;
      const track = await saveTrack(input, item.folder);
      const updated = { ...item.day, track };
      const postcard = path.join(item.folder, 'memory.html');
      try {
        await atomicWrite(postcard, await portablePage(updated));
        await atomicWrite(path.join(item.folder, 'memory.json'), pretty(updated));
      }
      catch (error) {
        await atomicWrite(postcard, await portablePage(item.day)).catch(() => {});
        if (track.kind === 'file') await rm(path.join(item.folder, track.src), { force: true }).catch(() => {});
        throw error;
      }
      item.day = updated;
      if (previous.kind === 'file') await rm(path.join(item.folder, previous.src), { force: true }).catch(() => {});
      return view(updated);
    }),
    zip: id => change(async () => {
      const { day, folder } = record(id);
      const names = ['memory.html', 'memory.json', 'entry.txt', ...day.photos.map(p => p.src)];
      if (day.track.kind === 'file') names.push(day.track.src);
      if (day.voiceSrc) names.push(day.voiceSrc);
      const dirname = path.basename(folder);
      const files = await Promise.all(names.map(async file => [dirname + '/' + file, await readFile(path.join(folder, file))]));
      return { name: dirname + '.zip', data: makeZip(files) };
    }),
    media: (id, file, token, scope) => {
      if (token) {
        const key = lookupShare(scope, token);
        if (key !== 'archive' && key !== 'day/' + id) notFound();
      }
      const { day, folder } = record(id);
      if (!day.photos.some(p => p.src === file) && !(day.track.kind === 'file' && day.track.src === file) && day.voiceSrc !== file) notFound();
      return path.join(folder, file);
    },
    getShare: key => {
      if (key !== 'archive') record(key.slice(4));
      return shares[key] || null;
    },
    setShare: (key, enabled) => change(async () => {
      if (key !== 'archive') record(key.slice(4));
      if (typeof enabled !== 'boolean') invalid('Укажите состояние доступа.');
      const next = { ...shares };
      if (enabled) next[key] ||= randomBytes(24).toString('base64url');
      else delete next[key];
      await atomicWrite(shareFile, pretty(next));
      shares = next;
      return shares[key] || null;
    }),
    publicDays: (scope, token) => {
      const key = lookupShare(scope, token);
      const sharePath = scope + '/' + token;
      return key === 'archive' ? list(sharePath) : [view(record(key.slice(4)).day, sharePath)];
    }
  };
}
