import { closeModal, esc, icon, modal } from './ui.js';

export const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);
export const videoTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-m4v']);
export const maxPhotoBytes = 50 * 1024 * 1024;
export const maxVideoBytes = 250 * 1024 * 1024;
const imageExt = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' };
const videoExt = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg' };

export function detectMediaMime(file) {
  if (imageTypes.has(file.type) || videoTypes.has(file.type)) return file.type;
  const ext = (file.name || '').split('.').pop().toLowerCase();
  return imageExt[ext] || videoExt[ext] || '';
}

export function chooseFolderPhotos(raw, limit, onChoose) {
  const path = file => file.webkitRelativePath || file.name;
  const files = [];
  for (const file of raw) {
    if (!file.size) continue;
    const mime = detectMediaMime(file);
    if (!mime) continue;
    const isVideo = videoTypes.has(mime);
    if (file.size > (isVideo ? maxVideoBytes : maxPhotoBytes)) continue;
    const normalized = file.type === mime ? file : new File([file], file.name, { type: mime });
    files.push({ file: normalized, isVideo, path: path(file) });
  }
  files.sort((a, b) => a.path.localeCompare(b.path, 'ru', { numeric: true }));
  const skipped = raw.length - files.length;
  if (files.length <= limit) { onChoose(files.map(item => item.file), skipped); return; }

  const selected = new Set();
  const pageSize = 24;
  let page = 0, urls = [];
  function release() { urls.forEach(url => URL.revokeObjectURL(url)); urls = []; }
  const body = modal(files[0].path.split('/')[0], '<p class="dialog-lead">Выберите фото или видео для дня. Свободных мест — ' + limit + '.</p>' +
    '<div class="folder-photos"></div><div class="folder-actions"><div class="folder-pages"><button type="button" class="icon-button" data-prev aria-label="Предыдущая страница">' + icon('chevron-left', 17) + '</button><span data-page></span><button type="button" class="icon-button" data-next aria-label="Следующая страница">' + icon('chevron-right', 17) + '</button></div>' +
    '<button class="button primary" type="button" data-add disabled></button></div>', { wide: true, onClose: release });
  const grid = body.querySelector('.folder-photos'), add = body.querySelector('[data-add]');
  const prev = body.querySelector('[data-prev]'), next = body.querySelector('[data-next]');
  function refresh() {
    for (const input of grid.querySelectorAll('input')) {
      input.checked = selected.has(Number(input.value));
      input.disabled = !input.checked && selected.size >= limit;
    }
    add.disabled = !selected.size;
    add.textContent = selected.size ? 'Добавить · ' + selected.size : 'Добавить';
  }
  function render() {
    release();
    grid.innerHTML = files.slice(page * pageSize, (page + 1) * pageSize).map((item, i) => {
      const url = URL.createObjectURL(item.file); urls.push(url);
      const media = item.isVideo
        ? '<video src="' + esc(url) + '" muted preload="metadata" playsinline></video><em class="folder-video-tag">ВИДЕО</em>'
        : '<img loading="lazy" src="' + esc(url) + '" alt="">';
      return '<label title="' + esc(item.path) + '"><input type="checkbox" value="' + (page * pageSize + i) + '">' + media + '<span>' + esc(item.file.name) + '</span></label>';
    }).join('');
    prev.disabled = !page;
    next.disabled = (page + 1) * pageSize >= files.length;
    body.querySelector('.folder-pages').hidden = files.length <= pageSize;
    body.querySelector('[data-page]').textContent = (page + 1) + ' / ' + Math.ceil(files.length / pageSize);
    refresh();
  }
  grid.onchange = ({ target }) => {
    const index = Number(target.value);
    if (target.checked) selected.add(index); else selected.delete(index);
    refresh();
  };
  prev.onclick = () => { page--; render(); };
  next.onclick = () => { page++; render(); };
  add.onclick = () => {
    const chosen = [...selected].map(index => files[index].file);
    closeModal(); onChoose(chosen, skipped);
  };
  render();
}
