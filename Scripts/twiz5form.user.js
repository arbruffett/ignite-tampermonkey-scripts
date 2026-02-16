// ==UserScript==
// @name         twiz5form.php
// @match        https://beta.rewardsbutler.com/loy/twiz5form.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz5form.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz5form.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const THROTTLE_MS = 300;

  let observer = null;
  let scheduled = false;

  // ---------- helpers ----------
  function norm(s) {
    return (s || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[▲▼]\s*$/, '')
      .trim();
  }

    function findHeaderRow() {
        // Find the first "real" header row (formsubheader), but skip our injected nav row
        const headerCell = document.querySelector('td.formsubheader:not([data-rb-nav]), th.formsubheader:not([data-rb-nav])');
        if (!headerCell) return null;
        return headerCell.closest('tr');
    }

  function getHeaderCells(headerRow) {
    return Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
  }

  function getRowCells(tr) {
    return Array.from(tr.querySelectorAll('td, th'));
  }

  function findContainer(headerRow) {
    return headerRow.closest('tbody') || headerRow.closest('table');
  }

  // --------------Remove Helper Table-------------
  function removeMessageTables() {
    document.querySelectorAll('table.message').forEach(t => t.remove());
  }

  /* ================== HEADER + NAV (Trigger Project) ================== */

  function findAddNewGroupRow() {
    const a = document.querySelector('a[href^="twiz5edit.php?id=0"]');
    if (!a) return null;
    return a.closest('tr') || null;
  }

  function makeLink(href, text) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    return a;
  }

  function sep() {
    return document.createTextNode(' \u00A0|\u00A0 ');
  }

  function buildTriggerNavTd(colSpan) {
    const td = document.createElement('td');
    td.className = 'formsubheader';
    td.setAttribute('data-rb-nav', '1');
    td.colSpan = colSpan;

    // On Location Groups page:
    // Trigger Search = link
    // New Trigger = link
    // Product Groups = link
    // Member Groups = link
    // Location Groups = text
    td.appendChild(makeLink('prizes.php', 'Trigger Search'));
    td.appendChild(sep());
    td.appendChild(makeLink('prizedrill.php?r=0', 'New Trigger'));
    td.appendChild(sep());
    td.appendChild(makeLink('combosLocationFilter.php', 'Combos'));
    td.appendChild(sep());
    td.appendChild(makeLink('twiz4form.php', 'Member Groups'));
    td.appendChild(sep());
    td.appendChild(document.createTextNode('Location Groups'));

    return td;
  }

  function ensureLocationGroupsHeaderAndNav() {
    const addRow = findAddNewGroupRow();
    if (!addRow) return { ok: false, reason: 'Add new Group row not found' };

    const tbody = addRow.parentElement;
    if (!tbody) return { ok: false, reason: 'no tbody' };

    // Ensure both rows exist; recover if one was removed.
    let headerTr = tbody.querySelector('tr[data-rb-location-groups-header="1"]');
    let navTr = tbody.querySelector('tr[data-rb-trigger-nav="1"]');
    if (headerTr && navTr) return { ok: true, reason: 'already present' };

    const firstTd = addRow.querySelector('td, th');
    const colSpan = firstTd ? (parseInt(firstTd.getAttribute('colspan') || '5', 10) || 5) : 5;

    if (!headerTr) {
      headerTr = document.createElement('tr');
      headerTr.setAttribute('data-rb-location-groups-header', '1');

      const headerTd = document.createElement('td');
      headerTd.className = 'formheader';
      headerTd.colSpan = colSpan;
      headerTd.textContent = 'Location Groups';

      headerTr.appendChild(headerTd);
      tbody.insertBefore(headerTr, addRow);
    }

    if (!navTr) {
      navTr = document.createElement('tr');
      navTr.setAttribute('data-rb-trigger-nav', '1');
      navTr.appendChild(buildTriggerNavTd(colSpan));

      // Keep nav directly under header.
      if (headerTr.parentElement === tbody) headerTr.insertAdjacentElement('afterend', navTr);
      else tbody.insertBefore(navTr, addRow);
    }

    return { ok: true };
  }

  // ---------- 1) Rename header ----------
  function renameHeader(headerRow, oldText, newText) {
    if (!headerRow) return { ok: false, reason: 'missing headerRow' };

    const headerCells = getHeaderCells(headerRow);
    let renamed = 0;

    headerCells.forEach(cell => {
      const t = norm(cell.textContent);
      if (t === oldText) {
        const arrow = cell.querySelector('.rb-sort-arrow');
        cell.textContent = newText;
        if (arrow) cell.appendChild(arrow);
        renamed++;
      }
    });

    return { ok: true, renamed };
  }

  // ---------- 2) Format Actions column ----------
  function formatActionCellSeparators(headerRow, container) {
    if (!headerRow || !container) {
      return { ok: false, reason: 'missing headerRow/container' };
    }

    const headerCells = getHeaderCells(headerRow);
    const headerTexts = headerCells.map(c => norm(c.textContent));

    const actionsIdx = headerTexts.indexOf('Actions');
    if (actionsIdx === -1) {
      return { ok: false, reason: '"Actions" header not found' };
    }

    let scanned = 0;
    let changed = 0;

    const rows = Array.from(container.querySelectorAll('tr'));

    rows.forEach(tr => {
      if (tr === headerRow) return;

      const cells = getRowCells(tr);
      const cell = cells[actionsIdx];
      if (!cell) return;

      scanned++;

      const links = Array.from(cell.querySelectorAll('a'));
      if (links.length <= 1) return;

      const sepHtml = ` <strong>|</strong> `;
      const newHtml = links.map(a => a.outerHTML).join(sepHtml);

      if (newHtml !== cell.innerHTML) {
        cell.innerHTML = newHtml;
        changed++;
      }
    });

    return { ok: true, scanned, changed, actionsIdx };
  }

  // ---------- 3) Sorting ----------
  function enableSorting(headerRow, container) {
    const headers = getHeaderCells(headerRow);
    if (!headers.length) return { ok: false, reason: 'no headers found' };

    if (headerRow.dataset.rbSortBound === '1') return { ok: true, reason: 'already bound' };
    headerRow.dataset.rbSortBound = '1';

    headers.forEach(h => {
      if (!h.dataset.rbLabel) h.dataset.rbLabel = norm(h.textContent);
    });

    const allRows = Array.from(container.querySelectorAll('tr'));
    allRows.forEach((tr, i) => {
      if (!tr.dataset.rbOrigIndex) tr.dataset.rbOrigIndex = String(i);
    });

    const getDataRows = () => {
      const rowsNow = Array.from(container.querySelectorAll('tr'));
      const headerIdxNow = rowsNow.indexOf(headerRow);
      return rowsNow
        .slice(headerIdxNow + 1)
        .filter(tr => getRowCells(tr).length >= headers.length);
    };

    const parseValue = (v) => {
      const cleaned = v.replace(/,/g, '');
      const isNumber = cleaned !== '' && /^-?\d+(\.\d+)?$/.test(cleaned);
      if (isNumber) return { kind: 'num', num: Number(cleaned), str: v.toLowerCase() };
      return { kind: 'str', num: null, str: v.toLowerCase() };
    };

    // Arrow UI
    headers.forEach(h => {
      if (h.querySelector('.rb-sort-arrow')) return;

      h.style.cursor = (h.dataset.rbLabel === 'Actions') ? 'default' : 'pointer';
      h.title = (h.dataset.rbLabel === 'Actions') ? '' : 'Click to sort';

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

    headers.forEach((h, colIdx) => {
      const label = h.dataset.rbLabel;
      if (label === 'Actions') return;

      h.addEventListener('click', () => {
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
          const cell = getRowCells(tr)[colIdx];
          const raw = norm(cell ? cell.textContent : '');
          const parsed = parseValue(raw);

          return {
            tr,
            orig: parseInt(tr.dataset.rbOrigIndex || '0', 10),
            parsed
          };
        });

        decorated.sort((a, b) => {
          const A = a.parsed;
          const B = b.parsed;

          if (A.num !== null && B.num !== null) {
            const cmp = A.num - B.num;
            if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
          } else {
            const cmp = (A.str || '').localeCompare((B.str || ''), undefined, { numeric: true, sensitivity: 'base' });
            if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
          }

          return a.orig - b.orig;
        });

        decorated.forEach(({ tr }) => container.appendChild(tr));
      });
    });

    return { ok: true };
  }

  // ---------- apply ----------
  function apply() {
    removeMessageTables();

    // Existing behavior
    const headerRow = findHeaderRow();
    if (!headerRow) return;

    const container = findContainer(headerRow);
    if (!container) return;

    renameHeader(headerRow, 'Number Of Locations', 'Locations');
    enableSorting(headerRow, container);
    formatActionCellSeparators(headerRow, container);

    // Insert Location Groups header + nav above "Add new Group"
    ensureLocationGroupsHeaderAndNav();
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
