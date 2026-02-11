// ==UserScript==
// @name         rewardsbutler.com
// @author       arbruffett
// @match        https://beta.rewardsbutler.com/*
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.2
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

    // ---------------------------------------------------------------------------
    // BETA header replacement (mainTop.gif -> provided RewardsButler_BETA.gif)
    // - Only runs on beta.rewardsbutler.com
    // - Embeds the GIF directly (no file hosting / placement needed)
    // ---------------------------------------------------------------------------
    const BETA_HOST = 'beta.rewardsbutler.com';

    // Provided file: RewardsButler_BETA.gif (embedded)
    const BETA_TOP_DATA_URI =
    'data:image/gif;base64,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';


    function replaceMainTopGifOnBeta(root = document) {
        if (location.hostname !== BETA_HOST) return { done: false, reason: 'not beta host' };

        // Find images that look like mainTop.gif (handles /images/mainTop.gif, mainTop.gif?ver=123, etc.)
        const imgs = Array.from(root.querySelectorAll('img')).filter(img => {
            const src = String(img.getAttribute('src') || '');
            return /mainTop\.gif(\?.*)?$/i.test(src) || /mainTop\.gif/i.test(src);
        });

        if (!imgs.length) return { done: false, reason: 'no mainTop.gif found' };

        let replaced = 0;
        imgs.forEach(img => {
            const current = String(img.getAttribute('src') || '');
            if (current === BETA_TOP_DATA_URI) return;

            img.setAttribute('src', BETA_TOP_DATA_URI);
            replaced++;
        });

        return { done: replaced > 0, replaced };
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
  let cachedContext = { programName: '', areaName: '', strongText: '', copyText: '' };

  function log(...args) {
    if (!DEBUG) return;
    if (runCount % 10 === 0) console.log('[RB DEBUG]', ...args);
  }

  function ensureHud() {
    let hud = document.getElementById('rb-debug-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'rb-debug-hud';
      hud.style.cssText = `
        position:fixed; bottom:10px; right:10px; z-index:999999;
        background:#FFFFFF; color:#eee; padding:10px; border-radius:8px;
        font:12px/1.4 monospace; max-width:520px; max-height:45vh; overflow:auto;
        box-shadow:0 2px 12px rgba(0,0,0,.4);
      `;
      document.body.appendChild(hud);
    }
    return hud;
  }

  function setHud(lines) {
    if (!DEBUG) return;
    const hud = ensureHud();
    hud.innerHTML = lines.map(l => `<div>${l}</div>`).join('');
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

  function linkifyJiraKeysInTables(root = document.body) {
    const re = /(\s)(CRM|GRA)(\d{1,})(?!\d)/g;
    const tables = Array.from(root.querySelectorAll('table'));
    let converted = 0;

    function processContainer(container) {
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            if (!node.nodeValue || !re.test(node.nodeValue)) return NodeFilter.FILTER_SKIP;

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
        re.lastIndex = 0;
        if (!re.test(text)) return;

        const frag = document.createDocumentFragment();
        let lastIndex = 0;

        re.lastIndex = 0;
        let match;
        while ((match = re.exec(text)) !== null) {
          const [full, leadingSpace, prefix, digits] = match;
          const start = match.index;
          const end = start + full.length;

          if (start > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));

          frag.appendChild(document.createTextNode(leadingSpace));

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

    if (!strongText && !copyText && (cachedContext.programName || cachedContext.areaName)) {
      return { ...cachedContext };
    }

    let programName = '';
    let areaName = '';

    if (strongText) {
      const idxCom = strongText.indexOf('.com : ');
      if (idxCom !== -1) {
        programName = strongText.substring(idxCom + '.com : '.length).trim();
      } else {
        const idx = strongText.indexOf(' : ');
        if (idx !== -1) programName = strongText.substring(idx + ' : '.length).trim();
      }
    }

    if (copyText) {
      const m = copyText.match(/logged into the\s+(.+?)\s+area\./i);
      if (m && m[1]) areaName = m[1].trim();
    }

    cachedContext = { programName, areaName, strongText, copyText };
    return cachedContext;
  }

  // Safer targeting: prefer the Select2 label in #sub-nav; otherwise find the one that says "Change Program"
  function setProgramLabel(programName) {
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

  function cleanLayoutChrome() {
    removeBreadcrumbRows();

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

  function removeBreadcrumbRows() {
    try {
      const imgs = document.querySelectorAll(
        'img[src="/images/breadLeft.gif"], img[src="/images/breadRight.gif"]'
      );
      if (!imgs || imgs.length === 0) return;

      imgs.forEach(function (img) {
        if (!img || typeof img.closest !== 'function') return;

        const tr = img.closest('tr');
        if (tr && tr.parentNode) {
          tr.parentNode.removeChild(tr);
        }
      });
    } catch (e) {
      // cosmetic cleanup only
    }
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
    if (isSelect2Open()) return;

    runCount++;

    if (observer) observer.disconnect();

    try {
      // Minimal: ensure select2 UI matches real select values after any DOM updates
      resyncAllSelect2();

      const betaHeaderRes = replaceMainTopGifOnBeta();
      neutralizeTopBgHover();

      cleanLayoutChrome();

      const createRewriteCount = rewriteCreateLinksToPrizeDrill();
      const jiraLinksRes = linkifyJiraKeysInTables();

      const { programName, areaName, strongText, copyText } = getContextStrings();
      const contextRemoved = removeContextSafely();

      const labelRes = setProgramLabel(programName);

      const iconRes = (areaName ? forceActiveAreaIcon(areaName) : forceActiveAreaIconFromUrl());

      setHud([
        `Runs: ${runCount}`,
        `URL: ${location.pathname}${location.search}`,
        `#context: ${document.getElementById('context') ? 'FOUND' : 'NOT FOUND'}`,
        `strong: ${strongText ? 'FOUND' : 'EMPTY'}`,
        `programName: ${programName || '(empty)'}`,
        `areaName(parsed): ${areaName || '(empty)'}`,
        `copyText: ${copyText || '(empty)'}`,
        `Label replaced: ${labelRes.ok ? 'YES' : 'NO'}${labelRes.reason ? ' (' + labelRes.reason + ')' : ''}`,
        `Active icon: ${iconRes.ok ? 'YES' : 'NO'}${iconRes.reason ? ' (' + iconRes.reason + ')' : ''}`,
        `Context removed: ${contextRemoved.removed ? 'YES' : 'NO'}${contextRemoved.reason ? ' (' + contextRemoved.reason + ')' : ''}`,
        `Create link rewrites: ${createRewriteCount}`
      ]);

      log('tick', { programName, areaName, labelRes, iconRes, createRewriteCount, jiraLinksRes });
    } finally {
      if (observer) observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function scheduleRun() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      runOnceSafely();
    }, THROTTLE_MS);
  }

  // Initial run
  runOnceSafely();

  // Observe changes, but ignore changes inside the HUD
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      const tgt = m.target;
      if (tgt && tgt.nodeType === 1) {
        if (tgt.closest && tgt.closest('#rb-debug-hud')) continue;
      }
      scheduleRun();
      break;
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

})();
