import { emptyStats } from './parse.js';

const db = new Dexie('tradefolio');
db.version(1).stores({
  trades: 'key,symbol,ts',
  meta: 'id',
  candles: 'sym',
  imports: 'id,hash,user'
});

export async function findImport(hash, user) {
  return (await db.imports.where('hash').equals(hash).and((i) => i.user === user).first()) || null;
}

export async function newImportId() {
  const ch = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (; ;) {
    let id = '';
    for (let i = 0; i < 3; i++) id += ch[Math.floor(Math.random() * ch.length)];
    if (!(await db.imports.get(id))) return id;
  }
}

export async function saveImport(id, hash, user, trades, stats, removeKeys) {
  await db.transaction('rw', db.trades, db.meta, db.imports, async () => {
    if (removeKeys && removeKeys.length) await db.trades.bulkDelete(removeKeys);
    await db.trades.bulkPut(plain(trades));
    await db.imports.put({ id, hash, user, file: stats.file, importedAt: stats.importedAt, count: trades.length });
    await db.meta.put({ id: 'stats', value: plain(stats) });
  });
}

export async function saveTrades(trades) {
  await db.trades.bulkPut(plain(trades));
}

export async function saveCandles(sym, ysym, candles) {
  await db.candles.put({ sym, ysym, candles, fetchedAt: Date.now() });
}

export async function loadCandles(sym) {
  return (await db.candles.get(sym)) || null;
}

function plain(v) {
  return JSON.parse(JSON.stringify(v));
}

export async function saveDataset(trades, stats) {
  await db.transaction('rw', db.trades, db.meta, async () => {
    await db.trades.clear();
    await db.trades.bulkPut(plain(trades));
    await db.meta.put({ id: 'stats', value: plain(stats) });
  });
}

export async function loadDataset() {
  const trades = await db.trades.toArray();
  if (!trades.length) return null;
  trades.sort((a, b) => a.idx - b.idx);
  const meta = await db.meta.get('stats');
  return { trades, stats: meta ? meta.value : emptyStats() };
}

export async function saveStats(stats) {
  await db.meta.put({ id: 'stats', value: plain(stats) });
}

export async function clearDataset(user) {
  await db.transaction('rw', db.trades, db.meta, db.imports, async () => {
    if (!user) {
      await db.trades.clear();
      await db.meta.clear();
      await db.imports.clear();
      return;
    }
    await db.trades.filter((t) => (user === '(unassigned)' ? !t.user : t.user === user)).delete();
    if (user !== '(unassigned)') await db.imports.where('user').equals(user).delete();
    if (!(await db.trades.count())) await db.meta.clear();
  });
}
