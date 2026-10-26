# PROJECT

Tradefolio — single-page client-side app; imports broker trade xlsx/xls/csv → open positions, trades, realized P&L (FIFO)
No backend; libs via CDN (not bundled), cached at runtime by service worker → offline after first online visit
Build: 'pnpm run build' (node scripts/build.mjs) bundles src/js/ into dist/app.js; 'pnpm test' runs node --test; package.json = local pnpm scripts + devDependency pins (esbuild, html-minifier-terser), pnpm-lock.yaml gitignored; .github/workflows/pages.yml does NOT use pnpm: it reads the pins from package.json, installs them via 'npm i --prefix ..', runs 'node --test', builds, deploys dist/ to GitHub Pages
Run build: 'pnpm install' once, 'pnpm run build'; open dist/index.html in the browser

# DIRECTORY

tradefolio/
 src/
  js/ — ES modules
  css/ — style.css
 assets/ — favicon.svg
scripts/ — build.mjs
dist/ — build output, gitignored, deployed to Pages
.github/workflows/ — pages.yml
index.html
sw.js
package.json
pnpm-workspace.yaml — allowBuilds esbuild (local pnpm)
README.md
AGENTS.md

# ENTRY-POINTS

index.html — markup; Google Fonts Inter + JetBrains Mono; <link rel='stylesheet' href='./src/css/style.css'>; <link rel='icon' href='./assets/favicon.svg'>; CDN scripts xlsx, dexie (globals); <script type='module' src='./src/js/main.js'>
src/js/main.js — sets window.app, registers sw.js (skipped when URL has ?dev=1: unregisters SW + deletes caches); always deletes legacy DB 'tradeJournal'; ?new=1 → deletes DB 'tradefolio' (onblocked → top notice until other tabs close) + Cache Storage, strips the param via replaceState; then injects Alpine CDN script (so window.app exists before Alpine starts)
app() → Alpine root component bound by x-data='app()' on <body>
init() → loadDataset() from Dexie → recompute()

# MODULES

