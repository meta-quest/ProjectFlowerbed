/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { Not, System } from 'ecsy';
import {
	RayComponent,
	ShortRay,
	StraightRay,
} from '../../components/RayComponents';

import { AssetDatabaseComponent } from '../../components/AssetDatabaseComponent';
import { GameStateComponent } from '../../components/GameStateComponent';
import { IsActive } from 'src/js/components/GameObjectTagComponents';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { TRIGGERS } from '../../lib/ControllerInterface';
import { UIPanelComponent } from '../../components/UIPanelComponent';
import { VrControllerComponent } from '../../components/VrControllerComponent';

export class UIPanelInteractionSystem extends System {
	init() {
		this.gameStateComponent = null;
		this.threeGlobals = null;

		this.intersectMarker = null;

		this.queries.gameManager.results.forEach((entity) => {
			this.gameStateComponent = entity.getComponent(GameStateComponent);
			this.threeGlobals = entity.getComponent(THREEGlobalComponent);

			const scene = this.threeGlobals.scene;

			this.intersectMarker = new THREE.Mesh(
				new THREE.SphereGeometry(0.01, 10, 8),
				new THREE.MeshBasicMaterial({
					color: 0xffffff,
					opacity: 0.5,
					transparent: true,
				}),
			);
			this.intersectMarker.matrixAutoUpdate = true;
			scene.add(this.intersectMarker);
		});
	}

	execute() {
		let targetRayComponent;

		this.queries.targetRay.results.forEach((entity) => {
			targetRayComponent = entity.getMutableComponent(RayComponent);
		});

		if (!this.gameStateComponent) {
			return;
		}

		if (targetRayComponent) {
			let panelsActive = this.queries.panels.results.length > 0;

			// ray and intersection visibility set in handleInputs
			targetRayComponent.visible = false;

			this.intersectMarker.visible = false;
			this.intersectMarker.matrixAutoUpdate = false;

			if (!panelsActive) {
				return;
			}

			targetRayComponent.setRayType(RayComponent.RAY_TYPES.UI_RAY);

			this._handleCameraFollow();

			// INPUTS
			///////////
			this._handleInputs(targetRayComponent);
		}
	}

	_handleCameraFollow() {
		this.queries.panels.results.forEach((entity) => {
			const panelComponent = entity.getComponent(UIPanelComponent);
			if (!panelComponent.shouldLookAtCamera) {
				return;
			}

			const panelObject = panelComponent.uiPanel;
			panelObject.lookAt(this.threeGlobals.camera.position);
		});
	}

	_handleInputs(targetRayComponent) {
		let controllerInterface;

		this.queries.controllers.results.forEach((entity) => {
			let vrControllerComponent = entity.getComponent(VrControllerComponent);
			if (vrControllerComponent.handedness == 'right') {
				controllerInterface = vrControllerComponent.controllerInterface;
			}
		});

		if (!controllerInterface) {
			return;
		}

		const objsToRaycastAgainst = [];
		this.queries.panels.results.forEach((entity) => {
			const panelComponent = entity.getComponent(UIPanelComponent);
			const panelObject = panelComponent.uiPanel;

			// retrieve active panels
			if (!panelComponent.interactable) {
				return;
			}

			objsToRaycastAgainst.push(...panelObject.getInteractableElements());
		});

		if (!objsToRaycastAgainst.length) {
			// there are no interactable panels, so we don't need to handle any inputs.
			return;
		}

		// if we have interactable panels, make sure the target ray is visible.
		targetRayComponent.visible = true;

		// raycast against all of the results' active panels
		const intersection = this._raycast(
			objsToRaycastAgainst,
			targetRayComponent.raycaster,
		);
		if (intersection) {
			this.intersectMarker.visible = true;
			this.intersectMarker.matrixAutoUpdate = true;
			this.intersectMarker.position.copy(intersection.point);
		}

		// if we have controller buttons, handle controller inputs
		let triggerPressed = controllerInterface.triggerPressed(
			TRIGGERS.INDEX_TRIGGER,
		);

		let triggerJustReleased = controllerInterface.triggerJustReleased(
			TRIGGERS.INDEX_TRIGGER,
		);

		let targetObject = undefined;

		if (intersection?.object) {
			targetObject = intersection.object;
		}
		if (
			targetObject &&
			!targetObject.isButton &&
			targetObject.parent?.isButton
		) {
			targetObject = targetObject.parent;
		}

		// update states
		if (targetObject && targetObject.isButton && triggerPressed) {
			targetObject.setState('selected');
		} else if (targetObject && targetObject.isButton) {
			targetObject.setState('hovered');
		}

		// click buttons
		if (targetObject && targetObject.isButton && triggerJustReleased) {
			targetObject.click();
		}

		// Update non-targeted buttons state
		objsToRaycastAgainst.forEach((obj) => {
			if ((!intersection || obj !== targetObject) && obj.isButton) {
				obj.setState('idle');
			}
		});
	}

	/**
	 * Raycasts against the closest object in an array
	 * @param {Object3D[]} objectsToTest
	 * @param {THREE.Raycaster} raycaster
	 */
	_raycast(objectsToTest, raycaster) {
		let intersections = raycaster.intersectObjects(objectsToTest, true);
		if (intersections.length > 0) {
			intersections[0].object = intersections[0].object.parent;
			return intersections[0];
		}
	}
}

UIPanelInteractionSystem.queries = {
	controllers: { components: [VrControllerComponent] },
	targetRay: { components: [RayComponent, StraightRay, Not(ShortRay)] },
	gameManager: {
		components: [GameStateComponent, THREEGlobalComponent],
	},
	panels: {
		components: [UIPanelComponent, IsActive],
	},
	assets: {
		components: [AssetDatabaseComponent],
	},
};
