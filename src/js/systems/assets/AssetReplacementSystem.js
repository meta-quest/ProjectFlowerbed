/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetDatabaseComponent } from '../../components/AssetDatabaseComponent';
import { MeshIdComponent } from '../../components/AssetReplacementComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { System } from 'ecsy';
import { copyTransforms } from '../../utils/transformUtils';
import { getOnlyEntity } from '../../utils/entityUtils';

/**
 * Allows entities that have a MeshIdComponent to automatically populate with loaded
 * models once the models are properly loaded, and to replace those loaded models
 * with new urls in-game.
 */
export class AssetReplacementSystem extends System {
	init() {
		const assetDatabase = getOnlyEntity(
			this.queries.assetDatabase,
		).getMutableComponent(AssetDatabaseComponent);

		// this system may run after trackedObjects get created, so we need to
		// initialize the ones that already existed.
		this.queries.trackedObject3Ds.results.forEach((entity) => {
			this._updateTrackedObject3D(
				assetDatabase,
				entity.getMutableComponent(MeshIdComponent),
				entity.getMutableComponent(Object3DComponent),
			);
		});
	}

	execute() {
		const assetDatabase = getOnlyEntity(
			this.queries.assetDatabase,
		).getMutableComponent(AssetDatabaseComponent);

		this.queries.trackedObject3Ds.results.forEach((entity) => {
			const meshIdComponent = entity.getMutableComponent(MeshIdComponent);
			meshIdComponent.modelHasChanged = false;

			if (meshIdComponent.needsUpdate) {
				this._updateTrackedObject3D(
					assetDatabase,
					meshIdComponent,
					entity.getMutableComponent(Object3DComponent),
				);
			}

			if (assetDatabase.updatedMeshes?.length) {
				if (assetDatabase.updatedMeshes.indexOf(meshIdComponent.id) >= 0) {
					this._updateTrackedObject3D(
						assetDatabase,
						meshIdComponent,
						entity.getMutableComponent(Object3DComponent),
					);
				}
				assetDatabase.updatedMeshes = [];
			}
		});

		this.queries.trackedObject3Ds.added.forEach((entity) => {
			this._updateTrackedObject3D(
				assetDatabase,
				entity.getMutableComponent(MeshIdComponent),
				entity.getMutableComponent(Object3DComponent),
			);
		});
	}

	_updateTrackedObject3D(assetDatabase, meshIdComponent, object3DComponent) {
		const meshId = meshIdComponent.id;
		const newMesh = assetDatabase.meshes.getMesh(meshId);
		const existingObject = object3DComponent.value;
		copyTransforms(existingObject, newMesh);

		newMesh.visible = existingObject.visible;
		newMesh.userData = existingObject.userData;
		newMesh.matrixAutoUpdate = existingObject.matrixAutoUpdate;
		if (
			['CAMERA', 'SEEDBOX', 'WATERING_CAN'].indexOf(meshId) != -1 ||
			meshId.includes('SEEDBAG')
		) {
			newMesh.traverse((node) => {
				node.castShadow = false;
			});
		}

		object3DComponent.update(newMesh, false);
		meshIdComponent.modelHasChanged = true;
		meshIdComponent.needsUpdate = false;
	}
}

AssetReplacementSystem.queries = {
	assetDatabase: {
		components: [AssetDatabaseComponent],
	},
	trackedObject3Ds: {
		components: [Object3DComponent, MeshIdComponent],
		listen: { added: true },
	},
};
