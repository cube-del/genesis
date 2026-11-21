import { HttpError, imageFormat, videoFormat } from './vault.mjs';

const picker = 'https://photospicker.googleapis.com/v1';
const maxPhotoBytes = 50 * 1024 * 1024;
const maxVideoBytes = 250 * 1024 * 1024;
const imageFormats = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
const videoFormats = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', ogv: 'video/ogg' };

export async function googlePhotos({ method, session, photos, limit, authorization, signal, request = fetch }) {
  if (!/^Bearer [^\s,]+$/.test(authorization || '')) throw new HttpError(401, 'Подключите аккаунт Google ещё раз.');
  const headers = { Authorization: authorization };
  async function get(url, options = {}, sendToken = true) {
    let response;
    try {
      response = await request(url, {
        ...options, headers: { ...(sendToken ? headers : {}), ...options.headers }, redirect: options.redirect || 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(300000)])
      });
    } catch {
      throw new HttpError(408, 'Нет ответа от Google Фото. Проверьте подключение и повторите импорт.');
    }
    if (response.ok) return response;
    if (options.redirect === 'manual' && [301, 302, 303, 307, 308].includes(response.status)) return response;
    if (response.status === 403 && url.startsWith(picker + '/')) {
      const body = await response.json().catch(() => null);
      const reasons = Array.isArray(body?.error?.details)
        ? body.error.details.map(detail => detail?.reason)
        : [];
      if (reasons.includes('SERVICE_DISABLED')) {
        throw new HttpError(403, 'Включите Google Photos Picker API в том же проекте Google Cloud, где создан OAuth Client ID DayTrace.');
      }
      if (reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
        throw new HttpError(403, 'Google не выдал разрешение на выбор снимков. Проверьте разрешение Google Photos Picker API в Data Access и подключите аккаунт заново.');
      }
      const hint = url === picker + '/sessions'
        ? 'Google отклонил создание сеанса выбора. Проверьте Google Photos Picker API в проекте OAuth-клиента и аккаунт в списке Test users.'
        : 'Google закрыл доступ к сеансу выбора. Подключите Google Фото заново и выберите снимки ещё раз.';
      throw new HttpError(403, hint);
    }
    await response.body?.cancel();
    const messages = {
      401: 'Срок доступа истёк. Подключите Google Фото ещё раз.',
      403: 'Google запретил скачивание выбранного снимка. Откройте Google Фото заново и повторите выбор.',
      404: 'Выбор снимков истёк. Откройте Google Фото ещё раз.',
      429: 'Google Фото временно ограничил запросы. Повторите импорт позже.'
    };
    throw new HttpError(messages[response.status] ? response.status : 400,
      messages[response.status] || 'Google Фото не смог завершить запрос. Попробуйте ещё раз.');
  }
  async function download(base, suffix = '=d') {
    let url = new URL(base + suffix);
    const mediaOrigin = url.origin;
    for (let hops = 0; hops < 5; hops++) {
      const mediaHost = url.hostname.endsWith('.googleusercontent.com') || url.hostname.endsWith('.usercontent.google.com') ||
        (suffix === '=dv' && url.hostname.endsWith('.googlevideo.com'));
      if (!mediaHost || url.protocol !== 'https:' || url.port || url.username || url.password) break;
      const response = await get(url.href, { redirect: 'manual' }, url.origin === mediaOrigin);
      if (response.ok) return response;
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) break;
      url = new URL(location, url);
    }
    throw new HttpError(400, 'Google Фото вернул недоступный адрес файла.');
  }
  if (!session) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw new HttpError(400, 'В записи может быть от одного до пяти снимков.');
    return (await get(picker + '/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickingConfig: { maxItemCount: String(limit) } }) })).json();
  }
  const sessionUrl = picker + '/sessions/' + encodeURIComponent(session);
  if (method === 'DELETE') { await get(sessionUrl, { method }); return {}; }
  if (!photos) return (await get(sessionUrl)).json();

  const result = [], skipped = [];
  const query = new URLSearchParams({ sessionId: session, pageSize: '5' });
  let count = 0;
  const tokens = new Set();
  do {
    const page = await (await get(picker + '/mediaItems?' + query)).json();
    for (const item of page.mediaItems || []) {
      if (++count > 5) throw new HttpError(400, 'Выберите до пяти фото или видео для одного дня.');
      const media = item.mediaFile;
      const name = media?.filename || (item.type === 'VIDEO' ? 'Видео' : 'Снимок');
      if (!['PHOTO', 'VIDEO'].includes(item.type) || !media?.baseUrl) { skipped.push(name); continue; }
      const isVideo = item.type === 'VIDEO';
      const limitBytes = isVideo ? maxVideoBytes : maxPhotoBytes;
      let response;
      try { response = await download(media.baseUrl, isVideo ? '=dv' : '=d'); }
      catch { skipped.push(name); continue; }
      const chunks = [];
      let size = 0;
      if (Number(response.headers.get('content-length')) > limitBytes) {
        await response.body?.cancel(); skipped.push(name); continue;
      }
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > limitBytes) break;
        chunks.push(chunk);
      }
      if (!size || size > limitBytes) { skipped.push(name); continue; }
      const bytes = Buffer.concat(chunks);
      let mime;
      try { mime = isVideo ? videoFormats[videoFormat(bytes)] : imageFormats[imageFormat(bytes)]; }
      catch { skipped.push(name); continue; }
      if (!mime) { skipped.push(name); continue; }
      result.push({ name, ...(isVideo ? { kind: 'video' } : {}), src: 'data:' + mime + ';base64,' + bytes.toString('base64') });
    }
    if (!page.nextPageToken) break;
    if (tokens.has(page.nextPageToken) || tokens.size >= 5) throw new HttpError(400, 'Не удалось получить выбранные снимки.');
    tokens.add(page.nextPageToken);
    query.set('pageToken', page.nextPageToken);
  } while (true);
  return { photos: result, skipped };
}
