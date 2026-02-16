// ==UserScript==
// @name         comboproductedit.php?r=0
// @match        https://beta.rewardsbutler.com/loy/comboproductedit.php?r=0*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.1
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/newcomboproductedit.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/newcomboproductedit.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const THROTTLE_MS = 300;

  let observer = null;
  let scheduled = false;

  function getComboId() {
    const params = new URLSearchParams(location.search);
    const c = params.get('comboid');
    const x = c && /^\d+$/.test(c) ? parseInt(c, 10) : null;
    return x;
  }

  function findFormHeaderRow() {
    // On this page there is only one .formheader row; do NOT match by its text.
    const td = document.querySelector('td.formheader');
    if (!td) return null;
    return td.closest('tr') || null;
  }

  function insertNavRowUnderHeader(headerRow) {
    if (!headerRow) return { ok: false, reason: 'no header row' };

    // Prevent duplicate insertion during mutation runs, but recover if nav row was removed.
    if (headerRow.dataset.rbNavInserted === '1') {
      const existingNav = headerRow.nextElementSibling;
      if (existingNav && existingNav.matches('tr[data-rb-combo-nav="1"]')) {
        return { ok: true, reason: 'already inserted' };
      }
      delete headerRow.dataset.rbNavInserted;
    }

    const comboid = getComboId();
    if (comboid === null) return { ok: false, reason: 'no numeric comboid= found in URL' };

    // Determine colspan from the header cell (usually 2)
    const headerTd = headerRow.querySelector('td, th');
    const colSpan = headerTd ? (parseInt(headerTd.getAttribute('colspan') || '2', 10) || 2) : 2;

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

    // Desired order (consistent nav):
    // Edit Combo
    // View Products
    // New Product (TEXT on this page)
    // Upload Products
    // Product Selector
    // Calculate Amount Sold
    // Return To Combos

    const frag = document.createDocumentFragment();

    // Edit Combo (link)
    frag.appendChild(
      makeLink(`/loy/comboedit.php?r=${comboid}`, 'Edit Combo', 'data-rb-edit-combo')
    );

    // View Products (link) -> note uses r={X} on comboproducts.php, sourced from comboid
    appendSep(frag);
    frag.appendChild(
      makeLink(`/loy/comboproducts.php?r=${comboid}`, 'View Products', 'data-rb-view-products')
    );

    // New Product (plain text here)
    appendSep(frag);
    frag.appendChild(document.createTextNode('New Product'));

    // Upload Products
    appendSep(frag);
    frag.appendChild(
      makeLink(`/loy/twiz6uploadform.php?r=${comboid}`, 'Upload Products', 'data-rb-upload-products')
    );

    // Product Selector
    appendSep(frag);
    frag.appendChild(
      makeLink(`/loy/productselector.php?r=0&comboid=${comboid}`, 'Product Selector', 'data-rb-product-selector')
    );

    // Calculate Amount Sold
    appendSep(frag);
    frag.appendChild(
      makeLink(`/loy/comboproducts.php?a=1&r=${comboid}`, 'Calculate Amount Sold', 'data-rb-calc-amount-sold')
    );

    // Return To Combos
    appendSep(frag);
    frag.appendChild(
      makeLink(`/loy/combos.php`, 'Return To Combos', 'data-rb-return-combos')
    );

    navTd.appendChild(frag);
    navTr.appendChild(navTd);

    // Insert right under the formheader row
    headerRow.insertAdjacentElement('afterend', navTr);

    headerRow.dataset.rbNavInserted = '1';
    return { ok: true, comboid };
  }

  function apply() {
    const headerRow = findFormHeaderRow();
    if (!headerRow) return;
    insertNavRowUnderHeader(headerRow);
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
