'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cc = require('../js/core.js');

const only = (ids) => cc.defaultItems().map((i) => Object.assign(i, { on: ids.indexOf(i.id) !== -1 }));
const dates = (ev) => ev.map((e) => e.date);

test('weekday and shift', () => {
  assert.equal(cc.weekday('2026-10-25'), 0, '25 Oct 2026 is a Sunday');
  assert.equal(cc.shift('2026-10-25', 'previous', [0], new Set()), '2026-10-24');
  assert.equal(cc.shift('2026-10-25', 'next', [0], new Set()), '2026-10-26');
  assert.equal(cc.shift('2026-10-25', 'none', [0], new Set()), '2026-10-25');
  assert.equal(cc.shift('2026-10-24', 'next', [0, 6], new Set()), '2026-10-26', 'Saturday and Sunday off');
  assert.equal(cc.shift('2026-10-26', 'next', [0], new Set(['2026-10-26', '2026-10-27'])), '2026-10-28', 'holidays too');
});

test('monthly rules: GSTR-3B for FY 2026-27 falls on the 20th of the next month', () => {
  const ev = cc.generate(2026, only(['gstr3b']));
  assert.equal(ev.length, 12);
  assert.equal(ev[0].date, '2026-05-20');
  assert.equal(ev[0].period, 'for Apr 2026');
  assert.equal(ev[8].date, '2027-01-20');
  assert.equal(ev[8].period, 'for Dec 2026');
  assert.equal(ev[11].date, '2027-04-20');
  assert.equal(ev[11].period, 'for Mar 2027');
});

test('TDS payment: 7th, but 30 April for March', () => {
  const ev = cc.generate(2026, only(['tdspay']));
  assert.equal(ev[0].date, '2026-05-07');
  assert.equal(ev[10].date, '2027-03-07');
  assert.equal(ev[11].date, '2027-04-30');
  assert.equal(ev[11].period, 'for Mar 2027');
});

test('fixed rules: advance tax, TDS returns, ITR and GSTR-9 dates', () => {
  assert.deepEqual(dates(cc.generate(2026, only(['advtax']))), ['2026-06-15', '2026-09-15', '2026-12-15', '2027-03-15']);
  assert.deepEqual(dates(cc.generate(2026, only(['tdsret']))), ['2026-07-31', '2026-10-31', '2027-01-31', '2027-05-31']);
  assert.deepEqual(dates(cc.generate(2026, only(['itr', 'gstr9']))), ['2027-07-31', '2027-12-31']);
  const q = cc.generate(2026, only(['gstr1q']));
  assert.deepEqual(dates(q), ['2026-07-13', '2026-10-13', '2027-01-13', '2027-04-13']);
  assert.equal(q[0].period, 'Apr-Jun');
});

test('February clamp and shifting events', () => {
  const items = [{ id: 'x', group: 'Custom', name: 'X', rule: { type: 'monthly', day: 31 }, on: true, note: '' }];
  const ev = cc.generate(2027, items);
  assert.ok(
    ev.some((e) => e.date === '2028-02-29'),
    'leap-year February clamps to 29: period Jan 2028',
  );
  const adv = cc.generate(2026, only(['pf']), { shift: 'previous', weekOffs: [0] });
  const sun = adv.filter((e) => cc.weekday(e.original) === 0);
  assert.ok(sun.length > 0);
  sun.forEach((e) => {
    assert.equal(e.moved, true);
    assert.equal(cc.weekday(e.date), 6);
  });
  assert.ok(adv.every((e) => cc.weekday(e.date) !== 0));
});

test('items switched off are skipped; defaults are independent copies; bad year rejected', () => {
  const a = cc.defaultItems();
  a[0].on = false;
  assert.equal(cc.ITEMS[0].on, true);
  assert.throws(() => cc.generate(1999, a), /between 2000 and 2100/);
  assert.equal(
    cc.generate(
      2026,
      a.map((i) => Object.assign(i, { on: false })),
    ).length,
    0,
  );
  const all = cc.generate(2026, cc.defaultItems());
  assert.ok(all.length > 60);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].date <= all[i].date, 'sorted');
});

test('parseCustom: monthly day, one-off date, errors; custom items generate', () => {
  const r = cc.parseCustom('# mine\nProfessional tax, 30\nAGM, 2026-09-30\nbad line\nOdd, 40\nGhost, 2026-02-30');
  assert.equal(r.items.length, 2);
  assert.equal(r.errors.length, 3);
  const ev = cc.generate(2026, r.items);
  assert.equal(ev.filter((e) => e.name === 'Professional tax').length, 12);
  assert.equal(ev.filter((e) => e.name === 'AGM').length, 1);
  assert.equal(ev.find((e) => e.name === 'AGM').date, '2026-09-30');
});

test('upcoming and byMonth', () => {
  const ev = cc.generate(2026, only(['gstr1', 'advtax']));
  const u = cc.upcoming(ev, '2026-10-23', 30);
  assert.ok(u.every((e) => e.daysLeft >= -7 && e.daysLeft <= 30));
  assert.ok(u.some((e) => e.date === '2026-11-11'));
  assert.equal(u.find((e) => e.date === '2026-11-11').daysLeft, 19);
  const m = cc.byMonth(ev);
  assert.equal(m[0].key, '2026-05');
  assert.equal(m[0].label, 'May 2026');
  assert.equal(
    m.reduce((a, x) => a + x.events.length, 0),
    ev.length,
  );
});

test('toCsv and toIcs', () => {
  const ev = cc.generate(2026, only(['advtax']), {});
  const csv = cc.toCsv(ev);
  assert.ok(csv.startsWith('\ufeffDue date,Day,Group,Item,Period,Note,Moved from\r\n'));
  assert.match(csv, /2026-06-15,Mon,Income tax,Advance tax instalment,15% of the year/);
  const ics = cc.toIcs(ev, '20261023T000000Z', 3);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 4);
  assert.match(ics, /DTSTART;VALUE=DATE:20260615\r\nDTEND;VALUE=DATE:20260616/);
  assert.match(ics, /TRIGGER:-P3D/);
  ics.split('\r\n').forEach((l) => assert.ok(new TextEncoder().encode(l).length <= 75, 'folded: ' + l));
  assert.doesNotMatch(cc.toIcs(ev, '20261023T000000Z', 0), /VALARM/);
  assert.throws(() => cc.toIcs(ev, 'nope', 0), /timestamp/);
  const uids = ics.match(/UID:.*/g);
  assert.equal(new Set(uids).size, uids.length, 'unique UIDs');
});
