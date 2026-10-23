/**
 * The catalogue shown on the launcher page (index.html).
 * Keep in sync with the folders in /tools - `npm run check:structure` fails if
 * a tool is missing here. It is a .js file (not .json) so the launcher also
 * works when opened straight from disk, where browsers block fetch().
 */
window.TOOLS = [
  {
    id: 'invoice-maker',
    title: 'Invoice Maker',
    tagline: 'GST tax invoices with CGST/SGST/IGST, amount in words and a clean PDF.',
    replaces: 'paid invoicing software',
    tags: ['invoice', 'gst', 'pdf'],
  },
  {
    id: 'gst-calculator',
    title: 'GST Calculator & Summary',
    tagline: 'Add or remove GST, and summarise a sales or purchase register rate by rate.',
    replaces: 'online GST calculators',
    tags: ['gst', 'tax', 'register'],
  },
  {
    id: 'emi-calculator',
    title: 'Loan & EMI Calculator',
    tagline: 'EMI, full amortisation schedule and the effect of prepayments, with PDF.',
    replaces: 'bank calculator sites',
    tags: ['loan', 'emi', 'schedule'],
  },
  {
    id: 'depreciation-schedule',
    title: 'Depreciation Schedule',
    tagline: 'Straight-line or written-down-value schedule for a fixed-asset list, by financial year.',
    replaces: 'asset-register spreadsheets',
    tags: ['assets', 'depreciation', 'fy'],
  },
  {
    id: 'bank-reconciliation',
    title: 'Bank Reconciliation',
    tagline: 'Match bank statement lines to ledger entries and list what is left over.',
    replaces: 'manual tick-and-flick',
    tags: ['bank', 'reconciliation', 'match'],
  },
  {
    id: 'aging-report',
    title: 'Receivables & Payables Aging',
    tagline: 'Bucket outstanding invoices by age per party, with payment reminder text.',
    replaces: 'monthly aging spreadsheets',
    tags: ['aging', 'receivables', 'payables'],
  },
  {
    id: 'budget-vs-actual',
    title: 'Budget vs Actual',
    tagline: 'Variance by category and month, with over-spend flags and CSV export.',
    replaces: 'variance spreadsheets',
    tags: ['budget', 'variance', 'fp&a'],
  },
  {
    id: 'expense-summariser',
    title: 'Expense Claims Summariser',
    tagline: 'Totals by employee and category, policy-limit breaches and duplicate checks.',
    replaces: 'manual claim checking',
    tags: ['expense', 'claims', 'policy'],
  },
  {
    id: 'compliance-calendar',
    title: 'Compliance Calendar',
    tagline: 'GST, TDS, PF, ESI and advance-tax due dates for the financial year, as a calendar file.',
    replaces: 'reminder notes and e-mails',
    tags: ['gst', 'tds', 'due dates'],
  },
  {
    id: 'cashflow-forecaster',
    title: 'Cash-flow Forecaster',
    tagline: 'Project your bank balance week by week from recurring and one-off inflows and outflows.',
    replaces: 'forecast spreadsheets',
    tags: ['cash', 'forecast', 'runway'],
  },
];
