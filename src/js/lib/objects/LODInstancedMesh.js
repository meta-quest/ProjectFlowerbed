/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _mat1 = new THREE.Matrix4();

export class LODInstancedMesh extends THREE.LOD {
	constructor() {
		super();

		this.instanceCount = 0;
		this.nextId = 0;
		this.idToInstanceInfo = new Map();
		this.meshes = [];
		this.distances = [];

		// all our children need to be ManagedInstancedMeshes
	}

	addLOD(mesh, distance) {
		this.meshes.push(mesh);
		this.add(mesh);
		// this.levels.push({distance:distance});
		this.distances.push(distance);
	}

	addInstance() {
		const newId = this.nextId;

		// just assume this value isn't going to wrap around
		this.nextId += 1;

		const initialLOD = 0;
		this.idToInstanceInfo.set(newId, [
			initialLOD,
			this.meshes[initialLOD].addInstance(),
		]);

		this.instanceCount += 1;

		return newId;
	}

	updateInstance(id, newValues) {
		const instanceInfo = this.idToInstanceInfo.get(id);

		this.meshes[instanceInfo[0]].updateInstance(instanceInfo[1], newValues);
	}

	removeInstance(id) {
		const instanceInfo = this.idToInstanceInfo.get(id);

		this.instanceCount -= 1;

		this.meshes[instanceInfo[0]].removeInstance(instanceInfo[1]);

		this.idToInstanceInfo.delete(id);
	}

	update(camera) {
		_v1.setFromMatrixPosition(camera.matrixWorld);
		// so, to avoid repeatedly culling stuff, we keep instanceCount for each LODs to the max for that LOD
		// in order to do this we go through each level, check the LOD of each instance,
		// move the instances that need their LOD shifted
		// and finally update the instance
		this.idToInstanceInfo.forEach((instanceInfo, id, _map) => {
			let instanceMesh = this.meshes[instanceInfo[0]];

			instanceMesh.getMatrixAt(
				instanceMesh.idToInstanceIdx.get(instanceInfo[1]),
				_mat1,
			);

			_v2.setFromMatrixPosition(_mat1);

			const distance = _v1.distanceTo(_v2) / camera.zoom;

			let targetLOD = 0;
			let i, l;

			for (i = 1, l = this.distances.length; i < l; i++) {
				if (distance >= this.distances[i]) {
					targetLOD = i;
				} else {
					break;
				}
			}

			if (targetLOD != instanceInfo[0]) {
				// swap this mesh to the new LOD
				let targetId = this.meshes[targetLOD].addInstance();
				this.meshes[targetLOD].copyInstance(
					targetId,
					instanceMesh,
					instanceInfo[1],
				);
				instanceMesh.removeInstance(instanceInfo[1]);
				this.idToInstanceInfo.set(id, [targetLOD, targetId]);
			}
		});
	}
}
