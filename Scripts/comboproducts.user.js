// ==UserScript==
// @name         comboproducts.php
// @match        https://beta.rewardsbutler.com/loy/comboproducts.php?r=*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.1
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/comboproducts.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/comboproducts.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const REMOVE_HEADERS = new Set(["Subcategory", "Selling Units", "Purpose", "With Modifiers"]);
  const THROTTLE_MS = 300;

  // Desired column order AFTER removals
  const DESIRED_ORDER = ["Product Code", "Product Name", "Code Type", "Actions"];

  let observer = null;
  let scheduled = false;
  let runs = 0;

  function norm(s) {
    return (s || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[▲▼]\s*$/, '') // strip trailing sort arrows if present
      .trim();
  }

  // ===== COLUMN REORDER =====
  function reorderColumnsByHeaderLabels(container, headerRow, desiredOrderLabels) {
    const headerCells = Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
    if (!headerCells.length) return { ok: false, reason: "no headers" };

    const labels = headerCells.map(c => norm(c.textContent));
    const currentCount = labels.length;

    // Map label -> index (first occurrence)
    const idxByLabel = new Map();
    labels.forEach((lab, i) => {
      if (!idxByLabel.has(lab)) idxByLabel.set(lab, i);
    });

    // Final index order: desired first, then whatever remains in original order
    const chosen = [];
    const used = new Set();

    desiredOrderLabels.forEach(lab => {
      const idx = idxByLabel.get(lab);
      if (idx !== undefined && !used.has(idx)) {
        chosen.push(idx);
        used.add(idx);
      }
    });

    for (let i = 0; i < currentCount; i++) {
      if (!used.has(i)) chosen.push(i);
    }

    // Apply to each row
    const rows = Array.from(container.querySelectorAll('tr'));
    rows.forEach(tr => {
      const cells = Array.from(tr.querySelectorAll('td, th'));
      if (cells.length < currentCount) return;

      // Reorder first N cells (the table columns)
      const head = cells.slice(0, currentCount);
      const reordered = chosen.map(i => head[i]);

      head.forEach(c => c.remove());
      reordered.forEach(c => tr.appendChild(c));
    });

    return { ok: true, order: chosen.map(i => labels[i]) };
  }

  function enableSorting(headerRow, container) {
    const headers = Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
    if (!headers.length) return { ok: false, reason: 'no headers found' };

    // Prevent double-binding
    if (headerRow.dataset.rbSortBound === '1') return { ok: true, reason: 'already bound' };
    headerRow.dataset.rbSortBound = '1';

    // Cache original header labels (so arrows don't affect matching)
    headers.forEach(h => {
      if (!h.dataset.rbLabel) h.dataset.rbLabel = norm(h.textContent);
    });

    // Mark original order once for stable tie-breaking
    const allRowsAtBind = Array.from(container.querySelectorAll('tr'));
    allRowsAtBind.forEach((tr, i) => {
      if (!tr.dataset.rbOrigIndex) tr.dataset.rbOrigIndex = String(i);
    });

    const getDataRows = () => {
      const headersNow = Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
      const rowsNow = Array.from(container.querySelectorAll('tr'));
      const hIdxNow = rowsNow.indexOf(headerRow);
      return rowsNow
        .slice(hIdxNow + 1)
        .filter(tr => tr.querySelectorAll('td, th').length >= headersNow.length);
    };

    // Arrow UI: add a span to each header (without altering its label)
    headers.forEach(h => {
      if (h.querySelector('.rb-sort-arrow')) return;

      h.style.cursor = (h.dataset.rbLabel === 'Actions') ? 'default' : 'pointer';
      h.title = (h.dataset.rbLabel === 'Actions') ? '' : 'Click to sort';

      const arrow = document.createElement('span');
      arrow.className = 'rb-sort-arrow';
      arrow.style.cssText = 'display:inline-block; margin-left:6px; font-weight:bold;';
      arrow.textContent = '';
      h.appendChild(arrow);
    });

    const clearArrows = () => {
      const headersNow = Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
      headersNow.forEach(h => {
        const a = h.querySelector('.rb-sort-arrow');
        if (a) a.textContent = '';
      });
    };

    const getCellText = (tr, colIdx) => {
      const cell = tr.querySelectorAll('td, th')[colIdx];
      return norm(cell ? cell.textContent : '');
    };

    // Priority special rule:
    // - digit-only values sort numerically
    // - anything with non-digit chars goes to end (asc) or beginning (desc)
    const parsePriority = (v) => {
      const isDigits = /^\d+$/.test(v);
      return {
        isNonDigit: !isDigits,
        num: isDigits ? parseInt(v, 10) : null,
        str: v.toLowerCase()
      };
    };

    // Generic parse: numeric if clean number, else string
    const parseGeneric = (v) => {
      const cleaned = v.replace(/,/g, '');
      const isNumber = cleaned !== '' && /^-?\d+(\.\d+)?$/.test(cleaned);
      if (isNumber) return { kind: 'num', num: Number(cleaned), str: v.toLowerCase() };
      return { kind: 'str', num: null, str: v.toLowerCase() };
    };

    headers.forEach((h) => {
      const label = h.dataset.rbLabel;
      if (label === 'Actions') return;

      h.addEventListener('click', () => {
        // IMPORTANT: compute current column index at click-time (robust to later reorders)
        const headersNow = Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
        const colIdx = headersNow.indexOf(h);
        if (colIdx < 0) return;

        const prevCol = Number(container.dataset.rbSortCol ?? -1);
        const prevDir = container.dataset.rbSortDir ?? 'asc';

        const dir = (prevCol === colIdx && prevDir === 'asc') ? 'desc' : 'asc';
        container.dataset.rbSortCol = String(colIdx);
        container.dataset.rbSortDir = dir;

        // Update arrows
        clearArrows();
        const arrowEl = h.querySelector('.rb-sort-arrow');
        if (arrowEl) arrowEl.textContent = (dir === 'asc') ? '▲' : '▼';

        const rows = getDataRows();

        const decorated = rows.map(tr => {
          const raw = getCellText(tr, colIdx);

          // Column-specific parsing
          let parsed;
          if (label === 'Priority') {
            parsed = { kind: 'priority', ...parsePriority(raw), raw };
          } else if (label === 'Type') {
            // Force string semantics for Type, even if digits
            parsed = { kind: 'type', str: raw.toLowerCase(), raw };
          } else {
            parsed = { kind: 'generic', ...parseGeneric(raw), raw };
          }

          return {
            tr,
            orig: parseInt(tr.dataset.rbOrigIndex || '0', 10),
            parsed
          };
        });

        decorated.sort((a, b) => {
          const A = a.parsed;
          const B = b.parsed;

          // Priority special ordering
          if (A.kind === 'priority' && B.kind === 'priority') {
            if (A.isNonDigit !== B.isNonDigit) {
              // asc: digits first (nonDigit last) => false(0) before true(1)
              // desc: nonDigits first => reverse
              return dir === 'asc'
                ? (A.isNonDigit - B.isNonDigit)
                : (B.isNonDigit - A.isNonDigit);
            }
            // both digits
            if (!A.isNonDigit && !B.isNonDigit) {
              const cmp = A.num - B.num;
              if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
            } else {
              // both non-digit: string compare
              const cmp = A.str.localeCompare(B.str, undefined, { numeric: true, sensitivity: 'base' });
              if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
            }
          } else {
            // Type forced string
            if (A.kind === 'type' && B.kind === 'type') {
              const cmp = A.str.localeCompare(B.str, undefined, { numeric: true, sensitivity: 'base' });
              if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
            } else {
              // Generic: numeric if both numeric; else string
              if (A.kind === 'generic' && B.kind === 'generic' && A.num !== null && B.num !== null) {
                const cmp = A.num - B.num;
                if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
              } else {
                const cmp = (A.str || '').localeCompare((B.str || ''), undefined, { numeric: true, sensitivity: 'base' });
                if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
              }
            }
          }

          // Stable tie-breaker
          return a.orig - b.orig;
        });

        // Re-append rows in sorted order
        decorated.forEach(({ tr }) => container.appendChild(tr));
      });
    });

    return { ok: true };
  }

    function makeLinkRow(container) {
        // The links live in the tdcenter[colspan] cell you already target for Upload Products
        const td = container.querySelector('td.tdcenter[colspan]');
        if (!td) return { ok: false, reason: 'link td not found' };

        const links = Array.from(td.querySelectorAll('a'));
        if (links.length <= 1) return { ok: false, reason: 'not enough links' };

        // Prevent doing this multiple times on mutation reruns
        if (td.dataset.rbLinksInRow === '1') return { ok: true, reason: 'already formatted' };

        // Remove existing <br> tags
        td.querySelectorAll('br').forEach(br => br.remove());

        // Rebuild contents as: a | a | a ...
        const frag = document.createDocumentFragment();
        links.forEach((a, i) => {
            if (i > 0) frag.appendChild(document.createTextNode(' | '));
            frag.appendChild(a); // moves existing node (keeps href/attrs/listeners)
        });

        // Clear + replace
        td.textContent = '';
        td.appendChild(frag);

        // Optional: keep it on one line (wrap if needed)
        td.style.whiteSpace = 'nowrap';

        td.dataset.rbLinksInRow = '1';
        return { ok: true, count: links.length };
    }

  // ===== FINDERS =====
  function findHeaderRow() {
    // Find a row that *contains* header cells with class formsubheader
    const headerCell = document.querySelector('td.formsubheader, th.formsubheader');
    if (!headerCell) return null;
    const headerRow = headerCell.closest('tr');
    if (!headerRow) return null;
    return headerRow;
  }

  function getHeaderCells(headerRow) {
    // Only count cells that are actually header cells in that header row
    return Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
  }

  function getRowCells(tr) {
    return Array.from(tr.querySelectorAll('td, th'));
  }

  function findContainer(headerRow) {
    // Prefer tbody (ideal), otherwise fall back to table
    return headerRow.closest('tbody') || headerRow.closest('table');
  }

  // ===== MUTATIONS =====
  function removeColumns(container, indexesDesc) {
    let removed = 0;
    const rows = Array.from(container.querySelectorAll('tr'));
    rows.forEach(tr => {
      const cells = getRowCells(tr);
      indexesDesc.forEach(idx => {
        if (idx >= 0 && idx < cells.length) {
          cells[idx].remove();
          removed++;
        }
      });
    });
    return { removed, rows: rows.length };
  }

    function renameHeaderLabels(headerRow, renameMap) {
        const headers = Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
        let changed = 0;

        headers.forEach(h => {
            const current = norm(h.getAttribute('data-rb-label') || h.dataset.rbLabel || h.textContent);
            const next = renameMap[current];
            if (!next) return;

            // Update attribute used by the site (if present)
            h.setAttribute('data-rb-label', next);

            // Update visible text, preserving the arrow span if it exists
            const arrow = h.querySelector('.rb-sort-arrow');
            const arrowText = arrow ? arrow.textContent : '';

            // Rebuild header contents: label text + arrow span (if present)
            h.textContent = next;

            if (arrow) {
                // Re-append the existing arrow span
                arrow.textContent = arrowText;
                h.appendChild(arrow);
            }

            // Also update our cached label fields so enableSorting doesn't cache old names
            delete h.dataset.rbLabel;

            changed++;
        });

        return changed;
    }

    function removeComboInstructionBox(container) {
        if (!container) return { ok: false, reason: 'no container' };

        const tds = Array.from(container.querySelectorAll('td.centerinstructbox'));
        if (!tds.length) return { ok: false, reason: 'not found' };

        let removed = 0;

        tds.forEach(td => {
            const tr = td.closest('tr');
            if (tr) {
                tr.remove();
                removed++;
            }
        });

        return { ok: true, removed };
    }

  function updateColspans(container, newColCount) {
    const table = container.closest('table') || (container.tagName?.toLowerCase() === 'table' ? container : null);
    if (!table) return 0;

    let updated = 0;

    // Class is on the TDs (per your HTML)
    table.querySelectorAll('td.formheader[colspan], td.tdcenter[colspan]').forEach(td => {
      td.setAttribute('colspan', String(newColCount));
      updated++;
    });

    return updated;
  }

  function apply() {
    runs++;

    const headerRow = findHeaderRow();

    let container = null;
    let headerTexts = [];
    let headerCountBefore = 0;
    let headerCountAfter = 0;
    let indexesToRemove = [];

    if (headerRow) {
      const headerCells = getHeaderCells(headerRow);
      headerCountBefore = headerCells.length;
      headerTexts = headerCells.map(c => norm(c.textContent));

      headerTexts.forEach((txt, idx) => {
        if (REMOVE_HEADERS.has(txt)) indexesToRemove.push(idx);
      });

      container = findContainer(headerRow);

      if (container) {
        if (indexesToRemove.length) {
          const indexesDesc = indexesToRemove.slice().sort((a, b) => b - a);
          removeColumns(container, indexesDesc);
        }

          renameHeaderLabels(headerRow, {
              "Code": "Product Code",
              "Product": "Product Name",
          });

        // Reorder AFTER removals (or even if none removed)
        reorderColumnsByHeaderLabels(container, headerRow, DESIRED_ORDER);

        // Enable sorting AFTER reorder (and click-time col index makes it robust anyway)
        enableSorting(headerRow, container);

        removeComboInstructionBox(container);

        headerCountAfter = getHeaderCells(headerRow).length;
        updateColspans(container, headerCountAfter);
        buildComboNavRow(container);

      } else {
        headerCountAfter = headerCountBefore;
      }
    }
  }

    function getCurrentR() {
        const params = new URLSearchParams(location.search);
        const r = params.get('r');
        const x = r && /^\d+$/.test(r) ? parseInt(r, 10) : null;
        return x;
    }

    function buildComboNavRow(container) {
        const td = container.querySelector('td.tdcenter[colspan]');
        if (!td) return { ok: false, reason: 'link td not found' };

        // Avoid doing it repeatedly on mutations
        if (td.dataset.rbNavRowBuilt === '1') return { ok: true, reason: 'already built' };

        const r = getCurrentR();
        if (r === null) return { ok: false, reason: 'no numeric r= found in URL' };

        // Helper to find an existing <a> by href substring
        const findLink = (needle) =>
        Array.from(td.querySelectorAll('a')).find(a => (a.getAttribute('href') || '').includes(needle)) || null;

        // Pull existing links from the page (preferred)
        const existingNewProduct      = findLink('comboproductedit.php');
        const existingProductSelector = findLink('productselector.php');
        const existingReturnToCombos  = findLink('combos.php');

        // Our injected links (create if missing)
        const ensureLink = (dataAttr, href, text) => {
            let a = td.querySelector(`a[${dataAttr}]`);
            if (!a) {
                a = document.createElement('a');
                a.setAttribute(dataAttr, '1');
                a.textContent = text;
            }
            a.href = href; // always keep r in sync
            return a;
        };

        const editCombo = ensureLink('data-rb-edit-combo', `https://beta.rewardsbutler.com/loy/comboedit.php?r=${r}`, 'Edit Combo');
        const uploadProducts = ensureLink('data-rb-upload-link', `twiz6uploadform.php?r=${r}`, 'Upload Products');
        const calcAmountSold = ensureLink('data-rb-calc-amount-sold', `https://beta.rewardsbutler.com/loy/comboproducts.php?a=1&r=${r}`, 'Calculate Amount Sold');

        // Build the desired ordered list
        const items = [
            { type: 'node', node: editCombo },
            { type: 'text', text: 'View Products' }, // plain text, not a link
            { type: 'node', node: existingNewProduct || null, fallback: 'New Product' },
            { type: 'node', node: uploadProducts },
            { type: 'node', node: existingProductSelector || null, fallback: 'Product Selector' },
            { type: 'node', node: calcAmountSold },
            { type: 'node', node: existingReturnToCombos || null, fallback: 'Return To Combos' },
        ];

        // Remove BRs and rebuild content
        td.querySelectorAll('br').forEach(br => br.remove());

        // Preserve only the nav row we build (don’t leave old anchors duplicated)
        td.textContent = '';

        const frag = document.createDocumentFragment();
        let first = true;

        items.forEach(item => {
            let nodeToAdd = null;

            if (item.type === 'text') {
                nodeToAdd = document.createTextNode(item.text);
            } else if (item.type === 'node') {
                if (item.node) {
                    nodeToAdd = item.node; // moves existing node, preserving href/attrs
                } else {
                    // If RB ever changes and the link doesn't exist, show text fallback
                    nodeToAdd = document.createTextNode(item.fallback || '');
                }
            }

            if (!nodeToAdd) return;

            if (!first) frag.appendChild(document.createTextNode(' | '));
            frag.appendChild(nodeToAdd);
            first = false;
        });

        td.appendChild(frag);

        // Optional: keep on one line unless it has to wrap
        td.style.whiteSpace = 'nowrap';

        td.dataset.rbNavRowBuilt = '1';
        return { ok: true, r };
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

  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      const tgt = m.target;
      if (tgt && tgt.nodeType === 1 && tgt.closest && tgt.closest('#rb-prizebrowse-hud')) continue;
      scheduleApply();
      break;
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
