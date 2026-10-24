export const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const NUM = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 });
export const EPS = 1e-9;

export function norm(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
}

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function fmtDate(ts) {
  if (ts == null || ts === '') return '-';
  const d = new Date(ts);
  const h = d.getUTCHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return pad(d.getUTCDate()) + '-' + pad(d.getUTCMonth() + 1) + '-' + d.getUTCFullYear() + ' ' + pad(h12) + ':' + pad(d.getUTCMinutes()) + ' ' + ap;
}
