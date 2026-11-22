import { api, esc, icon, navigate, toast, modal, closeModal } from './ui.js';
import { imageFocus, frameComposition } from './composition.js';
import { analyzeDay, fileData, inspectVideoFile, isVideoItem, localTrack, pickTrack } from './analysis.js';
import { mountTempoFields, songLink, tempoFields, trackFromLink } from './link-tempo.js';
import { chooseGooglePhotos } from './google-photos.js';
import { chooseFolderPhotos, detectMediaMime, imageTypes, maxPhotoBytes, maxVideoBytes, videoTypes } from './photo-folder.js';

let dispose;
export function cleanupCreate() { dispose?.(); dispose = null; }
const iconNames = { back: 'arrow-left', arrow: 'arrow-right', trash: 'x', spark: 'sparkles' };
const symbol = (name, size = 20) => icon(iconNames[name] || name, size);
const todayLocal = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const audioTypes = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/flac', 'audio/x-flac', 'audio/webm']);
const maxAudioBytes = 50 * 1024 * 1024;
const photoLimit = 5;
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export async function renderCreate(root) {
  cleanupCreate();
  let active = true, reading = false, sending = false, trackFile = null, dragLevel = 0;
  let photos = [];
  const ctrl = new AbortController();
  dispose = () => { active = false; ctrl.abort(); };
  const now = todayLocal();
  const history = api('/api/days', { signal: ctrl.signal }).catch(() => []);
  root.innerHTML = '<section class="compose"><a class="compose-back" data-nav href="/">' + symbol('back', 16) + ' Архив</a>' +
    '<header class="compose-head"><h1>Новый день<span>.</span></h1><p>Сохраните фотографии, звук и то, что хочется запомнить.</p></header>' +
    '<div class="compose-grid"><form id="compose-form" class="compose-form"><fieldset id="compose-fields"><legend class="compose-sr">Новая запись</legend>' +
    '<div class="compose-field"><label for="c-date">Дата дня</label><input type="date" id="c-date" min="0001-01-01" max="' + now + '" value="' + now + '" required></div>' +
    '<div class="compose-field"><label for="c-text">Что запомнилось?</label><textarea id="c-text" maxlength="10000" required rows="5" placeholder="Расскажите о месте, человеке или одном моменте дня…"></textarea><span class="compose-count" id="c-count">0 / 10 000</span></div>' +
    '<div class="compose-field"><div class="compose-label">Фото и видео <small id="c-photo-count">0 / 5</small></div><input class="compose-sr" type="file" id="c-photos" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.webm,.mov,.m4v,.ogv" multiple tabindex="-1"><button type="button" class="compose-drop" id="c-drop">' +
    '<span class="compose-upload-icon">' + symbol('upload', 21) + '</span><strong>Добавить фото или видео</strong><span>Перетащите сюда или выберите с устройства</span><small>От 1 до 5 фото/видео · фото до 50 МБ, видео до 250 МБ</small></button>' +
    '<div class="compose-imports"><button type="button" id="c-google">' + symbol('image', 17) + ' Из Google Фото</button><button type="button" id="c-folder-button">' + symbol('folder', 17) + ' Из папки</button></div>' +
    '<input type="file" id="c-folder" webkitdirectory multiple hidden><div id="c-thumbs" class="compose-thumbs"></div><p class="compose-error" id="c-photo-error" role="alert"></p></div>' +
    '<div class="compose-field"><div class="compose-label" id="c-sound-title">Музыка дня</div><div class="compose-choice" role="radiogroup" aria-labelledby="c-sound-title"><label><input type="radio" name="trackMode" value="auto" checked><span>' + symbol('spark', 16) + ' Автоподбор</span></label><label><input type="radio" name="trackMode" value="manual"><span>' + symbol('music', 16) + ' Свой трек</span></label></div>' +
    '<p id="c-auto-note" class="compose-note">Подберём трек из Spotify по настроению и ритму вашего дня.</p>' +
    '<div id="c-manual" hidden><div class="compose-source"><label><input type="radio" name="source" value="file" checked> Аудиофайл</label><label><input type="radio" name="source" value="link"> Ссылка</label></div>' +
    '<label class="compose-audio-pick" id="c-audio-label"><input type="file" class="compose-sr" id="c-audio" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac"><span>' + symbol('upload', 17) + ' <span id="c-audio-name">Выберите аудио до 50 МБ</span></span></label>' +
    '<label id="c-link-label" class="compose-link" hidden><span>Ссылка на песню</span><input type="url" id="c-url" placeholder="https://…"><small>Песня откроется в музыкальном сервисе.</small></label>' +
    tempoFields +
    '<div id="c-link-profile" class="compose-link-profile" hidden>' +
    '<label class="compose-link"><span>Лад</span><select id="c-mode"><option value="">Не указывать</option><option value="major">Мажор · светлее</option><option value="minor">Минор · больше воздуха</option></select></label>' +
    '<label class="compose-link"><span>Характер звучания</span><select id="c-timbre"><option value="">Нейтральный</option><option value="warm">Тёплое · акустика / лоу-фай</option><option value="ambient">Плавное · эмбиент / струнные</option><option value="clean">Чистое · инди / поп</option><option value="electronic">Резкое · электроника / чёткий бит</option></select></label>' +
    '<small class="compose-profile-hint">Необязательно. Параметры трека влияют на темп кадров, фактуру, поля и резкость склеек.</small></div></div><p class="compose-error" id="c-audio-error" role="alert"></p></div>' +
    '<label class="compose-voice"><span class="compose-voice-icon">' + symbol('mic', 20) + '</span><span><strong>Озвучить запись</strong><small>Прочитать рассказ голосом устройства</small></span><input type="checkbox" id="c-voice" checked><span class="compose-switch" aria-hidden="true"></span></label>' +
    '</fieldset><p id="c-ai-note" class="compose-note" role="status">Проверяем настройки анализа…</p><p id="c-error" class="compose-error" role="alert"></p><div class="compose-progress" hidden id="c-progress" role="status" aria-live="polite"></div>' +
    '<button class="compose-submit" type="submit">Сохранить день ' + symbol('arrow', 19) + '</button></form>' +
    '<aside class="compose-aside"><div class="compose-preview"><div class="compose-preview-top"><span>ОБЛОЖКА ДНЯ</span><span>4:5</span></div><div class="compose-paper" id="c-paper"><div class="compose-empty" id="c-empty"><span>' + symbol('photo', 34) + '</span><small>Место для первого кадра или видео</small></div><img id="c-preview-img" alt="Предпросмотр первого кадра" hidden><video id="c-preview-video" muted autoplay loop playsinline hidden></video><div class="compose-paper-text"><small id="c-preview-date"></small><p id="c-preview-cover-text" hidden></p></div></div><p class="compose-preview-foot">' + symbol('lock', 13) + ' Только для вас</p></div></aside></div></section>';

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
    const image = el('preview-img'), video = el('preview-video');
    const first = photos[0], isVid = isVideoItem(first);
    image.hidden = !first || isVid;
    video.hidden = !first || !isVid;
    el('empty').hidden = Boolean(first);
    el('paper').classList.toggle('has-photo', Boolean(first));
    if (first && isVid) {
      const layout = frameComposition(first, '');
      video.style.objectPosition = layout.x * 100 + '% ' + layout.y * 100 + '%';
      if (video.getAttribute('src') !== first.src) {
        video.src = first.src;
        if (first.poster) video.poster = first.poster;
        video.play().catch(() => {});
      }
      image.removeAttribute('src');
    } else if (first) {
      const layout = frameComposition(first, '');
      image.style.objectPosition = layout.x * 100 + '% ' + layout.y * 100 + '%';
      if (image.getAttribute('src') !== first.src) image.src = first.src;
      video.pause(); video.removeAttribute('src');
    } else {
      image.removeAttribute('src');
      video.pause(); video.removeAttribute('src');
    }
    const date = el('date').value;
    el('preview-date').textContent = date ? new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const caption = cachedAnalysis(date, el('text').value.trim())?.coverText || '';
    el('preview-cover-text').hidden = !caption;
    el('preview-cover-text').textContent = caption;
    el('count').textContent = el('text').value.length.toLocaleString('ru-RU') + ' / 10 000';
  }
  const fmtDur = sec => sec > 0 ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` : 'ВИДЕО';
  function drawPhotos() {
    el('thumbs').innerHTML = photos.map((p, i) => '<div class="compose-thumb' + (isVideoItem(p) ? ' is-video' : '') + '"><img src="' + esc(p.poster || p.src) + '" alt="' + esc(p.name) + '">' +
      '<button type="button" class="compose-focus" data-focus="' + i + '" aria-label="Центр кадра ' + (i + 1) + '">Фокус</button>' +
      (isVideoItem(p) ? '<span class="compose-video-tag">▶ ' + esc(fmtDur(p.duration)) + '</span>' : '') +
      '<button type="button" class="compose-remove" data-remove="' + i + '" aria-label="Убрать файл ' + (i + 1) + '">' + symbol('trash', 12) + '</button>' +
      '<div><button type="button" data-from="' + i + '" data-to="' + (i - 1) + '" aria-label="Переместить файл ' + (i + 1) + ' раньше"' + (!i ? ' disabled' : '') + '>' + symbol('back', 12) + '</button>' +
      '<span>' + (i ? i + 1 : 'Обложка') + '</span><button type="button" data-from="' + i + '" data-to="' + (i + 1) + '" aria-label="Переместить файл ' + (i + 1) + ' позже"' + (i === photos.length - 1 ? ' disabled' : '') + '>' + symbol('arrow', 12) + '</button></div></div>').join('');
    el('photo-count').textContent = photos.length + ' / 5';
    showPreview(); tempo.refresh();
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
      if (batch) error('photo-error', 'Подходящих фото или видео нет. Выберите JPEG, PNG, WebP, MP4, WebM или MOV.');
      return;
    }
    if (files.length + photos.length > photoLimit) { error('photo-error', 'Можно добавить до пяти фото или видео. Сейчас осталось мест: ' + (photoLimit - photos.length) + '.'); return; }
    const invalid = files.find(f => {
      if (!(f instanceof File)) return false;
      const mime = detectMediaMime(f);
      if (!mime || !f.size) return true;
      return videoTypes.has(mime) ? f.size > maxVideoBytes : (!imageTypes.has(mime) || f.size > maxPhotoBytes);
    });
    if (invalid) { error('photo-error', 'Проверьте «' + invalid.name + '». Фото до 50 МБ (JPEG/PNG/WebP), видео до 250 МБ (MP4/WebM/MOV).'); return; }
    reading = true; updateImportButtons(); el('drop').setAttribute('aria-busy', 'true'); submit.disabled = true;
    try {
      const results = await Promise.allSettled(files.map(async file => {
        if (file instanceof File) {
          const mime = detectMediaMime(file);
          const isVid = videoTypes.has(mime);
          const blob = file.type === mime ? file : new File([file], file.name, { type: mime });
          const src = await fileData(blob);
          if (isVid) {
            const info = await inspectVideoFile(src);
            return { name: file.name, src, kind: 'video', poster: info.poster, duration: info.duration, ...(info.focus ? { focus: info.focus } : {}) };
          }
          const img = new Image(); img.src = src; await img.decode();
          return { name: file.name, src, focus: imageFocus(img) };
        }
        if (isVideoItem(file)) {
          const info = await inspectVideoFile(file.src);
          return { name: file.name, src: file.src, kind: 'video', poster: info.poster, duration: info.duration, ...(info.focus ? { focus: info.focus } : {}) };
        }
        const img = new Image(); img.src = file.src; await img.decode();
        return { name: file.name, src: file.src, focus: imageFocus(img) };
      }));
      const added = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      if (!added.length || (!batch && added.length !== files.length)) throw Error();
      if (active) {
        photos = photos.concat(added); drawPhotos();
        skipped += files.length - added.length;
        if (skipped) error('photo-error', 'Добавлено файлов — ' + added.length + '. Пропущено — ' + skipped + ' (формат, размер или ошибка чтения).');
      }
    } catch { if (active) error('photo-error', 'Не удалось открыть один из файлов. Попробуйте JPEG, PNG, MP4 или WebM.'); }
    finally { reading = false; if (active) { updateImportButtons(); el('drop').removeAttribute('aria-busy'); submit.disabled = false; } }
  }
  const tempo = mountTempoFields(root, {getPhotos:() => photos, isLink:() => mode('trackMode') === 'manual' && mode('source') === 'link', signal:ctrl.signal});
  function showMusicFields() {
    const manual = mode('trackMode') === 'manual', link = mode('source') === 'link';
    el('auto-note').hidden = manual; el('manual').hidden = !manual;
    el('audio-label').hidden = link; el('link-label').hidden = !link;
    el('link-profile').hidden = !link;
    el('bpm').disabled = !manual;
    el('mode').disabled = !manual || !link;
    el('timbre').disabled = !manual || !link;
    el('url').required = manual && link; el('url').disabled = !manual || !link;
    tempo.refresh();
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
      const idx = Number(focus);
      const photo = photos[idx];
      if (!photo) return;
      modal('Центр кадра', '<p class="dialog-lead">Нажмите на важную деталь или передвиньте метку стрелками.</p><button class="focus-picker" aria-label="Выбрать центр кадра"><img alt="' + esc(photo.name) + '" src="' + esc(photo.poster || photo.src) + '"><i></i></button><button class="button primary" data-apply-focus>Применить</button>');
      const picker = document.querySelector('.focus-picker'), marker = picker.querySelector('i');
      const point = { x: .5, y: .5, ratio: 1, ...photo.focus, manual: true };
      function place(x, y) {
        point.x = Math.max(0, Math.min(1, x)); point.y = Math.max(0, Math.min(1, y));
        marker.style.left = point.x * 100 + '%'; marker.style.top = point.y * 100 + '%';
        picker.setAttribute('aria-label', 'Центр кадра, по горизонтали ' + Math.round(point.x * 100) + '%, по вертикали ' + Math.round(point.y * 100) + '%');
      }
      place(point.x, point.y);
      picker.onclick = event => {
        if (!event.detail) return;
        const rect = picker.getBoundingClientRect();
        place((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
      };
      picker.onkeydown = event => {
        const delta = { ArrowLeft: [-.04, 0], ArrowRight: [.04, 0], ArrowUp: [0, -.04], ArrowDown: [0, .04] }[event.key];
        if (delta) { event.preventDefault(); place(point.x + delta[0], point.y + delta[1]); }
      };
      document.querySelector('[data-apply-focus]').onclick = () => {
        photos[idx] = { ...photo, focus: point }; closeModal(); drawPhotos();
      };
      return;
    }
    if (remove !== undefined) photos.splice(Number(remove), 1);
    if (from !== undefined && Number(to) >= 0 && Number(to) < photos.length) [photos[from], photos[to]] = [photos[to], photos[from]];
    drawPhotos(); updateImportButtons(); error('photo-error');
  });
  for (const choice of form.querySelectorAll('input[type="radio"]')) listen(choice, 'change', () => { tempo.reset(); showMusicFields(); });
  listen(el('audio'), 'change', e => {
    tempo.reset(); trackFile = e.target.files[0] || null;
    error('audio-error');
    if (trackFile && (!audioTypes.has(trackFile.type) || trackFile.size > maxAudioBytes || !trackFile.size)) {
      error('audio-error', 'Выберите MP3, WAV, M4A, OGG, FLAC или другое поддерживаемое аудио до 50 МБ.');
      trackFile = null; e.target.value = '';
    }
    el('audio-name').textContent = trackFile?.name || 'Выберите аудио до 50 МБ';
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
      try { url = songLink(el('url').value.trim()); }
      catch { error('audio-error', 'Укажите безопасную ссылку, начинающуюся с https://.'); el('url').focus(); return; }
    } else if (manual && !trackFile) { error('audio-error', 'Выберите аудиофайл или добавьте ссылку.'); el('audio').focus(); return; }
    sending = true; fields.disabled = true; submit.disabled = true; form.setAttribute('aria-busy', 'true');
    try {
      if (manual && link && !el('bpm').value) {
        await tempo.resolve();
        if (!active) return;
        if (!el('bpm').value) {
          fields.disabled = false;
          error('audio-error', 'Укажите, как ощущается песня, или настучите её ритм.');
          el('presets').querySelector('button').focus(); return;
        }
      }
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
        const trackMode = el('mode').value || undefined;
        const timbres = {
          warm: { brightness: .24, percussiveness: .26, energy: .36 },
          ambient: { brightness: .30, percussiveness: .14, energy: .22 },
          clean: { brightness: .56, percussiveness: .52, energy: .58 },
          electronic: { brightness: .82, percussiveness: .86, energy: .88 }
        };
        const timbre = timbres[el('timbre').value] || {};
        track = { ...trackFromLink(url, tempo.metadata), ...(trackMode ? {mode:trackMode} : {}), ...timbre };
      }
      else track = await localTrack(trackFile);
      if (manual && el('bpm').value) Object.assign(track, { bpm: el('bpm').valueAsNumber, bpmSource: tempo.source });
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
