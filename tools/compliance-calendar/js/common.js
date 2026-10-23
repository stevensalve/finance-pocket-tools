/* AUTO-SYNCED from shared/common.js by scripts/sync-shared.mjs - edit the original, not this copy. */
/**
 * Finance Pocket Tools - shared helpers (namespace `OT`).
 *
 * Written as a classic script + CommonJS hybrid so it works when a page is
 * opened straight from disk (file://) AND can be unit-tested in Node.
 * Pure functions live at the top; DOM helpers below only run in a browser.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OT = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Human readable file size, e.g. 1536 -> "1.5 KB". */
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return value.toFixed(value >= 10 ? 0 : 1) + ' ' + units[i];
  }

  /** Escape text for safe insertion with innerHTML. Prefer textContent. */
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** "report.final.pdf" -> "report.final" */
  function baseName(filename) {
    const i = String(filename).lastIndexOf('.');
    return i > 0 ? String(filename).slice(0, i) : String(filename);
  }

  /** Lower-cased extension without the dot: "A.PDF" -> "pdf". */
  function extension(filename) {
    const i = String(filename).lastIndexOf('.');
    return i > 0
      ? String(filename)
          .slice(i + 1)
          .toLowerCase()
      : '';
  }

  /** Strip characters that are illegal in file names on Windows/macOS/Linux. */
  function safeFileName(name, fallback) {
    const cleaned = String(name)
      .replace(/[\\/:*?"<>|]/g, '_')
      .split('')
      .map(function (c) {
        return c.charCodeAt(0) < 32 ? '_' : c; // control characters are illegal in file names too
      })
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '');
    return cleaned || fallback || 'file';
  }

  /** Return a function that delays `fn` until `ms` ms of silence. */
  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments;
      const self = this;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(self, args);
      }, ms);
    };
  }

  /** Clamp a number into [min, max]. */
  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  // ------------------------------------------------------------------
  // Browser-only helpers
  // ------------------------------------------------------------------

  /** Save a Blob (or bytes) to the user's device via a temporary link. */
  function downloadBlob(data, filename, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 10000);
  }

  /** Read a File as ArrayBuffer. */
  function readArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () {
        resolve(r.result);
      };
      r.onerror = function () {
        reject(r.error || new Error('Could not read ' + file.name));
      };
      r.readAsArrayBuffer(file);
    });
  }

  /** Read a File as text (UTF-8). */
  function readText(file) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () {
        resolve(String(r.result));
      };
      r.onerror = function () {
        reject(r.error || new Error('Could not read ' + file.name));
      };
      r.readAsText(file);
    });
  }

  /** Show a message in an element with `role="status"`. kind: ok|error|warn|"" */
  function setStatus(el, message, kind) {
    if (!el) return;
    el.textContent = message || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  /**
   * Make a `<label class="dropzone">` accept drag & drop as well as clicks.
   * `onFiles(File[])` is called with the chosen files.
   */
  function bindDropzone(zone, input, onFiles) {
    function handle(fileList) {
      const files = Array.prototype.slice.call(fileList || []);
      if (files.length) onFiles(files);
    }
    input.addEventListener('change', function () {
      handle(input.files);
      input.value = ''; // allow picking the same file again
    });
    ['dragenter', 'dragover'].forEach(function (type) {
      zone.addEventListener(type, function (e) {
        e.preventDefault();
        zone.classList.add('is-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (type) {
      zone.addEventListener(type, function (e) {
        e.preventDefault();
        zone.classList.remove('is-over');
      });
    });
    zone.addEventListener('drop', function (e) {
      handle(e.dataTransfer && e.dataTransfer.files);
    });
  }

  /**
   * Copy text to the clipboard. Uses the modern API when available and falls
   * back to a hidden textarea so it also works from file:// in older browsers.
   * Resolves to true on success.
   */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () {
          return true;
        },
        function () {
          return legacyCopy(text);
        },
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.className = 'visually-hidden';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  /** Create an element with attributes/text in one call. */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'class') node.className = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  /** Wire up a simple accessible tab bar. Panels are matched via aria-controls. */
  function bindTabs(tabBar, onChange) {
    const tabs = Array.prototype.slice.call(tabBar.querySelectorAll('[role="tab"]'));
    function select(tab) {
      tabs.forEach(function (t) {
        const active = t === tab;
        t.setAttribute('aria-selected', String(active));
        t.tabIndex = active ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !active;
      });
      if (onChange) onChange(tab.getAttribute('aria-controls'));
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () {
        select(t);
      });
      t.addEventListener('keydown', function (e) {
        let next = null;
        if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
        if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
        if (next) {
          e.preventDefault();
          next.focus();
          select(next);
        }
      });
    });
    const initial = tabs.filter(function (t) {
      return t.getAttribute('aria-selected') === 'true';
    })[0];
    select(initial || tabs[0]);
  }

  // ------------------------------------------------------------ Indian money

  const ONES = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function below1000(n) {
    let out = '';
    if (n >= 100) {
      out += ONES[Math.floor(n / 100)] + ' Hundred';
      n %= 100;
      if (n) out += ' ';
    }
    if (n >= 20) out += TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
    else if (n) out += ONES[n];
    return out;
  }

  /**
   * Whole rupees in words using the Indian system (Thousand, Lakh, Crore):
   * 1250000 -> "Twelve Lakh Fifty Thousand". Zero -> "Zero". Throws for negatives or non-numbers.
   */
  function inrWords(amount) {
    if (!Number.isFinite(amount) || amount < 0 || amount >= 1e14) throw new Error('Amount must be between 0 and 99,99,99,99,99,999.');
    let n = Math.floor(amount);
    if (n === 0) return 'Zero';
    const parts = [];
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    if (crore) parts.push((crore >= 100 ? inrWords(crore) : below1000(crore)) + ' Crore');
    if (lakh) parts.push(below1000(lakh) + ' Lakh');
    if (thousand) parts.push(below1000(thousand) + ' Thousand');
    if (n) parts.push(below1000(n));
    return parts.join(' ');
  }

  /** "Rupees Twelve Lakh Fifty Thousand and Fifty Paise Only" style text for an amount with paise. */
  function inrAmountText(amount) {
    const paise = Math.round((amount - Math.floor(amount)) * 100);
    const rupees = Math.floor(Math.round(amount * 100) / 100);
    return 'Rupees ' + inrWords(rupees) + (paise ? ' and ' + inrWords(paise) + ' Paise' : '') + ' Only';
  }

  /** Indian digit grouping: 1234567.5 -> "12,34,567.50". `decimals` defaults to 0. */
  function formatInr(amount, decimals) {
    const d = decimals === undefined ? 0 : decimals;
    if (!Number.isFinite(amount)) return '0';
    const neg = amount < 0;
    const fixed = Math.abs(amount).toFixed(d);
    const parts = fixed.split('.');
    let int = parts[0];
    if (int.length > 3) {
      const last3 = int.slice(-3);
      const rest = int.slice(0, -3);
      int = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
    }
    return (neg ? '-' : '') + int + (parts[1] ? '.' + parts[1] : '');
  }

  /** Parse a typed amount such as "12,50,000" or "1250000.50"; returns null when it is not a plain non-negative number. */
  function parseAmount(text) {
    const t = String(text === null || text === undefined ? '' : text)
      .trim()
      .replace(/,/g, '');
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  // ---------------------------------------------------------------- Dates

  /** "2026-10-23" -> timestamp (UTC midnight); throws on impossible dates. */
  function parseIsoDate(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || '').trim());
    if (!m) throw new Error('Dates must look like 2026-10-23.');
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(t);
    if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3])
      throw new Error('That date does not exist.');
    return t;
  }

  const isoOf = (t) => new Date(t).toISOString().slice(0, 10);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /** "2026-10-23" -> "23 October 2026" (or "23/10/2026" with style "dmy"). Returns "" for empty input. */
  function formatDate(iso, style) {
    if (!iso) return '';
    const t = parseIsoDate(iso);
    const d = new Date(t);
    if (style === 'dmy')
      return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  /** Add days to an ISO date. */
  function addDays(iso, days) {
    return isoOf(parseIsoDate(iso) + days * 86400000);
  }

  /** Spreadsheet cell -> ISO date. Understands ISO, DD/MM/YYYY, DD-MM-YYYY, "23 Oct 2026" and Excel serial numbers; returns "" when unreadable. */
  function toIsoDate(value) {
    if (value instanceof Date && !isNaN(value)) return isoOf(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
    const s = String(value === null || value === undefined ? '' : value).trim();
    if (!s) return '';
    let m;
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isoOf(parseIsoDate(s));
      if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)))
        return isoOf(parseIsoDate(m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0')));
      if ((m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(s))) {
        const mi = MONTHS.findIndex((x) => x.slice(0, 3).toLowerCase() === m[2].slice(0, 3).toLowerCase());
        if (mi >= 0) return isoOf(parseIsoDate(m[3] + '-' + String(mi + 1).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0')));
      }
      if (/^\d{5}(\.\d+)?$/.test(s)) {
        const serial = Math.floor(Number(s));
        if (serial > 20000 && serial < 80000) return isoOf(Date.UTC(1899, 11, 30) + serial * 86400000);
      }
    } catch (e) {
      return '';
    }
    return '';
  }

  return {
    inrWords: inrWords,
    inrAmountText: inrAmountText,
    formatInr: formatInr,
    parseAmount: parseAmount,
    parseIsoDate: parseIsoDate,
    formatDate: formatDate,
    addDays: addDays,
    toIsoDate: toIsoDate,
    formatBytes: formatBytes,
    escapeHtml: escapeHtml,
    baseName: baseName,
    extension: extension,
    safeFileName: safeFileName,
    debounce: debounce,
    clamp: clamp,
    downloadBlob: downloadBlob,
    readArrayBuffer: readArrayBuffer,
    readText: readText,
    setStatus: setStatus,
    bindDropzone: bindDropzone,
    bindTabs: bindTabs,
    copyText: copyText,
    el: el,
  };
});
