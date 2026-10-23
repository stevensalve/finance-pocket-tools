# Receivables & Payables Aging

> Bucket outstanding invoices by age per party, with payment reminder text.

Part of [Finance Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Load a list of open invoices (customers or vendors) and see, for each party, how much is not yet due and how much is 1-30, 31-60, 61-90 and over 90 days late. It also writes payment reminders for everyone who is overdue.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/aging-report/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- aging-report ../aging-report-repo`.

## Features

- Reads Excel and CSV; credit notes can be negative or in brackets; a missing due date uses your credit days.
- Age counted from the due date or the invoice date, with your own bucket limits.
- Parties sorted by overdue amount; totals by bucket; CSV export.
- Friendly or firm reminder text per party (with an overdue minimum and your sign-off), ready to copy.

## How it works

`js/core.js` exports `AgingCore`: `rowsToItems`, `report`, `reminder`, `reminders`, `toCsv` and `sampleRows`. The as-of date is always passed in, so results are repeatable.

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

- It reports what is in your list. Unallocated receipts and advances need to be entered as negative lines to net off.
- It does not send reminders; copy the text into your e-mail.
- Interest on late payment is not calculated. Figures are calculated from what you enter and are for checking and planning. Confirm anything that goes to a customer, lender or authority.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/aging-report/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). SheetJS Community Edition 0.20.3 (Apache-2.0).
