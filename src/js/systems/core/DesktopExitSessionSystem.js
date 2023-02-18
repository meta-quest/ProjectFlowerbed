/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { SessionComponent } from '../../components/SessionComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { experienceEndedEvent } from '../../lib/CustomEvents';
import { getOnlyEntity } from '../../utils/entityUtils';

export class DesktopExitSessionSystem extends System {
	init() {
		this.renderer = getOnlyEntity(this.queries.globals).getComponent(
			THREEGlobalComponent,
		).renderer;
		this.sessionState = getOnlyEntity(this.queries.session).getMutableComponent(
			SessionComponent,
		);
	}

	execute() {
		if (this.sessionState.shouldExitExperience) {
			this.sessionState.shouldExitExperience = false;
			this._exitSession();
		}
	}

	_exitSession() {
		if (!this.sessionState.isExperienceOpened) {
			return;
		}

		if (document.fullscreenElement) {
			document.exitFullscreen();
		}

		window.dispatchEvent(experienceEndedEvent);
		this.sessionState.isExperienceOpened = false;

		const container = document.getElementById('app');
		container.removeChild(this.renderer.domElement);
	}
}

DesktopExitSessionSystem.queries = {
	session: {
		components: [SessionComponent],
	},
	globals: {
		components: [THREEGlobalComponent],
	},
};
