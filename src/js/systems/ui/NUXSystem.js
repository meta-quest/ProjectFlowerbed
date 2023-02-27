/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';
import * as localforage from 'localforage';

import {
	NUXMovementTriggerArea,
	NUXPanelComponent,
	NUXStateComponent,
	NUX_STEPS,
} from '../../components/NUXStateComponent';
import {
	SelectionWheelComponent,
	WHEEL_STATE,
} from '../../components/SelectionWheelComponent';

import { GameStateComponent } from '../../components/GameStateComponent';
import { IsActive } from '../../components/GameObjectTagComponents';
import { JoystickMovementSystem } from '../locomotion/JoystickMovementSystem';
import { LOCALSTORAGE_KEYS } from '../../Constants';
import { LocomotionVignetteSystem } from '../locomotion/LocomotionVignetteSystem';
import { PlantGrowingComponent } from '../../components/PlantingComponents';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { SeedboxComponent } from '../../components/SeedboxComponents';
import { SelectionWheelSystem } from '../selectionWheels/SelectionWheelSystem';
import { SnapTurnSystem } from '../locomotion/SnapTurnSystem';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { TeleportationSystem } from '../locomotion/TeleportationSystem';
import { UIPanelComponent } from '../../components/UIPanelComponent';
import { VrControllerComponent } from '../../components/VrControllerComponent';
import { getOnlyEntity } from '../../utils/entityUtils';

/**
 * Creates and updates the NUX.
 */
export class NUXSystem extends System {
	init() {
		this.queries.gameManager.results.forEach((entity) => {
			this.renderer = entity.getComponent(THREEGlobalComponent).renderer;
		});

		// used to accumulate player movement for the locomotion step
		this.totalPlayerMovement = new THREE.Vector3();
		this.previousSeedboxPage = -1;
		this.previousSeedboxIndex = -1;
	}

	execute() {
		const nuxState = getOnlyEntity(this.queries.nux).getMutableComponent(
			NUXStateComponent,
		);
		if (!nuxState.shouldShowNUX) {
			if (
				nuxState.currentState !== NUX_STEPS.BEFORE_START &&
				nuxState.currentState !== NUX_STEPS.ENDED
			) {
				// restart mode selection wheel system
				this.world.getSystem(SelectionWheelSystem).play();
			}
			nuxState.currentState = NUX_STEPS.ENDED;
			this.stop();
			return;
		}

		if (!this.renderer || !this.renderer.xr.isPresenting) {
			return;
		}

		this.queries.controllers.results.forEach((entity) => {
			let vrControllerComponent = entity.getComponent(VrControllerComponent);
			if (vrControllerComponent.handedness === 'right') {
				this.controllerInterface = vrControllerComponent.controllerInterface;
			}
		});

		const selectionWheelEntity = getOnlyEntity(
			this.queries.selectionWheel,
			false,
		);
		if (!selectionWheelEntity) {
			return;
		}

		const selectionWheel = selectionWheelEntity.getComponent(
			SelectionWheelComponent,
		);

		// check ongoing NUX actions
		switch (nuxState.currentState) {
			case NUX_STEPS.LOCOMOTION_MOVE_TO: {
				// check if we've teleported, or if we traveled a certain distance with the joystick
				const player = getOnlyEntity(this.queries.player).getComponent(
					PlayerStateComponent,
				);
				if (player.didJustTeleport) {
					nuxState.setState(NUX_STEPS.SEEDBOX);
					break;
				}
				if (player.didMove) {
					this.totalPlayerMovement.add(player.deltaMovement);
					if (this.totalPlayerMovement.lengthSq() > 9) {
						// 3m of movement
						nuxState.setState(NUX_STEPS.SEEDBOX);
						break;
					}
				}

				break;
			}
			case NUX_STEPS.SEEDBOX_OPEN_MENU:
				if (selectionWheel.state === WHEEL_STATE.DEPLOYED) {
					nuxState.setState(NUX_STEPS.SEEDBOX_OPEN_SEEDBOX);
				}
				break;

			case NUX_STEPS.SEEDBOX_OPEN_SEEDBOX:
				if (selectionWheel.state === WHEEL_STATE.RETRACTED) {
					const currentInteractionMode = getOnlyEntity(
						this.queries.gameState,
					).getComponent(GameStateComponent).interactionMode;
					if (
						currentInteractionMode ===
						GameStateComponent.INTERACTION_MODES.PLANTING
					) {
						nuxState.setState(NUX_STEPS.SEEDBOX_PLANT_SEED);
					} else {
						nuxState.setState(NUX_STEPS.SEEDBOX_OPEN_MENU);
					}
				}
				break;
			case NUX_STEPS.SEEDBOX_PLANT_SEED:
				if (this.queries.plantedSeed.added.length > 0) {
					nuxState.setState(NUX_STEPS.CLOSING);
				}
				break;
		}

		if (nuxState.justUpdatedCurrentNUXState) {
			this._justUpdatedNUXState(nuxState);
			return;
		}
	}

