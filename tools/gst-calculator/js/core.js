/**
 * GST Calculator & Summary - core logic (pure).
 *
 * quick(): add GST to an amount, or take it out of a GST-inclusive amount.
 * rowsToEntries(): read a sales or purchase register (spreadsheet rows) into entries and flag problems.
 * summarise(): totals by GST rate, by month and by party, plus checks.
 * Everything is rounded to paise. This is a helper for checking and summarising; it is not a return filing tool.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.GstCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const RATES = [0, 0.25, 3, 5, 12, 18, 28];
  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function gstinValid(value) {
    const g = norm(value).toUpperCase();
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      const p = CHARS.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2);
      sum += Math.floor(p / 36) + (p % 36);
    }
    return CHARS[(36 - (sum % 36)) % 36] === g[14];
  }

  /**
   * quick(amount, ratePct, mode, intra): mode "exclusive" (amount is before GST) or "inclusive" (amount already has GST).
   * Returns { base, gst, total, cgst, sgst, igst }. Throws for impossible input.
   */
  function quick(amount, ratePct, mode, intra) {
    const a = Number(amount);
    const r = Number(ratePct);
    if (!Number.isFinite(a) || a < 0) throw new Error('Enter an amount of zero or more.');
    if (!Number.isFinite(r) || r < 0 || r > 40) throw new Error('GST rate must be between 0 and 40.');
    let base;
    let gst;
    let total;
    if (mode === 'inclusive') {
      total = r2(a);
      base = r2((a * 100) / (100 + r));
      gst = r2(total - base);
    } else {
      base = r2(a);
      gst = r2((a * r) / 100);
      total = r2(base + gst);
    }
    const half = r2(gst / 2);
    return intra === false
      ? { base: base, gst: gst, total: total, cgst: 0, sgst: 0, igst: gst }
      : { base: base, gst: gst, total: total, cgst: half, sgst: r2(gst - half), igst: 0 };
  }

  const HEADERS = {
    invoice: ['invoice', 'invoice no', 'invoice number', 'bill no', 'voucher', 'doc no', 'document number', 'inv no'],
    party: ['party', 'party name', 'customer', 'customer name', 'supplier', 'supplier name', 'vendor', 'name', 'buyer'],
    gstin: ['gstin', 'gstin/uin', 'gst no', 'gst number', 'party gstin', 'customer gstin', 'supplier gstin'],
    date: ['date', 'invoice date', 'bill date', 'doc date', 'voucher date'],
    taxable: ['taxable', 'taxable value', 'taxable amount', 'basic', 'basic amount', 'net amount', 'amount before tax'],
    rate: ['rate', 'gst rate', 'gst %', 'tax rate', 'gst', 'rate %', 'tax %'],
    cgst: ['cgst', 'cgst amount'],
    sgst: ['sgst', 'sgst amount', 'utgst', 'sgst/utgst'],
    igst: ['igst', 'igst amount'],
    total: ['total', 'invoice value', 'invoice total', 'gross', 'gross amount', 'total amount', 'invoice amount'],
  };

  function num(v) {
    const t = norm(v).replace(/,/g, '').replace(/%$/, '');
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }

  /** Spreadsheet rows (with header) -> { entries, errors }. */
  function rowsToEntries(aoa) {
    const rows = (aoa || []).filter((r) => Array.isArray(r) && r.some((c) => norm(c) !== ''));
    if (rows.length < 2) return { entries: [], errors: ['The file needs a header row and at least one invoice.'] };
    const head = rows[0].map((h) => norm(h).toLowerCase());
    const col = {};
    Object.keys(HEADERS).forEach((k) => (col[k] = head.findIndex((h) => HEADERS[k].indexOf(h) !== -1)));
    if (col.taxable === -1 && col.total === -1) return { entries: [], errors: ['Need a Taxable value or an Invoice total column.'] };
    const errors = [];
    const entries = [];
    rows.slice(1).forEach((r, i) => {
      const line = i + 2;
      const get = (k) => (col[k] === -1 ? null : num(r[col[k]]));
      const e = {
        line: line,
        invoice: col.invoice === -1 ? '' : norm(r[col.invoice]),
        party: col.party === -1 ? '' : norm(r[col.party]),
        gstin: col.gstin === -1 ? '' : norm(r[col.gstin]).toUpperCase(),
        date: col.date === -1 ? '' : OT.toIsoDate(r[col.date]),
        issues: [],
      };
      let taxable = get('taxable');
      let rate = get('rate');
      let cgst = get('cgst');
      let sgst = get('sgst');
      let igst = get('igst');
      const total = get('total');
      if ([taxable, rate, cgst, sgst, igst, total].some((x) => Number.isNaN(x))) {
        errors.push('Row ' + line + ': a number could not be read, so the row was skipped.');
        return;
      }
      cgst = cgst || 0;
      sgst = sgst || 0;
      igst = igst || 0;
      const tax = r2(cgst + sgst + igst);
      if (taxable === null && total !== null) {
        taxable = r2(total - tax);
        e.issues.push('Taxable value worked out from the total.');
      }
      if (taxable === null) {
        errors.push('Row ' + line + ': no amount, so the row was skipped.');
        return;
      }
      if (rate === null) {
        if (tax > 0 && taxable > 0) {
          const raw = (tax / taxable) * 100;
          const near = RATES.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
          rate = Math.abs(near - raw) <= 0.6 ? near : r2(raw);
          e.issues.push('GST rate worked out from the tax amounts.');
        } else rate = 0;
      }
      if (tax === 0 && rate > 0) {
        const q = quick(taxable, rate, 'exclusive', true);
        cgst = q.cgst;
        sgst = q.sgst;
        e.issues.push('Tax worked out from the rate (CGST + SGST assumed).');
      } else if (tax > 0 && Math.abs(tax - r2((taxable * rate) / 100)) > 1.01) {
        e.issues.push(
          'Tax of ' +
            OT.formatInr(tax, 2) +
            ' does not match ' +
            rate +
            '% of ' +
            OT.formatInr(taxable, 2) +
            ' (expected ' +
            OT.formatInr(r2((taxable * rate) / 100), 2) +
            ').',
        );
      }
      if (cgst > 0 && igst > 0) e.issues.push('Both CGST and IGST are charged on the same invoice.');
      if (Math.abs(cgst - sgst) > 0.011) e.issues.push('CGST and SGST are not equal.');
      if (e.gstin && !gstinValid(e.gstin)) e.issues.push('GSTIN ' + e.gstin + ' is not valid.');
      const sum = r2(taxable + cgst + sgst + igst);
      if (total !== null && Math.abs(total - sum) > 1.01)
        e.issues.push('Invoice total ' + OT.formatInr(total, 2) + ' does not match taxable + tax (' + OT.formatInr(sum, 2) + ').');
      Object.assign(e, {
        taxable: r2(taxable),
        rate: rate,
        cgst: r2(cgst),
        sgst: r2(sgst),
        igst: r2(igst),
        total: total !== null ? r2(total) : sum,
      });
      entries.push(e);
    });
    const seen = {};
    entries.forEach((e) => {
      if (!e.invoice) return;
      const k = (e.party + '|' + e.invoice).toLowerCase();
      if (seen[k]) {
        e.issues.push('Duplicate of invoice on row ' + seen[k] + '.');
      } else seen[k] = e.line;
    });
    return { entries: entries, errors: errors };
  }

  /** Totals by rate, month ("2026-10"), party, B2B/B2C, plus every row that has issues. */
  function summarise(entries) {
    const add = (o, k, e) => {
      o[k] = o[k] || { key: k, count: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
      const t = o[k];
      t.count++;
      ['taxable', 'cgst', 'sgst', 'igst', 'total'].forEach((f) => (t[f] = r2(t[f] + e[f])));
    };
    const byRate = {};
    const byMonth = {};
    const byParty = {};
    const kind = {};
    const all = { key: 'All', count: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
    entries.forEach((e) => {
      add(byRate, String(e.rate), e);
      add(byMonth, e.date ? e.date.slice(0, 7) : 'No date', e);
      add(byParty, e.party || 'No party name', e);
      add(kind, e.gstin ? 'B2B (with GSTIN)' : 'B2C / unregistered', e);
      all.count++;
      ['taxable', 'cgst', 'sgst', 'igst', 'total'].forEach((f) => (all[f] = r2(all[f] + e[f])));
    });
    const list = (o, sorter) =>
      Object.keys(o)
        .map((k) => o[k])
        .sort(sorter);
    return {
      totals: all,
      byRate: list(byRate, (a, b) => Number(a.key) - Number(b.key)),
      byMonth: list(byMonth, (a, b) => a.key.localeCompare(b.key)),
      byParty: list(byParty, (a, b) => b.taxable - a.taxable || a.key.localeCompare(b.key)),
      byKind: list(kind, (a, b) => a.key.localeCompare(b.key)),
      issues: entries.filter((e) => e.issues.length).map((e) => ({ line: e.line, invoice: e.invoice, party: e.party, issues: e.issues })),
    };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  /** Rate-wise, month-wise and party-wise summary in one CSV. */
  function summaryCsv(sum) {
    const out = [['Group', 'Item', 'Invoices', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total']];
    const put = (g, list, label) =>
      list.forEach((t) => out.push([g, label ? label(t.key) : t.key, t.count, t.taxable, t.cgst, t.sgst, t.igst, t.total]));
    put('Rate', sum.byRate, (k) => k + '%');
    put('Month', sum.byMonth);
    put('Party', sum.byParty);
    put('Type', sum.byKind);
    out.push(['Total', 'All', sum.totals.count, sum.totals.taxable, sum.totals.cgst, sum.totals.sgst, sum.totals.igst, sum.totals.total]);
    return '﻿' + out.map((r) => r.map(cell).join(',')).join('\r\n');
  }

  function sampleRows() {
    return [
      ['Invoice No', 'Date', 'Party', 'GSTIN', 'Taxable Value', 'GST Rate', 'CGST', 'SGST', 'IGST'],
      ['INV-001', '03/10/2026', 'Beta Ltd', '29AAPFU0939F1ZV', '10000', '18', '', '', '1800'],
      ['INV-002', '07/10/2026', 'Acme Foods', '27AAPFU0939F1ZV', '5000', '5', '125', '125', ''],
      ['INV-003', '12/10/2026', 'Walk-in customer', '', '2000', '12', '', '', ''],
      ['INV-003', '12/10/2026', 'Walk-in customer', '', '2000', '12', '', '', ''],
      ['INV-004', '20/10/2026', 'Gamma LLP', '27ABCDE1234F1Z5', '8000', '18', '1000', '1000', ''],
    ];
  }

  return {
    RATES: RATES,
    gstinValid: gstinValid,
    quick: quick,
    rowsToEntries: rowsToEntries,
    summarise: summarise,
    summaryCsv: summaryCsv,
    sampleRows: sampleRows,
  };
});
