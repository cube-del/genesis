export const minManualBpm = 40;
export const maxManualBpm = 240;
const beatsPerPhoto = 8;
const fallbackMs = 8000;

export function photoInterval(track) {
  const bpm = track?.bpm;
  return Number.isFinite(bpm) && bpm >= minManualBpm && bpm <= maxManualBpm
    ? 60000 * beatsPerPhoto / bpm : fallbackMs;
}

export function tempoLabel(track) {
  if (!track || !Number.isFinite(track.bpm) || track.bpm < minManualBpm || track.bpm > maxManualBpm) {
    if (track?.pulseStatus === 'ambiguous') return 'Возможен двойной или половинный счёт';
    if (track?.pulseStatus === 'variable') return 'Нет уверенной оценки единого темпа';
    return track?.kind === 'file' ? 'Темп не определён' : 'Темп не указан';
  }
  const value = track.bpm.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' BPM';
  const source = track.bpmSource || (track.kind === 'file' ? 'measured' : '');
  if (source === 'measured') return 'Измерено ≈ ' + value;
  if (source === 'deezer') return 'По данным Deezer · ' + value;
  if (source === 'tap') return 'По вашим ударам · ' + value;
  if (source === 'manual') return 'Задано вручную · ' + value;
  if (source === 'catalog') return 'Каталог · ' + value;
  return value;
}

export function rhythmDescription(day) {
  const interval = photoInterval(day.track);
  const recorded = day.track?.bpm >= minManualBpm && day.track.bpm <= maxManualBpm;
  const seconds = (interval / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  if (day.photos.length === 1) return recorded
    ? 'Темп задаёт скорость движения камеры внутри единственного снимка.'
    : 'У единственного снимка мягкое движение камеры в обычном темпе.';
  return recorded
    ? `Кадры сменяются каждые ${seconds} с, раз в ${beatsPerPhoto} долей этого темпа.`
    : `Запасной ритм: кадр меняется каждые ${seconds} с.`;
}

export function tappedTempo(times) {
  if (times.length < 4) return null;
  const intervals = times.slice(1).map((time, i) => time - times[i]).sort((a, b) => a - b);
  const mid = Math.floor(intervals.length / 2);
  const median = intervals.length % 2 ? intervals[mid] : (intervals[mid - 1] + intervals[mid]) / 2;
  const bpm = Math.round(60000 / median);
  return bpm >= minManualBpm && bpm <= maxManualBpm ? bpm : null;
}

export function deezerTrackId(url) {
  if (url.protocol !== 'https:' || !['deezer.com', 'www.deezer.com'].includes(url.hostname)) return null;
  return url.pathname.match(/^\/(?:[a-z]{2}\/)?track\/([1-9]\d{0,14})\/?$/i)?.[1] || null;
}
