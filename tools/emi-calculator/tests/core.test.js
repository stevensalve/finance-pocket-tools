'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PDFLib = require('pdf-lib');
const e = require('../js/core.js');

const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= (eps === undefined ? 0.011 : eps), a + ' vs ' + b);

test('emi: well-known figures and zero interest', () => {
  near(e.emi(1000000, 8, 240), 8364.4, 0.05); // 10 lakh, 8%, 20 years
  near(e.emi(500000, 10, 60), 10623.52, 0.02);
  assert.equal(e.emi(120000, 0, 12), 10000);
  assert.equal(e.emi(500000, 10, 60, true), 10624);
  assert.throws(() => e.emi(0, 8, 12), /loan amount/);
  assert.throws(() => e.emi(1000, -1, 12), /between 0 and 100/);
  assert.throws(() => e.emi(1000, 8, 0), /whole number of months/);
  assert.throws(() => e.emi(1000, 8, 12.5), /whole number of months/);
  assert.throws(() => e.emi(1000, 8, 601), /whole number of months/);
});

test('affordableLoan inverts emi', () => {
  const p = e.affordableLoan(e.emi(750000, 9.5, 84), 9.5, 84);
  near(p, 750000, 1);
  assert.equal(e.affordableLoan(1000, 0, 10), 10000);
  assert.throws(() => e.affordableLoan(0, 9, 10), /monthly amount/);
});

test('addMonths clamps to month end and crosses years', () => {
  assert.equal(e.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(e.addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(e.addMonths('2026-11-15', 3), '2027-02-15');
  assert.equal(e.addMonths('2026-03-31', 0), '2026-03-31');
});

test('schedule: closes at zero, principal adds up, interest = paid - principal', () => {
  const s = e.schedule({ principal: 500000, rate: 10, months: 60, startDate: '2026-11-05' });
  assert.equal(s.rows.length, 60);
  assert.equal(s.rows[0].opening, 500000);
  assert.equal(s.rows[0].interest, 4166.67);
  assert.equal(s.rows[59].closing, 0);
  assert.equal(s.rows[0].date, '2026-11-05');
  assert.equal(s.rows[59].date, '2031-10-05');
  near(
    s.rows.reduce((a, x) => a + x.principal, 0),
    500000,
    0.005,
  );
  near(s.totals.paid - s.totals.principal, s.totals.interest, 0.02);
  s.rows.forEach((x, i) => i && assert.equal(x.opening, s.rows[i - 1].closing));
  assert.equal(s.totals.endDate, '2031-10-05');
});

test('schedule: zero rate', () => {
  const s = e.schedule({ principal: 1200, rate: 0, months: 12 });
  assert.equal(s.totals.interest, 0);
  assert.equal(s.rows[11].closing, 0);
  assert.equal(s.rows[0].date, '');
});

test('prepayment and extra monthly shorten the loan and save interest', () => {
  const base = { principal: 1000000, rate: 9, months: 120, startDate: '2026-11-01' };
  const c = e.compare(Object.assign({}, base, { prepayments: [{ month: 12, amount: 100000 }] }));
  assert.ok(c.monthsSaved > 5);
  assert.ok(c.interestSaved > 50000);
  assert.equal(c.plan.rows[c.plan.rows.length - 1].closing, 0);
  assert.equal(c.plan.rows[11].prepay, 100000);
  assert.equal(c.plan.totals.prepaid, 100000);
  const x = e.compare(Object.assign({}, base, { extraMonthly: 5000 }));
  assert.ok(x.monthsSaved > 20);
  near(x.plan.totals.paid - x.plan.totals.principal, x.plan.totals.interest, 0.05);
  assert.equal(e.compare(base).monthsSaved, 0);
  assert.equal(e.compare(base).interestSaved, 0);
});

test('a large prepayment clears the loan early; invalid prepayments are rejected', () => {
  const s = e.schedule({ principal: 100000, rate: 10, months: 24, prepayments: [{ month: 3, amount: 999999 }] });
  assert.equal(s.rows.length, 3);
  assert.equal(s.rows[2].closing, 0);
  assert.equal(s.rows[2].prepay + s.rows[2].principal, s.rows[2].opening);
  assert.throws(() => e.schedule({ principal: 1000, rate: 5, months: 12, prepayments: [{ month: 13, amount: 5 }] }), /between 1 and 12/);
  assert.throws(() => e.schedule({ principal: 1000, rate: 5, months: 12, prepayments: [{ month: 2, amount: 0 }] }), /more than zero/);
  assert.throws(() => e.schedule({ principal: 1000, rate: 5, months: 12, extraMonthly: -1 }), /cannot be negative/);
});

test('yearly groups by calendar year, or loan year without a date', () => {
  const s = e.schedule({ principal: 120000, rate: 12, months: 24, startDate: '2026-11-01' });
  const y = e.yearly(s.rows);
  assert.deepEqual(
    y.map((x) => x.label),
    ['2026', '2027', '2028'],
  );
  near(
    y.reduce((a, x) => a + x.principal, 0),
    120000,
    0.01,
  );
  assert.equal(y[2].closing, 0);
  const z = e.yearly(e.schedule({ principal: 120000, rate: 12, months: 24 }).rows);
  assert.deepEqual(
    z.map((x) => x.label),
    ['Year 1', 'Year 2'],
  );
});

test('parsePrepayments', () => {
  const r = e.parsePrepayments('# note\n12: 50,000\n24 100000\nbad line\n0: 5\n');
  assert.deepEqual(r.list, [
    { month: 12, amount: 50000 },
    { month: 24, amount: 100000 },
  ]);
  assert.equal(r.errors.length, 2);
});

test('toCsv and buildPdf (multi-page)', async () => {
  const s = e.schedule({ principal: 2500000, rate: 8.5, months: 240, startDate: '2026-11-05' });
  const csv = e.toCsv(s);
  assert.ok(csv.startsWith('﻿No,Date,Opening balance,'));
  assert.equal(csv.split('\r\n').length, 241);
  const bytes = await e.buildPdf(PDFLib, s, { title: 'Home loan ₹', borrower: 'Asha', rate: 8.5 });
  const doc = await PDFLib.PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 4);
});
