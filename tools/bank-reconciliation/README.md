# Bank Reconciliation

> Match bank statement lines to ledger entries and list what is left over.

Part of [Finance Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Load the bank statement and your bank ledger, and the tool pairs the lines that belong together and lists the rest: items in the bank that are not in the books, and items in the books that are not yet in the bank. Enter the two closing balances to get a standard reconciliation statement.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/bank-reconciliation/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- bank-reconciliation ../bank-reconciliation-repo`.

## Features

- Reads Excel and CSV; understands Debit/Credit columns (bank credit = money in, book debit = money in), a signed Amount, Dr/Cr columns and brackets.
- Matching passes: same reference and amount, then same amount within a date window (default 3 days), then one entry equal to the sum of 2 or 3 entries.
- Reconciling items, a bank reconciliation statement and a possible-duplicates list.
- CSV with every line and how it was matched.

## How it works

`js/core.js` exports `ReconCore`: `rowsToEntries`, `duplicates`, `match`, `statement`, `toCsv` and `sample`. Matching is one-to-one and deterministic: the closest date wins, shared words break ties.

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

- Matching is by amount, date and reference. Review the matches before you rely on them; two unrelated items of the same amount on nearby dates can pair wrongly.
- One-to-many matching looks at 2 or 3 entries only.
- It does not post entries to your books.
- One bank account at a time. Figures are calculated from what you enter and are for checking and planning. Confirm anything that goes to a customer, lender or authority.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/bank-reconciliation/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). SheetJS Community Edition 0.20.3 (Apache-2.0).
