/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import {
	ControlsPanelComponent,
	SettingsComponent,
	SettingsPanelComponent,
} from '../../components/SettingsComponent';
import {
	NUXStateComponent,
	NUX_STEPS,
} from '../../components/NUXStateComponent';

import { GameStateComponent } from '../../components/GameStateComponent';
import { GazeFollowerComponent } from '../../components/GazeFollowerComponent';
import { NUXSystem } from '../ui/NUXSystem';
import { Object3DComponent } from '../../components/Object3DComponent';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { StorageInterface } from '../../lib/StorageInterface';
import { System } from 'ecsy';
import { UIPanelComponent } from '../../components/UIPanelComponent';

import { changedSettingsEvent } from '../../lib/CustomEvents';
import controlsPanelJSON from '../../../assets/ui/controls-panel.json';
import { getOnlyEntity } from '../../utils/entityUtils';
import settingsMenuJSON from '../../../assets/ui/settings-panel.json';

export class SettingsCreationSystem extends System {
	init() {
		this.settingsEntity = this.world.createEntity();
		this._initializeEverything();
	}

	async _initializeEverything() {
		await this._createSettingsObject();
		let successfullyCreatedPanels = this._createSettingsPanels();
		while (!successfullyCreatedPanels) {
			successfullyCreatedPanels = this._createSettingsPanels();
		}
		this.stop();
	}

	async _createSettingsObject() {
		const settingsValues = await StorageInterface.loadSettings();
		this.settingsEntity.addComponent(SettingsComponent, settingsValues);
		window.dispatchEvent(changedSettingsEvent);
	}

	_createSettingsPanels() {
		const player = getOnlyEntity(this.queries.playerState, false);
		if (player) {
			this.viewerTransform = player.getComponent(
				PlayerStateComponent,
			).viewerTransform;
		} else {
			return false;
		}

		const settingsValues = this.settingsEntity.getMutableComponent(
			SettingsComponent,
		);

		const gameState = getOnlyEntity(this.queries.gameState).getMutableComponent(
			GameStateComponent,
		);

		// create the settings panel
		const settingsParam = UIPanelComponent.createFromJSON(settingsMenuJSON, {
			'view-tutorial': () => {
				gameState.setInteractionMode(
					GameStateComponent.INTERACTION_MODES.DEFAULT,
				);

				const nuxStateEntity = getOnlyEntity(this.queries.nuxState, false);
				if (!nuxStateEntity) {
					return;
				}
				const nuxState = nuxStateEntity.getMutableComponent(NUXStateComponent);

				nuxState.shouldShowNUX = true;
				nuxState.setState(NUX_STEPS.BEFORE_START);

				const nuxSystem = this.world.getSystem(NUXSystem);
				if (nuxSystem) {
					nuxSystem.play();
					nuxSystem.init(); // reinitialize to reset some parameters.
				}
			},
			'view-controls': () => {
				gameState.setInteractionMode(
					GameStateComponent.INTERACTION_MODES.CONTROLS,
				);
			},
			vignette: () => {
				settingsValues.updateSettings({
					vignetteEnabled: !settingsValues.vignetteEnabled,
				});
			},
			music: () => {
				settingsValues.updateSettings({
					musicEnabled: !settingsValues.musicEnabled,
				});
			},
			close: () => {
				gameState.setInteractionMode(
					GameStateComponent.INTERACTION_MODES.DEFAULT,
				);
			},
		});

		this.settingsEntity.addComponent(SettingsPanelComponent);
		this.settingsEntity.addComponent(UIPanelComponent, {
			...settingsParam,
			parent: this.viewerTransform,
		});
		this.settingsEntity.addComponent(Object3DComponent, {
			value: settingsParam.uiPanel,
		});
		this.settingsEntity.addComponent(GazeFollowerComponent, {
			yOffset: -0.1,
			radius: 1.5,
			velocity: new THREE.Vector3(0, 0, 0),
		});

		// create the controls panel
		this.controlsPanel = this.world.createEntity();

		const controlPanelParams = UIPanelComponent.createFromJSON(
			controlsPanelJSON,
			{
				close: () => {
					gameState.changeToLastInteractionMode();
				},
			},
		);
		const controlUIPanel = controlPanelParams.uiPanel;

		this.controlsPanel.addComponent(Object3DComponent, {
			value: controlUIPanel,
		});
		this.controlsPanel.addComponent(GazeFollowerComponent, {
			yOffset: -0.1,
			radius: 1.5,
			velocity: new THREE.Vector3(0, 0, 0),
		});
		this.controlsPanel.addComponent(UIPanelComponent, {
			...controlPanelParams,
			parent: this.viewerTransform,
		});
		this.controlsPanel.addComponent(ControlsPanelComponent);

		return true;
	}
}

SettingsCreationSystem.queries = {
	settings: {
		components: [SettingsComponent],
	},
	gameState: {
		components: [GameStateComponent],
	},
	nuxState: {
		components: [NUXStateComponent],
	},
	playerState: {
		components: [PlayerStateComponent],
	},
};
