// ==UserScript==
// @name         twiz4range1.php
// @match        https://beta.rewardsbutler.com/loy/twiz4range1.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.1
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz4range1.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz4range1.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const THROTTLE_MS = 250;
  let observer = null;
  let scheduled = false;

  function getGroupG() {
    const params = new URLSearchParams(location.search);
    const g = params.get('g');
    return g && /^\d+$/.test(g) ? parseInt(g, 10) : null;
  }

  function findHeaderCell() {
    // There is only one on this page, per your note.
    return document.querySelector('td.formheader, th.formheader, .formheader');
  }

  function insertNavBarUnderHeader(headerEl) {
    const g = getGroupG();
    if (g === null) return { ok: false, reason: 'no numeric g= found in URL' };

    const headerRow = headerEl.closest('tr');
    const container = headerRow && (headerRow.closest('tbody') || headerRow.closest('table'));
    if (!headerRow || !container) return { ok: false, reason: 'could not locate header row/container' };

    // Avoid duplicates across mutations, but recover if nav row was removed.
    if (headerEl.dataset.rbNavInserted === '1') {
      const existingNav = headerRow.nextElementSibling;
      if (existingNav && existingNav.matches('tr[data-rb-range-nav="1"]')) {
        return { ok: true, reason: 'already inserted' };
      }
      delete headerEl.dataset.rbNavInserted;
    }

    const navTr = document.createElement('tr');
    navTr.setAttribute('data-rb-range-nav', '1');

    const navTd = document.createElement('td');
    navTd.className = 'tdcenter';
    navTd.setAttribute('colspan', headerEl.getAttribute('colspan') || '4');
    navTd.style.whiteSpace = 'nowrap';

    const frag = document.createDocumentFragment();
    const sep = () => frag.appendChild(document.createTextNode(' | '));

    // Member Group (link to edit page)
    const memberGroup = document.createElement('a');
    memberGroup.href = `https://beta.rewardsbutler.com/loy/twiz4edit.php?id=${g}`;
    memberGroup.textContent = 'Member Group';
    frag.appendChild(memberGroup);

    // Member List (link)
    sep();
    const memberList = document.createElement('a');
    memberList.href = `https://beta.rewardsbutler.com/loy/twiz4members.php?g=${g}`;
    memberList.textContent = 'Member List';
    frag.appendChild(memberList);

    // Add Member (link)
    sep();
    const addMember = document.createElement('a');
    addMember.href = `https://beta.rewardsbutler.com/loy/members.php?g=${g}&goto=twiz4memberadd.php`;
    addMember.textContent = 'Add Member';
    frag.appendChild(addMember);

    // Add Card Range (text)
    sep();
    frag.appendChild(document.createTextNode('Add Card Range'));

    // Upload Members (link)
    sep();
    const upload = document.createElement('a');
    upload.href = `https://beta.rewardsbutler.com/loy/twiz4uploadform.php?g=${g}`;
    upload.textContent = 'Upload Members';
    frag.appendChild(upload);

    // Return to Groups (link)
    sep();
    const returnGroups = document.createElement('a');
    returnGroups.href = `https://beta.rewardsbutler.com/loy/twiz4form.php`;
    returnGroups.textContent = 'Return to Groups';
    frag.appendChild(returnGroups);

    navTd.appendChild(frag);
    navTr.appendChild(navTd);

    // Insert directly under the formheader row
    headerRow.insertAdjacentElement('afterend', navTr);

    headerEl.dataset.rbNavInserted = '1';
    return { ok: true, g };
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
