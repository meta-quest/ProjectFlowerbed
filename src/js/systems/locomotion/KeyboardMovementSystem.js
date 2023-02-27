/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { GameStateComponent } from '../../components/GameStateComponent';
import { PHYSICS_CONSTANTS } from '../../Constants';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { updatePlayerPosition } from '../../utils/PlayerMovementUtils';

const _vector = new THREE.Vector2();

export class KeyboardMovementSystem extends System {
	init() {
		this.renderer = null;
		this.camera = null;
		this.gameStateComponent = null;
		this.threeGlobalsComponent = null;

		this.queries.gameManager.results.forEach((entity) => {
			this.threeGlobalsComponent = entity.getComponent(THREEGlobalComponent);
			this.renderer = entity.getComponent(THREEGlobalComponent).renderer;
			this.camera = entity.getComponent(THREEGlobalComponent).camera;
			this.gameStateComponent = entity.getMutableComponent(GameStateComponent);
		});

		const self = this;
		window.addEventListener('keydown', function (e) {
			switch (e.code) {
				case 'KeyW':
					self.fwd = true;
					break;
				case 'KeyS':
					self.bkd = true;
					break;
				case 'KeyD':
					self.right = true;
					break;
				case 'KeyA':
					self.left = true;
					break;

				// temporary
				case 'KeyQ':
					self.jump = true;
					break;
				case 'KeyE':
					self.fall = true;
					break;
			}
		});
		window.addEventListener('keyup', function (e) {
			switch (e.code) {
				case 'KeyW':
					self.fwd = false;
					break;
				case 'KeyS':
					self.bkd = false;
					break;
				case 'KeyD':
					self.right = false;
					break;
				case 'KeyA':
					self.left = false;
					break;

				case 'KeyQ':
					self.jump = false;
					break;
				case 'KeyE':
					self.fall = false;
					break;
			}
		});
	}

	execute(delta, _time) {
		if (!this.renderer || !this.camera || !this.gameStateComponent) return;

		let axisX = 0;
		let axisY = 0;
		let vertOffset = 0;
		if (this.fwd && !this.bkd) {
			axisY = -1;
		} else if (this.bkd && !this.fwd) {
			axisY = 1;
		}

		if (this.left && !this.right) {
			axisX = -1;
		} else if (this.right && !this.left) {
			axisX = 1;
		}

		// normalize
		_vector.x = axisX;
		_vector.y = axisY;
		_vector.normalize();

		// jump and fall only for debugging when there is no gravity
		if (PHYSICS_CONSTANTS.GRAVITY === 0) {
			if (this.jump && !this.fall) {
				vertOffset = 1;
			} else if (this.fall && !this.jump) {
				vertOffset = -1;
			}
		}

		this.queries.player.results.forEach((entity) => {
			const playerState = entity.getComponent(PlayerStateComponent);
			const playerMovement = playerState.expectedMovement;
			updatePlayerPosition(
				delta,
				playerMovement,
				_vector.x,
				_vector.y,
				this.threeGlobalsComponent.getCamera(),
			);

			// vertical movement for debugging purposes.
			playerMovement.y += vertOffset * delta;
		});
	}
}

KeyboardMovementSystem.queries = {
	gameManager: {
		components: [THREEGlobalComponent, GameStateComponent],
		listen: { added: true },
	},
	player: {
		components: [PlayerStateComponent],
	},
};