src/js/format.js — INR/NUM formatters, EPS, norm, pad, fmtDate
src/js/parse.js — FIELDS (headers → keys; req=1 required), parseDate/toNum/toText/normSymbol, emptyStats, parseWorkbook(buf,name) → preview (throws), buildTrades(preview) → {trades,stats}; uses global XLSX
src/js/compute.js — compute(trades) pure: group by sym → chronological (ts, idx tiebreak) → FIFO + short lots → positions; totalsOf(positions)
src/js/db.js — Dexie 'tradefolio'; saveDataset/saveImport/saveStats/findImport(hash)/newImportId/loadDataset/clearDataset(user?)/saveCandles/loadCandles; uses global Dexie
src/js/columns.js — COLS per view (open, trades, summary) {k,label,f,n}; cell, cellClass
src/js/sample.js — downloadSample (client-side xlsx)
src/js/chart.js — drawSymbolChart(el, trades, candles, pos, opt{hideBuys,hideSells,hideVolume,allTrades})/destroyChart; no running avg series — only the 'Current avg' price line (pos.avgBuy = FIFO remaining lots, same as stats strip); Lightweight Charts v4 candlesticks + volume histogram + setMarkers (buy arrowUp green, sell arrowDown red) snapped to nearest earlier candle day; pos → createPriceLine 'Current avg' (violet, open positions only); no candles → executed-price line fallback; uses global LightweightCharts
src/js/components.js — registerComponents(Alpine) on 'alpine:init' (wired in main.js) → Alpine.data child components nested under app() (inherit its state via scope); every UI block in index.html has one: headerDock (#hdr .hdr-right), alertBox (#error), importPreview (#preview), userModalBox (#usermodal), positionsSide (.side-col), summarySide (.side-dash), paneHead (.pane-head), statGrid (selected-stock title), recoveryCard (.rec-card; getters show, recovery → {price,avg,qty,rows[x1..x10]}, note, upText), kpiCards (#kpis), warningsPanel (#warnings), insightsPanel (#insights), dataSummary (#data-summary), dataTabs (.bar), dataToolbar (#toolbar), dataTable (#table-wrap); components hold view helpers/formatting only, state stays in app()
src/js/symbols.js — yahooCandidates(symbol) pure (no globals; unit-tested)
src/js/market.js — imports yahooCandidates from symbols.js, getCandles(symbol,fromTs,toTs,override,force) → Yahoo v8/finance/chart interval=1d via corsproxy.io only (no other fallback); tickers SYM.NS then SYM.BO (numeric → .BO); window: p1 = firstTs − 365d, p2 = now; same-calendar-day cache (one proxy fetch per symbol per day, force only via Reload)-day cache (one proxy fetch per symbol per day, force only via Reload) + stale fallback; loadCorsKey/saveCorsKey (localStorage 'corsKey'); → db (loadCandles/saveCandles)
src/js/app.js — app(): state, import flow (readFile → parseWorkbook → preview → askUser() modal → confirmImport), pane ('data'|'chart') synced to URL hash '#data?u={USER}' | '#chart/{SYMBOL}?u={USER}&f=open|closed&s=unr|pnl|pct|realized|value|symbol&x=cbslv' (u = header user, omitted for all users, '(unassigned)' allowed, unknown user in hash → reset to all once trades load, hashQuery(true) = data-pane form with u only; f omitted for 'all'; s = posSort, omitted for 'default'; x = active chart toggles c=closedOnly b=hideBuys s=hideSells l=hideLines v=hideVolume via flagKeys/hashQuery; restored in parseHash, synced via $watch (user, posSort, posFilter) and toggleFilter) (parseHash/syncHash/hashSym; selected symbol restored on reload and hashchange) + showData/showChart; chart filter flags closedOnly/hideBuys/hideSells/hideVolume/hideLines toggled via toggleFilter(k) → paint() redraws chart immediately, keyOpen/userOpen/userModal popover state, insights getter → [{tone,text}] (concentration >25% of open cost, positions ≥20% below avg buy via prices{}, win rate/avg win vs loss/profit factor, best/worst realized, longest held) rendered in #insights on the Data pane; shortList [{symbol,missing,guess}] built in recompute() from SHORT positions; fixShort(sym)/fixAllShorts() → fixApply → mkFix adds a synthetic BUY opening-balance trade (key 'fix:{SYM}:{ts}:{i}', imp 'fix', dated 1 day before the symbol's first trade, price = fixPrice[sym] or first sell price) saved via db.saveTrades, rendered in the warnings panel; recovery → moved to js/components.js recoveryCard → {price,avg,qty,rows[x1..x10]} (table cols: Buy, Add qty, Capital, Total qty, Total invested, New avg = target price, Up needed) for the selected OPEN position: buying m×current qty at curPrice → capital = q·m·c, new avg = (avg+m·c)/(1+m), up needed = newAvg/c−1; rendered as .rec-card below the selected-stock stats under the chart; filterSummary getter → [label,value,tone] rows rendered in a separate .side-dash card (.side-sum) stacked under the positions card inside .side-col (follows posFilter + search); posSort ('default'|'unr'|'pnl'|'pct'|'realized'|'value'|'symbol') orders sideList; pnlOf(p) → {live,unr,total,pct} (realized + live unrealized) shown per sidebar row; fetched{} guards refreshPrices to one getCandles call per symbol per session (served from the same-day Dexie cache, no forced fetch); liveRows(l) adds live market value/unrealized/total P&L/ROI from prices{sym→last close} filled by refreshPrices() (called in recompute, uses getCandles cache; loadCandles also updates prices) (count, invested, bought/sold, realized, ROI = realized/bought, win/loss, best/worst) for the current filter; sideList getter (positions filtered by posFilter 'all'|'open'|'closed' + search q, open-first), pick/openSymbol/loadCandles, curPrice getter (last candle close), selStats getter → [label,value,tone] rows rendered in .sel-stats grid below the chart (price, day change, avg vs price %, unrealized/realized/total P&L with %, period high/low distance), filters/sort getters (rows, shown), export, persist; corsKey + saveCorsKey()/clearCorsKey()/hasKey (localStorage 'corsKey')
src/css/style.css — all styling (no Tailwind, dark-only); LAST block 'compact density (VS Code-like)' overrides spacing/font sizes (13px base, tight padding, 4-6px radii) and must stay last: dot-grid design with framed cards, accent #a78bfa, CSS vars on :root (dark values only), layout, controls, table, modal, tones; fonts Inter + JetBrains Mono
sw.js — cache 'tp-v1'; precaches LOCAL + CDN lists; cache-first for GETs; caches opaque cross-origin responses; offline fallback to index.html
README.md — user docs

# ARCHITECTURE

Module graph: main → app → (format, parse, compute, db, columns, sample, chart, market); db → parse(emptyStats); market → db
Shell: #hdr is a fixed bottom-center dock (Data|Chart tabs + key/import/user/clear icon popovers); #main > div[x-show]:not(.tradefolio) is the flex column with 1.5rem gap
Tradefolio (Chart pane): #main → .tradefolio grid (lg: 272px sidebar + 1fr pane; must stay display:grid) → .side lists ALL positions open-first (sideList, click pick(sym)) → .pane head = ticker + status pill (cs{st,msg}) + stats strip (curPrice · net · avgBuy · realized) + Reload; drawSymbolChart(selTrades, candles, selPos); recompute auto-selects first OPEN position else positions[0]
Import username: preview → Confirm import → askUser() → #usermodal (.modal-sm) → confirmImport() closes modal
Import flow: file → SHA-256 → SheetJS read → header row autodetect (≥4 known headers) → preview + mapping → confirmImport (username required; findImport(hash,user) hit → 'Already imported for {user} as {id}') → trades[] tagged with new import id + user, appended to existing trades (merge, not replace) → compute → positions[] + totals; trade identity = Exchange Order Id (global, across users); a repeat (same file → buildTrades keeps the later row; earlier import of any user → confirmImport deletes the old trade via saveImport removeKeys) replaces the older one and counts in stats.dupRows
Warnings panel has a dismiss cross → dismissWarnings() resets stats to emptyStats(), persists via db.saveStats, sets warnOff (hides the whole panel incl. live SHORT warning until next import or reload); warningCount() returns 0 while warnOff
Only Order status 'Executed' rows kept; skipped/invalid/empty/replaced counts → stats → warnings panel
Position status: OPEN net>0, CLOSED net=0, SHORT net<0
costBasis = avgBuy × open qty; fifoCost = remaining FIFO lots cost
header user switcher (user '' = all users) → activeTrades() filters t.user → recompute(); positions are per selected user; trades without user (pre-v4 imports) appear as '(unassigned)' in the switcher and can be viewed/cleared on their own; hideShort toggle (warnings panel) excludes SHORT symbols from positions/totals/activeTrades via shortSet (view-only, DB untouched); shortN = SHORT symbol count; baseTrades() = user filter; Clear data deletes only the selected user's trades/imports (user '' = all users, wipes everything)
Views: open | trades | summary share one table; sorts kept per view in sorts{}
Table caps at 1000 rows until showAll

# SCHEMA

trade — key idx row stock symbol sym isin type(BUY|SELL) qty value price(value/qty) exchange orderId ts(ms UTC-naive) imp user
position — key symbol stock isin buyQty sellQty buyVal sellVal avgBuy avgSell realized net status costBasis fifoCost n firstBuy first last
stats — file importedAt empty skippedStatus{} skippedStatusTotal invalid[{row,why}] dupRows
Dexie 'tradefolio' v1 (single version) — trades: 'key,symbol,ts'; meta: 'id' (id='stats' → {value: stats}); candles: 'sym' → {sym,ysym,candles[{time,open,high,low,close,volume}],fetchedAt}; imports: 'id,hash,user' → {id(3 chars a-z0-9),hash(SHA-256 hex of file bytes),user,file,importedAt,count}
trade (merged imports) — key '{imp}:t{n}', idx continues across imports, imp = import id, user = optional 'Username' column of the file, else the username typed at import; Trades-view export (importRow) writes the import headers + Username + seconds, sorted by ts, so it re-imports as is; parseWorkbook reads with raw:true so CSV dates stay text (DD-MM-YYYY not guessed as MM-DD); after import the header user = the single user in the file, else all users


# BUILD

scripts/build.mjs → rm dist; esbuild src/js/main.js → dist/app.js (iife, minified, es2020); dist/index.html = index.html with module tag → <script defer src='./app.js'>, CDN tags untouched; minifies src/css/style.css → dist/css/style.css, index.html (html-minifier-terser) and manifest; copies assets/favicon.svg → dist/favicon.svg (index.html, manifest and sw.js paths rewritten to dist layout); dist/sw.js (minified) = sw.js (./src/js/* entries removed, ./assets/favicon.svg → ./favicon.svg, ./src/css/style.css → ./css/style.css), plus './app.js', CACHE 'tp-{timestamp}' per build; dist/.nojekyll

# ENV
xlsx@0.18.5, dexie@4.0.8, alpinejs@3.14.8, lightweight-charts@4.2.0 (jsdelivr)
Dark only: <html> gets .dark class unconditionally; CSS variables are dark-theme values in src/css/style.css; no toggle button, no localStorage
CDN: xlsx@0.18.5, dexie@4.0.8, alpinejs@3.14.8, lightweight-charts@4.2.0 (jsdelivr)
Offline via sw.js runtime/precache; bump CACHE in sw.js when asset list changes
sw.js ignores non-LOCAL/non-CDN cross-origin hosts (Yahoo, corsproxy.io never cached by SW)
Yahoo Finance v8/finance/chart (query1.finance.yahoo.com) via corsproxy.io ONLY; optional corsproxy.io key (localStorage 'corsKey') sent as ?key= query param; network needed for candles (cached in Dexie)
No other market-data source or fallback; corsproxy.io is the single route
No secrets in repo, no env vars
