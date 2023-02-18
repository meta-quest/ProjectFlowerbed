/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { updateMatrixRecursively } from './object3dUtils';

/**
 * Resets a mesh's transform to be at position (0,0,0), no rotation, and a scale of 1 without changing
 * its current position or transform
 * @param {THREE.Mesh} mesh
 */
export const applyAllTransforms = (mesh) => {
	mesh.updateMatrix();

	mesh.geometry.applyMatrix4(mesh.matrix);

	mesh.position.set(0, 0, 0);
	mesh.rotation.set(0, 0, 0);
	mesh.scale.set(1, 1, 1);

	updateMatrixRecursively(mesh);
};

export const copyTransforms = (sourceObject, destObject) => {
	sourceObject.updateMatrix();
	destObject.position.copy(sourceObject.position);
	destObject.rotation.copy(sourceObject.rotation);
	destObject.scale.copy(sourceObject.scale);

	updateMatrixRecursively(destObject);
};
