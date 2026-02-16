// ==UserScript==
// @name         twiz5edit.php
// @match        https://beta.rewardsbutler.com/loy/twiz5edit.php?id=*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz5edit.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz5edit.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const THROTTLE_MS = 250;
  let observer = null;
  let scheduled = false;

  function getId() {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    return id && /^\d+$/.test(id) ? parseInt(id, 10) : null;
  }

  function findHeaderCell() {
    // Anchor under the existing formheader (colspan=2 in your HTML)
    return document.querySelector('td.formheader, th.formheader, .formheader');
  }

  function insertNavBarUnderHeader(headerEl) {
    const id = getId();
    if (id === null) return { ok: false, reason: 'no numeric id= found in URL' };

    const headerRow = headerEl.closest('tr');
    if (!headerRow) return { ok: false, reason: 'header row not found' };

    if (headerEl.dataset.rbTwiz5NavInserted === '1') {
      const existingNav = headerRow.nextElementSibling;
      if (existingNav && existingNav.matches('tr[data-rb-twiz5edit-nav="1"]')) {
        return { ok: true, reason: 'already inserted' };
      }
      delete headerEl.dataset.rbTwiz5NavInserted;
    }

    const navTr = document.createElement('tr');
    navTr.setAttribute('data-rb-twiz5edit-nav', '1');

    const navTd = document.createElement('td');
    navTd.className = 'tdcenter';
    navTd.setAttribute('colspan', headerEl.getAttribute('colspan') || '2');
    navTd.style.whiteSpace = 'nowrap';

    const frag = document.createDocumentFragment();
    const sep = () => frag.appendChild(document.createTextNode(' | '));

    // Description (text)
    frag.appendChild(document.createTextNode('Description'));

    // Location List (link)
    sep();
    const locList = document.createElement('a');
    locList.href = `https://beta.rewardsbutler.com/loy/twiz5locations.php?g=${id}`;
    locList.textContent = 'Location List';
    frag.appendChild(locList);

    // Add Location (link)
    sep();
    const addLoc = document.createElement('a');
    addLoc.href = `https://beta.rewardsbutler.com/loy/twiz5add1.php?g=${id}`;
    addLoc.textContent = 'Add Location';
    frag.appendChild(addLoc);

    // Check List (link)
    sep();
    const checkList = document.createElement('a');
    checkList.href = `https://beta.rewardsbutler.com/loy/twiz5addmany.php?g=${id}`;
    checkList.textContent = 'Check List';
    frag.appendChild(checkList);

    // Return to Location group (link)
    sep();
    const ret = document.createElement('a');
    ret.href = `https://beta.rewardsbutler.com/loy/twiz5form.php`;
    ret.textContent = 'Return to Location Groups';
    frag.appendChild(ret);

    navTd.appendChild(frag);
    navTr.appendChild(navTd);

    // Insert directly beneath the formheader row
    headerRow.insertAdjacentElement('afterend', navTr);

    headerEl.dataset.rbTwiz5NavInserted = '1';
    return { ok: true, id };
  }

  function apply() {
    const headerEl = findHeaderCell();
    if (!headerEl) return;
    insertNavBarUnderHeader(headerEl);
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
