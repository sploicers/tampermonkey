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

(async function () {
  'use strict';
  const TABLE_HEADER_ROW_COUNT = 2;
  const TABLE_ROW_CHILD_NODE_INDEX = 5;
  const DOM_POLL_INTERVAL_MS = 500;
  const MAX_SIMULTANEOUS_DOWNLOADS = 5;
  const DOWNLOAD_BATCH_DELAY_MS = 1000;
  const DRY_RUN = true;

  const onPayslipHistoryPage = window.location.href.includes('ords/wss_vzbp');
  if (onPayslipHistoryPage) {
    await downloadAllPayslips().catch(console.error);
  } else {
    await navigateToPayslipHistoryPage().catch(console.error);
  }

  async function navigateToPayslipHistoryPage() {
    const myDetailsMenu = await waitForElementById("pt1:pt_sdi8::btn");
    myDetailsMenu.click();

    const tableCells = await waitForElementsBySelector("div[id='pt1:pt_pfl1'] td");
    const employeeDetails = tableCells[0].innerText.trim(); // EmployeeID LastName, FirstName MiddleName(s)
    const employeeId = employeeDetails.split(' ')[0];

    const baseUrl = 'https://payroll.ascenderpay.com';
    const payslipHistoryPath = 'ords/wss_vzbp/WK8020VZ$.startup'
    window.location.href = `${baseUrl}/${payslipHistoryPath}?Z_EMPLOYEE_NUMBER=${employeeId}&P_MODE=R`;
  }

  async function downloadAllPayslips() {
    const tableRows = await waitForElementsBySelector("table[summary='Pehistpay'] tr");
    // Ditch the column headers and the "Year to Date" row.
    const relevantRows = tableRows.slice(TABLE_HEADER_ROW_COUNT);
    // Grab the cells belonging to the "Period End" column in the table, and get the corresponding links.
    const links = relevantRows.flatMap(row => [...row.childNodes][TABLE_ROW_CHILD_NODE_INDEX].childNodes[0]);
    // Download.
    const domParser = new DOMParser();
    addHtml2PdfScriptToPage();
    for (const chunk of chunkArray(links, MAX_SIMULTANEOUS_DOWNLOADS)) {
      await Promise.all(chunk.map(link => downloadSinglePayslip(link, domParser)));
      await delayMs(DOWNLOAD_BATCH_DELAY_MS);
    }
  }

  async function downloadSinglePayslip(link, domParser) {
    try {
      const {href: url, innerText: periodEndDate} = link;
      const filename = `${periodEndDate}.pdf`;
      console.log(`About to download ${filename} (dry run: ${DRY_RUN}).`);

      if (!DRY_RUN) {
        const pageContent = await fetch(url).then(response => response.text());
        const document = domParser.parseFromString(pageContent, 'text/html').body;
        await html2pdf(document)
          .set({
            letterRendering: true,
            dpi: 300,
            scale: 4
          })
          .save(`${periodEndDate}.pdf`);
      }

    } catch (e) {
      console.error(e);
      debugger;
    }
  }

  function waitForElement(checker, query) {
    return new Promise(resolve => {
      const poll = window.setInterval(inner, DOM_POLL_INTERVAL_MS);
      function inner() {
        const {result, ready} = checker(query);
        if (ready) {
          window.clearInterval(poll);
          resolve(result);
        } else {
          console.log(`No matches in DOM for query "${query}". Retrying in ${DOM_POLL_INTERVAL_MS}ms.`);
        }
      }
    });
  }

  function waitForElementsBySelector(selector) {
    return waitForElement(getElementsBySelector, selector);
  }

  function waitForElementById(id) {
    return waitForElement(getElementById, id);
  }

  function getElementById(id) {
    const result = document.getElementById(id);
    const ready = result !== null;
    return {result, ready};
  }

  function getElementsBySelector(selector) {
    // document.querySelectorAll returns a NodeList, but we want just a normal JS array.
    const result = [...document.querySelectorAll(selector)];
    const ready = result.length > 0;
    return {result, ready};
  }

  // We make use of the "html2pdf" NPM package - add its bundle to the page in a <script> tag, so
  // that the 'html2pdf' function is accessible later.
  function addHtml2PdfScriptToPage() {
    const script = document.createElement('script');
    script.type = 'application/javascript';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    document.head.appendChild(script);
  }

  function* chunkArray(items, n) {
    for (let i = 0; i < items.length; i += n) {
      yield items.slice(i, i + n);
    }
  }

  function delayMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();
