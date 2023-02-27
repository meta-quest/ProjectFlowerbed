/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { Component, Types } from 'ecsy';

export class Object3DComponent extends Component {
	/**
	 * Update the Object3DComponent.value with new Object3D, parenting the new
	 * object under the parent of the old object, and disposing the old object
	 * @param {THREE.Object3D} newObject - new Object3D to replace the old one
	 * @param {boolean} createClone - whether or not to create and use a clone
	 * of the new object, default to true
	 */
	update(newObject, createClone = true) {
		let oldObject = this.value;

		if (oldObject == null) throw 'Object3DComponent.value cannot be null';

		let parent = oldObject.parent;

		if (createClone) {
			newObject = newObject.clone(true);
		}

		this.value = newObject;

		if (parent) {
			parent.add(newObject);
			parent.remove(oldObject);
		}
	}

	serialize() {
		const obj = this.value;
		const serialized = {};
		serialized.position = obj.position.toArray();
		serialized.rotation = obj.rotation.toArray();
		serialized.scale = obj.scale.toArray();
		serialized.visible = obj.visible;
		serialized.userData = obj.userData;

		return serialized;
	}

	deserialize(jsonData) {
		this.value = new THREE.Object3D();
		this.value.position.fromArray(jsonData.position);
		this.value.rotation.fromArray(jsonData.rotation);
		this.value.scale.fromArray(jsonData.scale);
		this.value.visible = jsonData.visible;
		this.value.userData = jsonData.userData;
	}

	afterDeserialize(_entity, scene) {
		scene.add(this.value);
	}
}

Object3DComponent.schema = {
	/**
	 * @type {THREE.Object3D}
	 */
	value: { type: Types.Ref, default: undefined },
};
