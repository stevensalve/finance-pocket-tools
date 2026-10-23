/* GST Calculator & Summary - user interface. All calculation lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readArrayBuffer, el } = OT;
  const $ = (id) => document.getElementById(id);
  let summary = null;

  GstCore.RATES.forEach((r) => $('rate').appendChild(el('option', { value: String(r), text: r + '%' })));
  $('rate').value = '18';

  function quick() {
    const body = $('quick-out');
    body.textContent = '';
    try {
      const q = GstCore.quick(Number($('amount').value), Number($('rate').value), $('mode').value, $('kind').value === 'intra');
      const rows = [['Amount before GST', q.base]];
      if ($('kind').value === 'intra') rows.push(['CGST', q.cgst], ['SGST', q.sgst]);
      else rows.push(['IGST', q.igst]);
      rows.push(['Total GST', q.gst]);
      rows.forEach((r) => body.appendChild(el('tr', {}, [el('td', { text: r[0] }), el('td', { text: OT.formatInr(r[1], 2) })])));
      body.appendChild(
        el('tr', { class: 'strong' }, [el('td', { text: 'Amount including GST' }), el('td', { text: OT.formatInr(q.total, 2) })]),
      );
      setStatus($('quick-status'), '', '');
    } catch (e) {
      setStatus($('quick-status'), e.message, 'error');
    }
  }
  ['amount', 'rate', 'mode', 'kind'].forEach((id) => $(id).addEventListener('input', quick));

  function table(id, labelHead, list, label) {
    const t = $(id);
    t.textContent = '';
    const heads = [labelHead, 'Invoices', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'];
    t.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          heads.map((h, i) => el('th', { scope: 'col', class: i ? 'num' : '', text: h })),
        ),
      ]),
    );
    const body = el('tbody');
    list.forEach((x) =>
      body.appendChild(
        el(
          'tr',
          {},
          [el('td', { text: label ? label(x.key) : x.key }), el('td', { class: 'num', text: String(x.count) })].concat(
            ['taxable', 'cgst', 'sgst', 'igst', 'total'].map((f) => el('td', { class: 'num', text: OT.formatInr(x[f], 2) })),
          ),
        ),
      ),
    );
    t.appendChild(body);
  }

  function show(aoa, name) {
    const r = GstCore.rowsToEntries(aoa);
    if (!r.entries.length) {
      $('results').hidden = true;
      return setStatus($('reg-status'), r.errors.join(' '), 'error');
    }
    summary = GstCore.summarise(r.entries);
    table('t-rate', 'GST rate', summary.byRate, (k) => k + '%');
    table('t-month', 'Month', summary.byMonth);
    table('t-kind', 'Type', summary.byKind);
    table('t-party', 'Party', summary.byParty.slice(0, 15));
    const list = $('issues');
    list.textContent = '';
    summary.issues
      .slice(0, 60)
      .forEach((i) =>
        list.appendChild(el('li', { text: 'Row ' + i.line + (i.invoice ? ' (' + i.invoice + ')' : '') + ': ' + i.issues.join(' ') })),
      );
    if (summary.issues.length > 60) list.appendChild(el('li', { text: '...and ' + (summary.issues.length - 60) + ' more rows.' }));
    if (!summary.issues.length) list.appendChild(el('li', { text: 'Nothing to check.' }));
    $('results').hidden = false;
    const t = summary.totals;
    setStatus(
      $('reg-status'),
      (name || 'Register') +
        ': ' +
        t.count +
        ' invoices, taxable ' +
        OT.formatInr(t.taxable, 2) +
        ', total ' +
        OT.formatInr(t.total, 2) +
        '. ' +
        r.errors.join(' '),
      r.errors.length ? 'warn' : 'ok',
    );
  }

  async function load(file) {
    try {
      const wb = XLSX.read(await readArrayBuffer(file), { type: 'array', cellDates: true });
      show(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false }), file.name);
    } catch (e) {
      setStatus($('reg-status'), 'Could not read that file.', 'error');
    }
  }

  OT.bindDropzone($('drop'), $('file'), (files) => files[0] && load(files[0]));
  $('demo').addEventListener('click', () => show(GstCore.sampleRows(), 'Sample'));
  $('csv').addEventListener(
    'click',
    () => summary && downloadBlob(GstCore.summaryCsv(summary), 'gst-summary.csv', 'text/csv;charset=utf-8'),
  );
  quick();
})();
