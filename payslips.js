// ==UserScript==
// @name         Download Payslips from Ascender/WSS
// @namespace    http://tampermonkey.net/
// @version      2024-07-11
// @description  This script will bulk download a zip archive of all available payslips from WSS in PDF format
// @author       sploicers@noreply.github.com
// @match        https://payroll.ascenderpay.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js
// ==/UserScript==

(function () {
  'use strict';
  const TABLE_HEADER_ROW_COUNT = 2;
  const TABLE_ROW_CHILD_NODE_INDEX = 5;
  const DOM_POLL_INTERVAL_MS = 500;
  const DEBUG = false;

  const haveFollowedIframeLink =
    window.localStorage.haveFollowedIframeLink ||
    window.location.href.includes('ords/wss_vzbp');

  if (haveFollowedIframeLink) {
    const rowSelector = "table[summary='Pehistpay'] tr";
    waitForElementsBySelector(rowSelector, rows =>
      downloadAllPayslips(rows).catch(console.error));

  } else {
    const iframeSelector = "iframe[title='WSS page content']";
    waitForSingleElementBySelector(iframeSelector, navigateToIframe);
  }

  async function downloadAllPayslips(tableRows) {
    delete window.localStorage.haveFollowedIframeLink;
    const domParser = new DOMParser();
    addHtml2PdfScriptToPage();

    // Get every relevant table row - ditch the column headers and the "Year to Date" row.
    const relevantRows = [...tableRows].slice(TABLE_HEADER_ROW_COUNT);
    // Grab the cells belonging to the "Period End" column in the table, and get the corresponding links.
    const links = relevantRows.flatMap(row => [...row.childNodes][TABLE_ROW_CHILD_NODE_INDEX].childNodes[0]);
    // Download.
    debugBreakpoint();
    await Promise.all(links.map(link => downloadPayslip(link, domParser)));
  }

  function navigateToIframe(iframe) {
    window.localStorage.haveFollowedIframeLink = true;
    window.location.href = iframe.src;
  }

  async function downloadPayslip(link, domParser) {
    try {
      // 'innerText' here is the payslip date - use this as the filename.
      const {href: url, innerText: filename} = link;
      const pageContent = await fetch(url).then(response => response.text());
      const document = domParser.parseFromString(pageContent, 'text/html');
      await html2pdf(document.body).save(filename);
    } catch (e) {
      console.error(e);
      debugBreakpoint();
    }
  }

  function waitForElementsBySelector(querySelector, onReady, onNotReady) {
    const poll = window.setInterval(inner, DOM_POLL_INTERVAL_MS);
    function inner() {
      const elementReady = document.querySelector(querySelector) !== null;
      if (elementReady) {
        window.clearInterval(poll);
        // DOM elements are returned in a NodeList, but we want just a normal JS array.
        const elements = [...document.querySelectorAll(querySelector)];
        debugBreakpoint();
        onReady(elements);
      } else {
        debugLog(`No matches in DOM for selector ${querySelector}. Retrying in ${DOM_POLL_INTERVAL_MS}ms.`);
        onNotReady?.();
      }
    }
  }

  function waitForSingleElementBySelector(querySelector, onReady, onNotReady) {
    const newOnReadyCallback = (results) => onReady(results?.[0]);
    waitForElementsBySelector(querySelector, newOnReadyCallback, onNotReady);
  }

  // We make use of the "html2pdf" NPM package - add its bundle to the page in a <script> tag, so
  // that the 'html2pdf' function is accessible later.
  function addHtml2PdfScriptToPage() {
    const script = document.createElement('script');
    script.type = 'application/javascript';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    document.head.appendChild(script);
  }

  function debugBreakpoint() {
    if (DEBUG) debugger;
  }
  function debugLog(msg) {
    if (DEBUG) console.log(msg);
  }
})();
