/**
 * Loan & EMI Calculator - core logic (pure; pdf-lib is passed in, shared helpers come from OT).
 *
 * Reducing-balance loan: monthly rate r = annual% / 1200, EMI = P r (1+r)^n / ((1+r)^n - 1).
 * Interest each month is rounded to paise, the EMI is rounded to paise (or up to the next rupee), and the
 * last instalment is adjusted so the loan closes at exactly zero.
 * Prepayments reduce the balance and shorten the loan (the EMI stays the same), which is how most lenders treat part-payment.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.EmiCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const MAX_MONTHS = 600;

  function check(p, rate, months) {
    if (!(Number(p) > 0)) throw new Error('Enter the loan amount.');
    if (!(Number(rate) >= 0 && Number(rate) <= 100)) throw new Error('Interest rate must be between 0 and 100.');
    if (!Number.isInteger(Number(months)) || months < 1 || months > MAX_MONTHS)
      throw new Error('Tenure must be a whole number of months from 1 to ' + MAX_MONTHS + '.');
  }

  /** Monthly instalment for principal p, annual rate (percent) and months. roundUp rounds up to the next rupee. */
  function emi(p, rate, months, roundUp) {
    check(p, rate, months);
    const r = rate / 1200;
    const raw = r === 0 ? p / months : (p * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
    return roundUp ? Math.ceil(r2(raw)) : r2(raw);
  }

  /** The largest loan a given monthly instalment can service. */
  function affordableLoan(monthlyEmi, rate, months) {
    check(1, rate, months);
    if (!(Number(monthlyEmi) > 0)) throw new Error('Enter the monthly amount you can pay.');
    const r = rate / 1200;
    return r2(r === 0 ? monthlyEmi * months : (monthlyEmi * (1 - Math.pow(1 + r, -months))) / r);
  }

  /** ISO date plus whole months, clamped to the month end (31 Jan + 1 month = 28/29 Feb). */
  function addMonths(iso, n) {
    const d = new Date(OT.parseIsoDate(iso));
    const day = d.getUTCDate();
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
    const last = new Date(Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), Math.min(day, last))).toISOString().slice(0, 10);
  }

  /**
   * schedule(opts): opts = { principal, rate, months, startDate (first instalment, optional), roundUp,
   *                          extraMonthly (added to every instalment), prepayments: [{ month (1-based), amount }] }
   * Returns { emi, rows: [{ n, date, opening, interest, principal, prepay, payment, closing }], totals }.
   */
  function schedule(opts) {
    const o = Object.assign({ startDate: '', roundUp: false, extraMonthly: 0, prepayments: [] }, opts);
    check(o.principal, o.rate, o.months);
    if (!(Number(o.extraMonthly) >= 0)) throw new Error('The extra monthly payment cannot be negative.');
    const pre = {};
    (o.prepayments || []).forEach((p) => {
      if (!Number.isInteger(Number(p.month)) || p.month < 1 || p.month > o.months)
        throw new Error('A prepayment month must be between 1 and ' + o.months + '.');
      if (!(Number(p.amount) > 0)) throw new Error('A prepayment amount must be more than zero.');
      pre[p.month] = r2((pre[p.month] || 0) + Number(p.amount));
    });
    const E = emi(o.principal, o.rate, o.months, o.roundUp);
    const r = o.rate / 1200;
    const rows = [];
    let bal = r2(o.principal);
    for (let n = 1; bal > 0 && n <= MAX_MONTHS + 1; n++) {
      const interest = r2(bal * r);
      let pay = r2(E + Number(o.extraMonthly));
      let principal = r2(pay - interest);
      if (principal < 0) principal = 0; // interest alone is larger than the instalment (cannot happen with a normal EMI)
      let prepay = pre[n] || 0;
      if (principal + prepay >= bal || n === o.months) {
        principal = Math.min(principal, bal);
        prepay = r2(bal - principal);
        if (n === o.months && prepay > 0 && !pre[n]) {
          principal = bal;
          prepay = 0;
        }
        pay = r2(interest + principal);
      }
      const closing = r2(bal - principal - prepay);
      rows.push({
        n: n,
        date: o.startDate ? addMonths(o.startDate, n - 1) : '',
        opening: bal,
        interest: interest,
        principal: principal,
        prepay: prepay,
        payment: pay,
        closing: closing,
      });
      bal = closing;
    }
    const interest = r2(rows.reduce((a, x) => a + x.interest, 0));
    const prepaid = r2(rows.reduce((a, x) => a + x.prepay, 0));
    const paid = r2(rows.reduce((a, x) => a + x.payment + x.prepay, 0));
    return {
      emi: E,
      rows: rows,
      totals: {
        months: rows.length,
        interest: interest,
        prepaid: prepaid,
        paid: paid,
        principal: r2(o.principal),
        endDate: rows.length && rows[rows.length - 1].date,
      },
    };
  }

  /** Compare the loan as planned with a version that has no prepayment or extra payment. */
  function compare(opts) {
    const base = schedule(Object.assign({}, opts, { extraMonthly: 0, prepayments: [] }));
    const plan = schedule(opts);
    return {
      base: base,
      plan: plan,
      interestSaved: r2(base.totals.interest - plan.totals.interest),
      monthsSaved: base.totals.months - plan.totals.months,
    };
  }

  /** Total interest and principal per calendar year (or per loan year when no start date). */
  function yearly(rows) {
    const by = {};
    rows.forEach((x) => {
      const k = x.date ? x.date.slice(0, 4) : 'Year ' + Math.ceil(x.n / 12);
      by[k] = by[k] || { label: k, interest: 0, principal: 0, closing: 0 };
      by[k].interest = r2(by[k].interest + x.interest);
      by[k].principal = r2(by[k].principal + x.principal + x.prepay);
      by[k].closing = x.closing;
    });
    return Object.keys(by).map((k) => by[k]);
  }

  /** Parse "month: amount" lines, for example "12: 50000". Returns { list, errors }. */
  function parsePrepayments(text) {
    const list = [];
    const errors = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        const m = /^(\d+)\s*[:,=\t ]\s*([\d,]+(?:\.\d+)?)$/.exec(line);
        const amount = m ? OT.parseAmount(m[2]) : null;
        if (!m || !amount || Number(m[1]) < 1) return errors.push('Line ' + (i + 1) + ': write it like "12: 50000" (month, then amount).');
        list.push({ month: Number(m[1]), amount: amount });
      });
    return { list: list, errors: errors };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };

  function toCsv(res) {
    const head = ['No', 'Date', 'Opening balance', 'Interest', 'Principal', 'Prepayment', 'Payment', 'Closing balance'];
    const rows = res.rows.map((x) => [x.n, x.date, x.opening, x.interest, x.principal, x.prepay, x.payment, x.closing]);
    return (
      '﻿' +
      [head]
        .concat(rows)
        .map((r) => r.map(cell).join(','))
        .join('\r\n')
    );
  }

  function sanitize(s) {
    return String(s)
      .replace(/₹/g, 'Rs.')
      .replace(/[^ -~\u00a0-ÿ]/g, '?');
  }

  /** PDF: summary and the full schedule. meta = { title, lender, borrower, rate, years }. */
  async function buildPdf(PDFLib, res, meta) {
    const md = meta || {};
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    doc.setTitle(md.title || 'Loan schedule');
    doc.setCreator('Finance Pocket Tools');
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const W = 595.28;
    const H = 841.89;
    const M = 40;
    let page;
    let y;
    const t = (s, x, size, f, right) => {
      const v = sanitize(s);
      const ff = f || font;
      page.drawText(v, { x: right ? x - ff.widthOfTextAtSize(v, size) : x, y: y, size: size, font: ff, color: rgb(0.1, 0.1, 0.12) });
    };
    const xs = [M, M + 28, M + 100, M + 190, M + 280, M + 360, M + 440];
    const heads = ['No', 'Date', 'Opening', 'Interest', 'Principal', 'Prepaid', 'Closing'];
    const header = () => {
      page.drawRectangle({ x: M - 2, y: y - 4, width: W - 2 * M + 4, height: 15, color: rgb(0.93, 0.94, 0.96) });
      heads.forEach((h, i) => t(h, i < 2 ? xs[i] : xs[i] + 62, 8, bold, i >= 2));
      y -= 15;
    };
    const fresh = () => {
      page = doc.addPage([W, H]);
      y = H - M;
    };
    fresh();
    t(md.title || 'Loan repayment schedule', M, 16, bold);
    y -= 20;
    [
      md.borrower ? 'Borrower: ' + md.borrower : '',
      md.lender ? 'Lender: ' + md.lender : '',
      'Loan amount: Rs. ' +
        OT.formatInr(res.totals.principal, 2) +
        '   Interest rate: ' +
        (md.rate !== undefined ? md.rate : '') +
        '% a year   Instalments: ' +
        res.totals.months,
      'Monthly instalment: Rs. ' +
        OT.formatInr(res.emi, 2) +
        '   Total interest: Rs. ' +
        OT.formatInr(res.totals.interest, 2) +
        '   Total paid: Rs. ' +
        OT.formatInr(res.totals.paid, 2),
    ]
      .filter(Boolean)
      .forEach((l) => {
        t(l, M, 9.5, font);
        y -= 14;
      });
    y -= 8;
    header();
    res.rows.forEach((x) => {
      if (y < 60) {
        fresh();
        header();
      }
      t(String(x.n), xs[0], 8, font);
      t(x.date ? OT.formatDate(x.date, 'dmy') : '', xs[1], 8, font);
      [x.opening, x.interest, x.principal, x.prepay, x.closing].forEach((v, i) => t(OT.formatInr(v, 2), xs[i + 2] + 62, 8, font, true));
      y -= 11;
    });
    y -= 8;
    if (y < 60) fresh();
    t(
      'Estimate for planning. Your lender statement is the final word: rounding and the exact date of each instalment can differ.',
      M,
      7.5,
      font,
    );
    doc
      .getPages()
      .forEach((p, i, all) =>
        p.drawText('Page ' + (i + 1) + ' of ' + all.length, { x: W - M - 50, y: 20, size: 7.5, font: font, color: rgb(0.45, 0.47, 0.52) }),
      );
    return doc.save();
  }

  return {
    emi: emi,
    affordableLoan: affordableLoan,
    addMonths: addMonths,
    schedule: schedule,
    compare: compare,
    yearly: yearly,
    parsePrepayments: parsePrepayments,
    toCsv: toCsv,
    sanitize: sanitize,
    buildPdf: buildPdf,
  };
});
