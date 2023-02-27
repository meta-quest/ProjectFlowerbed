/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export const rotateVertical = (vector, angleRadian) => {
	// The cross product with the Y-axis will give a perpendicular axis
	// that can be used to rotate the direction vector vertically.
	const perpendicularAxis = vector.clone().cross(Y_AXIS).negate();
	vector.applyAxisAngle(perpendicularAxis, angleRadian);
};
