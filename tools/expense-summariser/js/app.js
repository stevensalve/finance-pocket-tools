/* Expense Claims Summariser - user interface. All checking lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readArrayBuffer, el } = OT;
  const $ = (id) => document.getElementById(id);
  let claims = null;
  let reviewed = null;
  const today = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  $('asof').value = today();

  function table(id, head, list, label) {
    const t = $(id);
    t.textContent = '';
    t.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          [head, 'Claims', 'Total', 'Flagged claims', 'Flagged amount'].map((h, i) =>
            el('th', { scope: 'col', class: i ? 'num' : '', text: h }),
          ),
        ),
      ]),
    );
    const body = el('tbody');
    list.forEach((g) =>
      body.appendChild(
        el('tr', {}, [
          el('td', { text: label ? label(g.key) : g.key }),
          el('td', { class: 'num', text: String(g.count) }),
          el('td', { class: 'num', text: OT.formatInr(g.total, 2) }),
          el('td', { class: 'num', text: String(g.flagged) }),
          el('td', { class: 'num', text: OT.formatInr(g.flaggedAmount, 2) }),
        ]),
      ),
    );
    t.appendChild(body);
  }

  function run() {
    $('results').hidden = true;
    if (!claims) return;
    const lim = ExpenseCore.parseLimits($('limits').value);
    setStatus($('lim-status'), lim.errors.join(' '), lim.errors.length ? 'warn' : '');
    try {
      reviewed = ExpenseCore.review(
        claims,
        {
          limits: lim.limits,
          receiptAbove: Number($('receipt').value) || 0,
          maxAgeDays: Number($('age').value) || 0,
          monthlyCap: Number($('cap').value) || 0,
        },
        $('asof').value,
      );
    } catch (e) {
      return setStatus($('status'), e.message, 'error');
    }
    const s = ExpenseCore.summarise(reviewed);
    $('headline').textContent =
      s.count +
      ' claims totalling Rs. ' +
      OT.formatInr(s.total, 2) +
      '. ' +
      s.flagged.length +
      ' to look at (Rs. ' +
      OT.formatInr(s.flaggedAmount, 2) +
      ').';
    table('t-emp', 'Employee', s.byEmployee);
    table('t-cat', 'Category', s.byCategory);
    table('t-month', 'Month', s.byMonth, (k) => k);
    const list = $('flags');
    list.textContent = '';
    s.flagged.slice(0, 80).forEach((c) =>
      list.appendChild(
        el('li', {
          text:
            'Row ' +
            c.line +
            ' - ' +
            c.employee +
            ', ' +
            OT.formatDate(c.date, 'dmy') +
            ', ' +
            c.category +
            ', Rs. ' +
            OT.formatInr(c.amount, 2) +
            ': ' +
            c.flags.join(' '),
        }),
      ),
    );
    if (s.flagged.length > 80)
      list.appendChild(el('li', { text: '...and ' + (s.flagged.length - 80) + ' more. The CSV lists all of them.' }));
    if (!s.flagged.length) list.appendChild(el('li', { text: 'Nothing flagged.' }));
    $('results').hidden = false;
  }

  function use(aoa, name) {
    const r = ExpenseCore.rowsToClaims(aoa);
    if (!r.claims.length) {
      claims = null;
      $('results').hidden = true;
      return setStatus($('status'), r.errors.join(' '), 'error');
    }
    claims = r.claims;
    setStatus($('status'), name + ': ' + claims.length + ' claims. ' + r.errors.slice(0, 3).join(' '), r.errors.length ? 'warn' : 'ok');
    run();
  }

  async function load(file) {
    try {
      const wb = XLSX.read(await readArrayBuffer(file), { type: 'array', cellDates: true });
      use(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false }), file.name);
    } catch (e) {
      setStatus($('status'), 'Could not read that file.', 'error');
    }
  }
  OT.bindDropzone($('drop'), $('file'), (files) => files[0] && load(files[0]));
  $('demo').addEventListener('click', () => {
    $('asof').value = '2026-10-23';
    use(ExpenseCore.sampleRows(), 'Sample');
  });
  ['receipt', 'age', 'cap', 'asof', 'limits'].forEach((id) => $(id).addEventListener('input', run));
  $('csv').addEventListener(
    'click',
    () => reviewed && downloadBlob(ExpenseCore.toCsv(reviewed), 'expense-claims-reviewed.csv', 'text/csv;charset=utf-8'),
  );
})();
