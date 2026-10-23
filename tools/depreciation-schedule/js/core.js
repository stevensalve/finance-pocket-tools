/**
 * Depreciation Schedule - core logic (pure).
 *
 * Asset: { name, category, cost, purchaseDate (ISO), method: "SLM" | "WDV", lifeYears, ratePct, salvagePct,
 *          disposalDate (ISO or ""), proceeds }
 *   SLM: yearly charge = (cost - salvage) / life, or cost x rate% when a rate is given.
 *   WDV: yearly charge = opening value x rate%; if only a life is given the rate is 1 - (salvage/cost)^(1/life).
 * Financial year runs 1 April to 31 March. Part-year rule (setting "partYear"):
 *   "days"  - pro-rata by days owned (Companies Act style)
 *   "full"  - a full year's charge in any year the asset is owned
 *   "it180" - full charge if owned 180 days or more in the year, otherwise half (Income-tax style)
 * An asset is never written down below its salvage value. On disposal the book value is removed and the gain or loss is shown.
 * Category lives are sample values: confirm them against the Companies Act Schedule II or your own policy.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.DepCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const DAY = 86400000;

  const CATEGORIES = {
    Building: 60,
    'Plant and machinery': 15,
    'Furniture and fittings': 10,
    'Office equipment': 5,
    'Computers and laptops': 3,
    'Servers and networks': 6,
    Vehicles: 8,
    'Electrical installations': 10,
  };

  const fyStart = (y) => Date.UTC(y, 3, 1);
  const fyLabel = (y) => y + '-' + String((y + 1) % 100).padStart(2, '0');
  /** Start year of the financial year that contains an ISO date. */
  function fyOf(iso) {
    const d = new Date(OT.parseIsoDate(iso));
    return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  }

  /** WDV rate (percent) that takes cost down to the salvage value over the life. */
  function wdvRateFromLife(lifeYears, salvagePct) {
    if (!(lifeYears > 0)) throw new Error('Life must be more than zero.');
    const s = Math.max(0, Number(salvagePct) || 0);
    const floor = s === 0 ? 5 : s; // a zero salvage value needs a floor, as the Companies Act uses 5%
    return r2((1 - Math.pow(floor / 100, 1 / lifeYears)) * 100);
  }

  /** Problems with one asset, as text (empty list = fine). */
  function problems(a) {
    const e = [];
    if (!norm(a.name)) e.push('Name is missing.');
    if (!(Number(a.cost) > 0)) e.push('Cost must be more than zero.');
    try {
      OT.parseIsoDate(a.purchaseDate);
    } catch (x) {
      e.push('Purchase date is missing or not valid.');
    }
    if (a.method !== 'SLM' && a.method !== 'WDV') e.push('Method must be SLM or WDV.');
    if (!(Number(a.lifeYears) > 0) && !(Number(a.ratePct) > 0)) e.push('Give a life in years or a rate.');
    if (Number(a.salvagePct) < 0 || Number(a.salvagePct) >= 100) e.push('Salvage must be from 0 to under 100 percent.');
    if (a.disposalDate) {
      try {
        if (OT.parseIsoDate(a.disposalDate) < OT.parseIsoDate(a.purchaseDate)) e.push('Disposal is before purchase.');
      } catch (x) {
        e.push('Disposal date is not valid.');
      }
    }
    return e;
  }

  /** Days of [from, toExclusive) that fall in the financial year starting in `y`. */
  function ownedDays(y, from, toExclusive) {
    const a = Math.max(from, fyStart(y));
    const b = Math.min(toExclusive, fyStart(y + 1));
    return b > a ? Math.round((b - a) / DAY) : 0;
  }

  /**
   * schedule(assets, firstFy, lastFy, opts) -> { years: [labels], rows: per asset, totals, byCategory, invalid }
   * Each row: { asset, years: [{ fy, opening, additions, depreciation, disposal, gainLoss, closing }] }
   * "opening" is the book value at the start of the year (cost in the purchase year counts as an addition, opening is 0).
   */
  function schedule(assets, firstFy, lastFy, opts) {
    const o = Object.assign({ partYear: 'days' }, opts);
    if (!Number.isInteger(firstFy) || !Number.isInteger(lastFy) || lastFy < firstFy)
      throw new Error('The last year must not be before the first year.');
    if (lastFy - firstFy > 60) throw new Error('Choose at most 60 years.');
    const years = [];
    for (let y = firstFy; y <= lastFy; y++) years.push(y);
    const invalid = [];
    const rows = [];
    assets.forEach((a, idx) => {
      const p = problems(a);
      if (p.length) {
        invalid.push({ index: idx, name: norm(a.name) || '(no name)', problems: p });
        return;
      }
      const cost = r2(Number(a.cost));
      const salvage = r2((cost * (Number(a.salvagePct) || 0)) / 100);
      const buy = OT.parseIsoDate(a.purchaseDate);
      const sellEnd = a.disposalDate ? OT.parseIsoDate(a.disposalDate) + DAY : Infinity;
      const buyFy = fyOf(a.purchaseDate);
      const sellFy = a.disposalDate ? fyOf(a.disposalDate) : Infinity;
      const life = Number(a.lifeYears) || 0;
      const rate = Number(a.ratePct) > 0 ? Number(a.ratePct) : a.method === 'WDV' ? wdvRateFromLife(life, a.salvagePct) : 0;
      const slmYear = a.method === 'SLM' ? (Number(a.ratePct) > 0 ? (cost * Number(a.ratePct)) / 100 : (cost - salvage) / life) : 0;
      let book = cost; // book value at the start of the first modelled year, rolled forward from purchase
      const out = [];
      for (let y = buyFy; y <= Math.min(lastFy, sellFy); y++) {
        const days = ownedDays(y, buy, sellEnd);
        const full = days === Math.round((fyStart(y + 1) - fyStart(y)) / DAY);
        let frac = 1;
        if (!full)
          frac =
            o.partYear === 'days'
              ? days / Math.round((fyStart(y + 1) - fyStart(y)) / DAY)
              : o.partYear === 'it180'
                ? days >= 180
                  ? 1
                  : 0.5
                : 1;
        const opening = y === buyFy ? 0 : book;
        const start = y === buyFy ? cost : book;
        const annual = a.method === 'SLM' ? slmYear : (start * rate) / 100;
        const dep = r2(Math.max(0, Math.min(annual * frac, start - salvage)));
        const wdv = r2(start - dep);
        const disposed = y === sellFy;
        const proceeds = Number(a.proceeds) || 0;
        if (y >= firstFy) {
          out.push({
            fy: y,
            opening: opening,
            additions: y === buyFy ? cost : 0,
            depreciation: dep,
            disposal: disposed ? wdv : 0,
            gainLoss: disposed ? r2(proceeds - wdv) : 0,
            closing: disposed ? 0 : wdv,
          });
        }
        book = disposed ? 0 : wdv;
      }
      rows.push({
        asset: a,
        years: out,
        rate: a.method === 'WDV' ? rate : Number(a.ratePct) > 0 ? Number(a.ratePct) : r2((100 - (Number(a.salvagePct) || 0)) / life),
      });
    });
    const totals = years.map((y) => {
      const t = { fy: y, label: fyLabel(y), opening: 0, additions: 0, depreciation: 0, disposal: 0, gainLoss: 0, closing: 0 };
      rows.forEach((r) => {
        const x = r.years.find((v) => v.fy === y);
        if (x) ['opening', 'additions', 'depreciation', 'disposal', 'gainLoss', 'closing'].forEach((f) => (t[f] = r2(t[f] + x[f])));
      });
      return t;
    });
    const cat = {};
    rows.forEach((r) => {
      const k = norm(r.asset.category) || 'Uncategorised';
      cat[k] = cat[k] || { category: k, cost: 0, depreciation: 0, closing: 0 };
      cat[k].cost = r2(cat[k].cost + Number(r.asset.cost));
      r.years.forEach((x) => (cat[k].depreciation = r2(cat[k].depreciation + x.depreciation)));
      const last = r.years[r.years.length - 1];
      if (last && last.fy === lastFy) cat[k].closing = r2(cat[k].closing + last.closing);
    });
    return {
      years: years.map((y) => ({ fy: y, label: fyLabel(y) })),
      rows: rows,
      totals: totals,
      byCategory: Object.keys(cat)
        .sort()
        .map((k) => cat[k]),
      invalid: invalid,
    };
  }

  const HEADERS = {
    name: ['asset', 'asset name', 'name', 'description', 'item'],
    category: ['category', 'asset class', 'class', 'group', 'type'],
    cost: ['cost', 'purchase cost', 'amount', 'gross block', 'value', 'original cost'],
    purchaseDate: ['purchase date', 'date of purchase', 'date', 'capitalisation date', 'put to use', 'put to use date', 'bought on'],
    method: ['method', 'depreciation method'],
    lifeYears: ['life', 'life years', 'useful life', 'life (years)', 'years'],
    ratePct: ['rate', 'rate %', 'depreciation rate', 'dep rate'],
    salvagePct: ['salvage', 'salvage %', 'residual', 'residual %', 'scrap %', 'salvage value %'],
    disposalDate: ['disposal date', 'sold on', 'date of sale', 'date of disposal', 'sale date'],
    proceeds: ['proceeds', 'sale value', 'sale proceeds', 'disposal value'],
  };

  /** Spreadsheet rows (with header) -> { assets, errors }. Missing life uses the category's sample life. */
  function rowsToAssets(aoa, defaults) {
    const d = Object.assign({ method: 'SLM', salvagePct: 5 }, defaults);
    const rows = (aoa || []).filter((r) => Array.isArray(r) && r.some((c) => norm(c) !== ''));
    if (rows.length < 2) return { assets: [], errors: ['The file needs a header row and at least one asset.'] };
    const head = rows[0].map((h) => norm(h).toLowerCase());
    const col = {};
    Object.keys(HEADERS).forEach((k) => (col[k] = head.findIndex((h) => HEADERS[k].indexOf(h) !== -1)));
    if (col.name === -1 || col.cost === -1 || col.purchaseDate === -1)
      return { assets: [], errors: ['Need columns for Asset name, Cost and Purchase date.'] };
    const assets = [];
    const errors = [];
    const val = (r, k) => (col[k] === -1 ? '' : r[col[k]]);
    const n = (v) => {
      const t = norm(v).replace(/,/g, '').replace(/%$/, '');
      return t === '' ? null : Number(t);
    };
    rows.slice(1).forEach((r, i) => {
      const line = i + 2;
      const cost = n(val(r, 'cost'));
      if (cost === null || !Number.isFinite(cost)) return errors.push('Row ' + line + ': cost could not be read, so the row was skipped.');
      const cat = norm(val(r, 'category'));
      const m = norm(val(r, 'method')).toUpperCase();
      const method = /WDV|WRITTEN|REDUC|DIMIN/.test(m) ? 'WDV' : /SLM|STRAIGHT|^SL$/.test(m) ? 'SLM' : d.method;
      let life = n(val(r, 'lifeYears'));
      if ((life === null || !(life > 0)) && CATEGORIES[cat]) life = CATEGORIES[cat];
      const rate = n(val(r, 'ratePct'));
      const salv = n(val(r, 'salvagePct'));
      const pd = OT.toIsoDate(val(r, 'purchaseDate'));
      const dd = norm(val(r, 'disposalDate')) ? OT.toIsoDate(val(r, 'disposalDate')) : '';
      if (!pd) return errors.push('Row ' + line + ': purchase date could not be read, so the row was skipped.');
      const a = {
        name: norm(val(r, 'name')),
        category: cat,
        cost: cost,
        purchaseDate: pd,
        method: method,
        lifeYears: life > 0 ? life : 0,
        ratePct: rate > 0 ? rate : 0,
        salvagePct: salv === null || !Number.isFinite(salv) ? d.salvagePct : salv,
        disposalDate: dd,
        proceeds: n(val(r, 'proceeds')) || 0,
      };
      assets.push(a);
    });
    return { assets: assets, errors: errors };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  /** One row per asset per year. */
  function toCsv(res) {
    const head = [
      'Asset',
      'Category',
      'Method',
      'Rate %',
      'Financial year',
      'Opening value',
      'Additions',
      'Depreciation',
      'Disposal (book value)',
      'Gain / loss on disposal',
      'Closing value',
    ];
    const out = [head];
    res.rows.forEach((r) =>
      r.years.forEach((x) =>
        out.push([
          r.asset.name,
          r.asset.category,
          r.asset.method,
          r.rate,
          fyLabel(x.fy),
          x.opening,
          x.additions,
          x.depreciation,
          x.disposal,
          x.gainLoss,
          x.closing,
        ]),
      ),
    );
    return '﻿' + out.map((r) => r.map(cell).join(',')).join('\r\n');
  }

  function sampleRows() {
    return [
      ['Asset', 'Category', 'Cost', 'Purchase Date', 'Method', 'Life (years)', 'Salvage %', 'Disposal Date', 'Sale Proceeds'],
      ['Dell laptops (10)', 'Computers and laptops', '650000', '15/06/2025', 'SLM', '', '5', '', ''],
      ['Office furniture', 'Furniture and fittings', '300000', '01/10/2025', 'WDV', '10', '5', '', ''],
      ['Delivery van', 'Vehicles', '900000', '20/01/2026', 'SLM', '8', '5', '', ''],
      ['CNC machine', 'Plant and machinery', '2500000', '10/04/2025', 'WDV', '15', '5', '31/08/2026', '1700000'],
    ];
  }

  return {
    CATEGORIES: CATEGORIES,
    fyOf: fyOf,
    fyLabel: fyLabel,
    wdvRateFromLife: wdvRateFromLife,
    problems: problems,
    schedule: schedule,
    rowsToAssets: rowsToAssets,
    toCsv: toCsv,
    sampleRows: sampleRows,
  };
});
