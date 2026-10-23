'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ag = require('../js/core.js');

const AS_OF = '2026-10-23';
const item = (party, due, amount, extra) =>
  Object.assign({ line: 2, party: party, invoice: 'X', date: due, due: due, amount: amount }, extra);

test('rowsToItems: sample, missing due date uses credit days, brackets are negative, bad rows', () => {
  const r = ag.rowsToItems(ag.sampleRows(), 45);
  assert.equal(r.errors.length, 0);
  assert.equal(r.items.length, 7);
  assert.equal(r.items[0].due, '2026-07-31');
  const cn = r.items[5];
  assert.equal(cn.amount, -5000);
  assert.equal(cn.due, '2026-11-19', '5 Oct + 45 days');
  const bad = ag.rowsToItems([
    ['Party', 'Date', 'Amount'],
    ['A', '01/01/2026', 'x'],
    ['B', 'nope', '10'],
    ['C', '01/01/2026', '0'],
    ['D', '01/01/2026', '1,200'],
  ]);
  assert.equal(bad.items.length, 1);
  assert.equal(bad.items[0].amount, 1200);
  assert.equal(bad.items[0].due, '2026-01-31', 'default 30 days');
  assert.equal(bad.errors.length, 2);
  assert.match(ag.rowsToItems([['Foo'], ['x']]).errors[0], /Need columns/);
  assert.match(ag.rowsToItems([['Party']]).errors[0], /header row/);
});

test('report from due date: bucket boundaries are exact', () => {
  const items = [
    item('A', '2026-10-23', 100), // due today -> not due
    item('A', '2026-10-24', 10), // future
    item('A', '2026-10-22', 1), // 1 day
    item('A', '2026-09-23', 2), // 30 days -> 1-30
    item('A', '2026-09-22', 4), // 31 days -> 31-60
    item('A', '2026-08-24', 8), // 60 days -> 31-60
    item('A', '2026-08-23', 16), // 61 days -> 61-90
    item('A', '2026-07-25', 32), // 90 days -> 61-90
    item('A', '2026-07-24', 64), // 91 days -> over 90
  ];
  const r = ag.report(items, AS_OF);
  assert.deepEqual(r.labels, ['Not due', '1-30 days', '31-60 days', '61-90 days', 'Over 90 days']);
  assert.deepEqual(r.parties[0].buckets, [110, 3, 12, 48, 64]);
  assert.equal(r.parties[0].total, 237);
  assert.equal(r.parties[0].overdue, 127);
  assert.equal(r.parties[0].oldest, 91);
  assert.equal(r.totals.total, 237);
});

test('report from invoice date has no "Not due" bucket', () => {
  const r = ag.report([item('A', '2026-10-23', 5, { date: '2026-10-23' }), item('A', '2026-12-01', 7, { date: '2026-09-23' })], AS_OF, {
    from: 'invoice',
    edges: [30, 60],
  });
  assert.deepEqual(r.labels, ['0-30 days', '31-60 days', 'Over 60 days']);
  assert.deepEqual(r.parties[0].buckets, [12, 0, 0], 'age 30 still belongs to 0-30');
});

test('credit notes reduce buckets and totals; parties sorted by overdue', () => {
  const rep = ag.report(ag.rowsToItems(ag.sampleRows()).items, AS_OF);
  assert.deepEqual(
    rep.parties.map((p) => p.party),
    ['Beta Ltd', 'Gamma LLP', 'Acme Foods', 'Delta Traders'],
  );
  const gamma = rep.parties[1];
  assert.equal(gamma.total, 75000);
  assert.equal(gamma.overdue, 80000, 'the credit note is not yet due, so it does not reduce overdue');
  const sum = rep.totals.buckets.reduce((a, b) => a + b, 0);
  assert.equal(Math.round(sum * 100), Math.round(rep.totals.total * 100));
  assert.equal(rep.totals.total, 120000 + 60000 + 45000 + 30000 + 80000 - 5000 + 25000);
});

test('report validates its inputs', () => {
  assert.throws(() => ag.report([], 'x'), /Dates must look like/);
  assert.throws(() => ag.report([], AS_OF, { edges: [60, 30] }), /increasing order/);
  assert.throws(() => ag.report([], AS_OF, { edges: [] }), /increasing order/);
  assert.throws(() => ag.report([], AS_OF, { edges: [0, 5] }), /increasing order/);
  assert.equal(ag.report([], AS_OF).parties.length, 0);
});

test('reminders: wording, tone, minimum, nothing overdue', () => {
  const rep = ag.report(ag.rowsToItems(ag.sampleRows()).items, AS_OF);
  const beta = rep.parties.find((p) => p.party === 'Beta Ltd');
  const t = ag.reminder(beta, { sender: 'Accounts', company: 'Acme Pvt Ltd' });
  assert.match(t, /^Dear Beta Ltd,/);
  assert.match(t, /- INV-101 dated 01\/07\/2026, due 31\/07\/2026: Rs\. 1,20,000\.00 \(84 days overdue\)/);
  assert.match(t, /Total overdue: Rs\. 1,80,000\.00/);
  assert.match(t, /A gentle reminder/);
  assert.match(t, /Thank you,\nAccounts\nAcme Pvt Ltd$/);
  assert.match(ag.reminder(beta, { tone: 'firm' }), /within 7 days/);
  const delta = rep.parties.find((p) => p.party === 'Delta Traders');
  assert.equal(ag.reminder(delta), '');
  const acme = ag.reminder(rep.parties.find((p) => p.party === 'Acme Foods'));
  assert.match(acme, /your total outstanding balance is Rs\. 75,000\.00/);
  const all = ag.reminders(rep, {});
  assert.equal(all.split('----------').length, 3, 'Gamma, Beta and Acme');
  assert.equal(ag.reminders(rep, { min: 100000 }).split('----------').length, 1);
});

test('toCsv', () => {
  const csv = ag.toCsv(ag.report(ag.rowsToItems(ag.sampleRows()).items, AS_OF));
  assert.ok(csv.startsWith('﻿Party,Not due,1-30 days,31-60 days,61-90 days,Over 90 days,Total,Overdue\r\n'));
  assert.match(csv, /\r\nTotal,/);
  assert.equal(csv.split('\r\n').length, 6);
});
