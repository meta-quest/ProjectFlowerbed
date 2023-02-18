/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { GameStateComponent } from '../../components/GameStateComponent';
import { LOCOMOTION_CONSTANTS } from '../../Constants';
import { OneshotAudioComponent } from '../../components/AudioComponents';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { System } from 'ecsy';
import { VrControllerComponent } from '../../components/VrControllerComponent';

export class SnapTurnSystem extends System {
	init() {
		this.gameStateComponent = null;
		this.prevState = LOCOMOTION_CONSTANTS.JOYSTICK_STATE.DISENGAGED;

		this.queries.gameManager.results.forEach((entity) => {
			this.gameStateComponent = entity.getComponent(GameStateComponent);
		});
	}

	execute(_delta, _time) {
		if (!this.gameStateComponent) return;

		let controllerInterface;

		this.queries.controllers.results.forEach((entity) => {
			let vrControllerComponent = entity.getComponent(VrControllerComponent);
			if (vrControllerComponent.handedness == 'right') {
				controllerInterface = vrControllerComponent.controllerInterface;
			}
		});

		if (!controllerInterface) return;

		this.queries.player.results.forEach((entity) => {
			const playerState = entity.getComponent(PlayerStateComponent);
			this._update(controllerInterface, playerState.viewerTransform);
		});
	}

	/**
	 * Check current axis state, execute snap turn when state changes
	 * @param {ControllerInterface} controllerInterface
	 * @param {THREE.Group} viewerTransform
	 */
	_update(controllerInterface, viewerTransform) {
		let axisRad = controllerInterface.getJoystickAngle();
		let axisVal = controllerInterface.getJoystickValue();
		let curState = LOCOMOTION_CONSTANTS.JOYSTICK_STATE.DISENGAGED;

		if (
			Math.abs(axisRad) > LOCOMOTION_CONSTANTS.SNAP_TURN_ANGLE_MIN &&
			Math.abs(axisRad) <= LOCOMOTION_CONSTANTS.SNAP_TURN_ANGLE_MAX &&
			axisVal >= LOCOMOTION_CONSTANTS.SNAP_TURN_VALUE_MIN
		) {
			if (axisRad > 0) {
				curState = LOCOMOTION_CONSTANTS.JOYSTICK_STATE.RIGHT;
			} else {
				curState = LOCOMOTION_CONSTANTS.JOYSTICK_STATE.LEFT;
			}
		}
		if (this.prevState == LOCOMOTION_CONSTANTS.JOYSTICK_STATE.DISENGAGED) {
			if (curState == LOCOMOTION_CONSTANTS.JOYSTICK_STATE.RIGHT) {
				viewerTransform.quaternion.multiply(
					LOCOMOTION_CONSTANTS.SNAP_TURN_RIGHT_QUAT,
				);
				OneshotAudioComponent.createSFX(this.world, {
					id: 'TELEPORT_SNAP_TURN',
				});
			} else if (curState == LOCOMOTION_CONSTANTS.JOYSTICK_STATE.LEFT) {
				viewerTransform.quaternion.multiply(
					LOCOMOTION_CONSTANTS.SNAP_TURN_LEFT_QUAT,
				);
				OneshotAudioComponent.createSFX(this.world, {
					id: 'TELEPORT_SNAP_TURN',
				});
			}
		}
		this.prevState = curState;
	}
}

SnapTurnSystem.queries = {
	controllers: { components: [VrControllerComponent] },
	gameManager: {
		components: [GameStateComponent],
		listen: { added: true },
	},
	player: {
		components: [PlayerStateComponent],
	},
};
