// ==UserScript==
// @name         combosLocationFilter.php
// @match        https://beta.rewardsbutler.com/loy/combosLocationFilter.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/combosLocationFilter.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/combosLocationFilter.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const THROTTLE_MS = 200;

  let scheduled = false;
  let observer = null;

  function findSingleFormHeaderRow() {
    const td = document.querySelector('td.formheader');
    if (!td) return null;
    return td.closest('tr') || null;
  }

  function insertTriggerNavRowBelowHeader(headerTr) {
    if (!headerTr) return { ok: false, reason: 'no header row' };

    // Prevent duplicates across mutation reruns
    if (headerTr.dataset.rbTriggerNavInserted === '1') return { ok: true, reason: 'already inserted' };
    if (document.querySelector('tr[data-rb-trigger-nav="1"]')) {
      headerTr.dataset.rbTriggerNavInserted = '1';
      return { ok: true, reason: 'already exists' };
    }

    const headerTd = headerTr.querySelector('td, th');
    const colSpan = headerTd ? (parseInt(headerTd.getAttribute('colspan') || '2', 10) || 2) : 2;

    const navTr = document.createElement('tr');
    navTr.setAttribute('data-rb-trigger-nav', '1');

    const navTd = document.createElement('td');
    navTd.className = 'formsubheader';
    navTd.colSpan = colSpan;

    const makeLink = (href, text) => {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = text;
      return a;
    };

    const sep = () => document.createTextNode(' \u00A0|\u00A0 ');

    // Trigger Search (LINK here)
    navTd.appendChild(makeLink('prizes.php', 'Trigger Search'));
    navTd.appendChild(sep());

    // New Trigger (LINK here)
    navTd.appendChild(makeLink('prizedrill.php?r=0', 'New Trigger'));
    navTd.appendChild(sep());

    // Product Groups (TEXT here)
    navTd.appendChild(document.createTextNode('Combos'));
    navTd.appendChild(sep());

    // Remaining links
    navTd.appendChild(makeLink('twiz4form.php', 'Member Groups'));
    navTd.appendChild(sep());
    navTd.appendChild(makeLink('twiz5form.php', 'Location Groups'));

    navTr.appendChild(navTd);
    headerTr.insertAdjacentElement('afterend', navTr);

    headerTr.dataset.rbTriggerNavInserted = '1';
    return { ok: true };
  }

  function runAll() {
    const headerTr = findSingleFormHeaderRow();
    if (!headerTr) return;
    insertTriggerNavRowBelowHeader(headerTr);
  }

  function scheduleRun() {
    if (scheduled) return;
    scheduled = true;

    setTimeout(() => {
      scheduled = false;
      runAll();
    }, THROTTLE_MS);
  }

  runAll();

  observer = new MutationObserver(scheduleRun);
  observer.observe(document.documentElement, { childList: true, subtree: true });

})();
