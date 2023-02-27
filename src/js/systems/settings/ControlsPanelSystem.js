/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ControlsPanelComponent } from '../../components/SettingsComponent';
import { GameStateComponent } from '../../components/GameStateComponent';
import { InteractionSystem } from '../../lib/InteractionSystem';
import { IsActive } from '../../components/GameObjectTagComponents';

export class ControlsPanelSystem extends InteractionSystem {
	init() {
		this.interactionMode = GameStateComponent.INTERACTION_MODES.CONTROLS;
	}

	onExecute() {}

	onEnterMode() {
		this.queries.controlsMenu.results.forEach((entity) => {
			if (!entity.hasComponent(IsActive)) {
				entity.addComponent(IsActive);
			}
		});
	}

	onExitMode() {
		this.queries.activeControlsMenu.results.forEach((entity) => {
			if (entity.hasComponent(IsActive)) {
				entity.removeComponent(IsActive);
			}
		});
	}
}

ControlsPanelSystem.addQueries({
	controlsMenu: { components: [ControlsPanelComponent] },
	activeControlsMenu: {
		components: [ControlsPanelComponent, IsActive],
	},
});
