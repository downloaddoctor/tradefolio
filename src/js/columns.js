import { INR, NUM, fmtDate } from './format.js';

export const COLS = {
  open: [
    { k: 'symbol', label: 'Symbol', f: 'text' },
    { k: 'stock', label: 'Stock name', f: 'text' },
    { k: 'net', label: 'Open Qty', f: 'oq', n: 1 },
    { k: 'avgBuy', label: 'Avg Buy Price', f: 'inr', n: 1 },
    { k: 'costBasis', label: 'Cost Basis', f: 'inr', n: 1 },
    { k: 'fifoCost', label: 'FIFO Cost', f: 'inr', n: 1 },
    { k: 'firstBuy', label: 'First Buy Date', f: 'date' },
    { k: 'last', label: 'Last Trade Date', f: 'date' },
    { k: 'n', label: '# Trades', f: 'int', n: 1 }
  ],
  trades: [
    { k: 'row', label: 'Row', f: 'int', n: 1 },
    { k: 'ts', label: 'Executed', f: 'date' },
    { k: 'symbol', label: 'Symbol', f: 'text' },
    { k: 'stock', label: 'Stock name', f: 'text' },
    { k: 'isin', label: 'ISIN', f: 'text' },
    { k: 'type', label: 'Type', f: 'type' },
    { k: 'qty', label: 'Quantity', f: 'num', n: 1 },
    { k: 'price', label: 'Price', f: 'inr', n: 1 },
    { k: 'value', label: 'Value', f: 'inr', n: 1 },
    { k: 'exchange', label: 'Exchange', f: 'text' },
    { k: 'orderId', label: 'Exchange Order Id', f: 'text' },
    { k: 'dup', label: 'Dup', f: 'flag' }
  ],
  summary: [
    { k: 'symbol', label: 'Symbol', f: 'text' },
    { k: 'stock', label: 'Stock name', f: 'text' },
    { k: 'status', label: 'Status', f: 'status' },
    { k: 'buyQty', label: 'Buy Qty', f: 'num', n: 1 },
    { k: 'sellQty', label: 'Sell Qty', f: 'num', n: 1 },
    { k: 'avgBuy', label: 'Avg Buy', f: 'inr', n: 1 },
    { k: 'avgSell', label: 'Avg Sell', f: 'inr', n: 1 },
    { k: 'realized', label: 'Realized P&L', f: 'pnl', n: 1 },
    { k: 'net', label: 'Net Qty', f: 'num', n: 1 },
    { k: 'n', label: '# Trades', f: 'int', n: 1 }
  ]
};

export function cell(r, c) {
  const v = r[c.k];
  switch (c.f) {
    case 'inr': return v == null ? '-' : INR.format(v);
    case 'pnl': return INR.format(v || 0);
    case 'num': return NUM.format(v || 0);
    case 'int': return v == null ? '-' : String(v);
    case 'date': return fmtDate(v);
    case 'oq': return r.status === 'SHORT' ? 'SHORT ' + NUM.format(v) : NUM.format(v);
    case 'flag': return v ? 'DUP' : '';
    default: return v == null || v === '' ? '-' : String(v);
  }
}

// classes are defined in css/style.css
export function cellClass(r, c) {
  let cls = 'cell' + (c.n ? ' num' : '');
  const v = r[c.k];
  if (c.f === 'pnl') cls += v >= 0 ? ' pos' : ' neg';
  if (c.f === 'type') cls += v === 'BUY' ? ' pos medium' : ' neg medium';
  if (c.f === 'oq' && r.status === 'SHORT') cls += ' neg semibold';
  if (c.f === 'flag') cls += ' amber medium';
  if (c.f === 'status') cls += v === 'OPEN' ? ' accent medium' : v === 'SHORT' ? ' neg medium' : ' dim medium';
  return cls;
}
