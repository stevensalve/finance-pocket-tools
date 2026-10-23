/* Receivables & Payables Aging - user interface. All calculation lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readArrayBuffer, el } = OT;
  const $ = (id) => document.getElementById(id);
  let rows = null;
  let report = null;
  const today = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  $('asof').value = today();

  function run() {
    $('results').hidden = true;
    $('empty').hidden = !!rows;
    if (!rows) return;
    const r = AgingCore.rowsToItems(rows, Number($('credit').value));
    if (!r.items.length) return setStatus($('status'), r.errors.join(' '), 'error');
    try {
      const edges = $('edges')
        .value.split(/[,\s]+/)
        .filter(Boolean)
        .map(Number);
      report = AgingCore.report(r.items, $('asof').value, { from: $('from').value, edges: edges });
    } catch (e) {
      return setStatus($('status'), e.message, 'error');
    }
    const t = $('t-aging');
    t.textContent = '';
    t.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          ['Party'].concat(report.labels, ['Total', 'Overdue']).map((h, i) => el('th', { scope: 'col', class: i ? 'num' : '', text: h })),
        ),
      ]),
    );
    const body = el('tbody');
    const money = (v) => (v ? OT.formatInr(v, 0) : '-');
    report.parties.forEach((p) =>
      body.appendChild(
        el(
          'tr',
          {},
          [el('td', { text: p.party })].concat(
            p.buckets.map((v) => el('td', { class: 'num', text: money(v) })),
            [el('td', { class: 'num', text: money(p.total) }), el('td', { class: 'num', text: money(p.overdue) })],
          ),
        ),
      ),
    );
    body.appendChild(
      el(
        'tr',
        { class: 'strong' },
        [el('td', { text: 'Total' })].concat(
          report.totals.buckets.map((v) => el('td', { class: 'num', text: money(v) })),
          [el('td', { class: 'num', text: money(report.totals.total) }), el('td', { class: 'num', text: money(report.totals.overdue) })],
        ),
      ),
    );
    t.appendChild(body);
    $('results').hidden = false;
    setStatus(
      $('status'),
      r.items.length +
        ' open items, ' +
        report.parties.length +
        ' parties. Overdue: Rs. ' +
        OT.formatInr(report.totals.overdue, 2) +
        '. ' +
        r.errors.slice(0, 3).join(' '),
      r.errors.length ? 'warn' : 'ok',
    );
  }

  async function load(file) {
    try {
      const wb = XLSX.read(await readArrayBuffer(file), { type: 'array', cellDates: true });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false });
      run();
    } catch (e) {
      setStatus($('status'), 'Could not read that file.', 'error');
    }
  }
  OT.bindDropzone($('drop'), $('file'), (files) => files[0] && load(files[0]));
  $('demo').addEventListener('click', () => {
    rows = AgingCore.sampleRows();
    $('asof').value = '2026-10-23';
    run();
  });
  ['asof', 'from', 'edges', 'credit'].forEach((id) => $(id).addEventListener('input', run));

  $('make').addEventListener('click', () => {
    if (!report) return setStatus($('rem-status'), 'Load a file first.', 'warn');
    const t = AgingCore.reminders(report, {
      tone: $('tone').value,
      min: Number($('min').value) || 0,
      sender: $('sender').value.trim(),
      company: $('company').value.trim(),
    });
    $('rem-out').value = t;
    setStatus($('rem-status'), t ? '' : 'Nobody is overdue by that much.', t ? '' : 'ok');
  });
  $('copy').addEventListener('click', async () => {
    const t = $('rem-out').value;
    if (!t) return setStatus($('rem-status'), 'Write the reminders first.', 'warn');
    setStatus($('rem-status'), (await OT.copyText(t)) ? 'Copied.' : 'Copy failed - select the text and copy it yourself.', 'ok');
  });
  $('csv').addEventListener('click', () => report && downloadBlob(AgingCore.toCsv(report), 'aging-report.csv', 'text/csv;charset=utf-8'));
  run();
})();
