// ==UserScript==
// @name         memberfind.php
// @match        https://beta.rewardsbutler.com/loy/memberfind.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/memberfind.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/memberfind.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const THROTTLE_MS = 250;
  let observer = null;
  let scheduled = false;

  function norm(s) {
    return (s || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[▲▼]\s*$/, '')
      .trim();
  }

  function findSubHeaderRow() {
    const cell = document.querySelector('td.formsubheader, th.formsubheader');
    return cell ? cell.closest('tr') : null;
  }

  function findContainer(subHeaderRow) {
    return subHeaderRow.closest('tbody') || subHeaderRow.closest('table');
  }

  function enableSorting(subHeaderRow, container) {
    const headers = Array.from(subHeaderRow.querySelectorAll('td.formsubheader, th.formsubheader'));
    if (!headers.length) return { ok: false, reason: 'no headers' };

    // Prevent double-binding
    if (subHeaderRow.dataset.rbSortBound === '1') return { ok: true, reason: 'already bound' };
    subHeaderRow.dataset.rbSortBound = '1';

    // Cache labels (stable even after arrows)
    headers.forEach(h => {
      if (!h.dataset.rbLabel) h.dataset.rbLabel = norm(h.textContent);
    });

    // Stable tie-breaker
    const rowsAtBind = Array.from(container.querySelectorAll('tr'));
    rowsAtBind.forEach((tr, i) => {
      if (!tr.dataset.rbOrigIndex) tr.dataset.rbOrigIndex = String(i);
    });

    // Arrow UI
    headers.forEach(h => {
      if (h.querySelector('.rb-sort-arrow')) return;

      h.style.cursor = 'pointer';
      h.title = 'Click to sort';

      const arrow = document.createElement('span');
      arrow.className = 'rb-sort-arrow';
      arrow.style.cssText = 'display:inline-block; margin-left:6px; font-weight:bold;';
      arrow.textContent = '';
      h.appendChild(arrow);
    });

    const clearArrows = () => {
      headers.forEach(h => {
        const a = h.querySelector('.rb-sort-arrow');
        if (a) a.textContent = '';
      });
    };

    const getDataRows = () => Array.from(container.querySelectorAll('tr.browse-item'));

    const getCellText = (tr, colIdx) => {
      const cell = tr.querySelectorAll('td, th')[colIdx];
      return norm(cell ? cell.textContent : '');
    };

    // Generic parse: numeric if clean number, else string
    const parseGeneric = (v) => {
      const cleaned = v.replace(/,/g, '');
      const isNumber = cleaned !== '' && /^-?\d+(\.\d+)?$/.test(cleaned);
      if (isNumber) return { kind: 'num', num: Number(cleaned), str: v.toLowerCase() };
      return { kind: 'str', num: null, str: v.toLowerCase() };
    };

    headers.forEach((h) => {
      h.addEventListener('click', () => {
        // Compute column index at click-time (robust)
        const headersNow = Array.from(subHeaderRow.querySelectorAll('td.formsubheader, th.formsubheader'));
        const colIdx = headersNow.indexOf(h);
        if (colIdx < 0) return;

        const prevCol = Number(container.dataset.rbSortCol ?? -1);
        const prevDir = container.dataset.rbSortDir ?? 'asc';
        const dir = (prevCol === colIdx && prevDir === 'asc') ? 'desc' : 'asc';

        container.dataset.rbSortCol = String(colIdx);
        container.dataset.rbSortDir = dir;

        clearArrows();
        const arrowEl = h.querySelector('.rb-sort-arrow');
        if (arrowEl) arrowEl.textContent = (dir === 'asc') ? '▲' : '▼';

        const rows = getDataRows();

        const decorated = rows.map(tr => {
          const raw = getCellText(tr, colIdx);
          const parsed = parseGeneric(raw);
          return {
            tr,
            orig: parseInt(tr.dataset.rbOrigIndex || '0', 10),
            parsed
          };
        });

        decorated.sort((a, b) => {
          const A = a.parsed;
          const B = b.parsed;

          if (A.kind === 'num' && B.kind === 'num') {
            const cmp = A.num - B.num;
            if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
          } else {
            const cmp = (A.str || '').localeCompare((B.str || ''), undefined, { numeric: true, sensitivity: 'base' });
            if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
          }

          return a.orig - b.orig;
        });

        // Re-append rows in sorted order (only browse-item rows)
        decorated.forEach(({ tr }) => container.appendChild(tr));
      });
    });

    return { ok: true };
  }

  function apply() {
    const subHeaderRow = findSubHeaderRow();
    if (!subHeaderRow) return;

    const container = findContainer(subHeaderRow);
    if (!container) return;

    enableSorting(subHeaderRow, container);
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;

    setTimeout(() => {
      scheduled = false;
      if (observer) observer.disconnect();
      try { apply(); }
      finally {
        if (observer) observer.observe(document.documentElement, { childList: true, subtree: true });
      }
    }, THROTTLE_MS);
  }

  apply();

  observer = new MutationObserver(() => scheduleApply());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
