/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { ManagedInstancedMesh } from '../../lib/objects/ManagedInstancedMesh.js';
import { OptimizedModelComponent } from '../../components/OptimizedModelComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { updateMatrixRecursively } from '../../utils/object3dUtils';

// This system needs to be run _before_ we generate any collider objects
// so that any collision system will have the populated instancedMesh fields to work with
export class ModelOptimizeSystem extends System {
	init() {
		this.queries.gameManager.results.forEach((entity) => {
			let threeglobal = entity.getComponent(THREEGlobalComponent);
			this.scene = threeglobal.scene;
		});
		this.queries.meshes.results.forEach((entity) => {
			this.createOptimizedModel(entity);
		});
	}

	execute() {
		this.queries.meshes.added.forEach((entity) => {
			this.createOptimizedModel(entity);
		});
	}

	createOptimizedModel(entity) {
		const optimizedModelComponent = entity.getMutableComponent(
			OptimizedModelComponent,
		);
		if (optimizedModelComponent.optimizedModel) {
			// we already created the optimized model.
			return;
		}

		const model = optimizedModelComponent.model;

		optimizedModelComponent.instancedMeshes = createInstancedMeshesMap(model);
		const optimizedModel = optimize(
			model,
			optimizedModelComponent.instancedMeshes,
			optimizedModelComponent.shadowCastingObjects,
			optimizedModelComponent.materialOverride,
		);

		optimizedModelComponent.optimizedModel = optimizedModel;

		optimizedModel.position.set(
			model.position.x,
			model.position.y,
			model.position.z,
		);

		optimizedModel.rotation.set(
			model.rotation.x,
			model.rotation.y,
			model.rotation.z,
		);

		this.scene.add(optimizedModel);
		updateMatrixRecursively(optimizedModel);
		this.scene.updateMatrixWorld(true);
	}
}

ModelOptimizeSystem.queries = {
	meshes: {
		components: [OptimizedModelComponent],
		listen: {
			added: true,
			removed: false,
		},
	},

	gameManager: {
		components: [THREEGlobalComponent],
	},
};

/**
 * Traverses a list of nodes in a model and creates an empty map of all the possible instanced meshes,
 * which will be populated when the model is optimized
 * @param {*} model
 * @returns {Object}
 */
const createInstancedMeshesMap = (model) => {
	let objects = {};
	let total = 0;
	const nodes = [];
	model.traverse(function (node) {
		// this is a hack to make sure that the boundary regions for fauna don't get instanced
		// because they rely on the node existing as a regular Mesh to operate.
		if (node.parent?.name && node.parent.name.includes('Region')) {
			return;
		}
		if (node.isMesh && node.visible) nodes.push(node);
	});
	for (let node of nodes) {
		total += 1;
		// The instanced objects are named in the format of <instName>__xxx
		let instName = node.name.split('__')[0];
		if (objects[instName]) {
			objects[instName] += 1;
		} else {
			objects[instName] = 1;
		}
	}
	let instancedMeshes = {};
	for (let instName in objects) {
		if (objects[instName] > 1) {
			instancedMeshes[instName] = {
				mesh: null,
				cur_idx: 0,
				count: objects[instName],
			};
		}
	}
	let numUniqueObjects =
		Object.keys(objects).length - Object.keys(instancedMeshes).length;
	let numInstancedObjects = Object.keys(instancedMeshes).length;
	let numInstancedCopies = total - numUniqueObjects;
	console.log(
		'[Model Optimization] ' +
			total +
			' total objects: ' +
			numUniqueObjects +
			' unique objects and ' +
			numInstancedCopies +
			' instances of ' +
			numInstancedObjects +
			' instanced objects',
	);
	return instancedMeshes;
};

/**
 * Takes a model and a pre-created instanceMeshesMap and produces an optimized model that uses instanced meshes to render.
 * The instanceMeshesMap is modified, and can be further processed to produce collision meshes
 * @param {*} model
 * @param {Object} instancedMeshesMap the result of createInstancedMeshesMap; the map will be populated with the results of the optimize.
 * @param {Object3D[]} shadowCastingObjects
 * @param {Ref} materialOverride
 * @returns {THREE.Group} an optimized model that can now be added to the scene.
 */
const optimize = (
	model,
	instancedMeshesMap = {},
	shadowCastingObjects = [],
	materialOverride = null,
) => {
	// remove shadows from all nodes to start
	model.traverse((node) => {
		node.castShadow = false;
		node.receiveShadow = true;
	});
	updateMatrixRecursively(model);

	let layeredTraversal = function (node, new_parent) {
		// filter out collision objects
		if (node.userData?.collider) {
			return;
		}

		if (materialOverride) {
			materialOverride(node);
		}

		for (let name_regex of shadowCastingObjects) {
			if (node.name.match(name_regex)) {
				node.castShadow = true;

				// add shadows to any submeshes too
				node.traverse((c) => {
					if (c.isMesh) {
						c.castShadow = true;
					}
				});
				break;
			}
		}

		let instName = node.name.split('__')[0];
		let instMesh = instancedMeshesMap[instName];
		if (instMesh) {
			// create an InstancedMesh (and process geometry) if there are no meshes yet
			// that match the name we preprocessed
			if (instMesh.cur_idx == 0) {
				let mesh = new ManagedInstancedMesh(
					node.geometry,
					node.material,
					instMesh.count,
				);
				mesh.name = 'InstancedMesh: ' + instName;
				mesh.castShadow = node.castShadow;
				mesh.receiveShadow = node.receiveShadow;
				instMesh.mesh = mesh;
				instancedMeshesMap[instName] = instMesh;
			}
			node.updateWorldMatrix(true, true);
			const instanceId = instMesh.mesh.addInstance();
			instMesh.mesh.updateInstance(instanceId, { matrix: node.matrixWorld });
		} else {
			new_parent.add(node);
		}

		let old_children = [...node.children];
		node.children = [];

		old_children.forEach((child) => {
			layeredTraversal(child, node);
		});
	};

	let output = new THREE.Group();
	layeredTraversal(model, output);

	for (let instName in instancedMeshesMap) {
		let item = instancedMeshesMap[instName];

		item.mesh.isCollider = false;

		output.add(item.mesh);
		item.mesh.instanceMatrix.needsUpdate = true;
		item.mesh.count = item.count;
	}

	return output;
};
