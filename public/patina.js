const dayInMs = 86400000;

export function photoPatina(date, extraDays = 0) {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const photographed = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(photographed)) return 0;
  const age = Math.max(0, (today - photographed) / dayInMs + extraDays);
  return .86 * (1 - Math.exp(-age / 190));
}
