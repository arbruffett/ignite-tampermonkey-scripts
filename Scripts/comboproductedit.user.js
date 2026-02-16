// ==UserScript==
// @name         comboproductedit.php
// @version      1.6
// @description  Removes unwanted rows and reorders/switches layout for checkdigit row
// @match        https://beta.rewardsbutler.com/loy/comboproductedit.php*
// @run-at       document-idle
// @connect      *.rewardsbutler.com
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/comboproductedit.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/comboproductedit.user.js
// ==/UserScript==

(function () {
  'use strict';

    const REMOVE_LABELS = [
        'Any POS Code Modifier :',
        'Selling Units Qty :',
        'Description :',
        'Wholesale Cost :',
        'Cost Per Point :',
        'Vendor :',
        'Purpose :'
    ];

    // Rows to toggle via "Level" dropdown (label must match the left cell text)
    const LEVEL_CONFIG = {
        rows: [
            { label: 'Location :', value: 'Location' },
            { label: 'Agency :', value: 'Agency' },
            { label: 'Consultant :', value: 'Consultant' },
            { label: 'Parent co :', value: 'Parent Company' },
            { label: 'DBA :', value: 'DBA' },
            { label: 'Industry :', value: 'Industry' }
        ],
        defaultValue: 'Parent Company',
        placeholderLabel: 'Level :',
        placeholderRowAttr: 'data-rb-level-placeholder',
        rowTagAttr: 'data-rb-managed'
    };

    const PRODUCT_CODE_LABEL = 'Product code :';
    const PRODUCT_NAME_LABEL = 'Product name :';


    const CODE_TYPE_LABEL = 'Code type :';

    const SWAP_LABEL =
          'Disable automatic checkdigit computation(Radiant) :';

    function normalize(text) {
        return (text || '').replace(/\s+/g, ' ').trim();
    }

    function processRows() {
        const rows = document.querySelectorAll('tr');

        for (const tr of rows) {
            const tds = tr.querySelectorAll('td');
            if (tds.length !== 2) continue;

            const labelText = normalize(tds[0].textContent);

            if (REMOVE_LABELS.includes(labelText)) {
                tr.style.display = 'none';
                continue;
            }

            if (labelText === SWAP_LABEL) {
                const [labelTd, valueTd] = tds;
                const tmp = labelTd.className;
                labelTd.className = valueTd.className;
                valueTd.className = tmp;
                tr.insertBefore(valueTd, labelTd);
                continue;
            }

            if (labelText === CODE_TYPE_LABEL) {
                const select2 = tr.querySelector('.select2-container');
                if (select2) select2.style.width = '40%';
            }

            if (labelText === PRODUCT_CODE_LABEL) {
                const input = tds[1].querySelector('input[type="text"]');
                if (input) input.size = 13;
            }

            if (labelText === PRODUCT_NAME_LABEL) {
                const input = tds[1].querySelector('input[type="text"]');
                if (input) input.size = 34;
            }
        }

        const pcrInput = document.querySelector('#pcruntotal');
        if (pcrInput) {
            const tr = pcrInput.closest('tr');
            if (tr) tr.remove();
        }
    }

    function normLower(text) {
        return normalize(text).toLowerCase();
    }

    function tagManagedRows() {
        const labelMap = new Map(
            LEVEL_CONFIG.rows.map(r => [normLower(r.label), r.value])
        );

        document.querySelectorAll('tr').forEach(tr => {
            const tds = tr.querySelectorAll('td');
            if (tds.length !== 2) return;

            const label = normLower(tds[0].textContent);
            const value = labelMap.get(label);
            if (value) tr.setAttribute(LEVEL_CONFIG.rowTagAttr, value);
        });
    }

    function findFirstManagedRow() {
        return document.querySelector(`tr[${LEVEL_CONFIG.rowTagAttr}]`);
    }

    function insertLevelDropdownRow() {
        // Prevent duplicates
        if (document.querySelector(`tr[${LEVEL_CONFIG.placeholderRowAttr}="1"]`)) return;

        const firstManaged = findFirstManagedRow();
        if (!firstManaged) return;

        const tbody = firstManaged.parentElement;
        if (!tbody) return;

        const tr = document.createElement('tr');
        tr.setAttribute(LEVEL_CONFIG.placeholderRowAttr, '1');

        const tdLeft = document.createElement('td');
        tdLeft.className = 'justright';
        tdLeft.textContent = LEVEL_CONFIG.placeholderLabel;

        const tdRight = document.createElement('td');
        tdRight.className = 'justleft';

        const select = document.createElement('select');
        select.name = 'rbLevelSelect';
        select.style.minWidth = '200px';

        LEVEL_CONFIG.rows.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.value;
            opt.textContent = r.value;
            select.appendChild(opt);
        });

        select.value = LEVEL_CONFIG.defaultValue;

        tdRight.appendChild(select);
        tr.appendChild(tdLeft);
        tr.appendChild(tdRight);

        tbody.insertBefore(tr, firstManaged);
    }

    function applyLevelVisibility(selectedValue) {
        // Hide all managed rows
        document.querySelectorAll(`tr[${LEVEL_CONFIG.rowTagAttr}]`).forEach(tr => {
            tr.style.display = 'none';
        });

        // Show selected
        const rowToShow = document.querySelector(
            `tr[${LEVEL_CONFIG.rowTagAttr}="${CSS.escape(selectedValue)}"]`
        );
        if (rowToShow) rowToShow.style.display = '';
    }

    function attachLevelWatcherOnce() {
        const select = document.querySelector('select[name="rbLevelSelect"]');
        if (!select) return;

        if (select.dataset.rbWatcherAttached === '1') return;
        select.dataset.rbWatcherAttached = '1';

        select.addEventListener('change', () => {
            applyLevelVisibility(select.value);
        });

        // Apply immediately
        applyLevelVisibility(select.value);
    }

    function initLevelToggleOnce() {
        // If already initialized, do nothing (prevents Select2-triggered resets)
        if (document.documentElement.dataset.rbLevelInitialized === '1') return;
        document.documentElement.dataset.rbLevelInitialized = '1';

        tagManagedRows();
        insertLevelDropdownRow();

        // Tag again in case DOM shifted
        tagManagedRows();

        // Initial state: show default
        applyLevelVisibility(LEVEL_CONFIG.defaultValue);

        attachLevelWatcherOnce();
    }

  // Initial run
  processRows();
  initLevelToggleOnce();

  // Observe DOM changes (AJAX / Select2 re-rendering)
  const observer = new MutationObserver(() => {
    processRows();
    tagManagedRows();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
