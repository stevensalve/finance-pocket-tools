/* Cash-flow Forecaster - user interface. All projection lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, el } = OT;
  const $ = (id) => document.getElementById(id);
  let result = null;

  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  $('start').value = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  $('items').value = CashCore.sampleText();

  function run() {
    $('results').hidden = true;
    const parsed = CashCore.parseItems($('items').value);
    if (!parsed.items.length)
      return setStatus($('status'), parsed.errors.join(' ') || 'Add at least one line.', parsed.errors.length ? 'error' : 'warn');
    const opts = {
      start: $('start').value,
      openingBalance: Number($('opening').value),
      weeks: Number($('weeks').value),
      minBalance: Number($('min').value) || 0,
    };
    try {
      result = CashCore.project(parsed.items, opts);
      const s = CashCore.stress(parsed.items, opts, Number($('delay').value) || 0, Number($('pct').value));
      renderStress(s);
    } catch (e) {
      result = null;
      return setStatus($('status'), e.message, 'error');
    }
    setStatus(
      $('status'),
      parsed.errors.length ? parsed.errors.slice(0, 3).join(' ') : parsed.items.length + ' items understood.',
      parsed.errors.length ? 'warn' : 'ok',
    );
    const f = (v) => OT.formatInr(v, 0);
    const first = result.firstShortfall;
    $('headline').textContent =
      (first
        ? 'Balance falls below Rs. ' +
          f(Number($('min').value) || 0) +
          ' on ' +
          OT.formatDate(first.date, 'dmy') +
          (first.days ? ' (in ' + first.days + ' days)' : ' (already)') +
          '. '
        : 'The balance stays above the limit. ') +
      'Lowest point: Rs. ' +
      f(result.lowest.balance) +
      ' on ' +
      OT.formatDate(result.lowest.date, 'dmy') +
      '. Ends at Rs. ' +
      f(result.totals.closing) +
      '.';
    const t = $('t-weeks');
    t.textContent = '';
    t.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          ['Week', 'In', 'Out', 'Net', 'Closing', 'Lowest', 'Balance'].map((h, i) =>
            el('th', { scope: 'col', class: i > 0 && i < 6 ? 'num' : '', text: h }),
          ),
        ),
      ]),
    );
    const max = Math.max.apply(null, result.weeks.map((w) => Math.abs(w.closing)).concat([1]));
    const body = el('tbody');
    result.weeks.forEach((w) => {
      const fill = el('span');
      fill.style.width = Math.round((Math.abs(w.closing) / max) * 100) + '%';
      body.appendChild(
        el('tr', {}, [
          el('td', { text: OT.formatDate(w.start, 'dmy') }),
          el('td', { class: 'num', text: f(w.inflow) }),
          el('td', { class: 'num', text: f(w.outflow) }),
          el('td', { class: 'num' + (w.net < 0 ? ' neg' : ''), text: f(w.net) }),
          el('td', { class: 'num' + (w.closing < 0 ? ' neg' : ''), text: f(w.closing) }),
          el('td', { class: 'num' + (w.lowest < 0 ? ' neg' : ''), text: f(w.lowest) }),
          el('td', {}, [
            el('div', { class: 'bar' + (w.closing < 0 ? ' neg' : ''), role: 'img', 'aria-label': 'Closing balance ' + f(w.closing) }, [
              fill,
            ]),
          ]),
        ]),
      );
    });
    t.appendChild(body);
    $('results').hidden = false;
  }

  function renderStress(s) {
    const f = (v) => OT.formatInr(v, 0);
    const body = $('stress');
    body.textContent = '';
    [
      ['Closing balance as planned', s.base.totals.closing],
      ['Closing balance in this scenario', s.stressed.totals.closing],
      ['Difference', s.closingDifference],
      ['Lowest balance as planned', s.base.lowest.balance],
      ['Lowest balance in this scenario', s.stressed.lowest.balance],
    ].forEach((r) => body.appendChild(el('tr', {}, [el('td', { text: r[0] }), el('td', { text: f(r[1]) })])));
    const sf = s.stressed.firstShortfall;
    $('stress-note').textContent = sf
      ? 'In this scenario the balance falls below the limit on ' + OT.formatDate(sf.date, 'dmy') + '.'
      : 'In this scenario the balance stays above the limit.';
  }

  ['items', 'opening', 'start', 'weeks', 'min', 'delay', 'pct'].forEach((id) => $(id).addEventListener('input', run));
  $('csv').addEventListener(
    'click',
    () => result && downloadBlob(CashCore.toCsv(result), 'cashflow-forecast.csv', 'text/csv;charset=utf-8'),
  );
  run();
})();
