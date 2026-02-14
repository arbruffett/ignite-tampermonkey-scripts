// ==UserScript==
// @name         intproducts.php
// @namespace    ignite-rewardsbutler
// @version      1.0.1
// @description  Enable click-to-sort on Loyalty Reward Exceptions table on /loy/intproducts.php
// @match        *://*.rewardsbutler.com/loy/intproducts.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/intproducts.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/intproducts.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // ---------- helpers ----------
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

  function parseSmart(s) {
    const raw = (s ?? "").toString().trim();

    // YYYY-MM-DD or YYYY-MM-DD HH:MM:SS
    if (/^\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2})?$/.test(raw)) {
      const t = Date.parse(raw.replace(" ", "T"));
      if (!Number.isNaN(t)) return { type: "date", v: t };
    }

    // pure numeric (allow commas)
    const nStr = raw.replace(/,/g, "");
    if (nStr !== "" && /^-?\d+(?:\.\d+)?$/.test(nStr)) {
      const n = Number(nStr);
      if (Number.isFinite(n)) return { type: "num", v: n };
    }

    return { type: "str", v: raw.toLowerCase() };
  }

  function cmp(a, b) {
    if (a.type === b.type) {
      if (a.v < b.v) return -1;
      if (a.v > b.v) return 1;
      return 0;
    }
    // different types -> compare as strings for deterministic ordering
    const as = String(a.v), bs = String(b.v);
    if (as < bs) return -1;
    if (as > bs) return 1;
    return 0;
  }

  function addArrow(cell) {
    const arrow = document.createElement("span");
    arrow.className = "rb-sort-arrow";
    arrow.style.marginLeft = "6px";
    arrow.style.fontSize = "11px";
    arrow.style.userSelect = "none";
    cell.appendChild(arrow);
    return arrow;
  }

  function clearArrows(headerRow) {
    headerRow.querySelectorAll(".rb-sort-arrow").forEach((a) => (a.textContent = ""));
  }

  // ---------- main ----------
  function init() {
    // Find the specific header row for this table:
    // <tr><td class="formsubheader">Description</td> ... </tr>
    const headerRow = Array.from(document.querySelectorAll("table.basic tr")).find((tr) => {
      const cells = Array.from(tr.querySelectorAll("td.formsubheader"));
      if (cells.length < 3) return false;
      const labels = cells.map((c) => normText(c));
      return (
        labels[0] === "Description" &&
        labels[1] === "Code Type" &&
        labels[2] === "Product Code"
      );
    });

    if (!headerRow) return;

    const tbody = headerRow.closest("tbody");
    if (!tbody) return;

    // Only the data rows are marked with class "browse-item"
    const getRows = () => Array.from(tbody.querySelectorAll("tr.browse-item"));

    // Stable index so ties don't reshuffle every click
    getRows().forEach((tr, i) => {
      if (!tr.dataset.rbStableIndex) tr.dataset.rbStableIndex = String(i);
    });

    const headerCells = Array.from(headerRow.querySelectorAll("td.formsubheader"));

    // Make all headers sortable except "Actions" (last column)
    headerCells.forEach((cell, colIndex) => {
      if (colIndex === headerCells.length - 1) return; // skip Actions

      if (cell.dataset.rbSortBound === "1") return;
      cell.dataset.rbSortBound = "1";

      cell.style.cursor = "pointer";
      cell.title = "Click to sort";

      const arrow = cell.querySelector(".rb-sort-arrow") || addArrow(cell);

      cell.addEventListener("click", () => {
        const prevCol = tbody.dataset.rbSortCol ? Number(tbody.dataset.rbSortCol) : -1;
        const prevDir = tbody.dataset.rbSortDir || "asc";
        const dir = prevCol === colIndex && prevDir === "asc" ? "desc" : "asc";

        tbody.dataset.rbSortCol = String(colIndex);
        tbody.dataset.rbSortDir = dir;

        const rows = getRows();

        const sorted = rows
          .map((tr) => {
            const key = parseSmart(normText(tr.cells[colIndex]));
            const stable = Number(tr.dataset.rbStableIndex) || 0;
            return { tr, key, stable };
          })
          .sort((a, b) => {
            const c = cmp(a.key, b.key);
            if (c !== 0) return dir === "asc" ? c : -c;
            return a.stable - b.stable;
          })
          .map((x) => x.tr);

        // Remove & reinsert ONLY browse-item rows, right after the header row
        rows.forEach((tr) => tr.remove());

        // Insert as a contiguous block immediately after headerRow
        let refNode = headerRow.nextSibling; // may be null
        sorted.forEach((tr) => {
          if (refNode) tbody.insertBefore(tr, refNode);
          else tbody.appendChild(tr);
        });

        // arrows
        clearArrows(headerRow);
        arrow.textContent = dir === "asc" ? "▲" : "▼";
      });
    });
  }

  ready(init);
})();
