import { api, closeModal, esc, modal, toast } from './ui.js';
import { coverCaption, momentLink, quoteFragments, mountMomentPlayback } from './memory.js';
import { mountTempoFields, songLink, tempoFields, trackFromLink } from './link-tempo.js';
import { mountTurn, turnFigure } from './day-turn.js';
import * as audio from './media.js';

function quoteOptions(day, selected, automatic = false) {
  const phrases = quoteFragments(day.text);
  if (selected && !phrases.includes(selected)) phrases.unshift(selected);
  return (automatic ? '<option value="">Исходная подпись</option>' : '') + phrases.map(phrase =>
    '<option value="' + esc(phrase) + '"' + (phrase === selected ? ' selected' : '') + '>' + esc(phrase) + '</option>'
  ).join('');
}

function saveForm(body, day, path, values, saved) {
  const form = body.querySelector('form');
  form.onsubmit = async event => {
    event.preventDefault();
    const fields = form.querySelector('fieldset');
    if (fields.disabled) return;
    fields.disabled = true;
    try {
      const data = await values(form.elements);
      if (!body.isConnected) return;
      const result = await api('/api/days/' + encodeURIComponent(day.id) + '/' + path, {method:'PUT', body:data});
      saved(result);
      if (body.isConnected) { closeModal(); toast('Сохранено в папке дня'); }
    } catch (error) {
      fields.disabled = false;
      body.querySelector('[role=status]').textContent = error.message;
    }
  };
  body.querySelector('[data-cancel]').onclick = closeModal;
}
const actions = '<div class="memory-actions"><button class="button primary" type="submit">Сохранить</button><button type="button" class="button secondary" data-cancel>Отмена</button></div><p role="status"></p>';

export function editLook(day, canvas, preview, reset, saved) {
  const selected = day.authorLook || {tone:'original', quote:null};
  const body = modal('Я запомнил это иначе', `<form class="memory-editor memory-look"><fieldset>
    <figure class="memory-proof-wrap"><canvas class="memory-proof" width="352" height="440" aria-label="Предпросмотр открытки"></canvas><figcaption data-caption></figcaption></figure>
    <label>Фраза на обложке<select name="quote">${quoteOptions(day, selected.quote, true)}</select></label>
    <label>Оформление<select name="tone"><option value="original">Исходное</option><option value="warm">Теплее</option><option value="muted">Сдержаннее</option></select></label>
    ${actions}</fieldset></form>`, {wide:true, onClose:reset});
  const fields = body.querySelector('form').elements;
  fields.tone.value = selected.tone;
  const proof = body.querySelector('canvas');
  const value = inputs => ({tone:inputs.tone.value, quote:inputs.quote.value || null});
  function draw() {
    const look = value(fields);
    preview(look);
    body.querySelector('[data-caption]').textContent = coverCaption({...day, authorLook:look});
    proof.getContext('2d').drawImage(canvas, 0, 0, proof.width, proof.height);
  }
  body.onchange = draw;
  draw();
  saveForm(body, day, 'author-look', value, saved);
}

export function editSongLink(day, saved) {
  const ctrl = new AbortController();
  const previous = day.track.kind === 'link' ? day.track : null;
  const body = modal('Песня по ссылке', `<form class="memory-editor"><fieldset>
    <label>Ссылка на песню<input type="url" id="c-url" placeholder="https://…" value="${esc(previous?.url)}" required></label>
    ${tempoFields}${actions}</fieldset></form>`, {onClose:() => ctrl.abort()});
  const tempo = mountTempoFields(body, {getPhotos:() => day.photos, isLink:() => true, signal:ctrl.signal, initialTrack:previous});
  saveForm(body, day, 'track', async () => {
    const url = songLink(body.querySelector('#c-url').value.trim());
    const meta = await tempo.resolve();
    const bpm = body.querySelector('#c-bpm').valueAsNumber;
    if (!Number.isFinite(bpm)) throw Error('Выберите, как ощущается песня, или настучите ритм.');
    const existing = previous?.url === url.href ? previous : null;
    return {track:{ ...trackFromLink(url, meta || existing), bpm, bpmSource:tempo.source }};
  }, saved);
}

export function editMoment(day, saved) {
  const moment = day.moment;
  const timed = day.track.kind !== 'link' || momentLink(day.track)?.timed;
  const body = modal('Дорожка воспоминания', `<form class="memory-editor"><fieldset>
    <label>Название момента<input name="title" required maxlength="64" value="${esc(moment.title)}"></label>
    <label>Кадр<select name="photo">${day.photos.map((p,i) => '<option value="' + i + '"' + (moment.photoIndex === i ? ' selected' : '') + '>Кадр ' + (i+1) + ' · ' + esc(p.name) + '</option>').join('')}</select></label>
    <img class="memory-thumb" alt="Выбранный кадр">
    <label>Фраза из рассказа<select name="quote">${quoteOptions(day, moment.quote)}</select></label>
    ${timed ? '<label>Начало фрагмента, с<input name="start" type="number" min="0" max="' + (day.track.kind === 'ambient' ? 29 : 86400) + '" step="1" required value="' + moment.startSeconds + '"></label>' : '<p>Песня откроется в музыкальном сервисе.</p>'}
    ${actions}</fieldset></form>`);
  const fields = body.querySelector('form').elements;
  function displayPhoto() {
    const p = day.photos[Number(fields.photo.value)];
    const thumb = body.querySelector('.memory-thumb');
    thumb.hidden = p.kind === 'video' && !p.poster;
    if (!thumb.hidden) thumb.src = p.poster || p.src;
  }
  fields.photo.onchange = displayPhoto;
  displayPhoto();
  if (fields.start && ['file','preview'].includes(day.track.kind)) {
    const media = new Audio();
    media.preload = 'metadata';
    media.onloadedmetadata = () => {
      media.onloadedmetadata = null;
      if (body.isConnected && Number.isFinite(media.duration)) fields.start.max = Math.max(0, Math.ceil(media.duration) - 1);
      media.removeAttribute('src'); media.load();
    };
    media.src = day.track.src;
  }
  saveForm(body, day, 'moment', fields => ({
    title:fields.title.value.trim(), quote:fields.quote.value, photoIndex:Number(fields.photo.value), startSeconds:fields.start?.valueAsNumber || 0
  }), saved);
}

