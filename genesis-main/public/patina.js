const dayInMs = 86400000;

export function archivePatina(date, extraDays = 0) {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const photographed = Date.parse(date + 'T00:00:00Z');
  const age = Number.isFinite(photographed) ? Math.max(0, (today - photographed) / dayInMs + extraDays) : 0;
  return .66 + .30 * (1 - Math.exp(-age / 190));
}
