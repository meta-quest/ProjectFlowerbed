/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

/**
 *
 * @param {THREE.Object3D} object - the object to make a collider mesh out of
 * @returns {THREE.Mesh} - a box mesh representing the collider, with the same origin point as the object
 */
export const createAABBColliderFromObject = (object) => {
	const box3 = new THREE.Box3();
	box3.setFromObject(object);

	// make a BoxBufferGeometry of the same size as Box3
	const dimensions = new THREE.Vector3().subVectors(box3.max, box3.min);
	const boxGeo = new THREE.BoxBufferGeometry(
		dimensions.x,
		dimensions.y,
		dimensions.z,
	);

	// move new mesh center so it's aligned with the original object
	const matrix = new THREE.Matrix4().setPosition(
		dimensions.addVectors(box3.min, box3.max).multiplyScalar(0.5),
	);
	boxGeo.applyMatrix(matrix);

	return new THREE.Mesh(boxGeo);
};

export const setMaterialOnAllMeshes = (object, material) => {
	object.traverse((node) => {
		if (node.isMesh) {
			node.material = material;
		}
	});
};

export const updateMatrixRecursively = (object) => {
	object.traverse((node) => {
		node.updateMatrix();
	});
};

const getObjectLocalPositionToCamera = (object, playerHead) => {
	const objectPosition = object.getWorldPosition(new THREE.Vector3());
	return playerHead.worldToLocal(objectPosition);
};

export const getObjectAngleToCamera = (object, playerHead) => {
	return getObjectLocalPositionToCamera(object, playerHead).angleTo(
		new THREE.Vector3(0, 0, -1),
	);
};

export const isObjectCulled = (object, playerHead, far) => {
	const localPosition = getObjectLocalPositionToCamera(object, playerHead);
	return (
		localPosition.angleTo(new THREE.Vector3(0, 0, -1)) > Math.PI / 4 ||
		localPosition.length() > far
	);
};
