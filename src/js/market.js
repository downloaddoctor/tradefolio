import { loadCandles, saveCandles } from './db.js';

const HOST = 'https://query1.finance.yahoo.com';
const STOOQ = 'https://stooq.com/q/d/l/';
const CORS_KEY = 'corsKey';
const PROXIES = [
  (u) => {
    const k = loadCorsKey();
    return { url: 'https://corsproxy.io/?' + new URLSearchParams(k ? { key: k, url: u } : { url: u }) };
  }
];

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

function stooqCandidates(symbol) {
  const s = String(symbol || '').trim().toUpperCase();
  if (!s) return [];
  if (s.includes('.')) {
    const parts = s.split('.');
    const ex = parts[parts.length - 1].toLowerCase();
    return [{ sym: parts.slice(0, -1).join('.'), ex: ex === 'ns' ? 'nse' : ex === 'bo' ? 'bse' : ex }];
  }
  if (/^\d+$/.test(s)) return [{ sym: s, ex: 'bse' }];
  return [
    { sym: s, ex: 'nse' },
    { sym: s, ex: 'bse' }
  ];
}

async function getJson(url) {
  let last = null;
  for (const wrap of PROXIES) {
    const p = wrap(url);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    try {
      const res = await fetch(p.url, { signal: ctl.signal });
      if (res.status === 404) { last = new Error('not found'); clearTimeout(timer); break; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const txt = await res.text();
      const head = txt.trim().slice(0, 40);
      if (!head || head[0] === '<') throw new Error('bad proxy response');
      return JSON.parse(txt);
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last || new Error('network error');
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

function isCsv(txt) {
  if (!txt) return false;
  const head = txt.trim().slice(0, 60);
  if (/^</.test(head)) return false;
  return /^Date,/i.test(head);
}

async function stooqFetch(item, p1, p2) {
  const url = STOOQ +
    '?s=' + encodeURIComponent(item.sym.toLowerCase()) + '.' + item.ex +
    '&i=d' +
    '&d1=' + new Date(p1 * 1000).toISOString().slice(0, 10).replace(/-/g, '') +
    '&d2=' + new Date(p2 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  let txt;
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    txt = await res.text();
  } finally { clearTimeout(timer); }
  if (!isCsv(txt)) throw new Error('no data');
  const lines = txt.trim().split(/\r?\n/);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c.length < 6) continue;
    const open = +c[1], high = +c[2], low = +c[3], close = +c[4];
    if (![open, high, low, close].every(Number.isFinite)) continue;
    out.push({
      time: String(c[0]).slice(0, 10),
      open: open, high: high, low: low, close: close,
      volume: Math.round(+c[5]) || 0
    });
  }
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
  const src = override || symbol;
  let err = null;
  for (const ys of yahooCandidates(src)) {
    try {
      const candles = await fetchOne(ys, p1, p2);
      await saveCandles(symbol, ys, candles).catch(() => null);
      return { candles, ysym: ys, cached: false };
    } catch (e) { err = e; }
  }
  for (const item of stooqCandidates(src)) {
    try {
      const candles = await stooqFetch(item, p1, p2);
      const tag = (item.sym + '.' + item.ex).toUpperCase();
      await saveCandles(symbol, tag, candles).catch(() => null);
      return { candles, ysym: tag, cached: false };
    } catch (e) { err = e; }
  }
  if (usable) return { candles: cached.candles, ysym: cached.ysym, cached: true, stale: true };
  throw err || new Error('no data');
}