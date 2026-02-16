// ==UserScript==
// @name         comboedit.php - nav row
// @match        https://beta.rewardsbutler.com/loy/comboedit.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/comboedit.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/comboedit.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const THROTTLE_MS = 300;

  let observer = null;
  let scheduled = false;
  let observedTable = null;

  function getCurrentR() {
    const params = new URLSearchParams(location.search);
    const r = params.get('r');
    const x = r && /^\d+$/.test(r) ? parseInt(r, 10) : null;
    return x;
  }

  function normalizeSpaces(s) {
    return (s || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findUpdateComboHeaderRow() {
    // Find the <td class="formheader" colspan="2">Update Product Combo</td>
    const tds = Array.from(document.querySelectorAll('td.formheader[colspan]'));
    const td = tds.find(el => normalizeSpaces(el.textContent) === 'Update Product Combo');
    if (!td) return null;
    return td.closest('tr') || null;
  }

  function findTargetTable() {
    const headerRow = findUpdateComboHeaderRow();
    if (!headerRow) return null;
    return headerRow.closest('table');
  }

  function buildComboNavRowForComboEdit(headerRow) {
    if (!headerRow) return { ok: false, reason: 'no header row' };

    // Avoid inserting twice, but recover if nav row was removed.
    if (headerRow.dataset.rbNavInserted === '1') {
      const existingNav = headerRow.nextElementSibling;
      if (existingNav && existingNav.matches('tr[data-rb-combo-nav="1"]')) {
        return { ok: true, reason: 'already inserted' };
      }
      delete headerRow.dataset.rbNavInserted;
    }

    const r = getCurrentR();
    if (r === null) return { ok: false, reason: 'no numeric r= found in URL' };

    // Build <tr><td class="tdcenter" colspan="2"> ...nav... </td></tr>
    const navTr = document.createElement('tr');
    navTr.setAttribute('data-rb-combo-nav', '1');

    const navTd = document.createElement('td');
    navTd.className = 'tdcenter';
    navTd.colSpan = 2;
    navTd.style.whiteSpace = 'nowrap';

    // Helpers
    const makeLink = (href, text, dataAttr) => {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = text;
      if (dataAttr) a.setAttribute(dataAttr, '1');
      return a;
    };

    const makeText = (text) => document.createTextNode(text);

    const appendSep = (frag) => frag.appendChild(document.createTextNode(' | '));

    // Desired order:
    // Edit Combo (text)
    // View Products (link -> /comboproducts.php?r={X})
    // New Product
    // Upload Products
    // Product Selector
    // Calculate Amount Sold
    // Return To Combos

    const frag = document.createDocumentFragment();

    // 1) Edit Combo (plain text)
    frag.appendChild(makeText('Edit Combo'));

    // 2) View Products (link)
    appendSep(frag);
    frag.appendChild(makeLink(`/loy/comboproducts.php?r=${r}`, 'View Products', 'data-rb-view-products'));

    // 3) New Product (match comboproducts style: r=0&comboid={X})
    appendSep(frag);
    frag.appendChild(makeLink(`/loy/comboproductedit.php?r=0&comboid=${r}`, 'New Product', 'data-rb-new-product'));

    // 4) Upload Products
    appendSep(frag);
    frag.appendChild(makeLink(`/loy/twiz6uploadform.php?r=${r}`, 'Upload Products', 'data-rb-upload-products'));

    // 5) Product Selector
    appendSep(frag);
    frag.appendChild(makeLink(`/loy/productselector.php?r=0&comboid=${r}`, 'Product Selector', 'data-rb-product-selector'));

    // 6) Calculate Amount Sold (same target you used before)
    appendSep(frag);
    frag.appendChild(makeLink(`/loy/comboproducts.php?a=1&r=${r}`, 'Calculate Amount Sold', 'data-rb-calc-amount-sold'));

    // 7) Return To Combos
    appendSep(frag);
    frag.appendChild(makeLink(`/loy/combos.php`, 'Return To Combos', 'data-rb-return-combos'));

    navTd.appendChild(frag);
    navTr.appendChild(navTd);

    // Insert right after the formheader row
    headerRow.insertAdjacentElement('afterend', navTr);

    headerRow.dataset.rbNavInserted = '1';
    return { ok: true, r };
  }

  function apply() {
    const headerRow = findUpdateComboHeaderRow();
    if (!headerRow) return;

    buildComboNavRowForComboEdit(headerRow);
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      if (observer) observer.disconnect();
      try { apply(); }
      finally {
        if (observer && observedTable) observer.observe(observedTable, { childList: true, subtree: true });
      }
    }, THROTTLE_MS);
  }

  function observeTargetTable() {
    if (!observer) return false;

    const table = findTargetTable();
    if (!table) return false;
    if (observedTable === table) return true;

    observer.disconnect();
    observedTable = table;
    observer.observe(observedTable, { childList: true, subtree: true });
    return true;
  }

  function startObservingWhenReady() {
    if (observeTargetTable()) return;
    setTimeout(startObservingWhenReady, THROTTLE_MS);
  }

  // Initial run
  apply();

  // Observe DOM changes
  observer = new MutationObserver(() => {
    scheduleApply();
  });

  startObservingWhenReady();
})();
