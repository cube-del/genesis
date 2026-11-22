import { api, dateLabel, esc, icon, modal, navigate } from './ui.js';
import { defaultMoment, momentLink, mountMomentPlayback } from './memory.js';
import { stopTrack, playingDay, playTrack } from './media.js';

const played = new Set();
const engine = { stopTrack, playingDay, playTrack };
const route = day => '/api/days/' + encodeURIComponent(day.id) + '/recall';
const dateTime = new Intl.DateTimeFormat('ru', { dateStyle:'long', timeStyle:'short' });

function soundControl(day, moment) {
  const link = momentLink(day.track, moment.startSeconds);
  if (day.track.kind === 'link') return link
    ? `<a class="button recall-outline" href="${esc(link.href)}" target="_blank" rel="noopener noreferrer">${icon('headphones',16)} Открыть музыку в сервисе</a>`
    : '';
  return '<button class="button recall-outline" type="button" data-fragment>Послушать фрагмент</button><p data-fragment-status role="status"></p>';
}

export function openRecall(days) {
  const available = days.filter(day => day.photos?.length);
  const own = available.filter(day => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(day.id));
  const pool = own.length ? own : available;
  if (!pool.length) return;
  const unseen = pool.filter(day => !played.has(day.id));
  const candidates = unseen.length ? unseen : pool;
  if (!unseen.length) for (const day of pool) played.delete(day.id);
  const day = candidates[Math.floor(Math.random() * candidates.length)];
  played.add(day.id);
  stopTrack();
  const moment = day.moment || defaultMoment(day);
  const photo = day.photos[moment.photoIndex] || day.photos[0];
  const focus = photo.focus && [photo.focus.x, photo.focus.y].every(Number.isFinite) ? photo.focus : {x:.5, y:.5};
  const crop = `--cue-x:${focus.x * 100}%;--cue-y:${focus.y * 100}%`;
  const fragment = photo.kind === 'video' && !photo.poster
    ? `<video src="${esc(photo.src)}" muted playsinline preload="metadata" tabindex="-1"></video>`
    : `<img src="${esc(photo.poster || photo.src)}" alt="Фрагмент кадра из архива">`;
  let stopSound;
  const body = modal('Вспомнить по детали', `<div class="recall">
    <figure class="recall-crop" style="${crop}">${fragment}</figure>
    <div class="recall-sound">${soundControl(day, moment)}</div>
    <form><fieldset>
      <label for="recall-note">Что первым пришло на ум?</label>
      <textarea id="recall-note" rows="2" maxlength="280" placeholder="Одна деталь, ощущение или короткая фраза"></textarea>
      <div class="memory-actions"><button type="submit" class="button primary" data-save-recall disabled>Сохранить и открыть</button><button class="button recall-outline" type="button" data-reveal>Открыть запись</button></div>
      <p class="recall-error" role="status"></p>
    </fieldset></form>
  </div>`, {onClose:() => stopSound?.()});
  body.closest('.overlay').classList.add('recall-overlay');
  stopSound = mountMomentPlayback(body, { ...day, moment }, engine, {autoplay:false});
  const form = body.querySelector('form');
  const fields = form.querySelector('fieldset');
  const note = body.querySelector('#recall-note');
  const save = body.querySelector('[data-save-recall]');
  let requestId = crypto.randomUUID();
  note.oninput = () => {
    requestId = crypto.randomUUID();
    save.disabled = !note.value.trim();
  };
  const reveal = () => navigate('/day/' + encodeURIComponent(day.id));
  body.querySelector('[data-reveal]').onclick = reveal;
  form.onsubmit = async event => {
    event.preventDefault();
    const text = note.value.trim();
    if (!text || fields.disabled) return;
    fields.disabled = true;
    body.querySelector('.recall-error').textContent = '';
    try {
      await api(route(day), {method:'POST', body:{id:requestId, text}});
      if (body.isConnected) navigate('/day/' + encodeURIComponent(day.id) + '?recall=' + requestId);
    } catch (error) {
      fields.disabled = false;
      body.querySelector('.recall-error').textContent = error.message;
    }
  };
}

export async function openRecallHistory(day, selected) {
  const body = modal('Как я вспомнил этот день', '<p role="status">Открываем заметки…</p>', {wide:true});
  try {
    const notes = await api(route(day));
    if (!body.isConnected) return;
    const ordered = selected ? [...notes].sort((a, b) => Number(b.id === selected) - Number(a.id === selected)) : notes;
    body.innerHTML = `<div class="recall-pair">
      <section><h3>Тогда</h3><time datetime="${esc(day.date)}">${esc(dateLabel(day.date))}</time><p class="recall-original">${esc(day.text)}</p></section>
      <section><h3>При возвращении</h3>
        ${ordered.length ? ordered.map(note => `<blockquote><p>${esc(note.text)}</p><time datetime="${esc(note.at)}">${esc(dateTime.format(new Date(note.at)))}</time></blockquote>`).join('') : '<p>Вернитесь к дню через «Вспомнить по детали» и сохраните первое впечатление.</p>'}
      </section></div>`;
  } catch (error) {
    if (body.isConnected) body.textContent = error.message;
  }
}
