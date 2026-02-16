// ==UserScript==
// @name         memberedit.php
// @match        https://beta.rewardsbutler.com/loy/memberedit.php?c=*&g=*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/memberedit.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/memberedit.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const THROTTLE_MS = 250;
  let observer = null;
  let scheduled = false;

  function findNewMemberGroupsSectionRow() {
    return Array.from(document.querySelectorAll('td.formsection'))
      .map(td => td.closest('tr'))
      .find(tr => tr && (tr.textContent || '').trim() === 'New Member Groups') || null;
  }

  function isMemberGroupRow(tr) {
    if (!tr) return false;
    const tds = Array.from(tr.querySelectorAll('td'));
    if (tds.length !== 2) return false;
    const left = (tds[0].textContent || '').replace(/\s+/g, ' ').trim();
    return left === 'Member Group :';
  }

  function extractButtonsFromFooterRow(startTr) {
    // Find the first row *after* the Member Group rows that contains the Update Member input/button
    let footerTr = startTr;
    while (footerTr) {
      const hasUpdate =
        footerTr.querySelector('input[type="submit"][value="Update Member"]') ||
        Array.from(footerTr.querySelectorAll('input[type="submit"], button')).some(el => (el.value || el.textContent || '').includes('Update Member'));
      if (hasUpdate) return footerTr;
      footerTr = footerTr.nextElementSibling;
    }
    return null;
  }

  function collectRemoveButtons(footerTr) {
    if (!footerTr) return [];
    // Buttons look like: <button ...>Remove from Group 13</button>
    return Array.from(footerTr.querySelectorAll('button'))
      .filter(b => /^Remove from\s+/i.test((b.textContent || '').trim()));
  }

  function moveButtonsIntoRows(sectionTr) {
    if (!sectionTr) return { ok: false, reason: 'section not found' };
    if (sectionTr.dataset.rbReformatted === '1') return { ok: true, reason: 'already done' };

    // Collect all the Member Group rows right after the section header row
    const memberRows = [];
    let cur = sectionTr.nextElementSibling;
    while (cur && isMemberGroupRow(cur)) {
      memberRows.push(cur);
      cur = cur.nextElementSibling;
    }
    if (!memberRows.length) return { ok: false, reason: 'no member rows found' };

    // Footer row with Update Member + Remove buttons
    const footerTr = extractButtonsFromFooterRow(cur || sectionTr);
    if (!footerTr) return { ok: false, reason: 'footer row not found' };

    const removeButtons = collectRemoveButtons(footerTr);

    // If counts mismatch, we still try best-effort: map in order found
    memberRows.forEach((tr, i) => {
      const tds = tr.querySelectorAll('td');
      if (tds.length !== 2) return;

      const descTd = tds[1]; // currently holds the <input ... value="...">
      const input = descTd.querySelector('input[type="text"][name="MemberGroup[]"], input[type="text"]');

      // Build: col1 = button (if available), col2 = description text (value)
      const newLeft = document.createElement('td');
      newLeft.className = descTd.className || 'justleft';

      const newRight = document.createElement('td');
      newRight.className = descTd.className || 'justleft';

      const btn = removeButtons[i] || null;
      if (btn) {
        // Move the existing button node into the left cell
        newLeft.appendChild(btn);
        btn.style.removeProperty('width');
      } else {
        // Fallback if missing
        newLeft.textContent = '';
      }

      // Description becomes plain text
        const desc = (input ? input.value : descTd.textContent || '')
        .replace(/\s*Exp:\s*0000-00-00 00:00:00\s*/i, '')
        .trim();
        newRight.textContent = desc;

      // Replace the row contents
      tr.textContent = '';
      tr.appendChild(newLeft);
      tr.appendChild(newRight);
    });

    // Now remove all remaining "Remove from ..." buttons in the footer row (leave Update Member)
    Array.from(footerTr.querySelectorAll('button'))
      .filter(b => /^Remove from\s+/i.test((b.textContent || '').trim()))
      .forEach(b => b.remove());

    // Also remove any lingering extra spacing text nodes like &nbsp;
    footerTr.childNodes.forEach(n => {
      if (n.nodeType === Node.TEXT_NODE && !n.textContent.trim()) n.remove();
    });

    sectionTr.dataset.rbReformatted = '1';
    return { ok: true, moved: Math.min(memberRows.length, removeButtons.length), rows: memberRows.length };
  }

    function setupCollapsibleFormSections() {
        const table = document.querySelector('table.form');
        if (!table) return;

        // Run once
        if (table.dataset.rbSectionsCollapsible === '1') return;
        table.dataset.rbSectionsCollapsible = '1';

        const tbody = table.querySelector('tbody') || table;

        const isUpdateMemberRow = (tr) => {
            if (!tr) return false;
            // matches: <input type="submit" value="Update Member" ...>
            const btn = tr.querySelector('input[type="submit"][value="Update Member"]');
            return !!btn;
        };

        const norm = (s) => (s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();

        const makeSectionId = (title, idx) =>
        `rb-sec-${idx}-${norm(title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

        const sectionHeaders = Array.from(tbody.querySelectorAll('td.formsection'))
        .map(td => td.closest('tr'))
        .filter(Boolean);

        sectionHeaders.forEach((headerTr, idx) => {
            const headerTd = headerTr.querySelector('td.formsection');
            if (!headerTd) return;

            // Store / re-use id
            const title = norm(headerTd.textContent);
            const sectionId = headerTr.dataset.rbSectionId || makeSectionId(title, idx);
            headerTr.dataset.rbSectionId = sectionId;

            // Add arrow + click behavior once
            if (headerTr.dataset.rbSectionWired !== '1') {
                headerTr.dataset.rbSectionWired = '1';

                const arrow = document.createElement('span');
                arrow.textContent = '▶';
                arrow.style.display = 'inline-block';
                arrow.style.width = '1.2em';
                arrow.style.marginRight = '4px';
                arrow.dataset.rbArrow = '1';

                // Insert arrow at beginning of the section title cell
                headerTd.insertBefore(arrow, headerTd.firstChild);
                headerTd.style.cursor = 'pointer';
                headerTd.style.userSelect = 'none';

                // default collapsed
                headerTr.dataset.rbCollapsed = '1';

                headerTd.addEventListener('click', () => {
                    const collapsed = headerTr.dataset.rbCollapsed === '1';
                    headerTr.dataset.rbCollapsed = collapsed ? '0' : '1';
                    arrow.textContent = collapsed ? '▼' : '▶';
                    refreshSectionVisibility(sectionId);
                });
            }

            // Assign following rows until next formsection (skip Update Member row)
            let tr = headerTr.nextElementSibling;
            while (tr) {
                if (tr.querySelector('td.formsection')) break; // next section
                if (!isUpdateMemberRow(tr)) {
                    tr.dataset.rbSectionId = sectionId;
                }
                tr = tr.nextElementSibling;
            }

            // Collapse by default
            refreshSectionVisibility(sectionId);
        });

        function refreshSectionVisibility(sectionId) {
            const headerTr = tbody.querySelector(`tr[data-rb-section-id="${CSS.escape(sectionId)}"]`);
            if (!headerTr) return;

            const collapsed = headerTr.dataset.rbCollapsed === '1';

            const rows = Array.from(tbody.querySelectorAll(`tr[data-rb-section-id="${CSS.escape(sectionId)}"]`))
            // exclude the header row itself
            .filter(tr => tr !== headerTr);

            rows.forEach(tr => {
                // if later you ever tag something as "always show", you can add a guard here
                tr.style.display = collapsed ? 'none' : '';
            });
        }
    }

  // Rename: "New Member Groups" -> "Member Groups [X]" where X = # rows assigned to that section
    function renameMemberGroupsSection() {
        const sectionId = 'rb-sec-3-new-member-groups';

        // header row is the one that has the section id AND contains the formsection TD
        const headerTr = document.querySelector(`tr[data-rb-section-id="${sectionId}"] td.formsection`)?.closest('tr');
        if (!headerTr) return;

        // count rows assigned to this section (exclude the header itself and exclude the Update Member row)
        const rows = Array.from(document.querySelectorAll(`tr[data-rb-section-id="${sectionId}"]`))
        .filter(tr => tr !== headerTr)
        .filter(tr => !/Update Member/i.test(tr.textContent || ''));

        const x = rows.length;

        const headerTd = headerTr.querySelector('td.formsection');
        if (!headerTd) return;

        // preserve the arrow span if you inserted one
        const arrow = headerTd.querySelector('span[data-rb-arrow="1"]');
        headerTd.textContent = `Member Groups [${x}]`;
        if (arrow) headerTd.prepend(arrow);
    }

    function arrangeLinkBar() {
        const td = document.querySelector('td.formsubheader[colspan="2"]');
        if (!td || td.dataset.rbReformatted === '1') return;

        const links = Array.from(td.querySelectorAll('a'));
        if (!links.length) return;

        const frag = document.createDocumentFragment();

        links.forEach((a, idx) => {
            // add separator before every link except the first
            if (idx > 0 && a.textContent.trim() !== 'Reset') {
                frag.appendChild(document.createTextNode(' | '));
            }

            frag.appendChild(a);

            // insert line break AFTER Redeem
            if (a.textContent.trim() === 'Overrides') {
                frag.appendChild(document.createElement('br'));
            }
        });

        td.textContent = '';
        td.appendChild(frag);
        td.style.whiteSpace = 'nowrap';
        td.dataset.rbReformatted = '1';
    }

  function apply() {
    const sectionTr = findNewMemberGroupsSectionRow();
    if (!sectionTr) return;

    moveButtonsIntoRows(sectionTr);
    setupCollapsibleFormSections();
    renameMemberGroupsSection();
    arrangeLinkBar();
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
