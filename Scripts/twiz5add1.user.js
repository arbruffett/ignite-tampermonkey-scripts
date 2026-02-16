// ==UserScript==
// @name         twiz5add1.php
// @match        https://beta.rewardsbutler.com/loy/twiz5add1.php?g=*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.1
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz5add1.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/twiz5add1.user.js
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
        // Use the existing formheader (colspan=2 per your HTML)
        return document.querySelector('td.formheader, th.formheader, .formheader');
    }

    function cleanTwiz5AddLocationHeader(headerEl) {
        if (!headerEl || headerEl.dataset.rbHeaderCleaned === '1') return;

        const br = headerEl.querySelector('br');
        if (!br) return;

        // Remove <br> and everything after it
        let node = br;
        while (node) {
            const next = node.nextSibling;
            node.remove();
            node = next;
        }

        headerEl.dataset.rbHeaderCleaned = '1';
    }


    function insertNavBarUnderHeader(headerEl) {
        const g = getGroupG();
        if (g === null) return { ok: false, reason: 'no numeric g= found in URL' };

        const headerRow = headerEl.closest('tr');
        if (!headerRow) return { ok: false, reason: 'header row not found' };

        // Avoid duplicates across mutations, but recover if nav row was removed.
        if (headerEl.dataset.rbTwiz5AddNavInserted === '1') {
            const existingNav = headerRow.nextElementSibling;
            if (existingNav && existingNav.matches('tr[data-rb-twiz5add1-nav="1"]')) {
                return { ok: true, reason: 'already inserted' };
            }
            delete headerEl.dataset.rbTwiz5AddNavInserted;
        }

        const navTr = document.createElement('tr');
        navTr.setAttribute('data-rb-twiz5add1-nav', '1');

        const navTd = document.createElement('td');
        navTd.className = 'tdcenter';
        navTd.setAttribute('colspan', headerEl.getAttribute('colspan') || '2');
        navTd.style.whiteSpace = 'nowrap';

        const frag = document.createDocumentFragment();
        const sep = () => frag.appendChild(document.createTextNode(' | '));

        // Description (link)
        const desc = document.createElement('a');
        desc.href = `https://beta.rewardsbutler.com/loy/twiz5edit.php?id=${g}`;
        desc.textContent = 'Description';
        frag.appendChild(desc);

        // Location List (link)
        sep();
        const locList = document.createElement('a');
        locList.href = `https://beta.rewardsbutler.com/loy/twiz5locations.php?g=${g}`;
        locList.textContent = 'Location List';
        frag.appendChild(locList);

        // Add Location (text)
        sep();
        frag.appendChild(document.createTextNode('Add Location'));

        // Check List (link)
        sep();
        const checkList = document.createElement('a');
        checkList.href = `https://beta.rewardsbutler.com/loy/twiz5addmany.php?g=${g}`;
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

        headerEl.dataset.rbTwiz5AddNavInserted = '1';
        return { ok: true, g };
    }

    function apply() {
        const headerEl = findHeaderCell();
        if (!headerEl) return;
        cleanTwiz5AddLocationHeader(headerEl);
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
