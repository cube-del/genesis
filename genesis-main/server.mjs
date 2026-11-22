import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { openVault, HttpError } from './server/vault.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.avif': 'image/avif',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.webm': 'audio/webm', '.zip': 'application/zip',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.ogv': 'video/ogg'
};
const missing = () => { throw new HttpError(404, 'Страница или ссылка недоступна.'); };
const denied = () => { throw new HttpError(403, 'Личный архив доступен только владельцу на его компьютере.'); };
const idPattern = '[A-Za-z0-9_-]{1,80}';
const dayRoute = new RegExp('^/api/days/(' + idPattern + ')(?:/(track|favorite|zip|author-look|moment|turn|recall))?$');
const shareRoute = new RegExp('^/api/share/(archive|day/' + idPattern + ')$');
const publicRoute = /^\/api\/public\/(archive|day)\/([A-Za-z0-9_-]{32})$/;
const mediaRoute = new RegExp('^/(?:media/|shared-media/(archive|day)/([A-Za-z0-9_-]{32})/)(' + idPattern + ')/((?:photos|audio)/[A-Za-z0-9.-]+|voiceover\\.wav)$');
const spaRoute = new RegExp('^/(?:create/?|day/' + idPattern + '/?|share/(?:archive|day)/[A-Za-z0-9_-]+/?)?$');

function json(res, value, status = 200) {
  res.writeHead(status, { 'Content-Type': mime['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function readBody(req, limit = 116 * 1024 * 1024) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'Требуется тело запроса JSON.');
  }
  if (Number(req.headers['content-length']) > limit) throw new HttpError(413, 'Слишком большой объём вложений.');
  const chunks = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > limit) throw new HttpError(413, 'Слишком большой объём вложений.');
    chunks.push(part);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch { /* Report malformed JSON with a user-facing message. */ }
  throw new HttpError(400, 'Не удалось прочитать данные запроса.');
}
async function serveFile(req, res, absolutePath, cache = 'no-store') {
  let file;
  try { file = await stat(absolutePath); }
  catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) missing(); throw error; }
  if (!file.isFile()) missing();
  const ext = path.extname(absolutePath).toLowerCase();
  const contentType = ext === '.webm' && absolutePath.includes(path.sep + 'photos' + path.sep)
    ? 'video/webm'
    : (mime[ext] || 'application/octet-stream');
  const headers = { 'Content-Type': contentType, 'Cache-Control': cache, 'Accept-Ranges': 'bytes' };
  let start = 0;
  let end = file.size - 1;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (match && (match[1] || match[2])) {
      if (!match[1]) start = Math.max(0, file.size - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
    }
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || start > end || start >= file.size) {
      res.writeHead(416, { ...headers, 'Content-Range': 'bytes */' + file.size });
      return res.end();
    }
    headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + file.size;
  }
  headers['Content-Length'] = Math.max(0, end - start + 1);
  res.writeHead(req.headers.range ? 206 : 200, headers);
  if (req.method === 'HEAD' || file.size === 0) return res.end();
  await pipeline(createReadStream(absolutePath, { start, end }), res);
}

function localOwnerSurface(req, host) {
  const localNames = ['localhost', '127.0.0.1', '[::1]'];
  const localAddresses = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  const forwarded = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'cf-connecting-ip'];
  return localNames.includes(host.hostname) && localAddresses.includes(req.socket.remoteAddress) &&
    !forwarded.some(header => req.headers[header] !== undefined);
}

