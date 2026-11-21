import { imageFocus, frameComposition } from './composition.js';
import { api, esc, icon, navigate, toast, modal, closeModal } from './ui.js';
import { analyzeDay, fileData, localTrack, pickTrack } from './analysis.js';
import { minManualBpm, maxManualBpm, tappedTempo, deezerTrackId } from './rhythm.js';
import { chooseGooglePhotos } from './google-photos.js';
import { chooseFolderPhotos, imageTypes, maxPhotoBytes } from './photo-folder.js';

let dispose;
export function cleanupCreate() { dispose?.(); dispose = null; }
const iconNames = { back: 'arrow-left', arrow: 'arrow-right', trash: 'x', spark: 'sparkles' };
const symbol = (name, size = 20) => icon(iconNames[name] || name, size);
const todayLocal = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const audioTypes = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/flac', 'audio/x-flac', 'audio/webm']);
const maxAudioBytes = 24 * 1024 * 1024;
const photoLimit = 5;
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export async function renderCreate(root) {
  cleanupCreate();
  let active = true, reading = false, sending = false, trackFile = null, dragLevel = 0;
  let photos = [], taps = [], tempoSource = 'manual';
  const ctrl = new AbortController();
  dispose = () => { active = false; ctrl.abort(); };
  const now = todayLocal();
  const history = api('/api/days', { signal: ctrl.signal }).catch(() => []);
  root.innerHTML = '<section class="compose"><a class="compose-back" data-nav href="/">' + symbol('back', 16) + ' Архив</a>' +
    '<header class="compose-head"><h1>Новый день<span>.</span></h1><p>Сохраните фотографии, звук и то, что хочется запомнить.</p></header>' +
    '<div class="compose-grid"><form id="compose-form" class="compose-form"><fieldset id="compose-fields"><legend class="compose-sr">Новая запись</legend>' +
    '<div class="compose-field"><label for="c-date">Дата дня</label><input type="date" id="c-date" min="0001-01-01" max="' + now + '" value="' + now + '" required></div>' +
    '<div class="compose-field"><label for="c-text">Что запомнилось?</label><textarea id="c-text" maxlength="10000" required rows="5" placeholder="Расскажите о месте, человеке или одном моменте дня…"></textarea><span class="compose-count" id="c-count">0 / 10 000</span></div>' +
    '<div class="compose-field"><div class="compose-label">Фотографии <small id="c-photo-count">0 / 5</small></div><input class="compose-sr" type="file" id="c-photos" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple tabindex="-1"><button type="button" class="compose-drop" id="c-drop">' +
    '<span class="compose-upload-icon">' + symbol('upload', 21) + '</span><strong>Добавить фотографии</strong><span>Перетащите сюда или выберите с устройства</span><small>От 1 до 5 снимков · до 12 МБ каждый</small></button>' +
    '<div class="compose-imports"><button type="button" id="c-google">' + symbol('image', 17) + ' Из Google Фото</button><button type="button" id="c-folder-button">' + symbol('folder', 17) + ' Из папки</button></div>' +
    '<input type="file" id="c-folder" webkitdirectory multiple hidden><div id="c-thumbs" class="compose-thumbs"></div><p class="compose-error" id="c-photo-error" role="alert"></p></div>' +
    '<div class="compose-field"><div class="compose-label" id="c-sound-title">Музыка дня</div><div class="compose-choice" role="radiogroup" aria-labelledby="c-sound-title"><label><input type="radio" name="trackMode" value="auto" checked><span>' + symbol('spark', 16) + ' Автоподбор</span></label><label><input type="radio" name="trackMode" value="manual"><span>' + symbol('music', 16) + ' Свой трек</span></label></div>' +
    '<p id="c-auto-note" class="compose-note">Подберём трек из Spotify по настроению и ритму вашего дня.</p>' +
    '<div id="c-manual" hidden><div class="compose-source"><label><input type="radio" name="source" value="file" checked> Аудиофайл</label><label><input type="radio" name="source" value="link"> Ссылка</label></div>' +
    '<label class="compose-audio-pick" id="c-audio-label"><input type="file" class="compose-sr" id="c-audio" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac"><span>' + symbol('upload', 17) + ' <span id="c-audio-name">Выберите аудио до 24 МБ</span></span></label>' +
    '<label id="c-link-label" class="compose-link" hidden><span>Ссылка на песню</span><input type="url" id="c-url" placeholder="https://…"><small>Песня откроется в музыкальном сервисе.</small></label><label id="c-bpm-label" class="compose-link" hidden><span>Темп песни, BPM</span><input type="number" id="c-bpm" min="' + minManualBpm + '" max="' + maxManualBpm + '" step="1" placeholder="Например, 96"><small>Оставьте поле пустым для автоматического определения или задайте свой ритм.</small></label><button class="compose-tap" type="button" id="c-tap">Настучать ритм</button><small id="c-tempo-note" class="compose-note" role="status"></small></div><p class="compose-error" id="c-audio-error" role="alert"></p></div>' +
    '<label class="compose-voice"><span class="compose-voice-icon">' + symbol('mic', 20) + '</span><span><strong>Озвучить запись</strong><small>Прочитать рассказ голосом устройства</small></span><input type="checkbox" id="c-voice" checked><span class="compose-switch" aria-hidden="true"></span></label>' +
    '</fieldset><p id="c-ai-note" class="compose-note" role="status">Проверяем настройки анализа…</p><p id="c-error" class="compose-error" role="alert"></p><div class="compose-progress" hidden id="c-progress" role="status" aria-live="polite"></div>' +
    '<button class="compose-submit" type="submit">Сохранить день ' + symbol('arrow', 19) + '</button></form>' +
    '<aside class="compose-aside"><div class="compose-preview"><div class="compose-preview-top"><span>ОБЛОЖКА ДНЯ</span><span>4:5</span></div><div class="compose-paper" id="c-paper"><div class="compose-empty" id="c-empty"><span>' + symbol('photo', 34) + '</span><small>Место для первого кадра</small></div><img id="c-preview-img" alt="Предпросмотр первого снимка" hidden><div class="compose-paper-text"><small id="c-preview-date"></small><p id="c-preview-cover-text" hidden></p></div></div><p class="compose-preview-foot">' + symbol('lock', 13) + ' Только для вас</p></div></aside></div></section>';

  const el = id => root.querySelector('#c-' + id);
  const form = root.querySelector('#compose-form'), fields = root.querySelector('#compose-fields');
  const submit = form.querySelector('.compose-submit');
  const listen = (element, event, handler) => element.addEventListener(event, handler, { signal: ctrl.signal });
  const mode = name => form.elements[name].value;
  const error = (scope, value = '') => { el(scope).textContent = value; };
  let expectedProvider = null;
  let lastAnalysis;
  async function loadProvider() {
    const status = await api('/api/atmosphere/status', { signal: ctrl.signal });
    if (!active) return;
    expectedProvider = status.analysisSource;
    el('ai-note').textContent = expectedProvider === 'gemini'
      ? 'При сохранении Google Gemini получит рассказ и уменьшенные снимки, чтобы определить настроение и погоду и сократить текст для обложки.'
      : expectedProvider === 'local-model'
        ? 'Установленная модель обработает текст и уменьшенные снимки на вашем компьютере.'
        : 'Рассказ и снимки обрабатываются на вашем компьютере. Работает без интернета.';
  }
  const providerReady = loadProvider().catch(() => {
    if (active) el('ai-note').textContent = 'Не удалось проверить настройки анализа. При сохранении попробуем ещё раз.';
  });

  function cachedAnalysis(date, text) {
    if (lastAnalysis?.date === date && lastAnalysis.text === text && lastAnalysis.photos.length === photos.length &&
        photos.every((photo, index) => photo === lastAnalysis.photos[index])) return lastAnalysis.result;
  }

  function showPreview() {
    const image = el('preview-img');
    image.hidden = !photos.length;
    el('empty').hidden = Boolean(photos.length);
    el('paper').classList.toggle('has-photo', Boolean(photos.length));
    if (photos.length) {
      const layout = frameComposition(photos[0], '');
      image.style.objectPosition = layout.x*100 + '% ' + layout.y*100 + '%';
      if (image.getAttribute('src') !== photos[0].src) image.src = photos[0].src;
    }
    else image.removeAttribute('src');
    const date = el('date').value;
    el('preview-date').textContent = date ? new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const caption = cachedAnalysis(date, el('text').value.trim())?.coverText || '';
    el('preview-cover-text').hidden = !caption;
    el('preview-cover-text').textContent = caption;
    el('count').textContent = el('text').value.length.toLocaleString('ru-RU') + ' / 10 000';
  }
  function drawPhotos() {
    el('thumbs').innerHTML = photos.map((p, i) => '<div class="compose-thumb"><img src="' + esc(p.src) + '" alt="' + esc(p.name) + '">' +
      '<button type="button" class="compose-focus" data-focus="' + i + '" aria-label="Центр кадра ' + (i+1) + '">Фокус</button>' +
      '<button type="button" class="compose-remove" data-remove="' + i + '" aria-label="Убрать фото ' + (i + 1) + '">' + symbol('trash', 12) + '</button>' +
      '<div><button type="button" data-from="' + i + '" data-to="' + (i - 1) + '" aria-label="Переместить фото ' + (i + 1) + ' раньше"' + (!i ? ' disabled' : '') + '>' + symbol('back', 12) + '</button>' +
      '<span>' + (i ? i + 1 : 'Обложка') + '</span><button type="button" data-from="' + i + '" data-to="' + (i + 1) + '" aria-label="Переместить фото ' + (i + 1) + ' позже"' + (i === photos.length - 1 ? ' disabled' : '') + '>' + symbol('arrow', 12) + '</button></div></div>').join('');
    el('photo-count').textContent = photos.length + ' / 5';
    showPreview();
  }
  function updateImportButtons() {
    const full = photos.length >= photoLimit;
    el('drop').disabled = full || reading;
    el('google').disabled = full || reading;
    el('folder-button').disabled = full || reading;
  }
  async function addPhotos(raw, { batch = false, skipped = 0 } = {}) {
    if (reading || sending || !active) return;
    error('photo-error');
    const files = Array.from(raw);
    if (!files.length) {
      if (batch) error('photo-error', 'Подходящих снимков нет. Выберите JPEG, PNG, WebP, GIF или AVIF до 12 МБ.');
      return;
    }
    if (files.length + photos.length > photoLimit) { error('photo-error', 'Можно добавить до пяти снимков. Сейчас осталось мест: ' + (photoLimit - photos.length) + '.'); return; }
    const invalid = files.find(f => f instanceof File && (!imageTypes.has(f.type) || f.size > maxPhotoBytes || !f.size));
    if (invalid) { error('photo-error', 'Проверьте «' + invalid.name + '». Нужен JPEG, PNG, WebP, GIF или AVIF до 12 МБ.'); return; }
    reading = true; updateImportButtons(); el('drop').setAttribute('aria-busy', 'true'); submit.disabled = true;
    try {
      const results = await Promise.allSettled(files.map(async file => {
        const src = file instanceof File ? await fileData(file) : file.src;
        const img = new Image(); img.src = src; await img.decode();
        return { name: file.name, src, focus: imageFocus(img) };
      }));
      const added = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      if (!added.length || (!batch && added.length !== files.length)) throw Error();
      if (active) {
        photos = photos.concat(added); drawPhotos();
        skipped += files.length - added.length;
        if (skipped) error('photo-error', 'Добавлено снимков — ' + added.length + '. Пропущено файлов — ' + skipped + ' (формат, размер или ошибка чтения).');
      }
    } catch { if (active) error('photo-error', 'Не удалось открыть один из снимков. Попробуйте JPEG или PNG.'); }
    finally { reading = false; if (active) { updateImportButtons(); el('drop').removeAttribute('aria-busy'); submit.disabled = false; } }
  }
  function showMusicFields() {
    const manual = mode('trackMode') === 'manual', link = mode('source') === 'link';
    el('auto-note').hidden = manual; el('manual').hidden = !manual;
    el('audio-label').hidden = link; el('link-label').hidden = !link;
    el('bpm-label').hidden = !manual; el('bpm').disabled = !manual;
    el('tempo-note').textContent = link ? 'Для прямой ссылки Deezer проверим темп в каталоге. Если темп неизвестен, смена кадра раз в 8 с.'
      : 'Измерим пульс аудиофайла. При слабом или переменном ритме смена кадра раз в 8 с.';
    el('url').required = manual && link; el('url').disabled = !manual || !link;
    error('audio-error');
  }
  listen(el('text'), 'input', () => { el('text').setCustomValidity(''); showPreview(); });
  listen(el('date'), 'change', showPreview);
  listen(el('drop'), 'click', () => el('photos').click());
  listen(el('photos'), 'change', e => { const files = [...e.target.files]; e.target.value = ''; addPhotos(files); });
  const openFolder = () => el('folder').click();
  listen(el('folder-button'), 'click', openFolder);
  listen(el('folder'), 'change', e => {
    const files = [...e.target.files]; e.target.value = '';
    if (files.length) chooseFolderPhotos(files, photoLimit - photos.length, (chosen, skipped) => addPhotos(chosen, { batch: true, skipped }));
  });
  listen(el('google'), 'click', () => chooseGooglePhotos({
    limit: photoLimit - photos.length, onFolder: openFolder,
    onPhotos: (chosen, skipped) => addPhotos(chosen, { batch: true, skipped: skipped.length })
  }));
  listen(el('drop'), 'dragenter', e => { e.preventDefault(); dragLevel++; el('drop').classList.add('is-over'); });
  listen(el('drop'), 'dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  listen(el('drop'), 'dragleave', e => { e.preventDefault(); if (!--dragLevel) el('drop').classList.remove('is-over'); });
  listen(el('drop'), 'drop', e => { e.preventDefault(); dragLevel = 0; el('drop').classList.remove('is-over'); addPhotos(e.dataTransfer.files); });
  listen(el('thumbs'), 'click', e => {
    const button = e.target.closest('button');
    if (!button) return;
    const { remove, from, to, focus } = button.dataset;
    if (focus !== undefined) {
      const photo = photos[Number(focus)];
      modal('Центр кадра', '<p>Нажмите на важную деталь или передвиньте метку стрелками.</p><button class="focus-picker" aria-label="Выбрать центр кадра"><img alt="' + esc(photo.name) + '" src="' + esc(photo.src) + '"><i></i></button><button class="button primary" data-apply-focus>Применить</button>');
      const picker = document.querySelector('.focus-picker'), marker = picker.querySelector('i');
      const point = { ...photo.focus, manual: true };
      function place(x, y) {
        point.x = Math.max(0, Math.min(1, x)); point.y = Math.max(0, Math.min(1, y));
        marker.style.left = point.x * 100 + '%'; marker.style.top = point.y * 100 + '%';
        picker.setAttribute('aria-label', 'Центр кадра, по горизонтали ' + Math.round(point.x*100) + '%, по вертикали ' + Math.round(point.y*100) + '%');
      }
      place(point.x, point.y);
      picker.onclick = event => {
        if (!event.detail) return;
        const rect = picker.getBoundingClientRect();
        place((event.clientX-rect.left)/rect.width, (event.clientY-rect.top)/rect.height);
      };
      picker.onkeydown = event => {
        const delta = { ArrowLeft:[-.04,0], ArrowRight:[.04,0], ArrowUp:[0,-.04], ArrowDown:[0,.04] }[event.key];
        if (delta) { event.preventDefault(); place(point.x+delta[0], point.y+delta[1]); }
      };
      document.querySelector('[data-apply-focus]').onclick = () => {
        photos[Number(focus)] = { ...photo, focus: point }; closeModal(); drawPhotos();
      };
      return;
    }
    if (remove !== undefined) photos.splice(Number(remove), 1);
    if (from !== undefined && Number(to) >= 0 && Number(to) < photos.length) [photos[from], photos[to]] = [photos[to], photos[from]];
    drawPhotos(); updateImportButtons(); error('photo-error');
  });
  function resetTempo() {
    taps = []; tempoSource = 'manual'; el('bpm').value = ''; showMusicFields();
  }
  for (const choice of form.querySelectorAll('input[type="radio"]')) listen(choice, 'change', resetTempo);
  listen(el('url'), 'input', resetTempo);
  listen(el('bpm'), 'input', () => { taps = []; tempoSource = 'manual'; showMusicFields(); });
  listen(el('tap'), 'click', () => {
    const now = performance.now();
    if (now - taps.at(-1) > 1800) taps = [];
    taps = [...taps.slice(-7), now];
    const value = tappedTempo(taps);
    if (value) {
      el('bpm').value = value; tempoSource = 'tap';
      el('tempo-note').textContent = 'По вашим ударам · ' + value + ' BPM';
    } else {
      el('tempo-note').textContent = taps.length < 4 ? 'Нажмите в такт ещё ' + (4 - taps.length) + ' раз.' : 'Допустимый темп от 40 до 240 BPM.';
    }
  });
  listen(el('audio'), 'change', e => {
    resetTempo(); trackFile = e.target.files[0] || null;
    error('audio-error');
    if (trackFile && (!audioTypes.has(trackFile.type) || trackFile.size > maxAudioBytes || !trackFile.size)) {
      error('audio-error', 'Выберите MP3, WAV, M4A, OGG, FLAC или другое поддерживаемое аудио до 24 МБ.');
      trackFile = null; e.target.value = '';
    }
    el('audio-name').textContent = trackFile?.name || 'Выберите аудио до 24 МБ';
  });
  const stages = ['Извлекаем палитру снимков', 'Определяем атмосферу и выбираем фразу', 'Подбираем трек Spotify', 'Сохраняем папку дня'];
  function progress(index) {
    const node = el('progress');
    node.hidden = false;
    const label = index === 2 && mode('trackMode') === 'manual' ? 'Добавляем ваш трек' : stages[index];
    node.innerHTML = '<span>' + esc(label) + '…</span><div aria-hidden="true">' + stages.map((_, i) => '<i class="' + (i <= index ? 'done' : '') + '"></i>').join('') + '</div>';
  }
  listen(form, 'submit', async e => {
    e.preventDefault();
    if (sending || reading) return;
    error('error'); error('photo-error'); error('audio-error');
    const text = el('text').value.trim();
    if (!text) { el('text').setCustomValidity('Напишите несколько слов о дне.'); el('text').reportValidity(); return; }
    if (!photos.length) { error('photo-error', 'Добавьте хотя бы одну фотографию.'); el('drop').focus(); return; }
    const manual = mode('trackMode') === 'manual', link = mode('source') === 'link';
    let url;
    if (manual && link) {
      try { url = new URL(el('url').value.trim()); if (url.protocol !== 'https:' || url.username || url.password) throw Error(); }
      catch { error('audio-error', 'Укажите безопасную ссылку, начинающуюся с https://.'); el('url').focus(); return; }
    } else if (manual && !trackFile) { error('audio-error', 'Выберите аудиофайл или добавьте ссылку.'); el('audio').focus(); return; }
    sending = true; fields.disabled = true; submit.disabled = true; form.setAttribute('aria-busy', 'true');
    try {
      progress(0); await nextFrame();
      await providerReady;
      if (!active) return;
      if (!expectedProvider) {
        await loadProvider();
        if (!active) return;
        if (expectedProvider === 'gemini') throw Error('Для анализа настроен Google Gemini. Прочитайте пояснение над кнопкой и подтвердите сохранение.');
      }
      const date = el('date').value, voice = el('voice').checked;
      let signals = cachedAnalysis(date, text);
      if (!signals) {
        signals = await analyzeDay(text, photos, { date, expectedProvider, signal: ctrl.signal, onPrepared: () => progress(1) });
        if (!active) return;
        lastAnalysis = { date, text, photos: [...photos], result: signals };
        showPreview();
      }
      const prior = await history;
      if (!active) return;
      progress(2); await nextFrame();
      let track;
      if (!manual) track = await pickTrack({ ...signals, date, recentTracks: Array.isArray(prior) ? prior.slice(0, 8).map(d => d.track).filter(Boolean) : [] }, null, ctrl.signal);
      else if (link) {
        track = { kind: 'link', url: url.href, title: 'Песня с ' + url.hostname.replace(/^www\./, ''), artist: 'Ваша ссылка', bpm: null };
        const id = deezerTrackId(url);
        if (id && !el('bpm').value) {
          const meta = await api('/api/music/deezer/' + id, { signal: ctrl.signal }).catch(() => null);
          if (meta?.bpm) Object.assign(track, meta, { bpmSource: 'deezer' });
        }
      } else track = await localTrack(trackFile);
      if (manual && el('bpm').value) Object.assign(track, { bpm: el('bpm').valueAsNumber, bpmSource: tempoSource });
      if (!active) return;
      track.title = track.title.slice(0, 200); track.artist = track.artist.slice(0, 200);
      progress(3); await nextFrame();
      const day = await api('/api/days', { method: 'POST', body: { ...signals, date, text, photos, track, voice }, signal: ctrl.signal });
      if (!active) return;
      toast('День сохранён'); navigate('/day/' + encodeURIComponent(day.id));
    } catch (failure) {
      if (!active) return;
      el('progress').hidden = true;
      error('error', failure.message || 'Не удалось сохранить день. Попробуйте ещё раз.');
    } finally {
      sending = false;
      if (active) { fields.disabled = false; submit.disabled = false; form.removeAttribute('aria-busy'); }
    }
  });
  showMusicFields(); showPreview();
}
