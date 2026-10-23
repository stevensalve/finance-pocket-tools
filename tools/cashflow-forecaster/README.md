# Cash-flow Forecaster

> Project your bank balance week by week from recurring and one-off inflows and outflows.

Part of [Finance Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

List what you expect to receive and pay (monthly, weekly, every N days, or once), enter today's balance, and see the balance week by week, the lowest point and the first date it dips below the level you set. A what-if shows the effect of customers paying late.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/cashflow-forecaster/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- cashflow-forecaster ../cashflow-forecaster-repo`.

## Features

- Plain-text items: `Rent, out, 90000, monthly 5`; weekly, every-N-days and one-off items; optional `from` / `until` limits.
- Balance tracked day by day, shown per week with a bar; lowest balance and first shortfall with the number of days away.
- Stress test: delay every receipt by N days and/or receive only a percentage of planned receipts.
- CSV export of the weekly forecast.

## How it works

`js/core.js` exports `CashCore`: `parseItems`, `occurrences`, `project`, `stress`, `toCsv` and `sampleText`. A day's inflows and outflows are applied together at the end of the day. Monthly items on day 31 fall on the last day of shorter months.

| File                 | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                          |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                          |
| `css/app.css`        | Styles for this tool only                                                                           |
| `js/common.js`       | Shared helpers (downloads, file reading, status messages). Synced from `shared/` - do not edit here |
| `js/core.js`         | The logic: pure functions, unit-tested, no browser needed                                           |
| `js/app.js`          | Connects the page to the logic (thin by design)                                                     |
| `tests/core.test.js` | Unit tests for the logic                                                                            |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- The tool has no third-party dependencies at all.
- Financial data can be sensitive. Use the tool on a device you trust, and delete downloaded files you no longer need.

## Limitations

- A projection is only as good as the items you list; it does not know about invoices you have not entered.
- One account and one currency; no interest, no bank holidays (payments fall on the dates given).
- Up to 200 items and 104 weeks. Figures are calculated from what you enter and are for checking and planning. Confirm anything that goes to a customer, lender or authority.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/cashflow-forecaster/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). No bundled third-party software.
