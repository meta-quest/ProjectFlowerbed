/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { GameStateComponent } from '../../components/GameStateComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { getOnlyEntity } from 'src/js/utils/entityUtils';

export class GameStateUpdateSystem extends System {
	init() {
		const gameManager = getOnlyEntity(this.queries.gameManager);
		this.gameStateComponent = gameManager.getMutableComponent(
			GameStateComponent,
		);
		this.renderer = gameManager.getComponent(THREEGlobalComponent).renderer;
	}

	execute() {
		this.gameStateComponent.interactionModeOverridden = false;
		const xrSession = this.renderer.xr.getSession();
		if (!xrSession) {
			Array.from(document.getElementsByClassName('vr-button')).forEach(
				(button) => {
					button.disabled = !this.gameStateComponent.allAssetsLoaded;
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
