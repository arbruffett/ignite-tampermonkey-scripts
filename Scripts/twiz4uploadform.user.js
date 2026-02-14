// ==UserScript==
// @name         twiz4uploadform.php
// @match        https://beta.rewardsbutler.com/loy/twiz4uploadform.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz4uploadform.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz4uploadform.user.js
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

  function findHelpTd() {
    return document.querySelector('td.help');
  }

  function updateHelpText(helpTd) {
    if (helpTd.dataset.rbHelpUpdated === '1') return;

    helpTd.textContent = 'Create a .csv file with just one card number on each line.';
    helpTd.dataset.rbHelpUpdated = '1';
  }

  function insertHeaderAndNavAboveHelp(helpTd) {
    const g = getGroupG();
    if (g === null) return;

    const helpRow = helpTd.closest('tr');
    if (!helpRow) return;

    if (helpRow.dataset.rbUploadHeaderNavInserted === '1') return;

    const tbody = helpRow.closest('tbody');
    if (!tbody) return;

    /* ---------- HEADER ROW ---------- */
    const headerTr = document.createElement('tr');
    headerTr.setAttribute('data-rb-upload-header', '1');

    const headerTd = document.createElement('td');
    headerTd.className = 'formheader';
    headerTd.colSpan = 1;
    headerTd.textContent = `Upload Members to Member Group ${g}`;

    headerTr.appendChild(headerTd);

    /* ---------- NAV ROW ---------- */
    const navTr = document.createElement('tr');
    navTr.setAttribute('data-rb-upload-nav', '1');

    const navTd = document.createElement('td');
    navTd.className = 'tdcenter';
    navTd.colSpan = 1;
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

      // Add Card Range (link)
      sep();
      const addRange = document.createElement('a');
      addRange.href = `https://beta.rewardsbutler.com/loy/twiz4range1.php?g=${g}`;
      addRange.textContent = 'Add Card Range';
      frag.appendChild(addRange);

      // Upload Members (text)
      sep();
      frag.appendChild(document.createTextNode('Upload Members'));

      // Return to Groups (link)
      sep();
      const returnGroups = document.createElement('a');
      returnGroups.href = 'https://beta.rewardsbutler.com/loy/twiz4form.php';
      returnGroups.textContent = 'Return to Groups';
      frag.appendChild(returnGroups);

    navTd.appendChild(frag);
    navTr.appendChild(navTd);

    /* ---------- INSERT ---------- */
    tbody.insertBefore(headerTr, helpRow);
    tbody.insertBefore(navTr, helpRow);

    helpRow.dataset.rbUploadHeaderNavInserted = '1';
  }

  function apply() {
    const helpTd = findHelpTd();
    if (!helpTd) return;

    updateHelpText(helpTd);
    insertHeaderAndNavAboveHelp(helpTd);
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
