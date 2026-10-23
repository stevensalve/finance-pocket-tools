/* Loan & EMI Calculator - user interface. All calculation lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, el } = OT;
  const $ = (id) => document.getElementById(id);
  let plan = null;
  let opts = null;

  const rowsOf = (body, rows) => {
    body.textContent = '';
    rows.forEach((r) =>
      body.appendChild(
        el(
          'tr',
          {},
          r.map((c, i) => el('td', { class: i ? 'num' : '', text: c })),
        ),
      ),
    );
  };
  const heads = (table, h) => {
    table.textContent = '';
    table.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          h.map((x, i) => el('th', { scope: 'col', class: i ? 'num' : '', text: x })),
        ),
      ]),
    );
    const b = el('tbody');
    table.appendChild(b);
    return b;
  };

  function calc() {
    const years = Number($('years').value) || 0;
    const months = Math.round(years * 12) + (Number($('months-extra').value) || 0);
    const pre = EmiCore.parsePrepayments($('prepay').value);
    setStatus($('pre-status'), pre.errors.join(' '), pre.errors.length ? 'warn' : '');
    opts = {
      principal: Number($('principal').value),
      rate: Number($('rate').value),
      months: months,
      startDate: $('start').value,
      roundUp: $('roundup').checked,
      extraMonthly: Number($('extra').value) || 0,
      prepayments: pre.list,
    };
    const sum = $('summary');
    sum.textContent = '';
    try {
      const c = EmiCore.compare(opts);
      plan = c.plan;
      const rows = [
        ['Monthly instalment (EMI)', OT.formatInr(c.plan.emi, 2)],
        ['Total interest', OT.formatInr(c.plan.totals.interest, 2)],
        ['Total paid', OT.formatInr(c.plan.totals.paid, 2)],
        ['Number of instalments', String(c.plan.totals.months)],
      ];
      if (c.plan.totals.endDate) rows.push(['Last instalment', OT.formatDate(c.plan.totals.endDate, 'dmy')]);
      rows.forEach((r) => sum.appendChild(el('tr', {}, [el('td', { text: r[0] }), el('td', { text: r[1] })])));
      $('saving').textContent =
        c.monthsSaved > 0
          ? 'You finish ' + c.monthsSaved + ' months earlier and save Rs. ' + OT.formatInr(c.interestSaved, 2) + ' of interest.'
          : '';
      setStatus($('status'), '', '');
      const yb = heads($('t-year'), ['Year', 'Interest', 'Principal paid', 'Balance at end']);
      rowsOf(
        yb,
        EmiCore.yearly(plan.rows).map((y) => [
          y.label,
          OT.formatInr(y.interest, 2),
          OT.formatInr(y.principal, 2),
          OT.formatInr(y.closing, 2),
        ]),
      );
      const mb = heads($('t-month'), ['No', 'Date', 'Opening', 'Interest', 'Principal', 'Prepaid', 'Closing']);
      rowsOf(
        mb,
        plan.rows.map((x) => [
          String(x.n),
          x.date ? OT.formatDate(x.date, 'dmy') : '',
          OT.formatInr(x.opening, 2),
          OT.formatInr(x.interest, 2),
          OT.formatInr(x.principal, 2),
          OT.formatInr(x.prepay, 2),
          OT.formatInr(x.closing, 2),
        ]),
      );
      try {
        const base = Math.round(EmiCore.affordableLoan(Number($('can-pay').value), opts.rate, months));
        $('afford').textContent =
          'A payment of Rs. ' +
          OT.formatInr(Number($('can-pay').value)) +
          ' a month can service a loan of about Rs. ' +
          OT.formatInr(base) +
          ' (' +
          OT.inrWords(base) +
          ' rupees).';
      } catch (e) {
        $('afford').textContent = e.message;
      }
    } catch (e) {
      plan = null;
      $('saving').textContent = '';
      $('t-year').textContent = '';
      $('t-month').textContent = '';
      setStatus($('status'), e.message, 'error');
    }
  }

  ['principal', 'rate', 'years', 'months-extra', 'start', 'roundup', 'extra', 'prepay', 'can-pay'].forEach((id) =>
    $(id).addEventListener('input', calc),
  );

  $('pdf').addEventListener('click', async () => {
    if (!plan) return setStatus($('status'), 'Fix the loan details first.', 'error');
    const bytes = await EmiCore.buildPdf(PDFLib, plan, {
      title: 'Loan repayment schedule',
      borrower: $('borrower').value.trim(),
      lender: $('lender').value.trim(),
      rate: opts.rate,
    });
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'loan-schedule.pdf');
  });
  $('csv').addEventListener('click', () => plan && downloadBlob(EmiCore.toCsv(plan), 'loan-schedule.csv', 'text/csv;charset=utf-8'));
  calc();
})();
