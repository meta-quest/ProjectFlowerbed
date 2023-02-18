/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * System to set up events for entering and exiting the garden. (This was used to set up the garden
 * for desktop, non-VR environments as well, but that is currently unused.)
 */

import {
	experienceEndedEvent,
	experienceStartedEvent,
} from '../../lib/CustomEvents';

import { SessionComponent } from '../../components/SessionComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';

export class BootstrapSessionSystem extends System {
	init() {
		this.renderer = undefined;
		this.queries.globals.results.forEach((entity) => {
			this.renderer = entity.getComponent(THREEGlobalComponent).renderer;
		});

		// Make sure those events fire when we start / end xr sessions, we'll fire them
		// manually when we start / end desktop sessions.
		this.renderer.xr.addEventListener('sessionstart', () => {
			window.dispatchEvent(experienceStartedEvent);
		});
		this.renderer.xr.addEventListener('sessionend', () => {
			window.dispatchEvent(experienceEndedEvent);
		});

		document
			.getElementById('app')
			.addEventListener('fullscreenchange', (_event) => {
				window.goFullScreen();
			});
	}

	execute() {
		this.queries.session.results.forEach((entity) => {
			const sessionState = entity.getMutableComponent(SessionComponent);
			if (sessionState.justEnteredExperience) {
				sessionState.justEnteredExperience = false;
				if (!sessionState.useVR) {
					// make sure that the experience is rendered in full screen on a 2d plane.
					window.dispatchEvent(experienceStartedEvent);
					this.renderer.domElement.style.width = '100%';
					this.renderer.domElement.style.height = '100vh';
					this.renderer.domElement.style.zIndex = 100;
					this.renderer.domElement.style.position = 'relative';
					const container = document.getElementById('app');
					container.appendChild(this.renderer.domElement);
					container
						.requestFullscreen({
							navigationUI: 'hide',
						})
						.catch((e) => {
							console.log(e);
							// expand the renderer to full size anyway, we'll just
							// also have browser chrome
							window.goFullScreen();
						});
				}
			}
		});
	}
}

BootstrapSessionSystem.queries = {
	session: {
		components: [SessionComponent],
	},
	globals: {
		components: [THREEGlobalComponent],
	},
};
