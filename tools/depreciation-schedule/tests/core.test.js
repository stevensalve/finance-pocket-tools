'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../js/core.js');

const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= (eps === undefined ? 0.011 : eps), a + ' vs ' + b);
const asset = (o) =>
  Object.assign(
    {
      name: 'A',
      category: 'X',
      cost: 100000,
      purchaseDate: '2025-04-01',
      method: 'SLM',
      lifeYears: 5,
      ratePct: 0,
      salvagePct: 0,
      disposalDate: '',
      proceeds: 0,
    },
    o,
  );

test('fyOf / fyLabel', () => {
  assert.equal(d.fyOf('2026-03-31'), 2025);
  assert.equal(d.fyOf('2026-04-01'), 2026);
  assert.equal(d.fyLabel(2026), '2026-27');
  assert.equal(d.fyLabel(2099), '2099-00');
});

test('wdvRateFromLife: known value and validation', () => {
  near(d.wdvRateFromLife(10, 5), 25.89, 0.01); // 1 - 0.05^(1/10)
  near(d.wdvRateFromLife(15, 5), 18.1, 0.05);
  assert.throws(() => d.wdvRateFromLife(0, 5), /more than zero/);
});

test('SLM from 1 April: equal yearly charges, stops at salvage', () => {
  const s = d.schedule([asset({ salvagePct: 10 })], 2025, 2031);
  const y = s.rows[0].years;
  assert.equal(y.length, 7);
  assert.equal(y[0].additions, 100000);
  assert.equal(y[0].depreciation, 18000);
  assert.equal(y[0].closing, 82000);
  assert.equal(y[4].closing, 10000);
  assert.equal(y[5].depreciation, 0, 'never below salvage');
  assert.equal(y[6].closing, 10000);
  assert.equal(s.rows[0].rate, 18);
});

test('part-year rules in the purchase year (bought 1 Oct: 182 of 365 days)', () => {
  const a = asset({ purchaseDate: '2025-10-01', cost: 365000, lifeYears: 5 });
  const days = d.schedule([a], 2025, 2025).rows[0].years[0].depreciation;
  near(days, (365000 / 5) * (182 / 365), 0.01);
  assert.equal(d.schedule([a], 2025, 2025, { partYear: 'full' }).rows[0].years[0].depreciation, 73000);
  assert.equal(d.schedule([a], 2025, 2025, { partYear: 'it180' }).rows[0].years[0].depreciation, 73000, '182 days >= 180: full');
  const late = asset({ purchaseDate: '2026-01-15', cost: 365000, lifeYears: 5 });
  assert.equal(d.schedule([late], 2025, 2025, { partYear: 'it180' }).rows[0].years[0].depreciation, 36500, 'under 180 days: half');
});

test('WDV with explicit rate: hand-checked', () => {
  const s = d.schedule([asset({ method: 'WDV', ratePct: 15, lifeYears: 0 })], 2025, 2027);
  assert.deepEqual(
    s.rows[0].years.map((x) => x.depreciation),
    [15000, 12750, 10837.5],
  );
  assert.deepEqual(
    s.rows[0].years.map((x) => x.closing),
    [85000, 72250, 61412.5],
  );
  assert.equal(s.rows[0].years[1].opening, 85000);
});

test('years before the window are rolled forward, not shown', () => {
  const s = d.schedule([asset({ method: 'WDV', ratePct: 15, lifeYears: 0 })], 2027, 2027);
  assert.equal(s.rows[0].years.length, 1);
  assert.equal(s.rows[0].years[0].opening, 72250);
  assert.equal(s.rows[0].years[0].depreciation, 10837.5);
});

