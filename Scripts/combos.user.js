// ==UserScript==
// @name         combos.php
// @match        https://beta.rewardsbutler.com/loy/combos.php*
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      *.rewardsbutler.com
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.1
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/combos.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/combos.user.js
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // =========================================================
  // CONFIG
  // =========================================================
  const THROTTLE_MS = 200;

  // Pull numrequired from comboedit.php
  const NUMREQ_CONCURRENCY = 20; // Number of 'buy x' to load at 1 time.
  const NUMREQ_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days of cache storage
  const NUMREQ_CACHE_KEY = "rb_combo_numreq_cache_v1";

  let observer = null;
  let scheduled = false;

  // =========================================================
  // HELPERS
  // =========================================================
  function norm(s) {
    return (s || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[▲▼]\s*$/, '')
      .trim();
  }

  function absoluteUrl(href) {
    return new URL(href, location.href).toString();
  }

  function sep() {
      return document.createTextNode(' \u00A0|\u00A0 ');
  }

  function makeLink(href, text) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    return a;
  }

  // =========================================================
  // CACHE
  // =========================================================
  function loadCache() {
    try { return JSON.parse(GM_getValue(NUMREQ_CACHE_KEY, "{}")); }
    catch { return {}; }
  }

  function saveCache(cache) {
    GM_setValue(NUMREQ_CACHE_KEY, JSON.stringify(cache));
  }

  function getCached(cache, url) {
    const e = cache[url];
    if (!e) return null;
    if (!e.t || (Date.now() - e.t) > NUMREQ_CACHE_TTL_MS) return null;
    return e.numrequired;
  }

  function setCached(cache, url, numrequired) {
    cache[url] = { numrequired, t: Date.now() };
  }

    /* ================== NAV BAR ================== */

    function buildTriggerNavTd(colSpan) {
        const td = document.createElement('td');
        td.className = 'formsubheader';
        td.colSpan = colSpan;

        // mark nav so sorting/header detection can ignore it
        td.setAttribute('data-rb-nav', '1');

        td.appendChild(makeLink('prizes.php', 'Trigger Search'));
        td.appendChild(sep());
        td.appendChild(makeLink('prizedrill.php?r=0', 'New Trigger'));
        td.appendChild(sep());
        td.appendChild(document.createTextNode('Combos')); // Product Groups = text
        td.appendChild(sep());
        td.appendChild(makeLink('twiz4form.php', 'Member Groups'));
        td.appendChild(sep());
        td.appendChild(makeLink('twiz5form.php', 'Location Groups'));

        return td;
    }

    function ensureNavRowUnderProductCombosHeader() {
        // Anchor: the existing header row
        const headerTd = Array.from(document.querySelectorAll('td.formheader'))
        .find(td => norm(td.textContent) === 'Product Combos');
        if (!headerTd) return { ok: false, reason: 'Product Combos header not found' };

        const headerTr = headerTd.closest('tr');
        if (!headerTr) return { ok: false, reason: 'no header tr' };

        const tbody = headerTr.parentElement;
        if (!tbody) return { ok: false, reason: 'no tbody' };

        const colSpan = parseInt(headerTd.getAttribute('colspan') || '6', 10) || 6;

        // Avoid duplicates
        if (document.querySelector('tr[data-rb-trigger-nav="1"]')) return { ok: true, reason: 'already present' };

        const navTr = document.createElement('tr');
        navTr.setAttribute('data-rb-trigger-nav', '1');
        navTr.appendChild(buildTriggerNavTd(colSpan));

        // Insert directly under the header row
        if (headerTr.nextSibling) tbody.insertBefore(navTr, headerTr.nextSibling);
        else tbody.appendChild(navTr);

        return { ok: true };
    }

  // =========================================================
  // NETWORK FETCH
  // =========================================================
  function fetchHtml(url) {
    return new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: "GET",
        url,
        withCredentials: true,
        headers: { Accept: "text/html,*/*" },
        timeout: 30000,
        onload: r => (r.status >= 200 && r.status < 300)
          ? resolve(r.responseText)
          : reject(new Error(`HTTP ${r.status}`)),
        onerror: () => reject(new Error("Network error")),
        ontimeout: () => reject(new Error("Timeout")),
      });
    });
  }

  function extractNumRequired(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const sel =
      doc.querySelector('select#numrequired') ||
      doc.querySelector('select[name="numrequired"]');

    if (!sel) return null;

    const opt = sel.querySelector('option[selected]') || sel.querySelector('option:checked');
    const v = (opt && opt.value != null) ? opt.value : sel.value;
    if (v == null) return null;

    const n = parseInt(String(v).trim(), 10);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  // =========================================================
  // VIEW DATA -> UPLOAD
  // =========================================================
  function replaceViewDataLinks() {
    document.querySelectorAll('a').forEach(a => {
      const label = a.textContent.trim();
      if (label !== 'View Data') return;

      try {
        const url = new URL(a.href);
        const code = url.searchParams.get('code');
        if (code) {
          a.textContent = 'Upload';
          a.href = `twiz6uploadform.php?r=${code}`;
        }
      } catch (e) {
        // ignore malformed url
      }
    });
  }

  // =========================================================
  // TABLE FINDERS
  // =========================================================
  function getHeaderCells(headerRow) {
    return Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
  }

  function getRowCells(tr) {
    return Array.from(tr.querySelectorAll('td, th'));
  }

  function findContainer(headerRow) {
    return headerRow.closest('tbody') || headerRow.closest('table');
  }

  // =========================================================
  // HEADER RENAMES
  // =========================================================
  function renameHeaders(headerRow) {
    if (!headerRow) return { ok: false, reason: 'missing headerRow' };

    const headerCells = getHeaderCells(headerRow);
    let renamed = 0;

    headerCells.forEach(cell => {
      const label = cell.dataset.rbLabel || norm(cell.textContent);
      const arrow = cell.querySelector('.rb-sort-arrow');

      // Combo ID Used in Trigger Value -> KBID
      if (label === 'Combo IDUsed in Trigger Value' || label === 'Combo ID Used in Trigger Value') {
        cell.textContent = 'ID';
        if (arrow) cell.appendChild(arrow);
        cell.dataset.rbLabel = 'ID';
        renamed++;
        return;
      }

      // Number of Products -> #
      if (label === 'Number of Products' || label === 'Number ofProducts' || label === 'Number of Product') {
        cell.textContent = '#';
        if (arrow) cell.appendChild(arrow);
        cell.dataset.rbLabel = '#';
        renamed++;
        return;
      }
    });

    return { ok: true, renamed };
  }

  // =========================================================
  // ACTION COLUMN SEPARATORS: Edit | Upload | ...
  // =========================================================
  function formatActionCellSeparators(headerRow, container) {
    if (!headerRow || !container) return { ok: false, reason: 'missing headerRow/container' };

    const headerCells = getHeaderCells(headerRow);
    const headerTexts = headerCells.map(c => norm(c.textContent));
    const actionsIdx = headerTexts.indexOf('Actions');

    if (actionsIdx === -1) return { ok: false, reason: '"Actions" header not found' };

    let scanned = 0;
    let changed = 0;

    const rows = Array.from(container.querySelectorAll('tr'));
    rows.forEach(tr => {
      if (tr === headerRow) return;

      const cells = getRowCells(tr);
      const cell = cells[actionsIdx];
      if (!cell) return;

      scanned++;

      const links = Array.from(cell.querySelectorAll('a'));
      if (links.length <= 1) return;

      const sep = ` <strong>|</strong> `;
      const newHtml = links.map(a => a.outerHTML).join(sep);

      if (newHtml !== cell.innerHTML) {
        cell.innerHTML = newHtml;
        changed++;
      }
    });

    return { ok: true, scanned, changed, actionsIdx };
  }

  // =========================================================
  // NOTES COLUMN FIX: "NUM UPC codes are not 12 digits" -> "NUM Short UPCs"
  // =========================================================

  function rewriteNotesColumn(headerRow, container) {
    if (!headerRow || !container) return { ok: false, reason: 'missing headerRow/container' };

    const headerCells = getHeaderCells(headerRow);
    const headerTexts = headerCells.map(c => norm(c.textContent));

    const notesIdx = headerTexts.indexOf('Notes');
    if (notesIdx === -1) return { ok: false, reason: '"Notes" header not found' };

    let scanned = 0;
    let changed = 0;

    const rows = Array.from(container.querySelectorAll('tr'));
    rows.forEach(tr => {
      if (tr === headerRow) return;

      const cells = getRowCells(tr);
      const cell = cells[notesIdx];
      if (!cell) return;

      const original = norm(cell.textContent);
      if (!original) return;

      scanned++;

      // Match: "NUM UPC codes are not 12 digits" where NUM is 1+ digits at start
      const m = original.match(/^(\d+)\s+UPC codes are not 12 digits$/i);
      if (m) {
        const num = m[1];
        const newText = `${num} Short UPCs`;
        if (original !== newText) {
          cell.textContent = newText;
          cell.style.color = 'red';
          changed++;
        }
      }
    });

    return { ok: true, scanned, changed, notesIdx };
  }

  // =========================================================
  // ASYNC WORKER POOL
  // =========================================================
  async function runPool(items, worker, concurrency) {
    let idx = 0;
    async function runner() {
      while (true) {
        const i = idx++;
        if (i >= items.length) return;
        await worker(items[i], i);
      }
    }
    await Promise.all(Array.from({ length: concurrency }, runner));
  }

  // =========================================================
  // BUY X FROM comboedit.php (numrequired)
  // =========================================================
  async function populateBuyXFromComboEdit(headerRow, container) {
    if (!headerRow || !container) return { ok: false, reason: "missing headerRow/container" };

    const headerCells = getHeaderCells(headerRow);
    const headerTexts = headerCells.map(c => norm(c.textContent));

    const typeIdx = headerTexts.indexOf("Type");
    if (typeIdx === -1) return { ok: false, reason: '"Type" header not found' };

    const actionsIdx = headerTexts.indexOf("Actions");
    if (actionsIdx === -1) return { ok: false, reason: '"Actions" header not found' };

    const rows = Array.from(container.querySelectorAll("tr")).filter(tr => tr !== headerRow);

    const jobs = [];
    rows.forEach(tr => {
      const cells = getRowCells(tr);
      const actionsCell = cells[actionsIdx];
      const typeCell = cells[typeIdx];
      if (!actionsCell || !typeCell) return;

      const editLink = Array.from(actionsCell.querySelectorAll("a"))
        .find(a => norm(a.textContent) === "Edit" && /comboedit\.php/i.test(a.getAttribute("href") || ""));

      if (!editLink) return;

      jobs.push({
        typeCell,
        url: absoluteUrl(editLink.getAttribute("href")),
      });
    });

    if (!jobs.length) return { ok: true, scanned: 0, updated: 0, reason: "no Edit links found" };

    let cache = loadCache();
    let scanned = 0;
    let updated = 0;

    // Apply cache first
    for (const j of jobs) {
      const cached = getCached(cache, j.url);
      if (cached !== null) {
        scanned++;
        const label = (cached === 0) ? "Buy All" : `Buy ${cached}`;
        if (norm(j.typeCell.textContent) !== label) {
          j.typeCell.textContent = label;
          updated++;
        }
      }
    }

    // Fetch missing
    const toFetch = jobs.filter(j => getCached(cache, j.url) === null);

    await runPool(toFetch, async (job) => {
      scanned++;
      try {
        const html = await fetchHtml(job.url);
        const n = extractNumRequired(html);

        if (n === null) return;

        setCached(cache, job.url, n);

        const label = (n === 0) ? "Buy All" : `Buy ${n}`;
        if (norm(job.typeCell.textContent) !== label) {
          job.typeCell.textContent = label;
          updated++;
        }
      } catch (e) {
        // swallow; cached next time
      }
    }, NUMREQ_CONCURRENCY);

    saveCache(cache);

    return { ok: true, scanned, updated };
  }

  // =========================================================
  // SORTING
  // =========================================================

    function findSortableHeaderRow() {
        // Find the FIRST real column header row (formsubheader cells), excluding our nav td
        const headerCell = document.querySelector(
            'td.formsubheader:not([data-rb-nav]), th.formsubheader:not([data-rb-nav])'
        );
        if (!headerCell) return null;
        return headerCell.closest('tr') || null;
    }

  function enableSorting(headerRow, container) {
    const headers = getHeaderCells(headerRow);
    if (!headers.length) return { ok: false, reason: 'no headers found' };

    // Prevent double-binding
    if (headerRow.dataset.rbSortBound === '1') return { ok: true, reason: 'already bound' };
    headerRow.dataset.rbSortBound = '1';

    // Cache original header labels
    headers.forEach(h => {
      if (!h.dataset.rbLabel) h.dataset.rbLabel = norm(h.textContent);
    });

    // Stable tie-break
    const allRows = Array.from(container.querySelectorAll('tr'));
    allRows.forEach((tr, i) => {
      if (!tr.dataset.rbOrigIndex) tr.dataset.rbOrigIndex = String(i);
    });

    const getDataRows = () => {
      const headersNow = Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
      const rowsNow = Array.from(container.querySelectorAll('tr'));
      const headerIdxNow = rowsNow.indexOf(headerRow);
      return rowsNow
        .slice(headerIdxNow + 1)
        .filter(tr => getRowCells(tr).length >= headers.length);
    };

    const parseValue = (v) => {
      const cleaned = v.replace(/,/g, '');
      const isNumber = cleaned !== '' && /^-?\d+(\.\d+)?$/.test(cleaned);
      if (isNumber) return { num: Number(cleaned), str: v.toLowerCase() };
      return { num: null, str: v.toLowerCase() };
    };

    // Add arrows
    headers.forEach(h => {
      if (h.querySelector('.rb-sort-arrow')) return;

      const label = h.dataset.rbLabel;
      h.style.cursor = (label === 'Actions') ? 'default' : 'pointer';
      h.title = (label === 'Actions') ? '' : 'Click to sort';

      const arrow = document.createElement('span');
      arrow.className = 'rb-sort-arrow';
      arrow.style.cssText = 'display:inline-block; margin-left:6px; font-weight:bold;';
      arrow.textContent = '';
      h.appendChild(arrow);
    });

    const clearArrows = () => {
      headers.forEach(h => {
        const a = h.querySelector('.rb-sort-arrow');
        if (a) a.textContent = '';
      });
    };

    headers.forEach((h, colIdx) => {
      const label = h.dataset.rbLabel;
      if (label === 'Actions') return;

      h.addEventListener('click', () => {
        const prevCol = Number(container.dataset.rbSortCol ?? -1);
        const prevDir = container.dataset.rbSortDir ?? 'asc';

        const dir = (prevCol === colIdx && prevDir === 'asc') ? 'desc' : 'asc';
        container.dataset.rbSortCol = String(colIdx);
        container.dataset.rbSortDir = dir;

        clearArrows();
        const arrowEl = h.querySelector('.rb-sort-arrow');
        if (arrowEl) arrowEl.textContent = (dir === 'asc') ? '▲' : '▼';

        const rows = getDataRows();

        const decorated = rows.map(tr => {
          const cell = getRowCells(tr)[colIdx];
          const raw = norm(cell ? cell.textContent : '');
          const parsed = parseValue(raw);
          return { tr, orig: parseInt(tr.dataset.rbOrigIndex || '0', 10), parsed };
        });

        decorated.sort((a, b) => {
          const A = a.parsed;
          const B = b.parsed;

          if (A.num !== null && B.num !== null) {
            const cmp = A.num - B.num;
            if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
          } else {
            const cmp = (A.str || '').localeCompare((B.str || ''), undefined, {
              numeric: true,
              sensitivity: 'base'
            });
            if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
          }
          return a.orig - b.orig;
        });

        decorated.forEach(({ tr }) => container.appendChild(tr));
      });
    });

    return { ok: true };
  }

  // =========================================================
  // APPLY PIPELINE
  // =========================================================
  async function apply() {
    replaceViewDataLinks();

    const headerRow = findSortableHeaderRow();
    if (!headerRow) return;

    const container = findContainer(headerRow);
    if (!container) return;

    // Rename headers
    renameHeaders(headerRow);

    // Update Notes column
    rewriteNotesColumn(headerRow, container);

    // Insert nav row under the existing "Product Combos" header
    ensureNavRowUnderProductCombosHeader();

    // Add Action separators
    formatActionCellSeparators(headerRow, container);

    // Populate Type column from comboedit.php (Buy X / Buy All)
    await populateBuyXFromComboEdit(headerRow, container);

     // Add sorting
    enableSorting(headerRow, container);
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;

    setTimeout(() => {
      scheduled = false;
      if (observer) observer.disconnect();

      (async () => {
        try {
          await apply();
        } catch (e) {
          console.warn('[TM] apply failed:', e);
        } finally {
          if (observer) observer.observe(document.documentElement, { childList: true, subtree: true });
        }
      })();

    }, THROTTLE_MS);
  }

  // Initial run (no top-level await)
  (async () => {
    try { await apply(); }
    catch (e) { console.warn('[TM] initial apply failed:', e); }
  })();

  observer = new MutationObserver(() => {
    scheduleApply();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

})()
