/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class SkeletonAnimationComponent extends Component {}

SkeletonAnimationComponent.schema = {
	/**
	 * @type {THREE.AnimationMixer}
	 */
	animationMixer: { type: Types.Ref },

	/**
	 * @type {{name: string, loop: THREE.Loop* }} idle animations to use
	 */
	idleAnimations: { type: Types.Array },
	animationActions: { type: Types.Array },

	// Index of the THREE.AnimationAction currently being played
	currentAnimationActionIndex: { type: Types.Number, default: -1 },

	// Timer to determine when to switch the idle animation
	idleAnimationSwitchTimer: { type: Types.Number },

	/**
	 * @type {{name: string, loop: THREE.Loop* }} animations to use when the player is close by.
	 */
	engagedAnimations: { type: Types.Array },

	// Index of the THREE.AnimationAction currently being played when player is
	// close by. Value is -1 if player is not close by.
	currentEngagedAnimationIndex: { type: Types.Number, default: -1 },

	/**
	 * @type {THREE.AnimationAction} action of the engaged animation currently being played, if any
	 */
	engagedAnimationAction: { type: Types.Ref },
};
