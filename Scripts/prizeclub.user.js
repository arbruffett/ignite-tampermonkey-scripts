// ==UserScript==
// @name         prizeclub.php
// @match        https://beta.rewardsbutler.com/loy/prizeclub.php*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @version      1.0.0
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/prizeclub.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/prizeclub.user.js
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

    const makeLink = (text, href, weight = null, size = '14px') => {
      const a = document.createElement('a');
      a.className = 'formheader';
      a.textContent = text;
      a.href = href;
      if (weight) a.style.fontWeight = weight;
      if (size) a.style.fontSize = size;
      return a;
    };

    const makeText = (text, weight = null, size = '14px') => {
      const span = document.createElement('span');
      span.textContent = text;
      if (weight) span.style.fontWeight = weight;
      if (size) span.style.fontSize = size;
      return span;
    };

    const sep = () => document.createTextNode('\u00A0|\u00A0'); // &nbsp;|&nbsp;

    // Edit Trigger (LINK)
    const editTriggerUrl = new URL('/loy/prizeedit.php', location.origin);
    editTriggerUrl.searchParams.set('r', rValue);
    editTriggerUrl.searchParams.set('table', 'triggers');

    td.appendChild(makeLink('Edit Trigger', editTriggerUrl.toString(), '500'));
    td.appendChild(sep());

    // Integration Fields (LINK)
    const extraUrl = new URL('/loy/prizeextra.php', location.origin);
    extraUrl.searchParams.set('r', rValue);

    td.appendChild(makeLink('Integration Fields', extraUrl.toString()));
    td.appendChild(sep());

    // Weekday Restrictions (LINK)
    const weekdayUrl = new URL('/loy/prizeweekday.php', location.origin);
    weekdayUrl.searchParams.set('r', rValue);

    td.appendChild(makeLink('Weekday Restrictions', weekdayUrl.toString()));
    td.appendChild(sep());

    // Club Setup (TEXT - current page)
    td.appendChild(makeText('Club Setup', '800'));
    td.appendChild(sep());

    // Remaining links
    const advUrl = new URL('/loy/prizeadv.php', location.origin);
    advUrl.searchParams.set('r', rValue);

    const offerUrl = new URL('/loy/prizeoffer.php', location.origin);
    offerUrl.searchParams.set('r', rValue);

    td.appendChild(makeLink('Advanced Fields', advUrl.toString()));
    td.appendChild(sep());

    td.appendChild(makeLink('Edit Offer', offerUrl.toString()));

    return td;
  }

  function replacePrizeClubHeader() {
    const rValue = getRParam();
    if (!rValue) return;

    const headerTd = document.querySelector('td.formheader[colspan="2"]');
    if (!headerTd) return;

    const headerTr = headerTd.closest('tr');
    if (!headerTr) return;

    const newTd = buildStandardHeaderTd(rValue);

    headerTr.innerHTML = '';
    headerTr.appendChild(newTd);
  }

  replacePrizeClubHeader();
})();
