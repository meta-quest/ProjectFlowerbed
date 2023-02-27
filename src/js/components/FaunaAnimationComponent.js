/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class FaunaAnimationComponent extends Component {}

FaunaAnimationComponent.schema = {
	/**
	 * @type {{animId: string, duration: number, maxInfluence: number}[]}
	 */
	selfAlternatingAnimations: { type: Types.Array, default: null },
	/**
	 * @type {number[]}
	 */
	selfAlternatingAnimationTimers: { type: Types.Array, default: null },
	/**
	 * @type {{animId: string, duration: number, maxInfluence: number}[]}
	 */
	synchronizedAnimationSequence: { type: Types.Array, default: null },
	animationSequenceTimer: { type: Types.Number, default: 0 },
	animationSequenceCurrentIdx: { type: Types.String, default: 0 },
};
