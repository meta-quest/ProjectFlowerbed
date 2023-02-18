/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import AboutPage from '../subpages/about.html';
import LegalPage from '../subpages/legal.html';
import MainPage from '../subpages/main.html';
import PrivacyPage from '../subpages/privacy.html';

export const setupRouter = () => {
	const loadPage = () => {
		const pages = document.querySelectorAll('.page');
		for (let page of pages) {
			page.style.opacity = 0;

			// a bit of a hack to make sure that longer invisible pages don't
			// cause scrollbars to appear on other pages, while still allowing
			// the opacity transition to occur.
			page.style.position = 'fixed';
			page.style.pointerEvents = 'none';
		}

		const enablePage = (name) => {
			const page = document.getElementById(name);
			page.style.position = 'absolute';
			page.style.pointerEvents = 'auto';
			page.style.opacity = 1;
		};

		switch (window.location.hash) {
			case '#about':
				enablePage('about');
				break;
			case '#legal':
				enablePage('legal');
				break;
			case '#privacy':
				enablePage('privacy');
				break;
			default:
				enablePage('main');
		}
	};

	const createPage = (name, contents) => {
		const newPage = document.createElement('div');
		newPage.style.opacity = 0;
		newPage.style.pointerEvents = 'none';
		newPage.style.position = 'absolute';
		newPage.style.left = '0';
		newPage.style.right = '0';
		newPage.style.top = '0';
		newPage.innerHTML = contents;
		newPage.id = name;
		newPage.classList.add('page');
		document.body.appendChild(newPage);
	};

	const initPages = () => {
		createPage('main', MainPage);
		createPage('about', AboutPage);
		createPage('legal', LegalPage);
		createPage('privacy', PrivacyPage);
		loadPage();
	};

	initPages();
	window.addEventListener('hashchange', loadPage);
};
