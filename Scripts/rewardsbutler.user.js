// ==UserScript==
// @name         rewardsbutler.com
// @author       arbruffett
// @match        https://*.rewardsbutler.com/*
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.1.9
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/rewardsbutler.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/rewardsbutler.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // Toggle HUD + console logging
    const DEBUG = false;
    const THROTTLE_MS = 300;
    const USER_MENU_ID = 'rb-user-menu';

    // Program label fades in after you scroll this many pixels
    const PROGRAM_FADE_START_PX = 180;

    // (optional) how many pixels the fade should take to reach fully visible
    const PROGRAM_FADE_RANGE_PX = 180;

    let inScript = false;

    // Make Consultant button swap between your OFF/ON images on hover
    function wireConsultantHover(root = document) {
        // This matches how you already target area icons elsewhere
        const img = root.querySelector('img[name="Consultant"]');
        if (!img) return { done: false, reason: 'Consultant img not found' };

        // Stop the site from overriding src on hover
        const link = img.closest('a');
        if (link) {
            link.removeAttribute('onmouseover');
            link.removeAttribute('onmouseout');
            link.removeAttribute('onmouseenter');
            link.removeAttribute('onmouseleave');
        }
        img.removeAttribute('onmouseover');
        img.removeAttribute('onmouseout');
        img.removeAttribute('onmouseenter');
        img.removeAttribute('onmouseleave');

        // Prevent double-wiring (your MutationObserver calls runOnceSafely a lot)
        if (img.dataset.rbConsultantHoverWired === '1') {
            return { done: true, reason: 'already wired' };
        }
        img.dataset.rbConsultantHoverWired = '1';

        return { done: true, reason: 'wired hover swap' };
    }

    function setProgramChipText(programName) {
        const chip = document.querySelector(`#${CSS.escape(USER_MENU_ID)} .rb-prog-chip`);
        if (!chip) return { ok: false, reason: 'chip not found' };

        const txt = normalizeSpaces(programName || '');
        if (!txt) return { ok: false, reason: 'no programName' };

        if (chip.textContent !== txt) chip.textContent = txt;
        return { ok: true };
    }

    function bindProgramChipFadeOnScroll() {
        // Only bind once
        if (document.documentElement.dataset.rbProgChipFadeBound === '1') return;
        document.documentElement.dataset.rbProgChipFadeBound = '1';

        const update = () => {
            const chip = document.querySelector(`#${CSS.escape(USER_MENU_ID)} .rb-prog-chip`);
            if (!chip) return;

            const y = window.scrollY || document.documentElement.scrollTop || 0;

            // Fade from 0 -> 1 over PROGRAM_FADE_RANGE_PX after PROGRAM_FADE_START_PX
            const t = (y - PROGRAM_FADE_START_PX) / PROGRAM_FADE_RANGE_PX;
            const opacity = Math.max(0, Math.min(1, t));

            chip.style.opacity = String(opacity);
        };

        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update, { passive: true });

        // Initialize
        update();
    }

    function extractLoginNameFromStrongText(strongText) {
        const s = normalizeSpaces(strongText || '');
        if (!s) return '';

        const at = s.indexOf('@');
        if (at <= 0) return '';

        return s.slice(0, at).trim();
    }

    function ensureUserMenu(loginName) {
        if (!loginName) return { ok: false, reason: 'no loginName' };

        // Already exists
        if (document.getElementById(USER_MENU_ID)) {
            // Keep name updated just in case
            const nameEl = document.querySelector(`#${CSS.escape(USER_MENU_ID)} .rb-um-name`);
            if (nameEl && nameEl.textContent !== loginName) nameEl.textContent = loginName;
            return { ok: true, reason: 'already exists' };
        }

        // Styles (idempotent)
        if (!document.getElementById('rb-user-menu-style')) {
            const style = document.createElement('style');
            style.id = 'rb-user-menu-style';
            style.textContent = `
            #${USER_MENU_ID}{
              position:fixed;
              top:0px;
              right:0px;
              z-index:999999;
              font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
            }
            #${USER_MENU_ID} .rb-um-trigger{
              display:inline-flex;
              align-items:center;
              gap:2px;
              padding:6px 10px;
              border:1px solid rgba(0,0,0,.12);
              border-radius:3px;
              background:#fff;
              color:#000;
              cursor:pointer;
              user-select:none;
              font-size:16px;
              line-height:1;
            }
            #${USER_MENU_ID} .rb-um-caret{font-size:12px;opacity:.8}
            #${USER_MENU_ID} .rb-um-dropdown{
              position:absolute;
              top:calc(100% + 2px);
              right:0;
              min-width:140px;
              background:#fff;
              border:1px solid rgba(0,0,0,.12);
              border-radius:3px;
              box-shadow:0 10px 24px rgba(0,0,0,.18);
              padding:6px;
              display:none;
            }
            #${USER_MENU_ID}[data-open="true"] .rb-um-dropdown{display:block}
            #${USER_MENU_ID} .rb-um-item{
              display:block;
              padding:8px 10px;
              border-radius:3px;
              color:#111;
              text-decoration:none;
              font-size:15px;
            }
            #${USER_MENU_ID} .rb-um-item:hover{background:rgba(0,0,0,.06)}
            #rb-user-menu .rb-prog-chip{
              display:inline-flex;
              align-items:center;
              margin-right:3px;          /* spacing between program chip and user trigger */
              padding:6px 10px;
              border-radius:3px;
              background:rgba(255,255,255,0.85);
              color:#000;
              border:1px solid rgba(0,0,0,0.15);
              font-size:12px;
              line-height:1;
              opacity:0;                 /* start transparent */
              transition: opacity 450ms ease; /* "slowly fade in" */
              pointer-events:none;       /* optional: don't intercept clicks */
            }
        `;
            document.head.appendChild(style);
        }

        const menu = document.createElement('div');
        menu.id = USER_MENU_ID;
        menu.setAttribute('data-open', 'false');
        menu.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:flex-end;">
            <div class="rb-prog-chip" title="Program"></div>

            <div class="rb-um-trigger" role="button" aria-haspopup="true" aria-expanded="false" tabindex="0">
              <span class="rb-um-name"></span>
              <span class="rb-um-caret">▾</span>
            </div>

            <div class="rb-um-dropdown" role="menu">
              <a class="rb-um-item" role="menuitem" href="/portal/preferences.php">Preferences</a>
              <a class="rb-um-item" role="menuitem" href="/portal/logout.php">Logout</a>
            </div>
          </div>
        `;
        menu.querySelector('.rb-um-name').textContent = loginName;

        const trigger = menu.querySelector('.rb-um-trigger');

        function setOpen(open) {
            menu.setAttribute('data-open', open ? 'true' : 'false');
            trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        function toggle() {
            const isOpen = menu.getAttribute('data-open') === 'true';
            setOpen(!isOpen);
        }

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            toggle();
        });

        trigger.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
            } else if (e.key === 'Escape') {
                setOpen(false);
            }
        });

        // Click outside closes (only bind once globally)
        if (!document.documentElement.dataset.rbUserMenuDocClick) {
            document.documentElement.dataset.rbUserMenuDocClick = '1';
            document.addEventListener('click', () => {
                const m = document.getElementById(USER_MENU_ID);
                if (m) m.setAttribute('data-open', 'false');
            });
        }

        document.body.appendChild(menu);
        return { ok: true, reason: 'created' };
    }

    function neutralizeTopBgHover(root = document) {
        // Find the header cell using the top background image
        const tds = Array.from(root.querySelectorAll('td[background]'))
        .filter(td => /\/images\/topBG\.gif(\?.*)?$/i.test(td.getAttribute('background') || ''));

        tds.forEach(td => {
            // Stop old-school inline hover handlers if present
            td.removeAttribute('onmouseover');
            td.removeAttribute('onmouseout');
            td.removeAttribute('onmouseenter');
            td.removeAttribute('onmouseleave');

            const tr = td.closest('tr');
            if (tr) {
                tr.removeAttribute('onmouseover');
                tr.removeAttribute('onmouseout');
                tr.removeAttribute('onmouseenter');
                tr.removeAttribute('onmouseleave');
            }

            // Force the background to stay white (prevents "black flash")
            td.style.backgroundColor = '#242424';
            td.style.backgroundImage = 'none';

            // If you still want the old tiled image but not the hover behavior, use this instead:
            // td.style.backgroundImage = 'url(/images/topBG.gif)';
            // td.style.backgroundRepeat = 'repeat';
        });
    }

    let observer = null;
    let scheduled = false;
    let runCount = 0;

    // Cache parsed values so we can remove #context safely
    let cachedContext = { programName: '', areaName: '', strongText: '', copyText: '', loginName: '' };

    function log(...args) {
        if (!DEBUG) return;
        if (runCount % 10 === 0) console.log('[RB DEBUG]', ...args);
    }

    function normalizeSpaces(s) {
        return (s || '')
            .replace(/\u00A0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ---------------------------------------------------------------------------
    // - Select2 back-button (bfcache) resync
    // - Only resync selects that actually have a value
    // - Skip #change-program entirely (it's intentionally blank/placeholder)
    // ---------------------------------------------------------------------------
    function resyncSelect2FromSelect(selectEl) {
        if (!selectEl) return;

        // Skip program changer; its <select> is often intentionally blank.
        if (selectEl.id === 'change-program') return;

        // Only resync if there is an actual selected value
        const v = String(selectEl.value ?? '').trim();
        if (!v) return;

        const $ = window.jQuery;
        if ($ && $.fn && $.fn.select2) {
            try {
                // Refresh Select2 display from the underlying select value
                $(selectEl).trigger('change.select2');
                $(selectEl).trigger('change');
                return;
            } catch (e) {
                // fall through to manual
            }
        }

        // No jQuery/select2 available: best-effort manual sync of the visible label
        if (!selectEl.id) return;
        const s2 = document.querySelector(`#s2id_${CSS.escape(selectEl.id)}`);
        if (!s2) return;

        const chosen = s2.querySelector('.select2-chosen');
        if (!chosen) return;

        const opt = selectEl.options[selectEl.selectedIndex];
        const txt = opt ? (opt.textContent || '').trim() : '';
        if (txt) chosen.textContent = txt;
    }

    // Makes /images/mainTop.gif clickable -> /loy/index.php (same host)
    function linkifyMainTopImage(root = document) {
        // Target the specific top image
        const img = root.querySelector('img[src="/images/mainTop.gif"]');
        if (!img) return { done: false, reason: 'mainTop.gif not found' };

        // If already wrapped, keep it idempotent
        const existingA = img.closest('a[data-rb-mainTopLink="1"]');
        const href = `${location.origin}/loy/index.php`;

        if (existingA) {
            // Ensure correct href even if host changes
            existingA.href = href;
            return { done: true, reason: 'already wrapped' };
        }

        // If it’s inside some other link, don’t double-wrap
        if (img.closest('a')) return { done: false, reason: 'image already inside a link' };

        const a = document.createElement('a');
        a.href = href;
        a.target = '_self'; // same tab
        a.rel = 'noopener noreferrer';
        a.setAttribute('data-rb-mainTopLink', '1');
        a.style.display = 'inline-block';

        // Optional: make it feel clickable
        img.style.cursor = 'pointer';

        img.parentNode.insertBefore(a, img);
        a.appendChild(img);

        return { done: true, reason: 'wrapped' };
    }

    function resyncAllSelect2() {
        document.querySelectorAll('select[id]').forEach(sel => {
            const hasSelect2Ui = document.querySelector(`#s2id_${CSS.escape(sel.id)}`);
            if (hasSelect2Ui) resyncSelect2FromSelect(sel);
        });
    }

    function wireBfCacheResync() {
        // Fires on normal load AND bfcache restore (Back button).
        window.addEventListener('pageshow', (e) => {
            // Always resync; cheap and fixes cached Select2 label issues
            requestAnimationFrame(() => {
                resyncAllSelect2();
            });
        });

        // Extra resilience when returning to a tab
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                requestAnimationFrame(() => {
                    resyncAllSelect2();
                });
            }
        });
    }

    wireBfCacheResync();

    // ---------------------------------------------------------------------------

    function makeJiraBadgeLink(prefix, digits) {
        const jiraKey = `${prefix}-${digits}`;
        const href = `https://ignite.atlassian.net/browse/${jiraKey}`;

        const badge = document.createElement('a');
        badge.href = href;
        badge.target = '_blank';
        badge.rel = 'noopener noreferrer';
        badge.textContent = '🏷️';
        badge.className = 'rb-jira-badge';
        badge.setAttribute('data-rb-jira', jiraKey);

        badge.style.cssText = `
      margin-left:4px;
      text-decoration:none;
      font-size:12px;
      vertical-align:middle;
      opacity:0.85;
    `;

        badge.title = `Open ${jiraKey} in Jira`;
        return badge;
    }

    function isSelect2Open() {
        // Select2 v3/v4-ish common signals
        return !!document.querySelector('.select2-drop-active, .select2-container-active, .select2-dropdown-open');
    }

    function isUserInteracting() {
        const ae = document.activeElement;
        if (!ae) return false;
        if (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA') return true;
        if (ae.isContentEditable) return true;
        return false;
    }

    let pauseUntil = 0;
    function pause(ms) { pauseUntil = Math.max(pauseUntil, Date.now() + ms); }
    function isPaused() { return Date.now() < pauseUntil; }

    // Pause briefly when the user invokes Find (⌘F)
    window.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') pause(2000);
    }, true);

    // Pause very briefly during selection changes (Find next/prev can trigger these)
    document.addEventListener('selectionchange', () => pause(250), true);

    function linkifyJiraKeysInTables(root = document.body) {
        const reFilter = /\b(?:CRM|GRA)\d+(?!\d)/;
        const reExtract = /\b(CRM|GRA)(\d+)(?!\d)/g;
        const tables = Array.from(root.querySelectorAll('table'));
        let converted = 0;

        function processContainer(container) {
            const walker = document.createTreeWalker(
                container,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode(node) {
                        if (!node.nodeValue || !reFilter.test(node.nodeValue)) return NodeFilter.FILTER_SKIP;

                        const parent = node.parentElement;
                        if (!parent) return NodeFilter.FILTER_SKIP;

                        if (
                            parent.closest('a, script, style, textarea, input, select, option, button') ||
                            parent.isContentEditable
                        ) {
                            return NodeFilter.FILTER_SKIP;
                        }

                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );

            const toProcess = [];
            while (walker.nextNode()) toProcess.push(walker.currentNode);

            toProcess.forEach(textNode => {
                const text = textNode.nodeValue;
                reExtract.lastIndex = 0;
                if (!reExtract.test(text)) return;

                const frag = document.createDocumentFragment();
                let lastIndex = 0;

                reExtract.lastIndex = 0;
                let match;
                while ((match = reExtract.exec(text)) !== null) {
                    const [full, prefix, digits] = match;
                    const start = match.index;
                    const end = start + full.length;

                    if (start > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));

                    const key = `${prefix}${digits}`;
                    const jiraKey = `${prefix}-${digits}`;
                    const href = `https://ignite.atlassian.net/browse/${jiraKey}`;

                    const a = document.createElement('a');
                    a.href = href;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.textContent = key;
                    a.style.fontWeight = '700';

                    frag.appendChild(a);

                    converted++;
                    lastIndex = end;
                }

                if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));

                textNode.parentNode.replaceChild(frag, textNode);
            });
        }

        tables.forEach(tbl => processContainer(tbl));

        return { converted };
    }

    // Rewrites "Create New Trigger" to /loy/prizedrill.php?r=0 on current host
    function rewriteCreateLinksToPrizeDrill() {
        const TARGET_URL = `${location.origin}/loy/prizedrill.php?r=0`;
        const labels = new Set(['Create New Trigger']);

        let count = 0;

        document.querySelectorAll('a').forEach(a => {
            const text = normalizeSpaces(a.textContent || '');
            if (!labels.has(text)) return;

            a.href = TARGET_URL;

            // If click handlers override href, remove them so href wins
            a.removeAttribute('onclick');
            a.removeAttribute('onmousedown');

            count++;
        });

        return count;
    }

    function getContextStrings() {
        const strong = document.querySelector('#context .copy strong');
        const copySpan = document.querySelector('#context .copy');

        const strongText = normalizeSpaces(strong?.textContent || '');
        const copyText = normalizeSpaces(copySpan?.textContent || '');

        if (!strongText && !copyText && (cachedContext.programName || cachedContext.areaName || cachedContext.loginName)) {
            return { ...cachedContext };
        }

        let programName = '';
        let areaName = '';

        if (strongText) {
            const idxCom = strongText.indexOf('.com : ');
            if (idxCom !== -1) {
                programName = strongText.substring(idxCom + '.com : '.length).trim();
            } else {
                programName = 'Kickback Points';
            }
        }

        if (copyText) {
            const m = copyText.match(/logged into the\s+(.+?)\s+area\./i);
            if (m && m[1]) areaName = m[1].trim();
        }

        const loginName = extractLoginNameFromStrongText(strongText) || cachedContext.loginName;

        cachedContext = { programName, areaName, strongText, copyText, loginName };
        return cachedContext;
    }

    function removeSubNavAccountLinks() {
        const subNav = document.getElementById('sub-nav');
        if (!subNav) return { removed: 0 };

        let removed = 0;

        subNav.querySelectorAll('a').forEach(a => {
            const href = (a.getAttribute('href') || '').toLowerCase();
            const text = normalizeSpaces(a.textContent || '').toLowerCase();

            const isPreferences =
                  href.includes('/portal/preferences.php') ||
                  text === 'preferences';

            const isLogout =
                  href.includes('/portal/logout.php') ||
                  text === 'logout';

            if (!isPreferences && !isLogout) return;

            // ---- Remove preceding " | " text node if present ----
            let prev = a.previousSibling;

            if (prev && prev.nodeType === Node.TEXT_NODE) {
                if (prev.nodeValue.trim() === '|') {
                    prev.remove();
                }
                if (prev.nodeValue.trim() === '|') {
                    prev.remove();
                }
            }

            a.remove();
            removed++;
        });

        return { removed };
    }

    // Safer targeting: prefer the Select2 label in #sub-nav; otherwise find the one that says "Change Program"
    function setProgramLabel(programName = 'Kickback Points') {
        if (!programName) return { ok: false, reason: 'no programName' };

        let target = document.querySelector('#sub-nav .select2-chosen');

        if (!target) {
            const chosenEls = Array.from(document.querySelectorAll('.select2-chosen'));
            target =
                chosenEls.find(el => normalizeSpaces(el.textContent) === 'Change Program') ||
                chosenEls.find(el => normalizeSpaces(el.textContent) === programName) ||
                null;
        }

        if (!target) return { ok: false, reason: 'no matching select2-chosen found' };

        const current = normalizeSpaces(target.textContent || '');
        if (current === programName) return { ok: true, reason: 'already set' };

        target.textContent = programName;
        target.style.fontSize = '15px';
        target.style.fontWeight = '550';
        target.style.color = '#000';

        return { ok: true, reason: 'updated' };
    }

    function forceActiveAreaIcon(areaName) {
        const map = {
            Merchant: 'Merchant',
            CRM: 'CRM',
            Consultant: 'Consultant',
            Admin: 'Administratior' // not a typo; matches RB markup
        };

        const targetImgName = map[areaName];
        if (!targetImgName) return { ok: false, reason: `areaName not mapped ("${areaName || '(empty)'}")` };

        const img = document.querySelector(`img[name="${targetImgName}"]`);
        if (!img) return { ok: false, reason: 'target image not found' };

        const currentSrc = img.getAttribute('src') || '';
        let onSrc = currentSrc;

        if (/Off\.gif/i.test(currentSrc)) {
            onSrc = currentSrc.replace(/Off\.gif(\?.*)?$/i, 'On.gif$1');
        }

        if (onSrc !== currentSrc) img.setAttribute('src', onSrc);

        const link = img.closest('a');
        if (link) {
            link.removeAttribute('onmouseover');
            link.removeAttribute('onmouseout');
        }

        return { ok: true, areaName };
    }

    function forceActiveAreaIconFromUrl() {
        const params = new URLSearchParams(location.search);
        const t = (params.get('t') || '').toLowerCase();

        const map = {
            merchant: 'Merchant',
            crm: 'CRM',
            consultant: 'Consultant',
            admin: 'Administratior'
        };

        const targetImgName = map[t];
        if (!targetImgName) return { ok: false, reason: `no t= mapping (t="${t || '(none)'}")` };

        const img = document.querySelector(`img[name="${targetImgName}"]`);
        if (!img) return { ok: false, reason: 'target image not found' };

        const currentSrc = img.getAttribute('src') || '';
        let onSrc = currentSrc;

        if (/Off\.gif/i.test(currentSrc)) {
            onSrc = currentSrc.replace(/Off\.gif(\?.*)?$/i, 'On.gif$1');
        }

        if (onSrc !== currentSrc) img.setAttribute('src', onSrc);

        const link = img.closest('a');
        if (link) {
            link.removeAttribute('onmouseover');
            link.removeAttribute('onmouseout');
        }

        return { ok: true, t };
    }

    // --- Breadcrumb helpers (condensed) ------------------------------------------

    function getBreadcrumbCells() {
        // returns [{ cell, innerTable, middleTd, outerTable }]
        return Array.from(document.querySelectorAll('.table-six-top')).map(outerTable => {
            const middleTd = outerTable.querySelector('tr > td:nth-child(2)');
            const innerTable = middleTd ? middleTd.querySelector('.table-seven-top') : null;
            const cell = innerTable ? innerTable.querySelector('td') : null;
            return (cell && middleTd && innerTable) ? { cell, innerTable, middleTd, outerTable } : null;
        }).filter(Boolean);
    }

    function setBreadcrumbNoWrap() {
        document.querySelectorAll('.table-six-top, .table-seven-top, .table-seven-top td, .table-seven-top a')
            .forEach(el => (el.style.whiteSpace = 'nowrap'));
    }

    function truncateLinkText(text, maxLength = 50) {
        if (!text) return '';
        if (text.length <= maxLength) return text;

        const middleIndex = Math.floor(text.length / 2);
        const halfWindow = Math.floor((maxLength - 3) / 2); // room for "..."

        let sliceStart = Math.max(0, middleIndex - halfWindow);
        const sliceEnd = Math.min(text.length, middleIndex + halfWindow);

        // Look backwards from sliceStart for a natural break point
        const breakChars = [' ', '/', '-'];
        let adjustedStart = -1;

        for (let i = sliceStart; i >= 0; i--) {
            if (breakChars.includes(text[i])) {
                adjustedStart = i + 1; // start AFTER the break character
                break;
            }
        }

        if (adjustedStart !== -1) {
            sliceStart = adjustedStart;
        } else {
            sliceStart = 0;
        }

        return text.slice(sliceStart, sliceEnd) + '...';
    }

     /**
     * Formats breadcrumb bar:
     * - truncates link text (preserves href)
     * - rebuilds cell content so separators and <br> are inserted BETWEEN links (never inside)
     * - chooses between " | " and "<br>" based on maxCharsPerLine
     */
    function formatAndWrapBreadcrumbs({
        maxCharsPerLine = 150,
        maxLinkText = 50,
        separatorHtml = ' <strong>|</strong> '
        } = {}) {

        const sepLen = 3; // " | " for char counting

        getBreadcrumbCells().forEach(({ cell }) => {
            const links = Array.from(cell.querySelectorAll('a'));
            if (!links.length) return;

            // Build a clean line-wrapped fragment
            const frag = document.createDocumentFragment();

            let lineCount = 0;
            let firstOnLine = true;

            links.forEach((a) => {
                // Clone link so we aren't fighting prior innerHTML edits
                const link = a.cloneNode(true);
                link.textContent = truncateLinkText(link.textContent || '', maxLinkText);

                const tlen = (link.textContent || '').length;

                // Decide if we need a new line BEFORE placing this link
                const needsNewLine = !firstOnLine && (lineCount + sepLen + tlen > maxCharsPerLine);

                if (needsNewLine) {
                    const br = document.createElement('br');
                    br.className = 'rb-wrap';
                    frag.appendChild(br);
                    lineCount = 0;
                    firstOnLine = true;
                } else if (!firstOnLine) {
                    // Add separator between links (same line)
                    const sepSpan = document.createElement('span');
                    sepSpan.innerHTML = separatorHtml;
                    frag.appendChild(sepSpan);
                    lineCount += sepLen;
                }

                frag.appendChild(link);
                lineCount += tlen;
                firstOnLine = false;
            });

            // Replace cell contents (idempotent)
            cell.textContent = '';
            cell.appendChild(frag);
        });
    }

            /**
         * Keeps breadLeft/right gifs sized to the breadcrumb middle TD.
         * (Uses existing "aspect growth" logic.)
         */
    function syncBreadcrumbGifHeights() {
        const leftImgs = Array.from(document.querySelectorAll('img[src="/images/breadLeft.gif"]'));

        leftImgs.forEach((leftImg) => {
            const tr = leftImg.closest('tr');
            if (!tr) return;

            const rightImg = tr.querySelector('img[src="/images/breadRight.gif"]');
            if (!rightImg) return;

            const tds = Array.from(tr.querySelectorAll('td'));
            if (tds.length < 3) return;

            const middleTd = tds[1];
            if (!middleTd) return;

            const targetH = Math.round(middleTd.getBoundingClientRect().height);
            if (!targetH || targetH < 1) return;

            const origH = 29;
            const aspect = 0.3;
            const addedH = targetH - origH;
            const targetW = Math.round(15 + (addedH * aspect));

            [leftImg, rightImg].forEach((img) => {
                img.style.height = `${targetH}px`;
                img.style.width = `${targetW}px`;
                img.setAttribute('height', String(targetH));
                img.setAttribute('width', String(targetW));
                img.style.display = 'block';
            });
        });
    }

    // --- Replace your breadcrumb calls with this single entrypoint ---------------
    function applyBreadcrumbBar(opts = {}) {
        setBreadcrumbNoWrap();
        formatAndWrapBreadcrumbs(opts);
        syncBreadcrumbGifHeights();
    }

    // Example usage inside cleanLayoutChrome():
    // requestAnimationFrame(() => applyBreadcrumbBar({ maxCharsPerLine: 150, maxLinkText: 50 }));

    function cleanLayoutChrome() {
        requestAnimationFrame(() => applyBreadcrumbBar({ maxCharsPerLine: 150, maxLinkText: 50 }));

        document.querySelectorAll('tr.top-menu-spacing').forEach(tr => tr.remove());
        document.querySelectorAll('table.footer-image.table-one-bottom').forEach(tbl => tbl.remove());
        document.querySelectorAll('td.tools').forEach(td => td.closest('tr')?.remove());
        document.querySelectorAll('div.warning.hidden-print').forEach(el => el.remove());
        document.querySelectorAll('table.bottom-breadcrumb-menu.table-three-bottom').forEach(tbl => tbl.remove());

        document.querySelectorAll('p').forEach(p => {
            if (p.textContent.replace(/\u00A0/g, '').trim() === '') p.remove();
        });
    }

    function isEffectivelyEmpty(el) {
        if (!el) return true;

        const meaningfulChild = Array.from(el.childNodes).some(n => {
            if (n.nodeType === Node.TEXT_NODE) return normalizeSpaces(n.textContent).length > 0;
            if (n.nodeType !== Node.ELEMENT_NODE) return false;

            const tag = n.tagName?.toLowerCase();
            if (['script', 'style', 'noscript'].includes(tag)) return false;

            return normalizeSpaces(n.textContent).length > 0 ||
                n.querySelector?.('a, input, button, select, textarea, img, table, form');
        });

        return !meaningfulChild;
    }

    function mutationIsRelevant(m) {
        if (m.type !== 'childList') return false;
        if (inScript) return false;

        // ignore empty/no-op
        if (!m.addedNodes?.length && !m.removedNodes?.length) return false;

        // ignore changes inside your injected menu/HUD
        const el = m.target && m.target.nodeType === 1 ? m.target : null;
        if (el?.closest?.('#rb-user-menu, #rb-debug-hud')) return false;

        // ignore while user is selecting/typing/finding
        if (isPaused() || isUserInteracting() || isSelect2Open()) return false;

        // Only react to changes likely to affect what you modify
        const interestingSelector = [
            '#context',
            '#sub-nav',
            '.table-six-top',      // breadcrumb outer
            '.table-seven-top',    // breadcrumb inner
            'img[src="/images/mainTop.gif"]',
            'table',               // for Jira linkification
            'a',                   // for Create New Trigger rewrite
        ].join(',');

        // Check added nodes and their descendants
        for (const n of m.addedNodes) {
            if (n.nodeType !== 1) continue;
            if (n.matches?.(interestingSelector) || n.querySelector?.(interestingSelector)) return true;
        }

        // If nodes were removed, we might need to recreate user menu / program chip etc.
        for (const n of m.removedNodes) {
            if (n.nodeType !== 1) continue;
            if (n.id === 'context' || n.id === 'sub-nav') return true;
        }

        return false;
    }

    function removeContextSafely() {
        const context = document.getElementById('context');
        if (!context) return { removed: false, reason: 'no #context' };

        context.remove();

        const td = context.closest('td');
        if (td && isEffectivelyEmpty(td)) td.remove();

        const tr = (td || context).closest?.('tr');
        if (tr && isEffectivelyEmpty(tr)) tr.remove();

        return { removed: true, reason: 'removed #context (and cleaned empty wrappers)' };
    }

    function runOnceSafely() {
        if (isPaused() || isUserInteracting() || isSelect2Open()) return;
        if (inScript) return;

        inScript = true;
        try {
            cleanLayoutChrome();
            linkifyMainTopImage();
            removeSubNavAccountLinks();
            rewriteCreateLinksToPrizeDrill();
            linkifyJiraKeysInTables();
            const { programName, areaName, loginName } = getContextStrings();
            ensureUserMenu(loginName);
            setProgramChipText(programName);
            bindProgramChipFadeOnScroll();
            removeContextSafely();
            setProgramLabel(programName);
            (areaName ? forceActiveAreaIcon(areaName) : forceActiveAreaIconFromUrl());
        } finally {
            inScript = false;
        }
    }

    let rafId = 0;
    let timeoutId = 0;

    function scheduleRun() {
        if (rafId || timeoutId) return;

        // Run soon on next paint
        rafId = requestAnimationFrame(() => {
            rafId = 0;
            // small extra delay lets DOM settle (especially for table rebuilds)
            timeoutId = window.setTimeout(() => {
                timeoutId = 0;
                runOnceSafely();
            }, 50);
        });

        // Safety: if RAF never fires, still run eventually
        timeoutId = window.setTimeout(() => {
            if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
            timeoutId = 0;
            runOnceSafely();
        }, THROTTLE_MS);
    }

    // Initial run
    runOnceSafely();

    // Observe changes, but ignore changes inside the HUD
    observer = new MutationObserver((mutations) => {
        if (mutations.some(mutationIsRelevant)) scheduleRun();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

})();
