// rb_combo_cache.js
(() => {
  'use strict';

  const CACHE_STORAGE_KEY = 'rb_combo_numrequired_cache_v1';
  const TTL_MS = 4 * 24 * 60 * 60 * 1000; // 4 days

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function getLocalStorage() {
    // Tampermonkey usually allows direct localStorage access.
    // This fallback covers isolated-world edge cases.
    if (typeof unsafeWindow !== 'undefined' && unsafeWindow.localStorage) return unsafeWindow.localStorage;
    return window.localStorage;
  }

  function normalizeProgram(raw) {
    return String(raw || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/[\/\s]+/g, '_')
      .replace(/[^a-z0-9_.-]/g, '');
  }

  // You said scope MUST come from this select (no URL parsing).
  function readProgramFromSelect() {
    const sel = document.querySelector('#change-program');
    if (!sel) return '';

    const selectedValue = sel.value || '';
    if (selectedValue && selectedValue.includes('|')) {
      const parts = selectedValue.split('|');
      const right = parts[parts.length - 1];
      if (right) return right;
    }
    if (selectedValue) return selectedValue;

    const selectedOpt = sel.selectedOptions && sel.selectedOptions[0];
    return selectedOpt ? (selectedOpt.textContent || '') : '';
  }

  function getScopeKey() {
    const programRaw = readProgramFromSelect();
    const norm = normalizeProgram(programRaw);
    // If program isn't available yet, use a stable placeholder
    return norm || 'unknown_program';
  }

  function loadRoot() {
    const LS = getLocalStorage();
    const raw = LS.getItem(CACHE_STORAGE_KEY);
    const root = safeJsonParse(raw, null);

    if (!root || typeof root !== 'object') {
      return { v: 1, ttlMs: TTL_MS, scopes: {} };
    }
    if (!root.scopes || typeof root.scopes !== 'object') root.scopes = {};
    root.v = 1;
    root.ttlMs = TTL_MS;
    return root;
  }

  function saveRoot(root) {
    const LS = getLocalStorage();
    LS.setItem(CACHE_STORAGE_KEY, JSON.stringify(root));
  }

  function purgeExpired(root) {
    const now = Date.now();
    const ttl = TTL_MS;

    for (const [scopeKey, bucket] of Object.entries(root.scopes || {})) {
      if (!bucket || typeof bucket !== 'object') continue;

      for (const [r, entry] of Object.entries(bucket)) {
        if (!entry || typeof entry !== 'object' || !entry.t) {
          delete bucket[r];
          continue;
        }
        if ((now - entry.t) > ttl) delete bucket[r];
      }

      if (Object.keys(bucket).length === 0) delete root.scopes[scopeKey];
    }
  }

  function getNumRequired(r) {
    const rr = String(r || '').trim();
    if (!rr) return null;

    const scopeKey = getScopeKey();
    const root = loadRoot();
    purgeExpired(root);

    const bucket = root.scopes[scopeKey];
    const entry = bucket ? bucket[rr] : null;
    if (!entry) return null;

    // entry.value can legitimately be 0 (Buy All)
    const n = Number(entry.value);
    return Number.isFinite(n) ? n : null;
  }

  function setNumRequired(r, value) {
    const rr = String(r || '').trim();
    if (!rr) return false;

    const n = Number(value);
    if (!Number.isFinite(n)) return false;

    const scopeKey = getScopeKey();
    const root = loadRoot();
    purgeExpired(root);

    if (!root.scopes[scopeKey]) root.scopes[scopeKey] = {};
    root.scopes[scopeKey][rr] = { value: n, t: Date.now() };

    saveRoot(root);
    return true;
  }

  function clearAll() {
    const LS = getLocalStorage();
    LS.removeItem(CACHE_STORAGE_KEY);
  }

  const api = {
    getScopeKey,
    getNumRequired,
    setNumRequired,
    purgeExpired: () => { const root = loadRoot(); purgeExpired(root); saveRoot(root); },
    clearAll,
  };

  // Export for userscripts + console debugging
  window.RBComboCache = api;
  if (typeof unsafeWindow !== 'undefined') unsafeWindow.RBComboCache = api;
})();
