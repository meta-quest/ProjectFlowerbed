/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import {
	PlantGrowingComponent,
	SeedAnimationComponent,
} from '../../components/PlantingComponents';
import { deleteEntity, getOnlyEntity } from '../../utils/entityUtils';

import { MeshIdComponent } from '../../components/AssetReplacementComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { OneshotAudioComponent } from '../../components/AudioComponents';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { getPlantMeshId } from '../../utils/plantUtils';
import { updateMatrixRecursively } from '../../utils/object3dUtils';

export class SeedAnimationSystem extends System {
	init() {
		this.scene = getOnlyEntity(this.queries.gameManager).getComponent(
			THREEGlobalComponent,
		).scene;
	}

	execute(delta, _time) {
		[...this.queries.seed.results].forEach((entity) => {
			const animationComponent = entity.getMutableComponent(
				SeedAnimationComponent,
			);
			animationComponent.timer += delta;
			if (animationComponent.timer >= animationComponent.flightTime) {
				deleteEntity(null, entity);
				this._plantSeed(
					animationComponent.plantType,
					animationComponent.plantedPosition,
					new THREE.Quaternion(),
				);
			} else {
				const seedObject = entity.getComponent(Object3DComponent).value;
				seedObject.position.copy(
					animationComponent.flightCurve.getPointAt(
						animationComponent.timer / animationComponent.flightTime,
					),
				);
				updateMatrixRecursively(seedObject);
			}
		});
	}

	/**
	 * Perform the planting
	 * @param {*} plantType
	 * @param {*} plantedPosition
	 * @param {*} plantedQuaternion
	 */
	_plantSeed(plantType, plantedPosition, plantedQuaternion) {
		let plantedEntity = this.world.createEntity();

		let plantedObject = new THREE.Object3D();
		plantedObject.position.copy(plantedPosition);
		plantedObject.quaternion.copy(plantedQuaternion);

		plantedObject.scale.setScalar(0);
		plantedEntity.addComponent(PlantGrowingComponent, {
			plantType,
		});

		this.scene.add(plantedObject);
		plantedEntity.addComponent(Object3DComponent, {
			value: plantedObject,
		});
		plantedEntity.addComponent(MeshIdComponent, {
			id: getPlantMeshId(plantType),
		});

		OneshotAudioComponent.createSFX(this.world, {
			id: 'PLANTING_SEED',
			position: plantedObject.position,
		});
	}
}

SeedAnimationSystem.queries = {
	gameManager: { components: [THREEGlobalComponent] },
	seed: { components: [SeedAnimationComponent, Object3DComponent] },
};
