// ==UserScript==
// @name         Download Payslips from Ascender/WSS
// @namespace    http://tampermonkey.net/
// @version      2024-07-11
// @description  This script will bulk download a zip archive of all available payslips from WSS in PDF format
// @author       sploicers@noreply.github.com
// @match        https://payroll.ascenderpay.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// ==/UserScript==

(async function () {
	'use strict';
	const TABLE_HEADER_ROW_COUNT = 2;
	const TABLE_ROW_CHILD_NODE_INDEX = 5;
	const DOM_POLL_INTERVAL_MS = 500;
	const DRY_RUN = false;

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
		const pdfs = await Promise.all(links.map(link => downloadSinglePayslip(link, domParser)));
		await createAndDownloadZipArchive(pdfs);
	}

	async function downloadSinglePayslip(link, domParser) {
		try {
			const {href: url, innerText: periodEndDate} = link;
			const filename = `${periodEndDate}.pdf`;
			console.log(`About to download ${filename} (dry run: ${DRY_RUN}).`);

			if (!DRY_RUN) {
				const pageContent = await fetch(url).then(response => response.text());
				const document = domParser.parseFromString(pageContent, 'text/html').body;
				const blob = await html2pdf().from(document).output("blob", filename);
				return {blob, filename};
			}

		} catch (e) {
			console.error(e);
			debugger;
		}
	}

	async function createAndDownloadZipArchive(pdfs) {
		if (DRY_RUN) {
			return;
		}
		const zip = new JSZip();
		for (const {blob, filename} of pdfs) {
			zip.file(filename, blob)
		}

		const zipArchiveBlob = await zip.generateAsync({type: "blob"});
		let objUrl;
		try {
			objUrl = window.URL.createObjectURL(zipArchiveBlob);
			const link = document.createElement('a');
			link.href = objUrl;
			link.download = 'payslips.zip';
			document.body.appendChild(link);
			link.click();
			link.remove();
		} finally {
			window.URL.revokeObjectURL(objUrl);
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
})();
