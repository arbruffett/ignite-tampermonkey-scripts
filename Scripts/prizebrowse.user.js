// ==UserScript==
// @name         prizebrowse.php
// @match        https://beta.rewardsbutler.com/loy/prizebrowse.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.1
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/prizebrowse.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/prizebrowse.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const DEBUG = false;
    const REMOVE_HEADERS = new Set(['Promo', 'View Winners', 'Max']);
    const THROTTLE_MS = 300;
    const MEMBER_GROUP_RE = /^Member Group\s+\d+$/i;
    const PROMO_RE = /^Promo\s+\d+\s*$/i;
    const ALWAYS_RE = /^Always$/i;

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

    // ===== HUD =====
    function ensureHud() {
        let hud = document.getElementById('rb-prizebrowse-hud');
        if (!hud) {
            hud = document.createElement('div');
            hud.id = 'rb-prizebrowse-hud';
            hud.style.cssText = `
        position:fixed; bottom:10px; right:10px; z-index:999999;
        background:#111; color:#eee; padding:10px; border-radius:8px;
        font:12px/1.4 monospace; max-width:520px; max-height:45vh; overflow:auto;
        box-shadow:0 2px 12px rgba(0,0,0,.4);
      `;
            document.body.appendChild(hud);
        }
        return hud;
    }

    function formatGiven(n) {
        if (!Number.isFinite(n)) return null;
        return n.toLocaleString('en-US');
    }

    function updateGivenColumn(headerRow, container) {
        if (!headerRow || !container)
            return { ok: false, reason: 'missing headerRow/container' };

        const headerCells = Array.from(
            headerRow.querySelectorAll('td.formsubheader, th.formsubheader')
        );
        const headerTexts = headerCells.map((c) => norm(c.textContent));

        const givenIdx = headerTexts.indexOf('Given');
        if (givenIdx === -1) return { ok: false, reason: '"Given" header not found' };

        let scanned = 0;
        let changed = 0;

        const rows = Array.from(container.querySelectorAll('tr'));
        rows.forEach((tr) => {
            if (tr === headerRow) return;

            const cells = Array.from(tr.querySelectorAll('td, th'));
            const cell = cells[givenIdx];
            if (!cell) return;

            const raw = norm(cell.textContent);
            if (!raw) return;

            // digits only per your note
            if (!/^\d+$/.test(raw)) return;

            scanned++;
            const n = Number(raw);
            const pretty = formatGiven(n);
            cell.dataset.rbRawNum = raw; // keep original digits as string for sorting
            if (pretty && pretty !== raw) {
                cell.textContent = pretty;
                changed++;
            }
        });

        return { ok: true, scanned, changed, givenIdx };
    }

    function replaceTypeColumnValues(headerRow, container) {
        if (!headerRow || !container) {
            return { ok: false, reason: 'missing headerRow/container' };
        }

        const TYPE_REPLACEMENTS = {
            'When specified product is purchased': '18',
            'Product combo': '21',
            'After sufficient purchases of a product': '17',
            'Method of payment': '24', // default unless overridden by Description link ending in "get"
            'Mix and Match <3': '29',
            'Filler for integrated solutions only': '19',
            'If member is registered': '20',
            'Fuel transaction': '25',
            Filler: '60',
            'Purchase dollars': '08',
            'Purchase gallons': '09',
            'Member gallons': '06',
            'Birthday': '10',
            '[n]th issue for member': '05',
            Regulated: '50',
            'ISO prefix': '26',
            '[n]th issue in date range': '12'
        };

        const headerCells = Array.from(
            headerRow.querySelectorAll('td.formsubheader, th.formsubheader')
        );
        const headerTexts = headerCells.map((c) => norm(c.textContent));

        const typeIdx = headerTexts.indexOf('Type');
        if (typeIdx === -1) {
            return { ok: false, reason: '"Type" header not found' };
        }

        const descIdx = headerTexts.indexOf('Description');
        // If Description isn't found, we can still do normal replacements.
        // Only the special "Method of payment" -> 27 rule will be skipped.

        let scanned = 0;
        let replaced = 0;

        const rows = Array.from(container.querySelectorAll('tr'));

        rows.forEach((tr) => {
            if (tr === headerRow) return;

            const cells = Array.from(tr.querySelectorAll('td, th'));
            const cell = cells[typeIdx];
            if (!cell) return;

            const original = norm(cell.textContent);
            if (!original) return;

            scanned++;

            // Special case:
            // If Type is "Method of payment", look at Description link's last 3 chars.
            if (original === 'Method of payment') {
                let use27 = false;

                if (descIdx !== -1) {
                    const descCell = cells[descIdx];
                    const link = descCell ? descCell.querySelector('a') : null;
                    const linkText = link ? norm(link.textContent) : '';

                    if (linkText.slice(-3).toLowerCase() === 'get') {
                        use27 = true;
                    }
                }

                cell.textContent = use27 ? '27' : '24';
                replaced++;
            }
            // Normal mapped replacements
            else if (Object.prototype.hasOwnProperty.call(TYPE_REPLACEMENTS, original)) {
                cell.textContent = TYPE_REPLACEMENTS[original];
                replaced++;
            }
            // Pattern-based replacements
            else if (MEMBER_GROUP_RE.test(original)) {
                cell.textContent = '16';
                replaced++;
            } else if (PROMO_RE.test(original)) {
                cell.textContent = '16';
                replaced++;
            } else if (ALWAYS_RE.test(original)) {
                cell.textContent = '16';
                replaced++;
            }

            // Center the value (always)
            cell.style.textAlign = 'center';
            cell.style.verticalAlign = 'middle';
        });

        // Also center the "Type" header itself for consistency
        const headerCell = headerCells[typeIdx];
        if (headerCell) {
            headerCell.style.textAlign = 'center';
            headerCell.style.verticalAlign = 'middle';
        }

        return { ok: true, scanned, replaced, typeIdx, descIdx };
    }

    function enableSorting(headerRow, container) {
        const headers = Array.from(
            headerRow.querySelectorAll('td.formsubheader, th.formsubheader')
        );
        if (!headers.length) return { ok: false, reason: 'no headers found' };

        // Prevent double-binding
        if (headerRow.dataset.rbSortBound === '1'){
            return { ok: true, reason: 'already bound' };
        }
        headerRow.dataset.rbSortBound = '1';

        // Cache original header labels (so arrows don't affect matching)
        headers.forEach((h) => {
            if (!h.dataset.rbLabel) h.dataset.rbLabel = norm(h.textContent);
        });

        // Identify headerRow position and data rows (rows after headerRow)
        const allRows = Array.from(container.querySelectorAll('tr'));
        const headerIdx = allRows.indexOf(headerRow);

        // Mark original order once for stable tie-breaking
        allRows.forEach((tr, i) => {
            if (!tr.dataset.rbOrigIndex) tr.dataset.rbOrigIndex = String(i);
        });

        const getDataRows = () => {
            const rowsNow = Array.from(container.querySelectorAll('tr'));
            const hIdxNow = rowsNow.indexOf(headerRow);
            return rowsNow
                .slice(hIdxNow + 1)
                .filter(
                (tr) => tr.querySelectorAll('td, th').length >= headers.length
            );
        };

        const getSortValue = (tr, colIdx, label) => {
            const cell = tr.querySelectorAll('td, th')[colIdx];
            if (!cell) return '';

            // ✅ For "Given", sort by original numeric value if present
            if (label === 'Given') {
                const raw = cell.dataset.rbRawNum || norm(cell.textContent);
                return raw;
            }

            return norm(cell.textContent);
        };

        // Arrow UI: add a span to each header (without altering its label)
        headers.forEach((h) => {
            if (h.querySelector('.rb-sort-arrow')) return;

            h.style.cursor = h.dataset.rbLabel === 'Actions' ? 'default' : 'pointer';
            h.title = h.dataset.rbLabel === 'Actions' ? '' : 'Click to sort';

            const arrow = document.createElement('span');
            arrow.className = 'rb-sort-arrow';
            arrow.style.cssText =
                'display:inline-block; margin-left:6px; font-weight:bold;';
            arrow.textContent = '';
            h.appendChild(arrow);
        });

        const clearArrows = () => {
            headers.forEach((h) => {
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
                str: v.toLowerCase(),
            };
        };

        // Generic parse: numeric if clean number, else string
        const parseGeneric = (v) => {
            const cleaned = v.replace(/,/g, '');
            const isNumber = cleaned !== '' && /^-?\d+(\.\d+)?$/.test(cleaned);
            if (isNumber)
                return { kind: 'num', num: Number(cleaned), str: v.toLowerCase() };
            return { kind: 'str', num: null, str: v.toLowerCase() };
        };

        headers.forEach((h, colIdx) => {
            const label = h.dataset.rbLabel;

            if (label === 'Actions') return;

            h.addEventListener('click', () => {
                const prevCol = Number(container.dataset.rbSortCol ?? -1);
                const prevDir = container.dataset.rbSortDir ?? 'asc';

                const dir =
                      prevCol === colIdx && prevDir === 'asc' ? 'desc' : 'asc';
                container.dataset.rbSortCol = String(colIdx);
                container.dataset.rbSortDir = dir;

                // Update arrows
                clearArrows();
                const arrowEl = h.querySelector('.rb-sort-arrow');
                if (arrowEl) arrowEl.textContent = dir === 'asc' ? '▲' : '▼';

                const rows = getDataRows();

                const decorated = rows.map((tr) => {
                    const raw = getSortValue(tr, colIdx, label);

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
                        parsed,
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
                                ? A.isNonDigit - B.isNonDigit
                            : B.isNonDigit - A.isNonDigit;
                        }
                        // both digits
                        if (!A.isNonDigit && !B.isNonDigit) {
                            const cmp = A.num - B.num;
                            if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
                        } else {
                            // both non-digit: string compare
                            const cmp = A.str.localeCompare(B.str, undefined, {
                                numeric: true,
                                sensitivity: 'base',
                            });
                            if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
                        }
                    } else {
                        // Type forced string
                        if (A.kind === 'type' && B.kind === 'type') {
                            const cmp = A.str.localeCompare(B.str, undefined, {
                                numeric: true,
                                sensitivity: 'base',
                            });
                            if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
                        } else {
                            // Generic: numeric if both numeric; else string
                            if (
                                A.kind === 'generic' &&
                                B.kind === 'generic' &&
                                A.num !== null &&
                                B.num !== null
                            ) {
                                const cmp = A.num - B.num;
                                if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
                            } else {
                                const cmp = (A.str || '').localeCompare(B.str || '', undefined, {
                                    numeric: true,
                                    sensitivity: 'base',
                                });
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

    function setHud(lines) {
        if (!DEBUG) return;
        const hud = ensureHud();
        hud.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
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
        rows.forEach((tr) => {
            const cells = getRowCells(tr);
            indexesDesc.forEach((idx) => {
                if (idx >= 0 && idx < cells.length) {
                    cells[idx].remove();
                    removed++;
                }
            });
        });
        return { removed, rows: rows.length };
    }

    function updateColspans(container, newColCount) {
        const table = container.closest('table') || (container.tagName?.toLowerCase() === 'table' ? container : null);
        if (!table) return 0;

        let updated = 0;

        // Class is on the TDs (per your HTML)
        table.querySelectorAll('td.formheader[colspan], td.tdcenter[colspan]').forEach((td) => {
            td.setAttribute('colspan', String(newColCount));
            updated++;
        });

        return updated;
    }

    function apply() {
        runs++;

        const headerRow = findHeaderRow();
        const headerRowFound = !!headerRow;

        let container = null;
        let containerType = '(none)';
        let headerTexts = [];
        let headerCountBefore = 0;
        let headerCountAfter = 0;
        let indexesToRemove = [];
        let removedCells = 0;
        let rowsSeen = 0;
        let colspanUpdated = 0;

        if (headerRow) {
            const headerCells = getHeaderCells(headerRow);
            headerCountBefore = headerCells.length;
            headerTexts = headerCells.map((c) => norm(c.textContent));

            headerTexts.forEach((txt, idx) => {
                if (REMOVE_HEADERS.has(txt)) indexesToRemove.push(idx);
            });

            container = findContainer(headerRow);
            containerType = container ? container.tagName.toLowerCase() : '(none)';

            if (container && indexesToRemove.length) {
                const indexesDesc = indexesToRemove.slice().sort((a, b) => b - a);
                const res = removeColumns(container, indexesDesc);
                const typeReplaceRes = replaceTypeColumnValues(headerRow, container);
                const givenRes = updateGivenColumn(headerRow, container);
                enableSorting(headerRow, container);
                const analyzeRes = removeAnalyzeLinks(headerRow, container);
                const formatSepRet = formatActionCellSeparators(headerRow, container);
                removedCells = res.removed;
                rowsSeen = res.rows;

                headerCountAfter = getHeaderCells(headerRow).length;
                colspanUpdated = updateColspans(container, headerCountAfter);
            } else {
                headerCountAfter = headerCountBefore;
            }
        }

        function formatActionCellSeparators(headerRow, container) {
            if (!headerRow || !container) {
                return { ok: false, reason: 'missing headerRow/container' };
            }

            const headerCells = Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
            const headerTexts = headerCells.map((c) => norm(c.textContent));

            const actionsIdx = headerTexts.indexOf('Actions');
            if (actionsIdx === -1) {
                return { ok: false, reason: '"Actions" header not found' };
            }

            let scanned = 0;
            let changed = 0;

            const rows = Array.from(container.querySelectorAll('tr'));

            rows.forEach((tr) => {
                if (tr === headerRow) return;

                const cells = Array.from(tr.querySelectorAll('td, th'));
                const cell = cells[actionsIdx];
                if (!cell) return;

                scanned++;

                // Grab only the remaining links (after you removed Analyze/Reset/Rerun)
                const links = Array.from(cell.querySelectorAll('a'));
                if (links.length <= 1) return;

                // Rebuild HTML as: <a>...</a> <strong>|</strong> <a>...</a> ...
                const sep = ` <strong>|</strong> `;
                const newHtml = links.map((a) => a.outerHTML).join(sep);

                if (newHtml !== cell.innerHTML) {
                    cell.innerHTML = newHtml;
                    changed++;
                }
            });

            return { ok: true, scanned, changed, actionsIdx };
        }

        function removeAnalyzeLinks(headerRow, container) {
            if (!headerRow || !container) {
                return { ok: false, reason: 'missing headerRow/container' };
            }

            const headerCells = Array.from(headerRow.querySelectorAll('td.formsubheader, th.formsubheader'));
            const headerTexts = headerCells.map((c) => norm(c.textContent));

            const actionsIdx = headerTexts.indexOf('Actions');
            if (actionsIdx === -1) {
                return { ok: false, reason: '"Actions" header not found' };
            }

            // ✅ Add the texts you want removed
            const REMOVE_TEXT = new Set(['Analyze', 'Reset', 'Rerun']);

            let removed = 0;
            let scanned = 0;

            const rows = Array.from(container.querySelectorAll('tr'));

            rows.forEach((tr) => {
                if (tr === headerRow) return;

                const cells = Array.from(tr.querySelectorAll('td, th'));
                const cell = cells[actionsIdx];
                if (!cell) return;

                scanned++;

                Array.from(cell.querySelectorAll('a')).forEach((a) => {
                    const t = norm(a.textContent);
                    if (REMOVE_TEXT.has(t)) {
                        a.remove();
                        removed++;
                    }
                });
            });

            return { ok: true, scanned, removed, actionsIdx };
        }

        setHud([
            `Runs: ${runs}`,
            `URL: ${location.pathname}${location.search}`,
            `headerRow (tr containing td.formsubheader): ${headerRowFound ? 'FOUND' : 'NOT FOUND'}`,
            `container: ${container ? 'FOUND' : 'NOT FOUND'} (${containerType})`,
            `headers before: ${headerCountBefore}`,
            `headers after: ${headerCountAfter}`,
            `target headers: ${Array.from(REMOVE_HEADERS).join(' | ')}`,
            `found indexes: ${indexesToRemove.length ? indexesToRemove.join(', ') : '(none)'}`,
            `rows processed: ${rowsSeen || '(unknown)'}`,
            `cells removed: ${removedCells}`,
            `colspan cells updated (td.formheader/td.tdcenter): ${colspanUpdated}`,
            `Analyze links removed: ${analyzeRes?.removed ?? 0}`,
            `headers: ${headerTexts.join(' | ') || '(none)'}`,
        ]);
    }

    function scheduleApply() {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            if (observer) observer.disconnect();
            try {
                apply();
            } finally {
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
})()
