/**
 * Bank Reconciliation - core logic (pure).
 *
 * Both lists become entries { id, line, date (ISO), desc, ref, amount } where money INTO the bank is positive and money OUT is negative.
 *   Bank statement: Credit / Deposit column = in, Debit / Withdrawal column = out.
 *   Books (the bank ledger): Debit column = in (the bank account is debited), Credit column = out.
 *   A single signed Amount column works for both (positive = in).
 * Matching runs in passes, each one-to-one, strongest first:
 *   1. same reference and same amount
 *   2. same amount, dates within the window (closest date first, shared words break ties)
 *   3. one entry equals the sum of 2 or 3 entries on the other side (dates within the window)
 * Whatever is left is the reconciling items.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.ReconCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const DAY = 86400000;

  const HEADERS = {
    date: ['date', 'txn date', 'transaction date', 'value date', 'posting date', 'voucher date'],
    desc: ['description', 'narration', 'particulars', 'details', 'remarks', 'transaction remarks', 'party', 'name'],
    ref: [
      'reference',
      'ref',
      'ref no',
      'cheque no',
      'chq no',
      'chq/ref no',
      'utr',
      'utr no',
      'voucher no',
      'instrument no',
      'transaction id',
      'cheque number',
    ],
    debit: ['debit', 'withdrawal', 'withdrawals', 'withdrawal amt', 'dr', 'debit amount', 'payments', 'payment'],
    credit: ['credit', 'deposit', 'deposits', 'deposit amt', 'cr', 'credit amount', 'receipts', 'receipt'],
    amount: ['amount', 'txn amount', 'transaction amount'],
    type: ['dr/cr', 'type', 'cr/dr'],
  };

  function num(v) {
    let t = norm(v).replace(/,/g, '');
    if (t === '') return null;
    let neg = false;
    if (/^\(.*\)$/.test(t)) {
      neg = true;
      t = t.slice(1, -1);
    }
    if (/dr$/i.test(t)) {
      neg = true;
      t = t.replace(/dr$/i, '');
    } else t = t.replace(/cr$/i, '');
    const n = Number(t.trim());
    return Number.isFinite(n) ? (neg ? -n : n) : NaN;
  }

  /** kind "bank" or "book". Returns { entries, errors }. */
  function rowsToEntries(aoa, kind) {
    const rows = (aoa || []).filter((r) => Array.isArray(r) && r.some((c) => norm(c) !== ''));
    if (rows.length < 2) return { entries: [], errors: ['The file needs a header row and at least one line.'] };
    const head = rows[0].map((h) => norm(h).toLowerCase());
    const col = {};
    Object.keys(HEADERS).forEach((k) => (col[k] = head.findIndex((h) => HEADERS[k].indexOf(h) !== -1)));
    if (col.date === -1) return { entries: [], errors: ['No Date column found.'] };
    if (col.amount === -1 && col.debit === -1 && col.credit === -1)
      return { entries: [], errors: ['Need an Amount column, or Debit and Credit columns.'] };
    const entries = [];
    const errors = [];
    rows.slice(1).forEach((r, i) => {
      const line = i + 2;
      const date = OT.toIsoDate(r[col.date]);
      if (!date) return errors.push('Row ' + line + ': the date could not be read, so the line was skipped.');
      let amount = null;
      const cell = (k) => (col[k] === -1 ? null : num(r[col[k]]));
      const dr = cell('debit');
      const cr = cell('credit');
      const am = cell('amount');
      if ([dr, cr, am].some((x) => Number.isNaN(x)))
        return errors.push('Row ' + line + ': an amount could not be read, so the line was skipped.');
      if (dr !== null || cr !== null) {
        const d = Math.abs(dr || 0);
        const c = Math.abs(cr || 0);
        amount = kind === 'book' ? d - c : c - d;
      } else if (am !== null) {
        amount = am;
        const ty = col.type === -1 ? '' : norm(r[col.type]).toUpperCase();
        if (ty === 'DR' || ty === 'D' || ty === 'DEBIT') amount = kind === 'book' ? Math.abs(am) : -Math.abs(am);
        else if (ty === 'CR' || ty === 'C' || ty === 'CREDIT') amount = kind === 'book' ? -Math.abs(am) : Math.abs(am);
      }
      if (amount === null || amount === 0) return;
      entries.push({
        id: kind + '-' + line,
        line: line,
        date: date,
        desc: col.desc === -1 ? '' : norm(r[col.desc]),
        ref: col.ref === -1 ? '' : norm(r[col.ref]).replace(/^0+(?=\d)/, ''),
        amount: r2(amount),
      });
    });
    return { entries: entries, errors: errors };
  }

  const words = (s) =>
    new Set(
      norm(s)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2),
    );
  const shared = (a, b) => {
    const wa = words(a);
    let n = 0;
    words(b).forEach((w) => wa.has(w) && n++);
    return n;
  };
  const dayDiff = (a, b) => Math.abs(Math.round((OT.parseIsoDate(a) - OT.parseIsoDate(b)) / DAY));
  const cents = (n) => Math.round(n * 100);

  /** Flag lines that look entered twice (same date, amount and reference) inside one list. */
  function duplicates(entries) {
    const seen = {};
    const out = [];
    entries.forEach((e) => {
      const k = [e.date, cents(e.amount), e.ref.toLowerCase()].join('|');
      if (seen[k]) out.push({ first: seen[k], second: e });
      else seen[k] = e;
    });
    return out;
  }

  /**
   * match(bank, book, opts) -> { matched: [{ how, bank: [entries], book: [entries] }], unmatchedBank, unmatchedBook }
   * opts: { windowDays (default 3), groups (default true) }
   */
  function match(bank, book, opts) {
    const o = Object.assign({ windowDays: 3, groups: true }, opts);
    if (!(o.windowDays >= 0 && o.windowDays <= 60)) throw new Error('The date window must be between 0 and 60 days.');
    const matched = [];
    let ub = bank.slice();
    let uk = book.slice();
    const take = (list, ids) => list.filter((e) => ids.indexOf(e.id) === -1);

    // pass 1: reference + amount
    ub.slice().forEach((b) => {
      if (!b.ref) return;
      const m = uk.find((k) => k.ref && k.ref.toLowerCase() === b.ref.toLowerCase() && cents(k.amount) === cents(b.amount));
      if (m) {
        matched.push({ how: 'Reference and amount', bank: [b], book: [m] });
        ub = take(ub, [b.id]);
        uk = take(uk, [m.id]);
      }
    });

    // pass 2: amount + date window
    ub.slice().forEach((b) => {
      const c = uk.filter((k) => cents(k.amount) === cents(b.amount) && dayDiff(k.date, b.date) <= o.windowDays);
      if (!c.length) return;
      c.sort(
        (x, y) => dayDiff(x.date, b.date) - dayDiff(y.date, b.date) || shared(b.desc, y.desc) - shared(b.desc, x.desc) || x.line - y.line,
      );
      const m = c[0];
      matched.push({ how: 'Amount and date', bank: [b], book: [m] });
      ub = take(ub, [b.id]);
      uk = take(uk, [m.id]);
    });

    // pass 3: one entry = sum of 2 or 3 on the other side
    if (o.groups) {
      const groupPass = (singles, pool, singleIsBank) => {
        let s = singles.slice();
        let p = pool.slice();
        singles.forEach((one) => {
          if (!s.some((x) => x.id === one.id)) return;
          const cand = p
            .filter(
              (x) =>
                Math.sign(x.amount) === Math.sign(one.amount) &&
                Math.abs(x.amount) < Math.abs(one.amount) &&
                dayDiff(x.date, one.date) <= o.windowDays,
            )
            .slice(0, 40);
          let found = null;
          for (let i = 0; i < cand.length && !found; i++)
            for (let j = i + 1; j < cand.length && !found; j++) {
              if (cents(cand[i].amount + cand[j].amount) === cents(one.amount)) found = [cand[i], cand[j]];
              else
                for (let k = j + 1; k < cand.length && !found; k++)
                  if (cents(cand[i].amount + cand[j].amount + cand[k].amount) === cents(one.amount)) found = [cand[i], cand[j], cand[k]];
            }
          if (found) {
            matched.push({
              how: found.length + ' entries add up to one',
              bank: singleIsBank ? [one] : found,
              book: singleIsBank ? found : [one],
            });
            s = take(s, [one.id]);
            p = take(
              p,
              found.map((x) => x.id),
            );
          }
        });
        return [s, p];
      };
      let r = groupPass(ub, uk, true);
      ub = r[0];
      uk = r[1];
      r = groupPass(uk, ub, false);
      uk = r[0];
      ub = r[1];
    }
    return { matched: matched, unmatchedBank: ub, unmatchedBook: uk };
  }

  /**
   * Reconciliation statement from the closing balances shown on the bank statement and in the books.
   * Items in books but not in bank: deposits not yet credited (+) and cheques not yet presented (-): adjust the bank side.
   * Items in bank but not in books: adjust the book side. Difference should be zero.
   */
  function statement(res, bankBalance, bookBalance) {
    const sum = (l) => r2(l.reduce((a, e) => a + e.amount, 0));
    const inBooks = res.unmatchedBook;
    const inBank = res.unmatchedBank;
    const depositsNotCredited = sum(inBooks.filter((e) => e.amount > 0));
    const chequesNotPresented = sum(inBooks.filter((e) => e.amount < 0));
    const bankNotBooksIn = sum(inBank.filter((e) => e.amount > 0));
    const bankNotBooksOut = sum(inBank.filter((e) => e.amount < 0));
    const adjustedBank = r2(bankBalance + depositsNotCredited + chequesNotPresented);
    const adjustedBook = r2(bookBalance + bankNotBooksIn + bankNotBooksOut);
    return {
      bankBalance: r2(bankBalance),
      depositsNotCredited: depositsNotCredited,
      chequesNotPresented: chequesNotPresented,
      adjustedBank: adjustedBank,
      bookBalance: r2(bookBalance),
      bankNotBooksIn: bankNotBooksIn,
      bankNotBooksOut: bankNotBooksOut,
      adjustedBook: adjustedBook,
      difference: r2(adjustedBank - adjustedBook),
    };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  /** One CSV with every line and its status. */
  function toCsv(res) {
    const out = [['Status', 'Matched by', 'Source', 'Date', 'Description', 'Reference', 'Amount (+ in / - out)']];
    const put = (status, how, src, e) => out.push([status, how, src, e.date, e.desc, e.ref, e.amount]);
    res.matched.forEach((m) => {
      m.bank.forEach((e) => put('Matched', m.how, 'Bank', e));
      m.book.forEach((e) => put('Matched', m.how, 'Books', e));
    });
    res.unmatchedBank.forEach((e) => put('In bank, not in books', '', 'Bank', e));
    res.unmatchedBook.forEach((e) => put('In books, not in bank', '', 'Books', e));
    return '﻿' + out.map((r) => r.map(cell).join(',')).join('\r\n');
  }

  function sample() {
    return {
      bank: [
        ['Date', 'Narration', 'Chq/Ref No', 'Withdrawal', 'Deposit'],
        ['02/10/2026', 'NEFT Beta Ltd', 'N1001', '', '50000'],
        ['04/10/2026', 'Cheque 000231 Office rent', '000231', '25000', ''],
        ['09/10/2026', 'UPI Gamma Traders', '', '', '12000'],
        ['15/10/2026', 'Bank charges', '', '295', ''],
        ['20/10/2026', 'Interest credit', '', '', '410'],
        ['21/10/2026', 'Cash deposit', '', '', '3000'],
        ['21/10/2026', 'Cash deposit', '', '', '2000'],
      ],
      book: [
        ['Date', 'Particulars', 'Voucher No', 'Debit', 'Credit'],
        ['02/10/2026', 'Receipt from Beta Ltd', 'N1001', '50000', ''],
        ['03/10/2026', 'Rent paid - cheque 231', '231', '', '25000'],
        ['08/10/2026', 'Gamma Traders receipt', '', '12000', ''],
        ['22/10/2026', 'Cash deposited', '', '5000', ''],
        ['24/10/2026', 'Cheque to Vendor X (not yet presented)', '000244', '', '18000'],
        ['25/10/2026', 'Deposit in transit', '', '7500', ''],
      ],
    };
  }

  return { rowsToEntries: rowsToEntries, duplicates: duplicates, match: match, statement: statement, toCsv: toCsv, sample: sample };
});
