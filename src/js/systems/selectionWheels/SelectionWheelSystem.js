/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { BUTTONS, TRIGGERS } from '../../lib/ControllerInterface';
import {
	SelectionWheelComponent,
	WHEEL_STATE,
} from '../../components/SelectionWheelComponent';

import { InteractionSystem } from '../../lib/InteractionSystem';
import { IsActive } from '../../components/GameObjectTagComponents';
import { MODE_SELECTION_WHEEL_CONSTANTS } from '../../Constants';
import { Object3DComponent } from '../../components/Object3DComponent';
import { OneshotAudioComponent } from '../../components/AudioComponents';
import { RayComponent } from 'src/js/components/RayComponents';

export class SelectionWheelSystem extends InteractionSystem {
	init() {
		this.currentSelectionAction = null;
		this.retractPending = false;
		this.raycaster = new THREE.Raycaster();
	}

	onExecute(delta, _time) {
		const wheelEntity = this.queries.wheel.results[0];
		if (!wheelEntity) return;

		const wheelObject = wheelEntity.getComponent(Object3DComponent).value;
		const wheelComponent = wheelEntity.getMutableComponent(
			SelectionWheelComponent,
		);
		const tiles = wheelComponent.wheelTiles;

		const controllerInterface = this.controllerInterfaces.RIGHT;
		this.shortRayComponent.visible = false;
		this.shortRayComponent.setRayType(RayComponent.RAY_TYPES.SHORT_RAY);
		const grip = controllerInterface.controllerModel.parent;
		const toggled = controllerInterface.buttonJustPressed(BUTTONS.BUTTON_1);
		if (toggled && wheelComponent.state === WHEEL_STATE.RETRACTED) {
			this.onDeploy(wheelComponent, wheelObject);

			OneshotAudioComponent.createSFX(this.world, {
				id: 'MENU_OPEN',
				position: grip.position,
			});
		}
		if (
			(toggled || this.retractPending) &&
			wheelComponent.state === WHEEL_STATE.DEPLOYED
		) {
			this.onRetract(wheelComponent, tiles, grip);

			OneshotAudioComponent.createSFX(this.world, {
				id: 'MENU_CLOSE',
				position: grip.position,
			});
		}

		this.gameStateComponent.interactionModeOverridden = wheelObject.visible;
		this.retractPending = false;

		switch (wheelComponent.state) {
			case WHEEL_STATE.DEPLOYING:
				// Animation for deploy of wheel
				wheelComponent.transitionTimer += delta;
				this.onDeploying(wheelComponent, tiles);
				break;
			case WHEEL_STATE.RETRACTING:
				// Animation for retract of wheel
				wheelComponent.transitionTimer += delta;
				this.onRetracting(wheelComponent, wheelObject, tiles, grip);
				break;
			case WHEEL_STATE.DEPLOYED:
				// Update wheel tiles, find tile to select
				this.updateWheel(wheelComponent, controllerInterface);
				break;
			default:
				break;
		}
	}

	/**
	 * Reposition wheel on deploy
	 * @param {SelectionWheelComponent} wheelComponent
	 * @param {THREE.Object3D} wheelObject
	 */
	onDeploy(wheelComponent, wheelObject) {
		wheelObject.visible = true;

		this.playerStateComponent.viewerTransform.attach(wheelObject);
		wheelObject.lookAt(
			this.threeGlobalComponent.renderer.xr
				.getCamera()
				.getWorldPosition(new THREE.Vector3()),
		);

		wheelComponent.state = WHEEL_STATE.DEPLOYING;
		wheelObject.matrixAutoUpdate = true;
	}

	/**
	 * Change state and record transition position on retract
	 * @param {SelectionWheelComponent} wheelComponent
	 * @param {THREE.Object3D[]} tiles - list of tile objects on the wheel
	 * @param {THREE.Object3D} grip - dominant hand controller grip
	 */
	onRetract(wheelComponent, tiles, grip) {
		wheelComponent.focusedTile = undefined;
		// hide all tooltips
		this.onFocusedTileChanged(wheelComponent);
		wheelComponent.state = WHEEL_STATE.RETRACTING;
		tiles.forEach((tile) => {
			grip.attach(tile);
			// the starting position of the retracting animation for each tile
			tile.retractStartPosition = tile.position.clone();
		});
	}

	/**
	 * Animation for deploying the wheel from controller grip
	 * @param {SelectionWheelComponent} wheelComponent
	 * @param {THREE.Object3D[]} tiles - list of tile objects on the wheel
	 */
	onDeploying(wheelComponent, tiles) {
		if (
			wheelComponent.transitionTimer >=
			MODE_SELECTION_WHEEL_CONSTANTS.TRANSITION_DURATION
		) {
			tiles.forEach((tile) => {
				tile.position.copy(tile.defaultPosition);
				tile.scale.setScalar(1);
				tile.updateMatrix();
			});
			wheelComponent.transitionTimer = 0;
			wheelComponent.state = WHEEL_STATE.DEPLOYED;
		} else {
			tiles.forEach((tile) => {
				tile.position.copy(
					tile.defaultPosition
						.clone()
						.multiplyScalar(
							wheelComponent.transitionTimer /
								MODE_SELECTION_WHEEL_CONSTANTS.TRANSITION_DURATION,
						),
				);
				tile.scale.setScalar(
					wheelComponent.transitionTimer /
						MODE_SELECTION_WHEEL_CONSTANTS.TRANSITION_DURATION,
				);
				tile.updateMatrix();
			});
		}
	}

