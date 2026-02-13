// ==UserScript==
// @name         customerdrill.php
// @version      1.3.1
// @description  Adds State and Status columns by fetching customeredit.php pages asynchronously (cached) + sortable headers.
// @match        https://beta.rewardsbutler.com/loy/customerdrill.php*
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      *.rewardsbutler.com
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/customerdrill.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/customerdrill.user.js
// @run-at       document-end
// ==/UserScript==

(() => {
  "use strict";

  // =========================================================
  // CONFIG
  // =========================================================
  const ENABLE_DEBUG_HUD = false;
  const CONCURRENCY = 20;
  const REQUEST_GAP_MS = 0;
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const CACHE_KEY = "rb_customer_state_cache_v2"; // Updated version for new cache structure

  // =========================================================
  // UTIL
  // =========================================================
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const now = () => performance.now();

  function norm(s) {
    return (s || "")
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[▲▼]\s*$/, "")
      .trim();
  }

  function absoluteUrl(href) {
    return new URL(href, location.href).toString();
  }

  // =========================================================
  // SORTING (robust, click-time col index)
  // =========================================================
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

    // Generic parse: numeric if clean number, else string
    const parseGeneric = (v) => {
      const cleaned = v.replace(/,/g, '');
      const isNumber = cleaned !== '' && /^-?\d+(\.\d+)?$/.test(cleaned);
      if (isNumber) return { kind: 'num', num: Number(cleaned), str: v.toLowerCase(), raw: v };
      return { kind: 'str', num: null, str: v.toLowerCase(), raw: v };
    };

    // Arrow UI
    headers.forEach(h => {
      if (h.querySelector('.rb-sort-arrow')) return;

      h.style.cursor = 'pointer';
      h.title = 'Click to sort';

      const arrow = document.createElement('span');
      arrow.className = 'rb-sort-arrow';
      arrow.style.cssText = 'display:inline-block; margin-left:6px; font-weight:bold;';
      arrow.textContent = '';
      h.appendChild(arrow);
    });

    headers.forEach((h) => {
      h.addEventListener('click', () => {
        // Compute current column index at click-time
        const headersNow = Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
        const colIdx = headersNow.indexOf(h);
        if (colIdx < 0) return;

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
          const raw = getCellText(tr, colIdx);
          const parsed = parseGeneric(raw);
          return {
            tr,
            orig: parseInt(tr.dataset.rbOrigIndex || '0', 10),
            parsed
          };
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
  // CACHE
  // =========================================================
  function loadCache() {
    try { return JSON.parse(GM_getValue(CACHE_KEY, "{}")); }
    catch { return {}; }
  }

  function saveCache(cache) {
    GM_setValue(CACHE_KEY, JSON.stringify(cache));
  }

  function getCached(cache, url) {
    const e = cache[url];
    if (!e) return null;
    if (!e.t || (Date.now() - e.t) > CACHE_TTL_MS) return null;
    return { state: e.state ?? null, status: e.status ?? null };
  }

  function setCached(cache, url, state, status) {
    cache[url] = { state, status, t: Date.now() };
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

  function extractState(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const input = doc.querySelector('input#State, input[name="State"]');
    const state = (input?.value || "").trim();
    return state || null;
  }

  function extractStatus(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Look for the select element with name="Active"
    const select = doc.querySelector('select[name="Active"]');
    if (!select) return null;

    // Find the selected option
    const selectedOption = select.querySelector('option[selected]');
    if (!selectedOption) {
      // If no selected attribute, check which option has value matching a default or first option
      const options = select.querySelectorAll('option');
      // Default to first option if none explicitly selected
      if (options.length > 0) {
        const firstValue = options[0].value;
        return firstValue === "1" ? "Active" : "Not Active";
      }
      return null;
    }

    const value = selectedOption.value;

    // Return "Active" for value="1", "Not Active" for value="0"
    if (value === "1") return "Active";
    if (value === "0") return "Not Active";

    return null;
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
  // DEBUG HUD
  // =========================================================
  function createHud() {
    if (!ENABLE_DEBUG_HUD) return null;

    const hud = document.createElement("div");
    hud.id = "rb-custdrill-hud";
    hud.style.cssText = `
      position:fixed; right:12px; bottom:12px; z-index:2147483647;
      width:420px; max-width:92vw; font:12px system-ui;
      background:rgba(255,255,255,0.97);
      border:1px solid rgba(0,0,0,.2);
      border-radius:10px;
      box-shadow:0 8px 24px rgba(0,0,0,.18);
      overflow:hidden;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      display:flex; justify-content:space-between; align-items:center;
      padding:8px 10px; border-bottom:1px solid rgba(0,0,0,.08);
      user-select:none;
    `;

    const title = document.createElement("div");
    title.textContent = "RB customerdrill Debug";
    title.style.fontWeight = "700";

    const btns = document.createElement("div");
    btns.style.display = "flex";
    btns.style.gap = "6px";

    const mkBtn = (txt) => {
      const b = document.createElement("button");
      b.textContent = txt;
      b.style.cssText = `
        padding:4px 8px; border:1px solid rgba(0,0,0,.2);
        border-radius:8px; background:#fff; cursor:pointer;
      `;
      return b;
    };

    const btnMin = mkBtn("Minimize");
    const btnClear = mkBtn("Clear cache");
    btns.append(btnClear, btnMin);

    header.append(title, btns);

    const body = document.createElement("div");
    body.style.cssText = `
      padding:10px; display:grid; grid-template-columns:1fr 1fr;
      gap:6px 12px;
    `;

    const fields = {};
    function add(label) {
      const k = document.createElement("div");
      k.textContent = label;
      k.style.opacity = "0.7";
      const v = document.createElement("div");
      v.textContent = "-";
      v.style.fontWeight = "600";
      body.append(k, v);
      fields[label] = v;
    }

    [
      "Header found",
      "Rows found",
      "Jobs",
      "Cached hits",
      "Fetched OK",
      "Fetch failed",
      "No State found",
      "No Status found",
      "DOM updated",
      "In-flight",
      "Elapsed (s)",
    ].forEach(add);

    const log = document.createElement("div");
    log.style.cssText = `
      border-top:1px solid rgba(0,0,0,.08);
      background:rgba(0,0,0,.02);
      padding:8px 10px;
      max-height:160px; overflow:auto; white-space:pre-wrap;
      font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    `;
    log.textContent = "";

    const pushLog = (line) => {
      const ts = new Date().toLocaleTimeString();
      log.textContent = `[${ts}] ${line}\n` + log.textContent;
    };

    hud.append(header, body, log);
    document.body.appendChild(hud);

    let minimized = false;
    btnMin.addEventListener("click", () => {
      minimized = !minimized;
      body.style.display = minimized ? "none" : "grid";
      log.style.display = minimized ? "none" : "block";
      btnMin.textContent = minimized ? "Restore" : "Minimize";
    });

    return {
      set: (k, v) => fields[k] && (fields[k].textContent = String(v)),
      log: pushLog,
      clearBtn: btnClear,
    };
  }

  // =========================================================
  // TABLE FINDER — matches Name | ID | City
  // =========================================================
  function findTargetTable() {
    const signature = ["Name", "ID", "City"];

    const headerCandidates = Array.from(document.querySelectorAll("tr"))
      .filter(tr => tr.querySelectorAll("td.formsubheader, th.formsubheader").length >= signature.length);

    for (const tr of headerCandidates) {
      const tds = Array.from(tr.querySelectorAll("td.formsubheader, th.formsubheader"));
      const texts = tds.slice(0, signature.length).map(td => norm(td.textContent));

      if (!signature.every((t, i) => texts[i] === t)) continue;

      const table = tr.closest("table.basic");
      if (!table) continue;

      return { table, headerTr: tr };
    }

    return null;
  }

  // =========================================================
  // PREP: Add State and Status headers + cells + create jobs
  // =========================================================
  function prepareTable(target, hud) {
    const { table, headerTr } = target;

    // Prevent running twice
    if (table.dataset.rbStateInjected === "1") {
      hud?.log?.("Already injected State and Status columns. Skipping prepare.");
      return null;
    }
    table.dataset.rbStateInjected = "1";

    const headerCells = Array.from(headerTr.querySelectorAll("td, th"));
    const headerTexts = headerCells.map(c => norm(c.textContent));

    const cityIdx = headerTexts.indexOf("City");
    if (cityIdx === -1) {
      hud?.log?.("City header not found — cannot insert State and Status columns.");
      return null;
    }

    // Insert State header after City
    const stateHeader = document.createElement("td");
    stateHeader.className = "formsubheader";
    stateHeader.textContent = "State";
    headerCells[cityIdx].insertAdjacentElement("afterend", stateHeader);

    // Insert Status header after State
    const statusHeader = document.createElement("td");
    statusHeader.className = "formsubheader";
    statusHeader.textContent = "Status";
    stateHeader.insertAdjacentElement("afterend", statusHeader);

    // Add State and Status cells in each row and collect jobs
    const rows = Array.from(table.querySelectorAll("tr.browse-item"));
    const jobs = [];

    rows.forEach(tr => {
      const cells = Array.from(tr.querySelectorAll("td, th"));
      const nameLink = tr.querySelector('td a[href*="customeredit.php"]');

      // Create new State cell
      const stateTd = document.createElement("td");
      stateTd.className = "td";
      stateTd.textContent = "…";
      stateTd.dataset.rbState = "pending";

      // Create new Status cell
      const statusTd = document.createElement("td");
      statusTd.className = "td";
      statusTd.textContent = "…";
      statusTd.dataset.rbStatus = "pending";

      // Insert after City cell (cityIdx)
      if (cells[cityIdx]) {
        cells[cityIdx].insertAdjacentElement("afterend", stateTd);
        stateTd.insertAdjacentElement("afterend", statusTd);
      } else {
        tr.appendChild(stateTd);
        tr.appendChild(statusTd);
      }

      if (nameLink) {
        const url = absoluteUrl(nameLink.getAttribute("href"));
        jobs.push({ tr, url, stateTd, statusTd });
      } else {
        stateTd.textContent = "";
        stateTd.dataset.rbState = "n/a";
        statusTd.textContent = "";
        statusTd.dataset.rbStatus = "n/a";
      }
    });

    hud?.set?.("Rows found", rows.length);
    hud?.set?.("Jobs", jobs.length);

    return { table, headerTr, jobs };
  }

  // =========================================================
  // ASYNC POPULATE STATE AND STATUS
  // =========================================================
  async function populateStates(prep, hud) {
    const start = now();
    let cache = loadCache();

    let cachedHits = 0, fetchedOk = 0, fetchFailed = 0, noState = 0, noStatus = 0, domUpdated = 0, inflight = 0;

    // Clear cache button
    if (hud?.clearBtn) {
      hud.clearBtn.onclick = () => {
        GM_deleteValue(CACHE_KEY);
        cache = {};
        hud.log("Cache cleared. Reload page to re-fetch.");
      };
    }

    // Apply cached first
    prep.jobs.forEach(j => {
      const cached = getCached(cache, j.url);
      if (cached && (cached.state !== null || cached.status !== null)) {
        if (cached.state !== null) {
          j.stateTd.textContent = cached.state;
          j.stateTd.dataset.rbState = "done";
        }
        if (cached.status !== null) {
          j.statusTd.textContent = cached.status;
          j.statusTd.dataset.rbStatus = "done";
        }
        cachedHits++;
        domUpdated++;
      }
    });

    hud?.set?.("Cached hits", cachedHits);
    hud?.set?.("DOM updated", domUpdated);

    const jobsToFetch = prep.jobs.filter(j => {
      const cached = getCached(cache, j.url);
      return !cached || (cached.state === null && cached.status === null);
    });
    hud?.log?.(`Fetching ${jobsToFetch.length} customeredit pages for State and Status...`);

    await runPool(jobsToFetch, async (job) => {
      inflight++;
      hud?.set?.("In-flight", inflight);

      try {
        const html = await fetchHtml(job.url);
        const state = extractState(html);
        const status = extractStatus(html);

        // Update State
        if (state) {
          job.stateTd.textContent = state;
          job.stateTd.dataset.rbState = "done";
        } else {
          job.stateTd.textContent = "";
          job.stateTd.dataset.rbState = "done";
          noState++;
        }

        // Update Status
        if (status) {
          job.statusTd.textContent = status;
          job.statusTd.dataset.rbStatus = "done";
        } else {
          job.statusTd.textContent = "";
          job.statusTd.dataset.rbStatus = "done";
          noStatus++;
        }

        setCached(cache, job.url, state || "", status || "");
        fetchedOk++;
        domUpdated++;

      } catch (e) {
        job.stateTd.textContent = "ERR";
        job.stateTd.title = String(e);
        job.stateTd.dataset.rbState = "error";

        job.statusTd.textContent = "ERR";
        job.statusTd.title = String(e);
        job.statusTd.dataset.rbStatus = "error";

        fetchFailed++;
      } finally {
        inflight--;
        hud?.set?.("Fetched OK", fetchedOk);
        hud?.set?.("Fetch failed", fetchFailed);
        hud?.set?.("No State found", noState);
        hud?.set?.("No Status found", noStatus);
        hud?.set?.("DOM updated", domUpdated);
        hud?.set?.("In-flight", inflight);
        hud?.set?.("Elapsed (s)", ((now() - start) / 1000).toFixed(1));
        if (REQUEST_GAP_MS) await sleep(REQUEST_GAP_MS);
      }
    }, CONCURRENCY);

    saveCache(cache);
    hud?.set?.("Elapsed (s)", ((now() - start) / 1000).toFixed(2));
    hud?.log?.("State and Status population complete.");
  }

  // =========================================================
  // MAIN
  // =========================================================
  async function main() {
    const hud = createHud();

    const target = findTargetTable();
    hud?.set?.("Header found", target ? "YES" : "NO");

    if (!target) {
      hud?.log?.("Target table not found. Verify header row has formsubheader cells: Name | ID | City.");
      return;
    }

    const prep = prepareTable(target, hud);
    if (!prep) return;

    // Bind sorting on the correct table AFTER State and Status columns are injected
    enableSorting(prep.headerTr, prep.table);

    await populateStates(prep, hud);
  }

  main();
})();
