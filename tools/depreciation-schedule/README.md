# Depreciation Schedule

> Straight-line or written-down-value schedule for a fixed-asset list, by financial year.

Part of [Finance Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Load a list of assets (or add them by hand) and get depreciation year by year for the financial years you choose. It supports straight-line (SLM) and written-down-value (WDV), three rules for the year of purchase, salvage value, and disposal with the gain or loss.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/depreciation-schedule/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- depreciation-schedule ../depreciation-schedule-repo`.

## Features

- Reads Excel and CSV; a blank life uses the category's sample useful life.
- SLM by life or by rate; WDV by rate, or by life (the rate that reaches the salvage value).
- Part-year rule: pro-rata by days, half if owned under 180 days, or a full year.
- Never below salvage value; disposal removes the book value and shows gain or loss.
- Totals by year, per-asset table and category summary; CSV export.

## How it works

`js/core.js` exports `DepCore`: `CATEGORIES`, `fyOf`, `fyLabel`, `wdvRateFromLife`, `problems`, `schedule`, `rowsToAssets`, `toCsv` and `sampleRows`. A financial year is 1 April to 31 March; years before the one you start from are rolled forward silently so the opening values are right.

| File                 | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                          |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                          |
| `css/app.css`        | Styles for this tool only                                                                           |
| `js/common.js`       | Shared helpers (downloads, file reading, status messages). Synced from `shared/` - do not edit here |
| `js/core.js`         | The logic: pure functions, unit-tested, no browser needed                                           |
| `js/app.js`          | Connects the page to the logic (thin by design)                                                     |
| `vendor/`            | Bundled third-party code: SheetJS Community Edition 0.20.3 (Apache-2.0)                             |
| `tests/core.test.js` | Unit tests for the logic                                                                            |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (exact versions and licenses in `vendor/README.md`) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.
- Financial data can be sensitive. Use the tool on a device you trust, and delete downloaded files you no longer need.

## Limitations

- The category lives are samples. Check Schedule II of the Companies Act or your own policy.
- It works per asset. Income-tax block-of-assets rules, additional depreciation and component accounting are not modelled.
- No impairment or revaluation.
- Up to 60 years per run. Figures are calculated from what you enter and are for checking and planning. Confirm anything that goes to a customer, lender or authority.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/depreciation-schedule/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). SheetJS Community Edition 0.20.3 (Apache-2.0).
