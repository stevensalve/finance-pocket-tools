'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../js/core.js');

test('quick: exclusive and inclusive, intra and inter state', () => {
  const a = g.quick(1000, 18, 'exclusive', true);
  assert.deepEqual(a, { base: 1000, gst: 180, total: 1180, cgst: 90, sgst: 90, igst: 0 });
  const b = g.quick(1180, 18, 'inclusive', true);
  assert.deepEqual(b, { base: 1000, gst: 180, total: 1180, cgst: 90, sgst: 90, igst: 0 });
  const c = g.quick(1000, 5, 'exclusive', false);
  assert.deepEqual(c, { base: 1000, gst: 50, total: 1050, cgst: 0, sgst: 0, igst: 50 });
  const d = g.quick(100, 18, 'inclusive', true);
  assert.equal(d.base, 84.75);
  assert.equal(d.gst, 15.25);
  assert.equal(d.cgst + d.sgst, d.gst, 'halves add back to the whole');
  assert.equal(g.quick(0, 18, 'exclusive', true).total, 0);
  assert.throws(() => g.quick(-1, 18), /zero or more/);
  assert.throws(() => g.quick('x', 18), /zero or more/);
  assert.throws(() => g.quick(10, 99), /between 0 and 40/);
});

test('gstinValid', () => {
  assert.equal(g.gstinValid('27AAPFU0939F1ZV'), true);
  assert.equal(g.gstinValid('27AAPFU0939F1ZX'), false);
  assert.equal(g.gstinValid(''), false);
});

test('rowsToEntries: sample register, derived values and flags', () => {
  const r = g.rowsToEntries(g.sampleRows());
  assert.equal(r.errors.length, 0);
  assert.equal(r.entries.length, 5);
  const [e1, e2, e3, e4, e5] = r.entries;
  assert.equal(e1.date, '2026-10-03');
  assert.equal(e1.total, 11800);
  assert.deepEqual(e3.issues, ['Tax worked out from the rate (CGST + SGST assumed).']);
  assert.equal(e3.cgst, 120);
  assert.ok(e4.issues.some((x) => /Duplicate of invoice on row 4/.test(x)));
  assert.ok(
    e1.issues.some((x) => /GSTIN 29AAPFU0939F1ZV is not valid/.test(x)),
    'a GSTIN with a wrong check character is flagged',
  );
  assert.deepEqual(e2.issues, [], 'a valid GSTIN with correct tax is clean');
  assert.ok(
    e5.issues.some((x) => /does not match 18% of 8,000.00/.test(x)),
    '2000 tax on 8000 is 25%',
  );
});

test('rowsToEntries: derive taxable from total, rate from tax, bad rows', () => {
  const r = g.rowsToEntries([
    ['Bill No', 'Invoice Value', 'CGST', 'SGST'],
    ['A', '1180', '90', '90'],
    ['B', 'abc', '', ''],
    ['C', '', '', ''],
  ]);
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].taxable, 1000);
  assert.equal(r.entries[0].rate, 18);
  assert.ok(r.entries[0].issues.some((x) => /Taxable value worked out/.test(x)));
  assert.ok(r.entries[0].issues.some((x) => /GST rate worked out/.test(x)));
  assert.equal(r.errors.length, 2);
  assert.match(
    g.rowsToEntries([
      ['Name', 'City'],
      ['a', 'b'],
    ]).errors[0],
    /Taxable value or an Invoice total/,
  );
  assert.match(g.rowsToEntries([['Taxable']]).errors[0], /header row/);
});

test('rowsToEntries: mixed taxes, unequal halves, total mismatch', () => {
  const r = g.rowsToEntries([
    ['Taxable', 'Rate', 'CGST', 'SGST', 'IGST', 'Total'],
    ['1000', '18', '90', '90', '180', '1500'],
    ['1000', '18', '100', '80', '', '1180'],
  ]);
  assert.ok(r.entries[0].issues.some((x) => /Both CGST and IGST/.test(x)));
  assert.ok(r.entries[0].issues.some((x) => /Invoice total/.test(x)));
  assert.ok(r.entries[1].issues.some((x) => /not equal/.test(x)));
});

test('summarise: by rate, month, party, kind; issues listed', () => {
  const rows = [
    ['Invoice', 'Date', 'Party', 'GSTIN', 'Taxable', 'Rate', 'CGST', 'SGST', 'IGST'],
    ['1', '2026-10-01', 'A', '27AAPFU0939F1ZV', '1000', '18', '90', '90', ''],
    ['2', '2026-10-15', 'A', '27AAPFU0939F1ZV', '500', '5', '12.5', '12.5', ''],
    ['3', '2026-11-02', 'B', '', '2000', '18', '', '', '360'],
  ];
  const s = g.summarise(g.rowsToEntries(rows).entries);
  assert.equal(s.totals.count, 3);
  assert.equal(s.totals.taxable, 3500);
  assert.equal(s.totals.total, 3500 + 180 + 25 + 360);
  assert.deepEqual(
    s.byRate.map((x) => [x.key, x.taxable]),
    [
      ['5', 500],
      ['18', 3000],
    ],
  );
  assert.deepEqual(
    s.byMonth.map((x) => x.key),
    ['2026-10', '2026-11'],
  );
  assert.equal(s.byParty[0].key, 'B');
  assert.deepEqual(
    s.byKind.map((x) => [x.key, x.count]),
    [
      ['B2B (with GSTIN)', 2],
      ['B2C / unregistered', 1],
    ],
  );
  assert.equal(s.issues.length, 0);
  assert.equal(g.summarise([]).totals.count, 0);
});

test('summaryCsv', () => {
  const s = g.summarise(g.rowsToEntries(g.sampleRows()).entries);
  const csv = g.summaryCsv(s);
  assert.ok(csv.startsWith('﻿Group,Item,Invoices,Taxable,CGST,SGST,IGST,Total\r\n'));
  assert.match(csv, /\r\nRate,18%,/);
  assert.match(csv, /\r\nTotal,All,5,/);
});
