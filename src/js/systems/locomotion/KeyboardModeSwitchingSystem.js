/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { GameStateComponent } from '../../components/GameStateComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';

const INTERACTION_MODES = GameStateComponent.INTERACTION_MODES;

export class KeyboardModeSwitchingSystem extends System {
	init() {
		this.gameStateComponent = null;

		this.queries.gameManager.results.forEach((entity) => {
			this.gameStateComponent = entity.getMutableComponent(GameStateComponent);
		});

		const self = this;

		window.addEventListener('keyup', function (e) {
			switch (e.code) {
				// keyboard set interaction modes for debugging
				case 'KeyU':
					self.gameStateComponent.setInteractionMode(INTERACTION_MODES.DEFAULT);
					break;
				case 'KeyI':
					self.gameStateComponent.setInteractionMode(INTERACTION_MODES.PICKING);
					break;
				case 'KeyK':
					self.gameStateComponent.setInteractionMode(
						INTERACTION_MODES.PLANTING,
					);
					break;
				case 'KeyL':
					self.gameStateComponent.setInteractionMode(
						INTERACTION_MODES.WATERING,
					);
					break;
				case 'KeyO':
					self.gameStateComponent.setInteractionMode(INTERACTION_MODES.CAMERA);
					break;
			}
		});
	}

	execute(_delta, _time) {}
}

KeyboardModeSwitchingSystem.queries = {
	gameManager: {
		components: [THREEGlobalComponent, GameStateComponent],
	},
};
