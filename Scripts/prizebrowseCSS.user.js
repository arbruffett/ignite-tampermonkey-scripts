// ==UserScript==
// @name         prizebrowse.php CSS
// @description  Reusable CSS: row banding + sticky column headers
// @match        https://*.rewardsbutler.com/loy/prizebrowse.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/prizebrowseCSS.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/prizebrowseCSS.user.js
// @run-at       document-end
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const CSS = `
/* =========================
   CONFIG: tune these per site
   ========================= */
:root{
      --rb-sticky-top: 0px;         /* if the site has a fixed top bar, set to its height */
      --rb-nav-height: 25px;        /* approximate nav row height (used to avoid overlap) */
      --rb-head-height: 25px;       /* approximate header row height */
      --rb-band-odd: #f5f5f5;
      --rb-band-even: #ffffff;
    }

    /* =========================
       Row banding (ONLY data rows)
       ========================= */

    table.basic tr.browse-item:nth-of-type(odd) td {
      background-color: var(--rb-band-odd) !important;
    }

    table.basic tr.browse-item:nth-of-type(even) td {
      background-color: var(--rb-band-even) !important;
    }


    /* Hover */
    table.basic tr.browse-item:hover td {
      background-color: rgba(0,0,0,.08) !important;
    }

    /* Sticky ONLY the real column header row */
    tr:not([data-rb-trigger-nav]) > td.formsubheader:not([data-rb-nav]),
    tr:not([data-rb-trigger-nav]) > th.formsubheader:not([data-rb-nav]) {
      position: sticky;
      top: 0;
      z-index: 30;
      background: #FF8D19;
      /* keeps header readable when scrolling */
      box-shadow: 0 1px 0 rgba(0,0,0,0.08);
      white-space: nowrap;
    }

    /* =========================
       Keep formheader readable (fixes your "black -> white" reload issue)
       ========================= */
    td.formheader{
      background: #272727 !important;
      color: #fff !important;
    }
    `;

  const style = document.createElement('style');
  style.id = 'rb-shared-table-css';
  style.textContent = CSS;
  document.documentElement.appendChild(style);
})();
