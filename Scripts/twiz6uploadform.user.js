// ==UserScript==
// @name         twiz6uploadform.php
// @match        https://beta.rewardsbutler.com/loy/twiz6uploadform.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz6uploadform.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz6uploadform.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const THROTTLE_MS = 300;

  let observer = null;
  let scheduled = false;

  function getCurrentR() {
    const params = new URLSearchParams(location.search);
    const r = params.get('r');
    const x = r && /^\d+$/.test(r) ? parseInt(r, 10) : null;
    return x;
  }

  function findHelpAnchorRow() {
    // Prefer the help table; fallback to td.help
    const helpTable = document.querySelector('table.help');
    if (helpTable) {
      // Insert header/nav in the same parent table as the help block
      const tr = helpTable.closest('tr');
      return tr || null;
    }

    const helpTd = document.querySelector('td.help');
    if (helpTd) {
      const tr = helpTd.closest('tr');
      return tr || null;
    }

    return null;
  }

    function replaceHelpText() {
        // Target the <p class="help"> inside the help table
        const helpP = document.querySelector('table.help p.help') || document.querySelector('p.help');
        if (!helpP) return { ok: false, reason: 'help paragraph not found' };

        // Prevent repeated rewrites
        if (helpP.dataset.rbHelpRewritten === '1') return { ok: true, reason: 'already rewritten' };

        const headers = [
            'Product Code',
            'Product Name',
            'Code Type',
            'Wholesale Cost',
            'Cost Per Point',
            'Vendor ID',
            'Purpose',
            'OrgTree Type',
            'OrgTree Id',
            'Product Code Modifiers',
            'Selling Units'
        ];

        // TSV (tab-separated) is best for pasting into Excel columns
        const tsv = headers.join('\t');

        // Build new help UI
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'text-align:left; max-width:900px; margin:0 auto;';

        wrapper.innerHTML = `
    <ol style="margin:0; padding-left:20px;">
      <li>Open a new worksheet in Excel</li>
      <li>
        Add the following headers (1 per column). Spelling is important.
        <div style="margin:8px 0 4px 0;">
          <textarea readonly
            style="width:100%; min-height:58px; font-family:monospace; font-size:12px; padding:8px; box-sizing:border-box;"
            onclick="this.select()"
          >${tsv}</textarea>
          <div style="font-size:11px; opacity:0.8;">
            Tip: Click inside the box, press Ctrl+C, then paste into Excel (it will fill columns).
          </div>
        </div>
      </li>
      <li>
        Add your products below.
        <ul style="margin:6px 0 0 0; padding-left:18px;">
          <li>Only <b>Product Code</b> is required</li>
          <li><b>UPCA</b> will be inserted for blank Code Types</li>
        </ul>
      </li>
      <li>Save the file as a CSV</li>
    </ol>
  `;

        // Replace existing help paragraph content
        helpP.textContent = '';
        helpP.appendChild(wrapper);

        helpP.dataset.rbHelpRewritten = '1';
        return { ok: true };
    }

  function buildFormHeaderAboveHelp(helpRow) {
    if (!helpRow) return { ok: false, reason: 'no help row' };

    // If we already inserted, return it
    const existing = helpRow.parentElement?.querySelector('tr[data-rb-upload-formheader="1"]');
    if (existing) return { ok: true, headerRow: existing, reason: 'already exists' };

    const r = getCurrentR();
    if (r === null) return { ok: false, reason: 'no numeric r= found in URL' };

    // Determine colspan: use the help row's first cell colspan if present; else 2.
    const firstCell = helpRow.querySelector('td, th');
    const colSpan = firstCell ? (parseInt(firstCell.getAttribute('colspan') || '2', 10) || 2) : 2;

    const headerTr = document.createElement('tr');
    headerTr.setAttribute('data-rb-upload-formheader', '1');

    const headerTd = document.createElement('td');
    headerTd.className = 'formheader';
    headerTd.colSpan = colSpan;

    headerTd.textContent = `Upload A CSV to Combo ${r}`;

    headerTr.appendChild(headerTd);

    // Insert header right above help row
    helpRow.insertAdjacentElement('beforebegin', headerTr);

    return { ok: true, headerRow: headerTr, r };
  }

  function insertNavRowUnderHeader(headerRow) {
    if (!headerRow) return { ok: false, reason: 'no header row' };

    // Prevent duplicates across mutation reruns while allowing recovery if nav was removed.
    if (headerRow.dataset.rbNavInserted === '1') {
      const existingNav = headerRow.nextElementSibling;
      if (existingNav && existingNav.matches('tr[data-rb-combo-nav="1"]')) {
        return { ok: true, reason: 'already inserted' };
      }
      delete headerRow.dataset.rbNavInserted;
    }

    const r = getCurrentR();
    if (r === null) return { ok: false, reason: 'no numeric r= found in URL' };

    const colSpan = parseInt(headerRow.querySelector('td, th')?.getAttribute('colspan') || '2', 10) || 2;

    const navTr = document.createElement('tr');
    navTr.setAttribute('data-rb-combo-nav', '1');

    const navTd = document.createElement('td');
    navTd.className = 'tdcenter';
    navTd.colSpan = colSpan;
    navTd.style.whiteSpace = 'nowrap';

    const makeLink = (href, text, dataAttr) => {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = text;
      if (dataAttr) a.setAttribute(dataAttr, '1');
      return a;
    };

    const appendSep = (frag) => frag.appendChild(document.createTextNode(' | '));

    // Order:
    // Edit Combo
    // View Products
    // New Product
    // Upload Products (TEXT here)
    // Product Selector
    // Calculate Amount Sold
    // Return To Combos

    const frag = document.createDocumentFragment();

    frag.appendChild(
      makeLink(`/loy/comboedit.php?r=${r}`, 'Edit Combo', 'data-rb-edit-combo')
    );

    appendSep(frag);
    frag.appendChild(
      makeLink(`/loy/comboproducts.php?r=${r}`, 'View Products', 'data-rb-view-products')
    );

    appendSep(frag);
    frag.appendChild(
      makeLink(`/loy/comboproductedit.php?r=0&comboid=${r}`, 'New Product', 'data-rb-new-product')
    );

    // Upload Products (plain text on this page)
    appendSep(frag);
    frag.appendChild(document.createTextNode('Upload Products'));

    appendSep(frag);
    frag.appendChild(
      makeLink(`/loy/productselector.php?r=0&comboid=${r}`, 'Product Selector', 'data-rb-product-selector')
    );

    appendSep(frag);
    frag.appendChild(
      makeLink(`/loy/comboproducts.php?a=1&r=${r}`, 'Calculate Amount Sold', 'data-rb-calc-amount-sold')
    );

    appendSep(frag);
    frag.appendChild(
      makeLink(`/loy/combos.php`, 'Return To Combos', 'data-rb-return-combos')
    );

    navTd.appendChild(frag);
    navTr.appendChild(navTd);

    headerRow.insertAdjacentElement('afterend', navTr);

    headerRow.dataset.rbNavInserted = '1';
    return { ok: true, r };
  }

  function apply() {
    const helpRow = findHelpAnchorRow();
    if (!helpRow) return;

    replaceHelpText();

    const headerRes = buildFormHeaderAboveHelp(helpRow);
    if (!headerRes.ok || !headerRes.headerRow) return;

    insertNavRowUnderHeader(headerRes.headerRow);
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

  // Initial run
  apply();

  // Observe DOM changes
  observer = new MutationObserver(() => {
    scheduleApply();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