export function openDayTurn(day, turn, {readOnly, saved}) {
  if (!turn) {
    editTurn(day, null, saved);
    return;
  }
  const moment = day.moment;
  const link = day.track.kind === 'link' ? momentLink(day.track, moment.startSeconds) : null;
  let stop, stopAnimation;
  const body = modal('Поворот дня', `${turnFigure(day, turn)}
    <div class="turn-actions">
      ${link ? '<a class="button recall-outline" href="' + esc(link.href) + '" target="_blank" rel="noopener noreferrer">Послушать музыку дня</a>' :
        '<button class="button recall-outline" type="button" data-fragment>Послушать фрагмент</button>'}
      ${readOnly ? '' : '<button class="button primary" type="button" data-edit-turn>' + (day.turn ? 'Настроить поворот' : 'Проверить и сохранить') + '</button>'}
      <p data-fragment-status role="status"></p>
    </div>`, {wide:true, onClose:() => { stop?.(); stopAnimation?.(); }});
  stopAnimation = mountTurn(body.querySelector('[data-turn]'), {onPlay:() => {
    const audioButton = body.querySelector('[data-fragment]');
    if (audioButton && audioButton.getAttribute('aria-pressed') !== 'true') audioButton.click();
  }});
  stop = mountMomentPlayback(body, day, audio, {autoplay:false});
  const edit = body.querySelector('[data-edit-turn]');
  if (edit) edit.onclick = () => editTurn(day, turn, saved);
}

function editTurn(day, turn, saved) {
  const phases = [['before', 'До поворота'], ['after', 'После поворота']];
  const phaseFields = phases.map(([key, label], index) => `<section class="turn-edit-phase">
    <h3>${label}</h3><label>Дословная фраза ${index ? 'после' : 'до'}<textarea name="${key}Quote" rows="3" required maxlength="220">${esc(turn?.[key].quote)}</textarea></label>
    <label>Кадр ${index ? 'после' : 'до'}<select name="${key}Photo">${day.photos.map((photo, i) =>
      '<option value="' + i + '"' + (i === (turn?.[key].photoIndex ?? (index ? day.photos.length - 1 : 0)) ? ' selected' : '') + '>Кадр ' + (i + 1) + ' · ' + esc(photo.name) + '</option>').join('')}</select></label>
    </section>`).join('');
  const body = modal('Настроить поворот дня', `<form class="memory-editor"><fieldset>
    <p class="dialog-lead">Выберите две дословные фразы в порядке рассказа. Кадр может быть одним и тем же.</p>
    <div class="turn-edit-grid">${phaseFields}</div>
    <details class="turn-source"><summary>Текст записи</summary><p>${esc(day.text)}</p></details>
    ${actions}
  </fieldset></form>`, {wide:true});
  saveForm(body, day, 'turn', fields => Object.fromEntries(phases.map(([key]) => [key, {
    quote:fields[key + 'Quote'].value.trim(), photoIndex:Number(fields[key + 'Photo'].value)
  }])), saved);
}

export function openMoment(day) {
  const m = day.moment, p = day.photos[m.photoIndex];
  const external = day.track.kind === 'link' || audio.spotifyLinks(day.track);
  const link = external ? momentLink(day.track, m.startSeconds) : null;
  let stop;
  const body = modal(m.title, `<figure class="memory-listening">
    ${p.kind === 'video' ? '<video src="' + esc(p.src) + '" controls muted playsinline></video>' : '<img src="' + esc(p.src) + '" alt="' + esc(m.title) + '">'}
    <figcaption>«${esc(m.quote)}»</figcaption></figure>
    <p class="memory-track-name">${esc(day.track.title)}</p>
    ${link?.embed ? '<iframe title="Плеер песни" data-moment-embed="' + esc(link.embed) + '" width="100%" height="' + link.height + '" allow="autoplay; encrypted-media" frameborder="0"></iframe>' : ''}
    ${link ? '<a class="button primary" href="' + esc(link.href) + '" target="_blank" rel="noopener noreferrer">Открыть песню' + (link.timed ? ' с ' + m.startSeconds + ' с' : ' в сервисе') + '</a>' : '<button class="button primary" data-fragment>Послушать фрагмент</button>'}
    <p data-fragment-status role="status"></p>`, {onClose:() => stop?.()});
  stop = mountMomentPlayback(body, day, audio);
}
