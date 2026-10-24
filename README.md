zz

# Tradefolio - Open Positions Tracker

Single-page, zero-backend web app. Import an Excel file of stock trades and see which positions are currently open. No build step, no server, no data leaves the browser.

## Run

Serve the folder over http, for example `python -m http.server`, then open `http://localhost:8000`. ES modules and service workers do not work from `file://`.

Libraries load from CDNs on the first visit and are then cached by the service worker (`sw.js`), so later visits work fully offline:

- Own CSS (src/css/style.css) - dark-only styling
- Alpine.js 3 - reactivity
- SheetJS (xlsx 0.18.5) - Excel parsing and export
- Dexie 4 - IndexedDB storage
- Lightweight Charts 4 (TradingView, open source) - per-stock daily candles with buy / sell markers
- corsproxy.io (optional API key) - CORS proxy used to reach Yahoo Finance for daily candles; set the key once in the header API key box (stored locally, shown masked)
- Yahoo Finance chart API (unofficial, no key) - daily candle data, best effort

Bump `CACHE` in `sw.js` whenever the precached assets change.
Open `http://localhost:8000/?dev=1` for development: the service worker is not registered, any existing one is unregistered and its caches are cleared, so edits show on a normal reload.

## Supported formats

- `.xlsx`, `.xls`, `.csv`
- The header row is auto-detected (the first row containing at least 4 known column names), so leading blank rows are fine.
- Use the **Sample file** button to download a correctly formatted example.

## Column assumptions

Matched by header name, case-insensitive, whitespace tolerant:

| Column                  | Required                                          |
| ----------------------- | ------------------------------------------------- |
| Stock name              | one of Symbol / ISIN / Stock name                 |
| Symbol                  | one of Symbol / ISIN / Stock name                 |
| ISIN                    | one of Symbol / ISIN / Stock name                 |
| Type (BUY / SELL)       | yes                                               |
| Quantity                | yes                                               |
| Value                   | yes (total trade value, price = Value / Quantity) |
| Exchange                | no                                                |
| Exchange Order Id       | no                                                |
| Execution date and time | yes                                               |
| Order status            | yes                                               |

- Grouping key per position: Symbol, then ISIN, then Stock name.
- Numeric symbols such as `500285.0` are normalized to `500285`.
- Dates: `DD-MM-YYYY HH:MM AM/PM`, 24-hour `DD-MM-YYYY HH:MM`, ISO `YYYY-MM-DD[ HH:MM]`, and Excel serial dates. Times are treated as naive (no timezone conversion).
- Store long Exchange Order Ids as text in Excel to avoid precision loss.

## Methodology

- Only rows with Order status `Executed` are used. Other rows are skipped and counted in the warnings panel.
- Trades are processed per symbol in ascending execution time; ties use original row order.
- Net quantity = buys minus sells. Net > 0 is OPEN, 0 is CLOSED, < 0 is SHORT (flagged as a data anomaly).
- Realized P&L uses **FIFO**: sells consume the oldest buy lots first. Selling beyond holdings opens a short lot that later buys cover FIFO.
- Avg buy / avg sell price are weighted by quantity over all buys / sells.
- Cost Basis = weighted avg buy price x open qty. FIFO Cost = cost of the remaining FIFO lots (shown alongside for comparison).
- Empty rows, malformed dates, numbers or types are skipped with a warning count.
- Duplicate Exchange Order Ids are flagged (DUP) and can be removed with a toggle. They are kept by default because partial fills can share an id.

## Features

