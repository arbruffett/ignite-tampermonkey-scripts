// ==UserScript==
// @name         combos.php (CSS)
// @match        https://beta.rewardsbutler.com/loy/combos.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/combosCSS.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/combosCSS.user.js
// @run-at       document-end
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const TABLE_CLASS = 'rb-combos-table';

  function norm(s) {
    return (s || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findCombosResultsTable() {
    // Anchor on the page header text: "Product Combos"
    const headerTd = Array.from(document.querySelectorAll('td.formheader'))
      .find(td => norm(td.textContent) === 'Product Combos');

    if (!headerTd) return null;

    // The results table is usually the table containing that header
    // We want the *outer* table that contains the listing.
    const table = headerTd.closest('table');
    return table || null;
  }

  function tagTableOnce() {
    const table = findCombosResultsTable();
    if (!table) return;

    if (!table.classList.contains(TABLE_CLASS)) {
      table.classList.add(TABLE_CLASS);
    }
  }

  GM_addStyle(`
    /* ===============================
       combos.php: Sticky Headers
       =============================== */

    /* Sticky ONLY the real column header row (not your nav row) */
    table.${TABLE_CLASS} tr:not([data-rb-trigger-nav]) > td.formsubheader:not([data-rb-nav]),
    table.${TABLE_CLASS} tr:not([data-rb-trigger-nav]) > th.formsubheader:not([data-rb-nav]) {
      position: sticky;
      top: 0;
      z-index: 30;
      background: #FF8D19;
      /* keeps header readable when scrolling */
      box-shadow: 0 1px 0 rgba(0,0,0,0.08);
      white-space: nowrap;
    }

    /* Keep the top "Product Combos" header readable */
    table.rb-combos-table td.formheader,
    table.rb-combos-table th.formheader {
      top: 1;
      background: #272727 !important;
      color: #fff !important;
    }

    /* If there are links inside headers */
    table.rb-combos-table td.formheader a,
    table.rb-combos-table th.formheader a {
      color: #fff !important;
   }

    /* ===============================
       combos.php: Row Banding (Zebra)
       =============================== */

    /* Base: ensure normal rows have a background */
    table.${TABLE_CLASS} tr td,
    table.${TABLE_CLASS} tr th {
      background: transparent;
    }

    /* Apply zebra striping to data rows.
       We exclude:
       - the page header row (formheader)
       - the nav row you injected
       - the column header row (formsubheader)
    */
    table.${TABLE_CLASS} tr:not([data-rb-trigger-nav]):not(:has(td.formheader)):not(:has(td.formsubheader)):nth-of-type(even) td,
    table.${TABLE_CLASS} tr:not([data-rb-trigger-nav]):not(:has(td.formheader)):not(:has(td.formsubheader)):nth-of-type(even) th {
      background: rgba(0,0,0,0.08);
    }

    /* Optional: subtle hover highlight for readability */
    table.${TABLE_CLASS} tr:not([data-rb-trigger-nav]):not(:has(td.formheader)):not(:has(td.formsubheader)):hover td,
    table.${TABLE_CLASS} tr:not([data-rb-trigger-nav]):not(:has(td.formheader)):not(:has(td.formsubheader)):hover th {
      background: rgba(0,0,0,0.1);
    }
  `);

  // Initial tag
  tagTableOnce();

  // If the page re-renders portions (rare on combos.php, but safe), retag
  const mo = new MutationObserver(() => tagTableOnce());
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
