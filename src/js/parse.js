import { norm } from './format.js';

export const FIELDS = [
  { k: 'stock', label: 'Stock name', h: 'stock name' },
  { k: 'symbol', label: 'Symbol', h: 'symbol' },
  { k: 'isin', label: 'ISIN', h: 'isin' },
  { k: 'type', label: 'Type', h: 'type', req: 1 },
  { k: 'qty', label: 'Quantity', h: 'quantity', req: 1 },
  { k: 'value', label: 'Value', h: 'value', req: 1 },
  { k: 'exchange', label: 'Exchange', h: 'exchange' },
  { k: 'orderId', label: 'Exchange Order Id', h: 'exchange order id' },
  { k: 'date', label: 'Execution date and time', h: 'execution date and time', req: 1 },
  { k: 'status', label: 'Order status', h: 'order status', req: 1 }
];

function mkUtc(y, mo, d, h, mi, s) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return NaN;
  const ts = Date.UTC(y, mo - 1, d, h, mi, s);
  const chk = new Date(ts);
  if (chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return NaN;
  return ts;
}

export function parseDate(v) {
  if (v instanceof Date) {
    return isNaN(v) ? NaN : Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds());
  }
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) return Math.round((v - 25569) * 86400000);
    return NaN;
  }
  const s = String(v == null ? '' : v).trim();
  if (!s) return NaN;
  let m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]?\.?)?\s*$/);
  if (m) {
    let h = m[4] ? parseInt(m[4], 10) : 0;
    if (m[7]) {
      if (h < 1 || h > 12) return NaN;
      h = (h % 12) + (m[7].toLowerCase() === 'p' ? 12 : 0);
    }
    return mkUtc(+m[3], +m[2], +m[1], h, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return mkUtc(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
  return NaN;
}

export function toNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  const s = String(v == null ? '' : v).replace(/[,\s\u20B9]/g, '');
  if (s === '') return NaN;
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

export function toText(v) {
  if (v == null) return '';
  if (typeof v === 'number') return v.toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 6 });
  return String(v).trim();
}

export function normSymbol(v) {
  const s = toText(v);
  return /^\d+\.0+$/.test(s) ? s.replace(/\.0+$/, '') : s;
}

export function emptyStats() {
  return { file: '', importedAt: '', empty: 0, skippedStatus: {}, skippedStatusTotal: 0, invalid: [], dupRows: 0 };
}

export function parseWorkbook(buf, fileName) {
  const wb = XLSX.read(buf, { type: 'array' });
  const known = FIELDS.map((f) => f.h);
  for (const name of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    let hi = -1;
    for (let i = 0; i < aoa.length; i++) {
      const score = aoa[i].filter((c) => known.indexOf(norm(c)) >= 0).length;
      if (score >= 4) { hi = i; break; }
    }
    if (hi < 0) continue;
    const header = aoa[hi];
    const colMap = {};
    const mapping = FIELDS.map((f) => {
      const idx = header.findIndex((c) => norm(c) === f.h);
      colMap[f.k] = idx;
      return { k: f.k, label: f.label, idx, found: idx >= 0, req: !!f.req };
    });
    const missing = mapping.filter((m) => m.req && !m.found).map((m) => m.label);
    if (colMap.symbol < 0 && colMap.isin < 0 && colMap.stock < 0) missing.push('Symbol / ISIN / Stock name');
    if (missing.length) throw new Error('Missing required columns: ' + missing.join(', '));
    const data = aoa.slice(hi + 1);
    const used = mapping.filter((m) => m.found);
    const previewRows = [];
    for (let r = 0; r < data.length && previewRows.length < 8; r++) {
      if (data[r].join('').trim() === '') continue;
      previewRows.push(used.map((m) => toText(data[r][m.idx])));
    }
    return {
      fileName, sheet: name, headerRow: hi + 1, mapping, colMap, dataRows: data,
      previewHead: used.map((m) => m.label), previewRows
    };
  }
  throw new Error('Could not find a header row (expected columns like Stock name, Symbol, Type, Quantity...).');
}

export function buildTrades(pv) {
  const cm = pv.colMap;
  const stats = emptyStats();
  stats.file = pv.fileName;
  stats.importedAt = new Date().toLocaleString('en-IN');
  const trades = [];
  const seen = new Set();
  const get = (row, k) => { const i = cm[k]; return i == null || i < 0 ? '' : row[i]; };
  pv.dataRows.forEach((row, i) => {
    const rowNo = pv.headerRow + 1 + i;
    if (row.join('').trim() === '') { stats.empty++; return; }
    const st = norm(get(row, 'status'));
    if (st !== 'executed') {
      const label = st || '(blank)';
      stats.skippedStatus[label] = (stats.skippedStatus[label] || 0) + 1;
      stats.skippedStatusTotal++;
      return;
    }
    const tp = norm(get(row, 'type'));
    const type = tp === 'buy' ? 'BUY' : tp === 'sell' ? 'SELL' : '';
    const qty = toNum(get(row, 'qty'));
    const value = toNum(get(row, 'value'));
    const ts = parseDate(get(row, 'date'));
    const stock = toText(get(row, 'stock'));
    const symbol = normSymbol(get(row, 'symbol'));
    const isin = toText(get(row, 'isin'));
    const sym = symbol || isin || stock;
    let why = '';
    if (!type) why = 'bad type';
    else if (!(qty > 0)) why = 'bad quantity';
    else if (isNaN(value)) why = 'bad value';
    else if (isNaN(ts)) why = 'bad date';
    else if (!sym) why = 'no symbol';
    if (why) { stats.invalid.push({ row: rowNo, why }); return; }
    const orderId = toText(get(row, 'orderId'));
    const t = {
      key: 't' + trades.length, idx: trades.length, row: rowNo, stock, symbol: sym, sym, isin,
      type, qty, value, price: value / qty, exchange: toText(get(row, 'exchange')),
      orderId, ts, dup: false
    };
    if (orderId) {
      if (seen.has(orderId)) { t.dup = true; stats.dupRows++; }
      else seen.add(orderId);
    }
    trades.push(t);
  });
  return { trades, stats };
}
