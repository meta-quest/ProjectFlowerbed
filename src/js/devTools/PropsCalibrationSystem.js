/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { AXES, BUTTONS, TRIGGERS } from '../lib/ControllerInterface';

import { AudioSystem } from '../systems/audio/AudioSystem';
import { FaunaCreationSystem } from '../systems/fauna/FaunaCreationSystem';
import { GameStateComponent } from '../components/GameStateComponent';
import { GameStateUpdateSystem } from '../systems/core/GameStateUpdateSystem';
import { GazeFollowSystem } from '../systems/ui/GazeFollowSystem';
import { IndicatorRingSystem } from '../systems/ui/IndicatorRingSystem';
import { InteractionSystem } from '../lib/InteractionSystem';
import { JoystickMovementSystem } from '../systems/locomotion/JoystickMovementSystem';
import { LocalSaveDataSystem } from '../systems/saveLoad/SaveDataSystem';
import { MeshIdComponent } from '../components/AssetReplacementComponents';
import { MovableFaunaSystem } from '../systems/fauna/MovableFaunaSystem';
import { NUXSystem } from '../systems/ui/NUXSystem';
import { Object3DComponent } from '../components/Object3DComponent';
import { PhotoAutoDeleteSystem } from '../systems/camera/PhotoAutoDeleteSystem';
import { PhotoSystem } from '../systems/camera/PhotoSystem';
import { PlantColliderSystem } from '../systems/plants/PlantColliderSystem';
import { PlantGrowingSystem } from '../systems/plants/PlantGrowingSystem';
import { PlantPickingSystem } from '../systems/plants/PlantPickingSystem';
import { PlantShrinkingSystem } from '../systems/plants/PlantShrinkingSystem';
import { PlantingArrowSystem } from '../systems/plants/PlantingArrowSystem';
import { PlantingSystem } from '../systems/plants/PlantingSystem';
import { PlayerPhysicsSystem } from '../systems/core/PlayerPhysicsSystem';
import { RayDrawingSystem } from '../systems/raycasting/RayDrawingSystem';
import { RaycastSystem } from '../systems/raycasting/RaycastSystem';
import { SaveControllerSystem } from '../systems/saveLoad/SaveControllerSystem';
import { ScreenshotCameraSystem } from '../systems/camera/ScreenshotCameraSystem';
import { SeedAnimationSystem } from '../systems/plants/SeedAnimationSystem';
import { SeedboxSystem } from '../systems/seedbox/SeedboxSystem';
import { SelectionWheelSystem } from '../systems/selectionWheels/SelectionWheelSystem';
import { SnapTurnSystem } from '../systems/locomotion/SnapTurnSystem';
import { StationaryFaunaSystem } from '../systems/fauna/StationaryFaunaSystem';
import { TeleportationSystem } from '../systems/locomotion/TeleportationSystem';
import { UIPanelInteractionSystem } from '../systems/ui/UIPanelInteractionSystem';
import { UIPanelResourcesSystem } from '../systems/ui/UIPanelResourcesSystem';
import { WateringSystem } from '../systems/plants/WateringSystem';
import { deleteEntity } from '../utils/entityUtils';

const PROPS = ['WATERING_CAN', 'CAMERA', 'SEEDBOX', 'SEEDBAG_SUGARPINE'];
const SCALES = [0.6, 0.8, 1, 0.9];
const MODES = [
	GameStateComponent.INTERACTION_MODES.WATERING,
	GameStateComponent.INTERACTION_MODES.CAMERA,
	GameStateComponent.INTERACTION_MODES.PLANTING,
	GameStateComponent.INTERACTION_MODES.PLANTING,
];

export class PropsCalibrationSystem extends InteractionSystem {
	init() {
		this.devToolActivated = false;
		this.currentProps = {};
		this.currentPropId = {};
		this.tuningData = {};
	}

	onExecute(delta, _time) {
		const rightController = this.controllerInterfaces.RIGHT;
		if (
			rightController.triggerPressed(TRIGGERS.HAND_TRIGGER) &&
			rightController.buttonJustPressed(BUTTONS.THUMBSTICK)
		) {
			// entering dev tool is a one way street
			// stopped game systems will not be restored to a proper state
			// refresh page to reset game
			if (!this.devToolActivated) {
				this.onEnterDevTool();
			}
			this.devToolActivated = !this.devToolActivated;
		}

		if (this.devToolActivated) {
			Object.entries(this.controllerInterfaces).forEach(
				([handKey, controller]) => {
					if (this.currentPropId[handKey] == null) {
						this.currentPropId[handKey] = -1;
					}
					if (controller.buttonJustPressed(BUTTONS.BUTTON_1)) {
						this.nextProp(handKey, controller);
					}
					if (controller.triggerJustPressed(TRIGGERS.HAND_TRIGGER)) {
						this.saveTuningData();
					}
					this.updatePropParent(handKey, controller);
					this.updatePropScale(handKey, controller, delta);
				},
			);
		}
	}

