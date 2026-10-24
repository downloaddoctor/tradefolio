import { EPS } from './format.js';

export function compute(trades) {
  const groups = new Map();
  trades.forEach((t) => {
    if (!groups.has(t.sym)) groups.set(t.sym, []);
    groups.get(t.sym).push(t);
  });
  const out = [];
  groups.forEach((list, sym) => {
    list.sort((a, b) => a.ts - b.ts || a.idx - b.idx);
    const lots = [];
    const shorts = [];
    const p = {
      key: 'p' + sym, symbol: sym, stock: '', isin: '', buyQty: 0, sellQty: 0, buyVal: 0, sellVal: 0,
      realized: 0, n: list.length, firstBuy: null, first: list[0].ts, last: list[list.length - 1].ts
    };
    list.forEach((t) => {
      if (!p.stock && t.stock) p.stock = t.stock;
      if (!p.isin && t.isin) p.isin = t.isin;
      let rem = t.qty;
      const price = t.price;
      t.closed = false;
      if (t.type === 'BUY') {
        p.buyQty += t.qty;
        p.buyVal += t.value;
        if (p.firstBuy === null) p.firstBuy = t.ts;
        while (rem > EPS && shorts.length) {
          const s = shorts[0];
          const m = Math.min(rem, s.qty);
          p.realized += (s.price - price) * m;
          s.qty -= m;
          rem -= m;
          t.closed = true;
          if (s.qty <= EPS) { s.t.closed = true; shorts.shift(); }
        }
        if (rem > EPS) lots.push({ qty: rem, price, t });
      } else {
        p.sellQty += t.qty;
        p.sellVal += t.value;
        while (rem > EPS && lots.length) {
          const l = lots[0];
          const m = Math.min(rem, l.qty);
          p.realized += (price - l.price) * m;
          l.qty -= m;
          rem -= m;
          t.closed = true;
          if (l.qty <= EPS) { l.t.closed = true; lots.shift(); }
        }
        if (rem > EPS) shorts.push({ qty: rem, price, t });
      }
    });
    const longQty = lots.reduce((a, l) => a + l.qty, 0);
    const shortQty = shorts.reduce((a, s) => a + s.qty, 0);
    const net = Math.round((longQty - shortQty) * 1e6) / 1e6;
    p.net = net;
    p.status = net > 0 ? 'OPEN' : net < 0 ? 'SHORT' : 'CLOSED';
    p.avgBuyAll = p.buyQty ? p.buyVal / p.buyQty : 0;
    p.avgSell = p.sellQty ? p.sellVal / p.sellQty : 0;
    p.fifoCost = lots.reduce((a, l) => a + l.qty * l.price, 0);
    p.fifoQty = longQty;
    p.avgBuy = longQty > EPS ? p.fifoCost / longQty : p.avgBuyAll;
    p.costBasis = p.fifoCost;
    out.push(p);
  });
  return out;
}

export function totalsOf(positions) {
  const open = positions.filter((p) => p.status === 'OPEN');
  return {
    openCount: open.length,
    invested: open.reduce((a, p) => a + p.costBasis, 0),
    realized: positions.reduce((a, p) => a + p.realized, 0),
    shortCount: positions.filter((p) => p.status === 'SHORT').length
  };
}
