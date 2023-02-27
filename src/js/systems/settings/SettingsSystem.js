/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
	SettingsComponent,
	SettingsPanelComponent,
} from '../../components/SettingsComponent';
import { GameStateComponent } from '../../components/GameStateComponent';
import { InteractionSystem } from '../../lib/InteractionSystem';
import { IsActive } from '../../components/GameObjectTagComponents';
import { LocomotionVignetteSystem } from '../locomotion/LocomotionVignetteSystem';
import { MusicSystem } from '../audio/MusicSystem';
import { UIPanelComponent } from '../../components/UIPanelComponent';
import { getOnlyEntity } from '../../utils/entityUtils';

export class SettingsSystem extends InteractionSystem {
	init() {
		this.interactionMode = GameStateComponent.INTERACTION_MODES.SETTINGS;
		this.hasInitializedSettings = false;

		window.addEventListener('changedsettings', this._applySettings.bind(this));
	}

	onEnterMode() {
		this._syncToggles();
		this.queries.settingsMenu.results.forEach((entity) => {
			if (!entity.hasComponent(IsActive)) {
				entity.addComponent(IsActive);
			}
		});
	}

	onExitMode() {
		this.queries.activeSettingsMenu.results.forEach((entity) => {
			if (entity.hasComponent(IsActive)) {
				entity.removeComponent(IsActive);
			}
		});
	}

	_applySettings() {
		const settings = getOnlyEntity(this.queries.settings).getComponent(
			SettingsComponent,
		);

		const vignetteSystem = this.world.getSystem(LocomotionVignetteSystem);
		const musicSystem = this.world.getSystem(MusicSystem);

		if (vignetteSystem) {
			if (settings.vignetteEnabled && !vignetteSystem.enabled) {
				vignetteSystem.play();
			} else if (!settings.vignetteEnabled && vignetteSystem.enabled) {
				vignetteSystem.stop();
			}
		}

		if (musicSystem) {
			if (settings.musicEnabled && !musicSystem.enabled) {
				musicSystem.play();
			} else if (!settings.musicEnabled && musicSystem.enabled) {
				musicSystem.stop();
			}
		}
	}

	_syncToggles() {
		const settingsEntity = getOnlyEntity(this.queries.settings, false);
		if (!settingsEntity) {
			return;
		}

		const settingsComponent = settingsEntity.getComponent(SettingsComponent);
		this.queries.settingsMenu.results.forEach((entity) => {
			const uiPanel = entity.getComponent(UIPanelComponent).uiPanel;
			const toggles = uiPanel.getToggles();
			if (toggles) {
				toggles.vignette.setIsToggled(settingsComponent.vignetteEnabled);
				toggles.music.setIsToggled(settingsComponent.musicEnabled);
			}
		});
	}
}

SettingsSystem.addQueries({
	settings: {
		components: [SettingsComponent],
	},
	settingsMenu: { components: [SettingsPanelComponent] },
	activeSettingsMenu: {
		components: [SettingsPanelComponent, IsActive],
	},
});