	_justUpdatedNUXState(nuxState) {
		nuxState.justUpdatedCurrentNUXState = false;

		// Hide or show NUX panels depending on what the current state is.
		this.queries.nuxPanels.results.forEach((entity) => {
			const nuxPanel = entity.getComponent(NUXPanelComponent);
			if (nuxPanel.id === nuxState.currentState) {
				if (nuxPanel.delay > 0) {
					// timeout, show if it's still relevant
					setTimeout(() => {
						if (nuxPanel.id !== nuxState.currentState) {
							return;
						}
						this._showPanel(entity);
					}, nuxPanel.delay);
				} else {
					// show immediately
					this._showPanel(entity);
				}
			} else {
				if (entity.hasComponent(IsActive)) {
					entity.removeComponent(IsActive);
				}
			}
		});

		// custom handling for every step
		switch (nuxState.currentState) {
			case NUX_STEPS.BEFORE_START:
				// disable a bunch of systems
				this.world.getSystem(LocomotionVignetteSystem).stop();
				this.world.getSystem(TeleportationSystem).stop();
				this.world.getSystem(JoystickMovementSystem).stop();
				this.world.getSystem(SnapTurnSystem).stop();
				this.world.getSystem(SelectionWheelSystem).stop();

				setTimeout(() => {
					nuxState.setState(NUX_STEPS.WELCOME);
				}, 1000);
				break;
			case NUX_STEPS.LOCOMOTION_MOVE_TO:
				this.world.getSystem(LocomotionVignetteSystem).play();
				this.world.getSystem(TeleportationSystem).play();
				this.world.getSystem(JoystickMovementSystem).play();
				this.world.getSystem(SnapTurnSystem).play();

				// a timeout that will be canceled if we have already moved
				setTimeout(() => {
					if (nuxState.currentState === NUX_STEPS.LOCOMOTION_MOVE_TO) {
						nuxState.setState(NUX_STEPS.SEEDBOX);
					}
				}, 40000);

				break;
			case NUX_STEPS.SEEDBOX_OPEN_MENU:
				this.world.getSystem(SelectionWheelSystem).play();
				break;
			case NUX_STEPS.SEEDBOX_PLANT_SEED: {
				const seedbox = getOnlyEntity(this.queries.seedbox).getMutableComponent(
					SeedboxComponent,
				);
				this.previousSeedboxPage = seedbox.currentPageId;
				this.previousSeedboxIndex = seedbox.currentPlantIndex;

				seedbox.selectPlantGroup('sugarpine');
				break;
			}
			case NUX_STEPS.ENDED: {
				// restart all systems that the NUX could've stopped.
				this.world.getSystem(LocomotionVignetteSystem).play();
				this.world.getSystem(TeleportationSystem).play();
				this.world.getSystem(JoystickMovementSystem).play();
				this.world.getSystem(SnapTurnSystem).play();
				this.world.getSystem(SelectionWheelSystem).play();

				// flag that we've seen the NUX, so we don't show it again.
				localforage.setItem(LOCALSTORAGE_KEYS.SEEN_NUX, true);

				const seedbox = getOnlyEntity(this.queries.seedbox).getMutableComponent(
					SeedboxComponent,
				);

				// restore seedbox defaults if we changed it as a result of going through the
				// planting tutorial.
				if (this.previousSeedboxPage >= 0) {
					seedbox.currentPageId = this.previousSeedboxPage;
				}
				if (this.previousSeedboxIndex >= 0) {
					seedbox.currentPlantIndex = this.previousSeedboxIndex;
				}
			}
		}
	}

	_showPanel(nuxPanelEntity) {
		if (!nuxPanelEntity.hasComponent(IsActive)) {
			nuxPanelEntity.addComponent(IsActive);
			const nuxPanel = nuxPanelEntity.getComponent(NUXPanelComponent);
			if (nuxPanel.onShow) {
				nuxPanel.onShow();
			}
		}
	}

	_ensureUIRayActive() {
		let gameState = getOnlyEntity(this.queries.gameState).getMutableComponent(
			GameStateComponent,
		);
		if (
			gameState.interactionMode !== GameStateComponent.INTERACTION_MODES.DEFAULT
		) {
			gameState.setInteractionMode(
				GameStateComponent.INTERACTION_MODES.DEFAULT,
			);
		}
	}
}

NUXSystem.queries = {
	controllers: { components: [VrControllerComponent], listen: { added: true } },
	gameManager: {
		components: [THREEGlobalComponent],
		listen: { added: true },
	},
	gameState: {
		components: [GameStateComponent],
	},
	nux: { components: [NUXStateComponent] },
	nuxPanels: { components: [NUXPanelComponent, UIPanelComponent] },

	player: {
		components: [PlayerStateComponent],
	},

	// queries needed for individual steps.
	intendedTeleportArea: {
		components: [NUXMovementTriggerArea],
	},
	seedbox: {
		components: [SeedboxComponent],
	},
	selectionWheel: {
		components: [SelectionWheelComponent],
	},
	plantedSeed: {
		components: [PlantGrowingComponent],
		listen: { added: true },
	},
};
