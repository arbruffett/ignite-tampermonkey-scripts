// ==UserScript==
// @name         admin/userbrowse.php CSS
// @description  Reusable CSS: row banding + sticky column headers
// @match        https://*.rewardsbutler.com/admin/userbrowse.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.1
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/userbrowseCSS.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/userbrowseCSS.user.js
// @run-at       document-end
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  function norm(s) {
    return (s || "")
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[▲▼]\s*$/, "")
      .trim();
  }

  function findTargetTable() {
    const headerCells = ["Login", "Name", "Org type", "Org name", "Database", "Actions"];
    const rows = Array.from(document.querySelectorAll("tr"));
    for (const tr of rows) {
      const tds = Array.from(tr.querySelectorAll("td.formsubheader, th.formsubheader"));
      if (tds.length !== headerCells.length) continue;
      const texts = tds.map(td => norm(td.textContent));
      if (!texts.every((t, i) => t === headerCells[i])) continue;
      const table = tr.closest("table");
      if (!table) continue;
      return { table, headerTr: tr };
    }
    return null;
  }

  const target = findTargetTable();
  if (target?.table) {
    target.table.classList.add("rb-ub-table");
  }
  if (target?.headerTr) {
    target.headerTr.dataset.rbUbHead = "1";
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

/* Only band data rows in userbrowse table */
table.rb-ub-table tr.browse-item:nth-child(odd){
  background: var(--rb-band-odd);
}
table.rb-ub-table tr.browse-item:nth-child(even){
  background: var(--rb-band-even);
}

/* Optional: subtle hover highlight for readability */
table.rb-ub-table tr.browse-item:hover td,
table.rb-ub-table tr.browse-item:hover th {
  background: rgba(0,0,0,0.1);
}

/* Sticky only the identified userbrowse header row */
table.rb-ub-table tr[data-rb-ub-head="1"] > td.formsubheader,
table.rb-ub-table tr[data-rb-ub-head="1"] > th.formsubheader {
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
table.rb-ub-table td.formheader{
  background: #272727 !important;
  color: #fff !important;
}
`;

  const style = document.createElement('style');
  style.id = 'rb-shared-table-css';
  style.textContent = CSS;
  document.documentElement.appendChild(style);
})();
