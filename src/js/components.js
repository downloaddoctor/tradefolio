export function registerComponents(Alpine) {
  Alpine.data('recoveryCard', () => ({
    get show() {
      const p = this.selPos, c = this.curPrice;
      return !!(p && c && p.net > 0 && p.avgBuy > 0);
    },
    get recovery() {
      const empty = { price: 0, avg: 0, qty: 0, rows: [] };
      if (!this.show) return empty;
      const c = this.curPrice, q = this.selPos.net, a = this.selPos.avgBuy;
      const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((m) => {
        const avg = (a + m * c) / (1 + m);
        const up = (avg / c - 1) * 100;
        return { m, label: 'x' + m, qty: q * m, newQty: q * (1 + m), total: q * a + q * m * c, capital: q * m * c, avg, up: Math.max(up, 0), profit: avg <= c };
      });
      return { price: c, avg: a, qty: q, rows };
    },
    get note() {
      const r = this.recovery;
      return 'Buy more at ' + this.inr(r.price) + ' to lower your avg of ' + this.inr(r.avg) + '. x1 = same qty as now (' + r.qty + ').';
    },
    upText(r) { return r.profit ? 'In profit' : '+' + r.up.toFixed(2) + '%'; },
  }));

  Alpine.data('headerDock', () => ({
    get userBadge() { return this.user ? this.user.slice(0, 2).toUpperCase() : 'ALL'; },
    get userTitle() { return this.user ? 'User: ' + this.user : 'All users'; },
    pickUser(u) { this.user = u; this.userOpen = false; },
    clearWithConfirm() {
      const msg = this.user ? 'Delete all imported data for user ' + this.user + '?' : 'Delete all imported data for ALL users from this browser?';
      if (confirm(msg)) this.clearAll();
    },
  }));

  Alpine.data('alertBox', () => ({
    dismiss() { this.error = ''; },
  }));

  Alpine.data('importPreview', () => ({
    mapText(f) { return f.found ? 'col ' + (f.idx + 1) : 'not found'; },
  }));

  Alpine.data('userModalBox', () => ({
    close() { this.userModal = false; },
  }));

  Alpine.data('positionsSide', () => ({
    plVal(p) { return this.pnlOf(p).live ? this.pnlOf(p).unr : p.realized; },
    plText(p) { const v = this.plVal(p); return (v > 0 ? '+' : '') + this.inr(v); },
    plClass(p) { return this.plVal(p) >= 0 ? 'pos' : 'neg'; },
    plTitle(p) {
      const pl = this.pnlOf(p);
      return (pl.live ? 'Unrealized ' + this.inr(pl.unr) + ' | ' : 'Closed, realized ') + 'Realized ' + this.inr(p.realized) + ' | Total ' + this.inr(pl.total);
    },
    filterLabel(f) { return f.charAt(0).toUpperCase() + f.slice(1); },
  }));

  Alpine.data('summarySide', () => ({
    get title() { return 'Summary - ' + this.posFilter; },
  }));

  Alpine.data('paneHead', () => ({
    get badgeClass() { const s = this.cs.st; return s === 'ok' ? 'ok' : s === 'err' ? 'err' : s === 'warn' ? 'warn' : ''; },
    get badgeText() { const s = this.cs.st; return s === 'ok' ? 'live' : s === 'loading' ? '…' : s === 'err' ? 'no data' : 'cached'; },
    get priceText() { return this.curPrice ? this.inr(this.curPrice) : ''; },
    get avgText() { return this.selPos && this.selPos.avgBuy ? this.inr(this.selPos.avgBuy) : '-'; },
    get unrText() {
      const u = this.unrealized;
      if (u === null) return '';
      const pc = this.unrealizedPct;
      return (u > 0 ? '+' : '') + this.inr(u) + ' (' + (pc > 0 ? '+' : '') + pc.toFixed(2) + '%)';
    },
    get realText() { return this.selPos ? (this.selPos.realized > 0 ? '+' : '') + this.inr(this.selPos.realized) : '-'; },
  }));

  Alpine.data('statGrid', () => ({
    get title() { return this.sel + ' - selected stock'; },
  }));

  Alpine.data('kpiCards', () => ({
    get realText() { return (this.totals.realized > 0 ? '+' : '') + this.inr(this.totals.realized); },
  }));

  Alpine.data('warningsPanel', () => ({}));

  Alpine.data('insightsPanel', () => ({
    icon(i) { return i.tone === 'ok' ? '✓' : i.tone === 'neg' ? '▼' : i.tone === 'warn' ? '!' : 'i'; },
  }));

  Alpine.data('dataSummary', () => ({
    toneClass(i) { return i[2] === 'g' ? 'pos' : i[2] === 'r' ? 'neg' : ''; },
  }));

  Alpine.data('dataTabs', () => ({
    tabCount(t) { return t.k === 'open' ? this.totals.openCount : t.k === 'trades' ? this.activeTrades().length : this.positions.length; },
  }));

  Alpine.data('dataToolbar', () => ({
    resetFilters() { this.fType = ''; this.fSym = ''; this.dFrom = ''; this.dTo = ''; this.q = ''; },
  }));

  Alpine.data('dataTable', () => ({}));
}
