// ==UserScript==
// @name         comboproducts.php CSS
// @description  Reusable CSS: row banding + sticky column headers
// @match        https://beta.rewardsbutler.com/loy/comboproducts.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/comboproductsCSS.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/comboproductsCSS.user.js
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
  --rb-band-odd: rgba(0,0,0,.05);
  --rb-band-even: rgba(0,0,0,.00);
}

/* =========================
   Row banding
   =========================
   Only bands "data rows" (skips obvious header-ish rows).
   We do banding by applying it broadly to tbody > tr and then
   neutralizing header-like rows below.
*/
tbody > tr:nth-child(odd){
  background: var(--rb-band-odd);
}
tbody > tr:nth-child(even){
  background: var(--rb-band-even);
}

    /* Don’t band form headers/subheaders/section rows */
    tr:has(td.formheader),
    tr:has(td.formsubheader),
    tr:has(td.formsection){
    background: transparent !important;
  }

    /* Optional: subtle hover highlight for readability */
    tr:not([data-rb-trigger-nav]):not(:has(td.formheader)):not(:has(td.formsubheader)):hover td,
    tr:not([data-rb-trigger-nav]):not(:has(td.formheader)):not(:has(td.formsubheader)):hover th {
      background: rgba(0,0,0,0.1);
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
