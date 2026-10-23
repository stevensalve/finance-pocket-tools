/**
 * Cash-flow Forecaster - core logic (pure; the start date is always passed in).
 *
 * Items, one per line:  Name, in|out, amount, when
 *   when:  once 2026-11-05
 *          weekly fri                       (mon tue wed thu fri sat sun)
 *          monthly 5                        (day of month; 31 means the last day of every month)
 *          every 14 days from 2026-11-01
 *        optional endings:  from 2026-12-01   until 2027-03-31   (limit the dates an item repeats)
 * The balance is tracked day by day: a day's inflows and outflows are applied together at the end of the day.
 * A stress test can delay every inflow and/or reduce inflows by a percentage.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.CashCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const DAY = 86400000;
  const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const MAX_ITEMS = 200;

  /** Parse the item lines -> { items, errors }. */
  function parseItems(text) {
    const items = [];
    const errors = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        const bad = (why) => errors.push('Line ' + (i + 1) + ': ' + why);
        const head = /^(.+?)\s*,\s*(in|out)\s*,\s*([\d,]*\.?\d*)\s*,\s*(.+)$/i.exec(line);
        if (!head) return bad('write it like "Rent, out, 50000, monthly 1" (name, in or out, amount, when).');
        const name = head[1].trim().slice(0, 80);
        const dir = head[2].toLowerCase();
        const amount = OT.parseAmount(head[3]);
        if (!amount) return bad('the amount must be a number above zero.');
        const original = head[4].trim();
        let when = original.toLowerCase();
        const item = { name: name, dir: dir, amount: amount, from: '', until: '' };
        let m0 = /\s+until\s+(\d{4}-\d{2}-\d{2})$/.exec(when);
        if (m0) {
          item.until = m0[1];
          when = when.slice(0, m0.index);
        }
        if (!/^every\s+\d+\s+days\s+from\s+\d{4}-\d{2}-\d{2}$/.test(when)) {
          m0 = /\s+from\s+(\d{4}-\d{2}-\d{2})$/.exec(when);
          if (m0) {
            item.from = m0[1];
            when = when.slice(0, m0.index);
          }
        }
        let m;
        try {
          if ((m = /^once\s+(\d{4}-\d{2}-\d{2})$/.exec(when))) {
            OT.parseIsoDate(m[1]);
            item.kind = 'once';
            item.date = m[1];
          } else if ((m = /^weekly\s+(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/.exec(when))) {
            item.kind = 'weekly';
            item.dow = DOW[m[1]];
          } else if ((m = /^monthly\s+(\d{1,2})$/.exec(when))) {
            if (Number(m[1]) < 1 || Number(m[1]) > 31) return bad('the day of the month must be 1 to 31.');
            item.kind = 'monthly';
            item.day = Number(m[1]);
          } else if ((m = /^every\s+(\d{1,3})\s+days\s+from\s+(\d{4}-\d{2}-\d{2})$/.exec(when))) {
            OT.parseIsoDate(m[2]);
            if (Number(m[1]) < 1) return bad('"every" needs at least 1 day.');
            item.kind = 'every';
            item.n = Number(m[1]);
            item.date = m[2];
          } else
            return bad(
              'could not understand "' +
                original +
                '". Try "monthly 5", "weekly fri", "once 2026-11-05" or "every 14 days from 2026-11-01".',
            );
          if (item.from) OT.parseIsoDate(item.from);
          if (item.until) OT.parseIsoDate(item.until);
        } catch (e) {
          return bad('a date in this line does not exist.');
        }
        items.push(item);
      });
    return { items: items.slice(0, MAX_ITEMS), errors: errors };
  }

  const iso = (t) => new Date(t).toISOString().slice(0, 10);

  /** Dates (ISO) on which an item happens between start and end inclusive. */
  function occurrences(item, start, end) {
    const s = OT.parseIsoDate(start);
    const e = OT.parseIsoDate(end);
    const lo = Math.max(s, item.from ? OT.parseIsoDate(item.from) : s);
    const hi = Math.min(e, item.until ? OT.parseIsoDate(item.until) : e);
    const out = [];
    if (hi < lo) return out;
    if (item.kind === 'once') {
      const d = OT.parseIsoDate(item.date);
      if (d >= lo && d <= hi) out.push(item.date);
    } else if (item.kind === 'weekly') {
      for (let t = lo; t <= hi; t += DAY) if (new Date(t).getUTCDay() === item.dow) out.push(iso(t));
    } else if (item.kind === 'monthly') {
      const d0 = new Date(lo);
      for (let y = d0.getUTCFullYear(), m = d0.getUTCMonth(); Date.UTC(y, m, 1) <= hi; m++) {
        const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        const t = Date.UTC(y, m, Math.min(item.day, last));
        if (t >= lo && t <= hi) out.push(iso(t));
        if (m === 11) {
          m = -1;
          y++;
        }
      }
    } else if (item.kind === 'every') {
      const base = OT.parseIsoDate(item.date);
      const step = item.n * DAY;
      let t = base;
      if (t < lo) t += Math.ceil((lo - t) / step) * step;
      for (; t <= hi; t += step) out.push(iso(t));
    }
    return out;
  }

  /**
   * project(items, opts) opts: { start (ISO), openingBalance, weeks (1-104), minBalance (default 0), delayInDays (default 0), inflowPct (default 100) }
   * -> { weeks: [{ start, end, inflow, outflow, net, closing, lowest }], lowest: { date, balance }, firstShortfall: { date, balance, days } | null, totals, events }
   */
  function project(items, opts) {
    const o = Object.assign({ openingBalance: 0, weeks: 13, minBalance: 0, delayInDays: 0, inflowPct: 100 }, opts);
    OT.parseIsoDate(o.start);
    if (!Number.isFinite(Number(o.openingBalance))) throw new Error('Enter the opening balance.');
    if (!Number.isInteger(o.weeks) || o.weeks < 1 || o.weeks > 104) throw new Error('Choose 1 to 104 weeks.');
    if (!(o.delayInDays >= 0 && o.delayInDays <= 365)) throw new Error('The delay must be between 0 and 365 days.');
    if (!(o.inflowPct >= 0 && o.inflowPct <= 200)) throw new Error('Inflows must be between 0 and 200 percent of plan.');
    const total = o.weeks * 7;
    const end = OT.addDays(o.start, total - 1);
    const daily = new Array(total).fill(0).map(() => ({ in: 0, out: 0 }));
    const events = [];
    items.forEach((it) => {
      // an inflow delayed by N days is received N days later, so look N days earlier for the original date
      const lookStart = it.dir === 'in' && o.delayInDays ? OT.addDays(o.start, -o.delayInDays) : o.start;
      const lookEnd = it.dir === 'in' && o.delayInDays ? OT.addDays(end, -o.delayInDays) : end;
      occurrences(it, lookStart, lookEnd).forEach((d) => {
        const actual = it.dir === 'in' ? OT.addDays(d, o.delayInDays) : d;
        const idx = Math.round((OT.parseIsoDate(actual) - OT.parseIsoDate(o.start)) / DAY);
        if (idx < 0 || idx >= total) return;
        const amt = it.dir === 'in' ? r2((it.amount * o.inflowPct) / 100) : it.amount;
        daily[idx][it.dir] = r2(daily[idx][it.dir] + amt);
        events.push({ date: actual, name: it.name, dir: it.dir, amount: amt });
      });
    });
    events.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    let bal = r2(Number(o.openingBalance));
    let lowest = { date: o.start, balance: bal };
    let first = null;
    if (bal < o.minBalance) first = { date: o.start, balance: bal, days: 0 };
    const weeks = [];
    for (let w = 0; w < o.weeks; w++) {
      const wk = {
        start: OT.addDays(o.start, w * 7),
        end: OT.addDays(o.start, w * 7 + 6),
        inflow: 0,
        outflow: 0,
        net: 0,
        closing: 0,
        lowest: bal,
      };
      for (let d = 0; d < 7; d++) {
        const i = w * 7 + d;
        wk.inflow = r2(wk.inflow + daily[i].in);
        wk.outflow = r2(wk.outflow + daily[i].out);
        bal = r2(bal + daily[i].in - daily[i].out);
        const date = OT.addDays(o.start, i);
        if (bal < wk.lowest) wk.lowest = bal;
        if (bal < lowest.balance) lowest = { date: date, balance: bal };
        if (!first && bal < o.minBalance) first = { date: date, balance: bal, days: i };
      }
      wk.net = r2(wk.inflow - wk.outflow);
      wk.closing = bal;
      weeks.push(wk);
    }
    const sum = (f) => r2(weeks.reduce((a, w) => a + w[f], 0));
    return {
      weeks: weeks,
      lowest: lowest,
      firstShortfall: first,
      totals: { inflow: sum('inflow'), outflow: sum('outflow'), net: sum('net'), closing: bal, opening: r2(Number(o.openingBalance)) },
      events: events,
      end: end,
    };
  }

  /** Base plan against a stressed plan. */
  function stress(items, opts, delayInDays, inflowPct) {
    const base = project(items, Object.assign({}, opts, { delayInDays: 0, inflowPct: 100 }));
    const hard = project(items, Object.assign({}, opts, { delayInDays: delayInDays, inflowPct: inflowPct }));
    return { base: base, stressed: hard, closingDifference: r2(hard.totals.closing - base.totals.closing) };
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function toCsv(res) {
    const head = ['Week starting', 'Week ending', 'Inflows', 'Outflows', 'Net', 'Closing balance', 'Lowest balance in week'];
    const rows = res.weeks.map((w) => [w.start, w.end, w.inflow, w.outflow, w.net, w.closing, w.lowest]);
    return (
      '﻿' +
      [head]
        .concat(rows)
        .map((r) => r.map(cell).join(','))
        .join('\r\n')
    );
  }

  function sampleText() {
    return [
      'Customer receipts - Beta Ltd, in, 650000, monthly 10',
      'Customer receipts - retail, in, 40000, weekly fri',
      'Salaries, out, 380000, monthly 1',
      'Rent, out, 90000, monthly 5',
      'GST payment, out, 120000, monthly 20',
      'TDS payment, out, 25000, monthly 7',
      'Vendor payments, out, 60000, every 14 days from 2026-10-26',
      'Insurance premium, out, 150000, once 2026-12-15',
      'Annual licence, out, 75000, once 2027-01-10',
    ].join('\n');
  }

  return { parseItems: parseItems, occurrences: occurrences, project: project, stress: stress, toCsv: toCsv, sampleText: sampleText };
});
