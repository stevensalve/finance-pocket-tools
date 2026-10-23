'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PDFLib = require('pdf-lib');
const inv = require('../js/core.js');

const make = (over) => {
  const i = inv.create('2026-10-23');
  i.number = 'INV/26-27/0001';
  i.seller = { name: 'Acme Traders', gstin: '', address: 'Pune', stateCode: '27' };
  i.buyer = { name: 'Beta Ltd', gstin: '', address: 'Mumbai', stateCode: '27' };
  i.items = [{ desc: 'Widget', hsn: '8708', qty: 10, unit: 'Nos', rate: 1000, discPct: 10, gstPct: 18 }];
  return Object.assign(i, over || {});
};

test('GSTIN: well-known sample is valid; wrong check char, state and shape are caught', () => {
  assert.equal(inv.gstinProblem('27AAPFU0939F1ZV'), '');
  assert.equal(inv.gstinProblem(''), '');
  assert.equal(inv.gstinProblem('27aapfu0939f1zv'), '', 'lower case is accepted');
  assert.match(inv.gstinProblem('27AAPFU0939F1ZX'), /check character/);
  assert.match(inv.gstinProblem('99AAPFU0939F1ZV'), /state code/);
  assert.match(inv.gstinProblem('123'), /15 characters/);
  assert.equal(inv.gstinCheckChar('27AAPFU0939F1Z'), 'V');
});

test('nextNumber and financialYear', () => {
  assert.equal(inv.nextNumber('INV/26-27/0007'), 'INV/26-27/0008');
  assert.equal(inv.nextNumber('A-99'), 'A-100');
  assert.equal(inv.nextNumber('ABC'), 'ABC-1');
  assert.equal(inv.nextNumber(''), '1');
  assert.equal(inv.financialYear('2026-10-23'), '2026-27');
  assert.equal(inv.financialYear('2027-03-31'), '2026-27');
  assert.equal(inv.financialYear('2027-04-01'), '2027-28');
  assert.equal(inv.financialYear('2099-12-31'), '2099-00');
});

test('intra-state: CGST + SGST, hand-checked totals', () => {
  const r = inv.compute(make());
  const l = r.lines[0];
  assert.equal(r.intra, true);
  assert.equal(l.gross, 10000);
  assert.equal(l.discount, 1000);
  assert.equal(l.taxable, 9000);
  assert.equal(l.cgst, 810);
  assert.equal(l.sgst, 810);
  assert.equal(l.igst, 0);
  assert.equal(r.totals.grand, 10620);
  assert.equal(r.totals.words, 'Rupees Ten Thousand Six Hundred Twenty Only');
});

test('inter-state: IGST only', () => {
  const i = make();
  i.buyer.stateCode = '29';
  const r = inv.compute(i);
  assert.equal(r.intra, false);
  assert.equal(r.lines[0].igst, 1620);
  assert.equal(r.lines[0].cgst, 0);
  assert.equal(r.totals.grand, 10620);
});

test('rounding: paise per line, round-off line, and off switch', () => {
  const i = make({
    items: [
      { desc: 'A', hsn: '', qty: 3, unit: '', rate: 33.33, discPct: 0, gstPct: 5 },
      { desc: 'B', hsn: '', qty: 1, unit: '', rate: 10.1, discPct: 0, gstPct: 12 },
    ],
  });
  const r = inv.compute(i);
  assert.equal(r.lines[0].taxable, 99.99);
  assert.equal(r.lines[0].cgst, 2.5, '99.99 x 2.5% = 2.49975');
  assert.equal(r.lines[0].total, 104.99);
  assert.equal(r.lines[1].cgst, 0.61, '10.10 x 6% = 0.606');
  assert.equal(r.totals.exact, 116.31);
  assert.equal(r.totals.roundOff, -0.31);
  assert.equal(r.totals.grand, 116);
  const j = make({ items: [{ desc: 'A', hsn: '', qty: 1, unit: '', rate: 100.4, discPct: 0, gstPct: 0 }] });
  assert.equal(inv.compute(j).totals.grand, 100);
  assert.equal(inv.compute(j).totals.roundOff, -0.4);
  j.roundOff = false;
  assert.equal(inv.compute(j).totals.grand, 100.4);
  const sum = r.lines.reduce((a, l) => a + l.total, 0);
  assert.ok(Math.abs(sum - r.totals.exact) < 0.005, 'lines add up to the total');
});

