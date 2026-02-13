// ==UserScript==
// @name         rptdrill.php
// @match        https://beta.rewardsbutler.com/loy/rptdrill.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/rptdrill.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/rptdrill.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  /* ============================================================
     CONFIG (EDIT THESE FOR EACH PAGE)
     ============================================================ */

  const CONFIG = {
    // Rows you want to manage: { label: exact text from page, value: dropdown option }
    rows: [
      { label: 'Location :',       value: 'Location' },
      { label: 'Agency :',         value: 'Agency' },
      { label: 'Consultant :',     value: 'Consultant' },
      { label: 'Parent Company :', value: 'Parent Company' },
      { label: 'DBA :',            value: 'DBA' },
      { label: 'Industry :',       value: 'Industry' }
    ],

    // Default dropdown selection (must match one of the .value fields above)
    defaultValue: 'Parent Company',

    // Placeholder row label (left cell)
    placeholderLabel: 'Level :',

    // Required number of row-label hits in a table for us to treat it as the target table
    tableMatchThreshold: 3,

    // Throttle for mutation observer reruns
    throttleMs: 200
  };

  /* ============================================================
     INTERNAL STATE
     ============================================================ */

  let cachedTargetTable = null;
  let scheduled = false;

  // Build convenient lookups once
  const normalizedLabelSet = new Set(CONFIG.rows.map(r => normalize(r.label)));
  const valueSet = new Set(CONFIG.rows.map(r => r.value));

  /* ============================================================
     HELPERS
     ============================================================ */

  function normalize(s) {
    return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function qsa(root, sel) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  /* ============================================================
     TABLE FINDING (Option 2: Find table by label match)
     ============================================================ */

  function findTargetTableByLabels() {
    const tables = qsa(document, 'table');

    for (const table of tables) {
      let hits = 0;

      const texts = qsa(table, 'td').map(td => normalize(td.textContent));

      for (const lbl of normalizedLabelSet) {
        if (texts.includes(lbl)) hits++;
      }

      if (hits >= CONFIG.tableMatchThreshold) return table;
    }

    return null;
  }

  function getTargetTable() {
    if (cachedTargetTable && document.contains(cachedTargetTable)) return cachedTargetTable;

    // Prefer: table match scoring
    const table = findTargetTableByLabels();
    if (table) {
      cachedTargetTable = table;
      return table;
    }

    // Fallback: inserted placeholder row
    const insertedRow = document.querySelector('tr[data-rb-placeholder="1"]');
    if (insertedRow) {
      const t = insertedRow.closest('table');
      if (t) {
        cachedTargetTable = t;
        return t;
      }
    }

    return null;
  }

  /* ============================================================
     TAG ROWS (One-time: assign data attribute to each managed row)
     ============================================================ */

  function tagManagedRows(table) {
    qsa(table, 'tr').forEach(tr => {
      const td = tr.querySelector('td');
      if (!td) return;

      const txt = normalize(td.textContent);
      if (!normalizedLabelSet.has(txt)) return;

      // Find corresponding config row and tag it
      const match = CONFIG.rows.find(r => normalize(r.label) === txt);
      if (match) tr.dataset.rbManaged = match.value; // e.g. "Parent Company"
    });
  }

  /* ============================================================
     INSERT PLACEHOLDER ROW (Level + dropdown)
     ============================================================ */

  function insertPlaceholderRow(table) {
    // Prevent duplicates
    if (table.querySelector('tr[data-rb-placeholder="1"]')) return;

    // Find the first managed row so we can insert above it
    const firstManagedRow = qsa(table, 'tr').find(tr => {
      const td = tr.querySelector('td');
      return td && normalizedLabelSet.has(normalize(td.textContent));
    });

    if (!firstManagedRow) return;

    const tbody = firstManagedRow.parentElement;
    if (!tbody) return;

    const tr = document.createElement('tr');
    tr.dataset.rbPlaceholder = '1';

    const tdLeft = document.createElement('td');
    tdLeft.className = 'justright';
    tdLeft.textContent = CONFIG.placeholderLabel;

    const tdRight = document.createElement('td');
    tdRight.className = 'justleft';

    const select = document.createElement('select');
    select.name = 'rbLevelSelect';
    select.style.minWidth = '200px';

    CONFIG.rows.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.value;
      opt.textContent = r.value;
      select.appendChild(opt);
    });

    // Default selection
    if (valueSet.has(CONFIG.defaultValue)) {
      select.value = CONFIG.defaultValue;
    }

    tdRight.appendChild(select);

    tr.appendChild(tdLeft);
    tr.appendChild(tdRight);

    tbody.insertBefore(tr, firstManagedRow);
  }

  /* ============================================================
     INITIAL HIDE (Hide all except default)
     ============================================================ */

  function applyInitialVisibility(table) {
    qsa(table, 'tr[data-rb-managed]').forEach(tr => {
      tr.style.display = (tr.dataset.rbManaged === CONFIG.defaultValue) ? '' : 'none';
    });
  }

  /* ============================================================
     WATCHER (Always hide all then show selected)
     ============================================================ */

  function attachDropdownWatcher(table) {
    const select = table.querySelector('select[name="rbLevelSelect"]');
    if (!select) return;

    if (select.dataset.rbWatcherAttached === '1') return;
    select.dataset.rbWatcherAttached = '1';

    function updateVisibility() {
      const selected = select.value;

      // Hide all managed rows
      qsa(table, 'tr[data-rb-managed]').forEach(tr => {
        tr.style.display = 'none';
      });

      // Show selected row (if it exists)
      const row = table.querySelector(`tr[data-rb-managed="${CSS.escape(selected)}"]`);
      if (row) row.style.display = '';
    }

    select.addEventListener('change', updateVisibility);
    updateVisibility();
  }

  /* ============================================================
     MAIN RUNNER
     ============================================================ */

    function runAll() {
        const table = getTargetTable();
        if (!table) return;

        tagManagedRows(table);
        if (table.dataset.rbInitialized === '1') return;

        table.dataset.rbInitialized = '1';
        insertPlaceholderRow(table);
        tagManagedRows(table);
        applyInitialVisibility(table);
        attachDropdownWatcher(table);
    }

  function scheduleRun() {
    if (scheduled) return;
    scheduled = true;

    setTimeout(() => {
      scheduled = false;
      runAll();
    }, CONFIG.throttleMs);
  }

  /* ============================================================
     EXECUTION
     ============================================================ */

  runAll();

  new MutationObserver(scheduleRun).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

})();
