import { api } from './ui.js';
import { minManualBpm, maxManualBpm, tappedTempo, deezerTrackId, tempoPresets, photoInterval } from './rhythm.js';

export const tempoFields =
    '<div id="c-presets" class="compose-presets" hidden><span class="compose-label">Как ощущается песня?</span><div class="tempo-choices">' +
    tempoPresets.map(p => '<button type="button" data-tempo="' + p.bpm + '" aria-pressed="false">' + p.label + '</button>').join('') +
    '</div></div><figure id="c-rhythm" class="tempo-preview" hidden><div><img id="c-rhythm-photo" alt="Предпросмотр ритма открытки"></div><figcaption id="c-rhythm-caption"></figcaption></figure>' +
    '<div id="c-tempo-row" class="compose-tempo-row">' +
    '<label id="c-bpm-label" class="compose-link"><span>Темп, BPM</span><input type="number" id="c-bpm" min="' + minManualBpm + '" max="' + maxManualBpm + '" step="any" placeholder="Например, 96"></label>' +
    '<button class="compose-tap" type="button" id="c-tap">Настучать ритм</button></div>' +
    '<small id="c-tempo-note" class="compose-note" role="status"></small>';

export function mountTempoFields(root, {getPhotos, isLink, signal, initialTrack}) {
  const el = id => root.querySelector('#c-' + id);
  const listen = (node, type, fn) => node.addEventListener(type, fn, {signal});
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let previewTimer, lookupUrl = '', lookupRequest, lookupMeta, taps = [], tempoSource = 'manual';
  signal.addEventListener('abort', () => clearTimeout(previewTimer), {once:true});
  function updateTempoPreview() {
    clearTimeout(previewTimer);
    const photos = getPhotos();
    const bpm = el('bpm').valueAsNumber;
    const valid = isLink() && bpm >= minManualBpm && bpm <= maxManualBpm;
    const preview = el('rhythm');
    preview.hidden = !valid || !photos.length;
    for (const b of el('presets').querySelectorAll('[data-tempo]')) {
      b.setAttribute('aria-pressed', String(tempoSource === 'preset' && Number(b.dataset.tempo) === bpm));
    }
    if (preview.hidden) return;
    const interval = photoInterval({ bpm });
    const seconds = (interval / 1000).toLocaleString('ru', {maximumFractionDigits: 1});
    el('rhythm-caption').textContent = photos.length > 1 ? 'Смена кадра каждые ' + seconds + ' с' : 'Движение по снимку · ' + seconds + ' с на фразу';
    let index = 0;
    function frame() {
      const photo = photos[index];
      const img = el('rhythm-photo');
      img.src = photo.poster || photo.src;
      img.style.objectPosition = photo.focus ? (photo.focus.x * 100) + '% ' + (photo.focus.y * 100) + '%' : 'center';
      img.getAnimations().forEach(animation => animation.cancel());
      if (reduce.matches) return;
      img.animate([{transform:'scale(1)'},{transform:'scale(1.16) translateX(-2%)'}], {duration:interval, fill:'both'});
      index = (index + 1) % photos.length;
      previewTimer = setTimeout(frame, interval);
    }
    frame();
  }
  listen(reduce, 'change', updateTempoPreview);
  async function resolveLinkTempo() {
    const value = el('url').value.trim();
    let endpoint;
    try {
      const url = new URL(value), deezer = deezerTrackId(url);
      const spotify = url.origin === 'https://open.spotify.com' && url.pathname.match(/^\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})\/?$/);
      if (deezer) endpoint = '/api/music/deezer/' + deezer;
      else if (spotify) endpoint = '/api/music/spotify/' + spotify[1];
    } catch { return null; }
    if (!endpoint) return null;
    if (lookupUrl !== value || !lookupRequest) {
      lookupUrl = value;
      lookupRequest = api(endpoint, {signal}).catch(() => null);
    }
    const meta = await lookupRequest;
    if (signal.aborted || lookupUrl !== value || el('url').value.trim() !== value) return null;
    if (meta?.bpm >= minManualBpm && meta.bpm <= maxManualBpm) {
      lookupMeta = meta;
      if (!el('bpm').value) {
        el('bpm').value = meta.bpm; tempoSource = meta.bpmSource || 'deezer';
      }
    }
    refresh();
    return lookupMeta;
  }
  function refresh() {
    const link = isLink();
    el('tempo-note').textContent = link
      ? 'Проверим, есть ли темп в каталоге. Можно ввести или настучать ритм.'
      : 'Измерим пульс аудиофайла автоматически. При желании темп можно ввести или настучать вручную.';
    const validLink = el('url').value.trim().startsWith('https://');
    el('presets').hidden = !link || !validLink || Boolean(lookupMeta);
    if (link && validLink) {
      if (tempoSource === 'deezer') el('tempo-note').textContent = 'Темп найден в каталоге Deezer.';
      else if (tempoSource === 'catalog') el('tempo-note').textContent = 'Темп найден в подборке Spotify.';
      else if (!lookupMeta) el('tempo-note').textContent = 'Выберите ощущение песни, введите темп или настучите его.';
    }
    updateTempoPreview();
  }
  function resetTempo() {
    taps = []; tempoSource = 'manual'; lookupUrl = ''; lookupMeta = null; lookupRequest = null;
    el('bpm').value = ''; refresh();
  }
  listen(el('url'), 'input', resetTempo);
  listen(el('url'), 'change', resolveLinkTempo);
  listen(el('presets'), 'click', event => {
    const option = event.target.closest('[data-tempo]');
    if (!option) return;
    taps = []; tempoSource = 'preset'; el('bpm').value = option.dataset.tempo; refresh();
  });
  listen(el('bpm'), 'input', () => { taps = []; tempoSource = 'manual'; refresh(); });
  listen(el('tap'), 'click', () => {
    const now = performance.now();
    if (now - taps.at(-1) > 1800) taps = [];
    taps = [...taps.slice(-7), now];
    const value = tappedTempo(taps);
    if (value) {
      el('bpm').value = value; tempoSource = 'tap';
      refresh();
      el('tempo-note').textContent = 'По вашим ударам · ' + value + ' BPM';
    } else {
      el('tempo-note').textContent = taps.length < 4 ? 'Нажмите в такт ещё ' + (4 - taps.length) + ' раз.' : 'Допустимый темп от 40 до 240 BPM.';
    }
  });
  if (initialTrack?.bpm && initialTrack.url === el('url').value) {
    el('bpm').value = initialTrack.bpm;
    tempoSource = initialTrack.bpmSource || 'manual';
  }
  refresh();
  return { reset:resetTempo, refresh, resolve:resolveLinkTempo,
    get metadata() { return lookupMeta; }, get source() { return tempoSource; }
  };
}

export function songLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url;
  } catch {}
  throw Error('Укажите ссылку на песню, начинающуюся с https://.');
}

export function trackFromLink(url, meta) {
  return { kind:'link', url:url.href, title:'Песня с ' + url.hostname.replace(/^www\./, ''), artist:'Ваша ссылка', ...meta };
}
