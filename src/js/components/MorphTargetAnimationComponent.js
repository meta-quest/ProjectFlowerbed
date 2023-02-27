/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, TagComponent, Types } from 'ecsy';

export class MorphTargetAnimationComponent extends Component {}

MorphTargetAnimationComponent.schema = {
	/**
	 * @type {{name: string, duration: number, maxInfluence: number}[]}
	 * represents the morph target to animate
	 */
	morphTargetSequence: { type: Types.Array },

	// The current morph target index to use
	morphTargetSequenceIndex: { type: Types.Number, default: 0 },

	// The amount of time elapsed for the current morph target animation
	morphTargetAnimationOffset: { type: Types.Number, default: 0 },
	/**
	 * @type {THREE.Mesh} where the morph targets are located
	 */
	morphTargetMesh: { type: Types.Ref },
};

export class MorphTargetMeshInitialized extends TagComponent {}