test('disposal: stops depreciating, removes value, shows gain or loss', () => {
  const a = asset({ method: 'SLM', lifeYears: 5, disposalDate: '2026-09-30', proceeds: 70000 });
  const s = d.schedule([a], 2025, 2028);
  const y = s.rows[0].years;
  assert.equal(y.length, 2, 'nothing after the year of sale');
  assert.equal(y[1].closing, 0);
  const days = 183; // 1 Apr to 30 Sep 2026 inclusive
  const dep = Math.round(((20000 * days) / 365) * 100) / 100;
  near(y[1].depreciation, dep, 0.01);
  near(y[1].disposal, 80000 - dep, 0.01);
  near(y[1].gainLoss, 70000 - (80000 - dep), 0.01);
});

test('totals and category summary add up; asset bought after the window is skipped', () => {
  const s = d.schedule(
    [
      asset({ name: 'A', category: 'C1' }),
      asset({ name: 'B', category: 'C1', cost: 50000 }),
      asset({ name: 'Z', purchaseDate: '2030-04-01' }),
    ],
    2025,
    2026,
  );
  assert.equal(s.rows[2].years.length, 0);
  assert.equal(s.totals[0].additions, 150000);
  assert.equal(s.totals[0].depreciation, 30000);
  assert.equal(s.totals[1].opening, s.totals[0].closing);
  assert.equal(s.byCategory[0].cost, 150000);
  assert.equal(s.byCategory[0].closing, s.totals[1].closing);
});

test('invalid assets are reported and left out; bad year range throws', () => {
  const s = d.schedule(
    [asset({ cost: 0 }), asset({ name: '', method: 'X', lifeYears: 0 }), asset({ disposalDate: '2020-01-01' }), asset()],
    2025,
    2026,
  );
  assert.equal(s.invalid.length, 3);
  assert.equal(s.rows.length, 1);
  assert.ok(s.invalid[1].problems.some((x) => /Name is missing/.test(x)));
  assert.ok(s.invalid[1].problems.some((x) => /SLM or WDV/.test(x)));
  assert.ok(s.invalid[1].problems.some((x) => /life in years or a rate/.test(x)));
  assert.ok(s.invalid[2].problems.some((x) => /Disposal is before purchase/.test(x)));
  assert.throws(() => d.schedule([], 2026, 2025), /not be before/);
  assert.throws(() => d.schedule([], 2000, 2100), /at most 60/);
});

test('rowsToAssets: category life fills a blank, method words, dates, bad rows', () => {
  const r = d.rowsToAssets(d.sampleRows());
  assert.equal(r.errors.length, 0);
  assert.equal(r.assets.length, 4);
  assert.equal(r.assets[0].lifeYears, 3, 'laptops: category life');
  assert.equal(r.assets[0].purchaseDate, '2025-06-15');
  assert.equal(r.assets[1].method, 'WDV');
  assert.equal(r.assets[3].disposalDate, '2026-08-31');
  assert.equal(r.assets[3].proceeds, 1700000);
  const bad = d.rowsToAssets([
    ['Asset', 'Cost', 'Purchase Date'],
    ['A', 'x', '01/04/2025'],
    ['B', '100', 'never'],
    ['C', '1,000', '2025-04-01'],
  ]);
  assert.equal(bad.assets.length, 1);
  assert.equal(bad.assets[0].cost, 1000);
  assert.equal(bad.errors.length, 2);
  assert.match(d.rowsToAssets([['Foo'], ['x']]).errors[0], /Asset name, Cost and Purchase date/);
  assert.match(d.rowsToAssets([['Asset']]).errors[0], /header row/);
});

test('sample data produces a sensible schedule and CSV', () => {
  const s = d.schedule(d.rowsToAssets(d.sampleRows()).assets, 2025, 2027);
  assert.equal(s.invalid.length, 0);
  const machine = s.rows[3].years;
  assert.equal(machine.length, 2);
  assert.equal(machine[1].closing, 0);
  const csv = d.toCsv(s);
  assert.ok(csv.startsWith('﻿Asset,Category,Method,Rate %,Financial year,'));
  assert.match(csv, /Dell laptops \(10\),Computers and laptops,SLM,31\.67,2025-26,/);
});
