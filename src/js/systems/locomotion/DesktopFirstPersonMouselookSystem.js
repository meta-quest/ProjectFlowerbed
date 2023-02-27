/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { DesktopPointerLockComponent } from '../../components/DesktopPointerLockComponent';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
import { SessionComponent } from '../../components/SessionComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { getOnlyEntity } from '../../utils/entityUtils';
import { isTouchEnabled } from '../../utils/deviceUtils';

/**
 * System to control the mouse when running Flowerbed on desktop.
 */
export class DesktopFirstPersonMouselookSystem extends System {
	init() {
		const threeGlobals = getOnlyEntity(this.queries.threeGlobals).getComponent(
			THREEGlobalComponent,
		);

		threeGlobals.renderer.domElement.addEventListener('click', () => {
			this._lock();
		});
		window.addEventListener('experiencestart', () => {
			this._lock();
		});
		this.controls = new PointerLockControls(threeGlobals.camera, document.body);
		this.controls.movementSpeed = 0;
		const controlsEntity = this.world.createEntity();
		controlsEntity.addComponent(DesktopPointerLockComponent, {
			value: this.controls,
		});

		// assume we add this when we enter the experience, so we lock right away.
		this._lock();
	}

	_lock() {
		if (isTouchEnabled()) {
			return;
		}
		const sessionState = getOnlyEntity(this.queries.session).getComponent(
			SessionComponent,
		);
		if (!sessionState.useVR) {
			this.controls.lock();
		}
	}
}

DesktopFirstPersonMouselookSystem.queries = {
	threeGlobals: {
		components: [THREEGlobalComponent],
	},
	session: {
		components: [SessionComponent],
	},
};
