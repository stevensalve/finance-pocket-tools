'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ex = require('../js/core.js');

const TODAY = '2026-10-23';
const sample = () => ex.rowsToClaims(ex.sampleRows()).claims;

test('rowsToClaims: sample, receipt flags, rupee prefix, bad rows', () => {
  const r = ex.rowsToClaims(ex.sampleRows());
  assert.equal(r.errors.length, 0);
  assert.equal(r.claims.length, 8);
  assert.equal(r.claims[0].receipt, true);
  assert.equal(r.claims[2].receipt, false);
  assert.equal(r.claims[6].receipt, null);
  const bad = ex.rowsToClaims([
    ['Name', 'Date', 'Amount'],
    ['A', '01/10/2026', 'Rs. 1,200'],
    ['B', '01/10/2026', '-5'],
    ['C', 'nope', '10'],
    ['', '01/10/2026', '10'],
    ['D', '01/10/2026', 'abc'],
  ]);
  assert.equal(bad.claims.length, 1);
  assert.equal(bad.claims[0].amount, 1200);
  assert.equal(bad.claims[0].category, 'Uncategorised');
  assert.equal(bad.errors.length, 4);
  assert.match(ex.rowsToClaims([['Foo'], ['x']]).errors[0], /Employee, Date and Amount/);
  assert.match(ex.rowsToClaims([['Employee']]).errors[0], /header row/);
});

test('parseLimits', () => {
  const r = ex.parseLimits('# policy\nMeals: 1,000\nhotel = 8000\nbad\nTravel: 0');
  assert.deepEqual(r.limits, { meals: 1000, hotel: 8000 });
  assert.equal(r.errors.length, 2);
});

test('review: category limit, receipt rule, age, future date', () => {
  const policy = { limits: { meals: 1000 }, receiptAbove: 1000, maxAgeDays: 90 };
  const r = ex.review(sample(), policy, TODAY);
  const by = (line) => r.find((c) => c.line === line);
  assert.deepEqual(by(2).flags, [], 'meal under limit with receipt');
  assert.ok(by(3).flags.length === 0, '4,200 travel with a receipt is fine');
  assert.ok(by(4).flags.some((f) => /Over the Meals limit of 1,000 by 800.00/.test(f)));
  assert.ok(by(4).flags.some((f) => /No receipt for a claim above 1,000/.test(f)));
  assert.ok(by(7).flags.some((f) => /Claimed 115 days after the expense \(limit 90\)/.test(f)));
  assert.equal(by(8).flags.length, 0, '650 needs no receipt');
  const future = ex.review(
    [{ line: 2, employee: 'A', date: '2026-12-01', category: 'X', amount: 10, desc: '', bill: '', receipt: null }],
    {},
    TODAY,
  );
  assert.ok(future[0].flags.some((f) => /in the future/.test(f)));
  const unconfirmed = ex.review(
    [{ line: 2, employee: 'A', date: '2026-10-01', category: 'X', amount: 5000, desc: '', bill: '', receipt: null }],
    { receiptAbove: 1000 },
    TODAY,
  );
  assert.match(unconfirmed[0].flags[0], /Receipt not confirmed/);
});

test('review: duplicates and reused bill numbers', () => {
  const r = ex.review(sample(), {}, TODAY);
  assert.ok(r[3].flags.some((f) => /duplicate of row 4/.test(f)));
  const shared = ex.review(
    [
      { line: 2, employee: 'A', date: '2026-10-01', category: 'X', amount: 10, desc: '', bill: 'Z9', receipt: true },
      { line: 3, employee: 'B', date: '2026-10-02', category: 'X', amount: 20, desc: '', bill: 'z9', receipt: true },
      { line: 4, employee: 'A', date: '2026-10-03', category: 'X', amount: 30, desc: '', bill: 'Z9', receipt: true },
    ],
    {},
    TODAY,
  );
  assert.ok(shared[1].flags.some((f) => /also claimed by someone else \(row 2\)/.test(f)));
  assert.ok(shared[2].flags.some((f) => /appears again \(row 2\)/.test(f)));
  assert.equal(shared[0].flags.length, 0);
});

test('review: monthly cap flags once per employee-month', () => {
  const r = ex.review(sample(), { monthlyCap: 10000 }, TODAY);
  const asha = r.filter((c) => c.employee === 'Asha Rao' && c.flags.some((f) => /monthly cap/.test(f)));
  assert.equal(asha.length, 1);
  assert.match(asha[0].flags.join(' '), /Asha Rao has claimed 11,050.00 in 2026-10, above the monthly cap of 10,000/);
  assert.equal(r.filter((c) => c.employee === 'Zoe Fernandes' && c.flags.length).length, 0);
});

test('summarise: totals, groups and flagged amount', () => {
  const r = ex.review(sample(), { limits: { meals: 1000 }, receiptAbove: 1000 }, TODAY);
  const s = ex.summarise(r);
  assert.equal(s.count, 8);
  assert.equal(s.total, 850 + 4200 + 1800 + 1800 + 9500 + 2500 + 650 + 6000);
  assert.equal(s.byEmployee[0].key, 'Meera Shah');
  assert.equal(s.byEmployee.find((e) => e.key === 'Asha Rao').total, 11050);
  assert.equal(s.byCategory[0].key, 'Travel');
  assert.deepEqual(
    s.byMonth.map((m) => m.key),
    ['2026-06', '2026-10'],
  );
  assert.ok(s.flagged.length >= 2);
  assert.equal(
    s.flaggedAmount,
    s.flagged.reduce((a, c) => a + c.amount, 0),
  );
  assert.equal(ex.summarise([]).count, 0);
});

test('toCsv', () => {
  const csv = ex.toCsv(ex.review(sample(), { limits: { meals: 1000 } }, TODAY));
  assert.ok(csv.startsWith('﻿Row,Employee,Date,Category,Amount,Description,Bill no,Receipt,Flags\r\n'));
  assert.match(csv, /Over the Meals limit/);
  assert.equal(csv.split('\r\n').length, 9);
});

test('review rejects a bad "today"', () => {
  assert.throws(() => ex.review([], {}, 'x'), /Dates must look like/);
});
