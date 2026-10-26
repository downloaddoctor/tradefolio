export function yahooCandidates(symbol) {
  const s = String(symbol || '').trim().toUpperCase();
  if (!s) return [];
  if (s.includes('.')) return [s];
  if (/^\d+$/.test(s)) return [s + '.BO'];
  return [s + '.NS', s + '.BO'];
}
