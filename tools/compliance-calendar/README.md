# Compliance Calendar

> GST, TDS, PF, ESI and advance-tax due dates for the financial year, as a calendar file.

Part of [Finance Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Choose the financial year and which obligations apply, and get every due date, a "coming up" list and a calendar file for Outlook, Google or Apple Calendar with reminders. Add your own items such as professional tax or an AGM.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/compliance-calendar/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- compliance-calendar ../compliance-calendar-repo`.

## Features

- General-case rules for GST returns, TDS payment, returns and certificates, PF, ESI, advance tax, income-tax returns and tax audit, each switchable and with an editable day for monthly items.
- Option to move dates that fall on a weekly off or holiday to the previous or next working day.
- Your own monthly or one-off items; upcoming list; whole year by month.
- Downloads: calendar file (`.ics`) with optional reminder, and CSV.

## How it works

`js/core.js` exports `ComplianceCore`: `ITEMS`, `defaultItems`, `weekday`, `shift`, `generate`, `upcoming`, `byMonth`, `toCsv`, `toIcs` and `parseCustom`. Rules are plain data (`monthly` or `fixed`), so they are easy to review and change.

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

- **Due dates change.** They are altered by government notifications and depend on turnover, scheme and state (for example QRMP and staggered GSTR-3B dates). The built-in rules are common general-case dates; always confirm on the official portals.
- Professional tax, labour welfare fund and other state-specific dates are not built in; add them as your own items.
- No notification or e-mail: it produces a file you add to your own calendar.
- Extensions announced for a particular year are not known to the tool. Figures are calculated from what you enter and are for checking and planning. Confirm anything that goes to a customer, lender or authority.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/compliance-calendar/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). No bundled third-party software.
