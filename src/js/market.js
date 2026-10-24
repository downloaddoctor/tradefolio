import { loadCandles, saveCandles } from './db.js';

const HOST = 'https://query1.finance.yahoo.com';
const CORS_KEY = 'corsKey';

export function loadCorsKey() {
  try { return (localStorage.getItem(CORS_KEY) || '').trim(); } catch (e) { return ''; }
}

export function saveCorsKey(k) {
  const v = String(k || '').trim();
  try { if (v) localStorage.setItem(CORS_KEY, v); else localStorage.removeItem(CORS_KEY); } catch (e) { }
}

const sameDay = (ts) => new Date(ts).toDateString() === new Date().toDateString();

export function yahooCandidates(symbol) {
  const s = String(symbol || '').trim().toUpperCase();
  if (!s) return [];
  if (s.includes('.')) return [s];
  if (/^\d+$/.test(s)) return [s + '.BO'];
  return [s + '.NS', s + '.BO'];
}

// the only data route: Yahoo chart API through corsproxy.io (optional key from localStorage)
function proxyUrl(u) {
  const k = loadCorsKey();
  return 'https://corsproxy.io/?' + new URLSearchParams(k ? { key: k, url: u } : { url: u });
}

async function getJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(proxyUrl(url), { signal: ctl.signal });
    if (res.status === 404) throw new Error('not found');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const txt = await res.text();
    const head = txt.trim().slice(0, 40);
    if (!head || head[0] === '<') throw new Error('bad proxy response');
    return JSON.parse(txt);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOne(ysym, p1, p2) {
  const url = HOST + '/v8/finance/chart/' + encodeURIComponent(ysym) +
    '?period1=' + p1 + '&period2=' + p2 + '&interval=1d&events=history';
  const j = await getJson(url);
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.timestamp) throw new Error('no data');
  const q = r.indicators.quote[0];
  const out = [];
  r.timestamp.forEach((t, i) => {
    if (q.open[i] == null || q.high[i] == null || q.low[i] == null || q.close[i] == null) return;
    out.push({
      time: new Date(t * 1000).toISOString().slice(0, 10),
      open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] || 0
    });
  });
  if (!out.length) throw new Error('no data');
  return out;
}

export async function getCandles(symbol, fromTs, toTs, override, force) {
  const cached = await loadCandles(symbol).catch(() => null);
  const wantKey = override ? override.toUpperCase() : '';
  const usable = cached && (!wantKey || cached.ysym === wantKey);
  if (usable && !force && sameDay(cached.fetchedAt)) {
    return { candles: cached.candles, ysym: cached.ysym, cached: true };
  }
  const p1 = Math.floor((fromTs - 365 * 86400000) / 1000);
  const p2 = Math.floor((toTs || Date.now()) / 1000);
  let err = null;
  for (const ys of yahooCandidates(override || symbol)) {
    try {
      const candles = await fetchOne(ys, p1, p2);
      await saveCandles(symbol, ys, candles).catch(() => null);
      return { candles, ysym: ys, cached: false };
    } catch (e) { err = e; }
  }
  if (usable) return { candles: cached.candles, ysym: cached.ysym, cached: true, stale: true };
  throw err || new Error('no data');
}
