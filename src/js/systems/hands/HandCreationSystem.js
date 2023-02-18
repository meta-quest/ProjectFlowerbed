/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { ControllerInterface } from '../../lib/ControllerInterface';
import { DEBUG_CONSTANTS } from '../../Constants';
import { GazeFollowerComponent } from '../../components/GazeFollowerComponent';
import { IsActive } from '../../components/GameObjectTagComponents';
import { MeshIdComponent } from '../../components/AssetReplacementComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { UIPanelComponent } from '../../components/UIPanelComponent';
import { VrControllerComponent } from '../../components/VrControllerComponent';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory';

import controllerOnlyPanel from '../../../assets/ui/controller-only-panel.json';
import { getOnlyEntity } from '../../utils/entityUtils';

export class HandCreationSystem extends System {
	init() {
		this.renderer = getOnlyEntity(this.queries.gameManager).getComponent(
			THREEGlobalComponent,
		).renderer;
		const viewerTransform = getOnlyEntity(this.queries.player).getComponent(
			PlayerStateComponent,
		).viewerTransform;
		const controllerModelFactory = new XRControllerModelFactory();

		this.numConnectedControllers = 0;
		const self = this;

		this.controllers = {};

		// prompt panel asking user to connect controllers
		this.panelEntity = this.world.createEntity();
		const controllerPromptParams = UIPanelComponent.createFromJSON(
			controllerOnlyPanel,
		);

		this.panelEntity.addComponent(UIPanelComponent, {
			...controllerPromptParams,
			parent: viewerTransform,
		});
		this.panelEntity.addComponent(Object3DComponent, {
			value: controllerPromptParams.uiPanel,
		});
		this.panelEntity.addComponent(GazeFollowerComponent, {
			yOffset: -0.1,
			radius: 1.5,
			velocity: new THREE.Vector3(0, 0, 0),
		});

		const createHandEntity = () => {
			const handEntity = self.world.createEntity();
			const handModel = new THREE.Object3D();
			// only load left hand model, mirror for right hand
			handEntity.addComponent(MeshIdComponent, {
				id: 'HAND_REST_LEFT',
			});
			handEntity.addComponent(Object3DComponent, { value: handModel });

			// apparently without this, we don't get the full hand animation (e.g. capacitive touch movements)
			// should figure out where to update that manually sometime.
			handModel.matrixAutoUpdate = true;
			return handEntity;
		};

		this.handEntities = { left: createHandEntity(), right: createHandEntity() };
		this.controllerEntities = {};

		for (let i = 0; i < 2; i++) {
			const controller = this.renderer.xr.getController(i);
			viewerTransform.add(controller);

			const controllerGrip = this.renderer.xr.getControllerGrip(i);
			viewerTransform.add(controllerGrip);

			const controllerModel = controllerModelFactory.createControllerModel(
				controllerGrip,
			);
			controllerGrip.add(controllerModel);

			controllerModel.visible = false;

			const controllerEntity = this.world.createEntity();

			controller.addEventListener('connected', function (event) {
				const gamepad = event.data.gamepad;
				const handedness = event.data.handedness;

				let isOculusTouch = false;

				for (const profile of event.data.profiles) {
					if (profile.match(/oculus-touch/i)) {
						isOculusTouch = true;
						break;
					}
				}

				if (!isOculusTouch) return;

				self.numConnectedControllers += 1;

				controllerGrip.add(
					self.handEntities[handedness].getComponent(Object3DComponent).value,
				);

				if (controllerEntity.hasComponent(VrControllerComponent)) {
					controllerEntity.removeComponent(VrControllerComponent);
				}

				controllerEntity.addComponent(VrControllerComponent, {
					handedness: handedness,
					controllerInterface: new ControllerInterface(
						handedness,
						this,
						gamepad,
						controllerModel,
					),
					handModelEntity: self.handEntities[handedness],
					threeControllerIdx: i,
				});
			});

			controller.addEventListener('disconnected', function (event) {
				let isOculusTouch = false;

				for (const profile of event?.data?.profiles) {
					if (profile.match(/oculus-touch/i)) {
						isOculusTouch = true;
						break;
					}
				}

				if (isOculusTouch) {
					self.numConnectedControllers -= 1;
				}
			});
		}
	}

	execute(_delta, _time) {
		Object.entries(this.handEntities).forEach(([handedness, handEntity]) => {
			if (handEntity.getComponent(MeshIdComponent).modelHasChanged) {
				const handModel = handEntity.getComponent(Object3DComponent).value;
				handModel.traverse((node) => {
					node.castShadow = false;
					node.frustumCulled = false;
				});
				// mirror the left hand model for right hand
				if (handedness == 'right') {
					handModel.children[0].scale.y = 1;
					handModel.children[0].position.x *= -1;
				}
			}
		});

		if (!this.renderer.xr.isPresenting) {
			return;
		}

		if (this.panelEntity) {
			if (
				this.numConnectedControllers != 2 &&
				!DEBUG_CONSTANTS.SUPPRESS_CONTROLS_PANEL
			) {
				if (!this.panelEntity.hasComponent(IsActive)) {
					this.panelEntity.addComponent(IsActive);
				}
			} else {
				if (this.panelEntity.hasComponent(IsActive)) {
					this.panelEntity.removeComponent(IsActive);
				}
			}
		}
	}
}

HandCreationSystem.queries = {
	gameManager: {
		components: [THREEGlobalComponent],
	},
	player: {
		components: [PlayerStateComponent],
		listen: { added: true, removed: true },
	},
	controller: {
		components: [VrControllerComponent],
	},
};
