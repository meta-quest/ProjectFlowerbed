/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Similar to the GazeFollowerComponent, except that rather than following the camera, it follows an object instead
 * Since this has been made for UI, all offsets are relative to the viewerTransform direction.
 */

import { Component, Types } from 'ecsy';

export class ObjectFollowerComponent extends Component {}

ObjectFollowerComponent.schema = {
	shouldMoveImmediately: { type: Types.Boolean, default: false },

	/**
	 * @type {THREE.Vector3} positional offset from the target. If there is no target, it's the global position of the object.
	 */
	offset: { type: Types.Ref },

	/**
	 * @type {THREE.Object3D}
	 */
	target: { type: Types.Ref },

	// set to true if you want the object to actively follow the viewerTransform, this makes it so
	// object transforms instantly update when the player moves or snap turns.
	// Note that the actual parenting process needs to happen outside of the ObjectFollowSystem
	isChildOfViewerTransform: { type: Types.Boolean, default: false },

	speed: { type: Types.Number, default: 0 },

	/**
	 * @type {THREE.Vector3} needs to be set to a new THREE.Vector(0, 0, 0) at initialization
	 */
	velocity: { type: Types.Ref, default: null },
};
