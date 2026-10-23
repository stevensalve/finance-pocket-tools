'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const b = require('../js/core.js');

test('fyMonths and monthLabel', () => {
  const m = b.fyMonths(2026);
  assert.equal(m.length, 12);
  assert.equal(m[0], '2026-04');
  assert.equal(m[8], '2026-12');
  assert.equal(m[9], '2027-01');
  assert.equal(m[11], '2027-03');
  assert.equal(b.monthLabel('2026-04'), 'Apr 2026');
  assert.equal(b.monthLabel('x'), 'x');
});

test('monthKey: dates, names, years, bad input', () => {
  assert.equal(b.monthKey('2026-04'), '2026-04');
  assert.equal(b.monthKey('15/05/2026'), '2026-05');
  assert.equal(b.monthKey('Apr', 2026), '2026-04');
  assert.equal(b.monthKey('Feb', 2026), '2027-02');
  assert.equal(b.monthKey('March 2027'), '2027-03');
  assert.equal(b.monthKey('Jun-26'), '2026-06');
  assert.equal(b.monthKey('Apr'), '', 'a bare name needs a start year');
  assert.equal(b.monthKey('Foo', 2026), '');
  assert.equal(b.monthKey('2026-13'), '');
  assert.equal(b.monthKey(''), '');
});

test('rowsToCells: wide layout with type and blanks', () => {
  const r = b.rowsToCells(
    [
      ['Category', 'Type', 'Apr', 'May', 'Jan'],
      ['Sales', 'Income', '100', '', '300'],
      ['Rent', 'Expense', '(50)', 'x', '10'],
    ],
    2026,
  );
  assert.deepEqual(
    r.cells.map((c) => [c.category, c.month, c.amount, c.type]),
    [
      ['Sales', '2026-04', 100, 'income'],
      ['Sales', '2027-01', 300, 'income'],
      ['Rent', '2026-04', -50, 'expense'],
      ['Rent', '2027-01', 10, 'expense'],
    ],
  );
  assert.equal(r.errors.length, 1);
});

test('rowsToCells: long layout, bad rows, missing columns', () => {
  const r = b.rowsToCells(
    [
      ['Account', 'Month', 'Amount'],
      ['Travel', 'Apr', '1,000'],
      ['Travel', 'zzz', '5'],
      ['Travel', 'May', 'abc'],
      ['', 'May', '5'],
    ],
    2026,
  );
  assert.equal(r.cells.length, 1);
  assert.equal(r.cells[0].amount, 1000);
  assert.equal(r.errors.length, 2);
  assert.match(
    b.rowsToCells(
      [
        ['Foo', 'Apr'],
        ['x', '1'],
      ],
      2026,
    ).errors[0],
    /No Category column/,
  );
  assert.match(
    b.rowsToCells(
      [
        ['Category', 'Foo'],
        ['x', '1'],
      ],
      2026,
    ).errors[0],
    /Could not find month columns/,
  );
  assert.match(b.rowsToCells([['Category']], 2026).errors[0], /header row/);
});

const C = (category, month, amount, type) => ({ category: category, month: month, amount: amount, type: type || '' });

test('compare: variance sign, favourable logic, status with tolerance', () => {
  const budget = [
    C('Sales', '2026-04', 1000, 'income'),
    C('Rent', '2026-04', 100, 'expense'),
    C('Travel', '2026-04', 100, 'expense'),
    C('Misc', '2026-04', 0, 'expense'),
  ];
  const actual = [
    C('Sales', '2026-04', 900, 'income'),
    C('Rent', '2026-04', 103, 'expense'),
    C('Travel', '2026-04', 60, 'expense'),
    C('Misc', '2026-04', 10, 'expense'),
  ];
  const r = b.compare(budget, actual, { tolerance: 5 });
  const by = (n) => r.lines.find((l) => l.category === n);
  assert.equal(by('Sales').variance, -100);
  assert.equal(by('Sales').variancePct, -10);
  assert.equal(by('Sales').status, 'unfavourable');
  assert.equal(by('Rent').status, 'on budget', '3% is inside the 5% tolerance');
  assert.equal(by('Travel').status, 'favourable');
  assert.equal(by('Travel').variancePct, -40);
  assert.equal(by('Misc').variancePct, null, 'spend with no budget has no percentage');
  assert.equal(by('Misc').status, 'unfavourable');
  assert.equal(r.totals.incomeActual, 900);
  assert.equal(r.totals.expenseActual, 173);
  assert.equal(r.totals.netBudget, 1000 - 200);
  assert.equal(r.totals.netActual, 900 - 173);
  assert.equal(r.totals.netVariance, 727 - 800);
  assert.equal(r.lines[0].type, 'income', 'income first');
  assert.throws(() => b.compare([], [], { tolerance: 500 }), /between 0 and 100/);
});

test('compare: category names match ignoring case; type guessed from the name; through limits months', () => {
  const r = b.compare([C('Sales', '2026-04', 100), C('Sales', '2026-05', 100)], [C('SALES', '2026-04', 90), C('SALES', '2026-05', 120)], {
    through: '2026-04',
  });
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].type, 'income');
  assert.equal(r.lines[0].budget, 100);
  assert.equal(r.lines[0].actual, 90);
  assert.deepEqual(r.months, ['2026-04']);
  assert.deepEqual(r.lines[0].byMonth['2026-04'], { budget: 100, actual: 90 });
});

test('sample: first six months compared', () => {
  const s = b.sample(2026);
  const bud = b.rowsToCells(s.budget, 2026).cells;
  const act = b.rowsToCells(s.actual, 2026).cells;
  const months = b.fyMonths(2026);
  const r = b.compare(bud, act, { through: months[5], months: months });
  assert.equal(r.lines.length, 5);
  const mk = r.lines.find((l) => l.category === 'Marketing');
  assert.equal(mk.budget, 480000);
  assert.equal(mk.actual, 545000);
  assert.equal(mk.status, 'unfavourable');
  const tr = r.lines.find((l) => l.category === 'Travel');
  assert.equal(tr.actual, 240000);
  assert.equal(tr.variancePct, 0);
  assert.equal(r.totals.incomeActual, 6050000);
});

test('outlook = actual to date + budget still to come', () => {
  const s = b.sample(2026);
  const months = b.fyMonths(2026);
  const o = b.outlook(b.rowsToCells(s.budget, 2026).cells, b.rowsToCells(s.actual, 2026).cells, months[5], months);
  assert.equal(o.monthsLeft, 6);
  assert.equal(o.budgetRemaining, 6 * (1000000 - 620000));
  assert.equal(o.budgetNet, 12 * 380000);
  assert.equal(o.expectedNet, o.actualToDate + o.budgetRemaining);
  assert.equal(o.difference, o.expectedNet - o.budgetNet);
});

test('toCsv', () => {
  const s = b.sample(2026);
  const r = b.compare(b.rowsToCells(s.budget, 2026).cells, b.rowsToCells(s.actual, 2026).cells, {});
  const csv = b.toCsv(r);
  assert.ok(csv.startsWith('﻿Category,Type,Budget,Actual,Variance,Variance %,Status\r\n'));
  assert.match(csv, /Net \(income - expense\)/);
});
