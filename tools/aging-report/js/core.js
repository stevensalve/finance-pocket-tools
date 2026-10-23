/**
 * Receivables & Payables Aging - core logic (pure; "today" / as-of date is always passed in).
 *
 * An open item is { line, party, invoice, date (ISO), due (ISO), amount } where amount is what is still outstanding
 * (a credit note or advance can be negative). Age is counted from the due date (default) or the invoice date.
 * Buckets: "Not due" (only when counting from the due date) then ranges set by the edges, e.g. [30, 60, 90] gives
 * 1-30, 31-60, 61-90 and Over 90 days.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.AgingCore = factory(root.OT);
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
    party: ['party', 'party name', 'customer', 'customer name', 'vendor', 'vendor name', 'supplier', 'supplier name', 'name', 'ledger'],
    invoice: ['invoice', 'invoice no', 'invoice number', 'bill no', 'bill number', 'ref no', 'reference', 'voucher no', 'doc no'],
    date: ['date', 'invoice date', 'bill date', 'doc date', 'voucher date'],
    due: ['due date', 'due', 'payment due', 'due on'],
    amount: [
      'amount',
      'outstanding',
      'balance',
      'pending',
      'pending amount',
      'outstanding amount',
      'balance due',
      'open amount',
      'amount due',
    ],
  };

  /** Rows (with header) -> { items, errors }. creditDays fills a missing due date from the invoice date. */
  function rowsToItems(aoa, creditDays) {
    const cd = Number.isFinite(Number(creditDays)) ? Number(creditDays) : 30;
    const rows = (aoa || []).filter((r) => Array.isArray(r) && r.some((c) => norm(c) !== ''));
    if (rows.length < 2) return { items: [], errors: ['The file needs a header row and at least one open item.'] };
    const head = rows[0].map((h) => norm(h).toLowerCase());
    const col = {};
    Object.keys(HEADERS).forEach((k) => (col[k] = head.findIndex((h) => HEADERS[k].indexOf(h) !== -1)));
    if (col.party === -1 || col.amount === -1 || (col.date === -1 && col.due === -1))
      return { items: [], errors: ['Need columns for Party, Amount outstanding, and an Invoice date or Due date.'] };
    const items = [];
    const errors = [];
    rows.slice(1).forEach((r, i) => {
      const line = i + 2;
      const raw = norm(r[col.amount]).replace(/,/g, '');
      let neg = false;
      let t = raw;
      if (/^\(.*\)$/.test(t)) {
        neg = true;
        t = t.slice(1, -1);
      }
      const n = Number(t);
      if (t === '' || !Number.isFinite(n)) return errors.push('Row ' + line + ': the amount could not be read, so the row was skipped.');
      if (n === 0) return;
      const date = col.date === -1 ? '' : OT.toIsoDate(r[col.date]);
      let due = col.due === -1 ? '' : OT.toIsoDate(r[col.due]);
      if (!date && !due) return errors.push('Row ' + line + ': no usable date, so the row was skipped.');
      if (!due) due = OT.addDays(date, cd);
      items.push({
        line: line,
        party: norm(r[col.party]) || '(no name)',
        invoice: col.invoice === -1 ? '' : norm(r[col.invoice]),
        date: date || due,
        due: due,
        amount: r2(neg ? -n : n),
      });
    });
    return { items: items, errors: errors };
  }

  const labelsFor = (edges, fromDue) => {
    const out = fromDue ? ['Not due'] : [];
    let prev = 0;
    edges.forEach((e) => {
      out.push((fromDue || prev > 0 ? prev + 1 : 0) + '-' + e + ' days');
      prev = e;
    });
    out.push('Over ' + prev + ' days');
    return out;
  };

  /**
   * report(items, asOf, opts) opts: { from: "due" | "invoice", edges: [30,60,90] }
   * -> { labels, parties: [{ party, buckets: [..], total, overdue, oldest, items }], totals: { buckets, total, overdue }, asOf }
   * Parties are sorted by overdue amount (largest first).
   */
  function report(items, asOf, opts) {
    const o = Object.assign({ from: 'due', edges: [30, 60, 90] }, opts);
    OT.parseIsoDate(asOf);
    const edges = o.edges.map(Number);
    if (!edges.length || edges.some((e, i) => !Number.isInteger(e) || e < 1 || (i && e <= edges[i - 1])))
      throw new Error('Bucket limits must be whole numbers in increasing order, for example 30, 60, 90.');
    const fromDue = o.from !== 'invoice';
    const labels = labelsFor(edges, fromDue);
    const now = OT.parseIsoDate(asOf);
    const slot = (it) => {
      const age = Math.round((now - OT.parseIsoDate(fromDue ? it.due : it.date)) / DAY);
      if (fromDue && age <= 0) return { idx: 0, age: age };
      let k = 0;
      while (k < edges.length && age > edges[k]) k++;
      return { idx: k + (fromDue ? 1 : 0), age: age };
    };
    const map = {};
    items.forEach((it) => {
      const s = slot(it);
      const p = (map[it.party] = map[it.party] || {
        party: it.party,
        buckets: labels.map(() => 0),
        total: 0,
        overdue: 0,
        oldest: 0,
        items: [],
      });
      p.buckets[s.idx] = r2(p.buckets[s.idx] + it.amount);
      p.total = r2(p.total + it.amount);
      const overdueDays = Math.round((now - OT.parseIsoDate(it.due)) / DAY);
      if (overdueDays > 0) {
        p.overdue = r2(p.overdue + it.amount);
        if (it.amount > 0) p.oldest = Math.max(p.oldest, overdueDays);
      }
      p.items.push(Object.assign({}, it, { age: s.age, overdueDays: Math.max(0, overdueDays), bucket: labels[s.idx] }));
    });
    const parties = Object.keys(map)
      .map((k) => map[k])
      .sort((a, b) => b.overdue - a.overdue || b.total - a.total || a.party.localeCompare(b.party));
    const totals = {
      buckets: labels.map((_, i) => r2(parties.reduce((a, p) => a + p.buckets[i], 0))),
      total: r2(parties.reduce((a, p) => a + p.total, 0)),
      overdue: r2(parties.reduce((a, p) => a + p.overdue, 0)),
    };
    return { labels: labels, parties: parties, totals: totals, asOf: asOf, from: fromDue ? 'due' : 'invoice' };
  }

  /** Payment reminder for one party (an entry from report().parties). tone: "friendly" or "firm". */
  function reminder(p, opts) {
    const o = Object.assign({ tone: 'friendly', sender: '', company: '', currency: 'Rs. ' }, opts);
    const late = p.items.filter((i) => i.overdueDays > 0 && i.amount > 0).sort((a, b) => b.overdueDays - a.overdueDays);
    if (!late.length) return '';
    const sum = r2(late.reduce((a, i) => a + i.amount, 0));
    const lines = ['Dear ' + p.party + ',', ''];
    lines.push(
      o.tone === 'firm'
        ? 'Our records show that the following invoices are overdue for payment:'
        : 'A gentle reminder that the following invoices appear to be past their due date:',
      '',
    );
    late.forEach((i) =>
      lines.push(
        '- ' +
          (i.invoice || 'Invoice') +
          ' dated ' +
          OT.formatDate(i.date, 'dmy') +
          ', due ' +
          OT.formatDate(i.due, 'dmy') +
          ': ' +
          o.currency +
          OT.formatInr(i.amount, 2) +
          ' (' +
          i.overdueDays +
          ' days overdue)',
      ),
    );
    lines.push(
      '',
      'Total overdue: ' +
        o.currency +
        OT.formatInr(sum, 2) +
        (p.total !== sum ? ' (your total outstanding balance is ' + o.currency + OT.formatInr(p.total, 2) + ')' : ''),
      '',
    );
    lines.push(
      o.tone === 'firm'
        ? 'Please arrange payment within 7 days, or let us know the expected payment date. If you have already paid, kindly share the payment details so we can update our records.'
        : 'If you have already paid, please ignore this note and share the payment details so we can update our records. Otherwise, we would appreciate it if you could arrange payment soon.',
    );
    lines.push('', 'Thank you' + (o.sender ? ',\n' + o.sender : '') + (o.company ? '\n' + o.company : ''));
    return lines.join('\n');
  }

  /** All reminders, for parties whose overdue amount is at least `min`. */
  function reminders(rep, opts) {
    const min = Number(opts && opts.min) || 0;
    return rep.parties
      .filter((p) => p.overdue > 0 && p.overdue >= min)
      .map((p) => reminder(p, opts))
      .filter(Boolean)
      .join('\n\n----------\n\n');
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function toCsv(rep) {
    const head = ['Party'].concat(rep.labels, ['Total', 'Overdue']);
    const rows = rep.parties.map((p) => [p.party].concat(p.buckets, [p.total, p.overdue]));
    rows.push(['Total'].concat(rep.totals.buckets, [rep.totals.total, rep.totals.overdue]));
    return (
      '﻿' +
      [head]
        .concat(rows)
        .map((r) => r.map(cell).join(','))
        .join('\r\n')
    );
  }

  function sampleRows() {
    return [
      ['Customer', 'Invoice No', 'Invoice Date', 'Due Date', 'Outstanding'],
      ['Beta Ltd', 'INV-101', '01/07/2026', '31/07/2026', '120000'],
      ['Beta Ltd', 'INV-134', '15/09/2026', '15/10/2026', '60000'],
      ['Acme Foods', 'INV-120', '10/08/2026', '09/09/2026', '45000'],
      ['Acme Foods', 'INV-150', '10/10/2026', '09/11/2026', '30000'],
      ['Gamma LLP', 'INV-099', '01/05/2026', '31/05/2026', '80000'],
      ['Gamma LLP', 'CN-007', '05/10/2026', '', '(5000)'],
      ['Delta Traders', 'INV-155', '18/10/2026', '17/11/2026', '25000'],
    ];
  }

  return { rowsToItems: rowsToItems, report: report, reminder: reminder, reminders: reminders, toCsv: toCsv, sampleRows: sampleRows };
});
