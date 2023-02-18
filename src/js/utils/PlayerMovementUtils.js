/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { LOCOMOTION_CONSTANTS } from '../Constants';

/**
 * Computes flat player movement (on the xz plane) from the joystick axes
 * This applies transformations so that when the joystick is tilted forward, the player
 * moves towards the camera
 * @param {number} delta
 * @param {THREE.Group} viewerTransform - reference to the Group used to represent player position and rotation. This is updated by the function call.
 * @param {THREE.Vector3} targetPosition - reference to the Vector3 that the expected movement per frame should be stored in. Will eventually be applied to viewerTransform.position.
 * @param {*} axisX - x axis of the joystick motion. Translates to sideways movement in world space.
 * @param {*} axisY - y axis of the joystick motion. Translates to forwards and back movement in world space.
 * @param {*} camera - camera to base movement off of.
 */
export const updatePlayerPosition = (
	delta,
	targetPosition,
	axisX,
	axisY,
	camera,
) => {
	let matrixElements = camera.matrixWorld.elements;
	let directionY = new THREE.Vector3(
		matrixElements[8],
		0,
		matrixElements[10],
	).normalize();
	let directionX = new THREE.Vector3(directionY.z, 0, -directionY.x);

	const movementDirection = new THREE.Vector3().addVectors(
		directionY.multiplyScalar(axisY),
		directionX.multiplyScalar(axisX),
	);
	const movementSpeed =
		movementDirection.length() * LOCOMOTION_CONSTANTS.MAX_MOVEMENT_SPEED;
	movementDirection.normalize();

	targetPosition.add(movementDirection.multiplyScalar(delta * movementSpeed));
};
