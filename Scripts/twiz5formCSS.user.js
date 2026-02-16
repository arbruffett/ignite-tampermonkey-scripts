// ==UserScript==
// @name         twiz5form.php (CSS)
// @author       arbruffett
// @match        https://beta.rewardsbutler.com/loy/twiz5form.php*
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz5formCSS.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz5formCSS.user.js
// @run-at       document-end
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const WRAP_CLASS = 'rb-sticky-wrap';
  const DATA_TABLE_CLASS = 'rb-sticky-data';

  function tagOnce() {
    // The "frame" table row that contains the sticky nav you injected
    const navTr = document.querySelector('tr[data-rb-trigger-nav="1"]');
    if (navTr) {
      const frameTable = navTr.closest('table');
      if (frameTable) frameTable.classList.add(WRAP_CLASS);
    }

    // The real data table
    const dataTable = document.querySelector('table.basic');
    if (dataTable) dataTable.classList.add(DATA_TABLE_CLASS);

    // Keep no-nav flag in sync as nav row appears/disappears.
    if (!navTr) document.documentElement.dataset.rbNoNav = '1';
    else delete document.documentElement.dataset.rbNoNav;
  }

  GM_addStyle(`
    :root{
      --rb-top: 0px;
      --rb-nav-h: 34px;     /* adjust if your nav is taller */
      --rb-bg: #FF8D19;
      --rb-fg: #111;
      --rb-band: rgba(0,0,0,.06);
      --rb-hover: rgba(0,0,0,.10);
    }

    /* Make column 2 (Description) narrower in header and data rows */
    table.basic tr > td.formsubheader:nth-child(2),
    table.basic tr > td:nth-child(2),
    table.basic tr > th.formsubheader:nth-child(2),
    table.basic tr > th:nth-child(2) {
      max-width: 650px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* --------------------------
       Sticky COLUMN HEADERS (data table)
       -------------------------- */
    table.${DATA_TABLE_CLASS} td.formsubheader,
    table.${DATA_TABLE_CLASS} th.formsubheader{
      position: sticky;
      top: calc(var(--rb-top) + var(--rb-nav-h));
      z-index: 900;
      background: var(--rb-bg) !important;
      color: var(--rb-fg) !important;
      box-shadow: 0 1px 0 rgba(0,0,0,.12);
      white-space: nowrap;
    }

    /* If nav row doesn't exist, headers stick to the top */
    html[data-rb-no-nav="1"] table.${DATA_TABLE_CLASS} td.formsubheader,
    html[data-rb-no-nav="1"] table.${DATA_TABLE_CLASS} th.formsubheader{
      top: var(--rb-top);
    }

    /* --------------------------
       Row banding (only real data rows)
       -------------------------- */
    table.${DATA_TABLE_CLASS} tr.browse-item:nth-of-type(even) td,
    table.${DATA_TABLE_CLASS} tr.browse-item:nth-of-type(even) th{
      background: var(--rb-band);
    }

    table.${DATA_TABLE_CLASS} tr.browse-item:hover td,
    table.${DATA_TABLE_CLASS} tr.browse-item:hover th{
      background: var(--rb-hover);
    }
  `);

  tagOnce();
  window.addEventListener('DOMContentLoaded', tagOnce);
  new MutationObserver(tagOnce).observe(document.documentElement, { childList: true, subtree: true });
})();
