/* Depreciation Schedule - user interface. All calculation lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readArrayBuffer, el } = OT;
  const $ = (id) => document.getElementById(id);
  let assets = [];
  let result = null;

  const thisFy = () => {
    const d = new Date();
    return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  };
  $('fy-from').value = thisFy() - 1;
  $('fy-to').value = thisFy() + 2;
  Object.keys(DepCore.CATEGORIES).forEach((c) =>
    $('a-cat').appendChild(el('option', { value: c, text: c + ' (' + DepCore.CATEGORIES[c] + ' years)' })),
  );
  $('a-cat').addEventListener('change', () => ($('a-life').value = DepCore.CATEGORIES[$('a-cat').value]));
  $('a-life').value = DepCore.CATEGORIES[$('a-cat').value];

  function fill(table, heads, rows) {
    table.textContent = '';
    table.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          heads.map((h, i) => el('th', { scope: 'col', class: i ? 'num' : '', text: h })),
        ),
      ]),
    );
    const body = el('tbody');
    rows.forEach((r) =>
      body.appendChild(
        el(
          'tr',
          {},
          r.map((c, i) => el('td', { class: i ? 'num' : '', text: c })),
        ),
      ),
    );
    table.appendChild(body);
  }

  function render() {
    $('empty').hidden = assets.length > 0;
    $('results').hidden = assets.length === 0;
    if (!assets.length) return;
    try {
      result = DepCore.schedule(assets, Number($('fy-from').value), Number($('fy-to').value), { partYear: $('part').value });
    } catch (e) {
      result = null;
      return setStatus($('status'), e.message, 'error');
    }
    const f = (v) => OT.formatInr(v, 0);
    fill(
      $('t-total'),
      ['Year', 'Opening', 'Additions', 'Depreciation', 'Disposals (book value)', 'Gain / loss', 'Closing'],
      result.totals.map((t) => [t.label, f(t.opening), f(t.additions), f(t.depreciation), f(t.disposal), f(t.gainLoss), f(t.closing)]),
    );
    fill(
      $('t-asset'),
      ['Asset', 'Cost', 'Rate %'].concat(result.years.map((y) => y.label)),
      result.rows.map((r) =>
        [r.asset.name, f(r.asset.cost), String(r.rate)].concat(
          result.years.map((y) => {
            const x = r.years.find((v) => v.fy === y.fy);
            return x ? f(x.depreciation) : '-';
          }),
        ),
      ),
    );
    fill(
      $('t-cat'),
      ['Category', 'Cost', 'Depreciation in period', 'Closing value'],
      result.byCategory.map((c) => [c.category, f(c.cost), f(c.depreciation), f(c.closing)]),
    );
    const inv = $('invalid');
    inv.textContent = '';
    result.invalid.forEach((i) => inv.appendChild(el('li', { text: 'Left out: ' + i.name + ' - ' + i.problems.join(' ') })));
    setStatus($('status'), assets.length + ' assets.', 'ok');
  }

  async function load(file) {
    try {
      const wb = XLSX.read(await readArrayBuffer(file), { type: 'array', cellDates: true });
      useRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false }));
    } catch (e) {
      setStatus($('status'), 'Could not read that file.', 'error');
    }
  }
  function useRows(aoa) {
    const r = DepCore.rowsToAssets(aoa);
    if (!r.assets.length) return setStatus($('status'), r.errors.join(' '), 'error');
    assets = r.assets;
    const first = Math.min.apply(
      null,
      assets.map((a) => DepCore.fyOf(a.purchaseDate)),
    );
    $('fy-from').value = first;
    $('fy-to').value = Math.max(first + 4, thisFy() + 1);
    render();
    if (r.errors.length) setStatus($('status'), r.errors.join(' '), 'warn');
  }

  OT.bindDropzone($('drop'), $('file'), (files) => files[0] && load(files[0]));
  $('demo').addEventListener('click', () => useRows(DepCore.sampleRows()));
  $('clear').addEventListener('click', () => {
    assets = [];
    result = null;
    render();
    setStatus($('status'), '', '');
  });
  ['fy-from', 'fy-to', 'part'].forEach((id) => $(id).addEventListener('input', render));

  $('a-add').addEventListener('click', () => {
    const a = {
      name: $('a-name').value,
      category: $('a-cat').value,
      cost: Number($('a-cost').value),
      purchaseDate: $('a-date').value,
      method: $('a-method').value,
      lifeYears: Number($('a-life').value) || 0,
      ratePct: Number($('a-rate').value) || 0,
      salvagePct: Number($('a-salv').value) || 0,
      disposalDate: $('a-disp').value,
      proceeds: Number($('a-proc').value) || 0,
    };
    const p = DepCore.problems(a);
    if (p.length) return setStatus($('status'), p.join(' '), 'error');
    assets.push(a);
    $('a-name').value = '';
    render();
  });

  $('csv').addEventListener(
    'click',
    () => result && downloadBlob(DepCore.toCsv(result), 'depreciation-schedule.csv', 'text/csv;charset=utf-8'),
  );
  render();
})();
