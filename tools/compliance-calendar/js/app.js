/* Compliance Calendar - user interface. All date logic lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, el } = OT;
  const $ = (id) => document.getElementById(id);
  const items = ComplianceCore.defaultItems();
  let events = [];

  const now = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  $('fy').value = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  $('today').value = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate());

  function buildItems() {
    const body = $('items-body');
    body.textContent = '';
    items.forEach((it) => {
      const box = el('input', { type: 'checkbox', 'aria-label': 'Include ' + it.name });
      box.checked = it.on;
      box.addEventListener('change', () => {
        it.on = box.checked;
        run();
      });
      let dayCell;
      if (it.rule.type === 'monthly') {
        const d = el('input', { type: 'number', class: 'day', min: '1', max: '31', 'aria-label': 'Day of month for ' + it.name });
        d.value = it.rule.day;
        d.addEventListener('input', () => {
          const v = Number(d.value);
          if (v >= 1 && v <= 31) {
            it.rule.day = v;
            run();
          }
        });
        dayCell = el('td', {}, [d]);
      } else dayCell = el('td', { text: 'fixed dates' });
      body.appendChild(
        el('tr', {}, [
          el('td', {}, [box]),
          el('td', { text: it.group }),
          el('td', { text: it.name }),
          dayCell,
          el('td', { text: it.note }),
        ]),
      );
    });
  }

  function run() {
    const custom = ComplianceCore.parseCustom($('custom').value);
    try {
      const all = items.concat(custom.items);
      events = ComplianceCore.generate(Number($('fy').value), all, {
        shift: $('shift').value,
        weekOffs: $('offs').value.split(',').map(Number),
        holidays: $('holidays')
          .value.split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
    } catch (e) {
      events = [];
      return setStatus($('status'), e.message, 'error');
    }
    setStatus($('status'), custom.errors.join(' ') || events.length + ' due dates.', custom.errors.length ? 'warn' : 'ok');

    const up = ComplianceCore.upcoming(events, $('today').value, Number($('ahead').value) || 45);
    const t = $('t-up');
    t.textContent = '';
    t.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          ['Due', 'Days', 'Group', 'Item', 'For'].map((h) => el('th', { scope: 'col', text: h })),
        ),
      ]),
    );
    const b = el('tbody');
    up.forEach((e) =>
      b.appendChild(
        el('tr', {}, [
          el('td', { class: e.moved ? 'moved' : '', text: OT.formatDate(e.date, 'dmy') + (e.moved ? ' (moved)' : '') }),
          el('td', {
            class: e.daysLeft <= 7 ? 'soon' : '',
            text: e.daysLeft < 0 ? Math.abs(e.daysLeft) + ' days ago' : e.daysLeft === 0 ? 'today' : String(e.daysLeft),
          }),
          el('td', { text: e.group }),
          el('td', { text: e.name }),
          el('td', { text: e.period }),
        ]),
      ),
    );
    if (!up.length) b.appendChild(el('tr', {}, [el('td', { colspan: '5', text: 'Nothing due in this period.' })]));
    t.appendChild(b);

    const host = $('months');
    host.textContent = '';
    ComplianceCore.byMonth(events).forEach((m) => {
      const det = el('details');
      det.appendChild(el('summary', { text: m.label + ' (' + m.events.length + ')' }));
      const ul = el('ul');
      m.events.forEach((e) =>
        ul.appendChild(el('li', { text: OT.formatDate(e.date, 'dmy') + ' - ' + e.name + (e.period ? ' (' + e.period + ')' : '') })),
      );
      det.appendChild(ul);
      host.appendChild(det);
    });
  }

  ['fy', 'shift', 'offs', 'holidays', 'custom', 'today', 'ahead'].forEach((id) => $(id).addEventListener('input', run));
  $('csv').addEventListener(
    'click',
    () => events.length && downloadBlob(ComplianceCore.toCsv(events), 'compliance-calendar.csv', 'text/csv;charset=utf-8'),
  );
  $('ics').addEventListener('click', () => {
    if (!events.length) return;
    const d = new Date();
    const stamp =
      d.getUTCFullYear() +
      p2(d.getUTCMonth() + 1) +
      p2(d.getUTCDate()) +
      'T' +
      p2(d.getUTCHours()) +
      p2(d.getUTCMinutes()) +
      p2(d.getUTCSeconds()) +
      'Z';
    downloadBlob(ComplianceCore.toIcs(events, stamp, Number($('alarm').value)), 'compliance-calendar.ics', 'text/calendar;charset=utf-8');
  });
  buildItems();
  run();
})();
