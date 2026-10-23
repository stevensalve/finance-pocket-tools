# GST Calculator & Summary

> Add or remove GST, and summarise a sales or purchase register rate by rate.

Part of [Finance Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Two jobs in one page. The quick calculator adds GST to an amount or takes it out of a GST-inclusive amount, split into CGST/SGST or IGST. The register summary reads an Excel or CSV list of invoices and totals it by rate, month, party and registered/unregistered, and points out rows that look wrong.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/gst-calculator/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- gst-calculator ../gst-calculator-repo`.

## Features

- Quick calculator for any rate, inclusive or exclusive, intra-state or inter-state.
- Reads Excel and CSV registers with flexible column names; fills in a missing taxable value, rate or tax where it can.
- Totals by GST rate, month, party and B2B/B2C; one CSV with all of them.
- Checks: tax that does not match the rate, CGST and SGST that differ, mixed CGST and IGST, totals that do not add up, invalid GSTINs, duplicate invoice numbers.

## How it works

`js/core.js` exports `GstCore`: `RATES`, `gstinValid`, `quick`, `rowsToEntries`, `summarise`, `summaryCsv` and `sampleRows`. SheetJS only reads the file in `app.js`; the logic works on plain rows.

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

- It checks and summarises; it is not a return-filing or reconciliation-with-GSTR-2B tool.
- Rows are summarised as given: place of supply, reverse charge and credit-note rules are not applied.
- Amounts are rounded to paise per row; a rupee or two of difference against a return can be rounding. Figures are calculated from what you enter and are for checking and planning. Confirm anything that goes to a customer, lender or authority.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/gst-calculator/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). SheetJS Community Edition 0.20.3 (Apache-2.0).
