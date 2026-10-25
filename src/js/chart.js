let chart = null;
let ro = null;

const dayOf = (ts) => new Date(ts).toISOString().slice(0, 10);
const sec = (ts) => Math.floor(ts / 1000);

export function destroyChart() {
  if (ro) { ro.disconnect(); ro = null; }
  if (chart) { chart.remove(); chart = null; }
}

function themeColors() {
  const root = getComputedStyle(document.documentElement);
  const v = (n, fb) => (root.getPropertyValue(n) || '').trim() || fb;
  return { up: v('--pos', '#34d399'), down: v('--neg', '#f87171') };
}

function withAlpha(hex, a) {
  const s = hex.replace('#', '');
  const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

function snap(candles, day) {
  let lo = 0, hi = candles.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time <= day) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return candles[ans].time;
}

export function drawSymbolChart(el, trades, candles, pos, opt = {}) {
  destroyChart();
  if (!el || typeof LightweightCharts === 'undefined') return;
  const txt = '#cbd5e1';
  const grid = 'rgba(148,163,184,.12)';
  const { up, down } = themeColors();
  const list = (opt.allTrades || trades).slice().sort((a, b) => a.ts - b.ts || a.idx - b.idx);
  const vis = new Set(trades.map((t) => t.key));
  const hid = (t) => !vis.has(t.key) || (t.type === 'BUY' ? opt.hideBuys : opt.hideSells);

  chart = LightweightCharts.createChart(el, {
    width: el.clientWidth,
    height: el.clientHeight,
    layout: { background: { color: 'transparent' }, textColor: txt },
    grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    rightPriceScale: { borderColor: grid },
    timeScale: { borderColor: grid, timeVisible: false },
    crosshair: { mode: 0 }
  });

  const mk = (t, time) => ({
    time,
    position: t.type === 'BUY' ? 'belowBar' : 'aboveBar',
    shape: t.type === 'BUY' ? 'arrowUp' : 'arrowDown',
    color: t.type === 'BUY' ? up : down,
    text: (t.type === 'BUY' ? 'B ' : 'S ') + t.qty + ' @ ' + (Math.round(t.price * 100) / 100)
  });

  if (candles && candles.length) {
    const cs = chart.addCandlestickSeries({
      upColor: up, downColor: down, borderVisible: false,
      wickUpColor: up, wickDownColor: down
    });
    cs.setData(candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    const vol = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' } });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.applyOptions({ visible: !opt.hideVolume });
    vol.setData(candles.map((c) => ({
      time: c.time, value: c.volume,
      color: c.close >= c.open ? withAlpha(up, 0.3) : withAlpha(down, 0.3)
    })));
    const marks = list.filter((t) => !hid(t)).map((t) => mk(t, snap(candles, dayOf(t.ts))));
    marks.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    cs.setMarkers(marks);
    if (pos && pos.net > 0 && pos.avgBuy > 0) {
      cs.createPriceLine({
        price: pos.avgBuy, color: '#a78bfa', lineWidth: 1, lineStyle: 2,
        axisLabelVisible: true, title: 'Current avg'
      });
    }
  } else {
    const price = chart.addLineSeries({ color: '#6366f1', lineWidth: 2, lineType: 1, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
    const seen = {};
    const pdata = [];
    list.forEach((t) => {
      let s = sec(t.ts);
      while (seen[s]) s += 1;
      seen[s] = 1;
      t._cs = s;
      pdata.push({ time: s, value: t.price });
    });
    price.setData(pdata);
    price.setMarkers(list.filter((t) => !hid(t)).map((t) => mk(t, t._cs)));
    chart.applyOptions({ timeScale: { timeVisible: true } });
    if (pos && pos.net > 0 && pos.avgBuy > 0) {
      price.createPriceLine({
        price: pos.avgBuy, color: '#a78bfa', lineWidth: 1, lineStyle: 2,
        axisLabelVisible: true, title: 'Current avg'
      });
    }
  }

  chart.timeScale().fitContent();
  ro = new ResizeObserver(() => chart && chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }));
  ro.observe(el);
}
