'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cf = require('../js/core.js');

test('parseItems: every form, optional limits, errors', () => {
  const r = cf.parseItems(
    '# note\nRent, out, 50,000, monthly 5\nSales, in, 1000, weekly Friday\nLoan, out, 5000, every 14 days from 2026-11-01\nTax, out, 7000, once 2026-12-15\nBonus, out, 100, monthly 1 from 2027-01-01 until 2027-03-31\nNope, out, 10, sometimes\nBad, maybe, 10, monthly 1\nZero, in, 0, monthly 1\nDay, in, 5, monthly 40\nGhost, in, 5, once 2026-02-30\nshort, in',
  );
  assert.equal(r.items.length, 5);
  assert.equal(r.errors.length, 6);
  assert.deepEqual(r.items[0], { name: 'Rent', dir: 'out', amount: 50000, from: '', until: '', kind: 'monthly', day: 5 });
  assert.equal(r.items[1].kind, 'weekly');
  assert.equal(r.items[1].dow, 5);
  assert.equal(r.items[2].n, 14);
  assert.equal(r.items[2].date, '2026-11-01');
  assert.equal(r.items[4].from, '2027-01-01');
  assert.equal(r.items[4].until, '2027-03-31');
  assert.match(r.errors[0], /could not understand "sometimes"/);
});

test('"every N days from DATE" keeps its date; a trailing "from" limits the item', () => {
  const r = cf.parseItems('A, out, 1, every 7 days from 2026-11-01\nB, out, 1, every 7 days from 2026-11-01 until 2026-12-01');
  assert.equal(r.errors.length, 0);
  assert.equal(r.items[0].from, '');
  assert.equal(r.items[1].until, '2026-12-01');
  assert.equal(r.items[1].date, '2026-11-01');
});

