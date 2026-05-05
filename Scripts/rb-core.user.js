// ==UserScript==
// @name         rb-core.user.js
// @match        https://*.rewardsbutler.com/*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      0.3.0
// @description  Shared Rewards Butler helper library for Tampermonkey scripts.
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

// Maintenance note: this script runs inside Tampermonkey on legacy Rewards Butler pages.
// Keep DOM selectors defensive and prefer small pure helpers for behavior that should be unit tested.

(function () {
    'use strict';

    const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    if (root.RB && root.RB.__isRbCore === true) {
        return;
    }

    const RB = {
        __isRbCore: true
    };

    root.RB = RB;
    window.RB = RB;

    // ============================================================
    // RB.debug
    // ============================================================
    RB.debug = (function () {
        /*
         * RB.debug
         *
         * Purpose:
         * Centralized debugging helpers for rb-core and page scripts.
         *
         * Includes:
         * - Simple on/off debug toggle
         * - Standardized console logging
         * - DOM task inspection helpers installed by RB.dom
         *
         * Excludes:
         * - Persistent debug storage
         * - Multiple logging levels
         * - Production console noise when debug is disabled
         *
         * Usage:
         * RB.debug.enabled = true;
         * RB.debug.log('message');
         */

        const debug = {};

        debug.enabled = true;

        debug.log = function (...args) {
            if (!debug.enabled) return;
            console.log('[RB]', ...args);
        };

        debug.warn = function (...args) {
            if (!debug.enabled) return;
            console.warn('[RB]', ...args);
        };

        debug.error = function (...args) {
            if (!debug.enabled) return;
            console.error('[RB]', ...args);
        };

        return debug;
    })();

    // ============================================================
    // RB.text
    // ============================================================
    RB.text = (function () {
        /*
     * RB.text
     *
     * Purpose:
     * Shared text normalization and text parsing helpers for Rewards Butler
     * userscripts.
     *
     * Includes:
     * - Safe string conversion
     * - Whitespace normalization
     * - Non-breaking space cleanup
     * - Sort-arrow removal
     * - Case normalization
     * - Simple phrase/exclusion filter parsing
     * - Row/search text comparison helpers
     *
     * Excludes:
     * - Page-specific business labels
     * - Page-specific column mappings
     * - Formatting numbers, currency, or dates for display
     * - DOM traversal or table logic
     *
     * Usage:
     * const label = RB.text.normalizeText(cell.textContent);
     * const lower = RB.text.normalizeLower(cell.textContent);
     * const tokens = RB.text.parseSimpleFilter(input.value);
     */

        const text = {};

        text.toString = function (value) {
            if (value === null || value === undefined) return '';
            return String(value);
        };

        text.normalizeWhitespace = function (value) {
            return text.toString(value)
                .replace(/\u00A0/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        };

        text.removeSortArrows = function (value) {
            return text.toString(value)
                .replace(/[▲▼]\s*$/, '')
                .trim();
        };

        text.normalizeText = function (value) {
            return text.removeSortArrows(
                text.normalizeWhitespace(value)
            );
        };

        text.normalizeLower = function (value) {
            return text.normalizeText(value).toLowerCase();
        };

        text.getElementText = function (element) {
            if (!element) return '';
            return text.normalizeText(element.textContent || '');
        };

        text.getElementTextLower = function (element) {
            return text.getElementText(element).toLowerCase();
        };

        text.includesText = function (source, needle) {
            const sourceText = text.normalizeLower(source);
            const needleText = text.normalizeLower(needle);

            if (!needleText) return true;
            return sourceText.includes(needleText);
        };

        text.equalsText = function (left, right) {
            return text.normalizeText(left) === text.normalizeText(right);
        };

        text.equalsTextLower = function (left, right) {
            return text.normalizeLower(left) === text.normalizeLower(right);
        };

        text.parseSimpleFilter = function (raw, options = {}) {
            const minLength = Number.isFinite(options.minLength)
            ? options.minLength
            : 2;

            const tokens = [];
            const input = text.normalizeWhitespace(raw);

            /*
         * Supports:
         * word          included word
         * "two words"   included phrase
         * --word        excluded word
         * --"two words" excluded phrase
         */
            const re = /(--\s*)?"([^"]*)"|(--\s*)?(\S+)/g;

            let match;
            while ((match = re.exec(input)) !== null) {
                const isExcluded = Boolean(match[1] || match[3]);
                const value = text.normalizeLower(match[2] || match[4] || '');

                if (!value) continue;
                if (value.length < minLength) continue;

                tokens.push({
                    value,
                    exclude: isExcluded
                });
            }

            return {
                tokens,
                includeTerms: tokens
                .filter((token) => !token.exclude)
                .map((token) => token.value),
                excludeTerms: tokens
                .filter((token) => token.exclude)
                .map((token) => token.value)
            };
        };

        text.matchesSimpleFilter = function (source, rawFilter, options = {}) {
            const sourceText = text.normalizeLower(source);
            const parsed = text.parseSimpleFilter(rawFilter, options);

            const matchesIncludes = parsed.includeTerms.every((term) => sourceText.includes(term));
            const matchesExcludes = parsed.excludeTerms.some((term) => sourceText.includes(term));

            return matchesIncludes && !matchesExcludes;
        };

        text.joinNormalized = function (values, separator = ' ') {
            return Array.from(values || [])
                .map((value) => text.normalizeText(value))
                .filter(Boolean)
                .join(separator);
        };

        return text;
    })();

    // ============================================================
    // RB.dom
    // ============================================================
    RB.dom = (function () {
        /*
         * RB.dom
         *
         * Purpose:
         * Shared DOM orchestration and DOM safety helpers for Rewards Butler
         * userscripts.
         *
         * Includes:
         * - Central task registration
         * - One shared MutationObserver
         * - Debounced task execution
         * - Task priorities
         * - Task groups
         * - Per-task error isolation
         * - Debug-only run reports
         * - Standardized data-rb-* element marking
         *
         * Excludes:
         * - Page-specific business logic
         * - Page-specific selectors, column names, or table assumptions
         * - Direct UI construction helpers
         *
         * Usage:
         * RB.dom.registerTask({
         *     group: 'prizebrowse',
         *     key: 'prizebrowse-main',
         *     priority: RB.dom.PRIORITY.STRUCTURE,
         *     debounceMs: 300,
         *     run(ctx) {
         *         apply();
         *     }
         * });
         */

        const dom = {};

        const DATASET_PREFIX = 'rb';
        const DEFAULT_DEBOUNCE_MS = 50;
        const OBSERVER_OPTIONS = { childList: true, subtree: true };

        let observer = null;
        let scheduled = false;
        let isRunning = false;
        let runCountThisCycle = 0;
        let lastRunReport = [];
        let taskSequence = 0;

        const tasks = new Map();
        const disabledTasks = new Set();
        const disabledGroups = new Set();

        dom.MAX_RUNS_PER_CYCLE = 50;

        dom.PRIORITY = {
            READ_PAGE: 10,
            STRUCTURE: 20,
            CONTENT: 30,
            BEHAVIOR: 40,
            DECORATION: 50
        };

        function normalizeMarkKey(key) {
            return String(key || '')
                .trim()
                .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
                .replace(/^[^a-zA-Z]+/, '');
        }

        function getDatasetKey(key) {
            const clean = normalizeMarkKey(key);
            if (!clean) return '';
            return DATASET_PREFIX + clean.charAt(0).toUpperCase() + clean.slice(1);
        }

        function validateRegisterTaskOptions(options) {
            if (!RB.debug.enabled) return;

            const allowed = new Set([
                'group',
                'key',
                'priority',
                'debounceMs',
                'run',
                'ignoreMutation'
            ]);

            Object.keys(options || {}).forEach((name) => {
                if (!allowed.has(name)) {
                    RB.debug.warn(`Unknown option "${name}" in RB.dom.registerTask().`);
                }
            });

            if (!options || typeof options !== 'object') {
                RB.debug.warn('RB.dom.registerTask() expected an options object.');
                return;
            }

            if (!options.key || typeof options.key !== 'string') {
                RB.debug.warn('RB.dom.registerTask() requires a string "key".');
            }

            if (options.group && typeof options.group !== 'string') {
                RB.debug.warn('RB.dom.registerTask() option "group" should be a string.');
            }

            if (options.priority !== undefined && typeof options.priority !== 'number') {
                RB.debug.warn('RB.dom.registerTask() option "priority" should be a number.');
            }

            if (options.debounceMs !== undefined && typeof options.debounceMs !== 'number') {
                RB.debug.warn('RB.dom.registerTask() option "debounceMs" should be a number.');
            }

            if (typeof options.run !== 'function') {
                RB.debug.warn('RB.dom.registerTask() requires a "run" function.');
            }
        }

        function getSortedTasks() {
            return Array.from(tasks.values()).sort((a, b) => {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return a.sequence - b.sequence;
            });
        }

        function disconnectObserver() {
            if (!observer) return;
            observer.disconnect();
        }

        function observeDocument() {
            if (!document.documentElement) return;

            if (!observer) {
                observer = new MutationObserver((mutations) => {
                    for (const mutation of mutations) {
                        const target = mutation.target;

                        if (
                            target &&
                            target.nodeType === 1 &&
                            target.closest &&
                            target.closest('[data-rb-ignore-mutations="1"]')
                        ) {
                            continue;
                        }

                        dom.scheduleRun();
                        break;
                    }
                });
            }

            observer.observe(document.documentElement, OBSERVER_OPTIONS);
        }

        function createTaskContext(task) {
            return {
                task,
                mark: dom.markElement,
                unmark: dom.unmarkElement,
                isMarked: dom.isElementMarked,
                scheduleRun: dom.scheduleRun,
                disableTask: dom.disableTask,
                enableTask: dom.enableTask,
                disableGroup: dom.disableGroup,
                enableGroup: dom.enableGroup
            };
        }

        dom.markElement = function (element, key) {
            if (!element || !element.dataset) return false;

            const datasetKey = getDatasetKey(key);
            if (!datasetKey) return false;

            element.dataset[datasetKey] = '1';
            return true;
        };

        dom.isElementMarked = function (element, key) {
            if (!element || !element.dataset) return false;

            const datasetKey = getDatasetKey(key);
            if (!datasetKey) return false;

            return element.dataset[datasetKey] === '1';
        };

        dom.unmarkElement = function (element, key) {
            if (!element || !element.dataset) return false;

            const datasetKey = getDatasetKey(key);
            if (!datasetKey) return false;

            delete element.dataset[datasetKey];
            return true;
        };

        dom.registerTask = function (options = {}) {
            validateRegisterTaskOptions(options);

            if (!options || typeof options !== 'object') {
                return { ok: false, reason: 'options object required' };
            }

            const key = String(options.key || '').trim();
            if (!key) {
                return { ok: false, reason: 'task key required' };
            }

            if (typeof options.run !== 'function') {
                return { ok: false, reason: 'task run function required' };
            }

            const task = {
                group: String(options.group || 'default').trim() || 'default',
                key,
                priority: typeof options.priority === 'number'
                ? options.priority
                : dom.PRIORITY.CONTENT,
                debounceMs: typeof options.debounceMs === 'number'
                ? options.debounceMs
                : DEFAULT_DEBOUNCE_MS,
                run: options.run,
                ignoreMutation: options.ignoreMutation === true,
                sequence: taskSequence++
            };

            tasks.set(key, task);

            RB.debug.log('Registered DOM task:', task);

            dom.scheduleRun(task.debounceMs);

            return { ok: true, task };
        };

        dom.scheduleRun = function (debounceMs = DEFAULT_DEBOUNCE_MS) {
            if (scheduled) return { ok: true, reason: 'already scheduled' };

            scheduled = true;

            setTimeout(() => {
                scheduled = false;
                dom.runAllTasks();
            }, Math.max(0, debounceMs));

            return { ok: true };
        };

        dom.runAllTasks = function () {
            if (isRunning) return { ok: false, reason: 'already running' };

            isRunning = true;
            runCountThisCycle++;

            if (runCountThisCycle > dom.MAX_RUNS_PER_CYCLE) {
                RB.debug.warn('Max DOM task runs exceeded. Possible infinite loop.');
                isRunning = false;
                return { ok: false, reason: 'max runs exceeded' };
            }

            const report = [];

            disconnectObserver();

            try {
                const sortedTasks = getSortedTasks();

                sortedTasks.forEach((task) => {
                    const isTaskDisabled = disabledTasks.has(task.key);
                    const isGroupDisabled = disabledGroups.has(task.group);

                    if (isTaskDisabled || isGroupDisabled) {
                        if (RB.debug.enabled) {
                            report.push({
                                key: task.key,
                                group: task.group,
                                priority: task.priority,
                                status: 'disabled',
                                durationMs: null,
                                error: null
                            });
                        }
                        return;
                    }

                    let start = null;

                    if (RB.debug.enabled && typeof performance !== 'undefined') {
                        start = performance.now();
                    }

                    try {
                        task.run(createTaskContext(task));

                        if (RB.debug.enabled) {
                            report.push({
                                key: task.key,
                                group: task.group,
                                priority: task.priority,
                                status: 'success',
                                durationMs: start === null ? null : performance.now() - start,
                                error: null
                            });
                        }
                    } catch (error) {
                        RB.debug.error(`DOM task failed: ${task.key}`, error);

                        if (RB.debug.enabled) {
                            report.push({
                                key: task.key,
                                group: task.group,
                                priority: task.priority,
                                status: 'error',
                                durationMs: start === null ? null : performance.now() - start,
                                error
                            });
                        }
                    }
                });

                if (RB.debug.enabled) {
                    lastRunReport = report;
                }

                return { ok: true, report };
            } finally {
                isRunning = false;
                observeDocument();
            }
        };

        dom.listTasks = function () {
            return getSortedTasks().map((task) => ({
                key: task.key,
                group: task.group,
                priority: task.priority,
                debounceMs: task.debounceMs,
                disabled: disabledTasks.has(task.key) || disabledGroups.has(task.group)
            }));
        };

        dom.listGroups = function () {
            return Array.from(
                new Set(Array.from(tasks.values()).map((task) => task.group))
            ).sort();
        };

        dom.disableTask = function (key) {
            disabledTasks.add(String(key || '').trim());
            return { ok: true };
        };

        dom.enableTask = function (key) {
            disabledTasks.delete(String(key || '').trim());
            return { ok: true };
        };

        dom.disableGroup = function (group) {
            disabledGroups.add(String(group || '').trim());
            return { ok: true };
        };

        dom.enableGroup = function (group) {
            disabledGroups.delete(String(group || '').trim());
            return { ok: true };
        };

        dom.runTask = function (key) {
            const task = tasks.get(String(key || '').trim());
            if (!task) return { ok: false, reason: 'task not found' };

            try {
                task.run(createTaskContext(task));
                return { ok: true };
            } catch (error) {
                RB.debug.error(`DOM task failed: ${task.key}`, error);
                return { ok: false, error };
            }
        };

        dom.runGroup = function (group) {
            const groupName = String(group || '').trim();
            const matchingTasks = getSortedTasks().filter((task) => task.group === groupName);

            matchingTasks.forEach((task) => dom.runTask(task.key));

            return { ok: true, count: matchingTasks.length };
        };

        dom.getLastRunReport = function () {
            return lastRunReport.slice();
        };

        // Debug convenience aliases.
        RB.debug.listTasks = dom.listTasks;
        RB.debug.listGroups = dom.listGroups;
        RB.debug.disableTask = dom.disableTask;
        RB.debug.enableTask = dom.enableTask;
        RB.debug.disableGroup = dom.disableGroup;
        RB.debug.enableGroup = dom.enableGroup;
        RB.debug.runTask = dom.runTask;
        RB.debug.runGroup = dom.runGroup;
        RB.debug.runAll = dom.runAllTasks;
        RB.debug.getLastRunReport = dom.getLastRunReport;

        function startWhenDocumentExists() {
            if (document.documentElement) {
                observeDocument();
                return;
            }

            document.addEventListener('DOMContentLoaded', observeDocument, { once: true });
        }

        startWhenDocumentExists();

        return dom;
    })();

    // ============================================================
    // RB.table
    // ============================================================
    RB.table = (function () {
        /*
     * RB.table
     *
     * Purpose:
     * Shared table helpers for common Rewards Butler static tables.
     *
     * Includes:
     * - Finding standard Rewards Butler tables
     * - Finding header rows where every cell is formsubheader
     * - Getting header cells and data rows
     *
     * Excludes:
     * - Page-specific column names
     * - Page-specific business rules
     * - Page-specific row modifications
     *
     * Usage:
     * const table = RB.table.getTableClassBasic();
     * const headerRow = RB.table.getHeaderRow(table);
     * const dataRows = RB.table.getDataRows(headerRow);
     */

        const table = {};

        table.getTablesClassBasic = function (root = document) {
            return Array.from(root.querySelectorAll('table.basic'));
        };

        table.getTableClassBasic = function (root = document) {
            return table.getTablesClassBasic(root)[0] || null;
        };

        table.getHeaderRow = function (tableElement) {
            if (!tableElement) return null;

            const rows = Array.from(tableElement.querySelectorAll('tr'));

            return rows.find((row) => {
                if (row.dataset.rbInserted === '1') return false;
                if (row.dataset.rbSearchRow === '1') return false;

                const cells = Array.from(row.children);
                if (!cells.length) return false;

                return cells.every((cell) => cell.classList.contains('formsubheader'));
            }) || null;
        };

        table.getHeaderCells = function (headerRow) {
            if (!headerRow) return [];
            return Array.from(headerRow.children)
                .filter((cell) => cell.classList.contains('formsubheader'));
        };

        table.getContainer = function (headerRow) {
            return headerRow ? headerRow.parentElement : null;
        };

        table.getDataRows = function (headerRow) {
            if (!headerRow || !headerRow.parentElement) return [];

            return Array.from(headerRow.parentElement.querySelectorAll('tr'))
                .slice(
                Array.from(headerRow.parentElement.querySelectorAll('tr')).indexOf(headerRow) + 1
            )
                .filter((row) => row.matches('tr.browse-item'));
        };

        table.getRowCells = function (row) {
            if (!row) return [];
            return Array.from(row.querySelectorAll('td, th'));
        };

        table.getHeaderTexts = function (headerRow) {
            return table.getHeaderCells(headerRow).map((cell) => RB.text.normalizeText(cell.textContent));
        };

        table.getExcludedColumnIndexes = function (headerRow, excludeHeaders = []) {
            const excludeSet = new Set(Array.from(excludeHeaders || []).map((header) => RB.text.normalizeText(header)));
            if (!excludeSet.size) return new Set();

            const excluded = new Set();
            table.getHeaderTexts(headerRow).forEach((text, index) => {
                if (excludeSet.has(text)) excluded.add(index);
            });
            return excluded;
        };

        table.getSearchText = function (row, options = {}) {
            const excluded = options.excludedColumnIndexes || new Set();
            return RB.text.normalizeLower(
                RB.text.joinNormalized(
                    table.getRowCells(row)
                        .filter((cell, index) => !excluded.has(index))
                        .map((cell) => cell ? cell.textContent : '')
                )
            );
        };

        table.applyFilter = function (options = {}) {
            const { headerRow, query = '', excludeHeaders = [], minLength = 2 } = options;
            if (!headerRow) return { ok: false, reason: 'headerRow required' };

            const raw = RB.text.normalizeText(query);
            const dataRows = table.getDataRows(headerRow);

            if (!raw) {
                dataRows.forEach((row) => { row.style.display = ''; });
                return { ok: true, shown: dataRows.length, hidden: 0 };
            }

            const parsed = RB.text.parseSimpleFilter(raw, { minLength });
            const excluded = table.getExcludedColumnIndexes(headerRow, excludeHeaders);
            let shown = 0;
            let hidden = 0;

            dataRows.forEach((row) => {
                const rowText = table.getSearchText(row, { excludedColumnIndexes: excluded });
                const matchesIncludes = parsed.includeTerms.every((term) => rowText.includes(term));
                const matchesExcludes = parsed.excludeTerms.some((term) => rowText.includes(term));
                const match = matchesIncludes && !matchesExcludes;
                row.style.display = match ? '' : 'none';
                if (match) shown++; else hidden++;
            });

            return { ok: true, shown, hidden };
        };

        table.parseSortValue = function (value) {
            const raw = RB.text.normalizeText(value);
            if (!raw) return { kind: 'empty', value: '' };

            const cleaned = raw.replace(/,/g, '');
            const isNumber = cleaned !== '' && /^-?\$?\d+(\.\d+)?$/.test(cleaned);
            if (isNumber) return { kind: 'number', value: Number(cleaned.replace(/^\$/, '')), raw };

            const date = Date.parse(raw);
            if (!Number.isNaN(date) && /[-/ ]/.test(raw)) return { kind: 'date', value: date, raw };

            return { kind: 'text', value: raw.toLowerCase(), raw };
        };

        table.compareSortValues = function (left, right) {
            const a = left || { kind: 'empty', value: '' };
            const b = right || { kind: 'empty', value: '' };
            if (a.kind === 'empty' && b.kind === 'empty') return 0;
            if (a.kind === 'empty') return 1;
            if (b.kind === 'empty') return -1;
            if (a.kind === b.kind) {
                if (a.value < b.value) return -1;
                if (a.value > b.value) return 1;
                return 0;
            }
            const order = { number: 1, date: 2, text: 3, empty: 4 };
            return (order[a.kind] || 9) - (order[b.kind] || 9);
        };

        table.enableSorting = function (options = {}) {
            const { headerRow, excludeHeaders = [], getSortValue, onAfterSort } = options;
            if (!headerRow) return { ok: false, reason: 'headerRow required' };

            const container = table.getContainer(headerRow);
            const headers = table.getHeaderCells(headerRow);
            if (!container || !headers.length) return { ok: false, reason: 'missing container/header cells' };
            if (headerRow.dataset.rbSortBound === '1') return { ok: true, reason: 'already bound' };

            headerRow.dataset.rbSortBound = '1';
            const excluded = new Set(Array.from(excludeHeaders || []).map((header) => RB.text.normalizeText(header)));

            headers.forEach((headerCell) => {
                if (!headerCell.dataset.rbLabel) headerCell.dataset.rbLabel = RB.text.normalizeText(headerCell.textContent);
            });

            table.getDataRows(headerRow).forEach((row, index) => {
                if (!row.dataset.rbOrigIndex) row.dataset.rbOrigIndex = String(index);
            });

            const clearArrows = function () {
                headers.forEach((headerCell) => {
                    const arrow = headerCell.querySelector('.rb-sort-arrow');
                    if (arrow) arrow.textContent = '';
                });
            };

            headers.forEach((headerCell, columnIndex) => {
                const headerText = headerCell.dataset.rbLabel || RB.text.normalizeText(headerCell.textContent);
                const isExcluded = excluded.has(headerText);

                headerCell.style.cursor = isExcluded ? 'default' : 'pointer';
                headerCell.title = isExcluded ? '' : 'Click to sort';

                if (!headerCell.querySelector('.rb-sort-arrow')) {
                    const arrow = document.createElement('span');
                    arrow.className = 'rb-sort-arrow';
                    arrow.style.cssText = 'display:inline-block; margin-left:6px; font-weight:bold;';
                    arrow.textContent = '';
                    headerCell.appendChild(arrow);
                }

                if (isExcluded) return;

                headerCell.addEventListener('click', () => {
                    const previousColumn = Number(container.dataset.rbSortCol ?? -1);
                    const previousDirection = container.dataset.rbSortDir ?? 'asc';
                    const direction = previousColumn === columnIndex && previousDirection === 'asc' ? 'desc' : 'asc';
                    container.dataset.rbSortCol = String(columnIndex);
                    container.dataset.rbSortDir = direction;
                    clearArrows();
                    const arrow = headerCell.querySelector('.rb-sort-arrow');
                    if (arrow) arrow.textContent = direction === 'asc' ? '▲' : '▼';

                    const decorated = table.getDataRows(headerRow).map((row) => {
                        const cell = table.getRowCells(row)[columnIndex] || null;
                        const rawValue = typeof getSortValue === 'function'
                            ? getSortValue({ row, cell, headerText, columnIndex })
                            : (cell ? cell.textContent : '');
                        return {
                            row,
                            originalIndex: parseInt(row.dataset.rbOrigIndex || '0', 10),
                            parsed: table.parseSortValue(rawValue)
                        };
                    });

                    decorated.sort((a, b) => {
                        const comparison = table.compareSortValues(a.parsed, b.parsed);
                        if (comparison !== 0) return direction === 'asc' ? comparison : -comparison;
                        return a.originalIndex - b.originalIndex;
                    });

                    decorated.forEach(({ row }) => container.appendChild(row));
                    if (typeof onAfterSort === 'function') onAfterSort({ headerRow, columnIndex, headerText, direction });
                });
            });

            return { ok: true };
        };



        table.getRowsAfterHeader = function (headerRow, options = {}) {
            const { container = table.getContainer(headerRow), includeInserted = false } = options;
            if (!headerRow || !container) return [];

            const rows = Array.from(container.querySelectorAll('tr'));
            const startIndex = rows.indexOf(headerRow);
            if (startIndex === -1) return [];

            return rows.slice(startIndex + 1).filter((row) => {
                if (!includeInserted && row.dataset.rbInserted === '1') return false;
                if (!includeInserted && row.dataset.rbSearchRow === '1') return false;
                return true;
            });
        };

        table.formatActionCellLinks = function (cell, options = {}) {
            const {
                separatorText = ' | ',
                strongSeparator = false,
                doneAttribute = 'rbActionsFormatted',
                removeLinkTexts = []
            } = options;

            if (!cell) return { ok: false, reason: 'cell required' };
            if (doneAttribute && cell.dataset[doneAttribute] === '1') {
                return { ok: true, reason: 'already formatted', changed: false };
            }

            const removeSet = new Set(Array.from(removeLinkTexts || []).map((text) => RB.text.normalizeLower(text)));
            const links = Array.from(cell.querySelectorAll('a')).filter((link) => {
                if (!removeSet.size) return true;
                return !removeSet.has(RB.text.normalizeLower(link.textContent));
            });

            if (!links.length) {
                if (doneAttribute) cell.dataset[doneAttribute] = '1';
                return { ok: true, changed: false, links: 0 };
            }

            cell.replaceChildren();

            links.forEach((link, index) => {
                if (index > 0) {
                    if (strongSeparator) {
                        cell.appendChild(document.createTextNode(' '));
                        const sep = document.createElement('strong');
                        sep.textContent = separatorText.trim();
                        cell.appendChild(sep);
                        cell.appendChild(document.createTextNode(' '));
                    } else {
                        cell.appendChild(document.createTextNode(separatorText));
                    }
                }

                cell.appendChild(link);
            });

            if (doneAttribute) cell.dataset[doneAttribute] = '1';
            return { ok: true, changed: links.length > 1 || removeSet.size > 0, links: links.length };
        };

        table.formatActionColumnLinks = function (options = {}) {
            const {
                headerRow,
                container = table.getContainer(headerRow),
                headerName = 'Actions',
                separatorText = ' | ',
                strongSeparator = true,
                doneAttribute = 'rbActionsFormatted',
                removeLinkTexts = []
            } = options;

            if (!headerRow || !container) return { ok: false, reason: 'missing headerRow/container' };

            const headerTexts = table.getHeaderTexts(headerRow);
            const actionIndex = headerTexts.indexOf(RB.text.normalizeText(headerName));
            if (actionIndex === -1) return { ok: false, reason: '"' + headerName + '" header not found' };

            let scanned = 0;
            let changed = 0;

            table.getRowsAfterHeader(headerRow, { container }).forEach((row) => {
                const cell = table.getRowCells(row)[actionIndex];
                if (!cell) return;

                scanned++;
                const result = table.formatActionCellLinks(cell, {
                    separatorText,
                    strongSeparator,
                    doneAttribute,
                    removeLinkTexts
                });
                if (result && result.changed) changed++;
            });

            return { ok: true, scanned, changed, actionsIdx: actionIndex };
        };

        table.ensureFilterRow = function (options = {}) {
            const { headerRow, storageKey, inputId = 'rb-table-filter', excludeHeaders = [], onFilter } = options;
            if (!headerRow) return { ok: false, reason: 'headerRow required' };

            const container = table.getContainer(headerRow);
            if (!container) return { ok: false, reason: 'container not found' };

            let filterRow = container.querySelector('tr[data-rb-search-row="1"]');
            if (filterRow && document.contains(filterRow)) {
                return { ok: true, row: filterRow, input: filterRow.querySelector(`#${inputId}`) };
            }

            filterRow = document.createElement('tr');
            filterRow.dataset.rbSearchRow = '1';

            const cell = document.createElement('td');
            cell.colSpan = table.getHeaderCells(headerRow).length || 1;
            cell.style.padding = '6px 8px';

            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex; align-items:center; gap:8px;';

            const label = document.createElement('span');
            label.textContent = 'Filter:';
            label.style.cssText = 'font-weight:bold;';

            const input = document.createElement('input');
            input.type = 'text';
            input.id = inputId;
            input.placeholder = 'Filter... Use -- to exclude words or phrases. Use " " around phrases.';
            input.autocomplete = 'off';
            input.spellcheck = false;
            input.style.cssText = 'flex:1; padding:6px 8px; border:1px solid #999; border-radius:6px; font-size:12px;';

            const clearButton = document.createElement('button');
            clearButton.type = 'button';
            clearButton.textContent = 'Clear';
            clearButton.style.cssText = 'padding:6px 10px; border:1px solid #999; border-radius:6px; background:#f2f2f2; cursor:pointer; font-size:12px;';

            wrap.appendChild(label);
            wrap.appendChild(input);
            wrap.appendChild(clearButton);
            cell.appendChild(wrap);
            filterRow.appendChild(cell);
            container.insertBefore(filterRow, headerRow);

            const applyNow = function () {
                const query = RB.text.normalizeText(input.value);
                container.dataset.rbFilterQuery = query;

                if (storageKey) {
                    try {
                        if (query) sessionStorage.setItem(storageKey, query);
                        else sessionStorage.removeItem(storageKey);
                    } catch {
                        // Ignore storage failures.
                    }
                }

                const result = table.applyFilter({ headerRow, query, excludeHeaders });
                if (typeof onFilter === 'function') onFilter({ query, result, headerRow, input, row: filterRow });
            };

            input.addEventListener('input', applyNow);
            clearButton.addEventListener('click', () => {
                input.value = '';
                applyNow();
                input.focus();
            });

            let saved = '';
            if (storageKey) {
                try { saved = sessionStorage.getItem(storageKey) || ''; } catch { saved = ''; }
            }

            const startingQuery = RB.text.normalizeText(saved || container.dataset.rbFilterQuery || '');
            if (startingQuery) {
                input.value = startingQuery;
                container.dataset.rbFilterQuery = startingQuery;
                table.applyFilter({ headerRow, query: startingQuery, excludeHeaders });
            }

            return { ok: true, row: filterRow, input };
        };


        return table;
    })();
})();
