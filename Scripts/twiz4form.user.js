// ==UserScript==
// @name         twiz4form.php
// @match        https://beta.rewardsbutler.com/loy/twiz4form.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz4form.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz4form.user.js
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

  function removeMessageTables() {
    document.querySelectorAll('table.message').forEach(t => t.remove());
  }

  /* ================== NAV BAR (Trigger Project) ================== */

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
    td.colSpan = colSpan;

    // Mark nav so sorting/header detection can ignore it
    td.setAttribute('data-rb-nav', '1');

    // On Member Groups page:
    // Trigger Search = link
    // New Trigger = link
    // Product Groups = link
    // Member Groups = text
    // Location Groups = link
    td.appendChild(makeLink('prizes.php', 'Trigger Search'));
    td.appendChild(sep());
    td.appendChild(makeLink('prizedrill.php?r=0', 'New Trigger'));
    td.appendChild(sep());
    td.appendChild(makeLink('combosLocationFilter.php', 'Combos'));
    td.appendChild(sep());
    td.appendChild(document.createTextNode('Member Groups'));
    td.appendChild(sep());
    td.appendChild(makeLink('twiz5form.php', 'Location Groups'));

    return td;
  }

  function ensureMemberGroupsHeaderAndNav() {
    // Anchor: the search bar that starts the page content
    const searchInput = document.getElementById('searchBar');
    if (!searchInput) return { ok: false, reason: 'no #searchBar' };

    // We’re inside: <td colspan="2" align="center"> ... <input id="searchBar"> ...
    const hostTd = searchInput.closest('td[colspan]');
    if (!hostTd) return { ok: false, reason: 'no host td' };

    // Avoid double insert if mutations fire
    if (hostTd.dataset.rbMemberGroupsHeaderNav === '1') return { ok: true, reason: 'already inserted' };

    // If rows already exist (from a prior run), mark and exit
    if (document.querySelector('tr[data-rb-member-groups-header="1"], tr[data-rb-trigger-nav="1"]')) {
      hostTd.dataset.rbMemberGroupsHeaderNav = '1';
      return { ok: true, reason: 'already present' };
    }

    const hostTr = hostTd.closest('tr');
    if (!hostTr) return { ok: false, reason: 'no host tr' };

    const colSpan = parseInt(hostTd.getAttribute('colspan') || '2', 10) || 2;

    // Build header row: <tr><td class="formheader" colspan="2">Member Groups</td></tr>
    const headerTr = document.createElement('tr');
    headerTr.setAttribute('data-rb-member-groups-header', '1');

    const headerTd = document.createElement('td');
    headerTd.className = 'formheader';
    headerTd.colSpan = colSpan;
    headerTd.textContent = 'Member Groups';

    headerTr.appendChild(headerTd);

    // Build nav row under it
    const navTr = document.createElement('tr');
    navTr.setAttribute('data-rb-trigger-nav', '1');
    navTr.appendChild(buildTriggerNavTd(colSpan));

    // Insert both rows above the search row
    hostTr.parentNode.insertBefore(headerTr, hostTr);
    hostTr.parentNode.insertBefore(navTr, hostTr);

    hostTd.dataset.rbMemberGroupsHeaderNav = '1';
    return { ok: true };
  }

  /* ================== SORTING (ignores nav row) ================== */

  function findSortableHeaderRow() {
    // Pick the first real column header row, not our injected nav row
    const headerCell = document.querySelector(
      'td.formsubheader:not([data-rb-nav]), th.formsubheader:not([data-rb-nav])'
    );
    if (!headerCell) return null;
    return headerCell.closest('tr') || null;
  }

  function findContainer(headerRow) {
    return headerRow ? (headerRow.closest('tbody') || headerRow.closest('table')) : null;
  }

  function enableSorting(headerRow, container) {
    if (!headerRow || !container) return { ok: false, reason: 'missing headerRow/container' };

    const headers = Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
    if (!headers.length) return { ok: false, reason: 'no headers found' };

    if (headerRow.dataset.rbSortBound === '1') return { ok: true, reason: 'already bound' };
    headerRow.dataset.rbSortBound = '1';

    headers.forEach(h => {
      if (!h.dataset.rbLabel) h.dataset.rbLabel = norm(h.textContent);
    });

    const allRowsAtBind = Array.from(container.querySelectorAll('tr'));
    allRowsAtBind.forEach((tr, i) => {
      if (!tr.dataset.rbOrigIndex) tr.dataset.rbOrigIndex = String(i);
    });

    const getDataRows = () => {
      const headersNow = Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
      const rowsNow = Array.from(container.querySelectorAll('tr'));
      const hIdxNow = rowsNow.indexOf(headerRow);

      return rowsNow
        .slice(hIdxNow + 1)
        .filter(tr => tr.querySelectorAll('td, th').length >= headersNow.length);
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
      const headersNow = Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
      headersNow.forEach(h => {
        const a = h.querySelector('.rb-sort-arrow');
        if (a) a.textContent = '';
      });
    };

    const getCellText = (tr, colIdx) => {
      const cell = tr.querySelectorAll('td, th')[colIdx];
      return norm(cell ? cell.textContent : '');
    };

    const parseGeneric = (v) => {
      const cleaned = v.replace(/,/g, '');
      const isNumber = cleaned !== '' && /^-?\d+(\.\d+)?$/.test(cleaned);
      if (isNumber) return { num: Number(cleaned), str: v.toLowerCase() };
      return { num: null, str: v.toLowerCase() };
    };

    headers.forEach((h) => {
      const label = h.dataset.rbLabel;
      if (label === 'Actions') return;

      h.addEventListener('click', () => {
        const headersNow = Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
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
          return { tr, orig: parseInt(tr.dataset.rbOrigIndex || '0', 10), parsed };
        });

        decorated.sort((a, b) => {
          const A = a.parsed, B = b.parsed;

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

  /* ================== APPLY ================== */

  function apply() {
    removeMessageTables();

    // 1) Ensure header + nav above search bar
    ensureMemberGroupsHeaderAndNav();

    // 2) Sorting (ignores nav row)
    const headerRow = findSortableHeaderRow();
    if (!headerRow) return;

    const container = findContainer(headerRow);
    if (!container) return;

    enableSorting(headerRow, container);
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
