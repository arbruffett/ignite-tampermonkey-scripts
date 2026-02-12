// ==UserScript==
// @name         prizeedit.php
// @match        https://beta.rewardsbutler.com/loy/prizeedit.php*
// @description  Modifies Trigger Edit Page with more advanced layout and logic
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/prizeedit.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/prizeedit.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    /* ================= CONFIG ================= */

    // 1) Always-hidden labels (never show, even when sections are expanded)
    const HIDE_LABELS = [
        'Notification :',
        'Pump Welcome Message?',
        '$ Value :',
        'Promo ID :',
        'PrizeLine4 :',
        'ExpiresInHours (Action 08 or 52 only) :',
        "Don't start group membership until beginning next month :",
        'Remove from group at end of month (supercedes ExpiresInHours) :',
        '(Triggertype 34 ONLY) Limit one reward per trigger until reset :',
        '(Triggertype 34 ONLY) Automatically reset trigger monthly :',
        '(Triggertype 17 ONLY) Multiply PROMO ITEM count by BonusPoints :',
        'Accounting Code :'
    ];

    // Rows that should always appear at the top (in this order)
    const PIN_BREAK = '__PIN_BREAK__';

    const PIN_TO_TOP = [
        'Active :',
        'Record ID :',
        'Description :',
        PIN_BREAK,
        'LocationID :',
        'Applies to :',
        'Level:',
        'KBID:',
        PIN_BREAK,
        'Triggertype :',
        'Trigger value :',
        PIN_BREAK,
        'Action :',
        'Bonus value (e.g. extra points) :',
        PIN_BREAK,
        '__PRODUCT_COMBO__',
        'Match Combo 2 :',
        'Match Combo 3 :',
        'Match Combo 4 :',
        PIN_BREAK,
        'Priority :',
        PIN_BREAK,
        'PrizeLine1 :',
        'PrizeLine2 :',
        'PrizeLine3 :',
        PIN_BREAK,
        'StartDate :',
        'EndDate :',
        PIN_BREAK,
        'Continue giving triggers this transaction :',
        'Continue giving triggers this trx :'
    ];

    // Rewrite left-column label display text (only within the prizeedit table)
    const LABEL_RENAMES = [
        {
            from: '(Triggertype 17 ONLY) Multiply PROMO ITEM count by BonusPoints :',
            to: 'Promo Item Count x BP (Type 17 Only) :'
        },
        {
            from: '(Triggertype 34 ONLY) Limit one reward per trigger until reset :',
            to: 'One Prize Unil Reset (Type 34 Only) :'
        },
        {
            from: '(Triggertype 34 ONLY) Automatically reset trigger monthly :',
            to: 'Reset Monthly (Type 34 Only)'
        },
        {
            from: 'Continue giving triggers this trx :',
            to: 'Continue giving triggers this transaction :'
        },
        {
            from: 'Trigger only active inside/outside time window :',
            to: 'Trigger active inside/outside time window :'
        }
    ];

    // Existing form sections to make collapsible
    const COLLAPSIBLE_SECTIONS = [
        { title: 'Miscellaneous', collapsedByDefault: true },
        { title: 'Limits', collapsedByDefault: true },
        { title: 'Vendor Settings', collapsedByDefault: true },
        { title: 'Employee Clock Settings', collapsedByDefault: true }
    ];

    // Select2 width clamp (prizeedit table only)
    const SELECT2_MAX_WIDTH = 450;

    // Match combos: ProductCodeMatch[0..2] => Match Combo 2/3/4
    const MATCH_COMBO_MAX = 3;

    // Vendor Program widths (optional)
    const VENDORPROGRAM_WIDTH_DEFAULT = 150;
    const VENDORPROGRAM_WIDTH_ACTIVE  = 440;

    const AUTO_OPEN_ATTR = 'data-tm-auto-open';


    /* ================= HIGHLIGHT RULES (ARRAY-DRIVEN) ================= */

    // ✅ IMPORTANT CHANGE:
    // Highlight rules ONLY decide whether a row is "highlighted" (non-default) and apply styling.
    // They DO NOT set display:none anymore.
    // Visibility is handled in ONE place: refreshRowVisibility / refreshAllVisibility.

    const HIGHLIGHT_RULES = [
        {
            label: 'Employee PLU :',
            type: 'select',
            name: 'emp_plu_action',
            controlSelector: 'select[name="emp_plu_action"]',
            defaultValues: ['0', ""],
            observeSelect2: true,
            expandSectionTitle: 'Employee Clock Settings'
        },

        {
            label: 'PLU for Employee Clock Settings :',
            type: 'text',
            name: 'emp_required_plu',
            controlSelector: 'input[name="emp_required_plu"]',
            defaultValues: [''],
            expandSectionTitle: 'Employee Clock Settings'
        },

        /* ================= VENDOR SETTINGS ================= */

        {
            label: 'Vendor Program :',
            type: 'select',
            name: 'vendorProgram',
            controlSelector: 'select#vendorProgram',
            defaultValues: ['-1', ''],
            observeSelect2: true,
            expandSectionTitle: 'Vendor Settings',
            onNonDefault: () => setVendorProgramSelect2Width(VENDORPROGRAM_WIDTH_ACTIVE),
            onDefault: () => setVendorProgramSelect2Width(VENDORPROGRAM_WIDTH_DEFAULT)
        },

        /* ================= LIMITS ================= */

        {
            label: 'Member Group Restriction :',
            type: 'select',
            name: 'MemberGroupMeans',
            controlSelector: 'select#MemberGroupMeans',
            defaultValues: ['Include'],
            observeSelect2: true,
            expandSectionTitle: 'Limits'
        },

        {
            label: 'Member Group :',
            type: 'select',
            name: 'MemberGroup',
            controlSelector: 'select[name="MemberGroup"]',
            defaultValues: ['0'],
            observeSelect2: true,
            expandSectionTitle: 'Limits'
        },

        {
            label: 'Velocity limit: no',
            type: 'select',
            name: 'velocitylimitsign',
            controlSelector: 'select#velocitylimitsign',
            defaultValues: ['>'],
            observeSelect2: true,
            expandSectionTitle: 'Limits'
        },

        {
            label: 'Per :',
            type: 'select',
            name: 'velocitylimitappliesto',
            controlSelector: 'select#velocitylimitappliesto',
            defaultValues: ['Member'],
            observeSelect2: true,
            expandSectionTitle: 'Limits'
        },

        {
            key: 'velocitylimitunit',
            type: 'select',
            name: 'velocitylimitunit',
            controlSelector: 'select#velocitylimitunit',
            defaultValues: ['month'],
            observeSelect2: true,
            expandSectionTitle: 'Limits'
        },

        {
            label: '...in the last :',
            type: 'text',
            name: 'velocitylimitvalue',
            controlSelector: 'input[name="velocitylimitvalue"]',
            defaultValues: ['0',''],
            expandSectionTitle: 'Limits'
        },

        {
            key: 'velocitylimitmeasures',
            type: 'select',
            name: 'velocitylimitmeasures',
            controlSelector: 'select#velocitylimitmeasures',
            defaultValues: ['Triggers'],
            observeSelect2: true,
            expandSectionTitle: 'Limits'
        },

        {
            label: '...than :',
            type: 'text',
            name: 'velocitylimitlimit',
            controlSelector: 'input[name="velocitylimitlimit"]',
            defaultValues: ['0',''],
            expandSectionTitle: 'Limits'
        },

        {
            label: 'Limit per card :',
            type: 'text',
            name: 'LimitPerCard',
            controlSelector: 'input[name="LimitPerCard"]',
            defaultValues: ['0',''],
            expandSectionTitle: 'Limits'
        },

        {
            label: 'Minimum purchase :',
            type: 'text',
            name: 'MinPurchase',
            controlSelector: 'input[name="MinPurchase"]',
            defaultValues: ['0.00', '0.0','','0','0.'],
            expandSectionTitle: 'Limits'
        },

        {
            label: 'Number to give (0 for no limit) :',
            type: 'text',
            name: 'MaxIssueCount',
            controlSelector: 'input[name="MaxIssueCount"]',
            defaultValues: ['0',''],
            expandSectionTitle: 'Limits'
        },

        /* ================= MISCELLANEOUS ================= */

        {
            label: 'Location Group :',
            type: 'select',
            name: 'LocationGroup',
            controlSelector: 'select#LocationGroup',
            defaultValues: ['0'],
            observeSelect2: true,
            expandSectionTitle: 'Miscellaneous'
        },

        {
            label: 'StartTime :',
            type: 'text',
            name: 'StartTime',
            controlSelector: 'input[name="StartTime"]',
            defaultValues: ['0', ''],
            expandSectionTitle: 'Miscellaneous'
        },

        {
            label: 'EndTime :',
            type: 'text',
            name: 'EndTime',
            controlSelector: 'input[name="EndTime"]',
            defaultValues: ['0', ''],
            expandSectionTitle: 'Miscellaneous'
        },

        {
            label: 'Accounting Code : ',
            type: 'select',
            name: 'accountingcode',
            defaultValues: ['--Accounting Code--','']
        },

        {
            label: 'Registration restrictions :',
            type: 'select',
            name: 'OnlyRegistered',
            controlSelector: 'select#OnlyRegistered',
            defaultValues: ['0'],
            observeSelect2: true,
            expandSectionTitle: 'Miscellaneous'
        },

        {
            label: 'Trigger active inside/outside time window :',
            type: 'select',
            name: 'StartEndTimeType',
            controlSelector: 'select#StartEndTimeType',
            defaultValues: ['inside'],
            observeSelect2: true,
            expandSectionTitle: 'Miscellaneous'
        }
    ];

    // Trigger types that should NOT load product combos from integration fields
    const PRODUCT_COMBO_SKIP_TRIGGER_TYPES = new Set([
        '','0','1','2','3','4','5','6','7','8','9','10','11','12','13','14',
        '15','16','19','20','22','23','24','25','26','27','32','33','60','200'
    ]);

    /* ============== INTERNAL ATTRS ============== */

    const COLLAPSE_ATTR = 'data-tm-collapsed';
    const HEADER_ATTR = 'data-tm-section-header';
    const SECTION_ID_ATTR = 'data-tm-section-id';           // on rows
    const HEADER_SECTION_ID_ATTR = 'data-tm-header-sec-id'; // on header <tr>
    const HEADER_TITLE_ATTR = 'data-tm-header-title';       // normalized title
    const ARROW_ATTR = 'data-tm-arrow';

    /* ================= SAFE RUN ================= */

    function safeRun(label, fn) {
        try {
            return fn();
        } catch (e) {
            console.warn(`[TM] ${label} failed:`, e);
            return null;
        }
    }

    /* ================= HELPERS ================= */

    function norm(s) {
        return (s || '')
            .replace(/\u00A0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normTitle(s) {
        // Remove arrow chars we inject into headers, plus stray symbols
        return norm(s).replace(/^[\s▶▼]+/g, '').trim();
    }

    function optionSelectedValue(selectEl) {
        if (!selectEl) return '';
        return String(selectEl.value ?? '').trim();
    }

    function hasRealSelection(selectEl) {
        const v = optionSelectedValue(selectEl);
        return v !== '' && v !== '0';
    }

    function findRowByLeftLabel(label) {
        const wanted = norm(label);
        for (const td of document.querySelectorAll('td.justright')) {
            if (norm(td.textContent).startsWith(wanted)) return td.closest('tr');
        }
        return null;
    }

    function getPrizeEditTable() {
        const recordIdTr = findRowByLeftLabel('Record ID :');
        return recordIdTr ? recordIdTr.closest('table') : null;
    }

    function findFirstSectionHeaderTrInTable(table) {
        if (!table) return null;
        const td = table.querySelector('td.formsection');
        return td ? td.closest('tr') : null;
    }

    function findSectionHeaderTr(title) {
        // ✅ Robust even after arrows are injected
        const wanted = norm(title);
        const candidates = Array.from(document.querySelectorAll(`tr[${HEADER_TITLE_ATTR}]`));
        const found = candidates.find(tr => norm(tr.getAttribute(HEADER_TITLE_ATTR)) === wanted);
        if (found) return found;

        // fallback (before setupCollapsibleSections runs)
        for (const td of document.querySelectorAll('td.formsection')) {
            const t = normTitle(td.textContent);
            if (t === wanted) return td.closest('tr');
        }
        return null;
    }

    function getHeaderBySectionId(sectionId) {
        return document.querySelector(`tr[${HEADER_SECTION_ID_ATTR}="${CSS.escape(sectionId)}"]`);
    }

    function isLastFormSection(headerTr) {
        let tr = headerTr.nextElementSibling;
        while (tr) {
            if (tr.querySelector('td.formsection')) return false;
            tr = tr.nextElementSibling;
        }
        return true;
    }

    function shouldSkipProductComboLoading(triggerTypeValue) {
        const t = String(triggerTypeValue ?? getTriggerTypeValue() ?? '').trim();
        return PRODUCT_COMBO_SKIP_TRIGGER_TYPES.has(t);
    }

    function getTriggerTypeValue() {
        const sel =
              document.querySelector('select[name="triggertype"]') ||
              document.querySelector('select#triggertype') ||
              document.querySelector('select[name="triggerType"]') ||
              document.querySelector('select#triggerType');

        if (sel) return String(sel.value || '').trim();

        const input =
              document.querySelector('input[name="triggertype"]') ||
              document.querySelector('input#triggertype') ||
              document.querySelector('input[name="triggerType"]') ||
              document.querySelector('input#triggerType');

        return input ? String(input.value || '').trim() : '';
    }

    function updateHeaderArrow(headerTr) {
        const arrow = headerTr.querySelector(`[${ARROW_ATTR}="1"]`);
        if (!arrow) return;

        const collapsed = headerTr.getAttribute(COLLAPSE_ATTR) === '1';
        const userExpanded = headerTr.getAttribute('data-tm-user-expanded') === '1';
        const autoOpen = headerTr.getAttribute(AUTO_OPEN_ATTR) === '1';

        // If collapsed OR auto-open (highlight-only), show ▶.
        // Only show ▼ when truly expanded by the user.
        arrow.textContent = (collapsed || (autoOpen && !userExpanded)) ? '▶' : '▼';
    }


    /* ================= VISIBILITY ENGINE (THE SIMPLIFICATION) ================= */

    // Rules we enforce:
    // 1) Always-hidden list stays hidden forever
    // 2) Highlighted rows show when non-default
    // 3) Highlighted rows stay visible even when section is collapsed
    // 4) When a section is expanded MANUALLY, show *all* rows in that section:
    //    - highlighted rows (always visible anyway)
    //    - default rows (visible because user expanded)
    // 5) Highlight evaluation / select2 mutation observers NEVER hide rows directly.
    //    They only set "highlighted" state; then we re-apply visibility.

    function isAlwaysHiddenRow(tr) {
        return tr && tr.getAttribute('data-tm-always-hidden') === '1';
    }

    function isHighlightedRow(tr) {
        return tr && tr.getAttribute('data-tm-highlighted') === '1';
    }

    function isSectionCollapsed(sectionId) {
        const header = getHeaderBySectionId(sectionId);
        return !!header && header.getAttribute(COLLAPSE_ATTR) === '1';
    }

    function isSectionUserExpanded(sectionId) {
        const header = getHeaderBySectionId(sectionId);
        return !!header && header.getAttribute('data-tm-user-expanded') === '1';
    }

    function refreshRowVisibility(tr) {
        if (!tr) return;

        // Always-hidden wins
        if (isAlwaysHiddenRow(tr)) {
            tr.style.display = 'none';
            return;
        }

        // Highlighted rows are always visible, regardless of collapse state
        if (isHighlightedRow(tr)) {
            tr.style.display = '';
            return;
        }

        const sectionId = tr.getAttribute(SECTION_ID_ATTR);

        // Pinned / unsectioned rows: keep visible (unless always-hidden above)
        if (!sectionId) {
            tr.style.display = '';
            return;
        }

        const collapsed = isSectionCollapsed(sectionId);
        if (collapsed) {
            tr.style.display = 'none';
            return;
        }

        // Section is open:
        // - if user manually expanded it, show default rows too
        // - if it was opened programmatically (due to highlight), keep default rows hidden
        const userExpanded = isSectionUserExpanded(sectionId);
        tr.style.display = userExpanded ? '' : 'none';
    }

    function refreshVisibilityForSection(sectionId) {
        if (!sectionId) return;
        document
            .querySelectorAll(`tr[${SECTION_ID_ATTR}="${CSS.escape(sectionId)}"]`)
            .forEach(refreshRowVisibility);
    }

    function refreshAllVisibility() {
        // Only rows in the prizeedit table should be considered
        const table = getPrizeEditTable();
        if (!table) return;

        table.querySelectorAll('tr').forEach(tr => {
            // only manage rows that are in sections OR explicitly highlighted OR explicitly always-hidden
            if (
                tr.hasAttribute(SECTION_ID_ATTR) ||
                tr.getAttribute('data-tm-highlighted') === '1' ||
                tr.getAttribute('data-tm-always-hidden') === '1'
            ) {
                refreshRowVisibility(tr);
            }
        });
    }

    /* ================= HEADER STYLE (PRIZEEDIT) ================= */

    function styleEditTriggerHeaderForPrizeEdit() {
        const headerTd = document.querySelector('td.formheader[colspan="2"]');
        if (!headerTd) return;

        const firstNode = headerTd.firstChild;
        if (!firstNode || firstNode.nodeType !== Node.TEXT_NODE) return;

        const original = firstNode.textContent || '';
        if (!original.includes('Edit Trigger')) return;

        firstNode.textContent = original.replace(/Edit Trigger\s*--\s*/i, 'Edit Trigger ');

        const span = document.createElement('span');
        span.textContent = 'Edit Trigger';
        span.style.fontWeight = '800';
        span.style.fontSize = '14px';

        const spacer = document.createTextNode('\u00A0|\u00A0');

        headerTd.removeChild(firstNode);
        headerTd.insertBefore(spacer, headerTd.firstChild);
        headerTd.insertBefore(span, headerTd.firstChild);
    }

    function removeAllHelpIconsInPrizeEditTable() {
        const table = getPrizeEditTable();
        if (!table) return;

        // Removes: <a href="javascript:help('...')">...</a>
        table.querySelectorAll('a[href^="javascript:help("]').forEach(a => a.remove());
    }

    /* ================= LABEL RENAMES ================= */

    function renameRowLabelsInPrizeEditTable() {
        const table = getPrizeEditTable();
        if (!table) return;

        const rules = LABEL_RENAMES.map(r => ({
            from: norm(r.from),
            to: r.to
        }));

        table.querySelectorAll('td.justright').forEach(td => {
            const text = norm(td.textContent);

            for (const rule of rules) {
                if (!text.startsWith(rule.from)) continue;

                //const help = td.querySelector('a[href^="javascript:help("]');

                td.textContent = rule.to;

                // ✅ Don't put the DoContinue help icon back
                //const href = help?.getAttribute('href') || '';
               // const isDoContinueHelp = href.includes("help('DoContinue')") || href.includes('DoContinue');

              //  if (help && !isDoContinueHelp) {
              //      td.appendChild(document.createTextNode(' '));
              //      td.appendChild(help);
             //   }
                break;
            }
        });
    }

    /* ================= SELECT2 WIDTH CLAMP (PRIZEEDIT TABLE ONLY) ================= */

    function clampSelect2WidthsInPrizeEditTable() {
        const table = getPrizeEditTable();
        if (!table) return;

        const containers = table.querySelectorAll('.select2-container');
        containers.forEach(container => {
            container.style.maxWidth = SELECT2_MAX_WIDTH + 'px';
            container.style.boxSizing = 'border-box';

            const current = container.getBoundingClientRect().width;
            if (current > SELECT2_MAX_WIDTH) {
                container.style.width = SELECT2_MAX_WIDTH + 'px';
            }

            const choice = container.querySelector('.select2-choice');
            if (choice) {
                choice.style.width = '100%';
                choice.style.boxSizing = 'border-box';
            }
        });
    }

    function observeSelect2WidthChangesInPrizeEditTable() {
        const table = getPrizeEditTable();
        if (!table) return;

        if (table.hasAttribute('data-tm-select2-width-observed')) return;
        table.setAttribute('data-tm-select2-width-observed', '1');

        const mo = new MutationObserver(() => {
            if (window.__tmSelect2ClampRAF) cancelAnimationFrame(window.__tmSelect2ClampRAF);
            window.__tmSelect2ClampRAF = requestAnimationFrame(clampSelect2WidthsInPrizeEditTable);
        });

        mo.observe(table, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });

        clampSelect2WidthsInPrizeEditTable();
    }

    /* ================= PIN / ALWAYS-HIDE / COLLAPSE ================= */

    function findRowByPinnedItem(item) {
        if (item === '__PRODUCT_COMBO__') {
            const el = document.querySelector('select#ProductCode');
            return el ? el.closest('tr') : null;
        }
        return findRowByLeftLabel(item);
    }

    function pinRowsBeforeFirstSection() {
        const table = getPrizeEditTable();
        if (!table) return;

        const firstSectionTr = findFirstSectionHeaderTrInTable(table);
        if (!firstSectionTr) return;

        const container = firstSectionTr.parentNode;

        // Remove old pin-break spacers
        container.querySelectorAll('tr[data-tm-pin-break="1"]').forEach(tr => tr.remove());

        const orderedNodes = [];

        for (const item of PIN_TO_TOP) {
            if (item === PIN_BREAK) {
                const spacer = document.createElement('tr');
                spacer.setAttribute('data-tm-pin-break', '1');

                const td = document.createElement('td');
                td.colSpan = 2;
                td.style.height = '5px';
                td.style.padding = '0';
                td.style.border = 'none';

                spacer.appendChild(td);
                orderedNodes.push(spacer);
                continue;
            }

            const tr = findRowByPinnedItem(item);
            if (!tr) continue;
            if (tr.closest('table') !== table) continue;

            tr.setAttribute('data-tm-pinned', '1');
            orderedNodes.push(tr);
        }

        for (const node of orderedNodes) {
            container.insertBefore(node, firstSectionTr);
        }
    }

    function markAlwaysHiddenRows() {
        // Mark only; visibility engine will enforce display:none
        document.querySelectorAll('td.justright').forEach(td => {
            const text = norm(td.textContent);
            if (HIDE_LABELS.some(l => text.startsWith(norm(l)))) {
                const tr = td.closest('tr');
                if (tr) {
                    tr.setAttribute('data-tm-always-hidden', '1');
                }
            }
        });
    }

    function collectRowsInSection(headerTr, sectionId) {
        document.querySelectorAll(`tr[${SECTION_ID_ATTR}="${CSS.escape(sectionId)}"]`)
            .forEach(tr => tr.removeAttribute(SECTION_ID_ATTR));

        const rows = [];
        let tr = headerTr.nextElementSibling;

        while (tr) {
            if (tr.querySelector('td.formsection')) break;
            rows.push(tr);
            tr = tr.nextElementSibling;
        }

        // preserve your existing "last section pop" behavior
        if (isLastFormSection(headerTr) && rows.length > 0) {
            rows.pop();
        }

        for (const row of rows) {
            row.setAttribute(SECTION_ID_ATTR, sectionId);
        }

        return rows;
    }

    function setCollapsed(headerTr, sectionId, collapsed) {
        headerTr.setAttribute(COLLAPSE_ATTR, collapsed ? '1' : '0');

        // ✅ Arrow is now derived from collapsed/userExpanded/autoOpen
        updateHeaderArrow(headerTr);

        refreshVisibilityForSection(sectionId);
    }


    function ensureArrowAndClick(headerTr, sectionId, collapsedByDefault) {
        const td = headerTr.querySelector('td.formsection');
        if (!td) return;

        if (!headerTr.hasAttribute(HEADER_ATTR)) {
            headerTr.setAttribute(HEADER_ATTR, '1');

            // store normalized title so findSectionHeaderTr works forever
            headerTr.setAttribute(HEADER_SECTION_ID_ATTR, sectionId);
            headerTr.setAttribute(HEADER_TITLE_ATTR, normTitle(td.textContent));

            const arrow = document.createElement('span');
            arrow.setAttribute(ARROW_ATTR, '1');
            arrow.style.display = 'inline-block';
            arrow.style.width = '1.2em';
            arrow.style.marginRight = '4px';

            td.insertBefore(arrow, td.firstChild);
            td.style.cursor = 'pointer';
            td.style.userSelect = 'none';

            td.addEventListener('click', () => {
                const collapsed = headerTr.getAttribute(COLLAPSE_ATTR) === '1';
                const autoOpen = headerTr.getAttribute(AUTO_OPEN_ATTR) === '1';
                const userExpanded = headerTr.getAttribute('data-tm-user-expanded') === '1';

                const isHighlightOnlyOpen = !collapsed && autoOpen && !userExpanded;

                // If it's highlight-only open, the next click should EXPAND (show all), not collapse.
                const expanding = collapsed || isHighlightOnlyOpen;

                if (expanding) {
                    headerTr.setAttribute('data-tm-user-expanded', '1');
                    headerTr.removeAttribute(AUTO_OPEN_ATTR);
                    setCollapsed(headerTr, sectionId, false);

                    requestAnimationFrame(() => refreshVisibilityForSection(sectionId));
                } else {
                    // Normal collapse
                    setCollapsed(headerTr, sectionId, true);
                }
            });
        }

        if (!headerTr.hasAttribute(COLLAPSE_ATTR)) {
            setCollapsed(headerTr, sectionId, collapsedByDefault);
        } else {
            setCollapsed(headerTr, sectionId, headerTr.getAttribute(COLLAPSE_ATTR) === '1');
        }
    }

    function setupCollapsibleSections() {
        for (const section of COLLAPSIBLE_SECTIONS) {
            const headerTr = findSectionHeaderTr(section.title);
            if (!headerTr) continue;

            const sectionId =
                  'tm-sec-' + norm(section.title).toLowerCase().replace(/[^a-z0-9]+/g, '-');

            // set IDs on header so lookups are stable even after arrow injection
            headerTr.setAttribute(HEADER_SECTION_ID_ATTR, sectionId);
            headerTr.setAttribute(HEADER_TITLE_ATTR, norm(section.title));

            collectRowsInSection(headerTr, sectionId);
            ensureArrowAndClick(headerTr, sectionId, section.collapsedByDefault);
        }
    }

    // Programmatic expand (for highlight). Does NOT mark "user expanded".
    function expandSectionAuto(title) {
        const headerTr = findSectionHeaderTr(title);
        if (!headerTr) return;

        const sectionId = headerTr.getAttribute(HEADER_SECTION_ID_ATTR);
        if (!sectionId) return;

        if (headerTr.getAttribute(COLLAPSE_ATTR) === '1') {
            headerTr.setAttribute(AUTO_OPEN_ATTR, '1');
            setCollapsed(headerTr, sectionId, false);
        }
    }

    /* ================= LOCATION GROUP LINK ================= */

    function findLocationGroupRow() {
        return findRowByLeftLabel('Location Group :');
    }

    function findLocationGroupSelect() {
        const tr = findLocationGroupRow();
        if (!tr) return null;
        return tr.querySelector('select[name="LocationGroup"]') || tr.querySelector('select');
    }

    function updateLocationGroupLinkFromSelect() {
        const tr = findLocationGroupRow();
        const sel = findLocationGroupSelect();
        if (!tr || !sel) return;

        const tdLeft = tr.querySelector('td.justright');
        if (!tdLeft) return;

        let link = tdLeft.querySelector('#tmLocationGroupLink');
        if (!link) {
           // const help = tdLeft.querySelector('a[href^="javascript:help("]');
            tdLeft.innerHTML = '';

            link = document.createElement('a');
            link.id = 'tmLocationGroupLink';
            link.target = '_blank';
            link.textContent = 'Location Group';

            tdLeft.appendChild(link);
            tdLeft.appendChild(document.createTextNode(' : '));
          //  if (help) tdLeft.appendChild(help);
        }

        const val = String(sel.value || '').trim();
        if (!val || val === '0') {
            link.href = '#';
            link.style.opacity = '0.55';
            return;
        }

        const u = new URL('/loy/twiz5locations.php', window.location.origin);
        u.searchParams.set('g', val);
        link.href = u.toString();
        link.style.opacity = '';
    }

    function wireLocationGroupLinkUpdates() {
        const sel = findLocationGroupSelect();
        if (!sel) return;

        if (sel.hasAttribute('data-tm-locationgroup-wired')) return;
        sel.setAttribute('data-tm-locationgroup-wired', '1');

        updateLocationGroupLinkFromSelect();

        sel.addEventListener('change', updateLocationGroupLinkFromSelect);
        sel.addEventListener('change.select2', updateLocationGroupLinkFromSelect);
    }

    /* ================= MEMBER GROUP LINK ================= */

    function findMemberGroupRow() {
        return findRowByLeftLabel('Member Group :');
    }

    function findMemberGroupSelect() {
        const tr = findMemberGroupRow();
        if (!tr) return null;
        return tr.querySelector('select[name="MemberGroup"]') || tr.querySelector('select');
    }

    function updateMemberGroupLinkFromSelect() {
        const tr = findMemberGroupRow();
        const sel = findMemberGroupSelect();
        if (!tr || !sel) return;

        const tdLeft = tr.querySelector('td.justright');
        if (!tdLeft) return;

        let link = tdLeft.querySelector('#tmMemberGroupLink');
        if (!link) {
            //const help = tdLeft.querySelector('a[href^="javascript:help("]');
            tdLeft.innerHTML = '';

            link = document.createElement('a');
            link.id = 'tmMemberGroupLink';
            link.target = '_blank';
            link.textContent = 'Member Group';

            tdLeft.appendChild(link);
            tdLeft.appendChild(document.createTextNode(' : '));
           // if (help) tdLeft.appendChild(help);
        }

        const val = String(sel.value || '').trim();
        if (!val || val === '0') {
            link.href = '#';
            link.style.opacity = '0.55';
            return;
        }

        const u = new URL('/loy/twiz4members.php', window.location.origin);
        u.searchParams.set('g', val);
        link.href = u.toString();
        link.style.opacity = '';
    }

    function wireMemberGroupLinkUpdates() {
        const sel = findMemberGroupSelect();
        if (!sel) return;

        if (sel.hasAttribute('data-tm-membergroup-wired')) return;
        sel.setAttribute('data-tm-membergroup-wired', '1');

        updateMemberGroupLinkFromSelect();

        sel.addEventListener('change', updateMemberGroupLinkFromSelect);
        sel.addEventListener('change.select2', updateMemberGroupLinkFromSelect);
    }

    /* ================= HIGHLIGHT SYSTEM (ARRAY-DRIVEN) ================= */

    const TM_HIGHLIGHT_STYLE = {
        background: '#90388B',
        color: '#ffffff',
        paddingTop: '8px',
        paddingBottom: '8px'
    };

    function resolveRuleRowAndControl(rule) {
        let control = null;
        let tr = null;

        if (rule.controlSelector) {
            control = document.querySelector(rule.controlSelector);
            if (control) tr = control.closest('tr');
        }

        if (!control && rule.name) {
            control = document.querySelector(`[name="${CSS.escape(rule.name)}"]`);
            if (control) tr = control.closest('tr');
        }

        if (!control && rule.key) {
            control = document.querySelector(
                `[name="${CSS.escape(rule.key)}"], #${CSS.escape(rule.key)}`
      );
        if (control) tr = control.closest('tr');
    }

      if (!tr && rule.label) {
          tr = findRowByLeftLabel(rule.label);
          if (tr) control = tr.querySelector('input, select, textarea');
      }

      if (!tr && rule.labels && Array.isArray(rule.labels)) {
          for (const label of rule.labels) {
              tr = findRowByLeftLabel(label);
              if (tr) {
                  control = tr.querySelector('input, select, textarea');
                  break;
              }
          }
      }

      return { tr, control };
  }

    function applyHighlightToRow(tr, style = TM_HIGHLIGHT_STYLE) {
        if (!tr) return;

        tr.style.background = style.background;
        tr.style.color = style.color;

        tr.querySelectorAll('td').forEach(td => {
            td.style.color = style.color;
            td.style.paddingTop = style.paddingTop;
            td.style.paddingBottom = style.paddingBottom;
        });

        tr.setAttribute('data-tm-highlighted', '1');
    }

    function clearHighlightFromRow(tr) {
        if (!tr) return;

        tr.style.background = '';
        tr.style.color = '';
        tr.querySelectorAll('td').forEach(td => {
            td.style.color = '';
            td.style.paddingTop = '';
            td.style.paddingBottom = '';
        });
        tr.removeAttribute('data-tm-highlighted');
    }

    function getControlValue(control, type) {
        if (!control) return '';
        if (type === 'checkbox') return control.checked ? '1' : '0';
        return String(control.value ?? '').trim();
    }

    function isNonDefaultValue(value, rule) {
        const defaults = (rule.defaultValues || []).map(v => String(v).trim());
        if (!defaults.length) return value !== '';
        return !defaults.includes(String(value).trim());
    }

    function evaluateHighlightRule(rule) {
        const { tr, control } = resolveRuleRowAndControl(rule);
        if (!tr || !control) return;

        const currentValue = getControlValue(control, rule.type);
        const nonDefault = isNonDefaultValue(currentValue, rule);

        if (nonDefault) {
            applyHighlightToRow(tr, rule.style || TM_HIGHLIGHT_STYLE);

            // programmatic expand, NOT user expand
            if (rule.expandSectionTitle) {
                safeRun('expandSectionAuto', () => expandSectionAuto(rule.expandSectionTitle));
            }

            if (typeof rule.onNonDefault === 'function') {
                safeRun('rule.onNonDefault', rule.onNonDefault);
            }
        } else {
            clearHighlightFromRow(tr);

            if (typeof rule.onDefault === 'function') {
                safeRun('rule.onDefault', rule.onDefault);
            }
        }

        // ✅ After any highlight change, visibility is re-applied centrally
        refreshRowVisibility(tr);
    }

    function wireHighlightRule(rule) {
        const { tr, control } = resolveRuleRowAndControl(rule);
        if (!tr || !control) return;

        const wireKey = `data-tm-highlight-wired-${(rule.key || rule.name || rule.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        if (control.hasAttribute(wireKey)) return;
        control.setAttribute(wireKey, '1');

        // Initial evaluation
        evaluateHighlightRule(rule);

        // Normal field changes
        control.addEventListener('change', () => evaluateHighlightRule(rule));
        control.addEventListener('input', () => evaluateHighlightRule(rule));
        control.addEventListener('change.select2', () => evaluateHighlightRule(rule));

        // Also watch the select2 container text for changes (covers UI-only updates)
        if (rule.observeSelect2) {
            const s2 = control.closest('td')?.querySelector('.select2-container');
            if (s2 && !s2.hasAttribute(wireKey + '-mo')) {
                s2.setAttribute(wireKey + '-mo', '1');
                new MutationObserver(() => evaluateHighlightRule(rule))
                    .observe(s2, { childList: true, subtree: true, characterData: true });
            }
        }
    }

    function wireHighlightRules(rules) {
        (rules || []).forEach(rule => safeRun('wireHighlightRule', () => wireHighlightRule(rule)));
    }

    /* ================= VENDOR PROGRAM WIDTH HELPER ================= */

    function setVendorProgramSelect2Width(px) {
        const tr = findRowByLeftLabel('Vendor Program :');
        if (!tr) return;

        const s2 = tr.querySelector('#s2id_vendorProgram') || tr.querySelector('.select2-container');
        if (!s2) return;

        s2.style.width = px + 'px';
        s2.style.maxWidth = px + 'px';
        s2.style.boxSizing = 'border-box';

        const choice = s2.querySelector('.select2-choice');
        if (choice) {
            choice.style.width = '100%';
            choice.style.boxSizing = 'border-box';
        }
    }

    /* ================= PRODUCT COMBO PLACEHOLDER (UNCHANGED) ================= */

    function buildProductComboRow() {
        const tr = document.createElement('tr');

        const tdLeft = document.createElement('td');
        tdLeft.className = 'justright';
        tdLeft.setAttribute('valign', 'middle');
        tdLeft.innerHTML = `<a id="tmProductComboLink" target="_blank" href="#">Product Combo</a> :`;

        const tdRight = document.createElement('td');
        tdRight.className = 'justleft';

        const select = document.createElement('select');
        select.name = 'ProductCode';
        select.id = 'ProductCode';
        select.style.width = '100%';

        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Loading...';
        select.appendChild(opt);

        tdRight.appendChild(select);

        tr.appendChild(tdLeft);
        tr.appendChild(tdRight);

        return tr;
    }

    function ensureProductComboPlaceholderRow() {
        if (document.querySelector('select#ProductCode')) return true;

        const table = getPrizeEditTable();
        if (!table) return false;

        const firstSectionTr = findFirstSectionHeaderTrInTable(table);
        if (!firstSectionTr) return false;

        const row = buildProductComboRow();
        firstSectionTr.parentNode.insertBefore(row, firstSectionTr);

        return true;
    }

    /* ================= MATCH COMBO PLACEHOLDERS (UNCHANGED) ================= */

    function buildMatchComboRow(index) {
        const tr = document.createElement('tr');
        tr.setAttribute('data-tm-matchcombo-row', String(index));

        const tdLeft = document.createElement('td');
        tdLeft.className = 'justright';
        tdLeft.setAttribute('valign', 'middle');
        tdLeft.innerHTML = `<a id="tmMatchComboLink-${index}" target="_blank" href="#">Match Combo ${index + 2}</a> :`;

        const tdRight = document.createElement('td');
        tdRight.className = 'justleft';

        const select = document.createElement('select');
        select.name = `ProductCodeMatch[${index}]`;
        select.id = `ProductCodeMatch[${index}]`;
        select.style.width = '100%';

        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Loading...';
        select.appendChild(opt);

        tdRight.appendChild(select);

        tr.appendChild(tdLeft);
        tr.appendChild(tdRight);

        return tr;
    }

    function getOrCreateMatchComboRow(index, insertBeforeTr) {
        let tr = document.querySelector(`tr[data-tm-matchcombo-row="${index}"]`);
        if (!tr) {
            tr = buildMatchComboRow(index);
            insertBeforeTr.parentNode.insertBefore(tr, insertBeforeTr);
        }
        return tr;
    }

    function updateMatchComboLinkFromLocalSelect(index) {
        const sel = document.querySelector(`#${CSS.escape(`ProductCodeMatch[${index}]`)}`);
        const link = document.querySelector(`#tmMatchComboLink-${index}`);
        if (!sel || !link) return;

        const val = (sel.value || '').trim();
        if (!val || val === '0') {
            link.href = '#';
            link.style.opacity = '0.55';
            return;
        }

        const comboUrl = new URL('/loy/comboproducts.php', window.location.origin);
        comboUrl.searchParams.set('r', val);
        link.href = comboUrl.toString();
        link.style.opacity = '';
    }

    function ensureMatchComboPlaceholderRowsForTrigger29() {
        if (getTriggerTypeValue() !== '29') return false;
        if (document.documentElement.hasAttribute('data-tm-matchcombo-placeholders')) return true;

        const table = getPrizeEditTable();
        if (!table) return false;

        const firstSectionTr = findFirstSectionHeaderTrInTable(table);
        if (!firstSectionTr) return false;

        for (let i = 0; i < MATCH_COMBO_MAX; i++) {
            const tr = getOrCreateMatchComboRow(i, firstSectionTr);

            tr.style.display = (i === 0) ? '' : 'none';
            updateMatchComboLinkFromLocalSelect(i);
        }

        document.documentElement.setAttribute('data-tm-matchcombo-placeholders', '1');
        return true;
    }

    function removeProductComboPlaceholderRow() {
        const sel = document.querySelector('select#ProductCode');
        const tr = sel ? sel.closest('tr') : null;
        if (tr && tr.querySelector('#tmProductComboLink')) tr.remove();
    }

    function removeMatchComboPlaceholderRows() {
        document.querySelectorAll('tr[data-tm-matchcombo-row]').forEach(tr => tr.remove());
        document.documentElement.removeAttribute('data-tm-matchcombo-placeholders');
    }

    function ensureProductComboUIForCurrentTriggerType() {
        if (shouldSkipProductComboLoading()) {
            removeProductComboPlaceholderRow();
            removeMatchComboPlaceholderRows();
            return false;
        }
        ensureProductComboPlaceholderRow();
        ensureMatchComboPlaceholderRowsForTrigger29();
        return true;
    }

    /* ================= PRODUCT COMBO LOADING (UNCHANGED) ================= */

    function getRParam() {
        const params = new URLSearchParams(location.search);
        return params.get('r') || params.get('id') || params.get('record') || params.get('RecordID');
    }

    function buildPrizeExtraUrl() {
        const u = new URL(location.href);
        u.pathname = u.pathname.replace(/\/prizeedit\.php$/i, '/prizeextra.php');
        return u.toString();
    }

    function ensureStatusSpanNextToSelect(selectEl) {
        let s = document.querySelector('#tm-productcombo-status');
        if (s) return s;

        s = document.createElement('span');
        s.id = 'tm-productcombo-status';
        s.style.marginLeft = '8px';
        s.style.fontSize = '12px';
        s.style.opacity = '0.8';
        s.textContent = '';
        selectEl.parentElement.appendChild(s);
        return s;
    }

    function setStatus(text) {
        const sel = document.querySelector('select#ProductCode');
        if (!sel) return;
        const s = ensureStatusSpanNextToSelect(sel);
        s.textContent = text || '';
    }

    function updateProductComboLinkFromLocalSelect() {
        const sel = document.querySelector('select#ProductCode');
        const link = document.querySelector('#tmProductComboLink');
        if (!sel || !link) return;

        const val = sel.value;
        if (!val) return;

        const comboUrl = new URL('/loy/comboproducts.php', window.location.origin);
        comboUrl.searchParams.set('r', val);
        link.href = comboUrl.toString();
    }

    let tmPrizeExtraFormCtx = null;
    let tmSaveTimer = null;

    async function saveSelectedProductCombo() {
        const sel = document.querySelector('select#ProductCode');
        if (!sel) return;

        if (!tmPrizeExtraFormCtx) {
            throw new Error('No prizeextra form context captured yet (tmPrizeExtraFormCtx is null)');
        }

        const payload = new URLSearchParams(tmPrizeExtraFormCtx.fields.toString());

        payload.delete('ProductCode');
        payload.append('ProductCode', sel.value);

        payload.delete('submit');
        payload.append('submit', 'Update Trigger');

        setStatus('Saving…');

        const resp = await fetch(tmPrizeExtraFormCtx.actionUrl, {
            method: (tmPrizeExtraFormCtx.method || 'POST').toUpperCase(),
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: payload.toString()
        });

        if (!resp.ok) {
            setStatus('Error saving');
            throw new Error(`Save failed: ${resp.status}`);
        }

        setStatus('Saved');
    }

    function wireAutoSaveOnProductComboChange() {
        const sel = document.querySelector('select#ProductCode');
        if (!sel) return;

        if (sel.hasAttribute('data-tm-save-wired')) return;
        sel.setAttribute('data-tm-save-wired', '1');

        sel.addEventListener('change', () => {
            updateProductComboLinkFromLocalSelect();

            if (tmSaveTimer) clearTimeout(tmSaveTimer);
            tmSaveTimer = setTimeout(async () => {
                try {
                    await saveSelectedProductCombo();
                } catch (e) {
                    console.warn('[TM] Product Combo save failed:', e);
                    setStatus('Error saving');
                }
            }, 350);
        });

        sel.addEventListener('change.select2', updateProductComboLinkFromLocalSelect);
    }

    function wireMatchComboLinkUpdates() {
        for (let i = 0; i < MATCH_COMBO_MAX; i++) {
            const sel = document.querySelector(`#${CSS.escape(`ProductCodeMatch[${i}]`)}`);
            if (!sel) continue;

            if (sel.hasAttribute('data-tm-link-wired')) continue;
            sel.setAttribute('data-tm-link-wired', '1');

            sel.addEventListener('change', () => {
                updateMatchComboLinkFromLocalSelect(i);

                const row = sel.closest('tr');
                if (row && i >= 1) {
                    row.style.display = hasRealSelection(sel) ? '' : 'none';
                }
            });

            sel.addEventListener('change.select2', () => updateMatchComboLinkFromLocalSelect(i));
        }
    }

    let __tmLastTriggerType = null;
    let __tmTriggerTypeDebounce = null;

    function resetProductComboLoadState() {
        document.documentElement.removeAttribute('data-tm-productcombo-started');
    }

    function handleTriggerTypeChange() {
        const current = getTriggerTypeValue();

        if (current === __tmLastTriggerType) return;
        __tmLastTriggerType = current;

        if (__tmTriggerTypeDebounce) clearTimeout(__tmTriggerTypeDebounce);

        __tmTriggerTypeDebounce = setTimeout(async () => {
            if (shouldSkipProductComboLoading(current)) {
                removeProductComboPlaceholderRow();
                removeMatchComboPlaceholderRows();
                resetProductComboLoadState();
                return;
            }

            const hasUI = ensureProductComboUIForCurrentTriggerType();
            if (!hasUI) return;

            safeRun('pinRowsBeforeFirstSection (after triggertype)', pinRowsBeforeFirstSection);

            resetProductComboLoadState();
            await ensureProductCombosLoadedAsync(true);
        }, 250);
    }

    function wireTriggerTypeWatcher() {
        const sel =
              document.querySelector('select[name="triggertype"]') ||
              document.querySelector('select#triggertype') ||
              document.querySelector('select[name="triggerType"]') ||
              document.querySelector('select#triggerType');

        if (!sel) return;
        if (sel.hasAttribute('data-tm-triggertype-wired')) return;
        sel.setAttribute('data-tm-triggertype-wired', '1');

        __tmLastTriggerType = getTriggerTypeValue();

        sel.addEventListener('change', handleTriggerTypeChange);
        sel.addEventListener('change.select2', handleTriggerTypeChange);

        const tr = sel.closest('tr');
        const s2 = tr && tr.querySelector('.select2-container');

        if (s2 && !s2.hasAttribute('data-tm-triggertype-s2watched')) {
            s2.setAttribute('data-tm-triggertype-s2watched', '1');

            const mo = new MutationObserver(() => {
                handleTriggerTypeChange();
            });

            mo.observe(s2, { childList: true, subtree: true, characterData: true });
        }
    }

    async function populateProductComboOptionsFromPrizeExtra() {
        return new Promise((resolve, reject) => {
            const pageUrl = buildPrizeExtraUrl();

            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.left = '-99999px';
            iframe.style.top = '0';
            iframe.style.width = '1px';
            iframe.style.height = '1px';
            iframe.style.opacity = '0';
            iframe.setAttribute('aria-hidden', 'true');
            iframe.src = pageUrl;

            const cleanup = () => { try { iframe.remove(); } catch (e) {} };

            const hardTimeout = setTimeout(() => {
                cleanup();
                reject(new Error('Timed out loading prizeextra.php iframe (may be blocked by X-Frame-Options/CSP)'));
            }, 12000);

            iframe.onload = () => {
                const start = Date.now();

                const poll = setInterval(() => {
                    try {
                        const doc = iframe.contentDocument;
                        if (!doc || !doc.documentElement) return;

                        const remoteSelect =
                              doc.querySelector('select#ProductCode') ||
                              doc.querySelector('select[name="ProductCode"]');

                        if (!remoteSelect) return;

                        const remoteOptions = remoteSelect.querySelectorAll('option');
                        if (!remoteOptions.length) return;

                        const localSelect = document.querySelector('select#ProductCode');
                        if (!localSelect) throw new Error('Local select#ProductCode not found');

                        localSelect.innerHTML = '';
                        for (const opt of remoteOptions) localSelect.appendChild(opt.cloneNode(true));

                        const remoteForm = remoteSelect.closest('form');
                        if (!remoteForm) throw new Error('Could not find parent <form> for ProductCode on prizeextra.php');

                        const actionUrl = new URL(remoteForm.getAttribute('action') || pageUrl, pageUrl).toString();
                        const method = (remoteForm.getAttribute('method') || 'POST').toUpperCase();

                        const fields = new URLSearchParams();
                        const els = remoteForm.querySelectorAll('input, select, textarea');

                        for (const el of els) {
                            if (!el.name) continue;
                            const tag = el.tagName.toLowerCase();
                            const type = (el.getAttribute('type') || '').toLowerCase();
                            if (el.disabled) continue;

                            if (tag === 'input' && (type === 'checkbox' || type === 'radio')) {
                                if (!el.checked) continue;
                                fields.append(el.name, el.value || 'on');
                                continue;
                            }

                            if (tag === 'input' && (type === 'submit' || type === 'button')) continue;
                            if (tag === 'button') continue;

                            fields.append(el.name, el.value ?? '');
                        }

                        tmPrizeExtraFormCtx = { actionUrl, method, fields };

                        if (getTriggerTypeValue() === '29') {
                            const table = getPrizeEditTable();
                            const firstSectionTrLocal = findFirstSectionHeaderTrInTable(table);

                            if (firstSectionTrLocal) {
                                for (let i = 0; i < MATCH_COMBO_MAX; i++) {
                                    const remoteMatch =
                                          doc.querySelector(`#${CSS.escape(`ProductCodeMatch[${i}]`)}`) ||
                                          doc.querySelector(`select[name="ProductCodeMatch[${i}]"]`);

                                    if (!remoteMatch) continue;

                                    const localRow = getOrCreateMatchComboRow(i, firstSectionTrLocal);
                                    const localSel =
                                          localRow.querySelector(`#${CSS.escape(`ProductCodeMatch[${i}]`)}`) ||
                                          localRow.querySelector(`select[name="ProductCodeMatch[${i}]"]`);

                                    if (!localSel) continue;

                                    localSel.innerHTML = '';
                                    for (const opt of remoteMatch.querySelectorAll('option')) {
                                        localSel.appendChild(opt.cloneNode(true));
                                    }

                                    localSel.value = remoteMatch.value;
                                    updateMatchComboLinkFromLocalSelect(i);

                                    if (i === 0) {
                                        localRow.style.display = '';
                                    } else {
                                        localRow.style.display = hasRealSelection(localSel) ? '' : 'none';
                                    }

                                    const $ = window.jQuery;
                                    if ($ && $.fn && $.fn.select2) {
                                        try { if ($(localSel).data('select2')) $(localSel).select2('destroy'); } catch (e) {}
                                        $(localSel).select2({ width: '100%' });
                                    }
                                }
                            }
                        }

                        const $ = window.jQuery;
                        if ($ && $.fn && $.fn.select2) {
                            try { if ($(localSelect).data('select2')) $(localSelect).select2('destroy'); } catch (e) {}
                            $(localSelect).select2({ width: '100%' });
                        }

                        updateProductComboLinkFromLocalSelect();

                        clearInterval(poll);
                        clearTimeout(hardTimeout);
                        cleanup();
                        resolve();
                    } catch (err) {
                        clearInterval(poll);
                        clearTimeout(hardTimeout);
                        cleanup();
                        reject(err);
                    }

                    if (Date.now() - start > 3000) {
                        clearInterval(poll);
                        clearTimeout(hardTimeout);
                        cleanup();
                        reject(new Error('prizeextra.php loaded, but ProductCode select/options never appeared'));
                    }
                }, 200);
            };

            document.body.appendChild(iframe);
        });
    }

    async function ensureProductCombosLoadedAsync(forceReload = false) {
        if (!forceReload) {
            if (document.documentElement.hasAttribute('data-tm-productcombo-started')) return;
            document.documentElement.setAttribute('data-tm-productcombo-started', '1');
        } else {
            document.documentElement.removeAttribute('data-tm-productcombo-started');
            document.documentElement.setAttribute('data-tm-productcombo-started', '1');
        }

        if (shouldSkipProductComboLoading()) return;

        ensureProductComboPlaceholderRow();
        ensureMatchComboPlaceholderRowsForTrigger29();

        const rValue = getRParam();
        if (!rValue) return;

        try {
            await populateProductComboOptionsFromPrizeExtra();
            wireAutoSaveOnProductComboChange();

            if (getTriggerTypeValue() === '29') {
                wireMatchComboLinkUpdates();
            }
        } catch (e) {
            const sel = document.querySelector('select#ProductCode');
            if (sel) {
                sel.innerHTML = '';
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'Unable to load options (open Product Combo link)';
                sel.appendChild(opt);
            }
            console.warn('[TM] Product Combo options failed:', e);
        }
    }

    /* ================= LEVEL / KBID VISIBLE ROWS ================= */

    function findAppliesToAnchorRow() {
        // Prefer "Applies to", fallback to "Description"
        return findRowByLeftLabel('Applies to :') || findRowByLeftLabel('Description :');
    }

    function forceElementVisible(el) {
        if (!el) return;

        el.hidden = false;
        el.removeAttribute('hidden');

        el.style.display = '';
        el.style.visibility = '';
        el.style.opacity = '';

        el.disabled = false;
        el.readOnly = false;
        el.removeAttribute('disabled');
        el.removeAttribute('readonly');

        if (el.tagName.toLowerCase() === 'input') {
            const t = (el.getAttribute('type') || '').toLowerCase();
            if (!t || t === 'hidden') el.type = 'text';
        }
    }

    function buildManualRow(labelText, attrName) {
        const tr = document.createElement('tr');
        tr.setAttribute('data-tm-pinned', '1');
        tr.setAttribute(attrName, '1');

        const tdLabel = document.createElement('td');
        tdLabel.className = 'justright';
        tdLabel.setAttribute('valign', 'middle');
        tdLabel.textContent = labelText;

        const tdInput = document.createElement('td');
        tdInput.className = 'justleft';

        tr.appendChild(tdLabel);
        tr.appendChild(tdInput);
        return tr;
    }

    function insertManualLevelRowsUnderAppliesTo() {
        // Run once
        if (document.documentElement.hasAttribute('data-tm-level-inserted')) return true;

        const anchorTr = findAppliesToAnchorRow();
        if (!anchorTr) return false;

        const levelname =
              document.querySelector('#levelname') ||
              document.querySelector('input[name="levelname"]');

        const levelid =
              document.querySelector('#levelid') ||
              document.querySelector('input[name="levelid"]');

        if (!levelname || !levelid) return false;

        forceElementVisible(levelname);
        forceElementVisible(levelid);

        // Optional sizing
        levelname.style.width = '180px';
        levelid.style.width = '80px';

        // Create rows (or reuse if they already exist)
        const levelTr =
              document.querySelector('tr[data-tm-manual-level-row="1"]') ||
              buildManualRow('Level:', 'data-tm-manual-level-row');

        const kbidTr =
              document.querySelector('tr[data-tm-manual-kbid-row="1"]') ||
              buildManualRow('KBID:', 'data-tm-manual-kbid-row');

        // Move inputs into the new rows
        const levelTd = levelTr.querySelector('td.justleft');
        const kbidTd = kbidTr.querySelector('td.justleft');

        if (levelTd && levelname.parentElement !== levelTd) {
            levelTd.innerHTML = '';
            levelTd.appendChild(levelname);
        }

        if (kbidTd && levelid.parentElement !== kbidTd) {
            kbidTd.innerHTML = '';
            kbidTd.appendChild(levelid);
        }

        // Insert under Applies To
        const parent = anchorTr.parentNode;
        parent.insertBefore(levelTr, anchorTr.nextSibling);
        parent.insertBefore(kbidTr, levelTr.nextSibling);

        document.documentElement.setAttribute('data-tm-level-inserted', '1');
        return true;
    }

    /* ================= EXECUTION ================= */

    let tmLayoutDone = false;

    function applyLayoutOnce() {
        if (tmLayoutDone) return;
        tmLayoutDone = true;

        // Phase 0: wire cross-links
        safeRun('wireMemberGroupLinkUpdates', wireMemberGroupLinkUpdates);
        safeRun('wireLocationGroupLinkUpdates', wireLocationGroupLinkUpdates);

        // Phase 1: placeholders before pinning
        safeRun('wireTriggerTypeWatcher', wireTriggerTypeWatcher);
        safeRun('ensureProductComboUIForCurrentTriggerType', ensureProductComboUIForCurrentTriggerType);

        // Phase 2: layout / pin / rename / header
        safeRun('pinRowsBeforeFirstSection', pinRowsBeforeFirstSection);
        safeRun('insertManualLevelRowsUnderAppliesTo', insertManualLevelRowsUnderAppliesTo);

        // (Your Level/KBID restore function was large; if you still want it, paste it back above and call it here)
        safeRun('renameRowLabelsInPrizeEditTable', renameRowLabelsInPrizeEditTable);
        safeRun('removeAllHelpIconsInPrizeEditTable', removeAllHelpIconsInPrizeEditTable);
        safeRun('styleEditTriggerHeaderForPrizeEdit', styleEditTriggerHeaderForPrizeEdit);

        // Phase 3: collapsibles + section IDs
        safeRun('setupCollapsibleSections', setupCollapsibleSections);

        // Phase 4: always-hidden marking
        safeRun('markAlwaysHiddenRows', markAlwaysHiddenRows);

        // Phase 5: highlight rules (ONLY sets highlight state + styling)
        safeRun('wireHighlightRules', () => wireHighlightRules(HIGHLIGHT_RULES));

        // Phase 6: clamp widths
        safeRun('observeSelect2WidthChangesInPrizeEditTable', observeSelect2WidthChangesInPrizeEditTable);

        // Phase 7: one final, centralized visibility pass
        safeRun('refreshAllVisibility', refreshAllVisibility);
    }

    function start() {
        safeRun('applyLayoutOnce', applyLayoutOnce);

        if (!shouldSkipProductComboLoading()) {
            ensureProductCombosLoadedAsync()
                .catch(e => console.warn('[TM] Product Combo load failed:', e));
        }
    }

    start();

})();
