/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { GameStateComponent } from '../../components/GameStateComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';

export class GameStateUpdateSystem extends System {
	execute(/*delta, time*/) {
		let gameStateComponent, xrSession;
		this.queries.gameManager.results.forEach((entity) => {
			gameStateComponent = entity.getMutableComponent(GameStateComponent);
			xrSession = entity
				.getComponent(THREEGlobalComponent)
				.renderer.xr.getSession();
		});

		if (!gameStateComponent) return;

		gameStateComponent.interactionModeOverridden = false;

		if (!xrSession) {
			Array.from(document.getElementsByClassName('vr-button')).forEach(
				(button) => {
					button.disabled = !gameStateComponent.allAssetsLoaded;
				},
			);
		}
	}
}

GameStateUpdateSystem.queries = {
	gameManager: {
		components: [GameStateComponent, THREEGlobalComponent],
	},
};