	nextProp(handKey, controller) {
		this.currentPropId[handKey] += 1;
		if (this.currentPropId[handKey] == PROPS.length) {
			this.currentPropId[handKey] = 0;
		}
		const propEntity = this.world.createEntity();
		const propObject = new THREE.Object3D();
		propObject.position.copy(controller.getPosition());
		propObject.quaternion.copy(controller.getQuaternion());
		propObject.scale.setScalar(SCALES[this.currentPropId[handKey]]);
		this.threeGlobalComponent.scene.add(propObject);
		propEntity.addComponent(Object3DComponent, { value: propObject });
		propEntity.addComponent(MeshIdComponent, {
			id: PROPS[this.currentPropId[handKey]],
		});
		if (this.tuningData[handKey] == null) {
			this.tuningData[handKey] = {};
		}
		if (this.tuningData[handKey][PROPS[this.currentPropId[handKey]]] == null) {
			this.tuningData[handKey][PROPS[this.currentPropId[handKey]]] = {};
		}
		this.gameStateComponent.setInteractionMode(
			MODES[this.currentPropId[handKey]],
		);

		if (this.currentProps[handKey]) {
			deleteEntity(this.threeGlobalComponent.scene, this.currentProps[handKey]);
		}
		this.currentProps[handKey] = propEntity;
	}

	updatePropParent(handKey, controller) {
		if (!this.currentProps[handKey]) return;
		const propObject = this.currentProps[handKey].getComponent(
			Object3DComponent,
		).value;
		const grip = controller.controllerModel.parent;
		const parented = propObject.parent == grip;
		if (controller.triggerPressed(TRIGGERS.INDEX_TRIGGER) && !parented) {
			grip.attach(propObject);
			this.tuningData[handKey][PROPS[this.currentPropId[handKey]]][
				'position'
			] = propObject.position.toArray();
			this.tuningData[handKey][PROPS[this.currentPropId[handKey]]][
				'quaternion'
			] = propObject.quaternion.toArray();
		} else if (!controller.triggerPressed(TRIGGERS.INDEX_TRIGGER) && parented) {
			this.threeGlobalComponent.scene.attach(propObject);
		}
	}

	updatePropScale(handKey, controller, delta) {
		if (!this.currentProps[handKey]) return;
		const propObject = this.currentProps[handKey].getComponent(
			Object3DComponent,
		).value;
		const scaleDelta = controller.getAxisInput(AXES.THUMBSTICK_Y) * 0.1 * delta;
		propObject.scale.multiplyScalar(1 + scaleDelta);
		this.tuningData[handKey][PROPS[this.currentPropId[handKey]]][
			'scale'
		] = propObject.scale.toArray();
	}

	saveTuningData() {
		const link = document.createElement('a');
		link.download = 'props' + new Date().getTime() + '.txt';
		link.href =
			'data:text/plain;charset=utf-8,' +
			encodeURIComponent(JSON.stringify(this.tuningData));
		link.click();
	}

	disableSystem(systemType) {
		this.world.getSystem(systemType).stop();
	}

	onEnterDevTool() {
		this.disableSystem(GameStateUpdateSystem);
		this.disableSystem(SelectionWheelSystem);
		this.disableSystem(IndicatorRingSystem);
		this.disableSystem(NUXSystem);
		this.disableSystem(SnapTurnSystem);
		this.disableSystem(TeleportationSystem);
		this.disableSystem(UIPanelResourcesSystem);
		this.disableSystem(UIPanelInteractionSystem);
		this.disableSystem(JoystickMovementSystem);
		this.disableSystem(PlayerPhysicsSystem);
		this.disableSystem(GazeFollowSystem);
		this.disableSystem(RaycastSystem);
		this.disableSystem(ScreenshotCameraSystem);
		this.disableSystem(PhotoSystem);
		this.disableSystem(PhotoAutoDeleteSystem);
		this.disableSystem(PlantPickingSystem);
		this.disableSystem(PlantingSystem);
		this.disableSystem(PlantingArrowSystem);
		this.disableSystem(SeedAnimationSystem);
		this.disableSystem(PlantGrowingSystem);
		this.disableSystem(PlantShrinkingSystem);
		this.disableSystem(PlantColliderSystem);
		this.disableSystem(WateringSystem);
		this.disableSystem(SaveControllerSystem);
		this.disableSystem(SeedboxSystem);
		this.disableSystem(RayDrawingSystem);
		this.disableSystem(LocalSaveDataSystem);
		this.disableSystem(AudioSystem);
		this.disableSystem(FaunaCreationSystem);
		this.disableSystem(MovableFaunaSystem);
		this.disableSystem(StationaryFaunaSystem);
	}
}
