/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import {
	MeshIdComponent,
	createReplaceableMesh,
} from '../../components/AssetReplacementComponents';
import {
	NUXStateComponent,
	NUX_STEPS,
} from '../../components/NUXStateComponent';

import { GameStateComponent } from '../../components/GameStateComponent';
import { InteractionSystem } from '../../lib/InteractionSystem';
import { MODE_SELECTION_WHEEL_CONSTANTS } from 'src/js/Constants';
import { Object3DComponent } from '../../components/Object3DComponent';
import { OneshotAudioComponent } from '../../components/AudioComponents';
import { SelectionWheelComponent } from '../../components/SelectionWheelComponent';
import { SettingsPanelComponent } from '../../components/SettingsComponent';
import { UIPanelComponent } from '../../components/UIPanelComponent';

import cameraTooltip from '../../../assets/ui/menu-tooltips/camera.json';
import exploreTooltip from '../../../assets/ui/menu-tooltips/explore.json';
import { getOnlyEntity } from '../../utils/entityUtils';
import menuTooltipTemplate from '../../../assets/ui/templates/menu-tooltip.json';
import merge from 'lodash.merge';
import removeTooltip from '../../../assets/ui/menu-tooltips/remove.json';
import seedsTooltip from '../../../assets/ui/menu-tooltips/seeds.json';
import settingsTooltip from '../../../assets/ui/menu-tooltips/settings.json';
import waterTooltip from '../../../assets/ui/menu-tooltips/water.json';

export class SelectionWheelCreationSystem extends InteractionSystem {
	init() {
		this.wheelEntity = null;
	}

	onExecute(_delta, _time) {
		if (this.wheelEntity == null) {
			this.wheelEntity = this.world.createEntity();
			let modeSelectionWheelId = 'MODE_TILES';
			this.wheelEntity.name = modeSelectionWheelId;
			createReplaceableMesh(this.wheelEntity, modeSelectionWheelId);
			return;
		}

		if (this.wheelEntity.getComponent(MeshIdComponent).modelHasChanged) {
			this.setupWheel();
		}
	}

	setupWheel() {
		const MODES = GameStateComponent.INTERACTION_MODES;
		const wheelObject = this.wheelEntity.getComponent(Object3DComponent).value;
		this.controllerInterfaces.RIGHT.controllerModel.parent.add(wheelObject);
		const plantingTile = wheelObject.getObjectByName('plant_tile');
		this.setTileAction(plantingTile, MODES.PLANTING);
		this.createTileTooltip(
			plantingTile,
			merge({}, menuTooltipTemplate, seedsTooltip),
		);

		const pickingTile = wheelObject.getObjectByName('picking_tile');
		this.setTileAction(pickingTile, MODES.PICKING);
		this.createTileTooltip(
			pickingTile,
			merge({}, menuTooltipTemplate, removeTooltip),
		);

		const wateringTile = wheelObject.getObjectByName('watering_tile');
		this.setTileAction(wateringTile, MODES.WATERING);
		this.createTileTooltip(
			wateringTile,
			merge({}, menuTooltipTemplate, waterTooltip),
		);

		const cameraTile = wheelObject.getObjectByName('camera_tile');
		this.setTileAction(cameraTile, MODES.CAMERA);
		this.createTileTooltip(
			cameraTile,
			merge({}, menuTooltipTemplate, cameraTooltip),
		);

		const exploreTile = wheelObject.getObjectByName('explore_tile');
		this.setTileAction(exploreTile, MODES.DEFAULT);
		this.createTileTooltip(
			exploreTile,
			merge({}, menuTooltipTemplate, exploreTooltip),
		);

		const settingTile = wheelObject.getObjectByName('setting_tile');
		this.setTileAction(settingTile, MODES.SETTINGS);
		this.createTileTooltip(
			settingTile,
			merge({}, menuTooltipTemplate, settingsTooltip),
		);

		const wheelTiles = [
			plantingTile,
			pickingTile,
			wateringTile,
			cameraTile,
			exploreTile,
			settingTile,
		];
		wheelTiles.forEach((tileObject) => {
			tileObject.defaultPosition = tileObject.position
				.clone()
				.add(MODE_SELECTION_WHEEL_CONSTANTS.WHEEL_POSITION_OFFSET);
			tileObject.defaultQuaternion = tileObject.quaternion.clone();
			[...tileObject.children].forEach((node) => {
				if (node.isMesh) {
					node.material = new THREE.MeshBasicMaterial({
						color: 0xd3d3d3,
					});
					node.castShadow = false;
				}
			});
			const tileFaceMesh = tileObject.getObjectByName(tileObject.name + '_face')
				.children[0];
			tileFaceMesh.material = new THREE.MeshBasicMaterial({
				map: tileFaceMesh.material.map,
			});
			tileFaceMesh.castShadow = false;
			tileObject.faceMesh = tileFaceMesh;
		});

		this.wheelEntity.removeComponent(SelectionWheelComponent);
		this.wheelEntity.addComponent(SelectionWheelComponent, {
			wheelTiles,
		});

		wheelObject.visible = false;
	}

	/**
	 * set action on select for tiles
	 * @param {THREE.Object3D} tile
	 * @param {Number|String} mode
	 */
	setTileAction(tile, mode) {
		const MODES = GameStateComponent.INTERACTION_MODES;
		switch (mode) {
			// planting mode is special cased for two reasons:
			// 1. it should still be available in the NUX, since it's the one that the NUX wants players to go to
			// 2. We have to bring up the seedbox, and this was a straightforward place to put it (without creating another system)
			case MODES.PLANTING:
				tile.mode = mode;
				tile.action = () => {
					// we put the sound here so that we don't play the seedbox creation sound
					// after teleporting.
					OneshotAudioComponent.createSFX(this.world, {
						id: 'SEEDBOX_OPEN',
					});
					this.gameStateComponent.setInteractionMode(mode);
				};
				break;
			default: {
				tile.mode = mode;
				tile.action = () => {
					// if we're in the NUX, we ignore the tile and only allow selecting planting mode.
					const nuxStateComponent = getOnlyEntity(
						this.queries.NUXState,
					).getComponent(NUXStateComponent);
					if (nuxStateComponent.currentState !== NUX_STEPS.ENDED) {
						return;
					}
					this.gameStateComponent.setInteractionMode(mode);
				};
				break;
			}
		}
	}

	createTileTooltip(tile, tooltipJSON) {
		const tooltipEntity = this.world.createEntity();

		const uiPanelComponentParams = UIPanelComponent.createFromJSON(tooltipJSON);

		tooltipEntity.addComponent(Object3DComponent, {
			value: uiPanelComponentParams.uiPanel,
		});
		tooltipEntity.addComponent(UIPanelComponent, {
			...uiPanelComponentParams,
			shouldLookAtCamera: false,
			parent: tile,
		});

		uiPanelComponentParams.uiPanel.position.set(0, 0, -0.08);
		uiPanelComponentParams.uiPanel.rotateX(-THREE.MathUtils.degToRad(75));

		tile.tooltip = tooltipEntity;
	}
}

SelectionWheelCreationSystem.addQueries({
	settingsMenu: { components: [SettingsPanelComponent] },
	NUXState: { components: [NUXStateComponent] },
});
