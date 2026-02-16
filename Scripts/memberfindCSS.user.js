// ==UserScript==
// @name         memberfind.php CSS
// @description  Reusable CSS: row banding + sticky column headers
// @match        https://beta.rewardsbutler.com/loy/memberfind.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/memberfindCSS.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/memberfindCSS.user.js
// @run-at       document-end
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  function findTargetTableAndHeaderRow() {
    const headerRows = Array.from(document.querySelectorAll('tr')).filter((tr) =>
      tr.querySelector('td.formsubheader, th.formsubheader')
    );

    for (const headerTr of headerRows) {
      const table = headerTr.closest('table');
      if (!table) continue;
      const hasDataRows = !!table.querySelector('tr.browse-item');
      if (!hasDataRows) continue;
      return { table, headerTr };
    }

    return null;
  }

  const target = findTargetTableAndHeaderRow();
  if (target?.table) {
    target.table.classList.add('rb-mf-table');
  }
  if (target?.headerTr) {
    target.headerTr.dataset.rbMfHead = '1';
  }

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

/* Only band data rows in memberfind table */
table.rb-mf-table tr.browse-item:nth-child(odd){
  background: var(--rb-band-odd);
}
table.rb-mf-table tr.browse-item:nth-child(even){
  background: var(--rb-band-even);
}

/* Optional: subtle hover highlight for readability */
table.rb-mf-table tr.browse-item:hover td,
table.rb-mf-table tr.browse-item:hover th {
  background: rgba(0,0,0,0.1);
}

/* Sticky only the identified memberfind header row */
table.rb-mf-table tr[data-rb-mf-head="1"] > td.formsubheader,
table.rb-mf-table tr[data-rb-mf-head="1"] > th.formsubheader {
  position: sticky;
  top: var(--rb-sticky-top);
  z-index: 30;
  background: #FF8D19;
  box-shadow: 0 1px 0 rgba(0,0,0,0.08);
  white-space: nowrap;
}

/* =========================
   Keep formheader readable (fixes your "black -> white" reload issue)
   ========================= */
table.rb-mf-table td.formheader{
  background: #272727 !important;
  color: #fff !important;
}
`;

  const style = document.createElement('style');
  style.id = 'rb-memberfind-table-css';
  style.textContent = CSS;
  document.documentElement.appendChild(style);
})();
