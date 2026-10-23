/**
 * Expense Claims Summariser - core logic (pure; "today" is always passed in).
 *
 * Claim: { line, employee, date (ISO), category, amount, desc, bill, receipt (true / false / null when unknown) }
 * Policy (all optional): { limits: { "meals": 1000, ... } per claim by category (case-insensitive),
 *   receiptAbove: amount above which a receipt is needed, maxAgeDays: oldest claim allowed, monthlyCap: per employee per month }
 * Flags are information for the reviewer, not a verdict.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.ExpenseCore = factory(root.OT);
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
    employee: ['employee', 'employee name', 'name', 'claimant', 'emp name', 'submitted by'],
    date: ['date', 'expense date', 'bill date', 'claim date', 'invoice date'],
    category: ['category', 'expense type', 'type', 'head', 'expense category', 'nature'],
    amount: ['amount', 'claim amount', 'claimed', 'total', 'value', 'amount claimed'],
    desc: ['description', 'details', 'remarks', 'purpose', 'narration'],
    bill: ['bill no', 'bill number', 'invoice no', 'receipt no', 'reference', 'claim id', 'bill'],
    receipt: ['receipt', 'receipt attached', 'bill attached', 'proof', 'receipt?', 'attachment'],
  };

  const yes = (v) => /^(y|yes|true|1|attached|available|✓)$/i.test(norm(v));
  const no = (v) => /^(n|no|false|0|missing|na|n\/a|none)$/i.test(norm(v));

  /** Rows (with header) -> { claims, errors }. */
  function rowsToClaims(aoa) {
    const rows = (aoa || []).filter((r) => Array.isArray(r) && r.some((c) => norm(c) !== ''));
    if (rows.length < 2) return { claims: [], errors: ['The file needs a header row and at least one claim.'] };
    const head = rows[0].map((h) => norm(h).toLowerCase());
    const col = {};
    Object.keys(HEADERS).forEach((k) => (col[k] = head.findIndex((h) => HEADERS[k].indexOf(h) !== -1)));
    if (col.employee === -1 || col.amount === -1 || col.date === -1)
      return { claims: [], errors: ['Need columns for Employee, Date and Amount.'] };
    const claims = [];
    const errors = [];
    rows.slice(1).forEach((r, i) => {
      const line = i + 2;
      const t = norm(r[col.amount])
        .replace(/,/g, '')
        .replace(/^(rs\.?|inr|₹)\s*/i, '');
      const amount = Number(t);
      if (t === '' || !Number.isFinite(amount))
        return errors.push('Row ' + line + ': the amount could not be read, so the row was skipped.');
      if (amount <= 0) return errors.push('Row ' + line + ': the amount is zero or negative, so the row was skipped.');
      const date = OT.toIsoDate(r[col.date]);
      if (!date) return errors.push('Row ' + line + ': the date could not be read, so the row was skipped.');
      const emp = norm(r[col.employee]);
      if (!emp) return errors.push('Row ' + line + ': no employee name, so the row was skipped.');
      const rc = col.receipt === -1 ? '' : r[col.receipt];
      claims.push({
        line: line,
        employee: emp,
        date: date,
        category: col.category === -1 ? '' : norm(r[col.category]) || 'Uncategorised',
        amount: r2(amount),
        desc: col.desc === -1 ? '' : norm(r[col.desc]),
        bill: col.bill === -1 ? '' : norm(r[col.bill]),
        receipt: yes(rc) ? true : no(rc) ? false : null,
      });
    });
    if (col.category === -1) claims.forEach((c) => (c.category = 'Uncategorised'));
    return { claims: claims, errors: errors };
  }

  /** "Meals: 1000" lines -> { limits, errors }. */
  function parseLimits(text) {
    const limits = {};
    const errors = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        const m = /^(.+?)\s*[:=,]\s*([\d,]+(?:\.\d+)?)$/.exec(line);
        const v = m ? OT.parseAmount(m[2]) : null;
        if (!m || !v) return errors.push('Line ' + (i + 1) + ': write it like "Meals: 1000".');
        limits[norm(m[1]).toLowerCase()] = v;
      });
    return { limits: limits, errors: errors };
  }

  /** Check every claim; returns claims with a `flags` array. */
  function review(claims, policy, today) {
    const p = Object.assign({ limits: {}, receiptAbove: 0, maxAgeDays: 0, monthlyCap: 0 }, policy);
    OT.parseIsoDate(today);
    const now = OT.parseIsoDate(today);
    const out = claims.map((c) => Object.assign({}, c, { flags: [] }));
    const seen = {};
    const month = {};
    out.forEach((c) => {
      const lim = p.limits[c.category.toLowerCase()];
      if (lim !== undefined && c.amount > lim)
        c.flags.push('Over the ' + c.category + ' limit of ' + OT.formatInr(lim, 0) + ' by ' + OT.formatInr(r2(c.amount - lim), 2) + '.');
      if (p.receiptAbove > 0 && c.amount > p.receiptAbove && c.receipt !== true)
        c.flags.push(
          c.receipt === false
            ? 'No receipt for a claim above ' + OT.formatInr(p.receiptAbove, 0) + '.'
            : 'Receipt not confirmed for a claim above ' + OT.formatInr(p.receiptAbove, 0) + '.',
        );
      if (p.maxAgeDays > 0) {
        const age = Math.round((now - OT.parseIsoDate(c.date)) / DAY);
        if (age > p.maxAgeDays) c.flags.push('Claimed ' + age + ' days after the expense (limit ' + p.maxAgeDays + ').');
        if (age < 0) c.flags.push('The expense date is in the future.');
      } else if (OT.parseIsoDate(c.date) > now) c.flags.push('The expense date is in the future.');
      const k1 = [c.employee.toLowerCase(), c.date, Math.round(c.amount * 100), c.category.toLowerCase()].join('|');
      if (seen[k1]) c.flags.push('Looks like a duplicate of row ' + seen[k1] + ' (same person, date, amount and category).');
      else seen[k1] = c.line;
      if (c.bill) {
        const k2 = 'bill|' + c.bill.toLowerCase();
        if (seen[k2] && seen[k2].employee !== c.employee.toLowerCase())
          c.flags.push('Bill number ' + c.bill + ' was also claimed by someone else (row ' + seen[k2].line + ').');
        else if (seen[k2] && seen[k2].line !== c.line && !c.flags.some((f) => /duplicate/.test(f)))
          c.flags.push('Bill number ' + c.bill + ' appears again (row ' + seen[k2].line + ').');
        if (!seen[k2]) seen[k2] = { line: c.line, employee: c.employee.toLowerCase() };
      }
      const mk = c.employee.toLowerCase() + '|' + c.date.slice(0, 7);
      month[mk] = r2((month[mk] || 0) + c.amount);
    });
    if (p.monthlyCap > 0) {
      const flagged = {};
      out.forEach((c) => {
        const mk = c.employee.toLowerCase() + '|' + c.date.slice(0, 7);
        if (month[mk] > p.monthlyCap && !flagged[mk]) {
          flagged[mk] = true;
          c.flags.push(
            c.employee +
              ' has claimed ' +
              OT.formatInr(month[mk], 2) +
              ' in ' +
              c.date.slice(0, 7) +
              ', above the monthly cap of ' +
              OT.formatInr(p.monthlyCap, 0) +
              '.',
          );
        }
      });
    }
    return out;
  }

  /** Totals by employee, category and month, plus the flagged claims. */
  function summarise(reviewed) {
    const grp = (keyFn) => {
      const m = {};
      reviewed.forEach((c) => {
        const k = keyFn(c);
        const g = (m[k] = m[k] || { key: k, count: 0, total: 0, flagged: 0, flaggedAmount: 0 });
        g.count++;
        g.total = r2(g.total + c.amount);
        if (c.flags.length) {
          g.flagged++;
          g.flaggedAmount = r2(g.flaggedAmount + c.amount);
        }
      });
      return Object.keys(m).map((k) => m[k]);
    };
    const byEmployee = grp((c) => c.employee).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
    const byCategory = grp((c) => c.category).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
    const byMonth = grp((c) => c.date.slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key));
    const flagged = reviewed.filter((c) => c.flags.length);
    return {
      total: r2(reviewed.reduce((a, c) => a + c.amount, 0)),
      count: reviewed.length,
      byEmployee: byEmployee,
      byCategory: byCategory,
      byMonth: byMonth,
      flagged: flagged,
      flaggedAmount: r2(flagged.reduce((a, c) => a + c.amount, 0)),
    };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  /** Every claim with its flags. */
  function toCsv(reviewed) {
    const head = ['Row', 'Employee', 'Date', 'Category', 'Amount', 'Description', 'Bill no', 'Receipt', 'Flags'];
    const rows = reviewed.map((c) => [
      c.line,
      c.employee,
      c.date,
      c.category,
      c.amount,
      c.desc,
      c.bill,
      c.receipt === null ? '' : c.receipt ? 'Yes' : 'No',
      c.flags.join(' '),
    ]);
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
      ['Employee', 'Date', 'Category', 'Amount', 'Description', 'Bill No', 'Receipt'],
      ['Asha Rao', '03/10/2026', 'Meals', '850', 'Client lunch', 'B-101', 'Yes'],
      ['Asha Rao', '05/10/2026', 'Travel', '4200', 'Taxi to airport', 'B-102', 'Yes'],
      ['Ravi Kumar', '06/10/2026', 'Meals', '1800', 'Team dinner', 'B-103', 'No'],
      ['Ravi Kumar', '06/10/2026', 'Meals', '1800', 'Team dinner', 'B-103', 'No'],
      ['Meera Shah', '12/10/2026', 'Hotel', '9500', 'Pune stay', 'B-104', 'Yes'],
      ['Meera Shah', '30/06/2026', 'Travel', '2500', 'Cab', 'B-105', 'Yes'],
      ['Zoe Fernandes', '15/10/2026', 'Office supplies', '650', 'Stationery', '', ''],
      ['Asha Rao', '20/10/2026', 'Travel', '6000', 'Flight change fee', 'B-106', 'Yes'],
    ];
  }

  return {
    rowsToClaims: rowsToClaims,
    parseLimits: parseLimits,
    review: review,
    summarise: summarise,
    toCsv: toCsv,
    sampleRows: sampleRows,
  };
});
