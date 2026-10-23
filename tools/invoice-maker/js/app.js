/* Invoice Maker - user interface. All calculation lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el } = OT;
  const $ = (id) => document.getElementById(id);
  const today = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  let inv = InvoiceCore.create(today());

  function fillStates() {
    ['s-state', 'b-state'].forEach((id) => {
      const sel = $(id);
      Object.keys(InvoiceCore.STATES).forEach((c) => sel.appendChild(el('option', { value: c, text: c + ' - ' + InvoiceCore.STATES[c] })));
    });
  }

  function pull() {
    inv.number = $('number').value;
    inv.date = $('date').value;
    inv.dueDate = $('due').value;
    inv.seller = { name: $('s-name').value, gstin: $('s-gstin').value, address: $('s-addr').value, stateCode: $('s-state').value };
    inv.buyer = { name: $('b-name').value, gstin: $('b-gstin').value, address: $('b-addr').value, stateCode: $('b-state').value };
    inv.notes = $('notes').value;
    inv.bank = $('bank').value;
    inv.roundOff = $('round').checked;
  }

  function push() {
    $('number').value = inv.number;
    $('date').value = inv.date;
    $('due').value = inv.dueDate;
    $('s-name').value = inv.seller.name;
    $('s-gstin').value = inv.seller.gstin;
    $('s-addr').value = inv.seller.address;
    $('s-state').value = inv.seller.stateCode;
    $('b-name').value = inv.buyer.name;
    $('b-gstin').value = inv.buyer.gstin;
    $('b-addr').value = inv.buyer.address;
    $('b-state').value = inv.buyer.stateCode;
    $('notes').value = inv.notes;
    $('bank').value = inv.bank;
    $('round').checked = inv.roundOff;
    buildRows();
    refresh();
  }

  const FIELDS = [
    ['desc', 'text', 'desc'],
    ['hsn', 'text', ''],
    ['qty', 'number', ''],
    ['unit', 'text', ''],
    ['rate', 'number', ''],
    ['discPct', 'number', ''],
    ['gstPct', 'select', ''],
  ];
  const LABELS = {
    desc: 'Description',
    hsn: 'HSN or SAC',
    qty: 'Quantity',
    unit: 'Unit',
    rate: 'Rate',
    discPct: 'Discount percent',
    gstPct: 'GST percent',
  };

  function buildRows() {
    const body = $('items');
    body.textContent = '';
    inv.items.forEach((it, i) => {
      const cells = FIELDS.map((f) => {
        let input;
        if (f[1] === 'select') {
          input = el('select', { 'aria-label': LABELS[f[0]] + ' for item ' + (i + 1) });
          const rates = InvoiceCore.GST_RATES.slice();
          if (rates.indexOf(Number(it.gstPct)) === -1) rates.push(Number(it.gstPct));
          rates.forEach((r) => input.appendChild(el('option', { value: String(r), text: r + '%' })));
          input.value = String(it.gstPct);
        } else {
          input = el('input', {
            type: f[1],
            'aria-label': LABELS[f[0]] + ' for item ' + (i + 1),
            step: 'any',
            min: f[1] === 'number' ? '0' : null,
          });
          input.value = it[f[0]];
        }
        input.addEventListener('input', () => {
          it[f[0]] =
            f[1] === 'text' ? input.value : f[1] === 'select' ? Number(input.value) : input.value === '' ? '' : Number(input.value);
          refresh();
        });
        return el('td', { class: f[2] }, [input]);
      });
      const amount = el('td', { class: 'amt', text: '' });
      const rm = el('button', { type: 'button', text: 'Remove', 'aria-label': 'Remove item ' + (i + 1) });
      rm.addEventListener('click', () => {
        inv.items.splice(i, 1);
        buildRows();
        refresh();
      });
      body.appendChild(el('tr', {}, cells.concat([amount, el('td', {}, [rm])])));
    });
  }

  function refresh() {
    pull();
    const res = InvoiceCore.compute(inv);
    Array.prototype.forEach.call($('items').children, (tr, i) => {
      if (res.lines[i]) tr.querySelector('.amt').textContent = OT.formatInr(res.lines[i].total, 2);
    });
    const T = res.totals;
    const rows = [['Taxable value', T.taxable]];
    if (res.intra) rows.push(['CGST', T.cgst], ['SGST', T.sgst]);
    else rows.push(['IGST', T.igst]);
    if (T.roundOff) rows.push(['Round off', T.roundOff]);
    const body = $('totals');
    body.textContent = '';
    rows.forEach((r) => body.appendChild(el('tr', {}, [el('td', { text: r[0] }), el('td', { text: OT.formatInr(r[1], 2) })])));
    body.appendChild(el('tr', { class: 'strong' }, [el('td', { text: 'Total (Rs.)' }), el('td', { text: OT.formatInr(T.grand, 2) })]));
    $('words').firstChild.textContent = T.words;
    $('tax-kind').textContent = res.intra ? 'Same state: CGST and SGST are charged, half each.' : 'Different states: IGST is charged.';
    const list = $('problems');
    list.textContent = '';
    InvoiceCore.validate(inv).forEach((p) => list.appendChild(el('li', { text: p })));
    return res;
  }

  [
    'number',
    'date',
    'due',
    's-name',
    's-gstin',
    's-addr',
    's-state',
    'b-name',
    'b-gstin',
    'b-addr',
    'b-state',
    'notes',
    'bank',
    'round',
  ].forEach((id) => $(id).addEventListener('input', refresh));

  $('add').addEventListener('click', () => {
    inv.items.push({ desc: '', hsn: '', qty: 1, unit: 'Nos', rate: 0, discPct: 0, gstPct: 18 });
    buildRows();
    refresh();
  });

  $('pdf').addEventListener('click', async () => {
    const res = refresh();
    const problems = InvoiceCore.validate(inv);
    if (problems.length) return setStatus($('status'), 'Fix these first: ' + problems[0], 'error');
    const bytes = await InvoiceCore.buildPdf(PDFLib, inv, res);
    downloadBlob(
      new Blob([bytes], { type: 'application/pdf' }),
      OT.safeFileName('Invoice ' + inv.number.replace(/[/\\]/g, '-'), 'invoice') + '.pdf',
    );
    setStatus($('status'), 'PDF created.', 'ok');
  });

  $('csv').addEventListener('click', () => {
    const res = refresh();
    downloadBlob(InvoiceCore.toCsv(inv, res), 'invoice-lines.csv', 'text/csv;charset=utf-8');
  });

  $('next').addEventListener('click', () => {
    pull();
    inv.number = InvoiceCore.nextNumber(inv.number);
    inv.items = inv.items.map((i) => i);
    push();
    setStatus($('status'), 'Number advanced. Update the date and items for the new invoice.', 'ok');
  });

  $('save').addEventListener('click', () => {
    pull();
    downloadBlob(InvoiceCore.serialize(inv), 'invoice.json', 'application/json');
  });

  $('open').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      inv = InvoiceCore.parse(await readText(f));
      push();
      setStatus($('status'), 'Opened.', 'ok');
    } catch (e) {
      setStatus($('status'), e.message, 'error');
    }
  });

  fillStates();
  push();
})();
