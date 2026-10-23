'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const rc = require('../js/core.js');

const E = (id, date, amount, ref, desc) => ({
  id: id,
  line: Number(id.replace(/\D/g, '')) || 0,
  date: date,
  desc: desc || '',
  ref: ref || '',
  amount: amount,
});

test('rowsToEntries: bank vs books treat Debit/Credit in opposite ways', () => {
  const bank = rc.rowsToEntries(
    [
      ['Date', 'Narration', 'Withdrawal', 'Deposit'],
      ['02/10/2026', 'x', '', '500'],
      ['03/10/2026', 'y', '200', ''],
    ],
    'bank',
  );
  assert.deepEqual(
    bank.entries.map((e) => e.amount),
    [500, -200],
  );
  const book = rc.rowsToEntries(
    [
      ['Date', 'Particulars', 'Debit', 'Credit'],
      ['02/10/2026', 'x', '500', ''],
      ['03/10/2026', 'y', '', '200'],
    ],
    'book',
  );
  assert.deepEqual(
    book.entries.map((e) => e.amount),
    [500, -200],
  );
});

test('rowsToEntries: signed amount, Dr/Cr column, brackets, suffixes, leading zeros, bad rows', () => {
  const r = rc.rowsToEntries(
    [
      ['Date', 'Details', 'Amount', 'Dr/Cr', 'Ref'],
      ['01/10/2026', 'a', '1,000.50', 'CR', '00123'],
      ['02/10/2026', 'b', '300', 'DR', ''],
      ['03/10/2026', 'c', '(50)', '', ''],
      ['04/10/2026', 'd', '70 Dr', '', ''],
      ['xx', 'e', '5', '', ''],
      ['05/10/2026', 'f', 'abc', '', ''],
      ['06/10/2026', 'g', '0', '', ''],
    ],
    'bank',
  );
  assert.deepEqual(
    r.entries.map((e) => e.amount),
    [1000.5, -300, -50, -70],
  );
  assert.equal(r.entries[0].ref, '123');
  assert.equal(r.errors.length, 2);
  const b = rc.rowsToEntries(
    [
      ['Date', 'Amount', 'Type'],
      ['01/10/2026', '100', 'Dr'],
    ],
    'book',
  );
  assert.equal(b.entries[0].amount, 100, 'a Dr in the books is money in');
  assert.match(rc.rowsToEntries([['Foo'], ['x']], 'bank').errors[0], /No Date column/);
  assert.match(rc.rowsToEntries([['Date'], ['x']], 'bank').errors[0], /Amount column/);
  assert.match(rc.rowsToEntries([['Date']], 'bank').errors[0], /header row/);
});

test('match pass 1: reference + amount, even when dates are far apart', () => {
  const r = rc.match([E('b1', '2026-10-01', 500, 'CH1')], [E('k1', '2026-10-20', 500, 'ch1')]);
  assert.equal(r.matched.length, 1);
  assert.equal(r.matched[0].how, 'Reference and amount');
  assert.equal(r.unmatchedBank.length + r.unmatchedBook.length, 0);
});

test('match pass 2: amount within the date window, closest date wins, one-to-one', () => {
  const bank = [E('b1', '2026-10-05', 100), E('b2', '2026-10-06', 100)];
  const book = [E('k1', '2026-10-06', 100), E('k2', '2026-10-20', 100)];
  const r = rc.match(bank, book, { windowDays: 3 });
  assert.equal(r.matched.length, 2 - 1);
  assert.equal(r.matched[0].bank[0].id, 'b1');
  assert.equal(r.matched[0].book[0].id, 'k1', 'first bank line takes the closest book entry');
  assert.deepEqual(
    r.unmatchedBank.map((e) => e.id),
    ['b2'],
  );
  assert.deepEqual(
    r.unmatchedBook.map((e) => e.id),
    ['k2'],
  );
  const tight = rc.match([E('b1', '2026-10-05', 100)], [E('k1', '2026-10-06', 100)], { windowDays: 0 });
  assert.equal(tight.matched.length, 0);
  assert.throws(() => rc.match([], [], { windowDays: -1 }), /between 0 and 60/);
});

