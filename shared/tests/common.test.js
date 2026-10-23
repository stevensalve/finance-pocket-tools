'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const OT = require('../common.js');

test('formatBytes', () => {
  assert.equal(OT.formatBytes(0), '0 B');
  assert.equal(OT.formatBytes(512), '512 B');
  assert.equal(OT.formatBytes(1536), '1.5 KB');
  assert.equal(OT.formatBytes(10 * 1024 * 1024), '10 MB');
  assert.equal(OT.formatBytes(-5), '0 B');
  assert.equal(OT.formatBytes(NaN), '0 B');
});

test('escapeHtml', () => {
  assert.equal(OT.escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});

test('baseName / extension', () => {
  assert.equal(OT.baseName('report.final.pdf'), 'report.final');
  assert.equal(OT.baseName('noext'), 'noext');
  assert.equal(OT.baseName('.hidden'), '.hidden');
  assert.equal(OT.extension('A.PDF'), 'pdf');
  assert.equal(OT.extension('noext'), '');
});

test('safeFileName removes illegal characters', () => {
  assert.equal(OT.safeFileName('a/b:c*d?.pdf'), 'a_b_c_d_.pdf');
  assert.equal(OT.safeFileName('   '), 'file');
  assert.equal(OT.safeFileName('...', 'x'), 'x');
  assert.equal(OT.safeFileName('..hidden'), 'hidden');
});

test('clamp', () => {
  assert.equal(OT.clamp(5, 0, 3), 3);
  assert.equal(OT.clamp(-1, 0, 3), 0);
  assert.equal(OT.clamp(2, 0, 3), 2);
});

test('debounce only fires once after silence', async () => {
  let calls = 0;
  const fn = OT.debounce(() => calls++, 20);
  fn();
  fn();
  fn();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls, 1);
});

test('inrWords: Indian system', () => {
  assert.equal(OT.inrWords(0), 'Zero');
  assert.equal(OT.inrWords(7), 'Seven');
  assert.equal(OT.inrWords(19), 'Nineteen');
  assert.equal(OT.inrWords(40), 'Forty');
  assert.equal(OT.inrWords(101), 'One Hundred One');
  assert.equal(OT.inrWords(1000), 'One Thousand');
  assert.equal(OT.inrWords(100000), 'One Lakh');
  assert.equal(OT.inrWords(1250000), 'Twelve Lakh Fifty Thousand');
  assert.equal(OT.inrWords(10000000), 'One Crore');
  assert.equal(OT.inrWords(123456789), 'Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine');
  assert.equal(OT.inrWords(1500000000), 'One Hundred Fifty Crore');
  assert.equal(OT.inrWords(99.9), 'Ninety Nine', 'paise are ignored here');
  assert.throws(() => OT.inrWords(-1), /between/);
  assert.throws(() => OT.inrWords(NaN), /between/);
});

test('inrAmountText with and without paise', () => {
  assert.equal(OT.inrAmountText(45000), 'Rupees Forty Five Thousand Only');
  assert.equal(OT.inrAmountText(1250.5), 'Rupees One Thousand Two Hundred Fifty and Fifty Paise Only');
  assert.equal(OT.inrAmountText(0.05), 'Rupees Zero and Five Paise Only');
});

test('formatInr groups the Indian way', () => {
  assert.equal(OT.formatInr(0), '0');
  assert.equal(OT.formatInr(999), '999');
  assert.equal(OT.formatInr(1000), '1,000');
  assert.equal(OT.formatInr(123456), '1,23,456');
  assert.equal(OT.formatInr(1234567.5, 2), '12,34,567.50');
  assert.equal(OT.formatInr(-1500000), '-15,00,000');
  assert.equal(OT.formatInr(NaN), '0');
});

test('parseAmount', () => {
  assert.equal(OT.parseAmount('12,50,000'), 1250000);
  assert.equal(OT.parseAmount(' 99.5 '), 99.5);
  ['', 'abc', '-1', '1e3', null, '5.'].forEach((x) => assert.equal(OT.parseAmount(x), null));
});

test('dates: parse, format, add, spreadsheet cells', () => {
  assert.equal(OT.formatDate('2026-10-23'), '23 October 2026');
  assert.equal(OT.formatDate('2026-01-05', 'dmy'), '05/01/2026');
  assert.equal(OT.formatDate(''), '');
  assert.throws(() => OT.parseIsoDate('2026-02-30'), /does not exist/);
  assert.throws(() => OT.parseIsoDate('23/10/2026'), /look like/);
  assert.equal(OT.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(OT.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(OT.toIsoDate('2026-10-23'), '2026-10-23');
  assert.equal(OT.toIsoDate('23/10/2026'), '2026-10-23');
  assert.equal(OT.toIsoDate('5-1-2026'), '2026-01-05');
  assert.equal(OT.toIsoDate('23 Oct 2026'), '2026-10-23');
  assert.equal(OT.toIsoDate('15 September, 2026'), '2026-09-15');
  assert.equal(OT.toIsoDate('46318'), '2026-10-23', 'Excel serial');
  assert.equal(OT.toIsoDate('31/02/2026'), '');
  assert.equal(OT.toIsoDate('soon'), '');
  assert.equal(OT.toIsoDate(''), '');
  assert.equal(OT.toIsoDate(new Date(2026, 9, 23)), '2026-10-23');
});
