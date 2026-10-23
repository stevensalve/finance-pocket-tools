/* Bank Reconciliation - user interface. All matching lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readArrayBuffer, el } = OT;
  const $ = (id) => document.getElementById(id);
  const data = { bank: null, book: null };
  let result = null;

  async function readRows(file) {
    const wb = XLSX.read(await readArrayBuffer(file), { type: 'array', cellDates: true });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false });
  }

  function useRows(kind, aoa, name) {
    const r = ReconCore.rowsToEntries(aoa, kind);
    const st = $('st-' + kind);
    if (!r.entries.length) {
      data[kind] = null;
      setStatus(st, r.errors.join(' ') || 'No usable lines.', 'error');
    } else {
      data[kind] = r.entries;
      setStatus(st, name + ': ' + r.entries.length + ' lines. ' + r.errors.slice(0, 3).join(' '), r.errors.length ? 'warn' : 'ok');
    }
    run();
  }

  function listTable(table, entries) {
    table.textContent = '';
    table.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          ['Date', 'Description', 'Reference', 'Amount'].map((h, i) => el('th', { scope: 'col', class: i === 3 ? 'num' : '', text: h })),
        ),
      ]),
    );
    const body = el('tbody');
    entries.forEach((e) =>
      body.appendChild(
        el('tr', {}, [
          el('td', { text: OT.formatDate(e.date, 'dmy') }),
          el('td', { text: e.desc }),
          el('td', { text: e.ref }),
          el('td', { class: 'num' + (e.amount < 0 ? ' neg' : ''), text: OT.formatInr(e.amount, 2) }),
        ]),
      ),
    );
    if (!entries.length) body.appendChild(el('tr', {}, [el('td', { colspan: '4', text: 'Nothing here.' })]));
    table.appendChild(body);
  }

  function run() {
    $('results').hidden = true;
    if (!data.bank || !data.book) return;
    try {
      result = ReconCore.match(data.bank, data.book, { windowDays: Number($('window').value), groups: $('groups').checked });
    } catch (e) {
      return setStatus($('status'), e.message, 'error');
    }
    setStatus(
      $('status'),
      result.matched.length +
        ' matches, ' +
        result.unmatchedBank.length +
        ' left in the bank list, ' +
        result.unmatchedBook.length +
        ' left in the books.',
      'ok',
    );
    listTable($('t-bank'), result.unmatchedBank);
    listTable($('t-book'), result.unmatchedBook);
    const m = $('t-matched');
    m.textContent = '';
    m.appendChild(
      el('thead', {}, [
        el(
          'tr',
          {},
          ['Matched by', 'Bank', 'Books', 'Amount'].map((h, i) => el('th', { scope: 'col', class: i === 3 ? 'num' : '', text: h })),
        ),
      ]),
    );
    const mb = el('tbody');
    const label = (l) => l.map((e) => OT.formatDate(e.date, 'dmy') + ' ' + (e.desc || e.ref)).join('; ');
    result.matched.forEach((x) =>
      mb.appendChild(
        el('tr', {}, [
          el('td', { text: x.how }),
          el('td', { text: label(x.bank) }),
          el('td', { text: label(x.book) }),
          el('td', {
            class: 'num',
            text: OT.formatInr(
              x.bank.reduce((a, e) => a + e.amount, 0),
              2,
            ),
          }),
        ]),
      ),
    );
    m.appendChild(mb);
    const dups = $('dups');
    dups.textContent = '';
    [
      ['bank statement', data.bank],
      ['books', data.book],
    ].forEach((p) =>
      ReconCore.duplicates(p[1]).forEach((d) =>
        dups.appendChild(
          el('li', {
            text:
              'In the ' +
              p[0] +
              ', rows ' +
              d.first.line +
              ' and ' +
              d.second.line +
              ' look identical (' +
              OT.formatDate(d.first.date, 'dmy') +
              ', ' +
              OT.formatInr(d.first.amount, 2) +
              ').',
          }),
        ),
      ),
    );
    if (!dups.children.length) dups.appendChild(el('li', { text: 'None found.' }));
    brs();
    $('results').hidden = false;
  }

  function brs() {
    const body = $('brs').querySelector('tbody');
    body.textContent = '';
    const bb = $('bank-bal').value;
    const kb = $('book-bal').value;
    if (bb === '' || kb === '') {
      body.appendChild(
        el('tr', {}, [el('td', { text: 'Enter both closing balances above to see the reconciliation statement.' }), el('td')]),
      );
      return;
    }
    const s = ReconCore.statement(result, Number(bb), Number(kb));
    const rows = [
      ['Balance as per bank statement', s.bankBalance],
      ['Add: deposits in books, not yet credited by bank', s.depositsNotCredited],
      ['Less: cheques issued, not yet presented', s.chequesNotPresented],
      ['Adjusted bank balance', s.adjustedBank, true],
      ['Balance as per books', s.bookBalance],
      ['Add: credits in bank, not yet in books', s.bankNotBooksIn],
      ['Less: debits in bank, not yet in books', s.bankNotBooksOut],
      ['Adjusted book balance', s.adjustedBook, true],
      ['Difference (should be zero)', s.difference, true],
    ];
    rows.forEach((r) =>
      body.appendChild(
        el('tr', { class: r[2] ? 'strong' : '' }, [
          el('td', { text: r[0] }),
          el('td', { class: r[1] < 0 ? 'neg' : '', text: OT.formatInr(r[1], 2) }),
        ]),
      ),
    );
  }

  [
    ['bank', 'drop-bank', 'file-bank'],
    ['book', 'drop-book', 'file-book'],
  ].forEach((p) =>
    OT.bindDropzone($(p[1]), $(p[2]), async (files) => {
      try {
        useRows(p[0], await readRows(files[0]), files[0].name);
      } catch (e) {
        setStatus($('st-' + p[0]), 'Could not read that file.', 'error');
      }
    }),
  );
  $('demo').addEventListener('click', () => {
    const s = ReconCore.sample();
    useRows('bank', s.bank, 'Sample bank');
    useRows('book', s.book, 'Sample books');
    $('book-bal').value = 131500;
    $('bank-bal').value = 131500 + 410 - 295 - 7500 + 18000;
    run();
  });
  ['window', 'groups'].forEach((id) => $(id).addEventListener('input', run));
  ['bank-bal', 'book-bal'].forEach((id) => $(id).addEventListener('input', () => result && brs()));
  $('csv').addEventListener(
    'click',
    () => result && downloadBlob(ReconCore.toCsv(result), 'bank-reconciliation.csv', 'text/csv;charset=utf-8'),
  );
})();