- Drag-and-drop or picker import with raw preview, detected column mapping and Confirm import
- Open Positions, All Trades (search, type / symbol / date filters) and Closed / Summary tabs, all sortable
- Click any row to open that stock's detail: summary, and a chart of real daily (1d) candles with volume, green buy and red sell markers on the days you traded, plus net quantity held over time
- Candles come from Yahoo Finance (NSE `.NS`, then BSE `.BO`) via corsproxy.io, covering one year before your first purchase through today, fetched best effort: the request can fail without a proxy key, so a Reload button is provided, and the last successful fetch is cached in the browser for the calendar day (one proxy request per symbol per day, with a stale fallback when offline)
- Chart pane shows the 'Current avg' line (FIFO average of shares still held, same as Avg buy in the stats strip) and Unrealized P&L marked to the latest close
- Hide closed toggles markers for fully matched buy/sell round-trips, leaving open lots and shorts visible
- Data and Chart views are URL-addressable (`#data`, `#chart`) and survive reload and back/forward
- If no candles can be loaded, the chart falls back to a line that plots only your own executed prices
- CSV / XLSX export of the current view
- Imports persisted in IndexedDB (Dexie) and merged: each import is saved under a username you type in the preview, plus a random 3-char id (a-z, 0-9) and the file's SHA-256 hash. Importing the same file again for the same user is rejected; a header user switcher shows each user's positions separately (or all users combined). The SHORT warning has an 'Exclude SHORT symbols from view' checkbox that hides them from positions and totals without deleting any data
- Works offline after the first online visit (service worker)
- INR formatting with Indian digit grouping
- Dark mode (dark-only theme), responsive layout

## Deploy

Any static host works (GitHub Pages, Netlify, Cloudflare Pages, S3, nginx). Upload the folder as-is: `index.html`, `sw.js`, `manifest.webmanifest`, `assets/`, `src/`. For the minified bundle run `npm run build` and upload `dist/`.

Serve over **https** (or `localhost`) — service workers and the PWA manifest require a secure context.

First-load libraries come from jsDelivr; after that the service worker serves them offline. Bump `CACHE` in `sw.js` whenever you change any precached file, otherwise returning visitors keep the old copy.

## Privacy

All trades, imports and cached candles live in your browser's IndexedDB. Nothing is uploaded. The only outbound requests are to jsDelivr (libraries), corsproxy.io + Yahoo Finance (candles), and Stooq. The corsproxy key is stored in `localStorage` on your device.

## Troubleshooting

| Symptom                | Fix                                                                |
| ---------------------- | ------------------------------------------------------------------ |
| Blank page             | Hard reload; check the CDN guard message for which library failed  |
| Chart says `no data`   | Set the corsproxy.io key via the key icon in the dock, then Reload |
| Old UI after an update | Bump `CACHE` in `sw.js`, or open `?dev=1` once                     |
| Import rejected        | Same file was already imported for that username                   |

## Deploy

Upload the folder to any static host (GitHub Pages, Netlify, Cloudflare Pages, S3, nginx). Serve over https or localhost so the service worker and PWA manifest work. Bump `CACHE` in `sw.js` after changing any precached file.

## Privacy

All trades and cached candles stay in your browser (IndexedDB). Nothing is uploaded. Outbound requests go only to jsDelivr (libraries), corsproxy.io + Yahoo Finance (candles) and Stooq. The corsproxy key is stored in `localStorage` on your device.

## Troubleshooting

| Symptom                | Fix                                                                |
| ---------------------- | ------------------------------------------------------------------ |
| Blank page             | Hard reload; the CDN guard names the library that failed           |
| Chart shows `no data`  | Set the corsproxy.io key via the key icon in the dock, then Reload |
| Old UI after an update | Bump `CACHE` in `sw.js`, or open `?dev=1` once                     |
| Import rejected        | The same file was already imported for that username               |

## Known limitations

- No corporate actions (splits, bonuses, demergers), so quantities may drift after such events.
- No brokerage, taxes or charges; Value is used as given.
- Unrealized P&L uses the last daily close from the candle cache, not a live quote.\n- Market data needs a corsproxy.io API key; without it the chart falls back to your executed prices. Stooq's CSV endpoint is often blocked by CORS and is a last resort.
- Intraday vs delivery trades are not distinguished.
- Timestamps are naive; no timezone handling.
- Tables show the first 1000 rows until Show all is clicked.
- First visit needs internet so the CDN libraries can be cached.
