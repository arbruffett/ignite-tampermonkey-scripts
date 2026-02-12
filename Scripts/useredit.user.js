// ==UserScript==
// @name         useredit.php
// @match        https://beta.rewardsbutler.com/admin/useredit.php*
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/useredit.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/useredit.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const COLS = 3;

  function normalizeSpaces(s) {
    return (s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function normalizeLabel(text) {
    return normalizeSpaces(text).replace(/:\s*$/, '');
  }

  function buildCellContent(checkboxEl, labelText) {
    const wrap = document.createElement('span');
    wrap.style.display = 'inline-block';
    wrap.style.textAlign = 'left';
    wrap.style.whiteSpace = 'nowrap';
    wrap.appendChild(checkboxEl);
    wrap.appendChild(document.createTextNode(' ' + labelText));
    return wrap;
  }

  function extractRowData(tr) {
    const checkbox = tr.querySelector('input[type="checkbox"]');
    if (!checkbox) return null;

    const tds = Array.from(tr.querySelectorAll('td'));
    const labelSource =
      tds.find(td => !td.querySelector('input[type="checkbox"]')) || tds[0] || tr;

    return { tr, checkbox, labelText: normalizeLabel(labelSource.textContent || '') };
  }

    function clampInputSizes(maxSize = 20) {
        let changed = 0;

        document.querySelectorAll('input[size]').forEach(input => {
            const size = parseInt(input.getAttribute('size'), 10);
            if (!Number.isNaN(size) && size > maxSize) {
                input.setAttribute('size', String(maxSize));
                changed++;
            }
        });

        return changed;
    }

    function fixReturnColspan(columnCount) {
        const link = Array.from(document.querySelectorAll('a'))
        .find(a => normalizeSpaces(a.textContent) === 'Return to users');

        if (!link) return { ok: false, reason: 'link not found' };

        const td = link.closest('td');
        if (!td) return { ok: false, reason: 'td not found' };

        td.setAttribute('colspan', String(columnCount));
        td.style.textAlign = 'center';

        return { ok: true };
    }

    function addLeftSpacingToPermissionColumn(table, columnIndex, spaceAmount = 3) {
        // columnIndex is 1-based (2 = second column)
        const rows = table.querySelectorAll('tr[data-rb-cols-row="1"]');

        rows.forEach(tr => {
            const tds = tr.querySelectorAll('td');
            const td = tds[columnIndex - 1];
            if (!td) return;

            // Prevent double-application
            if (td.dataset.rbSpaced === '1') return;

            const spacer = document.createElement('span');
            spacer.style.display = 'inline-block';
            spacer.style.width = `${spaceAmount}ch`;
            spacer.style.pointerEvents = 'none';

            td.prepend(spacer);
            td.dataset.rbSpaced = '1';
        });
    }




  function columnizePermissions() {
    const anchor = document.querySelector('input[type="hidden"][name="pn1"][value="admin"]');
    if (!anchor) return;

    const startRow = anchor.closest('tr');
    if (!startRow) return;

    const table = startRow.closest('table');
    if (!table) return;

    // Prevent endless rework
    if (table.dataset.rbColsDone === String(COLS)) return;

    const rows = Array.from(table.querySelectorAll('tr'));
    const startIdx = rows.indexOf(startRow);
    if (startIdx === -1) return;

    // Collect permission rows
    const data = [];
    for (let i = startIdx + 1; i < rows.length; i++) {
      const d = extractRowData(rows[i]);
      if (d) data.push(d);
    }

    if (data.length === 0) {
      table.dataset.rbColsDone = String(COLS);
      return;
    }

    const groupSize = Math.ceil(data.length / COLS);

    // Build first groupSize rows into a COLS-column grid
    for (let i = 0; i < groupSize; i++) {
      const base = data[i];
      if (!base) break;

      base.tr.innerHTML = '';

      for (let c = 0; c < COLS; c++) {
        const idx = i + c * groupSize;
        const item = data[idx];

        const td = document.createElement('td');
        td.style.textAlign = 'left';
        td.style.verticalAlign = 'top';
        td.style.width = `${Math.floor(100 / COLS)}%`;

        if (item) {
          td.appendChild(buildCellContent(item.checkbox, item.labelText));
        }

        base.tr.appendChild(td);
      }

      base.tr.dataset.rbColsRow = '1';
    }

    // Remove rows used as sources beyond the visible grid
    for (let i = groupSize; i < data.length; i++) {
      const tr = data[i].tr;
      if (tr && tr.dataset.rbColsRow !== '1') tr.remove();
    }

    table.dataset.rbColsDone = String(COLS);
    addLeftSpacingToPermissionColumn(table,2,3);
  }

  columnizePermissions();
  clampInputSizes(18);
  fixReturnColspan(COLS);

  const obs = new MutationObserver(() => columnizePermissions());
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
