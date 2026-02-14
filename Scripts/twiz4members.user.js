// ==UserScript==
// @name         twiz4members.php
// @match        https://beta.rewardsbutler.com/loy/twiz4members.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz4members.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz4members.user.js
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

  function findHeaderRow() {
    // specifically locate the header row that contains your 4 headers
    const headerCells = Array.from(document.querySelectorAll('td.formsubheader, th.formsubheader'));
    for (const cell of headerCells) {
      const tr = cell.closest('tr');
      if (!tr) continue;
      const labels = Array.from(tr.querySelectorAll('td.formsubheader, th.formsubheader')).map(h => norm(h.textContent));
      if (labels.length >= 4 && labels.includes('CardNumber') && labels.includes('Name') && labels.includes('Expiration Date') && labels.includes('Actions')) {
        return tr;
      }
    }
    return null;
  }

    function getGroupG() {
        const params = new URLSearchParams(location.search);
        const g = params.get('g');
        return g && /^\d+$/.test(g) ? parseInt(g, 10) : null;
    }

    function buildMemberNavRow(container) {
        const td = container.querySelector('td.tdcenter[colspan]');
        if (!td) return { ok: false, reason: 'nav td not found' };

        // Avoid rebuilding on every mutation
        if (td.dataset.rbMemberNavBuilt === '1') {
            return { ok: true, reason: 'already built' };
        }

        const g = getGroupG();
        if (g === null) return { ok: false, reason: 'no numeric g= found in URL' };

        const links = Array.from(td.querySelectorAll('a'));
        if (!links.length) return { ok: false, reason: 'no links found' };

        // Remove &nbsp; text nodes and <br>
        td.childNodes.forEach(n => {
            if (n.nodeType === Node.TEXT_NODE) n.remove();
        });
        td.querySelectorAll('br').forEach(br => br.remove());

        const frag = document.createDocumentFragment();
        const sep = () => frag.appendChild(document.createTextNode(' | '));

        // Member Group (link) first
        const memberGroup = document.createElement('a');
        memberGroup.href = `https://beta.rewardsbutler.com/loy/twiz4edit.php?id=${g}`;
        memberGroup.textContent = 'Member Group';
        frag.appendChild(memberGroup);

        // Separator after Member Group
        sep();

        // Member List label (text)
        frag.appendChild(document.createTextNode('Member List'));

        // Existing links from the page (Add Member / Add Card Range / Upload Members / Return to Groups)
        links.forEach(a => {
            sep();
            frag.appendChild(a); // moves existing node (keeps href/attrs/listeners)
        });

        td.textContent = '';
        td.appendChild(frag);

        td.style.whiteSpace = 'nowrap';
        td.dataset.rbMemberNavBuilt = '1';

        return { ok: true, g, count: links.length };
    }

    function normalizeExpirationDates(headerRow, container) {
        const headers = Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
        const expIdx = headers.findIndex(h => h.dataset.rbLabel === 'Expiration Date' || norm(h.textContent) === 'Expiration Date');
        if (expIdx < 0) return;

        const rows = Array.from(container.querySelectorAll('tr.browse-item'));

        rows.forEach(tr => {
            const cells = tr.querySelectorAll('td');
            const cell = cells[expIdx];
            if (!cell) return;

            // Prevent repeat work
            if (cell.dataset.rbNormalized === '1') return;

            const raw = norm(cell.textContent);
            if (raw === '0000-00-00 00:00:00') {
                cell.textContent = 'None';
                cell.dataset.rbNormalized = '1';
            }
        });
    }

  function findContainer(headerRow) {
    return headerRow.closest('tbody') || headerRow.closest('table');
  }

  function enableSorting(headerRow, container) {
    const headers = Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
    if (!headers.length) return;

    // prevent double-binding if DOM mutates
    if (headerRow.dataset.rbSortBound === '1') return;
    headerRow.dataset.rbSortBound = '1';

    // cache the original header labels so arrows don't mess with matching
    headers.forEach(h => {
      if (!h.dataset.rbLabel) h.dataset.rbLabel = norm(h.textContent);
    });

    // stable tie-breaker order
    const rowsAtBind = Array.from(container.querySelectorAll('tr'));
    rowsAtBind.forEach((tr, i) => {
      if (!tr.dataset.rbOrigIndex) tr.dataset.rbOrigIndex = String(i);
    });

    const clearArrows = () => {
      headers.forEach(h => {
        const a = h.querySelector('.rb-sort-arrow');
        if (a) a.textContent = '';
      });
    };

    // add arrow UI spans
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

    const getDataRows = () => {
      const rowsNow = Array.from(container.querySelectorAll('tr'));
      const headerIndex = rowsNow.indexOf(headerRow);
      return rowsNow
        .slice(headerIndex + 1)
        .filter(tr => tr.querySelectorAll('td, th').length >= headers.length);
    };

    const getCellText = (tr, colIdx) => {
      const cell = tr.querySelectorAll('td, th')[colIdx];
      return norm(cell ? cell.textContent : '');
    };

    // numeric if digits-only, else string (case-insensitive)
    const parseVal = (v) => {
      const isDigits = /^\d+$/.test(v);
      if (isDigits) return { kind: 'num', num: parseInt(v, 10), str: v.toLowerCase() };
      return { kind: 'str', num: null, str: v.toLowerCase() };
    };

    headers.forEach((h) => {
      const label = h.dataset.rbLabel;
      if (label === 'Actions') return; // ignore "Actions" for sorting

      h.addEventListener('click', () => {
        // compute current column index at click-time
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
          const parsed = parseVal(raw);
          return {
            tr,
            orig: parseInt(tr.dataset.rbOrigIndex || '0', 10),
            parsed
          };
        });

        decorated.sort((a, b) => {
          const A = a.parsed;
          const B = b.parsed;

          // if both numeric, compare numeric
          if (A.kind === 'num' && B.kind === 'num') {
            const cmp = A.num - B.num;
            if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
          } else {
            // otherwise compare as strings (natural-ish)
            const cmp = (A.str || '').localeCompare((B.str || ''), undefined, { numeric: true, sensitivity: 'base' });
            if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
          }

          // stable tiebreak
          return a.orig - b.orig;
        });

        // re-append in sorted order
        decorated.forEach(({ tr }) => container.appendChild(tr));
      });
    });
  }

  function apply() {
    const headerRow = findHeaderRow();
    if (!headerRow) return;

    const container = findContainer(headerRow);
    if (!container) return;

    enableSorting(headerRow, container);
    normalizeExpirationDates(headerRow, container);
    buildMemberNavRow(container);
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