	/**
	 * Animation for retracting the wheel back into the controller grip
	 * If a tile is selected, its retracting motion is delayed by
	 * MODE_SELECTION_WHEEL_CONSTANTS.SELECTED_TRANSITION_DELAY
	 * @param {SelectionWheelComponent} wheelComponent
	 * @param {THREE.Object3D} wheelObject
	 * @param {THREE.Object3D[]} tiles - list of tile objects on the wheel
	 * @param {THREE.Object3D} grip - dominant hand controller grip
	 */
	onRetracting(wheelComponent, wheelObject, tiles, grip) {
		const transitionFactor = Math.max(
			(MODE_SELECTION_WHEEL_CONSTANTS.TRANSITION_DURATION -
				wheelComponent.transitionTimer) /
				MODE_SELECTION_WHEEL_CONSTANTS.TRANSITION_DURATION,
			0,
		);
		const selectedTransitionFactor =
			(MODE_SELECTION_WHEEL_CONSTANTS.TRANSITION_DURATION -
				Math.max(
					wheelComponent.transitionTimer -
						MODE_SELECTION_WHEEL_CONSTANTS.SELECTED_TRANSITION_DELAY,
					0,
				)) /
			MODE_SELECTION_WHEEL_CONSTANTS.TRANSITION_DURATION;
		const totalTransitionTime =
			this.currentSelectionAction == null
				? MODE_SELECTION_WHEEL_CONSTANTS.TRANSITION_DURATION
				: MODE_SELECTION_WHEEL_CONSTANTS.TRANSITION_DURATION +
				  MODE_SELECTION_WHEEL_CONSTANTS.SELECTED_TRANSITION_DELAY;
		if (wheelComponent.transitionTimer >= totalTransitionTime) {
			tiles.forEach((tile) => {
				wheelObject.add(tile);
				tile.position.copy(tile.defaultPosition);
				tile.quaternion.copy(tile.defaultQuaternion);
				tile.scale.setScalar(1);
				tile.updateMatrix();
			});
			wheelObject.visible = false;
			grip.add(wheelObject);
			wheelObject.position.set(0, 0, 0);

			wheelComponent.transitionTimer = 0;
			wheelComponent.state = WHEEL_STATE.RETRACTED;
			if (this.currentSelectionAction != null) {
				this.currentSelectionAction();
			}
			wheelObject.updateMatrix();
			wheelObject.matrixAutoUpdate = false;
		} else {
			tiles.forEach((tile) => {
				const factor =
					tile.action == this.currentSelectionAction
						? selectedTransitionFactor
						: transitionFactor;
				tile.position.copy(
					tile.retractStartPosition.clone().multiplyScalar(factor),
				);
				tile.scale.setScalar(factor);
				tile.updateMatrix();
			});
		}
	}

	/**
	 * Loop through tiles to find tile to highlight
	 * @param {SelectionWheelComponent} wheelComponent
	 * @param {import('../../lib/ControllerInterface').ControllerInterface} controller - ControllerInterface of dominant hand
	 */
	updateWheel(wheelComponent, controller) {
		let focusedTile = null;
		let closestDistance = Infinity;
		this.currentSelectionAction = null;
		wheelComponent.wheelTiles.forEach((tile) => {
			if (this.gameStateComponent.interactionMode === tile.mode) {
				tile.faceMesh.material.color.setHex(
					MODE_SELECTION_WHEEL_CONSTANTS.TILE_FACE_COLOR_SELECTED,
				);
			} else {
				tile.faceMesh.material.color.setHex(
					MODE_SELECTION_WHEEL_CONSTANTS.TILE_FACE_COLOR_DEFAULT,
				);
			}

			const distance = controller
				.getPosition()
				.distanceTo(tile.getWorldPosition(new THREE.Vector3()));
			if (distance < closestDistance) {
				closestDistance = distance;
				if (distance < MODE_SELECTION_WHEEL_CONSTANTS.SELECT_THRESHOLD) {
					focusedTile = tile;
				}
			}
		});

		if (!focusedTile) {
			this.shortRayComponent.visible = true;
			focusedTile = this.findFocusedTileWithRay(
				wheelComponent.wheelTiles,
				controller,
			);
		}

		if (focusedTile !== wheelComponent.focusedTile) {
			wheelComponent.focusedTile = focusedTile;
			this.onFocusedTileChanged(wheelComponent);
		}

		if (focusedTile) {
			focusedTile.faceMesh.material.color.setHex(
				MODE_SELECTION_WHEEL_CONSTANTS.TILE_FACE_COLOR_HOVERED,
			);

			const controllerInterface = this.controllerInterfaces.RIGHT;
			if (controllerInterface.triggerJustPressed(TRIGGERS.INDEX_TRIGGER)) {
				this.currentSelectionAction = focusedTile.action;

				this.retractPending = true;
			}
		}
	}

	findFocusedTileWithRay(tiles) {
		const intersect = this.shortRayComponent.raycaster.intersectObjects(
			tiles,
		)[0];
		const findRootTile = (object) => {
			if (!object?.isObject3D) {
				return null;
			} else if (object.name.endsWith('_tile')) {
				return object;
			} else {
				return findRootTile(object.parent);
			}
		};
		if (intersect) {
			return findRootTile(intersect.object);
		}
	}

	onFocusedTileChanged(wheelComponent) {
		for (let tile of wheelComponent.wheelTiles) {
			if (!tile.tooltip) {
				continue;
			}
			if (tile === wheelComponent.focusedTile) {
				if (!tile.tooltip.hasComponent(IsActive)) {
					tile.tooltip.addComponent(IsActive);
				}
			} else {
				if (tile.tooltip.hasComponent(IsActive)) {
					tile.tooltip.removeComponent(IsActive);
				}
			}
		}
	}
}

SelectionWheelSystem.addQueries({
	wheel: { components: [SelectionWheelComponent, Object3DComponent] },
});
