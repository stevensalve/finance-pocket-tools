/**
 * Compliance Calendar - core logic (pure; dates are ISO strings, "today" is always passed in).
 *
 * Builds the statutory due dates of an Indian financial year (1 April to 31 March) from a list of editable rules.
 * IMPORTANT: due dates are changed by government notifications and vary by state, turnover and filing scheme.
 * The built-in rules are common general-case dates and are a starting point: check them against the current notifications.
 *
 * Rule types:
 *   { type: "monthly", day, marchDay? }  one due date per month for the PREVIOUS month's period (the date falls in the next month);
 *                                         marchDay replaces the day for the March period (due in April)
 *   { type: "fixed", dates: [[month, day, yearOffset, label]] }  month 1-12; yearOffset 0 = year the FY starts, 1 = next year
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.ComplianceCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYMS = 86400000;
  const pad = (n) => String(n).padStart(2, '0');

  const ITEMS = [
    {
      id: 'gstr1',
      group: 'GST',
      name: 'GSTR-1 (monthly filers)',
      rule: { type: 'monthly', day: 11 },
      on: true,
      note: 'Outward supplies for the month.',
    },
    {
      id: 'gstr3b',
      group: 'GST',
      name: 'GSTR-3B (monthly filers)',
      rule: { type: 'monthly', day: 20 },
      on: true,
      note: 'Summary return and tax payment. Staggered dates for QRMP and some states; verify.',
    },
    {
      id: 'gstr1q',
      group: 'GST',
      name: 'GSTR-1 (quarterly, QRMP)',
      rule: {
        type: 'fixed',
        dates: [
          [7, 13, 0, 'Apr-Jun'],
          [10, 13, 0, 'Jul-Sep'],
          [1, 13, 1, 'Oct-Dec'],
          [4, 13, 1, 'Jan-Mar'],
        ],
      },
      on: false,
      note: 'For taxpayers who chose the quarterly scheme.',
    },
    {
      id: 'gstr3bq',
      group: 'GST',
      name: 'GSTR-3B (quarterly, QRMP)',
      rule: {
        type: 'fixed',
        dates: [
          [7, 22, 0, 'Apr-Jun'],
          [10, 22, 0, 'Jul-Sep'],
          [1, 22, 1, 'Oct-Dec'],
          [4, 22, 1, 'Jan-Mar'],
        ],
      },
      on: false,
      note: '22nd or 24th depending on the state; verify.',
    },
    {
      id: 'gstr9',
      group: 'GST',
      name: 'GSTR-9 annual return',
      rule: { type: 'fixed', dates: [[12, 31, 1, 'Annual']] },
      on: true,
      note: 'Due 31 December after the year end.',
    },
    {
      id: 'tdspay',
      group: 'TDS',
      name: 'TDS / TCS payment',
      rule: { type: 'monthly', day: 7, marchDay: 30 },
      on: true,
      note: 'Deducted in the month; due on the 7th of the next month (30 April for March).',
    },
    {
      id: 'tdsret',
      group: 'TDS',
      name: 'TDS return (24Q / 26Q / 27Q)',
      rule: {
        type: 'fixed',
        dates: [
          [7, 31, 0, 'Q1'],
          [10, 31, 0, 'Q2'],
          [1, 31, 1, 'Q3'],
          [5, 31, 1, 'Q4'],
        ],
      },
      on: true,
      note: 'Quarterly statements.',
    },
    {
      id: 'tdscert',
      group: 'TDS',
      name: 'TDS certificates (Form 16A / Form 16)',
      rule: {
        type: 'fixed',
        dates: [
          [8, 15, 0, 'Q1'],
          [11, 15, 0, 'Q2'],
          [2, 15, 1, 'Q3'],
          [6, 15, 1, 'Q4 and Form 16'],
        ],
      },
      on: true,
      note: 'Within 15 days of the return due date.',
    },
    {
      id: 'pf',
      group: 'Payroll',
      name: 'Provident Fund (ECR and payment)',
      rule: { type: 'monthly', day: 15 },
      on: true,
      note: 'For the previous month.',
    },
    {
      id: 'esi',
      group: 'Payroll',
      name: 'ESI contribution',
      rule: { type: 'monthly', day: 15 },
      on: true,
      note: 'For the previous month.',
    },
    {
      id: 'advtax',
      group: 'Income tax',
      name: 'Advance tax instalment',
      rule: {
        type: 'fixed',
        dates: [
          [6, 15, 0, '15% of the year'],
          [9, 15, 0, '45% cumulative'],
          [12, 15, 0, '75% cumulative'],
          [3, 15, 1, '100% cumulative'],
        ],
      },
      on: true,
      note: 'Cumulative percentages of the estimated tax.',
    },
    {
      id: 'audit',
      group: 'Income tax',
      name: 'Tax audit report',
      rule: { type: 'fixed', dates: [[9, 30, 1, 'Previous year']] },
      on: false,
      note: 'For accounts that need an audit.',
    },
    {
      id: 'itr',
      group: 'Income tax',
      name: 'Income-tax return (non-audit cases)',
      rule: { type: 'fixed', dates: [[7, 31, 1, 'Previous year']] },
      on: true,
      note: 'Individuals and others not needing an audit.',
    },
    {
      id: 'itra',
      group: 'Income tax',
      name: 'Income-tax return (audit cases)',
      rule: { type: 'fixed', dates: [[10, 31, 1, 'Previous year']] },
      on: false,
      note: 'Companies and others whose accounts are audited.',
    },
  ];

  /** Calendar date -> ISO. */
  function iso(y, m, d) {
    return y + '-' + pad(m) + '-' + pad(d);
  }
  function lastDay(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  /** Weekday number (0 = Sunday) of an ISO date. */
  function weekday(date) {
    return new Date(OT.parseIsoDate(date)).getUTCDay();
  }

  /** Move a date off weekly offs and holidays. mode: "none", "previous" (earlier working day) or "next". */
  function shift(date, mode, offs, holidays) {
    if (mode !== 'previous' && mode !== 'next') return date;
    const off = (d) => offs.indexOf(weekday(d)) !== -1 || holidays.has(d);
    let d = date;
    for (let i = 0; i < 20 && off(d); i++) d = OT.addDays(d, mode === 'next' ? 1 : -1);
    return d;
  }

  /**
   * generate(fyStartYear, items, opts) opts: { shift: "none" | "previous" | "next", weekOffs: [0], holidays: ["2026-10-02"] }
   * items: [{ id, group, name, rule, on, note }] (use ITEMS, optionally with changed days or switched on/off).
   * Returns events [{ date, original, id, group, name, period, note, moved }] sorted by date.
   */
  function generate(fyStartYear, items, opts) {
    const o = Object.assign({ shift: 'none', weekOffs: [0], holidays: [] }, opts);
    if (!Number.isInteger(fyStartYear) || fyStartYear < 2000 || fyStartYear > 2100)
      throw new Error('Choose a financial year between 2000 and 2100.');
    const hol = new Set();
    o.holidays.forEach((h) => {
      const d = OT.toIsoDate(h);
      if (d) hol.add(d);
    });
    const events = [];
    items
      .filter((it) => it.on)
      .forEach((it) => {
        const r = it.rule;
        const push = (date, period) => {
          const moved = shift(date, o.shift, o.weekOffs, hol);
          events.push({
            date: moved,
            original: date,
            id: it.id,
            group: it.group,
            name: it.name,
            period: period,
            note: it.note || '',
            moved: moved !== date,
          });
        };
        if (r.type === 'monthly') {
          for (let i = 0; i < 12; i++) {
            const m = ((3 + i) % 12) + 1; // period month: Apr..Mar
            const y = fyStartYear + (3 + i >= 12 ? 1 : 0);
            const dm = m === 12 ? 1 : m + 1;
            const dy = m === 12 ? y + 1 : y;
            const day = m === 3 && r.marchDay ? r.marchDay : r.day;
            push(iso(dy, dm, Math.min(day, lastDay(dy, dm))), 'for ' + MON[m - 1].slice(0, 3) + ' ' + y);
          }
        } else if (r.type === 'fixed') {
          r.dates.forEach((d) => push(iso(fyStartYear + d[2], d[0], Math.min(d[1], lastDay(fyStartYear + d[2], d[0]))), d[3] || ''));
        }
      });
    events.sort((a, b) => a.date.localeCompare(b.date) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
    return events;
  }

  /** Events from today until `days` days ahead (overdue ones within the last 7 days are flagged). */
  function upcoming(events, today, days) {
    const t = OT.parseIsoDate(today);
    return events
      .map((e) => Object.assign({}, e, { daysLeft: Math.round((OT.parseIsoDate(e.date) - t) / DAYMS) }))
      .filter((e) => e.daysLeft >= -7 && e.daysLeft <= days);
  }

  /** Events grouped by month key "2026-10". */
  function byMonth(events) {
    const m = {};
    events.forEach((e) => (m[e.date.slice(0, 7)] = (m[e.date.slice(0, 7)] || []).concat([e])));
    return Object.keys(m)
      .sort()
      .map((k) => ({ key: k, label: MON[Number(k.slice(5)) - 1] + ' ' + k.slice(0, 4), events: m[k] }));
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };

  function toCsv(events) {
    const head = ['Due date', 'Day', 'Group', 'Item', 'Period', 'Note', 'Moved from'];
    const rows = events.map((e) => [
      e.date,
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday(e.date)],
      e.group,
      e.name,
      e.period,
      e.note,
      e.moved ? e.original : '',
    ]);
    return (
      '\ufeff' +
      [head]
        .concat(rows)
        .map((r) => r.map(cell).join(','))
        .join('\r\n')
    );
  }

  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function fold(line) {
    const out = [];
    let cur = '';
    let bytes = 0;
    for (const ch of line) {
      const b = new TextEncoder().encode(ch).length;
      if (bytes + b > 73) {
        out.push(cur);
        cur = ' ';
        bytes = 1;
      }
      cur += ch;
      bytes += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  /** All-day calendar events with an optional reminder `alarmDays` before (0 = none). stamp: "20261023T000000Z". */
  function toIcs(events, stamp, alarmDays) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) throw new Error('The timestamp must look like 20261023T000000Z.');
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Finance Pocket Tools//Compliance Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];
    events.forEach((e, i) => {
      const d = e.date.replace(/-/g, '');
      const next = OT.addDays(e.date, 1).replace(/-/g, '');
      lines.push(
        'BEGIN:VEVENT',
        'UID:' + e.id + '-' + d + '-' + i + '@finance-pocket-tools',
        'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + d,
        'DTEND;VALUE=DATE:' + next,
        'SUMMARY:' + esc(e.name + (e.period ? ' (' + e.period + ')' : '')),
        'DESCRIPTION:' +
          esc(
            (e.note || '') +
              (e.moved ? ' Moved from ' + OT.formatDate(e.original, 'dmy') + ' (weekly off or holiday).' : '') +
              ' Check the current due date on the official portal.',
          ),
        'CATEGORIES:' + esc(e.group),
        'TRANSP:TRANSPARENT',
      );
      if (alarmDays > 0)
        lines.push(
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          'DESCRIPTION:' + esc(e.name + ' due in ' + alarmDays + ' days'),
          'TRIGGER:-P' + alarmDays + 'D',
          'END:VALARM',
        );
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  /** Copy of ITEMS that is safe to edit. */
  function defaultItems() {
    return JSON.parse(JSON.stringify(ITEMS));
  }

  /** Parse extra recurring items: "Name, day" (monthly on that day) or "Name, 2026-12-31" (one date). Returns { items, errors }. */
  function parseCustom(text) {
    const items = [];
    const errors = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        const m = /^(.+?)\s*,\s*(\d{4}-\d{2}-\d{2}|\d{1,2})$/.exec(line);
        if (!m) return errors.push('Line ' + (i + 1) + ': write it like "Professional tax, 30" or "AGM, 2026-09-30".');
        const name = m[1].trim().slice(0, 80);
        if (/^\d{1,2}$/.test(m[2])) {
          const d = Number(m[2]);
          if (d < 1 || d > 31) return errors.push('Line ' + (i + 1) + ': the day must be 1 to 31.');
          items.push({ id: 'custom' + i, group: 'Custom', name: name, rule: { type: 'monthly', day: d }, on: true, note: '' });
        } else {
          try {
            OT.parseIsoDate(m[2]);
          } catch (e) {
            return errors.push('Line ' + (i + 1) + ': that date does not exist.');
          }
          items.push({ id: 'custom' + i, group: 'Custom', name: name, rule: { type: 'one', date: m[2] }, on: true, note: '' });
        }
      });
    return { items: items, errors: errors };
  }

  /** One-off custom dates (rule type "one") are turned into fixed rules, then everything is generated together. */
  function generateAll(fy, items, opts) {
    const fixed = items.map((it) =>
      it.rule.type === 'one'
        ? Object.assign({}, it, {
            rule: {
              type: 'fixed',
              dates: [[Number(it.rule.date.slice(5, 7)), Number(it.rule.date.slice(8, 10)), Number(it.rule.date.slice(0, 4)) - fy, '']],
            },
          })
        : it,
    );
    return generate(fy, fixed, opts);
  }

  return {
    ITEMS: ITEMS,
    defaultItems: defaultItems,
    weekday: weekday,
    shift: shift,
    generate: generateAll,
    upcoming: upcoming,
    byMonth: byMonth,
    toCsv: toCsv,
    toIcs: toIcs,
    parseCustom: parseCustom,
  };
});
