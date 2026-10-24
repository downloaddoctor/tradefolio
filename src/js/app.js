import { INR, norm, fmtDate } from './format.js';
import { parseWorkbook, buildTrades, emptyStats } from './parse.js';
import { compute, totalsOf } from './compute.js';
import { saveImport, saveTrades, findImport, newImportId, loadDataset, clearDataset } from './db.js';
import { COLS, cell, cellClass } from './columns.js';
import { downloadSample } from './sample.js';
import { drawSymbolChart, destroyChart } from './chart.js';
import { getCandles, loadCorsKey, saveCorsKey as saveCorsKeyFn } from './market.js';

async function sha256(buf) {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function app() {
  return {
    drag: false, error: '', preview: null,
    trades: [], positions: [], stats: emptyStats(),
    totals: { openCount: 0, invested: 0, realized: 0, shortCount: 0 },
    dedupe: false, view: 'open', showAll: false, user: '', uname: '', hideShort: false, shortN: 0, shortSet: {}, shortList: [], fixPrice: {},
    q: '', fType: '', fSym: '', dFrom: '', dTo: '',
    sorts: { open: { k: 'costBasis', d: -1 }, trades: { k: 'ts', d: -1 }, summary: { k: 'realized', d: -1 } },
    pane: 'data', keyOpen: false, userOpen: false, userModal: false,
    tabs: [{ k: 'open', label: 'Open Positions' }, { k: 'trades', label: 'All Trades' }, { k: 'summary', label: 'Closed / Summary' }],

    setPane(p) {
      this.pane = p;
      this.syncHash();
    },
    hashSym: '', flagKeys: { closedOnly: 'c', hideBuys: 'b', hideSells: 's', hideLines: 'l', hideVolume: 'v' },
    parseHash() {
      const [path, qs] = location.hash.split('?');
      const m = path.match(/^#chart(?:\/(.+))?$/);
      this.pane = m ? 'chart' : 'data';
      this.hashSym = m && m[1] ? decodeURIComponent(m[1]) : '';
      const f = new URLSearchParams(qs || '').get('f');
      this.posFilter = ['open', 'closed'].includes(f) ? f : 'all';
      const so = new URLSearchParams(qs || '').get('s');
      this.posSort = ['unr', 'pnl', 'pct', 'realized', 'value', 'symbol'].includes(so) ? so : 'default';
      const x = new URLSearchParams(qs || '').get('x') || '';
      Object.keys(this.flagKeys).forEach((k) => { this[k] = x.includes(this.flagKeys[k]); });
    },
    hashQuery() {
      const q = [];
      if (this.posFilter !== 'all') q.push('f=' + this.posFilter);
      if (this.posSort !== 'default') q.push('s=' + this.posSort);
      const x = Object.keys(this.flagKeys).filter((k) => this[k]).map((k) => this.flagKeys[k]).join('');
      if (x) q.push('x=' + x);
      return q.length ? '?' + q.join('&') : '';
    },
    syncHash() {
      const h = this.pane === 'chart' ? '#chart' + (this.sel ? '/' + encodeURIComponent(this.sel) : '') + this.hashQuery() : '#' + this.pane;
      if (location.hash !== h) history.replaceState(null, '', h);
    },
    async init() {
      this.parseHash();
      window.addEventListener('hashchange', () => {
        this.parseHash();
        if (this.sel) this.paint();
        if (this.hashSym && this.hashSym !== this.sel && this.positions.some((p) => p.symbol === this.hashSym)) this.openSymbol(this.hashSym);
      });
      this.$watch('dedupe', () => this.recompute());
      this.$watch('hideShort', () => { this.recompute(); this.showAll = false; });
      this.$watch('user', () => { this.recompute(); this.fSym = ''; this.showAll = false; });
      this.$watch('view', () => { this.showAll = false; });
      this.$watch('posSort', () => this.syncHash());
      this.$watch('posFilter', () => this.syncHash());
      this.corsKey = loadCorsKey();
      try {
        const d = await loadDataset();
        if (d) {
          this.trades = d.trades;
          this.stats = d.stats;
          this.recompute();
        }
      } catch (e) {
        this.error = 'Could not load saved data: ' + e.message;
      }
    },

    get users() {
      const u = Array.from(new Set(this.trades.map((t) => t.user).filter(Boolean))).sort();
      return this.trades.some((t) => !t.user) ? ['(unassigned)'].concat(u) : u;
    },
    inr(v) { return INR.format(v || 0); },
    sample() { downloadSample(); },

    sel: null,
    get selPos() { return this.sel ? this.positions.find((p) => p.symbol === this.sel) || null : null; },
    get selTrades() { return this.sel ? this.activeTrades().filter((t) => t.symbol === this.sel) : []; },
    corsKey: '',
    get hasKey() { return !!this.corsKey; },
    candles: null, mkt: '', cs: { st: 'idle', msg: '' },
    showTrades: true, closedOnly: false, hideBuys: false, hideSells: false, hideVolume: false, posFilter: 'all', posSort: 'default', fetched: {}, prices: {}, pricesBusy: false,
    pnlOf(p) {
      const px = this.prices[p.symbol];
      const live = p.net > 0 && !!px;
      const unr = live ? (px - p.avgBuy) * p.net : 0;
      const total = p.realized + unr;
      return { live, unr, total, pct: p.buyVal ? total / p.buyVal * 100 : null };
    },
    async refreshPrices() {
      if (this.pricesBusy) return;
      this.pricesBusy = true;
      try {
        for (const p of this.positions.filter((x) => x.status === 'OPEN')) {
          if (this.fetched[p.symbol]) continue;
          try {
            this.fetched[p.symbol] = 1;
            const r = await getCandles(p.symbol, p.first, Date.now(), '', false);
            const c = r.candles;
            if (c && c.length) this.prices = { ...this.prices, [p.symbol]: c[c.length - 1].close };
          } catch (e) { }
        }
      } finally { this.pricesBusy = false; }
    },
    liveRows(l) {
      const open = l.filter((p) => p.status === 'OPEN');
      const priced = open.filter((p) => this.prices[p.symbol]);
      if (!open.length) return [];
      const mv = priced.reduce((a, p) => a + this.prices[p.symbol] * p.net, 0);
      const cost = priced.reduce((a, p) => a + p.costBasis, 0);
      const unr = mv - cost;
      const unrPct = cost ? unr / cost * 100 : null;
      const real = l.reduce((a, p) => a + p.realized, 0);
      const bought = l.reduce((a, p) => a + p.buyVal, 0);
      const total = real + unr;
      const totPct = bought ? total / bought * 100 : null;
      const sg = (v) => (v > 0 ? '+' : '') + this.inr(v);
      const pc = (v) => (v === null ? '-' : (v > 0 ? '+' : '') + v.toFixed(2) + '%');
      const tone = (v) => (v === null || v === 0 ? '' : v > 0 ? 'pos' : 'neg');
      return [
        ['Live prices', priced.length + ' / ' + open.length + (this.pricesBusy ? ' (loading...)' : ''), ''],
        ['Market value (live)', this.inr(mv), ''],
        ['Unrealized P&L (live)', sg(unr) + ' (' + pc(unrPct) + ')', tone(unr)],
        ['Total P&L (real + live)', sg(total), tone(total)],
        ['Total ROI (live)', pc(totPct), tone(totPct)]
      ];
    }, hideLines: false,
    get curPrice() {
      const c = this.candles;
      return c && c.length ? c[c.length - 1].close : null;
    },
    get selStats() {
      const p = this.selPos;
      if (!p) return [];
      const cur = this.curPrice, c = this.candles || [];
      const pct = (a, b) => (b ? a / b * 100 : null);
      const f = (v) => (v === null ? '-' : (v > 0 ? '+' : '') + v.toFixed(2) + '%');
      const s = (v) => (v > 0 ? '+' : '') + this.inr(v);
      const t = (v) => (v === null || v === undefined ? '' : v >= 0 ? 'pos' : 'neg');
      const open = p.net > 0;
      const unr = open && cur ? (cur - p.avgBuy) * p.net : null;
      const unrPct = unr === null ? null : pct(unr, p.costBasis);
      const total = p.realized + (unr || 0);
      const prev = c.length > 1 ? c[c.length - 2].close : null;
      const dayChg = cur && prev ? cur - prev : null;
      const hi = c.length ? Math.max(...c.map((x) => x.high)) : null;
      const lo = c.length ? Math.min(...c.map((x) => x.low)) : null;
      const vsAvg = open && cur ? pct(cur - p.avgBuy, p.avgBuy) : null;
      const rows = [
        ['Current price', cur ? this.inr(cur) : '-', ''],
        ['Day change', dayChg === null ? '-' : s(dayChg) + ' (' + f(pct(dayChg, prev)) + ')', t(dayChg)],
        ['Status', p.status + ' / qty ' + p.net, ''],
        ['Avg buy (held)', open ? this.inr(p.avgBuy) : '-', ''],
        ['Price vs avg buy', f(vsAvg), t(vsAvg)],
        ['Invested (open cost)', open ? this.inr(p.costBasis) : '-', ''],
        ['Market value', open && cur ? this.inr(cur * p.net) : '-', ''],
        ['Unrealized P&L', unr === null ? '-' : s(unr) + ' (' + f(unrPct) + ')', t(unr)],
        ['Realized P&L', s(p.realized) + ' (' + f(pct(p.realized, p.buyVal)) + ' of bought)', t(p.realized)],
        ['Total P&L', s(total) + ' (' + f(pct(total, p.buyVal)) + ' of bought)', t(total)],
        ['Total bought', this.inr(p.buyVal) + ' / ' + p.buyQty + ' qty', ''],
        ['Total sold', this.inr(p.sellVal) + ' / ' + p.sellQty + ' qty', ''],
        ['Avg sell', p.sellQty ? this.inr(p.avgSell) : '-', ''],
        ['Period high', hi === null ? '-' : this.inr(hi) + (cur ? ' (' + f(pct(cur - hi, hi)) + ')' : ''), hi !== null && cur ? t(cur - hi) : ''],
        ['Period low', lo === null ? '-' : this.inr(lo) + (cur ? ' (' + f(pct(cur - lo, lo)) + ')' : ''), ''],
        ['Trades', String(p.n), '']
      ];
      return rows;
    },
    get unrealizedPct() {
      const p = this.selPos, u = this.unrealized;
      return p && u !== null && p.costBasis ? u / p.costBasis * 100 : 0;
    },
    get unrealized() {
      const p = this.selPos, cur = this.curPrice;
      if (!p || !cur || !(p.net > 0)) return null;
      return (cur - p.avgBuy) * p.net;
    },
    toggleFilter(k) { this[k] = !this[k]; this.syncHash(); this.paint(); }, paint() {
      let trades = this.selTrades.map((t) => ({ ...t }));
      if (this.closedOnly) trades = trades.filter((t) => !t.closed);
      this.$nextTick(() => drawSymbolChart(this.$refs.chart, trades, this.candles, this.hideLines ? null : this.selPos, { hideBuys: this.hideBuys, hideSells: this.hideSells, hideVolume: this.hideVolume, allTrades: this.selTrades.map((t) => ({ ...t })) }));
    },
    get filterSummary() {
      const l = this.sideList;
      if (!l.length) return [];
      const sum = (k) => l.reduce((a, p) => a + p[k], 0);
      const bought = sum('buyVal'), sold = sum('sellVal'), real = sum('realized');
      const inv = l.filter((p) => p.status === 'OPEN').reduce((a, p) => a + p.costBasis, 0);
      const win = l.filter((p) => p.realized > 0).length, loss = l.filter((p) => p.realized < 0).length;
      const roi = bought ? real / bought * 100 : null;
      const sg = (v) => (v > 0 ? '+' : '') + this.inr(v);
      const tone = (v) => (v === null || v === 0 ? '' : v > 0 ? 'pos' : 'neg');
      const best = l.reduce((a, p) => (!a || p.realized > a.realized ? p : a), null);
      const worst = l.reduce((a, p) => (!a || p.realized < a.realized ? p : a), null);
      return [
        ['Positions', String(l.length), ''],
        ...this.liveRows(l),
        ['Invested (open)', this.inr(inv), ''],
        ['Total bought', this.inr(bought), ''],
        ['Total sold', this.inr(sold), ''],
        ['Realized P&L', sg(real), tone(real)],
        ['ROI', roi === null ? '-' : (roi > 0 ? '+' : '') + roi.toFixed(2) + '%', tone(roi)],
        ['Win / Loss', win + ' / ' + loss + (win + loss ? ' (' + Math.round(win / (win + loss) * 100) + '%)' : ''), ''],
        ['Best', best ? best.symbol + ' ' + sg(best.realized) : '-', best ? tone(best.realized) : ''],
        ['Worst', worst ? worst.symbol + ' ' + sg(worst.realized) : '-', worst ? tone(worst.realized) : '']
      ];
    },
    get sideList() {
      const q = norm(this.q);
      const pf = this.posFilter;
      const list = this.positions.filter((p) => (pf === 'all' || (pf === 'open' ? p.status === 'OPEN' : p.status === 'CLOSED')) && (!q || norm(p.symbol).includes(q) || norm(p.stock).includes(q)));
      const k = this.posSort;
      if (k === 'symbol') return list.slice().sort((a, b) => a.symbol.localeCompare(b.symbol));
      const val = (p) => (k === 'unr' ? (this.pnlOf(p).live ? this.pnlOf(p).unr : -Infinity) : k === 'pnl' ? this.pnlOf(p).total : k === 'pct' ? (this.pnlOf(p).pct ?? -Infinity) : k === 'realized' ? p.realized : k === 'value' ? p.costBasis : 0);
      if (k !== 'default') return list.slice().sort((a, b) => { const x = val(a), y = val(b); return x === y ? 0 : y > x ? 1 : -1; });
      return list.slice().sort((a, b) => (b.status === 'OPEN') - (a.status === 'OPEN') || b.n - a.n);
    },
    pick(sym) { if (sym !== this.sel) this.openSymbol(sym); },
    async openSymbol(sym) {
      if (!sym) return;
      this.sel = sym;
      this.hashSym = sym;
      this.syncHash();
      this.mkt = '';
      this.candles = null;
      await this.loadCandles(false);
    },
    async loadCandles(force) {
      const sym = this.sel;
      if (!sym) return;
      this.cs = { st: 'loading', msg: 'Loading daily candles...' };
      this.paint();
      const first = Math.min(...this.selTrades.map((t) => t.ts));
      try {
        const fr = !!force;
        this.fetched[sym] = 1;
        const r = await getCandles(sym, first, Date.now(), this.mkt.trim(), fr);
        if (this.sel !== sym) return;
        this.candles = r.candles;
        if (r.candles.length) this.prices = { ...this.prices, [sym]: r.candles[r.candles.length - 1].close };
        this.cs = {
          st: r.stale ? 'warn' : 'ok',
          msg: r.ysym + ' - ' + r.candles.length + ' daily candles' + (r.stale ? ' (cached, refresh failed)' : r.cached ? ' (cached)' : '')
        };
      } catch (e) {
        if (this.sel !== sym) return;
        this.candles = null;
        this.cs = { st: 'err', msg: 'Market data unavailable (' + e.message + '). Showing your trade prices only. Try a ticker like RELIANCE.NS.' };
      }
      this.paint();
    },
    closeSymbol() { destroyChart(); this.sel = null; this.hashSym = ''; this.candles = null; this.syncHash(); },
    saveCorsKey() {
      const k = this.corsKey.trim();
      this.corsKey = k;
      saveCorsKeyFn(k);
      this.cs = { st: k ? 'ok' : 'warn', msg: k ? 'corsproxy.io key saved' : 'No corsproxy.io key - proxy may reject requests' };
      if (this.sel) this.loadCandles(true);
    },
    clearCorsKey() {
      this.corsKey = '';
      saveCorsKeyFn('');
      this.cs = { st: 'warn', msg: 'corsproxy.io key cleared' };
      if (this.sel) this.loadCandles(true);
    },
    cell, cellClass,


    onFile(e) {
      const f = e.target.files && e.target.files[0];
      if (f) this.readFile(f);
      e.target.value = '';
    },
    onDrop(e) {
      this.drag = false;
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) this.readFile(f);
    },
    readFile(file) {
      this.error = '';
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { this.error = 'Unsupported file type. Use .xlsx, .xls or .csv.'; return; }
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const hash = await sha256(reader.result);
          this.preview = parseWorkbook(reader.result, file.name);
          this.uname = this.user;
          this.preview.hash = hash;
        } catch (err) { this.error = err.message; }
      };
      reader.onerror = () => { this.error = 'Could not read file.'; };
      reader.readAsArrayBuffer(file);
    },
    cancelPreview() { this.preview = null; },

    askUser() {
      if (!this.preview) return;
      this.uname = this.user;
      this.error = '';
      this.userModal = true;
    },

    async confirmImport() {
      this.userModal = false;
      if (!this.preview) return;
      const { trades, stats } = buildTrades(this.preview);
      const hash = this.preview.hash;
      const user = this.uname.trim();
      if (!user) { this.error = 'Enter a username for this import.'; return; }
      const prev = await findImport(hash, user);
      if (prev) { this.error = 'Already imported for ' + user + ' as ' + prev.id + ' (' + prev.file + ', ' + prev.importedAt + ').'; return; }
      this.preview = null;
      if (!trades.length) { this.error = 'No valid executed trades found in the file.'; return; }
      try {
        const id = await newImportId();
        const base = this.trades.reduce((m, t) => Math.max(m, t.idx + 1), 0);
        const added = trades.map((t) => ({ ...t, key: id + ':' + t.key, idx: base + t.idx, imp: id, user }));
        stats.file = stats.file + ' [' + id + ']';
        await saveImport(id, hash, user, added, stats);
        this.user = user;
        this.trades = this.trades.concat(added);
        this.stats = stats;
        this.error = '';
        this.dedupe = false;
        this.recompute();
      } catch (e) { this.error = 'Could not save to IndexedDB: ' + e.message; }
    },


    mkFix(s) {
      const px = Number(this.fixPrice[s.symbol]) > 0 ? Number(this.fixPrice[s.symbol]) : s.guess;
      const first = this.baseTrades().filter((t) => t.sym === s.symbol).sort((a, b) => a.ts - b.ts || a.idx - b.idx)[0];
      const base = this.trades.reduce((m, t) => Math.max(m, t.idx + 1), 0);
      return { ...first, key: 'fix:' + s.symbol + ':' + Date.now(), idx: base, row: 0, type: 'BUY', qty: s.missing, price: px, value: s.missing * px, orderId: '', ts: first.ts - 86400000, dup: false, imp: 'fix', user: first.user };
    },
    async fixApply(list) {
      if (!list.length) return;
      try {
        const add = list.map((s, i) => { const t = this.mkFix(s); t.key += ':' + i; t.idx += i; return t; });
        await saveTrades(add);
        this.trades = this.trades.concat(add);
        this.recompute();
      } catch (e) { this.error = 'Could not save fix: ' + e.message; }
    },
    fixShort(sym) { return this.fixApply(this.shortList.filter((s) => s.symbol === sym)); },
    fixAllShorts() { return this.fixApply(this.shortList.slice()); },
    baseTrades() {
      const list = this.user ? this.trades.filter((t) => (this.user === '(unassigned)' ? !t.user : t.user === this.user)) : this.trades;
      return this.dedupe ? list.filter((t) => !t.dup) : list;
    },
    activeTrades() {
      const list = this.baseTrades();
      return this.hideShort ? list.filter((t) => !this.shortSet[t.symbol]) : list;
    },
    recompute() {
      const all = compute(this.baseTrades());
      const set = {};
      all.forEach((p) => { if (p.status === 'SHORT') set[p.symbol] = 1; });
      this.shortSet = set;
      this.shortN = Object.keys(set).length;
      const bt = this.baseTrades();
      this.shortList = all.filter((p) => p.status === 'SHORT').map((p) => {
        const sells = bt.filter((t) => t.sym === p.symbol && t.type === 'SELL').sort((a, b) => a.ts - b.ts);
        return { symbol: p.symbol, missing: Math.round(-p.net * 1e6) / 1e6, guess: sells.length ? Math.round(sells[0].price * 100) / 100 : 0 };
      });
      this.positions = this.hideShort ? all.filter((p) => !set[p.symbol]) : all;
      this.totals = totalsOf(this.positions);
      this.refreshPrices();
      if (this.sel && !this.positions.some((p) => p.symbol === this.sel)) this.sel = null;
      if (!this.sel) {
        const pick = this.positions.find((p) => p.symbol === this.hashSym) || this.positions.find((p) => p.status === 'OPEN') || this.positions[0];
        if (pick) this.openSymbol(pick.symbol);
      }
    },
    async clearAll() {
      const user = this.user;
      await clearDataset(user);
      this.trades = user ? this.trades.filter((t) => (user === '(unassigned)' ? !!t.user : t.user !== user)) : [];
      if (!this.trades.length) this.stats = emptyStats();
      this.user = '';
      this.recompute();
    },

    warningCount() {
      const s = this.stats;
      return s.empty + s.skippedStatusTotal + s.invalid.length + s.dupRows + this.shortN;
    },
    statusSummary() {
      const s = this.stats.skippedStatus;
      return Object.keys(s).map((k) => k + ' (' + s[k] + ')').join(', ');
    },
    invalidSummary() {
      return this.stats.invalid.slice(0, 5).map((x) => 'row ' + x.row + ' ' + x.why).join('; ') + (this.stats.invalid.length > 5 ? '; ...' : '');
    },

    get cols() { return COLS[this.view]; },
    get showData() { return this.pane === 'data'; },
    get showChart() { return this.pane === 'chart'; },
    get symbolList() {
      const set = {};
      this.activeTrades().forEach((t) => { set[t.symbol] = 1; });
      return Object.keys(set).sort();
    },
    get rows() {
      const q = norm(this.q);
      const match = (r) => !q || norm(r.symbol).includes(q) || norm(r.stock).includes(q) || norm(r.isin).includes(q);
      let list;
      if (this.view === 'trades') {
        const from = this.dFrom ? Date.parse(this.dFrom) : null;
        const to = this.dTo ? Date.parse(this.dTo) + 86400000 - 1 : null;
        list = this.activeTrades().filter((t) =>
          match(t) && (!this.fType || t.type === this.fType) && (!this.fSym || t.symbol === this.fSym) &&
          (from === null || t.ts >= from) && (to === null || t.ts <= to));
      } else if (this.view === 'open') {
        list = this.positions.filter((p) => p.status !== 'CLOSED' && match(p));
      } else {
        list = this.positions.filter(match);
      }
      const s = this.sorts[this.view];
      return list.slice().sort((a, b) => {
        let va = a[s.k], vb = b[s.k];
        if (va == null) va = typeof vb === 'number' ? -Infinity : '';
        if (vb == null) vb = typeof va === 'number' ? -Infinity : '';
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * s.d;
        if (typeof va === 'boolean') return ((va ? 1 : 0) - (vb ? 1 : 0)) * s.d;
        return String(va).localeCompare(String(vb), undefined, { numeric: true }) * s.d;
      });
    },
    get insights() {
      const P = this.positions, out = [];
      if (!P.length) return out;
      const open = P.filter((p) => p.status === 'OPEN');
      const inv = open.reduce((a, p) => a + p.costBasis, 0);
      const pc = (v) => v.toFixed(1) + '%';
      const sg = (v) => (v > 0 ? '+' : '') + this.inr(v);
      if (inv > 0) {
        const top = open.slice().sort((a, b) => b.costBasis - a.costBasis)[0];
        const share = top.costBasis / inv * 100;
        out.push(share > 25
          ? { tone: 'warn', text: 'Concentration: ' + top.symbol + ' is ' + pc(share) + ' of your open cost. Consider whether one stock should carry this much risk.' }
          : { tone: 'ok', text: 'Well spread: your largest holding ' + top.symbol + ' is ' + pc(share) + ' of open cost.' });
      }
      open.forEach((p) => {
        const px = this.prices[p.symbol];
        if (!px || !(p.avgBuy > 0)) return;
        const d = (px - p.avgBuy) / p.avgBuy * 100;
        if (d <= -20) out.push({ tone: 'neg', text: p.symbol + ' is ' + pc(Math.abs(d)) + ' below your avg buy (' + sg((px - p.avgBuy) * p.net) + ' unrealized).' });
      });
      const wins = P.filter((p) => p.realized > 0), losses = P.filter((p) => p.realized < 0);
      if (wins.length + losses.length) {
        const gw = wins.reduce((a, p) => a + p.realized, 0), gl = -losses.reduce((a, p) => a + p.realized, 0);
        const rate = wins.length / (wins.length + losses.length) * 100;
        const aw = wins.length ? gw / wins.length : 0, al = losses.length ? gl / losses.length : 0;
        out.push({ tone: rate >= 50 ? 'ok' : 'warn', text: 'Win rate ' + pc(rate) + ' (' + wins.length + ' winners, ' + losses.length + ' losers). Avg win ' + this.inr(aw) + ' vs avg loss ' + this.inr(al) + (gl > 0 ? '. Profit factor ' + (gw / gl).toFixed(2) + '.' : '.') });
        const best = wins.slice().sort((a, b) => b.realized - a.realized)[0];
        const worst = losses.slice().sort((a, b) => a.realized - b.realized)[0];
        if (best) out.push({ tone: 'ok', text: 'Best realized: ' + best.symbol + ' ' + sg(best.realized) + '.' });
        if (worst) out.push({ tone: 'neg', text: 'Worst realized: ' + worst.symbol + ' ' + sg(worst.realized) + '.' });
      }
      const held = open.filter((p) => p.firstBuy).sort((a, b) => a.firstBuy - b.firstBuy)[0];
      if (held) out.push({ tone: '', text: 'Longest held: ' + held.symbol + ' for ' + Math.floor((Date.now() - held.firstBuy) / 864e5) + ' days.' });
      return out;
    },
    get overview() { const t = this.activeTrades(), P = this.positions, S = (a, f) => a.reduce((s, x) => s + f(x), 0), B = t.filter((x) => x.type === 'BUY'), L = t.filter((x) => x.type === 'SELL'), W = P.filter((p) => p.realized > 0), X = P.filter((p) => p.realized < 0), O = P.filter((p) => p.status === 'OPEN'), SH = P.filter((p) => p.status === 'SHORT'), C = P.filter((p) => p.status === 'CLOSED'), R = P.slice().sort((a, b) => b.realized - a.realized), ts = t.map((x) => x.ts), days = new Set(t.map((x) => new Date(x.ts).toDateString())).size, top = P.slice().sort((a, b) => b.n - a.n)[0], big = O.slice().sort((a, b) => b.costBasis - a.costBasis)[0], dec = W.length + X.length, gp = S(W, (p) => p.realized), gl = -S(X, (p) => p.realized), bv = S(B, (x) => x.value), sv = S(L, (x) => x.value), ex = {}; t.forEach((x) => { const k = x.exchange || '-'; ex[k] = (ex[k] || 0) + 1; }); const pl = (v) => (v > 0 ? '+' : '') + this.inr(v); const tone = (v) => (v > 0 ? 'g' : v < 0 ? 'r' : ''); const best = R[0] && R[0].realized > 0 ? R[0] : null; const worst = R.length && R[R.length - 1].realized < 0 ? R[R.length - 1] : null; return [['Total trades', t.length, ''], ['Buys / Sells', B.length + ' / ' + L.length, ''], ['Buy value', this.inr(bv), ''], ['Sell value', this.inr(sv), ''], ['Turnover', this.inr(bv + sv), ''], ['Avg trade value', t.length ? this.inr((bv + sv) / t.length) : '-', ''], ['Symbols traded', P.length, ''], ['Open / Closed / Short', O.length + ' / ' + C.length + ' / ' + SH.length, ''], ['Invested (open cost)', this.inr(this.totals.invested), ''], ['Realized P&L (FIFO)', pl(this.totals.realized), tone(this.totals.realized)], ['Winners / Losers', W.length + ' / ' + X.length, ''], ['Win rate', dec ? (W.length / dec * 100).toFixed(1) + '%' : '-', ''], ['Avg win', W.length ? pl(gp / W.length) : '-', W.length ? 'g' : ''], ['Avg loss', X.length ? pl(-gl / X.length) : '-', X.length ? 'r' : ''], ['Profit factor', gl ? (gp / gl).toFixed(2) : '-', ''], ['Best symbol', best ? best.symbol + ' ' + pl(best.realized) : '-', best ? 'g' : ''], ['Worst symbol', worst ? worst.symbol + ' ' + pl(worst.realized) : '-', worst ? 'r' : ''], ['Largest open position', big ? big.symbol + ' ' + this.inr(big.costBasis) : '-', ''], ['Most traded', top ? top.symbol + ' (' + top.n + ')' : '-', ''], ['Date range', ts.length ? fmtDate(Math.min(...ts)) + ' to ' + fmtDate(Math.max(...ts)) : '-', ''], ['Trading days', days, ''], ['Trades per day', days ? (t.length / days).toFixed(1) : '-', ''], ['Exchanges', Object.keys(ex).map((k) => k + ' ' + ex[k]).join(', ') || '-', ''], ['Imports / Users', new Set(t.map((x) => x.imp)).size + ' / ' + new Set(t.map((x) => x.user || '(unassigned)')).size, ''], ['Duplicate rows', t.filter((x) => x.dup).length, '']]; },
    get shown() { return this.showAll ? this.rows : this.rows.slice(0, 1000); }, get openSum() { const r = this.view === 'open' ? this.rows : []; return { n: r.length, qty: r.reduce((a, p) => a + p.net, 0), cost: r.reduce((a, p) => a + p.costBasis, 0), fifo: r.reduce((a, p) => a + p.fifoCost, 0) }; },

    sortBy(k) {
      const s = this.sorts[this.view];
      if (s.k === k) s.d = -s.d; else { s.k = k; s.d = 1; }
    },
    sortMark(k) {
      const s = this.sorts[this.view];
      return s.k === k ? (s.d === 1 ? '\u25B2' : '\u25BC') : '';
    },

    exportView(fmt) {
      const cols = this.cols;
      const data = this.rows.map((r) => {
        const o = {};
        cols.forEach((c) => {
          let v = r[c.k];
          if (c.f === 'date') v = fmtDate(v);
          else if (c.f === 'flag') v = v ? 'DUP' : '';
          o[c.label] = v == null ? '' : v;
        });
        return o;
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), this.view);
      XLSX.writeFile(wb, 'tradefolio-' + this.view + '.' + fmt);
    }
  };
}
