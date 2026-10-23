# Loan & EMI Calculator

> EMI, full amortisation schedule and the effect of prepayments, with PDF.

Part of [Finance Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Enter the loan amount, interest rate and tenure to get the monthly instalment and the complete repayment schedule. Add extra monthly payments or one-off part-payments to see how many months and how much interest you save, or ask what loan a given monthly amount can support.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/emi-calculator/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- emi-calculator ../emi-calculator-repo`.

## Features

- EMI on a reducing balance, optionally rounded up to the next rupee as many banks do.
- Schedule by month and by year, with dates when you give a first-instalment date.
- Prepayments (`12: 100000`) and a recurring extra payment; months and interest saved against the plain loan.
- Affordability: the largest loan a monthly payment can service.
- PDF and CSV of the schedule.

## How it works

`js/core.js` exports `EmiCore`: `emi`, `affordableLoan`, `addMonths`, `schedule`, `compare`, `yearly`, `parsePrepayments`, `toCsv`, `sanitize` and `buildPdf`. Interest is rounded to paise every month and the final instalment is adjusted so the balance closes at exactly zero.

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

- Fixed-rate, monthly instalments only: floating-rate changes, moratoriums, processing fees and insurance are not modelled.
- Lenders differ in day-count and rounding, so their statement can differ by small amounts.
- Prepayments shorten the loan and keep the EMI the same; some lenders offer to reduce the EMI instead.
- Up to 600 months. Figures are calculated from what you enter and are for checking and planning. Confirm anything that goes to a customer, lender or authority.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/emi-calculator/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). pdf-lib (MIT).
