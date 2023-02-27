/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import {
	MobileJoystickControls,
	MobileJoystickVisualizer,
} from '../../lib/objects/MobileControls';

import { SessionComponent } from '../../components/SessionComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { getOnlyEntity } from '../../utils/entityUtils';
import { isTouchEnabled } from '../../utils/deviceUtils';

const ROTATION_SPEED = 0.015;
const MAX_PITCH = THREE.MathUtils.degToRad(55);

/**
 * Uses touch events to move on flowerbed.
 */
export class MobileRotationSystem extends System {
	init() {
		// do nothing if we don't support touch events or if we're in VR
		// the hack we use to get camera rotation working will break in VR.
		if (
			!isTouchEnabled() ||
			getOnlyEntity(this.queries.session).getComponent(SessionComponent).useVR
		) {
			this.stop();
			return;
		}

		const rotationElement = document.getElementById('mobile-rotation');
		if (!rotationElement) {
			console.error(
				"Mobile controls for rotation don't exist! Please create a `mobile-rotation` element with pointer-events: none",
			);
			this.stop();
			return;
		}

		this.mobileRotationController = new MobileJoystickControls(rotationElement);
		this.mobileRotationVisualizer = new MobileJoystickVisualizer(
			this.mobileRotationController,
		);

		this.camera = getOnlyEntity(this.queries.threeGlobals).getComponent(
			THREEGlobalComponent,
		).camera;

		// kind of a hack to make sure we don't introduce camera roll by applying
		// pitch and yaw to different objects.
		this.cameraPivot = new THREE.Object3D();
		this.cameraPivot.matrixAutoUpdate = true;
		this.camera.parent.add(this.cameraPivot);
		this.cameraPivot.add(this.camera);

		rotationElement.style.pointerEvents = 'auto';

		window.addEventListener('experiencestart', () => {
			rotationElement.style.pointerEvents = 'auto';
		});
		window.addEventListener('experienceend', () => {
			rotationElement.style.pointerEvents = 'none';
		});
	}

	execute() {
		if (this.mobileRotationController.isActive) {
			// both pitch and yaw are inverted to match the virtual joystick.
			let ry =
				this.cameraPivot.rotation.y -
				this.mobileRotationController.joystickDelta.x * ROTATION_SPEED;
			let rx =
				this.camera.rotation.x -
				this.mobileRotationController.joystickDelta.y * ROTATION_SPEED;
			rx = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, rx));

			this.cameraPivot.rotation.y = ry;
			this.camera.rotation.x = rx;
		}
		this.mobileRotationVisualizer.update();
	}
}

MobileRotationSystem.queries = {
	session: {
		components: [SessionComponent],
	},
	threeGlobals: {
		components: [THREEGlobalComponent],
	},
};
