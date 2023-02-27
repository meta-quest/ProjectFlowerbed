/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';
import * as localForage from 'localforage';

import { DEBUG_CONSTANTS, LOCALSTORAGE_KEYS } from '../../Constants';
import {
	NUXMovementTriggerArea,
	NUXPanelComponent,
	NUXStateComponent,
	NUX_STEPS,
} from '../../components/NUXStateComponent';
import {
	UIPanelComponent,
	UIPanelMedia,
} from '../../components/UIPanelComponent';
import { GameStateComponent } from '../../components/GameStateComponent';
import { GazeFollowerComponent } from '../../components/GazeFollowerComponent';
import { Object3DComponent } from '../../components/Object3DComponent';
import { ObjectFollowerComponent } from '../../components/ObjectFollowerComponent';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { SelectionWheelComponent } from '../../components/SelectionWheelComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { VrControllerComponent } from '../../components/VrControllerComponent';
import endingPanelJSON from '../../../assets/ui/nux-ending.json';
import { getOnlyEntity } from '../../utils/entityUtils';
import locomotionPanelJSON from '../../../assets/ui/nux-locomotion.json';
import merge from 'lodash.merge';
import nuxPanelTemplateJSON from '../../../assets/ui/templates/nux-panel.json';
import nuxTooltipTemplateJSON from '../../../assets/ui/templates/tooltip-with-heading.json';
import seedboxPanelJSON from '../../../assets/ui/nux-seedbox.json';
import tooltipOpenMenuJSON from '../../../assets/ui/nux-tooltip-open-menu.json';
import tooltipOpenSeedboxJSON from '../../../assets/ui/nux-tooltip-open-seedbox.json';
import tooltipPlantSeedJSON from '../../../assets/ui/nux-tooltip-plant-seed.json';
import tooltipTeleportJSON from '../../../assets/ui/nux-tooltip-teleport.json';
import welcomePanelJSON from '../../../assets/ui/nux-welcome.json';

export class NUXCreationSystem extends System {
	init() {
		this.nuxState = this.world.createEntity();
		this.nuxState.addComponent(NUXStateComponent, {
			shouldShowNUX: DEBUG_CONSTANTS.SHOULD_SHOW_NUX,
			justUpdatedCurrentNUXState: true,
			currentState: NUX_STEPS.BEFORE_START,
		});

		localForage.getItem(LOCALSTORAGE_KEYS.SEEN_NUX).then((value) => {
			if (value) {
				// don't show the nux
				const nuxStateComponent = this.nuxState.getMutableComponent(
					NUXStateComponent,
				);
				nuxStateComponent.shouldShowNUX = false;
			}
		});

		// NUX Panels
		this.welcomeNUX = this.world.createEntity();
		this.locomotionNUX = this.world.createEntity();
		this.seedboxNUX = this.world.createEntity();
		this.endWelcomeNUX = this.world.createEntity();

		// Tooltips
		this.locomotionTeleportTooltip = this.world.createEntity();
		this.locomotionTargetTooltip = this.world.createEntity();
		this.plantingOpenMenuTooltip = this.world.createEntity();
		this.plantingOpenSeedboxTooltip = this.world.createEntity();
		this.plantingPlantSeedTooltip = this.world.createEntity();

		this.viewerTransform = null;

		this.movementAreaEntity = this.world.createEntity();
		this.movementAreaEntity.addComponent(NUXMovementTriggerArea, {
			targetPosition: new THREE.Vector3(),
		});
	}

