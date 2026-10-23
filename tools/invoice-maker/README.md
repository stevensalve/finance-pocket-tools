# Invoice Maker

> GST tax invoices with CGST/SGST/IGST, amount in words and a clean PDF.

Part of [Finance Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Enter the seller, the buyer and the items, and get a GST tax invoice as a PDF. The tool decides between CGST + SGST (same state) and IGST (different states), rounds every line to paise so the totals add up, and writes the total in Indian words.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/invoice-maker/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- invoice-maker ../invoice-maker-repo`.

## Features

- Seller and buyer with state, and GSTIN validation (format, state code and check character).
- Items with HSN/SAC, quantity, unit, rate, discount and GST rate (0, 0.25, 3, 5, 12, 18, 28 or your own).
- CGST/SGST or IGST chosen automatically from the two states; tax summary by rate; optional round-off to the nearest rupee.
- Next invoice number (`INV/26-27/0007` becomes `...0008`), bank details and terms printed on the invoice.
- Download as PDF (extra pages for long invoices) or as a line-item CSV; save and reopen as `.json`.

## How it works

`js/core.js` exports `InvoiceCore`: `STATES`, `gstinProblem`, `gstinCheckChar`, `nextNumber`, `financialYear`, `create`, `validate`, `compute`, `toCsv`, `buildPdf`, `serialize` and `parse`. Every line is rounded to paise first and totals are sums of those lines, so the printed figures always add up.

| File                 | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                          |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                          |
| `css/app.css`        | Styles for this tool only                                                                           |
| `js/common.js`       | Shared helpers (downloads, file reading, status messages). Synced from `shared/` - do not edit here |
| `js/core.js`         | The logic: pure functions, unit-tested, no browser needed                                           |
| `js/app.js`          | Connects the page to the logic (thin by design)                                                     |
| `vendor/`            | Bundled third-party code: pdf-lib 1.17.1 (MIT)                                                      |
| `tests/core.test.js` | Unit tests for the logic                                                                            |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (exact versions and licenses in `vendor/README.md`) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.
- Financial data can be sensitive. Use the tool on a device you trust, and delete downloaded files you no longer need.

## Limitations

- It does not file anything and does not create an e-invoice (IRN) or QR code: use the government portal for that.
- Reverse charge, exports, composition dealers, cess and TCS are not modelled.
- PDF fonts are Latin only; the rupee sign prints as `Rs.` and other scripts as `?`.
- Up to 100 items per invoice. Figures are calculated from what you enter and are for checking and planning. Confirm anything that goes to a customer, lender or authority.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/invoice-maker/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). pdf-lib (MIT).
