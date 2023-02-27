/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { Component, Types } from 'ecsy';

import { Object3DComponent } from './Object3DComponent';

export class MeshIdComponent extends Component {
	/**
	 * Switches the mesh on the attached Object3DComponent to a new one, fetched from the MeshDatabase
	 * @param {string} newMeshId
	 */
	update(newMeshId) {
		this.id = newMeshId;
		this.needsUpdate = true;
	}
}

MeshIdComponent.schema = {
	id: { type: Types.String },
	needsUpdate: { type: Types.Boolean, default: true }, // set when the mesh id is changed so that the system knows to swap out the new model.
	modelHasChanged: { type: Types.Boolean, default: false }, // can query this to determine if the model is finished loading
};

/**
 * create replaceable mesh from mesh ID for an entity
 * @param {import('ecsy').Entity} entity
 * @param {string} meshId
 * @returns {THREE.Object3D}
 */
export const createReplaceableMesh = (entity, meshId) => {
	const placeholderObject = new THREE.Object3D();
	entity.addComponent(Object3DComponent, { value: placeholderObject });
	entity.addComponent(MeshIdComponent, { id: meshId });
	return placeholderObject;
};
