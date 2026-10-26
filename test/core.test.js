import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, toNum, normSymbol, buildTrades, emptyStats } from '../src/js/parse.js';
import { compute, totalsOf } from '../src/js/compute.js';
import { yahooCandidates } from '../src/js/symbols.js';

test('parseDate handles DD-MM-YYYY, ISO, 24h and AM/PM', () => {
  assert.equal(parseDate('05-01-2024 09:20 AM'), Date.UTC(2024, 0, 5, 9, 20, 0));
  assert.equal(parseDate('05-01-2024 02:30 PM'), Date.UTC(2024, 0, 5, 14, 30, 0));
  assert.equal(parseDate('05-01-2024 09:20'), Date.UTC(2024, 0, 5, 9, 20, 0));
  assert.equal(parseDate('05-01-2024 13:45'), Date.UTC(2024, 0, 5, 13, 45, 0));
  assert.equal(parseDate('2024-05-01T09:20:00'), Date.UTC(2024, 4, 1, 9, 20, 0));
  assert.ok(Number.isNaN(parseDate('nope')));
});

test('toNum strips commas and rupee', () => {
  assert.equal(toNum('1,23,456.78'), 123456.78);
  assert.equal(toNum('\u20B9 500'), 500);
  assert.ok(Number.isNaN(toNum('')));
});

test('normSymbol drops .0 suffix on numeric symbols', () => {
  assert.equal(normSymbol(500285), '500285');
  assert.equal(normSymbol('500285.0'), '500285');
  assert.equal(normSymbol('INFY'), 'INFY');
});

test('buildTrades keeps executed rows, replaces repeated orderId with the later row', () => {
  const pv = {
    fileName: 'x.xlsx', sheet: 'T', headerRow: 1,
    colMap: { stock: 0, symbol: 1, isin: -1, type: 2, qty: 3, value: 4, exchange: -1, orderId: 5, date: 6, status: 7 },
    dataRows: [
      ['INFY', 'INFY', 'BUY', 10, 15000, 'A1', '05-01-2024 09:20', 'Executed'],
      ['INFY', 'INFY', 'SELL', 4, 8000, 'A1', '06-01-2024 09:20', 'Executed'],
      ['INFY', 'INFY', 'BUY', 1, 1500, 'A2', '07-01-2024 09:20', 'Rejected']
    ]
  };
  const { trades, stats } = buildTrades(pv);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].type, 'SELL');
  assert.equal(stats.dupRows, 1);
  assert.equal(stats.skippedStatusTotal, 1);
});

test('compute FIFO realizes correctly', () => {
  const t = (i, type, qty, value, day) => ({
    key: 'k' + i, idx: i, sym: 'X', stock: 'X', type, qty, value, price: value / qty,
    ts: Date.UTC(2024, 0, day), orderId: '', exchange: '', isin: '', dup: false
  });
  const list = [t(0, 'BUY', 10, 1000, 1), t(1, 'BUY', 5, 600, 2), t(2, 'SELL', 8, 1200, 3)];
  const [p] = compute(list);
  assert.equal(p.realized, 400);
  assert.equal(p.net, 7);
  assert.equal(p.costBasis, 800);
  assert.equal(p.status, 'OPEN');
  const tot = totalsOf([p]);
  assert.equal(tot.openCount, 1);
  assert.equal(tot.realized, 400);
});

test('yahooCandidates picks .NS then .BO, numeric to .BO', () => {
  assert.deepEqual(yahooCandidates('INFY'), ['INFY.NS', 'INFY.BO']);
  assert.deepEqual(yahooCandidates('500285'), ['500285.BO']);
  assert.deepEqual(yahooCandidates('TCS.NS'), ['TCS.NS']);
  assert.deepEqual(yahooCandidates(''), []);
});

test('buildTrades reads optional Username column', () => {
  const pv = {
    fileName: 'x.xlsx', sheet: 'T', headerRow: 1,
    colMap: { stock: 0, symbol: 1, isin: -1, type: 2, qty: 3, value: 4, exchange: -1, orderId: 5, date: 6, status: 7, user: 8 },
    dataRows: [['INFY', 'INFY', 'BUY', 10, 15000, 'A1', '05-01-2024 09:20', 'Executed', 'alice']]
  };
  const { trades } = buildTrades(pv);
  assert.equal(trades[0].user, 'alice');
});

test('export row date format re-parses to the same timestamp', () => {
  const ts = Date.UTC(2024, 0, 5, 9, 20, 37);
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  const s = p(d.getUTCDate()) + '-' + p(d.getUTCMonth() + 1) + '-' + d.getUTCFullYear() + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
  assert.equal(parseDate(s), ts);
});

test('emptyStats shape', () => {
  const s = emptyStats();
  assert.equal(s.empty, 0);
  assert.deepEqual(s.invalid, []);
});
