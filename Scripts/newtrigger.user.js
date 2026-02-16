// ==UserScript==
// @name         New Trigger Setup
// @version      1.0.1
// @description  Automatically change Continue Giving from No (0) to Yes (1)
// @match        https://*.rewardsbutler.com/loy/prizeedit.php?i=&n=&multi=1&crm=&agency=*&consultant=&parentco=*
// @author       arbruffett
// @namespace    https://github.com/arbruffett/ignite-tampermonkey-scripts
// @downloadURL  https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/newtrigger.user.js
// @updateURL    https://raw.githubusercontent.com/arbruffett/ignite-tampermonkey-scripts/refs/heads/main/Scripts/newtrigger.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    function setContinueYes() {
        const select = document.querySelector('select[name="continue"]');
        if (!select) return;

        if (select.value === "0") {
            select.value = "1";

            // Notify Select2 (older Select2 v3 style)
            select.dispatchEvent(new Event('change', { bubbles: true }));

            console.log('Tampermonkey: Continue changed to Yes');
        }
    }

    // Select2 often initializes after page load, so retry a few times
    let attempts = 0;
    const interval = setInterval(() => {
        attempts++;
        setContinueYes();

        if (attempts > 10) {
            clearInterval(interval);
        }
    }, 300);
})();
