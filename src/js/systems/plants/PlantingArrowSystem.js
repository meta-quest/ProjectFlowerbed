/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { PLANTING_CONSTANTS, RAY_CONSTANTS } from '../../Constants';

import { GameStateComponent } from '../../components/GameStateComponent';
import { IndicatorRingComponent } from '../../components/IndicatorRingComponent';
import { InteractionSystem } from '../../lib/InteractionSystem';
import { Object3DComponent } from '../../components/Object3DComponent';
import { PlantingStateComponent } from '../../components/PlantingComponents';
import { SeedboxComponent } from '../../components/SeedboxComponents';
import { getOnlyEntity } from '../../utils/entityUtils';
import { updateMatrixRecursively } from '../../utils/object3dUtils';

const INTERACTION_MODES = GameStateComponent.INTERACTION_MODES;

const TEXTURE_SIZE = 100;

export class PlantingArrowSystem extends InteractionSystem {
	constructor(world, attributes) {
		super(world, attributes);
		this.interactionMode = INTERACTION_MODES.PLANTING;
	}

	init() {
		this.plantingState = getOnlyEntity(
			this.queries.plantingState,
		).getMutableComponent(PlantingStateComponent);
	}

	onEnterMode() {
		this.indicatorRingComponent.setRingType(
			IndicatorRingComponent.RING_TYPES.PLANTABLE_RING,
		);
	}

	onExitMode() {
		this.indicatorRingComponent.setRingVisible(false);
		this.plantingState.plantingIndicatorEntity.getComponent(
			Object3DComponent,
		).value.visible = false;
	}

	onCorrectInteractionMode() {
		if (!this.plantingState.plantingIndicatorEntity) {
			this._setupPlantingArrow();
			return;
		}

		this._updatePlantingArrow();
	}

	_setupPlantingArrow() {
		this.plantingState.plantingIndicatorEntity = this.world.createEntity();
		const plantingArrowObject = new THREE.Object3D();

		const cone = new THREE.Mesh(
			new THREE.ConeGeometry(0.1, 0.1, 32),
			new THREE.MeshStandardMaterial({
				color: 0x86dc3d,
				metalness: 0.1,
				roughness: 0.7,
			}),
		);
		cone.rotateX(Math.PI);
		cone.position.y = 0.3;
		cone.receiveShadow = true;
		cone.renderOrder = RAY_CONSTANTS.RENDER_ORDER + 1;
		plantingArrowObject.add(cone);

		const canvas = document.createElement('CANVAS');
		canvas.width = 100;
		canvas.height = 100;
		const ctx = canvas.getContext('2d');
		var grd = ctx.createLinearGradient(0, 0, 0, TEXTURE_SIZE);
		grd.addColorStop(0, '#86dc3d00');
		grd.addColorStop(1, '#86dc3dff');

		ctx.fillStyle = grd;
		ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

		new THREE.TextureLoader().load(canvas.toDataURL(), (texture) => {
			const cylinder = new THREE.Mesh(
				new THREE.CylinderGeometry(0.05, 0.05, 0.2, 32, 1, true),
				new THREE.MeshStandardMaterial({
					transparent: true,
					metalness: 0.1,
					roughness: 0.7,
					map: texture,
				}),
			);
			cylinder.position.y = 0.45;
			cylinder.renderOrder = RAY_CONSTANTS.RENDER_ORDER + 1;
			cylinder.receiveShadow = true;
			plantingArrowObject.add(cylinder);
		});

		this.threeGlobalComponent.scene.add(plantingArrowObject);
		this.plantingState.plantingIndicatorEntity.addComponent(Object3DComponent, {
			value: plantingArrowObject,
		});
	}

	_updatePlantingArrow() {
		const plantingArrowObject = this.plantingState.plantingIndicatorEntity?.getComponent(
			Object3DComponent,
		).value;

		const seedboxEntity = getOnlyEntity(this.queries.seedbox);
		const seedboxComponent = seedboxEntity.getComponent(SeedboxComponent);

		plantingArrowObject.visible =
			this.plantingState.plantingPossible &&
			!(
				seedboxComponent.inFocus &&
				(seedboxComponent.inSelectionZone || seedboxComponent.isPointedAt)
			);
		this.indicatorRingComponent.setRingVisible(plantingArrowObject.visible);
		if (plantingArrowObject.visible) {
			const controllerOrientation = new THREE.Euler();
			if (this.controllerInterfaces.RIGHT) {
				controllerOrientation.setFromQuaternion(
					this.controllerInterfaces.RIGHT.getQuaternion(),
					'YZX',
				);
				// this is a hacky way to just change the rotation as the controller rotation changes.
				plantingArrowObject.rotation.y =
					controllerOrientation.y + controllerOrientation.z;
			}
			plantingArrowObject.position.copy(this.plantingState.plantingTarget);
			plantingArrowObject.position.add(PLANTING_CONSTANTS.PLANT_INITIAL_OFFSET);
		}
		updateMatrixRecursively(plantingArrowObject);
	}
}

PlantingArrowSystem.addQueries({
	plantingState: { components: [PlantingStateComponent] },
	seedbox: { components: [SeedboxComponent] },
});