export async function createDaytraceServer(options = {}) {
  const publicDir = path.resolve(options.publicDir || path.join(root, 'public'));
  const vault = await openVault(path.resolve(options.vaultDir || process.env.DAYTRACE_VAULT || path.join(root, '..', 'vault')), publicDir);
  const knownOrigin = options.publicUrl || process.env.DAYTRACE_PUBLIC_URL;
  const shareOrigin = knownOrigin ? new URL(knownOrigin).origin : null;
  if (shareOrigin && !/^https?:\/\//.test(shareOrigin)) throw new Error('DAYTRACE_PUBLIC_URL должен начинаться с https:// или http://');
  const ownerKey = randomBytes(32).toString('hex');
  async function preferredAtmosphereSource() {
    if (process.env.GEMINI_API_KEY?.trim()) return 'gemini';
    const { localAtmosphereReady } = await import('./server/local-atmosphere.mjs');
    return await localAtmosphereReady() ? 'local-model' : 'local-rules';
  }
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    try {
      const origin = new URL('http://' + req.headers.host);
      const url = new URL(req.url, origin);
      const route = decodeURIComponent(url.pathname);
      if (route.includes('\\') || route.includes('\0')) missing();
      const method = req.method;
      const read = method === 'GET' || method === 'HEAD';
      const cookie = (req.headers.cookie || '').split(';').map(value => value.trim()).includes('daytrace_session=' + ownerKey);
      const local = localOwnerSurface(req, origin);
      function owner(bootstrap = false) {
        const directNavigation = read && req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document' && spaRoute.test(route);
        if (!local || (req.headers['sec-fetch-site'] === 'cross-site' && !directNavigation) || (req.headers.origin && req.headers.origin !== origin.origin)) denied();
        if (cookie) return;
        if (!bootstrap) denied();
        res.setHeader('Set-Cookie', 'daytrace_session=' + ownerKey + '; Path=/; HttpOnly; SameSite=Strict');
      }
      if (route === '/health' && read) return json(res, { status: 'ok' });
      const publicAccess = route.match(publicRoute);
      if (publicAccess && read) return json(res, { days: vault.publicDays(publicAccess[1], publicAccess[2]) });
      if (route.startsWith('/api/public/')) missing();
      const media = route.match(mediaRoute);
      if (media && read) {
        if (!media[1]) owner();
        return await serveFile(req, res, vault.media(media[3], media[4], media[2], media[1]));
      }
      if (route.startsWith('/api/')) {
        owner(read && (route === '/api/days' || dayRoute.test(route)));
        if (route.startsWith('/api/google-photos/')) {
          const clientId = (options.googlePhotosClientId ?? process.env.GOOGLE_PHOTOS_CLIENT_ID ?? '').trim();
          if (route === '/api/google-photos/config' && method === 'GET') return json(res, { clientId });
          const match = route.match(/^\/api\/google-photos\/sessions(?:\/([\w-][\w.~=-]{0,1023})(\/photos)?)?$/);
          if (!match || !(match[1] ? method === 'GET' || (method === 'DELETE' && !match[2]) : method === 'POST')) missing();
          if (!clientId) throw new HttpError(409, 'Для подключения укажите GOOGLE_PHOTOS_CLIENT_ID в настройках DayTrace.');
          const limit = !match[1] ? (await readBody(req, 1024)).limit : undefined;
          const ctrl = new AbortController();
          res.once('close', () => ctrl.abort());
          const { googlePhotos } = await import('./server/google-photos.mjs');
          const value = await googlePhotos({ method, session: match[1], photos: match[2], limit,
            authorization: req.headers.authorization, signal: ctrl.signal, request: options.googlePhotosFetch });
          if (!res.destroyed) return json(res, value);
          return;
        }
        if (route === '/api/days') {
          if (method === 'GET') return json(res, vault.list());
          if (method === 'POST') return json(res, await vault.create(await readBody(req, 512 * 1024 * 1024)), 201);
        }
        if (route === '/api/music/studies' && method === 'GET') return json(res, vault.studies());
        if (route === '/api/music' && method === 'GET') {
          const { resolveTrack } = await import('./server/music.mjs');
          return json(res, await resolveTrack(url));
        }
        const spotify = route.match(/^\/api\/music\/spotify\/([A-Za-z0-9]{22})$/);
        if (spotify && method === 'GET') {
          const { catalogProfile } = await import('./server/music.mjs');
          return json(res, catalogProfile(spotify[1]));
        }
        const deezer = route.match(/^\/api\/music\/deezer\/([1-9]\d{0,14})$/);
        if (deezer && method === 'GET') {
          const { deezerTempo } = await import('./server/music.mjs');
          return json(res, await deezerTempo(deezer[1], options.deezerFetch));
        }
        if (route === '/api/atmosphere/status' && method === 'GET') {
          return json(res, { analysisSource: await preferredAtmosphereSource(), ready: true });
        }
        if (route === '/api/atmosphere' && method === 'POST') {
          const input = await readBody(req, 24 * 1024 * 1024);
          let analysisSource = await preferredAtmosphereSource();
          if (input.expectedProvider && input.expectedProvider !== analysisSource) {
            throw new HttpError(409, 'Настройки анализа изменились. Обновите страницу перед отправкой.');
          }
          const ctrl = new AbortController();
          const cancel = () => ctrl.abort();
          res.once('close', cancel);
          try {
            const { analyzeRuleAtmosphere } = await import('./server/rule-atmosphere.mjs');
            const analyze = options.atmosphereAnalyzer || {
              gemini: async (...args) => (await import('./server/atmosphere.mjs')).analyzeAtmosphere(...args),
              'local-model': async (...args) => (await import('./server/local-atmosphere.mjs')).analyzeLocalAtmosphere(...args),
              'local-rules': analyzeRuleAtmosphere
            }[analysisSource];
            let result;
            try {
              result = await analyze(input, { signal: ctrl.signal });
            } catch (error) {
              if (options.atmosphereAnalyzer || analysisSource === 'local-rules' || ctrl.signal.aborted ||
                  !(error.status === 429 || error.status >= 500)) throw error;
              result = analyzeRuleAtmosphere(input);
              analysisSource = 'local-rules';
            }
            if (!res.destroyed) return json(res, { ...result, analysisSource });
            return;
          } finally {
            res.off('close', cancel);
          }
        }
        const day = route.match(dayRoute);
        if (day) {
          const [, id, action] = day;
          if (!action && method === 'GET') return json(res, vault.get(id));
          if (action === 'track' && method === 'PUT') return json(res, await vault.updateTrack(id, (await readBody(req)).track));
          if (['author-look','moment','turn'].includes(action) && method === 'PUT') {
            return json(res, await vault.updateMemory(id, action, await readBody(req, 8192)));
          }
          if (action === 'recall') {
            if (method === 'GET') return json(res, await vault.recalls(id));
            if (method === 'POST') return json(res, await vault.addRecall(id, await readBody(req, 4096)), 201);
          }
          if (action === 'favorite' && method === 'PUT') return json(res, await vault.setFavorite(id, (await readBody(req)).favorite));
          if (action === 'zip' && method === 'GET') {
            const file = await vault.zip(id);
            res.writeHead(200, { 'Content-Type': mime['.zip'], 'Content-Disposition': "attachment; filename=daytrace.zip; filename*=UTF-8''" + encodeURIComponent(file.name), 'Cache-Control': 'no-store' });
            return res.end(file.data);
          }
        }
        const share = route.match(shareRoute);
        if (share && ['GET', 'PUT'].includes(method)) {
          const key = share[1];
          const token = method === 'GET' ? vault.getShare(key) : await vault.setShare(key, (await readBody(req)).enabled);
          const scope = key === 'archive' ? key : 'day';
          return json(res, { enabled: Boolean(token), url: token ? (shareOrigin || origin.origin) + '/share/' + scope + '/' + token : null });
        }
        missing();
      }
      if (!read) throw new HttpError(405, 'Метод не поддерживается.');
      if (spaRoute.test(route)) {
        if (!route.startsWith('/share/')) {
          owner(true);
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
          if (options.googlePhotosClientId || process.env.GOOGLE_PHOTOS_CLIENT_ID) res.setHeader('Referrer-Policy', 'origin');
        }
        return await serveFile(req, res, path.join(publicDir, 'index.html'));
      }
      // Never expose the vault or the server's repository through the static route.
      if (route.split('/').some(part => part.startsWith('.')) || route.includes(':')) missing();
      const source = path.resolve(publicDir, '.' + route);
      if (!source.startsWith(publicDir + path.sep)) missing();
      let resolved;
      try { resolved = await realpath(source); }
      catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) missing(); throw error; }
      if (!resolved.startsWith(await realpath(publicDir) + path.sep)) missing();
      return await serveFile(req, res, resolved, 'no-cache');
    } catch (error) {
      if (res.destroyed) return;
      if (res.headersSent) return res.destroy();
      const status = error.status || (error instanceof URIError ? 400 : 500);
      if (status >= 500 && !error.expose) console.error(error);
      json(res, { error: status >= 500 && !error.expose ? 'Не удалось завершить операцию. Попробуйте ещё раз.' : error.message }, status);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createDaytraceServer();
  const host = process.env.DAYTRACE_HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 4173);
  server.listen(port, host, () => console.log('DayTrace — http://' + host + ':' + server.address().port));
}
