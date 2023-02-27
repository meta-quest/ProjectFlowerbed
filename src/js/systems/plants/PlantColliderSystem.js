/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import {
	CollisionWorldComponent,
	StaticColliderComponent,
} from '../../components/ColliderComponents';
import { Not, System } from 'ecsy';
import {
	PlantGrowingComponent,
	PlantTinyColliderComponent,
	PlantedComponent,
} from '../../components/PlantingComponents';

import { AssetDatabaseComponent } from '../../components/AssetDatabaseComponent';
import { COLLISION_LAYERS } from '../../Constants';
import { MeshIdComponent } from '../../components/AssetReplacementComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { copyTransforms } from '../../utils/transformUtils';
import { getOnlyEntity } from '../../utils/entityUtils';
import { updateMatrixRecursively } from '../../utils/object3dUtils';

// handles all of the creation / updating of colliders for the planted plants.
export class PlantColliderSystem extends System {
	execute() {
		const assetDatabase = getOnlyEntity(
			this.queries.assetDatabase,
		).getComponent(AssetDatabaseComponent);

		this.queries.planted.results.forEach((entity) => {
			const plantedComponent = entity.getMutableComponent(PlantedComponent);
			const plantedObject = entity.getComponent(Object3DComponent).value;
			const meshId = entity.getComponent(MeshIdComponent).id;
			const collisionMesh = assetDatabase.meshes.getCollider(meshId);

			copyTransforms(plantedObject, collisionMesh);

			collisionMesh.scale
				.copy(plantedComponent.plantedScale)
				.multiplyScalar(plantedComponent.scaleMultiplier);

			updateMatrixRecursively(collisionMesh);

			entity.addComponent(StaticColliderComponent, {
				mesh: collisionMesh,
				layers: [COLLISION_LAYERS.PLANT],
			});

			// add tiny collider
			const cylinder = new THREE.Mesh(
				new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8),
				new THREE.MeshBasicMaterial({
					color: 0xffff00,
					transparent: true,
					opacity: 0.5,
				}),
			);
			cylinder.visible = false;
			cylinder.position.copy(plantedObject.position);
			cylinder.quaternion.copy(plantedObject.quaternion);
			plantedObject.parent.add(cylinder);

			const tinyColliderEntity = this.world.createEntity();
			tinyColliderEntity.addComponent(StaticColliderComponent, {
				mesh: cylinder,
				layers: [COLLISION_LAYERS.PLANT],
			});
			tinyColliderEntity.addComponent(PlantTinyColliderComponent, {
				plantEntity: entity,
			});

			plantedComponent.tinyColliderEntity = tinyColliderEntity;
			updateMatrixRecursively(cylinder);
		});

		this.queries.growing.removed.forEach((entity) => {
			// check to make sure that this entity is in fact still a plant.
			if (
				!entity.hasAllComponents([
					StaticColliderComponent,
					PlantedComponent,
					Object3DComponent,
				])
			) {
				return;
			}
		});
	}
}

PlantColliderSystem.queries = {
	assetDatabase: {
		components: [AssetDatabaseComponent],
	},
	planted: {
		components: [
			Not(StaticColliderComponent),
			MeshIdComponent,
			PlantedComponent,
			Object3DComponent,
		],
	},

	growing: {
		components: [PlantGrowingComponent, PlantedComponent, Object3DComponent],
		listen: { removed: true },
	},
	collisionWorld: { components: [CollisionWorldComponent] },
};
