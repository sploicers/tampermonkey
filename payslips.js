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

(function() {
	'use strict';
	const TABLE_HEADER_ROW_COUNT = 2;
	const TABLE_ROW_CHILD_NODE_INDEX = 5;
	const DOM_POLL_INTERVAL_MS = 500;
	const DOWNLOAD_TIMEOUT_MS = 10000;

	const haveFollowedIframeLink =
	   window.localStorage.haveFollowedIframeLink ||
	   window.location.href.includes('ords/wss_vzbp');

	if (haveFollowedIframeLink) {
	   waitForElementsBySelector("table[summary='Pehistpay'] tr", main);
	} else {
		waitForSingleElementBySelector("iframe[title='WSS page content']", hijackElementLoad(navigateToIframe));
	}

	function main(tableRows) {
		delete window.localStorage.haveFollowedIframeLink;
		addHtml2PdfScriptToPage();
		// Get every relevant table row - ditch the table header and the "Year to Date" row.
		const relevantRows = [...tableRows].slice(TABLE_HEADER_ROW_COUNT);
		// Grab the cells belonging to the "Period End" column in the table, and get the corresponding <a> element.
		const links = relevantRows.flatMap(row => [...row.childNodes][TABLE_ROW_CHILD_NODE_INDEX].childNodes[0]);

		for (const link of links) {
			const { href: url, innerText: filename, } = link;
			downloadPayslip(url, filename);
		}
	}

	function navigateToIframe(iframe) {
		window.localStorage.haveFollowedIframeLink = true;
		window.location.href = iframe.src;
	}

	function downloadPayslip(url, filename) {
		fetch(url)
			.then(res => res.text())
			.then(text => {
				const document = new DOMParser().parseFromString(text, "text/html");
				console.log(`Starting download: ${filename}.pdf`);
				return html2pdf(document.body).save(filename);
			})
			.then(() => {
				console.log(`Download successful: ${filename}.pdf`);
			})
			.catch(console.error);
	}

	function waitForElementsBySelector(querySelector, onReady, onNotReady) {
		const interval = window.setInterval(inner, DOM_POLL_INTERVAL_MS);
		function inner() {
			const elementReady = document.querySelector(querySelector) !== null;
			if (elementReady) {
				window.clearInterval(interval);
				const elements = [...document.querySelectorAll(querySelector)];
				onReady(elements);
			} else {
				console.log(`No matches in DOM yet for selector ${querySelector}. Retrying in ${DOM_POLL_INTERVAL_MS}ms.`);
				onNotReady?.();
			}
		}
	}

	function waitForSingleElementBySelector(querySelector, onReady, onNotReady) {
	   const newOnReadyCallback = (results) => onReady(results?.[0]);
	   waitForElementsBySelector(querySelector, newOnReadyCallback, onNotReady);
	}

	function hijackElementLoad(callback, replace=true) {
		return (element) => {
			const existingListener = element.onload;
			element.addEventListener('load', e => {
				if (!replace) {
					existingListener(e);
				}
				callback(element);
			});
		}
	}

	// We need to make use of the html2pdf NPM package - add its bundle to the page in a <script> tag, so
	// that the 'html2pdf' function is accessible later.
	function addHtml2PdfScriptToPage() {
		const script = document.createElement('script');
		script.type = 'application/javascript';
		script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
		document.head.appendChild(script);
	}
})();