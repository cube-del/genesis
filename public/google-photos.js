import { api, closeModal, icon, modal } from './ui.js';

const scope = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const endpoint = '/api/google-photos/sessions';
let loadingIdentity;
function loadIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
  if (loadingIdentity) return loadingIdentity;
  loadingIdentity = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => {
      clearTimeout(timer);
      script.remove(); loadingIdentity = null;
      reject(new Error('Не удалось загрузить окно входа Google. Проверьте подключение и попробуйте снова.'));
    };
    const timer = setTimeout(fail, 15000);
    script.async = true;
    script.src = 'https://accounts.google.com/gsi/client';
    script.referrerPolicy = 'origin';
    script.onerror = fail;
    script.onload = () => {
      clearTimeout(timer);
      if (window.google?.accounts?.oauth2) resolve(window.google.accounts.oauth2);
      else fail();
    };
    document.head.append(script);
  });
  return loadingIdentity;
}

function duration(value, fallback) {
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  return match ? Number(match[1]) * 1000 : fallback;
}

export function chooseGooglePhotos({ limit, onPhotos, onFolder }) {
  const ctrl = new AbortController();
  let timer, sessionPath, headers;
  function cleanupSession() {
    clearTimeout(timer);
    if (!sessionPath) return;
    const path = sessionPath;
    sessionPath = null;
    api(path, { method: 'DELETE', headers, keepalive: true }).catch(() => {});
  }
  const body = modal('Из Google Фото',
    '<p class="dialog-lead" role="status">Проверяем подключение…</p><div class="photo-import-actions">' +
    '<button class="button primary" data-connect type="button" hidden>Подключить Google Фото</button>' +
    '<a class="button primary" data-picker target="_blank" rel="noopener noreferrer" hidden>Выбрать снимки ' + icon('external-link', 15) + '</a>' +
    '<button class="button secondary" type="button" data-folder>' + icon('folder', 16) + ' Из скачанной папки</button></div>' +
    '<details class="photo-import-setup" hidden><summary>Настроить вход через Google</summary><p>Включите Google Photos Picker API, добавьте адрес DayTrace в разрешённые источники OAuth-клиента и укажите его идентификатор в <code>GOOGLE_PHOTOS_CLIENT_ID</code> в файле <code>.env</code>. Затем перезапустите DayTrace. <a href="https://developers.google.com/photos/overview/configure-your-app" target="_blank" rel="noopener noreferrer">Инструкция Google</a></p></details>',
    { onClose() { ctrl.abort(); cleanupSession(); } });
  const note = body.querySelector('[role=status]');
  const connect = body.querySelector('[data-connect]');
  const link = body.querySelector('[data-picker]');
  const folder = body.querySelector('[data-folder]');
  folder.onclick = () => { closeModal(); onFolder(); };
  function failed(error) {
    if (ctrl.signal.aborted) return;
    cleanupSession(); link.hidden = true;
    note.textContent = error.message || 'Не удалось импортировать снимки. Попробуйте снова.';
    connect.hidden = false; connect.disabled = false;
  }
  async function pick(token) {
    headers = { Authorization: 'Bearer ' + token };
    const options = { headers, signal: ctrl.signal };
    // Let a creation already in flight finish so a dismissed dialog can delete its session.
    const session = await api(endpoint, { method: 'POST', headers, body: { limit }, signal: AbortSignal.timeout(30000) });
    sessionPath = endpoint + '/' + encodeURIComponent(session.id);
    if (ctrl.signal.aborted) { cleanupSession(); return; }
    const uri = new URL(session.pickerUri);
    if (uri.protocol !== 'https:' || !uri.hostname.endsWith('.google.com') || uri.username || uri.password || uri.port) throw Error('Не удалось открыть окно выбора Google Фото.');
    uri.pathname = uri.pathname.replace(/\/$/, '') + '/autoclose';
    link.href = uri.href;
    connect.hidden = true; link.hidden = false;
    note.textContent = 'Откройте выбор снимков. Чтобы найти альбом, введите его название в поиске Google Фото. После выбора нажмите «Готово».';
    link.focus();
    let deadline = Math.min(Date.parse(session.expireTime) || Infinity, Date.now() + duration(session.pollingConfig?.timeoutIn, 600000));
    const expired = () => failed(Error('Время выбора истекло. Подключите Google Фото ещё раз.'));
    function schedule(state) {
      const left = deadline - Date.now();
      if (left <= 0) { expired(); return; }
      timer = setTimeout(async () => {
        if (Date.now() >= deadline) { expired(); return; }
        try {
          const status = await api(sessionPath, options);
          if (ctrl.signal.aborted) return;
          if (!status.mediaItemsSet) {
            deadline = Math.min(deadline, Date.now() + duration(status.pollingConfig?.timeoutIn, Infinity));
            schedule(status);
            return;
          }
          link.hidden = true;
          note.textContent = 'Загружаем выбранные снимки…';
          const result = await api(sessionPath + '/photos', options);
          if (ctrl.signal.aborted) return;
          closeModal();
          onPhotos(result.photos, result.skipped);
        } catch (error) { failed(error); }
      }, Math.min(left, Math.max(1000, duration(state.pollingConfig?.pollInterval, 5000))));
    }
    schedule(session);
  }
  async function configure() {
    connect.disabled = true;
    const { clientId } = await api('/api/google-photos/config', { signal: ctrl.signal });
    if (ctrl.signal.aborted) return;
    if (!clientId) {
      connect.hidden = true;
      note.textContent = 'Прямой вход пока не настроен. Можно скачать альбом из Google Фото, распаковать его и выбрать папку со снимками.';
      link.href = 'https://photos.google.com/albums'; link.textContent = 'Открыть альбомы Google Фото'; link.hidden = false;
      body.querySelector('details').hidden = false;
      return;
    }
    const oauth = await loadIdentity();
    if (ctrl.signal.aborted) return;
    const client = oauth.initTokenClient({
      client_id: clientId, scope, include_granted_scopes: false,
      callback(response) {
        if (ctrl.signal.aborted) return;
        if (!response.access_token || !oauth.hasGrantedAllScopes(response, scope)) {
          failed(Error('Google не предоставил доступ к выбранным снимкам.')); return;
        }
        note.textContent = 'Готовим выбор снимков…';
        pick(response.access_token).catch(failed);
      },
      error_callback: () => failed(Error('Окно входа закрыто или заблокировано. Можно подключиться снова.'))
    });
    note.textContent = 'Войдите в Google и выберите фотографии из медиатеки или альбома.';
    connect.hidden = false; connect.disabled = false;
    connect.onclick = () => {
      connect.disabled = true;
      try { client.requestAccessToken(); } catch (error) { failed(error); }
    };
  }
  connect.onclick = () => configure().catch(failed);
  configure().catch(failed);
}
