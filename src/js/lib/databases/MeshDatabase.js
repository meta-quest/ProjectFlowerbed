/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';

import { LODConfigs, LOD_FILENAME_SUFFIX } from '../../LODConfigs';
import {
	setMaterialOnAllMeshes,
	updateMatrixRecursively,
} from '../../utils/object3dUtils';

import { AssetURLs } from '@config/AssetURLs';
import { CompressedGLTFLoader } from '../CompressedGLTFLoader';
import { DEBUG_CONSTANTS } from '../../Constants';
import { LODWithHysteresis } from '../objects/LODWithHysteresis';
import { basicColliderMaterial } from '../../debug/debugMaterials';

export class MeshDatabase {
	/**
	 * @param {THREE.Renderer} renderer the renderer that this mesh database is attached to. Required to parse compressed textures and GLTFs.
	 * @param {THREE.LoadingManager} manager optional loading manager
	 */
	constructor(renderer, manager) {
		this.loadingManager = manager ?? new THREE.LoadingManager();
		this.gltfLoader = new CompressedGLTFLoader(renderer, this.loadingManager);
		this.meshes = {};
		this.colliders = {};
		this.lods = {};
		this.materialOverride = null;
		this.colliderMaterial = basicColliderMaterial;
	}

	/**
	 * Sets the material override
	 * @param {Ref} materialOverride
	 */
	setMaterialOverride(materialOverride) {
		this.materialOverride = materialOverride;
		const self = this;
		if (this.materialOverride) {
			for (const mesh of Object.values(this.meshes)) {
				mesh.traverse(function (node) {
					self.materialOverride(node);
				});
			}

			for (const lod of Object.values(this.lods)) {
				const levels = lod.levels;

				// we start with 1 because the 0th level is the base mesh
				// which is handled above
				for (let i = 1, l = levels.length; i < l; i++) {
					const mesh = levels[i].object;
					mesh.traverse(function (node) {
						self.materialOverride(node);
					});
				}
			}
		}
	}

	/**
	 *
	 * @param {string} meshId - the id to save the mesh under
	 * @param {*} meshURLs any number of URLs that the mesh will be attempted to load from; it goes in order
	 * and stops once one is successfully found.
	 * @returns
	 */
	async load(meshId, ...meshURLs) {
		for (let meshURL of meshURLs) {
			try {
				const gltf = await this.gltfLoader.loadAsync(meshURL);
				const object = await this._processObject(
					meshId,
					gltf.scene,
					gltf.animations,
				);

				const lodConfig = LODConfigs[meshId];

				if (lodConfig) {
					const baseLOD = new LODWithHysteresis();
					// add the base mesh level
					baseLOD.addLevel(object, 0);
					for (let i = 0; i < lodConfig.distance.length; i++) {
						const lodURL = meshURL.replace(
							'.gltf',
							`${LOD_FILENAME_SUFFIX}${i}.gltf`,
						);
						const lodGLTF = await this.gltfLoader.loadAsync(lodURL);
						const lodScene = lodGLTF.scene;

						// LODS also need to cast shadow.
						lodScene.traverse((node) => {
							if (!node.isMesh) {
								return;
							}
							node.castShadow = true;
							node.receiveShadow = true;
						});
						baseLOD.addLevel(lodScene, lodConfig.distance[i]);
					}
					this.lods[meshId] = baseLOD;
				}

				return object;
			} catch (e) {
				continue;
			}
		}
		return undefined;
	}

	/**
	 * Retrieves a mesh from the database via id
	 * @param {string} meshId
	 * @returns
	 */
	getMesh(meshId) {
		if (!this.meshes[meshId]) {
			console.warn(
				`Trying to retrieve mesh with id ${meshId} that wasn't loaded.`,
			);
			return undefined;
		}

		// LODs cannot support animations right now.
		if (this.lods[meshId]) {
			const cloneLODObject = this.lods[meshId].clone();
			return cloneLODObject;
		}

		// returns a copy of the mesh; we typically do not want to modify the original
		const cloneObj = SkeletonUtils.clone(this.meshes[meshId]);
		cloneObj.animations = this.meshes[meshId].animations;
		return cloneObj;
	}

	getCollider(meshId) {
		if (!this.colliders[meshId]) {
			// create an AABB collider that works for now.
			console.warn(
				`Retrieving collider for mesh with id ${meshId} that didn't have a collider. Generating default collider...`,
			);
			if (this.meshes[meshId]) {
				/*
				// Use this version to make AABB boxes for all the unset meshes

				const generatedCollider = createAABBColliderFromObject(
					this.meshes[meshId],
				);
				*/

				// This just copies the mesh to use as the collider.
				const generatedCollider = this.meshes[meshId].clone();

				setMaterialOnAllMeshes(generatedCollider, this.colliderMaterial);
				generatedCollider.traverse((node) => {
					if (node.isMesh) {
						node.castShadow = false;
						node.receiveShadow = false;
						node.visible = DEBUG_CONSTANTS.SHOW_STATIC_COLLIDERS;
					}
				});
				generatedCollider.visible = DEBUG_CONSTANTS.SHOW_STATIC_COLLIDERS;
				this.colliders[meshId] = generatedCollider;
				return generatedCollider.clone();
			}
			return undefined;
		}

		return this.colliders[meshId].clone();
	}

	async _processObject(meshId, object, animations) {
		object.animations = animations;

		let possibleLinkedNodes = [];
		object.traverse((node) => {
			// check if this is a linked object from a different file
			// linked objects have `gltf` somewhere in the name
			if (node.name.includes('gltf') && !node.userData?.collider) {
				possibleLinkedNodes.push(node);
			}
		});

		for (let node of possibleLinkedNodes) {
			const expectedFilename = node.name.split('gltf')[0];
			if (this.meshes[expectedFilename]) {
				// replace the node with the version in the new file
				node.userData.link = expectedFilename;
				continue;
			}

			let filenamesToTry = [];
			for (let dir of AssetURLs.ADDITIONAL_MESH_DIRS) {
				filenamesToTry.push(`${dir}${expectedFilename}.gltf`);
			}
			const linkedGLTF = await this.load(expectedFilename, ...filenamesToTry);

			// if it's linked, we call this object a linked object and
			// add the newly linked object to the database as well.
			if (linkedGLTF) {
				// we can use the link later to replace the object
				node.userData.link = expectedFilename;
			}
		}

		let baseColliderObject = undefined;
		let colliderMeshes = [];

		updateMatrixRecursively(object);

		object.traverse((node) => {
			if (node.userData?.collider) {
				colliderMeshes.push(node);
				node.traverse((subnode) => {
					// mark the subnode as collider so we don't try to do any
					// other processing on it (e.g. colliders should not cast shadows)
					subnode.is_collider = true;
				});
				return;
			}

			if (node.isMesh && !node.is_collider) {
				if (this.materialOverride) {
					this.materialOverride(node);
				}

				// add shadow casting to all the meshes of the objects
				// in the database (that aren't colliders)
				node.castShadow = true;
				node.receiveShadow = true;
			}
		});

		// remove colliders from the visual mesh
		for (let node of colliderMeshes) {
			if (!baseColliderObject) {
				baseColliderObject = new THREE.Object3D();
			}
			baseColliderObject.attach(node);
			node.traverse((subnode) => {
				if (subnode.isMesh) {
					subnode.material = this.colliderMaterial;
					subnode.visible = DEBUG_CONSTANTS.SHOW_STATIC_COLLIDERS;
				}
			});
		}

		this.meshes[meshId] = object;
		if (baseColliderObject) {
			this.colliders[meshId] = baseColliderObject;
		}

		return object;
	}
}
