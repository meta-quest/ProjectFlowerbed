/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { Component, Types } from 'ecsy';

export class PlayerStateComponent extends Component {}

PlayerStateComponent.schema = {
	// THREE.Group
	/**
	 * @type {THREE.Group} represents the transformation of the player's foot position.
	 */
	viewerTransform: { type: Types.Ref, default: undefined },

	/**
	 * @type {THREE.Group} represents the transformation of the player's head position.
	 */
	playerHead: { type: Types.Ref, default: undefined },

	/**
	 * @type {THREE.Vector3} note that this is used by the PlayerPhysicsSystem to determine the *desired* movement,
	 * and is reset to 0 there.
	 */
	expectedMovement: { type: Types.Ref },

	didJustTeleport: { type: Types.Boolean, default: false },
	didMove: { type: Types.Boolean, default: false },

	/**
	 * @type {THREE.Vector3}
	 * only set on a frame if didMove is true
	 * Can be used to determine how far or fast the player actually moved.
	 */
	deltaMovement: { type: Types.Ref, default: undefined },
};

/**
 * Helper function used to initialize the player
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @returns {THREE.Group} the viewerTransform object that should be added to the PlayerStateComponent
 */
export const createPlayerTransform = (scene, camera) => {
	const viewerTransform = new THREE.Group();
	viewerTransform.add(camera);
	viewerTransform.matrixAutoUpdate = true;
	scene.add(viewerTransform);
	return viewerTransform;
};

/**
 * Collision data specifically for the player. Used to hold persistent
 * data for player physics calculations.
 */
export class PlayerColliderComponent extends Component {}

PlayerColliderComponent.schema = {
	isGrounded: { type: Types.Boolean, default: false },
	/**
	 * @type {THREE.Vector3}
	 */
	velocity: { type: Types.Ref },

	hasHitSlope: { type: Types.Boolean, default: false },

	/**
	 * @type {THREE.Vector3}
	 */
	lastSlopeNormal: { type: Types.Ref },
};
