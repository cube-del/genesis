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
    return track?.kind === 'file' ? 'Темп не определён' : 'Темп не указан';
  }
  const value = Math.round(track.bpm) + ' BPM';
  const source = track.bpmSource || (track.kind === 'file' ? 'measured' : '');
  if (source === 'measured') return 'Измерено ≈ ' + value;
  if (source === 'manual') return 'Задано вручную · ' + value;
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
