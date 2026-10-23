/* Budget vs Actual - user interface. All calculation lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readArrayBuffer, el } = OT;
  const $ = (id) => document.getElementById(id);
  const raw = { budget: null, actual: null };
  let result = null;

  const now = new Date();
  $('fy').value = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

  function months() {
    return BudgetCore.fyMonths(Number($('fy').value));
  }
  function fillThrough(keep) {
    const sel = $('through');
    const prev = keep ? sel.value : '';
    sel.textContent = '';
    months().forEach((m) => sel.appendChild(el('option', { value: m, text: BudgetCore.monthLabel(m) })));
    sel.value = prev && months().indexOf(prev) !== -1 ? prev : months()[Math.min(11, Math.max(0, (now.getMonth() + 9) % 12))];
  }

  function parse(kind) {
    if (!raw[kind]) return [];
    const r = BudgetCore.rowsToCells(raw[kind], Number($('fy').value));
    setStatus(
      $('st-' + kind),
      r.cells.length ? r.cells.length + ' figures. ' + r.errors.slice(0, 2).join(' ') : r.errors.join(' '),
      !r.cells.length ? 'error' : r.errors.length ? 'warn' : 'ok',
    );
    return r.cells;
  }

  function run() {
    $('results').hidden = true;
    const budget = parse('budget');
    const actual = parse('actual');
    if (!budget.length || !actual.length) return;
    try {
      result = BudgetCore.compare(budget, actual, { months: months(), through: $('through').value, tolerance: Number($('tol').value) });
    } catch (e) {
      return setStatus($('status'), e.message, 'error');
    }
    const f = (v) => OT.formatInr(v, 0);
    const t = $('t-var');
    t.textContent = '';
    t.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          ['Category', 'Type', 'Budget', 'Actual', 'Variance', 'Variance %', 'Status'].map((h, i) =>
            el('th', { scope: 'col', class: i > 1 && i < 6 ? 'num' : '', text: h }),
          ),
        ),
      ]),
    );
    const body = el('tbody');
    result.lines.forEach((l) =>
      body.appendChild(
        el('tr', {}, [
          el('td', { text: l.category }),
          el('td', { text: l.type }),
          el('td', { class: 'num', text: f(l.budget) }),
          el('td', { class: 'num', text: f(l.actual) }),
          el('td', { class: 'num', text: f(l.variance) }),
          el('td', { class: 'num', text: l.variancePct === null ? 'n/a' : l.variancePct + '%' }),
          el('td', { class: 'st-' + l.status.replace(' ', '-'), text: l.status }),
        ]),
      ),
    );
    const T = result.totals;
    body.appendChild(
      el('tr', { class: 'strong' }, [
        el('td', { text: 'Net (income - expense)' }),
        el('td'),
        el('td', { class: 'num', text: f(T.netBudget) }),
        el('td', { class: 'num', text: f(T.netActual) }),
        el('td', { class: 'num', text: f(T.netVariance) }),
        el('td'),
        el('td'),
      ]),
    );
    t.appendChild(body);
    const o = BudgetCore.outlook(budget, actual, $('through').value, months());
    const ob = $('outlook');
    ob.textContent = '';
    [
      ['Net result so far', o.actualToDate],
      ['Budgeted net for ' + o.monthsLeft + ' months still to come', o.budgetRemaining],
      ['Expected full-year net', o.expectedNet],
      ['Full-year budgeted net', o.budgetNet],
      ['Expected difference to budget', o.difference],
    ].forEach((r) => ob.appendChild(el('tr', {}, [el('td', { text: r[0] }), el('td', { text: f(r[1]) })])));
    $('results').hidden = false;
    setStatus($('status'), 'Comparing ' + result.months.length + ' months up to ' + BudgetCore.monthLabel($('through').value) + '.', 'ok');
  }

  async function readRows(file) {
    const wb = XLSX.read(await readArrayBuffer(file), { type: 'array', cellDates: true });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false });
  }
  ['budget', 'actual'].forEach((k) =>
    OT.bindDropzone($('drop-' + k), $('file-' + k), async (files) => {
      try {
        raw[k] = await readRows(files[0]);
        run();
      } catch (e) {
        setStatus($('st-' + k), 'Could not read that file.', 'error');
      }
    }),
  );
  $('demo').addEventListener('click', () => {
    const s = BudgetCore.sample(Number($('fy').value));
    raw.budget = s.budget;
    raw.actual = s.actual;
    $('through').value = months()[5];
    run();
  });
  $('fy').addEventListener('input', () => {
    fillThrough(true);
    run();
  });
  ['through', 'tol'].forEach((id) => $(id).addEventListener('input', run));
  $('csv').addEventListener(
    'click',
    () => result && downloadBlob(BudgetCore.toCsv(result), 'budget-vs-actual.csv', 'text/csv;charset=utf-8'),
  );
  fillThrough(false);
})();
