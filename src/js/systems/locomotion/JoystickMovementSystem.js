/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AXES } from '../../lib/ControllerInterface';
import { GameStateComponent } from '../../components/GameStateComponent';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { VrControllerComponent } from '../../components/VrControllerComponent';
import { updatePlayerPosition } from '../../utils/PlayerMovementUtils';

export class JoystickMovementSystem extends System {
	init() {
		this.renderer = null;
		this.gameStateComponent = null;

		this.queries.gameManager.results.forEach((entity) => {
			this.renderer = entity.getComponent(THREEGlobalComponent).renderer;
			this.gameStateComponent = entity.getComponent(GameStateComponent);
		});
	}

	execute(delta, _time) {
		if (!this.renderer || !this.gameStateComponent) return;

		let controllerInterface;

		this.queries.controllers.results.forEach((entity) => {
			let vrControllerComponent = entity.getComponent(VrControllerComponent);
			if (vrControllerComponent.handedness == 'left') {
				controllerInterface = vrControllerComponent.controllerInterface;
			}
		});

		if (!controllerInterface) return;

		let axisX = controllerInterface.getAxisInput(AXES.THUMBSTICK_X);
		let axisY = controllerInterface.getAxisInput(AXES.THUMBSTICK_Y);

		this.queries.player.results.forEach((entity) => {
			const playerState = entity.getComponent(PlayerStateComponent);
			const playerMovement = playerState.expectedMovement;
			updatePlayerPosition(
				delta,
				playerMovement,
				axisX,
				axisY,
				this.renderer.xr.getCamera(),
			);
		});
	}
}

JoystickMovementSystem.queries = {
	controllers: { components: [VrControllerComponent] },
	gameManager: {
		components: [THREEGlobalComponent, GameStateComponent],
		listen: { added: true },
	},
	player: {
		components: [PlayerStateComponent],
	},
};
