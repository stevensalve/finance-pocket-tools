/**
 * Budget vs Actual - core logic (pure).
 *
 * Both budget and actual come in as spreadsheet rows, in either layout:
 *   long: Category, Month (a date, or a month name), Amount [, Type]
 *   wide: Category [, Type], then one column per month (Apr, May ... or a full date)
 * Months are keys like "2026-04". The financial year runs April-March; month names are placed using the start year you give.
 * Variance = actual - budget. For an expense, going over budget is unfavourable; for income, falling short is unfavourable.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.BudgetCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const LONG_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  /** The 12 month keys of the financial year that starts in April of `startYear`. */
  function fyMonths(startYear) {
    const out = [];
    for (let i = 0; i < 12; i++) {
      const m = (3 + i) % 12;
      const y = startYear + (3 + i >= 12 ? 1 : 0);
      out.push(y + '-' + String(m + 1).padStart(2, '0'));
    }
    return out;
  }
  function monthLabel(key) {
    const m = /^(\d{4})-(\d{2})$/.exec(key);
    return m ? LONG_NAMES[Number(m[2]) - 1].slice(0, 3) + ' ' + m[1] : key;
  }

  /** A month cell (a date, "Apr", "April 2026", "2026-04") -> key, using startYear for bare names. "" when unreadable. */
  function monthKey(value, startYear) {
    const s = norm(value);
    if (!s) return '';
    let m = /^(\d{4})-(\d{2})$/.exec(s);
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return s;
    const iso = OT.toIsoDate(value);
    if (iso) return iso.slice(0, 7);
    m = /^([A-Za-z]{3,9})\.?[ \-']*(\d{2,4})?$/.exec(s);
    if (m) {
      const idx = MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase());
      if (idx === -1) return '';
      let y;
      if (m[2]) {
        y = Number(m[2]);
        if (y < 100) y += 2000;
      } else {
        if (!Number.isInteger(startYear)) return '';
        y = idx >= 3 ? startYear : startYear + 1;
      }
      return y + '-' + String(idx + 1).padStart(2, '0');
    }
    return '';
  }

  function num(v) {
    let t = norm(v).replace(/,/g, '');
    if (t === '') return null;
    let neg = false;
    if (/^\(.*\)$/.test(t)) {
      neg = true;
      t = t.slice(1, -1);
    }
    const n = Number(t);
    return Number.isFinite(n) ? (neg ? -n : n) : NaN;
  }

  const isType = (v) =>
    /^(income|revenue|sales|receipt)/i.test(norm(v)) ? 'income' : /^(expense|cost|spend|payment)/i.test(norm(v)) ? 'expense' : '';

  /** rows (with header) -> { cells: [{ category, month, amount, type }], errors }. */
  function rowsToCells(aoa, startYear) {
    const rows = (aoa || []).filter((r) => Array.isArray(r) && r.some((c) => norm(c) !== ''));
    if (rows.length < 2) return { cells: [], errors: ['The file needs a header row and at least one line.'] };
    const head = rows[0].map((h) => norm(h));
    const low = head.map((h) => h.toLowerCase());
    const cat = low.findIndex(
      (h) => ['category', 'head', 'account', 'ledger', 'item', 'particulars', 'line item', 'cost centre'].indexOf(h) !== -1,
    );
    if (cat === -1) return { cells: [], errors: ['No Category column found.'] };
    const typeCol = low.findIndex((h) => h === 'type');
    const monthCol = low.findIndex((h) => ['month', 'date', 'period'].indexOf(h) !== -1);
    const amtCol = low.findIndex((h) => ['amount', 'value', 'budget', 'actual', 'actuals'].indexOf(h) !== -1);
    const cells = [];
    const errors = [];
    if (monthCol !== -1 && amtCol !== -1) {
      rows.slice(1).forEach((r, i) => {
        const line = i + 2;
        const c = norm(r[cat]);
        if (!c) return;
        const mk = monthKey(r[monthCol], startYear);
        const n = num(r[amtCol]);
        if (!mk) return errors.push('Row ' + line + ': the month could not be read, so the row was skipped.');
        if (n === null || Number.isNaN(n)) return errors.push('Row ' + line + ': the amount could not be read, so the row was skipped.');
        cells.push({ category: c, month: mk, amount: r2(n), type: typeCol === -1 ? '' : isType(r[typeCol]) });
      });
      return { cells: cells, errors: errors };
    }
    const monthCols = head.map((h, i) => ({ i: i, key: i === cat || i === typeCol ? '' : monthKey(h, startYear) })).filter((x) => x.key);
    if (!monthCols.length) return { cells: [], errors: ['Could not find month columns (like Apr, May, Jun) or Month and Amount columns.'] };
    rows.slice(1).forEach((r, i) => {
      const line = i + 2;
      const c = norm(r[cat]);
      if (!c) return;
      monthCols.forEach((m) => {
        const n = num(r[m.i]);
        if (n === null) return;
        if (Number.isNaN(n)) return errors.push('Row ' + line + ': a ' + monthLabel(m.key) + ' amount could not be read and was left out.');
        cells.push({ category: c, month: m.key, amount: r2(n), type: typeCol === -1 ? '' : isType(r[typeCol]) });
      });
    });
    return { cells: cells, errors: errors };
  }

  /**
   * compare(budgetCells, actualCells, opts) opts: { months: [keys] (default: every month found), through: key (year to date), tolerance: % (default 5) }
   * -> { months, lines: [{ category, type, budget, actual, variance, variancePct, favourable, status, byMonth: { key: { budget, actual } } }], totals }
   */
  function compare(budget, actual, opts) {
    const o = Object.assign({ tolerance: 5 }, opts);
    if (!(o.tolerance >= 0 && o.tolerance <= 100)) throw new Error('Tolerance must be between 0 and 100 percent.');
    let months = o.months || Array.from(new Set(budget.concat(actual).map((c) => c.month))).sort();
    if (o.through) months = months.filter((m) => m <= o.through);
    const set = new Set(months);
    const map = {};
    const add = (c, which) => {
      if (!set.has(c.month)) return;
      const key = c.category.toLowerCase();
      const l = (map[key] = map[key] || { category: c.category, type: '', budget: 0, actual: 0, byMonth: {} });
      if (c.type) l.type = c.type;
      l[which] = r2(l[which] + c.amount);
      l.byMonth[c.month] = l.byMonth[c.month] || { budget: 0, actual: 0 };
      l.byMonth[c.month][which] = r2(l.byMonth[c.month][which] + c.amount);
    };
    budget.forEach((c) => add(c, 'budget'));
    actual.forEach((c) => add(c, 'actual'));
    const lines = Object.keys(map).map((k) => map[k]);
    lines.forEach((l) => {
      l.type = l.type || (/revenue|sales|income/i.test(l.category) ? 'income' : 'expense');
      l.variance = r2(l.actual - l.budget);
      l.variancePct = l.budget !== 0 ? r2((l.variance / Math.abs(l.budget)) * 100) : l.actual !== 0 ? null : 0;
      const better = l.type === 'income' ? l.variance > 0 : l.variance < 0;
      const worse = l.type === 'income' ? l.variance < 0 : l.variance > 0;
      const big = l.variancePct === null || Math.abs(l.variancePct) > o.tolerance;
      l.favourable = l.variance === 0 ? null : better;
      l.status = !big || l.variance === 0 ? 'on budget' : worse ? 'unfavourable' : 'favourable';
    });
    lines.sort((a, b) =>
      a.type === b.type
        ? Math.abs(b.variance) - Math.abs(a.variance) || a.category.localeCompare(b.category)
        : a.type === 'income'
          ? -1
          : 1,
    );
    const sum = (type, f) => r2(lines.filter((l) => l.type === type).reduce((a, l) => a + l[f], 0));
    const totals = {
      incomeBudget: sum('income', 'budget'),
      incomeActual: sum('income', 'actual'),
      expenseBudget: sum('expense', 'budget'),
      expenseActual: sum('expense', 'actual'),
    };
    totals.netBudget = r2(totals.incomeBudget - totals.expenseBudget);
    totals.netActual = r2(totals.incomeActual - totals.expenseActual);
    totals.netVariance = r2(totals.netActual - totals.netBudget);
    return { months: months, lines: lines, totals: totals };
  }

  /** Year-end outlook: actual so far plus the budget still to come (months after `through`). */
  function outlook(budget, actual, through, allMonths) {
    const done = compare(budget, actual, { months: allMonths, through: through });
    const rest = allMonths.filter((m) => m > through);
    const left = compare(budget, [], { months: rest });
    const net = r2(done.totals.netActual + left.totals.netBudget);
    const fullBudget = compare(budget, [], { months: allMonths }).totals.netBudget;
    return {
      actualToDate: done.totals.netActual,
      budgetRemaining: left.totals.netBudget,
      expectedNet: net,
      budgetNet: fullBudget,
      difference: r2(net - fullBudget),
      monthsLeft: rest.length,
    };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function toCsv(res) {
    const head = ['Category', 'Type', 'Budget', 'Actual', 'Variance', 'Variance %', 'Status'];
    const rows = res.lines.map((l) => [
      l.category,
      l.type,
      l.budget,
      l.actual,
      l.variance,
      l.variancePct === null ? 'n/a' : l.variancePct,
      l.status,
    ]);
    const t = res.totals;
    rows.push(['Net (income - expense)', '', t.netBudget, t.netActual, t.netVariance, '', '']);
    return (
      '﻿' +
      [head]
        .concat(rows)
        .map((r) => r.map(cell).join(','))
        .join('\r\n')
    );
  }

  function sample(startYear) {
    const m = fyMonths(startYear);
    const mm = (key) => LONG_NAMES[Number(key.slice(5)) - 1].slice(0, 3);
    const rowsFor = (cats) => [['Category', 'Type'].concat(m.map(mm))].concat(cats.map((c) => [c[0], c[1]].concat(c[2])));
    const flat = (n, v) => new Array(n).fill(v);
    return {
      budget: rowsFor([
        ['Sales', 'Income', flat(12, 1000000)],
        ['Salaries', 'Expense', flat(12, 400000)],
        ['Rent', 'Expense', flat(12, 100000)],
        ['Marketing', 'Expense', flat(12, 80000)],
        ['Travel', 'Expense', flat(12, 40000)],
      ]),
      actual: rowsFor([
        ['Sales', 'Income', [980000, 1050000, 910000, 1020000, 990000, 1100000, '', '', '', '', '', '']],
        ['Salaries', 'Expense', [400000, 405000, 410000, 410000, 410000, 415000, '', '', '', '', '', '']],
        ['Rent', 'Expense', [100000, 100000, 100000, 100000, 100000, 100000, '', '', '', '', '', '']],
        ['Marketing', 'Expense', [70000, 95000, 120000, 90000, 60000, 110000, '', '', '', '', '', '']],
        ['Travel', 'Expense', [20000, 25000, 38000, 52000, 61000, 44000, '', '', '', '', '', '']],
      ]),
    };
  }

  return {
    fyMonths: fyMonths,
    monthLabel: monthLabel,
    monthKey: monthKey,
    rowsToCells: rowsToCells,
    compare: compare,
    outlook: outlook,
    toCsv: toCsv,
    sample: sample,
  };
});
