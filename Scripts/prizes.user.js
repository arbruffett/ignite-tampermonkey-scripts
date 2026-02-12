// ==UserScript==
// @name         prizes.php
// @match        https://beta.rewardsbutler.com/loy/prizes.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/prizes.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/prizes.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const THROTTLE_MS = 200;

  const SELECT2_WIDTH_IF_100 = 120; // if inline style is width: 100%;
  const SELECT2_MAX_WIDTH_PX = 441; // cap any inline px width at 450px

  let scheduled = false;
  let pageObserver = null;

  // Cache the target table so it still works after we remove the trigger link row
  let cachedPrizesTable = null;


  /* ================= UTIL ================= */

  function findTriggerLink() {
    return document.querySelector(
      'a[href="prizeedit.php?r=0"], a[href^="prizeedit.php?r=0&"], a[href*="prizeedit.php?r=0"]'
    );
  }

  function getPrizesTable() {
    if (cachedPrizesTable && document.contains(cachedPrizesTable)) return cachedPrizesTable;

    // Before replacement: locate via the trigger link row
    const triggerLink = findTriggerLink();
    if (triggerLink) {
      const tr = triggerLink.closest('tr');
      const table = tr && tr.closest('table');
      if (table) {
        cachedPrizesTable = table;
        return table;
      }
    }

    // After replacement: locate via the row we inserted
    const insertedRow = document.querySelector('tr[data-rb-inserted="1"]');
    if (insertedRow) {
      const table = insertedRow.closest('table');
      if (table) {
        cachedPrizesTable = table;
        return table;
      }
    }

    return null;
  }

  /* ================= REMOVE SEARCH HINT ROW ================= */

  function removeSearchHintRow() {
    const rows = document.querySelectorAll('tr > td.formsubheader');
    rows.forEach(td => {
      const text = td.textContent.replace(/\s+/g, ' ').trim();
      if (text === '(or fill in the form below to search for triggers)') {
        const tr = td.closest('tr');
        if (tr) tr.remove();
      }
    });
  }

    /* ================= REMOVE TRIGGER WIZARD MENU ROW ================= */

    function removeTriggerWizardMenuRow() {
        // Remove any formsubheader row that contains the "Trigger wizard menu" link
        document.querySelectorAll('td.formsubheader[colspan="2"] a[href="twizmenu.php"]').forEach(a => {
            const tr = a.closest('tr');
            if (tr) tr.remove();
        });
    }

    /* ================= REMOVE CREATE TRIGGER ROW ================= */

    function removeCreateTriggerRow() {
        // Remove the specific row whose link text is "Create Organization Wide Trigger"
        document
            .querySelectorAll('td.formsubheader[colspan="2"] a[href="prizedrill.php?r=0"]')
            .forEach(a => {
            const linkText = (a.textContent || '').replace(/\s+/g, ' ').trim();
            if (linkText !== 'Create Organization Wide Trigger') return;

            const tr = a.closest('tr');
            if (tr) tr.remove();
        });
    }

  /* ================= REPLACE ROW ================= */

  function replaceRow() {
    // Find the specific link in the row we want to replace
    const triggerLink = findTriggerLink();
    if (!triggerLink) return false;

    const trOld = triggerLink.closest('tr');
    if (!trOld) return false;

    // Prevent duplicate insertion if we already did this
    if (trOld.dataset.rbReplaced === '1') return false;

    const tbody = trOld.parentElement;
    if (!tbody) return false;

    // Cache the table BEFORE we remove the old row
    const table = trOld.closest('table');
    if (table) cachedPrizesTable = table;

    // Create new row
    const trNew = document.createElement('tr');
    trNew.dataset.rbInserted = '1';

    const td = document.createElement('td');
    td.className = 'formsubheader';
    td.colSpan = 2;

    const aCreate = document.createElement('a');
    aCreate.href = 'prizedrill.php?r=0';
    aCreate.textContent = 'New Trigger';

    const aProduct = document.createElement('a');
    aProduct.href = 'combosLocationFilter.php';
    aProduct.textContent = 'Combos';

    const aMember = document.createElement('a');
    aMember.href = 'twiz4form.php';
    aMember.textContent = 'Member Groups';

    const aLocation = document.createElement('a');
    aLocation.href = 'twiz5form.php';
    aLocation.textContent = 'Location Groups';

    // Add spacing between links
    td.appendChild(document.createTextNode('Trigger Search'));
    td.appendChild(document.createTextNode(' \u00A0|\u00A0 '));
    td.appendChild(aCreate);
    td.appendChild(document.createTextNode(' \u00A0|\u00A0 '));
    td.appendChild(aProduct);
    td.appendChild(document.createTextNode(' \u00A0|\u00A0 '));
    td.appendChild(aMember);
    td.appendChild(document.createTextNode(' \u00A0|\u00A0 '));
    td.appendChild(aLocation);

    trNew.appendChild(td);

    // Insert new row after old row
    if (trOld.nextSibling) {
      tbody.insertBefore(trNew, trOld.nextSibling);
    } else {
      tbody.appendChild(trNew);
    }

    // Mark old row and remove it
    trOld.dataset.rbReplaced = '1';
    trOld.remove();

    return true;
  }

  /* ================= SELECT2 CONTAINER WIDTHS (IN TARGET TABLE ONLY) ================= */

  function clampSelect2ContainersInPrizesTable() {
    const table = getPrizesTable();
    if (!table) return;

    const containers = table.querySelectorAll('.select2-container');

    containers.forEach(container => {
      // Only consider inline style width (what you described)
      const inlineWidth = (container.style.width || '').trim(); // e.g. "559px" or "100%"

      if (inlineWidth === '100%') {
        // ✅ Rule: width:100% -> set to 150px
        container.style.width = SELECT2_WIDTH_IF_100 + 'px';
        container.style.maxWidth = SELECT2_MAX_WIDTH_PX + 'px';
        container.style.boxSizing = 'border-box';
      } else if (inlineWidth.endsWith('px')) {
        // ✅ Rule: px width -> cap at 450
        const n = parseFloat(inlineWidth);
        if (Number.isFinite(n) && n > SELECT2_MAX_WIDTH_PX) {
          container.style.width = SELECT2_MAX_WIDTH_PX + 'px';
        }
        container.style.maxWidth = SELECT2_MAX_WIDTH_PX + 'px';
        container.style.boxSizing = 'border-box';
      } else {
        // No inline width -> leave it alone, but prevent runaway growth
        container.style.maxWidth = SELECT2_MAX_WIDTH_PX + 'px';
        container.style.boxSizing = 'border-box';
      }

      // Keep select2's visible choice aligned with container width
      const choice = container.querySelector('.select2-choice');
      if (choice) {
        choice.style.width = '100%';
        choice.style.boxSizing = 'border-box';
      }
    });
  }

  function observeSelect2ContainersInPrizesTableOnce() {
    const table = getPrizesTable();
    if (!table) return;

    if (table.hasAttribute('data-rb-select2-container-observed')) return;
    table.setAttribute('data-rb-select2-container-observed', '1');

    const mo = new MutationObserver(() => {
      if (window.__rbSelect2ContainerRAF) cancelAnimationFrame(window.__rbSelect2ContainerRAF);
      window.__rbSelect2ContainerRAF = requestAnimationFrame(clampSelect2ContainersInPrizesTable);
    });

    // Watch only inside the table (scoped), including inline style changes.
    mo.observe(table, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    // Initial clamp
    clampSelect2ContainersInPrizesTable();
  }

    function normalizeLabelText(s) {
        return (s || '').replace(/\s+/g, ' ').trim().replace(/:$/, '').toLowerCase();
    }

  /* ================= THROTTLED RUNNER ================= */

  function runAll() {
    try {
      replaceRow();
      removeSearchHintRow();
      removeTriggerWizardMenuRow();
      removeCreateTriggerRow();
      observeSelect2ContainersInPrizesTableOnce();
      clampSelect2ContainersInPrizesTable();
    } catch (e) {
      /* ignore */
    }
  }

  function scheduleRun() {
    if (scheduled) return;
    scheduled = true;

    setTimeout(() => {
      scheduled = false;
      runAll();
    }, THROTTLE_MS);
  }

  /* ================= EXECUTION ================= */

  // Run once immediately
  runAll();

  // Watch for dynamic page updates (throttled)
  pageObserver = new MutationObserver(scheduleRun);
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });

})();