	execute() {
		const player = getOnlyEntity(this.queries.playerState, false);
		if (player) {
			this.viewerTransform = player.getComponent(
				PlayerStateComponent,
			).viewerTransform;
		}

		let rightController;

		this.queries.controllers.results.forEach((entity) => {
			let vrControllerComponent = entity.getComponent(VrControllerComponent);
			if (vrControllerComponent.handedness == 'right') {
				rightController = vrControllerComponent.controllerInterface;
			}
		});

		if (!rightController) {
			return;
		}

		let wheelEntity = getOnlyEntity(this.queries.wheel, false);
		if (!wheelEntity) {
			return;
		}
		let wheel = wheelEntity.getComponent(Object3DComponent).value;

		this._createPanel(this.welcomeNUX, {
			nuxStep: NUX_STEPS.WELCOME,
			nextNuxStep: NUX_STEPS.LOCOMOTION,
			panelJSON: merge({}, nuxPanelTemplateJSON, welcomePanelJSON),
		});

		this._createPanel(this.locomotionNUX, {
			nuxStep: NUX_STEPS.LOCOMOTION,
			nextNuxStep: NUX_STEPS.LOCOMOTION_MOVE_TO,
			panelJSON: merge({}, nuxPanelTemplateJSON, locomotionPanelJSON),
		});

		this._createPanel(this.seedboxNUX, {
			nuxStep: NUX_STEPS.SEEDBOX,
			nextNuxStep: NUX_STEPS.SEEDBOX_OPEN_MENU,
			panelJSON: merge({}, nuxPanelTemplateJSON, seedboxPanelJSON),
			delay: 2000,
		});

		this._createPanel(this.endWelcomeNUX, {
			nuxStep: NUX_STEPS.CLOSING,
			nextNuxStep: NUX_STEPS.ENDED,
			panelJSON: endingPanelJSON,
			delay: 5000,
		});

		this._createTooltipPanel(this.locomotionTeleportTooltip, {
			panelJSON: merge({}, nuxTooltipTemplateJSON, tooltipTeleportJSON),
			parentObject: rightController.grip,
			position: new THREE.Vector3(0.3, 0.2, -0.2),
			nuxStep: NUX_STEPS.LOCOMOTION_MOVE_TO,
		});

		this._createTooltipPanel(this.plantingOpenMenuTooltip, {
			panelJSON: merge({}, nuxTooltipTemplateJSON, tooltipOpenMenuJSON),
			parentObject: rightController.grip,
			position: new THREE.Vector3(0.3, 0.2, -0.2),
			nuxStep: NUX_STEPS.SEEDBOX_OPEN_MENU,
		});

		this._createTooltipPanel(this.plantingOpenSeedboxTooltip, {
			panelJSON: merge({}, nuxTooltipTemplateJSON, tooltipOpenSeedboxJSON),
			parentObject: wheel,
			position: new THREE.Vector3(0.2, 0.4, -0.2),
			nuxStep: NUX_STEPS.SEEDBOX_OPEN_SEEDBOX,
		});

		this._createTooltipPanel(this.plantingPlantSeedTooltip, {
			panelJSON: merge({}, nuxTooltipTemplateJSON, tooltipPlantSeedJSON),
			parentObject: rightController.grip,
			position: new THREE.Vector3(0.3, 0.2, -0.2),
			nuxStep: NUX_STEPS.SEEDBOX_PLANT_SEED,
		});

		this.stop();
	}

	_createPanel(entity, { nuxStep, nextNuxStep, panelJSON, delay }) {
		const nuxStateComponent = this.nuxState.getMutableComponent(
			NUXStateComponent,
		);
		const NUXPanelParams = UIPanelComponent.createFromJSON(panelJSON, {
			skip: () => {
				nuxStateComponent.setState(NUX_STEPS.ENDED);
			},
			continue: () => {
				nuxStateComponent.setState(NUX_STEPS.WAITING);
				setTimeout(() => {
					nuxStateComponent.setState(nextNuxStep);
				}, 1000);
			},
		});

		const uiPanel = NUXPanelParams.uiPanel;

		entity.addComponent(Object3DComponent, {
			value: uiPanel,
		});
		entity.addComponent(GazeFollowerComponent, {
			yOffset: -0.1,
			radius: 1.5,
			velocity: new THREE.Vector3(0, 0, 0),
		});
		entity.addComponent(UIPanelComponent, {
			...NUXPanelParams,
			parent: this.viewerTransform,
		});

		const mediaParams = UIPanelMedia.createFromJSON(panelJSON);
		if (mediaParams) {
			entity.addComponent(UIPanelMedia, mediaParams);
		}

		const gameState = getOnlyEntity(this.queries.gameState).getMutableComponent(
			GameStateComponent,
		);

		entity.addComponent(NUXPanelComponent, {
			id: nuxStep,
			delay: delay ?? 0,
			onShow: () => {
				gameState.setInteractionMode(
					GameStateComponent.INTERACTION_MODES.DEFAULT,
				);
			},
		});
	}

	_createTooltipPanel(
		tooltipEntity,
		{ panelJSON, parentObject, position, nuxStep, delay },
	) {
		const tooltipParams = UIPanelComponent.createFromJSON(panelJSON);
		if (position && !parentObject) {
			tooltipParams.uiPanel.position.copy(position);
		}

		tooltipEntity.addComponent(Object3DComponent, {
			value: tooltipParams.uiPanel,
		});
		tooltipEntity.addComponent(UIPanelComponent, {
			...tooltipParams,
			parent: this.viewerTransform,
			shouldLookAtCamera: true,
		});
		tooltipEntity.addComponent(NUXPanelComponent, {
			id: nuxStep,
			delay: delay ?? 0,
		});

		if (parentObject) {
			tooltipEntity.addComponent(ObjectFollowerComponent, {
				offset: position,
				target: parentObject,
				isChildOfViewerTransform: true,
				velocity: new THREE.Vector3(0, 0, 0),
				shouldMoveImmediately: true,
			});
		}
	}
}
NUXCreationSystem.queries = {
	controllers: { components: [VrControllerComponent] },
	gameManager: {
		components: [THREEGlobalComponent],
	},
	gameState: {
		components: [GameStateComponent],
	},
	playerState: {
		components: [PlayerStateComponent],
	},
	wheel: { components: [SelectionWheelComponent, Object3DComponent] },
};
