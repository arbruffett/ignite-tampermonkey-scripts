// ==UserScript==
// @name         productselector.php
// @match        https://beta.rewardsbutler.com/loy/productselector.php?r=0&comboid=*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.2
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/productselector.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/productselector.user.js
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

  function alreadyInserted() {
    return !!document.querySelector('tr[data-rb-ps-formheader="1"]');
  }

  function findAnchorRow() {
    // Use stable UI elements
    const anchor = document.querySelector('#search-input') ||
                   document.querySelector('#save-button') ||
                   document.querySelector('#category-list');

    if (!anchor) return null;

    const td = anchor.closest('td');
    if (!td) return null;

    const tr = td.closest('tr');
    if (!tr) return null;

    // IMPORTANT: ignore any rows we injected (or rows inside them)
    if (tr.matches('[data-rb-ps-formheader], [data-rb-combo-nav]')) return null;
    if (tr.querySelector('[data-rb-ps-formheader], [data-rb-combo-nav]')) return null;

    return { td, tr };
  }

  function buildFormHeaderAbove(anchorTr) {
    const comboId = getComboId();
    if (comboId === null) return { ok: false, reason: 'no numeric comboid= in URL' };

    const firstCell = anchorTr.querySelector('td, th');
    const colSpan = firstCell ? (parseInt(firstCell.getAttribute('colspan') || '2', 10) || 2) : 2;

    const headerTr = document.createElement('tr');
    headerTr.setAttribute('data-rb-ps-formheader', '1');

    const headerTd = document.createElement('td');
    headerTd.className = 'formheader';
    headerTd.colSpan = colSpan;
    headerTd.textContent = `Product Selector for Combo ${comboId}`;

    headerTr.appendChild(headerTd);

    anchorTr.insertAdjacentElement('beforebegin', headerTr);

    return { ok: true, headerRow: headerTr, comboId };
  }

  function insertNavRowUnderHeader(headerRow) {
    const comboId = getComboId();
    if (comboId === null) return { ok: false, reason: 'no numeric comboid= in URL' };

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

    const sep = () => document.createTextNode(' | ');

    const frag = document.createDocumentFragment();

    frag.appendChild(makeLink(`/loy/comboedit.php?r=${comboId}`, 'Edit Combo', 'data-rb-edit-combo'));
    frag.appendChild(sep());
    frag.appendChild(makeLink(`/loy/comboproducts.php?r=${comboId}`, 'View Products', 'data-rb-view-products'));
    frag.appendChild(sep());
    frag.appendChild(makeLink(`/loy/comboproductedit.php?r=0&comboid=${comboId}`, 'New Product', 'data-rb-new-product'));
    frag.appendChild(sep());
    frag.appendChild(makeLink(`/loy/twiz6uploadform.php?r=${comboId}`, 'Upload Products', 'data-rb-upload-products'));
    frag.appendChild(sep());
    frag.appendChild(document.createTextNode('Product Selector'));
    frag.appendChild(sep());
    frag.appendChild(makeLink(`/loy/comboproducts.php?a=1&r=${comboId}`, 'Calculate Amount Sold', 'data-rb-calc-amount-sold'));
    frag.appendChild(sep());
    frag.appendChild(makeLink(`/loy/combos.php`, 'Return To Combos', 'data-rb-return-combos'));

    navTd.appendChild(frag);
    navTr.appendChild(navTd);

    headerRow.insertAdjacentElement('afterend', navTr);

    return { ok: true, comboId };
  }

  function apply() {
    // Global guard: if we already inserted once, do nothing
    if (alreadyInserted()) return;

    const found = findAnchorRow();
    if (!found) return;

    const headerRes = buildFormHeaderAbove(found.tr);
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

  apply();

  observer = new MutationObserver(() => scheduleApply());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
