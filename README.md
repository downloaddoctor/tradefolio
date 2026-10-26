# Tradefolio

Private, offline-ready trade portfolio tracker. Import your broker trade history (xlsx, xls, csv) and get open positions, FIFO realized P&L and daily charts. No backend, and no data leaves your browser.

## Features

- Import with raw preview, auto-detected header row and column mapping
- Open positions, all trades (search and filters) and closed / summary tabs, all sortable
- Per-stock daily candles with buy and sell markers, a 'Current avg' line and unrealized P&L
- Average-down recovery table for open positions
- Multiple users: each import is saved under a username
- Duplicate protection: repeated Exchange Order Ids and re-imported files are dropped
- Warnings panel for skipped rows and SHORT anomalies
- CSV / XLSX export of the current view
- Works offline after the first visit (PWA)
- INR formatting, dark theme, responsive layout

## Supported reports

- Files: `.xlsx`, `.xls`, `.csv`. A sample template can be downloaded from the empty screen.
- Groww order history reports work as downloaded, with no editing. Other brokers work if their columns match the table below.
- Headers are matched by name, case-insensitive, and the header row is auto-detected.
- Only rows with status `Executed` are used.

| Column                      | Required     |
| --------------------------- | ------------ |
| Symbol, ISIN or Stock name  | at least one |
| Type (BUY / SELL)           | yes          |
| Quantity                    | yes          |
| Value (total trade value)   | yes          |
| Execution date and time     | yes          |
| Order status                | yes          |
| Exchange, Exchange Order Id | no           |

Dates: `DD-MM-YYYY HH:MM` with optional AM/PM, ISO `YYYY-MM-DD`, or Excel serial dates. No timezone conversion is applied.

## Duplicates

Rows whose `Exchange Order Id` repeats within the file, or was already imported for the same username, are dropped and counted in the warnings panel. Overlapping reports are therefore safe to import. The same file cannot be imported twice for one username. Rows without an order id cannot be de-duplicated.

## How P&L is calculated

- Net quantity = buys minus sells. Net > 0 is OPEN, 0 is CLOSED, < 0 is SHORT (a data anomaly).
- Realized P&L uses FIFO: sells consume the oldest buy lots first.
- Cost basis = weighted average buy price x open quantity. FIFO cost = cost of the remaining lots.
- Unrealized P&L uses the latest daily close, not a live quote.

## Market data

Candles come from Yahoo Finance (NSE `.NS`, then BSE `.BO`) through corsproxy.io. An optional corsproxy.io key can be set with the key icon in the dock and is stored in `localStorage`. Without candles the chart falls back to your executed prices. Candles are cached per symbol for the calendar day.

## Privacy

Trades, imports and cached candles stay in your browser (IndexedDB). Outbound requests go only to jsDelivr (libraries) and corsproxy.io / Yahoo Finance (candles).

## URL options

| Parameter | Effect                                                 |
| --------- | ------------------------------------------------------ |
| `?new=1`  | Deletes all local data (IndexedDB) and caches, then loads fresh |
| `?dev=1`  | Unregisters the service worker and clears caches, for development |

## Known limitations

- No corporate actions (splits, bonuses, demergers), brokerage or taxes.
- Intraday and delivery trades are not distinguished.
- The first visit needs internet to cache the CDN libraries.
- Tables show the first 1000 rows until you click Show all.
