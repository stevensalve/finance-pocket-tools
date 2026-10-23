# Ideas and good first tasks

Pick something, open an issue to say so, and follow [CONTRIBUTING.md](../CONTRIBUTING.md). Difficulty guide: **J** = suitable for a junior engineer, **M** = mid-level.

## Improvements to existing tools

| Tool                     | Task                                                                  | Level |
| ------------------------ | --------------------------------------------------------------------- | ----- |
| Invoice Maker            | Save the seller details once and reuse them for the next invoice      | J     |
| Invoice Maker            | Credit note and proforma invoice layouts                              | J     |
| Invoice Maker            | QR code for UPI payment on the invoice                                | M     |
| GST Calculator & Summary | Compare a purchase register with a supplier statement                 | M     |
| GST Calculator & Summary | HSN-wise summary table, as used in returns                            | J     |
| Loan & EMI Calculator    | Floating-rate changes part-way through the loan                       | M     |
| Loan & EMI Calculator    | Compare two loan offers side by side                                  | J     |
| Depreciation Schedule    | Income-tax block-of-assets method                                     | M     |
| Depreciation Schedule    | Journal-entry export for each year                                    | J     |
| Bank Reconciliation      | Let the user pair two lines by hand when the automatic match is wrong | M     |
| Bank Reconciliation      | Several bank accounts in one run                                      | M     |
| Aging Report             | Interest on overdue amounts at a rate you set                         | J     |
| Aging Report             | Export each party's statement as a PDF                                | M     |
| Budget vs Actual         | A monthly chart for the selected category                             | J     |
| Budget vs Actual         | Several budget versions (original, revised)                           | M     |
| Expense Summariser       | Mileage and per-diem rules                                            | M     |
| Compliance Calendar      | Built-in professional tax dates for a few states                      | M     |
| Compliance Calendar      | Import the year's notified extensions from a text file                | J     |
| Cash-flow Forecaster     | Chart of the balance over time                                        | J     |
| Cash-flow Forecaster     | Import the plan from an Excel sheet                                   | J     |
| All                      | Translate tool text (an `i18n` helper in `shared/`)                   | M     |
| All                      | Playwright smoke tests for each page in CI                            | M     |

## New tool candidates

Fresh candidates for an eleventh tool:

| Idea                        | What it does                                                         | Level |
| --------------------------- | -------------------------------------------------------------------- | ----- |
| Quotation / Estimate Maker  | Priced quotes with validity date and terms, as PDF                   | J     |
| Payment Voucher Printer     | Printable payment and receipt vouchers with amount in words          | J     |
| Cheque Printer              | Position and print cheques on your own cheque leaf size              | M     |
| TDS Calculator              | Section-wise TDS on a payment, with threshold checks                 | M     |
| Ratio Analysis              | Liquidity, leverage and profitability ratios from two balance sheets | M     |
| Break-even Calculator       | Break-even point and margin of safety, with a chart                  | J     |
| Currency Converter (manual) | Convert with a rate you type, and keep a rate list                   | J     |
| Trial Balance Checker       | Check that debits equal credits and flag odd balances                | M     |
| Fixed Deposit Calculator    | Maturity value and interest for different compounding                | J     |
| Petty Cash Book             | Simple cash book with running balance and monthly summary            | J     |

## Repository and quality

- Add a screenshot gallery to the root README (J).
- Add an accessibility audit script with axe-core run from Playwright in CI (M).
- Add a Content-Security-Policy `report` mode test that fails on any violation during the smoke tests (M).
