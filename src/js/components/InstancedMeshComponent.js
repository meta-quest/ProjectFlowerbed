/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { Component, Types } from 'ecsy';

import { LODInstancedMesh } from '../lib/objects/LODInstancedMesh.js';
import { ManagedInstancedMesh } from '../lib/objects/ManagedInstancedMesh.js';
import { Object3DComponent } from './Object3DComponent';
import { PlantedComponent } from './PlantingComponents';
import { serializeComponentDefault } from './SaveDataComponents.js';

export class InstancedMeshComponent extends Component {
	_initMesh(threeObj) {
		let threeMesh = null;
		// gotta find the ACTUAL mesh
		threeObj.traverse(function (node) {
			if (node instanceof THREE.Mesh) {
				if (threeMesh) {
					console.error(
						`Attempting to instance a model with multiple meshes (${this.meshId})`,
					);
				}
				threeMesh = node;
			}
		});
		threeMesh.updateMatrix();

		const miMesh = new ManagedInstancedMesh(
			threeMesh.geometry,
			threeMesh.material,
			this.maxCount,
			threeMesh.matrix,
		);

		miMesh.name = 'InstancedMesh: ' + this.meshId;
		miMesh.castShadow = true;
		miMesh.receiveShadow = true;

		if (threeMesh.material.boneScaleAnimated) {
			// workaround:  the InstancedUniformsMesh allocates the buffer to mesh.count size, which is incorrect
			// (it should be max count, which is not accessible, or simply the same size as the instanceMatrix buffer

			miMesh.setUniformAt(
				'boneScales',
				0,
				new THREE.Vector4(1.0, 1.0, 1.0, 1.0),
			);
		} else if (threeMesh.material.morphTargetEnabled) {
			miMesh.morphTargetDictionary = threeMesh.morphTargetDictionary;
			miMesh.morphTargetInfluences = threeMesh.morphTargetInfluences;

			miMesh.setUniformAt('influences', 0, new THREE.Vector4(0, 0, 0, 0));
		}

		miMesh.setUniformAt('emissive', 0, new THREE.Color().set(0x000000));
		miMesh.setUniformAt('emissiveIntensity', 0, 1);

		// number of meshes submitted for this instance (this will change with culling)
		miMesh.count = 0;

		return miMesh;
	}

	onInit() {
		if (this.baseObject.type === 'LOD') {
			this.mesh = new LODInstancedMesh();
			for (let i = 0; i < this.baseObject.levels.length; i++) {
				const lodObj = this.baseObject.levels[i].object;
				let newMIM = this._initMesh(lodObj);
				this.mesh.addLOD(newMIM, this.baseObject.levels[i].distance);
			}
		} else {
			this.mesh = this._initMesh(this.baseObject);
		}

		this.tempInstanceMatrix = new THREE.Matrix4();
		this.tempVector4 = new THREE.Vector4();
	}

	addInstance(entity) {
		const instance = entity.getMutableComponent(InstancedMeshInstanceComponent);

		instance.instanceId = this.mesh.addInstance();

		this.updateInstance(entity);
	}

	removeInstance(entity) {
		const instance = entity.getComponent(InstancedMeshInstanceComponent, true);

		this.mesh.removeInstance(instance.instanceId);
	}

	updateInstance(entity) {
		const instance = entity.getMutableComponent(InstancedMeshInstanceComponent);
		const obj = entity.getMutableComponent(Object3DComponent);

		let updatedValues = {};

		obj.value.updateMatrix();
		obj.value.updateMatrixWorld(true);
		this.tempInstanceMatrix.copy(obj.value.matrixWorld);

		updatedValues.matrix = this.tempInstanceMatrix;

		if (this.mesh.material && this.mesh.material.boneScaleAnimated) {
			if (entity.hasComponent(PlantedComponent)) {
				const plantComponent = entity.getComponent(PlantedComponent);

				this.tempVector4.set(
					plantComponent.segmentScales.x - 1,
					plantComponent.segmentScales.y - 1,
					plantComponent.segmentScales.z - 1,
					plantComponent.segmentScales.w - 1,
				);
			} else {
				this.tempVector4.set(0, 0, 0, 0);
			}

			updatedValues.boneScales = this.tempVector4;
		}

		this.mesh.updateInstance(instance.instanceId, updatedValues);
		instance.needsUpdate = false;
	}
}

InstancedMeshComponent.schema = {
	meshId: { type: Types.String },
	baseObject: { type: Types.Ref },
	mesh: { type: Types.Ref, default: null },
	idToInstanceIdx: { type: Types.Ref, default: null },
	instanceIdxToEntity: { type: Types.Ref, default: null },
	maxCount: { type: Types.Number, default: 1024 },
	needsUpdate: { type: Types.Boolean, default: false },
	nextId: { type: Types.Number, default: 1 },
};

export class InstancedMeshInstanceComponent extends Component {
	serialize() {
		// true to suppress warnings
		return serializeComponentDefault(this, true);
	}
}

InstancedMeshInstanceComponent.schema = {
	meshId: { type: Types.String },
	instancedMesh: { type: Types.Ref, default: null },
	needsUpdate: { type: Types.Boolean, default: true },
	instanceId: { type: Types.Number, default: null },
};
