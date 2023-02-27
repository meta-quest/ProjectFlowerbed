/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { InstancedUniformsMesh } from 'three-instanced-uniforms-mesh';

export class ManagedInstancedMesh extends InstancedUniformsMesh {
	constructor(geometry, material, count, baseTransform) {
		super(geometry, material, count);

		this.isManagedInstancedMesh = true;
		this.baseTransform = baseTransform || null;

		this.maxCount = count;
		this.instanceCount = 0;
		this.nextId = 0;

		this.frustumCullInstances = true;

		this.idToInstanceIdx = new Map();
		this.instanceIdxToId = new Map();

		this._projScreenMatrix = new THREE.Matrix4();
		this._frustum = new THREE.Frustum();

		this.tempInstanceMatrix = new THREE.Matrix4();
		this.tempInstanceMatrix2 = new THREE.Matrix4();
		this.tempVector4 = new THREE.Vector4();
		this.tempVector42 = new THREE.Vector4();
		this.tempVector3 = new THREE.Vector3();
		this.tempSphere = new THREE.Sphere();
	}

	addInstance() {
		const newId = this.nextId;

		// just assume this value isn't going to wrap around
		this.nextId += 1;

		this.idToInstanceIdx.set(newId, this.instanceCount);
		this.instanceIdxToId.set(this.instanceCount, newId);

		this.instanceCount += 1;

		return newId;
	}

	updateInstance(id, newValues) {
		const instanceIdx = this.idToInstanceIdx.get(id);

		for (const k in newValues) {
			if (k == 'matrix') {
				if (this.baseTransform) {
					// gotta include the mesh transform in the instance. :/
					// would be cool if we could ensure our meshes that were instanced had identity transforms
					newValues[k].multiply(this.baseTransform);
				}

				this.setMatrixAt(instanceIdx, newValues[k]);
				this.instanceMatrix.needsUpdate = true;
			} else if (k === 'color') {
				this.setColorAt(instanceIdx, newValues[k]);
				this.instanceColor.needsUpdate = true;
			} else {
				this.setUniformAt(k, instanceIdx, newValues[k]);
			}
		}
	}

	_copyValues(targetArray, targetIdx, sourceArray, sourceIdx, num) {
		const first = targetIdx * num;
		const second = sourceIdx * num;

		for (let i = 0; i < num; i++) {
			targetArray[first + i] = sourceArray[second + i];
		}
	}

	copyInstance(id, otherMesh, otherId) {
		const instanceIdx = this.idToInstanceIdx.get(id);
		const sourceIdx = otherMesh.idToInstanceIdx.get(otherId);

		this._copyValues(
			this.instanceMatrix.array,
			instanceIdx,
			otherMesh.instanceMatrix.array,
			sourceIdx,
			this.instanceMatrix.itemSize,
		);
		this.instanceMatrix.needsUpdate = true;

		if (this.instanceColor) {
			this._copyValues(
				this.instanceColor.array,
				instanceIdx,
				otherMesh.instanceColor.array,
				sourceIdx,
				this.instanceColor.itemSize,
			);
			this.instanceColor.needsUpdate = true;
		}

		for (const attrName in this.geometry.attributes) {
			const attr = this.geometry.attributes[attrName];
			if (attr.meshPerAttribute === 1) {
				this._copyValues(
					attr.array,
					instanceIdx,
					otherMesh.geometry.attributes[attrName].array,
					sourceIdx,
					attr.itemSize,
				);
				attr.needsUpdate = true;
			}
		}
	}

	removeInstance(id) {
		const instanceIdx = this.idToInstanceIdx.get(id);

		this.instanceCount -= 1;

		if (this.instanceCount > 0 && instanceIdx != this.instanceCount) {
			// swap the last instance in the array with the current one
			this._swapInstances(instanceIdx, this.instanceCount);
		}

		this.idToInstanceIdx.delete(id);
	}

	_swapValues(array, firstIdx, secondIdx, num) {
		const first = firstIdx * num;
		const second = secondIdx * num;

		let tmp;
		for (let i = 0; i < num; i++) {
			tmp = array[first + i];
			array[first + i] = array[second + i];
			array[second + i] = tmp;
		}
	}

	_swapInstances(firstIdx, secondIdx) {
		const firstId = this.instanceIdxToId.get(firstIdx);
		const secondId = this.instanceIdxToId.get(secondIdx);

		this._swapValues(
			this.instanceMatrix.array,
			firstIdx,
			secondIdx,
			this.instanceMatrix.itemSize,
		);
		this.instanceMatrix.needsUpdate = true;

		if (this.instanceColor) {
			this._swapValues(
				this.instanceColor.array,
				firstIdx,
				secondIdx,
				this.instanceColor.itemSize,
			);
			this.instanceColor.needsUpdate = true;
		}

		for (const attrName in this.geometry.attributes) {
			const attr = this.geometry.attributes[attrName];
			if (attr.meshPerAttribute === 1) {
				this._swapValues(attr.array, firstIdx, secondIdx, attr.itemSize);
				attr.needsUpdate = true;
			}
		}

		// swap the id references
		this.idToInstanceIdx.set(secondId, firstIdx);
		this.instanceIdxToId.set(firstIdx, secondId);

		this.idToInstanceIdx.set(firstId, secondIdx);
		this.instanceIdxToId.set(secondIdx, firstId);
	}

	_cull(frustum) {
		const c = this.instanceCount;
		let passingCount = 0;
		let tail = c - 1;
		const _tmpMatrix = this.tempInstanceMatrix;
		const _tmpMatrix2 = this.tempInstanceMatrix2;

		const geometry = this.geometry;

		if (geometry.boundingSphere === null) geometry.computeBoundingSphere();

		for (let i = 0; i <= tail; i++) {
			this.getMatrixAt(i, _tmpMatrix);

			this.tempSphere.copy(geometry.boundingSphere).applyMatrix4(_tmpMatrix);
			if (frustum.intersectsSphere(this.tempSphere)) {
				passingCount += 1;
			} else {
				// instance at "i" is not rendering, so find the next in-frustum instance from the end "tail" and swap them.
				while (tail > i) {
					this.getMatrixAt(tail, _tmpMatrix2);

					this.tempSphere
						.copy(geometry.boundingSphere)
						.applyMatrix4(_tmpMatrix2);
					if (frustum.intersectsSphere(this.tempSphere)) {
						this._swapInstances(i, tail);

						passingCount += 1;
						tail -= 1;
						break;
					}
					tail -= 1;
				}
			}
		}

		this.count = passingCount;
	}
}
