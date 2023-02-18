/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
	InstancedMeshComponent,
	InstancedMeshInstanceComponent,
} from '../../components/InstancedMeshComponent';

import { AssetDatabaseComponent } from '../../components/AssetDatabaseComponent';
import { GameStateComponent } from '../../components/GameStateComponent';
import { MeshIdComponent } from '../../components/AssetReplacementComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { getOnlyEntity } from '../../utils/entityUtils';

const ENABLE_INSTANCING = true;

export class MeshInstancingSystem extends System {
	init() {
		this.meshes = {};
	}

	execute(_delta, _time) {
		if (!ENABLE_INSTANCING) {
			return;
		}

		const gameManager = getOnlyEntity(this.queries.gameManager);

		const scene = gameManager.getComponent(THREEGlobalComponent).scene;

		let assetDatabaseComponent = getOnlyEntity(
			this.queries.assetDatabase,
		).getComponent(AssetDatabaseComponent);

		this.queries.meshInstanceInstances.added.forEach((entity) => {
			let meshId = entity.getComponent(MeshIdComponent).id;
			let model = assetDatabaseComponent.meshes.getMesh(meshId);

			if (!this.meshes[meshId]) {
				const meshInstanceEntity = this.world.createEntity();
				meshInstanceEntity.addComponent(InstancedMeshComponent, {
					meshId: meshId,
					baseObject: model,
				});

				let newMesh = meshInstanceEntity.getMutableComponent(
					InstancedMeshComponent,
				);
				newMesh.onInit();

				this.meshes[meshId] = newMesh;

				scene.add(newMesh.mesh);
			}
			this.meshes[meshId].addInstance(entity);

			const obj3D = entity.getMutableComponent(Object3DComponent);
			obj3D.value.oldVisibility = obj3D.value.visible;
			obj3D.value.visible = false;

			entity.getMutableComponent(
				InstancedMeshInstanceComponent,
			).instancedMesh = this.meshes[meshId];
		});

		this.queries.meshInstanceInstances.removed.forEach((entity) => {
			let meshId = entity.getComponent(MeshIdComponent, true).id;
			this.meshes[meshId].removeInstance(entity);

			const obj3D = entity.getMutableComponent(Object3DComponent);
			if (obj3D) {
				obj3D.value.visible = obj3D.value.oldVisibility;
			}
		});

		this.queries.meshInstanceInstances.results.forEach((entity) => {
			let meshId = entity.getComponent(MeshIdComponent).id;
			let instance = entity.getComponent(InstancedMeshInstanceComponent);
			if (instance.needsUpdate || instance.alwaysUpdate) {
				this.meshes[meshId].updateInstance(entity);
			}
		});
	}
}

MeshInstancingSystem.queries = {
	meshInstanceInstances: {
		components: [InstancedMeshInstanceComponent, Object3DComponent],
		listen: { added: true, removed: true },
	},
	gameManager: { components: [THREEGlobalComponent, GameStateComponent] },
	assetDatabase: {
		components: [AssetDatabaseComponent],
	},
};
