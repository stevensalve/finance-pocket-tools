# Budget vs Actual

> Variance by category and month, with over-spend flags and CSV export.

Part of [Finance Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Load a budget and the actuals (in the same layout) and see the variance for every category, which differences matter, and what the year is likely to end at. The tool knows that overspending on an expense is bad but earning more than budgeted is good.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/budget-vs-actual/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- budget-vs-actual ../budget-vs-actual-repo`.

## Features

- Reads Excel and CSV in a wide layout (a column per month) or a long layout (Category, Month, Amount).
- Financial year April to March; compare through any month.
- Income and expense handled the right way round; differences under a tolerance (default 5%) count as on budget.
- Year-end outlook: actual to date plus the budget still to come.
- CSV export of the variance table.

## How it works

`js/core.js` exports `BudgetCore`: `fyMonths`, `monthLabel`, `monthKey`, `rowsToCells`, `compare`, `outlook`, `toCsv` and `sample`. Variance is always actual minus budget.

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

- Single currency and a single budget version. Categories are matched by name ignoring case, so spell them the same in both files.
- The outlook is a simple "actual so far plus remaining budget", not a statistical forecast.
- Spend with no budget has no percentage and is shown as n/a. Figures are calculated from what you enter and are for checking and planning. Confirm anything that goes to a customer, lender or authority.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/budget-vs-actual/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). SheetJS Community Edition 0.20.3 (Apache-2.0).
