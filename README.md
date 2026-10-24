# Tradefolio

Private, offline-ready trade journal. Import your broker trade history (xlsx, xls, csv) and get open positions, FIFO realized P&L and daily charts. No backend, and no data leaves your browser.

## Features

- Import with raw preview, auto-detected header row and column mapping
- Open positions, all trades (search and filters) and closed / summary tabs, all sortable
- Per-stock daily candles with buy and sell markers, a 'Current avg' line and unrealized P&L
- Multiple users: each import is saved under a username, and duplicate files are rejected
- Warnings panel for skipped rows, duplicate order ids and SHORT anomalies
- CSV / XLSX export of the current view
- Works offline after the first visit (PWA, service worker)
- INR formatting, dark theme, responsive layout

## Quick start

Open `index.html` in your browser.

## Build and deploy

```
npm ci
npm run build
```

This writes a minified bundle to `dist/`. The included GitHub Actions workflow (`.github/workflows/pages.yml`) builds and deploys `dist/` to GitHub Pages on every push to `main`. Set Settings > Pages > Source to **GitHub Actions** once. Serve over https, since service workers need a secure context.

## Import format

- Supported files: `.xlsx`, `.xls`, `.csv`. Use the sample download on the empty screen for a template.
- Headers are matched by name, case-insensitive. The header row is auto-detected (at least 4 known headers).

| Column | Required |
| --- | --- |
| Symbol, ISIN or Stock name | at least one |
| Type (BUY / SELL) | yes |
| Quantity | yes |
| Value (total trade value) | yes |
| Execution date and time | yes |
| Order status | yes |
| Exchange, Exchange Order Id | no |

- Only rows with status `Executed` are used.
- Dates: `DD-MM-YYYY HH:MM`, with optional AM/PM, ISO `YYYY-MM-DD`, or Excel serial dates. No timezone conversion is applied.

## How P&L is calculated

- Net quantity = buys minus sells. Net > 0 is OPEN, 0 is CLOSED, < 0 is SHORT (a data anomaly).
- Realized P&L uses FIFO: sells consume the oldest buy lots first.
- Cost basis = weighted average buy price x open quantity. FIFO cost = cost of the remaining lots.
- Unrealized P&L uses the latest daily close, not a live quote.

## Market data

Candles come from Yahoo Finance (NSE `.NS`, then BSE `.BO`) through corsproxy.io. Set your corsproxy.io key with the key icon in the dock. It is stored in `localStorage`. Without a key the chart falls back to your executed prices. Candles are cached per symbol for the calendar day.

## Privacy

Trades, imports and cached candles stay in your browser (IndexedDB). Outbound requests go only to jsDelivr (libraries) and corsproxy.io / Yahoo Finance (candles).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Blank page | Hard reload. The CDN guard names the library that failed. |
| Chart says `no data` | Set the corsproxy.io key, then click Reload. |
| Old UI after an update | Bump `CACHE` in `sw.js`, or open `?dev=1` once. |
| Import rejected | The same file was already imported for that username. |

## Known limitations

- No corporate actions (splits, bonuses, demergers), brokerage or taxes.
- Intraday and delivery trades are not distinguished.
- The first visit needs internet to cache the CDN libraries.
- Tables show the first 1000 rows until you click Show all.