test('match: opposite signs never match; words break date ties', () => {
  const r = rc.match([E('b1', '2026-10-05', 100)], [E('k1', '2026-10-05', -100)]);
  assert.equal(r.matched.length, 0);
  const t = rc.match(
    [E('b1', '2026-10-05', 100, '', 'Receipt Acme Foods')],
    [E('k1', '2026-10-04', 100, '', 'Other thing'), E('k2', '2026-10-06', 100, '', 'Acme Foods payment')],
    { windowDays: 2 },
  );
  assert.equal(t.matched[0].book[0].id, 'k2');
});

test('match pass 3: several entries add up to one (both directions) and can be switched off', () => {
  const bank = [E('b1', '2026-10-21', 3000), E('b2', '2026-10-21', 2000)];
  const book = [E('k1', '2026-10-22', 5000)];
  const r = rc.match(bank, book);
  assert.equal(r.matched.length, 1);
  assert.equal(r.matched[0].how, '2 entries add up to one');
  assert.equal(r.matched[0].bank.length, 2);
  const rev = rc.match(
    [E('b1', '2026-10-22', 5000)],
    [E('k1', '2026-10-21', 1000), E('k2', '2026-10-21', 1500), E('k3', '2026-10-21', 2500)],
  );
  assert.equal(rev.matched[0].how, '3 entries add up to one');
  assert.equal(rev.matched[0].book.length, 3);
  assert.equal(rc.match(bank, book, { groups: false }).matched.length, 0);
  const far = rc.match([E('b1', '2026-10-01', 3000), E('b2', '2026-10-21', 2000)], book);
  assert.equal(far.matched.length, 0, 'dates must be close');
});

test('duplicates', () => {
  const d = rc.duplicates([E('b1', '2026-10-01', 50, 'A'), E('b2', '2026-10-01', 50, 'a'), E('b3', '2026-10-01', 50, 'B')]);
  assert.equal(d.length, 1);
  assert.equal(d[0].second.id, 'b2');
});

test('statement: sample data reconciles to zero difference', () => {
  const s = rc.sample();
  const bank = rc.rowsToEntries(s.bank, 'bank').entries;
  const book = rc.rowsToEntries(s.book, 'book').entries;
  const res = rc.match(bank, book);
  assert.equal(res.matched.length, 4);
  assert.deepEqual(
    res.unmatchedBook.map((e) => e.amount).sort((a, b) => a - b),
    [-18000, 7500],
  );
  assert.deepEqual(
    res.unmatchedBank.map((e) => e.amount).sort((a, b) => a - b),
    [-295, 410],
  );
  // books balance 100000 + 50000 - 25000 + 12000 + 5000 - 18000 + 7500 = ... choose opening so that both sides agree
  const bookBal = 131500;
  const bankBal = bookBal + 410 - 295 - 7500 + 18000;
  const st = rc.statement(res, bankBal, bookBal);
  assert.equal(st.depositsNotCredited, 7500);
  assert.equal(st.chequesNotPresented, -18000);
  assert.equal(st.bankNotBooksIn, 410);
  assert.equal(st.bankNotBooksOut, -295);
  assert.equal(st.adjustedBank, 131500 + 410 - 295);
  assert.equal(st.adjustedBook, 131500 + 410 - 295);
  assert.equal(st.difference, 0);
  assert.equal(rc.statement(res, bankBal + 100, bookBal).difference, 100);
});

test('toCsv lists matched and unmatched lines', () => {
  const s = rc.sample();
  const res = rc.match(rc.rowsToEntries(s.bank, 'bank').entries, rc.rowsToEntries(s.book, 'book').entries);
  const csv = rc.toCsv(res);
  assert.ok(csv.startsWith('﻿Status,Matched by,Source,Date,Description,Reference,Amount'));
  assert.match(csv, /In bank, not in books/);
  assert.match(csv, /In books, not in bank/);
  assert.match(csv, /Matched,Reference and amount,Bank/);
});
