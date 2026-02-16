// ==UserScript==
// @name         userbrowse.php
// @version      2.3.2
// @description  Populate emails from useredit.php, skip already-email links, add sortable headers, optional debug HUD with sorting diagnostics.
// @match        https://*.rewardsbutler.com/admin/userbrowse.php*
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @connect      *.rewardsbutler.com
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/userbrowse.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/userbrowse.user.js
// @run-at       document-end
// ==/UserScript==

(() => {
  "use strict";

  // =========================================================
  // TOGGLES / CONFIG (top of script)
  // =========================================================
  const ENABLE_DEBUG_HUD = false;      // set false to hide debug HUD completely
  const ENABLE_SORTING = true;        // set true to enable table sorting
  const CONCURRENCY = 40;             // safer default for large tables
  const MIN_CONCURRENCY = 10;
  const MAX_CONCURRENCY = 60;
  const REQUEST_GAP_MS = 10;           // add small delay (e.g., 25-100) if needed
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const CACHE_KEY = "rb_email_cache_v5";
  const HUD_UPDATE_INTERVAL_MS = 200;
  const DOM_FLUSH_INTERVAL_MS = 75;

  // =========================================================
  // UTIL
  // =========================================================
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const now = () => performance.now();

  // Normalizer copied in spirit from your prizebrowse.php
  function norm(s) {
    return (s || "")
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[▲▼]\s*$/, "")
      .trim();
  }

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
    return e.email || null;
  }
  function setCached(cache, url, email) {
    cache[url] = { email, t: Date.now() };
  }
  function absoluteUrl(href) {
    return new URL(href, location.href).toString();
  }

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

  function extractEmail(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const input = doc.querySelector('input[name="email_address"]');
    const email = (input?.value || "").trim();
    return email.includes("@") ? email : null;
  }

  // =========================================================
  // DEBUG HUD (toggleable)
  // =========================================================
  function createHud() {
    if (!ENABLE_DEBUG_HUD) return null;

    const hud = document.createElement("div");
    hud.id = "rb-hud";
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
    title.textContent = "RB Debug";
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
    const add = (label) => {
      const k = document.createElement("div");
      k.textContent = label;
      k.style.opacity = "0.7";
      const v = document.createElement("div");
      v.textContent = "-";
      v.style.fontWeight = "600";
      body.append(k, v);
      fields[label] = v;
    };

    [
      // email stats
      "Total links",
      "Skipped (@ in text)",
      "Unique URLs",
      "Cached hits",
      "Fetched OK",
      "Fetch failed",
      "No email found",
      "DOM updated",
      "In-flight",
      "Elapsed (s)",
      "Concurrency",
      "Flush avg (ms)",
      "Flush max (ms)",
      "Flush count",
      // sorting stats
      "Sort rows found",
      "Last sort col",
      "Last sort dir",
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
      hide: () => (hud.style.display = "none"),
      show: () => (hud.style.display = "block"),
      isVisible: () => hud.style.display !== "none",
    };
  }

  function createDomBatcher(hud) {
    const pending = new Map();
    let timer = null;
    let flushing = false;
    let flushCount = 0;
    let flushTotalMs = 0;
    let flushMaxMs = 0;
    let lastFlushMs = 0;

    function updateHud() {
      if (!hud?.set) return;
      const avg = flushCount ? (flushTotalMs / flushCount) : 0;
      hud.set("Flush avg (ms)", avg.toFixed(2));
      hud.set("Flush max (ms)", flushMaxMs.toFixed(2));
      hud.set("Flush count", flushCount);
    }

    function flushNow() {
      timer = null;
      if (!pending.size || flushing) return;
      flushing = true;
      const start = now();
      for (const [a, text] of pending) {
        a.textContent = text;
      }
      pending.clear();
      lastFlushMs = now() - start;
      flushCount++;
      flushTotalMs += lastFlushMs;
      flushMaxMs = Math.max(flushMaxMs, lastFlushMs);
      flushing = false;
      updateHud();
    }

    function scheduleFlush() {
      if (timer !== null) return;
      timer = window.setTimeout(flushNow, DOM_FLUSH_INTERVAL_MS);
    }

    async function drain() {
      if (timer !== null) {
        clearTimeout(timer);
        flushNow();
      } else if (pending.size) {
        flushNow();
      }
    }

    return {
      set: (a, text) => {
        pending.set(a, text);
        scheduleFlush();
      },
      drain,
      stats: () => ({
        lastFlushMs,
        flushCount,
      }),
    };
  }

  // =========================================================
  // TABLE FINDER (by header signature) — more tolerant
  // =========================================================
  function findTargetTable() {
    const headerCells = ["Login", "Name", "Org type", "Org name", "Database", "Actions"];

    const rows = Array.from(document.querySelectorAll("tr"));
    for (const tr of rows) {
      const tds = Array.from(tr.querySelectorAll("td.formsubheader, th.formsubheader"));
      if (tds.length !== headerCells.length) continue;

      const texts = tds.map(td => norm(td.textContent));
      if (!texts.every((t, i) => t === headerCells[i])) continue;

      const table = tr.closest("table");
      if (!table) continue;

      return { table, headerTr: tr };
    }
    return null;
  }

  // =========================================================
  // SORTING — copied in spirit from prizebrowse.php
  // (bind once, store labels, arrow spans, stable tie-break, re-append)
  // =========================================================
    function enableSortingNestedSafe(target, hud) {
        if (!ENABLE_SORTING) return;
        if (!target?.headerTr) return;

        const headerTr = target.headerTr;

        // Prevent double-binding
        if (headerTr.dataset.rbSortBound === "1") return;
        headerTr.dataset.rbSortBound = "1";

        const headers = Array.from(headerTr.querySelectorAll("td.formsubheader, th.formsubheader"));
        if (!headers.length) {
            hud?.log?.("SORT: no header cells found.");
            return;
        }

        // Cache original header labels (strip arrows/nbsp)
        headers.forEach(h => {
            if (!h.dataset.rbLabel) h.dataset.rbLabel = norm(h.textContent);
        });

        // ✅ The critical change: use the header row's *actual parent*.
        // Usually TBODY; sometimes TABLE.
        const rowParent = headerTr.parentElement;
        if (!rowParent) {
            hud?.log?.("SORT: headerTr has no parentElement.");
            return;
        }

        // Style + arrow UI
        let style = document.getElementById("rb-userbrowse-sort-style");
        if (!style) {
            style = document.createElement("style");
            style.id = "rb-userbrowse-sort-style";
            style.textContent = `
    .rb-sortable { cursor:pointer; user-select:none; }
    .rb-sort-arrow { display:inline-block; margin-left:6px; font-weight:bold; }
  `;
            document.head.appendChild(style);
        }

        headers.forEach(h => {
            if (!h.querySelector(".rb-sort-arrow")) {
                const arrow = document.createElement("span");
                arrow.className = "rb-sort-arrow";
                arrow.textContent = "";
                h.appendChild(arrow);
            }
        });

        const clearArrows = () => {
            headers.forEach(h => {
                const a = h.querySelector(".rb-sort-arrow");
                if (a) a.textContent = "";
            });
        };

        const getCellText = (tr, colIdx) => {
            const cell = tr.querySelectorAll("td, th")[colIdx];
            return norm(cell ? cell.textContent : "");
        };

        const parseGeneric = (v) => {
            const cleaned = v.replace(/,/g, "");
            const isNumber = cleaned !== "" && /^-?\d+(\.\d+)?$/.test(cleaned);
            return isNumber
                ? { num: Number(cleaned), str: v.toLowerCase() }
            : { num: null, str: v.toLowerCase() };
        };

        // ✅ Identify the sortable "data block" as contiguous TR siblings after headerTr.
        // Stop when we hit a row that doesn't look like a data row.
        function getDataBlock() {
            const gridTable = headerTr.closest("table");
            if (!gridTable) return { rows: [], parent: null, marker: null };

            // ✅ Get all browse-item rows inside the header’s table
            const allRows = Array.from(gridTable.querySelectorAll("tr.browse-item"));
            if (!allRows.length) return { rows: [], parent: null, marker: null };

            // If somehow multiple parents exist, pick the parent with the most rows
            const byParent = new Map();
            for (const tr of allRows) {
                const p = tr.parentElement;
                if (!p) continue;
                const arr = byParent.get(p) || [];
                arr.push(tr);
                byParent.set(p, arr);
            }
            if (!byParent.size) return { rows: [], parent: null, marker: null };

            let parent = null;
            let rows = [];
            for (const [p, arr] of byParent.entries()) {
                if (arr.length > rows.length) { parent = p; rows = arr; }
            }

            // ✅ Create a stable marker BEFORE the first row (marker is not moved)
            const marker = document.createComment("rb-sort-marker");
            parent.insertBefore(marker, rows[0]);

            return { rows, parent, marker };
        }


        // Stable original order (tie-break)
        // Use sibling-order index within rowParent
        function ensureOrigIndex(rows) {
            rows.forEach((tr, i) => {
                if (!tr.dataset.rbOrigIndex) tr.dataset.rbOrigIndex = String(i);
            });
        }

        headers.forEach((h, colIdx) => {
            const label = (h.dataset.rbLabel || "");
            const isActions = label.toLowerCase() === "actions";
            if (isActions) return;

            h.classList.add("rb-sortable");
            h.title = "Click to sort";

            h.addEventListener("click", () => {
                const prevCol = Number(rowParent.dataset.rbSortCol ?? -1);
                const prevDir = rowParent.dataset.rbSortDir ?? "asc";
                const dir = (prevCol === colIdx && prevDir === "asc") ? "desc" : "asc";

                rowParent.dataset.rbSortCol = String(colIdx);
                rowParent.dataset.rbSortDir = dir;

                clearArrows();
                const arrowEl = h.querySelector(".rb-sort-arrow");
                if (arrowEl) arrowEl.textContent = (dir === "asc") ? "▲" : "▼";

                const { rows, parent, marker } = getDataBlock();

                hud?.set?.("Sort rows found", rows.length);
                hud?.set?.("Last sort col", `${colIdx} (${label})`);
                hud?.set?.("Last sort dir", dir);

                if (!parent || !marker || rows.length < 2) {
                    if (marker?.parentNode) marker.remove();
                    hud?.log?.(`SORT: only ${rows.length} rows in data block.`);
                    return;
                }

                // Stable order tie-break
                ensureOrigIndex(rows);

                // ✅ Build decorated list (this is what you’re missing)
                const decorated = rows.map(tr => {
                    const raw = getCellText(tr, colIdx);
                    const parsed = parseGeneric(raw);
                    return {
                        tr,
                        orig: parseInt(tr.dataset.rbOrigIndex || "0", 10),
                        parsed
                    };
                });

                // ✅ Sort
                decorated.sort((a, b) => {
                    const A = a.parsed;
                    const B = b.parsed;

                    if (A.num !== null && B.num !== null) {
                        const cmp = A.num - B.num;
                        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
                    } else {
                        const cmp = (A.str || "").localeCompare((B.str || ""), undefined, {
                            numeric: true,
                            sensitivity: "base"
                        });
                        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
                    }

                    return a.orig - b.orig; // stable tie-break
                });

                // ✅ Reinsert into the actual data parent at the anchor
                const frag = document.createDocumentFragment();
                decorated.forEach(({ tr }) => frag.appendChild(tr));

                // Insert after marker (marker stays put)
                parent.insertBefore(frag, marker.nextSibling);

                // Clean up marker
                marker.remove();
            });
        });

        hud?.log?.("Sorting enabled: sorts tr.browse-item within the header's closest table.");
    }

  // =========================================================
  // EMAIL POPULATION
  // =========================================================
  async function populateEmails(hud) {
    const start = now();
    let cache = loadCache();
    const domBatcher = createDomBatcher(hud);

    const allLinks = Array.from(document.querySelectorAll('td a[href^="useredit.php"]'));
    const skippedLinks = allLinks.filter(a => (a.textContent || "").includes("@"));
    const links = allLinks.filter(a => !(a.textContent || "").includes("@"));

    const jobs = links.map(a => {
      const url = absoluteUrl(a.getAttribute("href"));
      return { a, url, cached: getCached(cache, url) };
    });
    const uniqueUrls = new Set(jobs.map(j => j.url));

    let cachedHits = 0, fetchedOk = 0, fetchFailed = 0, noEmail = 0, domUpdated = 0, inflight = 0;
    let currentConcurrency = CONCURRENCY;
    let completedFetches = 0;
    let hudTimer = null;

    hud?.set?.("Total links", allLinks.length);
    hud?.set?.("Skipped (@ in text)", skippedLinks.length);
    hud?.set?.("Unique URLs", uniqueUrls.size);
    hud?.set?.("Concurrency", currentConcurrency);

    function scheduleHudUpdate() {
      if (!hud?.set || hudTimer !== null) return;
      hudTimer = window.setTimeout(() => {
        hudTimer = null;
        hud.set("Fetched OK", fetchedOk);
        hud.set("Fetch failed", fetchFailed);
        hud.set("No email found", noEmail);
        hud.set("DOM updated", domUpdated);
        hud.set("In-flight", inflight);
        hud.set("Elapsed (s)", ((now() - start) / 1000).toFixed(1));
      }, HUD_UPDATE_INTERVAL_MS);
    }

    // Apply cached first
    for (const j of jobs) {
      if (j.cached) {
        domBatcher.set(j.a, j.cached);
        cachedHits++;
        domUpdated++;
      }
    }
    hud?.set?.("Cached hits", cachedHits);
    hud?.set?.("DOM updated", domUpdated);

    await domBatcher.drain();

    const jobsToFetch = jobs.filter(j => !j.cached);
    hud?.log?.(`Email pass: ${jobsToFetch.length} fetches needed (concurrency=${CONCURRENCY}).`);

    // cache clear button
    if (hud?.clearBtn) {
      hud.clearBtn.onclick = () => {
        GM_deleteValue(CACHE_KEY);
        cache = {};
        hud.log("Cache cleared. Reload page to re-fetch emails.");
        hud.set("Cached hits", 0);
      };
    }

    await new Promise((resolve) => {
      let cursor = 0;
      let active = 0;

      const tuneConcurrency = () => {
        const lag = domBatcher.stats().lastFlushMs;
        if (lag > 32 && currentConcurrency > MIN_CONCURRENCY) {
          currentConcurrency = Math.max(MIN_CONCURRENCY, currentConcurrency - 5);
        } else if (lag < 8 && currentConcurrency < MAX_CONCURRENCY) {
          currentConcurrency = Math.min(MAX_CONCURRENCY, currentConcurrency + 1);
        }
        hud?.set?.("Concurrency", currentConcurrency);
      };

      const maybeDone = () => {
        if (cursor >= jobsToFetch.length && active === 0) {
          resolve();
        }
      };

      const launch = () => {
        while (active < currentConcurrency && cursor < jobsToFetch.length) {
          const job = jobsToFetch[cursor++];
          active++;
          inflight++;
          scheduleHudUpdate();

          (async () => {
            try {
              const html = await fetchHtml(job.url);
              const email = extractEmail(html);

              if (email) {
                setCached(cache, job.url, email);
                domBatcher.set(job.a, email);
                domUpdated++;
                fetchedOk++;
              } else {
                noEmail++;
                fetchedOk++;
              }
            } catch {
              fetchFailed++;
            } finally {
              active--;
              inflight--;
              completedFetches++;
              if (completedFetches % 25 === 0) tuneConcurrency();
              scheduleHudUpdate();
              if (REQUEST_GAP_MS) await sleep(REQUEST_GAP_MS);
              launch();
              maybeDone();
            }
          })();
        }
      };

      launch();
      maybeDone();
    });

    await domBatcher.drain();
    if (hudTimer !== null) {
      clearTimeout(hudTimer);
      hudTimer = null;
    }
    hud?.set?.("Fetched OK", fetchedOk);
    hud?.set?.("Fetch failed", fetchFailed);
    hud?.set?.("No email found", noEmail);
    hud?.set?.("DOM updated", domUpdated);
    hud?.set?.("In-flight", inflight);
    saveCache(cache);
    hud?.set?.("Elapsed (s)", ((now() - start) / 1000).toFixed(2));
    hud?.log?.(`Email pass complete. ok=${fetchedOk}, failed=${fetchFailed}, noEmail=${noEmail}.`);
  }

  // =========================================================
  // Optional HUD hotkey toggle (Ctrl+Shift+D)
  // =========================================================
  function installHudHotkey(hud) {
    if (!hud) return;
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        if (hud.isVisible()) hud.hide(); else hud.show();
      }
    }, { capture: true });
  }

  // =========================================================
  // MAIN
  // =========================================================
  async function main() {
    const hud = createHud();
    installHudHotkey(hud);

    const target = findTargetTable();

    if (!target) {
      hud?.log?.("Target table not found (header signature mismatch). Sorting not bound.");
      await populateEmails(hud);
      return;
    }

    enableSortingNestedSafe(target, hud);
    await populateEmails(hud);
  }

  main();
})();
