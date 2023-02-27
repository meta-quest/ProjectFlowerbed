/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
	MobileJoystickControls,
	MobileJoystickVisualizer,
} from '../../lib/objects/MobileControls';

import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { SessionComponent } from '../../components/SessionComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { getOnlyEntity } from '../../utils/entityUtils';
import { isTouchEnabled } from '../../utils/deviceUtils';
import { updatePlayerPosition } from '../../utils/PlayerMovementUtils';

/**
 * Uses touch events to move on flowerbed.
 */
export class MobileLocomotionSystem extends System {
	init() {
		// do nothing if we don't support touch events or are in VR, because we don't want joysticks then...
		if (
			!isTouchEnabled() ||
			getOnlyEntity(this.queries.session).getComponent(SessionComponent).useVR
		) {
			this.stop();
			return;
		}

		const locomotionElement = document.getElementById('mobile-locomotion');
		if (!locomotionElement) {
			console.error(
				"Mobile controls for locomotion don't exist! Please create a `mobile-locomotion` element with pointer-events: none",
			);
			this.stop();
			return;
		}

		this.threeGlobalsComponent = getOnlyEntity(
			this.queries.threeGlobals,
		).getComponent(THREEGlobalComponent);

		this.mobileLocomotionController = new MobileJoystickControls(
			locomotionElement,
		);
		this.mobileLocomotionVisualizer = new MobileJoystickVisualizer(
			this.mobileLocomotionController,
		);

		locomotionElement.style.pointerEvents = 'auto';

		window.addEventListener('experiencestart', () => {
			locomotionElement.style.pointerEvents = 'auto';
		});
		window.addEventListener('experienceend', () => {
			locomotionElement.style.pointerEvents = 'none';
		});
	}

	execute(delta) {
		if (this.mobileLocomotionController.isActive) {
			this.queries.player.results.forEach((entity) => {
				const playerState = entity.getComponent(PlayerStateComponent);
				const playerMovement = playerState.expectedMovement;
				updatePlayerPosition(
					delta,
					playerMovement,
					this.mobileLocomotionController.joystickDelta.x,
					this.mobileLocomotionController.joystickDelta.y,
					this.threeGlobalsComponent.getCamera(),
				);
			});
		}
		this.mobileLocomotionVisualizer.update();
	}
}

MobileLocomotionSystem.queries = {
	session: {
		components: [SessionComponent],
	},
	player: {
		components: [PlayerStateComponent],
	},
	threeGlobals: {
		components: [THREEGlobalComponent],
	},
};