test('summary groups by GST rate in ascending order', () => {
  const i = make({
    items: [
      { desc: 'A', qty: 1, rate: 100, gstPct: 18 },
      { desc: 'B', qty: 2, rate: 50, gstPct: 5 },
      { desc: 'C', qty: 1, rate: 100, gstPct: 18 },
    ],
  });
  const r = inv.compute(i);
  assert.deepEqual(
    r.summary.map((s) => [s.gstPct, s.taxable]),
    [
      [5, 100],
      [18, 200],
    ],
  );
  assert.equal(r.summary[1].cgst, 18);
});

test('compute tolerates bad numbers; validate explains them', () => {
  const i = make({ number: '', items: [{ desc: '', qty: 'abc', rate: -5, discPct: 150, gstPct: 90 }] });
  const r = inv.compute(i);
  assert.equal(r.totals.grand, 0);
  const e = inv.validate(i);
  assert.ok(e.some((x) => /invoice number/.test(x)));
  assert.ok(e.some((x) => /Item 1: enter a description/.test(x)));
  assert.ok(e.some((x) => /quantity/.test(x)));
  assert.ok(e.some((x) => /rate cannot be negative/.test(x)));
  assert.ok(e.some((x) => /discount/.test(x)));
  assert.ok(e.some((x) => /GST rate/.test(x)));
  assert.deepEqual(inv.validate(make()), []);
  assert.ok(inv.validate(make({ items: [] })).some((x) => /at least one item/.test(x)));
  assert.ok(inv.validate(make({ dueDate: '2026-10-01' })).some((x) => /before the invoice date/.test(x)));
  assert.ok(inv.validate(make({ date: '' })).some((x) => /invoice date/.test(x)));
  const g = make();
  g.seller.gstin = '27AAPFU0939F1ZV';
  g.seller.stateCode = '29';
  assert.ok(inv.validate(g).some((x) => /does not match the first two digits/.test(x)));
  g.buyer.gstin = 'bad';
  assert.ok(inv.validate(g).some((x) => /^Buyer: GSTIN must be/.test(x)));
});

test('toCsv has BOM, header and a guarded, quoted row', () => {
  const i = make();
  i.items[0].desc = '=cmd, "x"';
  const csv = inv.toCsv(i, inv.compute(i));
  assert.ok(csv.startsWith('﻿Invoice,Date,Buyer,'));
  assert.match(csv, /"'=cmd, ""x"""/);
  assert.equal(csv.split('\r\n').length, 2);
});

test('buildPdf makes a real PDF, including many items and non-Latin text', async () => {
  const i = make({ bank: 'HDFC\nA/c 1234', notes: 'Thank you ₹ — नमस्ते' });
  i.dueDate = '2026-11-22';
  i.items = [];
  for (let k = 0; k < 40; k++)
    i.items.push({
      desc: 'Item number ' + k + ' with a rather long description that must wrap onto lines',
      hsn: '998313',
      qty: k + 1,
      unit: 'Nos',
      rate: 1234.5,
      discPct: 5,
      gstPct: 18,
    });
  const bytes = await inv.buildPdf(PDFLib, i, inv.compute(i));
  const doc = await PDFLib.PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 2, 'many items flow onto more pages');
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), '%PDF');
  const j = make();
  j.buyer.stateCode = '29';
  const one = await PDFLib.PDFDocument.load(await inv.buildPdf(PDFLib, j, inv.compute(j)));
  assert.equal(one.getPageCount(), 1);
});

test('serialize / parse round-trip and hardening', () => {
  const i = make({ notes: 'n' });
  const back = inv.parse(inv.serialize(i));
  assert.deepEqual(back, i);
  assert.throws(() => inv.parse('nope'), /not a saved invoice/);
  assert.throws(() => inv.parse('{"app":"x"}'), /not a saved invoice/);
  const messy = inv.parse(
    JSON.stringify({
      app: 'invoice-maker',
      invoice: {
        number: 5,
        date: 'garbage',
        seller: { stateCode: '99' },
        items: [{ desc: 'x', qty: -3, rate: 'z', discPct: 500, gstPct: 999 }],
      },
    }),
  );
  assert.equal(messy.date, '');
  assert.equal(messy.seller.stateCode, '27');
  assert.equal(messy.items[0].qty, 1);
  assert.equal(messy.items[0].discPct, 100);
  assert.equal(messy.items[0].gstPct, 40);
});
