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
	StaticColliderResources,
} from '../../components/ColliderComponents';
import {
	EnvironmentProp,
	MainEnvironment,
} from '../../components/GameObjectTagComponents';
import { deleteEntity, getOnlyEntity } from '../../utils/entityUtils';
import {
	setMaterialOnAllMeshes,
	updateMatrixRecursively,
} from '../../utils/object3dUtils';

import { AssetDatabaseComponent } from '../../components/AssetDatabaseComponent';
import { COLLISION_LAYERS } from '../../Constants';
import { CollisionWorld } from '../../lib/collisions/CollisionWorld';
import { GameStateComponent } from '../../components/GameStateComponent';
import { MeshIdComponent } from '../../components/AssetReplacementComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { OptimizedModelComponent } from '../../components/OptimizedModelComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { copyTransforms } from '../../utils/transformUtils';
import { teleportableColliderMaterial } from '../../debug/debugMaterials';

export class CollisionWorldSystem extends System {
	execute() {
		let gameManager = getOnlyEntity(this.queries.gameManager);
		let scene = gameManager.getComponent(THREEGlobalComponent).scene;

		this.queries.environmentObject.removed.forEach(() => {
			this.queries.world.results.forEach((collisionWorld) => {
				deleteEntity(scene, collisionWorld);
			});
		});

		this.queries.environmentObject.added.forEach((mainEnvironmentEntity) => {
			let mainEnvironment;
			if (mainEnvironmentEntity.hasComponent(Object3DComponent)) {
				mainEnvironment = mainEnvironmentEntity.getComponent(Object3DComponent)
					.value;
			} else {
				// this can't be the optimized model because that strips out collision meshes.
				mainEnvironment = mainEnvironmentEntity.getComponent(
					OptimizedModelComponent,
				).model;
			}

			updateMatrixRecursively(mainEnvironment);

			this.createCollisionWorld(mainEnvironment);
		});

		this.queries.colliders.added.forEach((entity) => {
			const collider = entity.getComponent(StaticColliderComponent);

			scene.attach(collider.mesh);

			this.collisionWorld.addStaticObject(collider.mesh, collider.layers);

			// create an additional resource component with the mesh
			// so that we keep a reference to it when we remove the collider.
			entity.addComponent(StaticColliderResources, {
				mesh: collider.mesh,
			});

			// add a link back to the component to the mesh object
			collider.mesh.colliderEntity = entity;
		});

		this.queries.colliders.removed.forEach((entity) => {
			const mesh = entity.getComponent(StaticColliderResources, true)?.mesh;
			if (mesh) {
				this.collisionWorld.removeStaticObject(mesh);

				scene.remove(mesh);

				entity.removeComponent(StaticColliderResources);

				mesh.colliderEntity = undefined;
			}
		});

		this.queries.colliders.results.forEach((entity) => {
			const staticCollider = entity.getMutableComponent(
				StaticColliderComponent,
			);
			if (staticCollider.needsUpdate) {
				staticCollider.needsUpdate = false;

				// remove the existing collider
				const mesh = entity.getComponent(StaticColliderResources).mesh;
				this.collisionWorld.removeStaticObject(mesh);

				// and add it again to the collision world
				this.collisionWorld.addStaticObject(
					staticCollider.mesh,
					staticCollider.layers,
				);

				// update the collider resource
				if (mesh !== staticCollider.mesh) {
					scene.remove(mesh);
					entity.getMutableComponent(StaticColliderResources).mesh =
						staticCollider.mesh;
				}
			}
		});
	}

	createCollisionWorld(mainEnvironment) {
		let assetDatabaseComponent = getOnlyEntity(
			this.queries.assetDatabase,
		).getComponent(AssetDatabaseComponent);

		let gameStateComponent = getOnlyEntity(
			this.queries.gameManager,
		).getComponent(GameStateComponent);

		let environmentColliders = assetDatabaseComponent.meshes.getCollider(
			gameStateComponent.currentBaseMapId,
		);

		// we only need the 'visual' representation of the environment
		// to ensure that the colliders are in the same location as the visual representation.
		copyTransforms(mainEnvironment, environmentColliders);

		const collisionWorldBox = new THREE.Box3();
		collisionWorldBox.setFromObject(environmentColliders);

		let collisionWorldEntity = this.world.createEntity();
		this.collisionWorld = new CollisionWorld(collisionWorldBox);
		collisionWorldEntity.addComponent(CollisionWorldComponent, {
			world: this.collisionWorld,
		});

		let collisionMeshes = [];

		// add all collision meshes
		environmentColliders.traverse((c) => {
			if (c.userData?.collider) {
				collisionMeshes.push(c);
			}
		});

		// add colliders from the linked models in the environment
		// this assumes that every single linked model in the environment
		// should be an obstacle. This assumption may be false later, in which case
		// we'll need to modify this behavior
		this.queries.environmentProps.results.forEach((entity) => {
			const meshId = entity.getComponent(MeshIdComponent).id;
			const collider = assetDatabaseComponent.meshes.getCollider(meshId);
			const object = entity.getComponent(Object3DComponent).value;
			copyTransforms(object, collider);
			if (collider.isMesh) {
				collisionMeshes.push(collider);
			} else {
				// we want to make sure that the objects with the userData are put into
				// the array, not any parent groups that could'be been created in the GLTF
				// export process.
				collisionMeshes.push(...collider.children);
			}
		});

		for (let mesh of collisionMeshes) {
			const colliderObject = this.world.createEntity();
			const objectLayers = [COLLISION_LAYERS.OBSTACLE];

			// add layer and component if it's a teleport surface.
			if (mesh.userData?.teleport) {
				objectLayers.push(COLLISION_LAYERS.TELEPORT_SURFACE);
				setMaterialOnAllMeshes(mesh, teleportableColliderMaterial);
			}

			if (mesh.userData?.plantable) {
				objectLayers.push(COLLISION_LAYERS.PLANTABLE_SURFACE);
			}

			if (mesh.userData?.boundary && !mesh.userData?.outer_boundary) {
				objectLayers.push(COLLISION_LAYERS.BOUNDARY);
			}

			if (mesh.userData?.outer_boundary) {
				objectLayers.push(COLLISION_LAYERS.INVISIBLE);
			}

			colliderObject.addComponent(StaticColliderComponent, {
				mesh: mesh,
				layers: objectLayers,
			});
		}
	}
}

CollisionWorldSystem.queries = {
	gameManager: {
		components: [THREEGlobalComponent, GameStateComponent],
	},
	environmentObject: {
		components: [MainEnvironment],
		listen: { added: true, removed: true },
	},
	environmentProps: {
		components: [EnvironmentProp, Object3DComponent, MeshIdComponent],
	},
	assetDatabase: {
		components: [AssetDatabaseComponent],
	},
	world: {
		components: [CollisionWorldComponent],
	},
	colliders: {
		components: [StaticColliderComponent],
		listen: { added: true, removed: true },
	},
};
