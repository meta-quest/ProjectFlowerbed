/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as localforage from 'localforage';

import { DEBUG_CONSTANTS, LOCALSTORAGE_KEYS } from '../../Constants';

import { System } from 'ecsy';
import { resetNUXEvent } from '../../lib/CustomEvents';

export class DebugClearFlagsSystem extends System {
	init() {
		if (DEBUG_CONSTANTS.SHOW_RESET_NUX_BUTTON) {
			// add the button
			const mainNav = document.getElementById('main-nav-buttons');
			const clearButton = document.createElement('button');
			clearButton.textContent = 'DEBUG: Reset NUX';
			clearButton.onclick = () => {
				window.dispatchEvent(resetNUXEvent);
				clearButton.textContent = 'NUX state cleared!';
				setTimeout(() => {
					clearButton.textContent = 'DEBUG: Reset NUX';
				}, 5000);
			};
			mainNav.appendChild(clearButton);

			// another button to reset contextual tooltips
			const clearTooltipButon = document.createElement('button');
			clearTooltipButon.textContent = 'DEBUG: Reset context. tooltips';
			clearTooltipButon.onclick = () => {
				localforage.removeItem(LOCALSTORAGE_KEYS.SEEN_GRAB_PHOTO_TOOLTIP);
				localforage.removeItem(LOCALSTORAGE_KEYS.SEEN_PLANT_SWITCH_TOOLTIP);
				clearTooltipButon.textContent =
					'Refresh to see the context. tooltips again';
				setTimeout(() => {
					clearTooltipButon.textContent = 'DEBUG: Reset context. tooltips';
				}, 5000);
			};
			mainNav.appendChild(clearTooltipButon);
		}

		this.stop();
	}
}
