// ==UserScript==
// @name         twiz5locations.php
// @match        https://beta.rewardsbutler.com/loy/twiz5locations.php?g=*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz5locations.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz5locations.user.js
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

  function getGroupG() {
    const params = new URLSearchParams(location.search);
    const g = params.get('g');
    return g && /^\d+$/.test(g) ? parseInt(g, 10) : null;
  }

  function findHeaderRow() {
    const headerCell = document.querySelector('td.formheader, th.formheader, .formheader');
    return headerCell ? headerCell.closest('tr') : null;
  }

  // ===== NAV BAR =====
  function buildLocationNavRow(container) {
    const td = container.querySelector('td.tdcenter[colspan]');
    if (!td) return { ok: false, reason: 'nav td not found' };

    if (td.dataset.rbTwiz5NavBuilt === '1') return { ok: true, reason: 'already built' };

    const g = getGroupG();
    if (g === null) return { ok: false, reason: 'no numeric g= found in URL' };

    td.querySelectorAll('br').forEach(br => br.remove());
    td.childNodes.forEach(n => {
      if (n.nodeType === Node.TEXT_NODE) n.remove();
    });

    const existingAdd =
      Array.from(td.querySelectorAll('a')).find(a => (a.getAttribute('href') || '').includes('twiz5add1.php')) || null;
    const existingReturn =
      Array.from(td.querySelectorAll('a')).find(a => (a.getAttribute('href') || '').includes('twiz5form.php')) || null;

    const frag = document.createDocumentFragment();
    const sep = () => frag.appendChild(document.createTextNode(' | '));

    const desc = document.createElement('a');
    desc.href = `https://beta.rewardsbutler.com/loy/twiz5edit.php?id=${g}`;
    desc.textContent = 'Description';
    frag.appendChild(desc);

    sep();
    frag.appendChild(document.createTextNode('Location List'));

    sep();
    const addLoc = existingAdd || document.createElement('a');
    addLoc.href = `https://beta.rewardsbutler.com/loy/twiz5add1.php?g=${g}`;
    addLoc.textContent = 'Add Location';
    frag.appendChild(addLoc);

    // Check List (link)
    sep();
    const checkList = document.createElement('a');
    checkList.href = `https://beta.rewardsbutler.com/loy/twiz5addmany.php?g=${g}`;
    checkList.textContent = 'Check List';
    frag.appendChild(checkList);

    sep();
    const ret = existingReturn || document.createElement('a');
    ret.href = `https://beta.rewardsbutler.com/loy/twiz5form.php`;
    ret.textContent = 'Return to Location Groups';
    frag.appendChild(ret);

    td.textContent = '';
    td.appendChild(frag);

    td.style.whiteSpace = 'nowrap';
    td.dataset.rbTwiz5NavBuilt = '1';

    return { ok: true, g };
  }

  // ===== SORTING =====
  function findSubHeaderRow(container) {
    const cell = container.querySelector('td.formsubheader, th.formsubheader');
    return cell ? cell.closest('tr') : null;
  }

  function findTableContainerFromSubHeaderRow(subHeaderRow) {
    return subHeaderRow.closest('tbody') || subHeaderRow.closest('table');
  }

  function enableSorting(subHeaderRow, container) {
    const headers = Array.from(subHeaderRow.querySelectorAll('td.formsubheader, th.formsubheader'));
    if (!headers.length) return { ok: false, reason: 'no subheaders' };

    if (subHeaderRow.dataset.rbSortBound === '1') return { ok: true, reason: 'already bound' };
    subHeaderRow.dataset.rbSortBound = '1';

    // Cache labels
    headers.forEach(h => {
      if (!h.dataset.rbLabel) h.dataset.rbLabel = norm(h.textContent);
    });

    // Mark original order for stable ties
    const rowsAtBind = Array.from(container.querySelectorAll('tr'));
    rowsAtBind.forEach((tr, i) => {
      if (!tr.dataset.rbOrigIndex) tr.dataset.rbOrigIndex = String(i);
    });

    // Add arrow UI
    headers.forEach(h => {
      if (h.querySelector('.rb-sort-arrow')) return;

      const label = h.dataset.rbLabel;
      const sortable = (label !== 'Actions');

      h.style.cursor = sortable ? 'pointer' : 'default';
      h.title = sortable ? 'Click to sort' : '';

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

    const getDataRows = () => {
      // Only sort the actual browse-item rows (robust + prevents moving nav/header rows)
      return Array.from(container.querySelectorAll('tr.browse-item'));
    };

    const getCellText = (tr, colIdx) => {
      const cell = tr.querySelectorAll('td, th')[colIdx];
      return norm(cell ? cell.textContent : '');
    };

    // numeric if clean number, else string
    const parseGeneric = (v) => {
      const cleaned = v.replace(/,/g, '');
      const isNumber = cleaned !== '' && /^-?\d+(\.\d+)?$/.test(cleaned);
      if (isNumber) return { kind: 'num', num: Number(cleaned), str: v.toLowerCase() };
      return { kind: 'str', num: null, str: v.toLowerCase() };
    };

    headers.forEach((h) => {
      const label = h.dataset.rbLabel;
      if (label === 'Actions') return; // ignore actions

      h.addEventListener('click', () => {
        // Compute column index at click time (robust)
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

        // Re-append only the browse-item rows in sorted order
        decorated.forEach(({ tr }) => container.appendChild(tr));
      });
    });

    return { ok: true };
  }

  function apply() {
    const headerRow = findHeaderRow();
    if (!headerRow) return;

    const outerContainer = headerRow.closest('tbody') || headerRow.closest('table');
    if (!outerContainer) return;

    // nav bar row (modifies the existing tdcenter row)
    buildLocationNavRow(outerContainer);

    // sorting (based on formsubheader row)
    const subHeaderRow = findSubHeaderRow(outerContainer);
    if (!subHeaderRow) return;

    const tableContainer = findTableContainerFromSubHeaderRow(subHeaderRow);
    if (!tableContainer) return;

    enableSorting(subHeaderRow, tableContainer);
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
