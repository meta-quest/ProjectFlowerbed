/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { DesktopPointerLockComponent } from '../../components/DesktopPointerLockComponent';
import { SessionComponent } from '../../components/SessionComponent';
import { System } from 'ecsy';
import { getOnlyEntity } from '../../utils/entityUtils';

export class DesktopAppOverlaySystem extends System {
	init() {
		this.controls = getOnlyEntity(this.queries.pointerLock).getComponent(
			DesktopPointerLockComponent,
		).value;
		this.sessionState = getOnlyEntity(this.queries.session).getMutableComponent(
			SessionComponent,
		);

		this.controls.addEventListener('unlock', () => {
			document.getElementById('app-overlay').style.visibility = 'visible';
		});
		this.controls.addEventListener('lock', () => {
			document.getElementById('app-overlay').style.visibility = 'hidden';
		});

		window.addEventListener('experienceend', () => {
			document.getElementById('app-overlay').style.visibility = 'hidden';
		});

		const exitButton = document.getElementById('exit-garden-button');
		if (exitButton) {
			exitButton.addEventListener('click', () => {
				this.sessionState.shouldExitExperience = true;
			});
		}
	}
}

DesktopAppOverlaySystem.queries = {
	pointerLock: {
		components: [DesktopPointerLockComponent],
	},
	session: {
		components: [SessionComponent],
	},
};
