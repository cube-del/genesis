import { api, esc, icon, navigate, toast } from './ui.js';
import { analyzeDay, fileData, localTrack, pickTrack } from './analysis.js';

let dispose;
export function cleanupCreate() { dispose?.(); dispose = null; }
const iconNames = { back: 'arrow-left', arrow: 'arrow-right', trash: 'x', spark: 'sparkles' };
const symbol = (name, size = 20) => icon(iconNames[name] || name, size);
const todayLocal = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);
const audioTypes = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/flac', 'audio/x-flac', 'audio/webm']);
const maxPhotoBytes = 12 * 1024 * 1024, maxAudioBytes = 24 * 1024 * 1024;
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
    '<div class="compose-field"><div class="compose-label">Фотографии <small id="c-photo-count">0 / 5</small></div><input class="compose-sr" type="file" id="c-photos" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple tabindex="-1"><button type="button" class="compose-drop" id="c-drop">' +
    '<span class="compose-upload-icon">' + symbol('upload', 21) + '</span><strong>Добавить фотографии</strong><span>Перетащите сюда или выберите с устройства</span><small>От 1 до 5 снимков · до 12 МБ каждый</small></button><div id="c-thumbs" class="compose-thumbs"></div><p class="compose-error" id="c-photo-error" role="alert"></p></div>' +
    '<div class="compose-field"><div class="compose-label" id="c-sound-title">Музыка дня</div><div class="compose-choice" role="radiogroup" aria-labelledby="c-sound-title"><label><input type="radio" name="trackMode" value="auto" checked><span>' + symbol('spark', 16) + ' Автоподбор</span></label><label><input type="radio" name="trackMode" value="manual"><span>' + symbol('music', 16) + ' Свой трек</span></label></div>' +
    '<p id="c-auto-note" class="compose-note">Подберём фрагмент по настроению или создадим оригинальную композицию.</p>' +
    '<div id="c-manual" hidden><div class="compose-source"><label><input type="radio" name="source" value="file" checked> Аудиофайл</label><label><input type="radio" name="source" value="link"> Ссылка</label></div>' +
    '<label class="compose-audio-pick" id="c-audio-label"><input type="file" class="compose-sr" id="c-audio" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac"><span>' + symbol('upload', 17) + ' <span id="c-audio-name">Выберите аудио до 24 МБ</span></span></label>' +
    '<label id="c-link-label" class="compose-link" hidden><span>Ссылка на песню</span><input type="url" id="c-url" placeholder="https://…"><small>Песня откроется по ссылке. Для реакции на звук загрузите аудиофайл.</small></label></div><p class="compose-error" id="c-audio-error" role="alert"></p></div>' +
    '<label class="compose-voice"><span class="compose-voice-icon">' + symbol('mic', 20) + '</span><span><strong>Озвучить запись</strong><small>Прочитать рассказ голосом устройства</small></span><input type="checkbox" id="c-voice" checked><span class="compose-switch" aria-hidden="true"></span></label>' +
    '</fieldset><p id="c-error" class="compose-error" role="alert"></p><div class="compose-progress" hidden id="c-progress" role="status" aria-live="polite"></div>' +
    '<button class="compose-submit" type="submit">Сохранить день ' + symbol('arrow', 19) + '</button></form>' +
    '<aside class="compose-aside"><div class="compose-preview"><div class="compose-preview-top"><span>ОБЛОЖКА ДНЯ</span><span>4:5</span></div><div class="compose-paper" id="c-paper"><div class="compose-empty" id="c-empty"><span>' + symbol('photo', 34) + '</span><small>Место для первого кадра</small></div><img id="c-preview-img" alt="Предпросмотр первого снимка" hidden><div class="compose-paper-text"><small id="c-preview-date"></small><p id="c-preview-quote" hidden></p></div></div><p class="compose-preview-foot">' + symbol('lock', 13) + ' Только для вас</p></div></aside></div></section>';

  const el = id => root.querySelector('#c-' + id);
  const form = root.querySelector('#compose-form'), fields = root.querySelector('#compose-fields');
  const submit = form.querySelector('.compose-submit');
  const listen = (element, event, handler) => element.addEventListener(event, handler, { signal: ctrl.signal });
  const mode = name => form.elements[name].value;
  const error = (scope, value = '') => { el(scope).textContent = value; };

  function showPreview() {
    const image = el('preview-img');
    image.hidden = !photos.length;
    el('empty').hidden = Boolean(photos.length);
    el('paper').classList.toggle('has-photo', Boolean(photos.length));
    if (photos.length) image.src = photos[0].src;
    else image.removeAttribute('src');
    const date = el('date').value;
    el('preview-date').textContent = date ? new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const text = el('text').value.trim().replace(/\s+/g, ' ');
    el('preview-quote').hidden = !text;
    el('preview-quote').textContent = text.length > 84 ? text.slice(0, 82).trimEnd() + '…' : text;
    el('count').textContent = el('text').value.length.toLocaleString('ru-RU') + ' / 10 000';
  }
  function drawPhotos() {
    el('thumbs').innerHTML = photos.map((p, i) => '<div class="compose-thumb"><img src="' + esc(p.src) + '" alt="' + esc(p.name) + '">' +
      '<button type="button" class="compose-remove" data-remove="' + i + '" aria-label="Убрать фото ' + (i + 1) + '">' + symbol('trash', 12) + '</button>' +
      '<div><button type="button" data-from="' + i + '" data-to="' + (i - 1) + '" aria-label="Переместить фото ' + (i + 1) + ' раньше"' + (!i ? ' disabled' : '') + '>' + symbol('back', 12) + '</button>' +
      '<span>' + (i ? i + 1 : 'Обложка') + '</span><button type="button" data-from="' + i + '" data-to="' + (i + 1) + '" aria-label="Переместить фото ' + (i + 1) + ' позже"' + (i === photos.length - 1 ? ' disabled' : '') + '>' + symbol('arrow', 12) + '</button></div></div>').join('');
    el('photo-count').textContent = photos.length + ' / 5';
    showPreview();
  }
  async function addPhotos(raw) {
    if (!raw.length || reading || sending) return;
    error('photo-error');
    const files = Array.from(raw);
    if (files.length + photos.length > photoLimit) { error('photo-error', 'Можно добавить до пяти снимков. Сейчас осталось мест: ' + (photoLimit - photos.length) + '.'); return; }
    const invalid = files.find(f => !imageTypes.has(f.type) || f.size > maxPhotoBytes || !f.size);
    if (invalid) { error('photo-error', 'Проверьте «' + invalid.name + '». Нужен JPEG, PNG, WebP, GIF или AVIF до 12 МБ.'); return; }
    reading = true; el('drop').setAttribute('aria-busy', 'true'); submit.disabled = true;
    try {
      const added = await Promise.all(files.map(async f => ({ name: f.name, src: await fileData(f) })));
      await Promise.all(added.map(async p => { const img = new Image(); img.src = p.src; await img.decode(); }));
      if (active) { photos = photos.concat(added); drawPhotos(); }
    } catch { if (active) error('photo-error', 'Не удалось открыть один из снимков. Попробуйте JPEG или PNG.'); }
    finally { reading = false; if (active) { el('drop').removeAttribute('aria-busy'); submit.disabled = false; } }
  }
  function showMusicFields() {
    const manual = mode('trackMode') === 'manual', link = mode('source') === 'link';
    el('auto-note').hidden = manual; el('manual').hidden = !manual;
    el('audio-label').hidden = link; el('link-label').hidden = !link;
    el('url').required = manual && link; el('url').disabled = !manual || !link;
    error('audio-error');
  }
  listen(el('text'), 'input', () => { el('text').setCustomValidity(''); showPreview(); });
  listen(el('date'), 'change', showPreview);
  listen(el('drop'), 'click', () => el('photos').click());
  listen(el('photos'), 'change', e => { const files = [...e.target.files]; e.target.value = ''; addPhotos(files); });
  listen(el('drop'), 'dragenter', e => { e.preventDefault(); dragLevel++; el('drop').classList.add('is-over'); });
  listen(el('drop'), 'dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  listen(el('drop'), 'dragleave', e => { e.preventDefault(); if (!--dragLevel) el('drop').classList.remove('is-over'); });
  listen(el('drop'), 'drop', e => { e.preventDefault(); dragLevel = 0; el('drop').classList.remove('is-over'); addPhotos(e.dataTransfer.files); });
  listen(el('thumbs'), 'click', e => {
    const button = e.target.closest('button');
    if (!button) return;
    const { remove, from, to } = button.dataset;
    if (remove !== undefined) photos.splice(Number(remove), 1);
    if (from !== undefined && Number(to) >= 0 && Number(to) < photos.length) [photos[from], photos[to]] = [photos[to], photos[from]];
    drawPhotos(); error('photo-error');
  });
  for (const choice of form.querySelectorAll('input[type="radio"]')) listen(choice, 'change', showMusicFields);
  listen(el('audio'), 'change', e => {
    trackFile = e.target.files[0] || null;
    error('audio-error');
    if (trackFile && (!audioTypes.has(trackFile.type) || trackFile.size > maxAudioBytes || !trackFile.size)) {
      error('audio-error', 'Выберите MP3, WAV, M4A, OGG, FLAC или другое поддерживаемое аудио до 24 МБ.');
      trackFile = null; e.target.value = '';
    }
    el('audio-name').textContent = trackFile?.name || 'Выберите аудио до 24 МБ';
  });
  const stages = ['Извлекаем палитру снимков', 'Определяем настроение и погоду', 'Собираем звуковую дорожку', 'Сохраняем папку дня'];
  function progress(index) {
    const node = el('progress');
    node.hidden = false;
    node.innerHTML = '<span>' + esc(stages[index]) + '…</span><div aria-hidden="true">' + stages.map((_, i) => '<i class="' + (i <= index ? 'done' : '') + '"></i>').join('') + '</div>';
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
      const signals = await analyzeDay(text, photos);
      if (!active) return;
      progress(1); await nextFrame();
      const date = el('date').value, voice = el('voice').checked;
      const prior = await history;
      if (!active) return;
      progress(2); await nextFrame();
      let track;
      if (!manual) track = await pickTrack({ ...signals, date, recentTracks: Array.isArray(prior) ? prior.slice(0, 8).map(d => d.track).filter(Boolean) : [] });
      else if (link) track = { kind: 'link', url: url.href, title: 'Песня с ' + url.hostname.replace(/^www\./, ''), artist: 'Ваша ссылка', bpm: null, reason: 'Вы прикрепили ссылку на песню. Она открывается в музыкальном сервисе.' };
      else track = await localTrack(trackFile);
      if (!active) return;
      track.title = track.title.slice(0, 200); track.artist = track.artist.slice(0, 200);
      if (track.reason) signals.explanation.push(track.reason);
      if (Number.isFinite(track.energy)) signals.energy = boundEnergy(signals.energy * 0.6 + track.energy * 0.4);
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

const boundEnergy = x => Math.max(0, Math.min(1, x));
