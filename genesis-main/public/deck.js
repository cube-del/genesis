import { icon } from './ui.js';

const visibleLimit = 5;
const number = value => String(value).padStart(2, '0');
const clamp = (value, last) => Math.max(0, Math.min(last, Number.isInteger(value) ? value : 0));

function photoName(photo, index) {
  const name = (photo.name || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').trim();
  return name || 'Фотография ' + (index + 1);
}

function getItems(day, days) {
  const photos = (day.photos || []).map((photo, index) => ({
    src: photo.src, title: photoName(photo, index), photoIndex: index,
  })).filter(item => item.src);
  if (photos.length !== 1) return { items: photos, isDays: false };
  const permitted = new Map();
  for (const memory of days || []) {
    if (memory?.id && memory.photos?.[0]?.src && !permitted.has(memory.id)) permitted.set(memory.id, memory);
  }
  if (!permitted.has(day.id)) permitted.set(day.id, day);
  if (permitted.size < 2) return { items: photos, isDays: false };
  const items = [...permitted.values()]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map(memory => ({
      src: memory.photos[0].src, title: memory.title, memory,
    }));
  return { items, isDays: true };
}

export function mountDeck(host, { day, days = [], readOnly = false, onPickPhoto, onPickDay, startIndex = 0 }) {
  const { items, isDays } = getItems(day, days);
  const end = items.length - 1;
  let selected = isDays ? items.findIndex(item => item.memory.id === day.id) : items.findIndex(item => item.photoIndex === startIndex);
  selected = clamp(selected, end);
  let cursor = selected, disposed = false;
  const controller = new AbortController();
  const node = document.createElement('section');
  const heading = isDays ? 'Колода дней' : items.length === 1 ? 'Кадр дня' : 'Кадры дня';
  node.className = 'day-deck';
  node.setAttribute('aria-label', heading);
  node.dataset.mode = isDays ? 'days' : 'photos';
  node.dataset.access = readOnly ? 'read' : 'owner';
  node.innerHTML = '<div class="deck-caption"><div class="deck-line"><h2></h2><span class="deck-count"></span></div><p class="deck-detail"></p></div>' +
    '<div class="deck-picker"><button class="deck-step" type="button" data-step="-1"></button><div class="deck-fan" role="group"></div><button class="deck-step" type="button" data-step="1"></button></div>';
  const count = node.querySelector('.deck-count'), detail = node.querySelector('.deck-detail'), fan = node.querySelector('.deck-fan');
  node.querySelector('h2').textContent = heading;
  fan.setAttribute('aria-label', heading);
  const steps = [...node.querySelectorAll('[data-step]')];
  steps.forEach((button, index) => {
    const next = Boolean(index);
    button.innerHTML = icon(next ? 'chevron-right' : 'chevron-left', 15);
    button.setAttribute('aria-label', (next ? 'Следующий ' : 'Предыдущий ') + (isDays ? 'день' : 'кадр'));
    button.hidden = items.length < 2;
  });
  host.replaceChildren(node);
  node.hidden = !items.length;

  function paint({ focus = false } = {}) {
    if (disposed || !items.length) return;
    const length = Math.min(visibleLimit, items.length);
    const first = clamp(cursor - Math.floor(length / 2), items.length - length);
    const digits = number(cursor + 1) + ' / ' + number(items.length);
    count.textContent = digits;
    count.setAttribute('aria-label', (isDays ? 'День ' : 'Кадр ') + (cursor + 1) + ' из ' + items.length);
    detail.textContent = items[cursor].title;
    detail.title = items[cursor].title;
    // Keep the same elements while the visible window is unchanged, including
    // during canvas playback. This preserves keyboard focus and image decoding.
    for (const child of [...fan.children]) {
      const index = Number(child.dataset.index);
      if (index < first || index >= first + length) child.remove();
    }
    for (let offset = 0; offset < length; offset++) {
      const index = first + offset, item = items[index];
      let button = fan.querySelector('[data-index="' + index + '"]');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button'; button.className = 'deck-thumb'; button.dataset.index = index;
        const img = document.createElement('img');
        img.alt = ''; img.draggable = false; img.decoding = 'async'; img.src = item.src;
        button.append(img);
        const after = [...fan.children].find(child => Number(child.dataset.index) > index);
        fan.insertBefore(button, after || null);
      }
      const active = index === selected, position = offset - (length - 1) / 2;
      const label = (isDays ? 'День ' : 'Кадр ') + (index + 1) + ' из ' + items.length + '. ' + item.title;
      button.title = item.title; button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(active)); button.tabIndex = index === cursor ? 0 : -1;
      button.style.setProperty('--deck-angle', position * 3.9 + 'deg');
      button.style.setProperty('--deck-rise', Math.abs(position) * 1.4 + 'px');
      button.style.setProperty('--deck-order', offset + 1);
    }
    if (focus) fan.querySelector('[data-index="' + cursor + '"]')?.focus({ preventScroll: true });
  }

  function choose(index) {
    if (!items[index] || disposed) return;
    cursor = index;
    if (isDays) {
      if (index !== selected) onPickDay?.(items[index].memory);
      else paint();
    } else {
      selected = index; paint();
      onPickPhoto?.(items[index].photoIndex);
    }
  }
  node.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !node.contains(button)) return;
    if (button.dataset.step) choose((cursor + Number(button.dataset.step) + items.length) % items.length);
    else if (button.dataset.index !== undefined) choose(Number(button.dataset.index));
  }, { signal: controller.signal });
  fan.addEventListener('keydown', event => {
    if (!event.target.closest('[data-index]') || items.length < 2) return;
    const focused = Number(event.target.closest('[data-index]').dataset.index);
    const target = { ArrowLeft: (focused + end) % items.length, ArrowRight: (focused + 1) % items.length, Home: 0, End: end }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    // Browsing across days is non-destructive. Confirm a focused day with
    // Enter or Space. Within one day the picture updates as focus moves.
    if (!isDays) choose(target);
    cursor = target; paint({ focus: true });
  }, { signal: controller.signal });
  paint();
  return {
    selectPhoto(index) {
      if (disposed || isDays) return;
      const next = items.findIndex(item => item.photoIndex === index);
      if (next < 0 || selected === next) return;
      selected = cursor = next;
      paint();
    },
    destroy() {
      disposed = true; controller.abort(); node.remove();
    },
  };
}