test('occurrences: monthly clamps to month end, limits apply', () => {
  const m = { kind: 'monthly', day: 31, from: '', until: '' };
  assert.deepEqual(cf.occurrences(m, '2027-01-01', '2027-04-30'), ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  assert.deepEqual(cf.occurrences(m, '2028-02-01', '2028-02-29'), ['2028-02-29']);
  const lim = { kind: 'monthly', day: 5, from: '2026-12-01', until: '2027-01-31' };
  assert.deepEqual(cf.occurrences(lim, '2026-10-01', '2027-06-30'), ['2026-12-05', '2027-01-05']);
  assert.deepEqual(cf.occurrences({ kind: 'monthly', day: 5, from: '', until: '' }, '2026-12-10', '2027-01-04'), []);
});

test('occurrences: weekly, every N days (aligned to its own start), once', () => {
  assert.deepEqual(cf.occurrences({ kind: 'weekly', dow: 5, from: '', until: '' }, '2026-10-23', '2026-11-07'), [
    '2026-10-23',
    '2026-10-30',
    '2026-11-06',
  ]);
  const e = { kind: 'every', n: 14, date: '2026-10-05', from: '', until: '' };
  assert.deepEqual(cf.occurrences(e, '2026-10-20', '2026-12-01'), ['2026-11-02', '2026-11-16', '2026-11-30']);
  assert.deepEqual(cf.occurrences({ kind: 'once', date: '2026-11-05', from: '', until: '' }, '2026-11-05', '2026-11-05'), ['2026-11-05']);
  assert.deepEqual(cf.occurrences({ kind: 'once', date: '2026-11-05', from: '', until: '' }, '2026-11-06', '2026-12-05'), []);
});

const items = (t) => cf.parseItems(t).items;

test('project: hand-checked two-week balance, weekly buckets add up', () => {
  const it = items('Sales, in, 1000, weekly mon\nRent, out, 1500, once 2026-10-28');
  const r = cf.project(it, { start: '2026-10-26', openingBalance: 500, weeks: 2 }); // Monday start
  assert.deepEqual(
    r.weeks.map((w) => [w.inflow, w.outflow, w.closing]),
    [
      [1000, 1500, 0],
      [1000, 0, 1000],
    ],
  );
  assert.equal(r.weeks[0].lowest, 0);
  assert.equal(r.totals.closing, 1000);
  assert.equal(r.totals.opening, 500);
  assert.equal(r.totals.opening + r.totals.net, r.totals.closing);
  assert.equal(r.end, '2026-11-08');
  assert.equal(r.events.length, 3);
});

test('project: shortfall detected with date and days, minimum balance honoured', () => {
  const it = items('Sales, in, 1000, weekly mon\nRent, out, 3000, once 2026-10-30');
  const r = cf.project(it, { start: '2026-10-26', openingBalance: 500, weeks: 2 });
  assert.equal(r.firstShortfall.date, '2026-10-30');
  assert.equal(r.firstShortfall.days, 4);
  assert.equal(r.firstShortfall.balance, -1500);
  assert.deepEqual(r.lowest, { date: '2026-10-30', balance: -1500 });
  const ok = cf.project(items('Sales, in, 100, weekly mon'), { start: '2026-10-26', openingBalance: 500, weeks: 1, minBalance: 1000 });
  assert.equal(ok.firstShortfall.days, 0, 'already below the minimum on day 0');
  assert.equal(cf.project([], { start: '2026-10-26', openingBalance: 500, weeks: 1 }).firstShortfall, null);
});

test('project: sample plan runs 13 weeks', () => {
  const it = items(cf.sampleText());
  assert.equal(cf.parseItems(cf.sampleText()).errors.length, 0);
  const r = cf.project(it, { start: '2026-10-26', openingBalance: 600000, weeks: 13 });
  assert.equal(r.weeks.length, 13);
  assert.equal(r.totals.opening + r.totals.net, r.totals.closing);
  const insurance = r.events.find((e) => e.name === 'Insurance premium');
  assert.equal(insurance.date, '2026-12-15');
  assert.equal(r.events.filter((e) => e.name === 'Salaries').length, 3, '1 Nov, 1 Dec, 1 Jan');
});

test('stress: delayed inflows move later and can fall outside the window; percentage reduces them', () => {
  const it = items('Sales, in, 1000, monthly 28\nRent, out, 100, monthly 1');
  const o = { start: '2026-10-26', openingBalance: 0, weeks: 6 }; // to 2026-12-06
  const base = cf.project(it, o);
  assert.equal(base.totals.inflow, 2000, '28 Oct and 28 Nov');
  const delayed = cf.project(it, Object.assign({}, o, { delayInDays: 20 }));
  assert.equal(delayed.totals.inflow, 1000, '28 Oct -> 17 Nov inside; 28 Nov -> 18 Dec outside');
  assert.ok(delayed.events.some((e) => e.date === '2026-11-17'));
  const earlier = cf.project(it, Object.assign({}, o, { delayInDays: 5 }));
  assert.equal(earlier.totals.inflow, 2000);
  assert.ok(earlier.events.some((e) => e.date === '2026-11-02'));
  const half = cf.project(it, Object.assign({}, o, { inflowPct: 50 }));
  assert.equal(half.totals.inflow, 1000);
  const s = cf.stress(it, o, 10, 80);
  assert.equal(s.base.totals.inflow, 2000);
  assert.equal(s.stressed.totals.inflow, 800, 'only the 28 Oct receipt (now 7 Nov, at 80%) falls inside the window');
  assert.equal(s.closingDifference, s.stressed.totals.closing - s.base.totals.closing);
});

test('inflows delayed from before the window arrive inside it', () => {
  const it = items('Old invoice, in, 500, once 2026-10-20');
  const r = cf.project(it, { start: '2026-10-26', openingBalance: 0, weeks: 1, delayInDays: 10 });
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].date, '2026-10-30');
  assert.equal(cf.project(it, { start: '2026-10-26', openingBalance: 0, weeks: 1 }).events.length, 0);
});

test('project validates input', () => {
  const o = { start: '2026-10-26', openingBalance: 0, weeks: 4 };
  assert.throws(() => cf.project([], Object.assign({}, o, { start: 'x' })), /Dates must look like/);
  assert.throws(() => cf.project([], Object.assign({}, o, { openingBalance: 'abc' })), /opening balance/);
  assert.throws(() => cf.project([], Object.assign({}, o, { weeks: 0 })), /1 to 104/);
  assert.throws(() => cf.project([], Object.assign({}, o, { weeks: 2.5 })), /1 to 104/);
  assert.throws(() => cf.project([], Object.assign({}, o, { delayInDays: -1 })), /between 0 and 365/);
  assert.throws(() => cf.project([], Object.assign({}, o, { inflowPct: 500 })), /between 0 and 200/);
});

test('toCsv', () => {
  const r = cf.project(items(cf.sampleText()), { start: '2026-10-26', openingBalance: 100, weeks: 3 });
  const csv = cf.toCsv(r);
  assert.ok(csv.startsWith('﻿Week starting,Week ending,Inflows,Outflows,Net,Closing balance,Lowest balance in week\r\n'));
  assert.equal(csv.split('\r\n').length, 4);
});
