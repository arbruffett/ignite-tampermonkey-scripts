// ==UserScript==
// @name         promocodes.php
// @version      1.0.1
// @description  Adds click-to-sort on the Promo Codes table (handles blank header cells).
// @match        https://*.rewardsbutler.com/loy/promocodes.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/promocodes.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/promocodes.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

/**
 * RewardsButler promo-code table sorter (robust to “weird” page structure)
 *
 * Drop-in replacement: paste this in place of your current sorter script.
 * It ONLY reorders <tr class="browse-item"> rows and leaves all other <tr> alone.
 * It also handles the case where browse-item rows are scattered before/after the header.
 */

(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function normText(el) {
    return (el?.textContent || "").replace(/\u00a0/g, " ").trim();
  }

  function parseSmart(val) {
    const s = (val ?? "").toString().trim();

    // datetime like "2025-02-03 00:00:00"
    if (/^\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2})?$/.test(s)) {
      const t = Date.parse(s.replace(" ", "T"));
      if (!Number.isNaN(t)) return { type: "date", v: t };
    }

    // numeric
    const n = Number(s.replace(/[,]/g, ""));
    if (s !== "" && Number.isFinite(n) && /^-?\d+(?:\.\d+)?$/.test(s.replace(/[,]/g, ""))) {
      return { type: "num", v: n };
    }

    return { type: "str", v: s.toLowerCase() };
  }

  function compareSmart(a, b) {
    // Prefer same-type comparisons, else fall back to string
    if (a.type === b.type) {
      if (a.v < b.v) return -1;
      if (a.v > b.v) return 1;
      return 0;
    }
    const as = String(a.v);
    const bs = String(b.v);
    if (as < bs) return -1;
    if (as > bs) return 1;
    return 0;
  }

  function setArrowState(tbody, activeCol, dir) {
    tbody.querySelectorAll(".rb-sort-arrow").forEach((s) => (s.textContent = ""));
    const headerRow = tbody.querySelector('tr[data-rb-sort-bound="1"]') ||
                      tbody.querySelector("tr:has(td.formsubheader)") ||
                      tbody.querySelector("tr");

    if (!headerRow) return;

    const headers = headerRow.querySelectorAll("td.formsubheader");
    const active = headers[activeCol];
    if (!active) return;

    const arrow = active.querySelector(".rb-sort-arrow");
    if (arrow) arrow.textContent = dir === "asc" ? "▲" : "▼";
  }

  function initSorter() {
    // Find the promo table header row (the one with .formsubheader cells)
    const headerCell = document.querySelector("td.formsubheader[data-rb-label]") ||
                       document.querySelector("td.formsubheader");
    if (!headerCell) return;

    const headerRow = headerCell.closest("tr");
    const tbody = headerRow?.closest("tbody");
    if (!tbody) return;

    // Cache original browse-item order once (for stable tie-break)
    const getBrowseItems = () => Array.from(tbody.querySelectorAll("tr.browse-item"));

    const ensureOrigIndex = () => {
      getBrowseItems().forEach((tr, i) => {
        if (!tr.dataset.rbStableIndex) {
          // Prefer existing rb-orig-index if present; else assign one
          tr.dataset.rbStableIndex = tr.getAttribute("data-rb-orig-index") ?? String(i);
        }
      });
    };

    ensureOrigIndex();

    // Make headers clickable (Promo Code, Starts On, etc.)
    const headerCells = Array.from(headerRow.querySelectorAll("td.formsubheader"));
    headerCells.forEach((th, colIndex) => {
      // Guard: don’t attach twice
      if (th.dataset.rbSorterBound === "1") return;
      th.dataset.rbSorterBound = "1";

      th.style.cursor = th.title ? th.style.cursor : "pointer";
      if (!th.title) th.title = "Click to sort";

      th.addEventListener("click", () => {
        ensureOrigIndex();

        const prevCol = tbody.dataset.rbSortCol ? Number(tbody.dataset.rbSortCol) : -1;
        const prevDir = tbody.dataset.rbSortDir || "asc";
        const dir = (prevCol === colIndex && prevDir === "asc") ? "desc" : "asc";

        tbody.dataset.rbSortCol = String(colIndex);
        tbody.dataset.rbSortDir = dir;

        const items = getBrowseItems();

        // Sort ONLY browse-item rows
        const sorted = items
          .map((tr) => {
            const cell = tr.cells[colIndex];
            const key = parseSmart(normText(cell));
            const stable = Number(tr.dataset.rbStableIndex) || 0;
            return { tr, key, stable };
          })
          .sort((x, y) => {
            const c = compareSmart(x.key, y.key);
            if (c !== 0) return dir === "asc" ? c : -c;
            // stable tie-break
            return x.stable - y.stable;
          })
          .map((x) => x.tr);

        // Remove all browse-items from wherever they are in this tbody
        items.forEach((tr) => tr.remove());

        // Re-insert them as a single contiguous block right after the header row.
        // This fixes pages where browse-item rows are scattered before/after the header.
        const insertAfter = headerRow.nextSibling; // may be null
        sorted.forEach((tr) => {
          if (insertAfter) {
            tbody.insertBefore(tr, insertAfter);
          } else {
            tbody.appendChild(tr);
          }
        });

        setArrowState(tbody, colIndex, dir);
      });
    });

    // If the page already indicates a sort arrow, respect it on load
    const initialCol = tbody.dataset.rbSortCol ? Number(tbody.dataset.rbSortCol) : null;
    const initialDir = tbody.dataset.rbSortDir || "asc";
    if (Number.isFinite(initialCol)) {
      setArrowState(tbody, initialCol, initialDir);
    }
  }

  ready(initSorter);
})();
