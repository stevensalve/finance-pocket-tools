# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Use GitHub's private vulnerability reporting: on the repository page choose _Security -> Report a vulnerability_. Include the tool name, what you did, what you expected and what happened, and (if possible) a small file that reproduces it. We aim to acknowledge reports within a few days and to publish a fix and credit you (if you wish) once it is released.

## Supported versions

Only the latest release on the `main` branch is supported.

## Threat model in one paragraph

These tools process files that users open on their own computer. The main risks are (1) a malicious file exploiting a parser, (2) a bug leaking data over the network, and (3) tampered third-party code. The design answers each: parsers are well-known open-source libraries pinned to exact versions and bundled in `vendor/`; every page ships a Content-Security-Policy with `connect-src 'none'` plus `script-src 'self'` (no inline scripts, no `eval`) and CI fails if a page references an external resource; and libraries are never loaded from a CDN.

## Notes for specific components

- **Financial data.** Invoices, bank statements, aging lists, budgets and expense claims are sensitive. Nothing is uploaded or stored by the tools, but the files you download (PDFs, CSVs, `.json`) are ordinary files: they are not password-protected. Store and share them securely and delete them when no longer needed.
- **SheetJS** is taken from the vendor's own distribution (`cdn.sheetjs.com`, version 0.20.3) because the copy on npm is outdated and known to be vulnerable. Spreadsheet cells are treated as text; exported CSV files guard against formula injection (cells starting with `=`, `+`, `-` or `@` are prefixed with an apostrophe).
- **Saved `.json` files** (Invoice Maker) are validated and sanitised when opened, and user text is only ever written to the page with `textContent`.
- **Statutory figures** (GST rates, due dates, depreciation lives) are samples or general-case rules, not advice. Wrong dates or rates are a correctness problem rather than a vulnerability, but please report them as bugs.

## Known `npm audit` findings

Run `npm audit` after installing. At the time of writing there are no known findings for the development tooling; the bundled browser libraries are pinned and recorded in each tool's `vendor/README.md`. Re-check whenever dependencies are updated.

## What is out of scope

- Attacks that require the attacker to already control the user's browser or operating system.
- Invoices and schedules are plain PDFs without a digital signature or password; that is documented behaviour, not a vulnerability.
