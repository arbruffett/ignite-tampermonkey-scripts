// ==UserScript==
// @name         prizeextra.php
// @match        https://beta.rewardsbutler.com/loy/prizeextra.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/prizeextra.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/prizeextra.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  function getRParam() {
    const params = new URLSearchParams(location.search);
    return params.get('r') || params.get('id') || params.get('record') || params.get('RecordID');
  }

  function buildStandardHeaderTd(rValue) {
    const td = document.createElement('td');
    td.className = 'formheader ';
    td.colSpan = 2;

    const makeLink = (text, href, underline = false, weight = null, size = null) => {
      const a = document.createElement('a');
      a.className = 'formheader';
      a.textContent = text;
      a.href = href;
      if (underline) a.style.textDecoration = 'underline';
      if (weight) a.style.fontWeight = weight;
      if (size) a.style.fontSize = size;
      return a;
    };

    const makeText = (text, weight = null, size = null) => {
      const span = document.createElement('span');
      span.textContent = text;
      if (weight) span.style.fontWeight = weight;
      if (size) span.style.fontSize = size;
      return span;
    };

    const sep = () => document.createTextNode('\u00A0|\u00A0'); // &nbsp;|&nbsp;

    // Edit Trigger (as a LINK on prizeextra.php)
    const editTriggerUrl = new URL('/loy/prizeedit.php', location.origin);
    editTriggerUrl.searchParams.set('r', rValue);
    editTriggerUrl.searchParams.set('table', 'triggers');

    td.appendChild(makeLink('Edit Trigger', editTriggerUrl.toString(), false, '500', '14px'));
    td.appendChild(sep());

    // Integration Fields (TEXT, not a link)
    td.appendChild(makeText('Integration Fields', '800', '14px'));
    td.appendChild(sep());

    // Other links are the same as prizeedit.php
    const weekdayUrl = new URL('/loy/prizeweekday.php', location.origin);
    weekdayUrl.searchParams.set('r', rValue);

    const clubUrl = new URL('/loy/prizeclub.php', location.origin);
    clubUrl.searchParams.set('r', rValue);

    const advUrl = new URL('/loy/prizeadv.php', location.origin);
    advUrl.searchParams.set('r', rValue);

    const offerUrl = new URL('/loy/prizeoffer.php', location.origin);
    offerUrl.searchParams.set('r', rValue);

    td.appendChild(makeLink('Weekday Restrictions', weekdayUrl.toString(), false, null, '14px'));
    td.appendChild(sep());

    td.appendChild(makeLink('Club Setup', clubUrl.toString(), false, null, '14px'));
    td.appendChild(sep());

    td.appendChild(makeLink('Advanced Fields', advUrl.toString(), false, null, '14px'));
    td.appendChild(sep());

    td.appendChild(makeLink('Edit Offer', offerUrl.toString(), false, null, '14px'));

    return td;
  }

  function replacePrizeExtraHeader() {
    const rValue = getRParam();
    if (!rValue) return;

    // Find the current header row on prizeextra.php
    // Usually: <td class="formheader " colspan="2">Integration Fields for: ...
    const headerTd = document.querySelector('td.formheader[colspan="2"]');
    if (!headerTd) return;

    const headerTr = headerTd.closest('tr');
    if (!headerTr) return;

    // Build the new standardized header row
    const newTd = buildStandardHeaderTd(rValue);

    // Replace contents safely
    // (We insert the new TD first, then remove old content)
    headerTr.innerHTML = '';
    headerTr.appendChild(newTd);
  }

  replacePrizeExtraHeader();
})();
