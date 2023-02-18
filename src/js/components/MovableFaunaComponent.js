/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class MovableFaunaComponent extends Component {}

MovableFaunaComponent.schema = {
	/**
	 * @type {THREE.Vector3} normalized direction vector
	 */
	direction: { type: Types.Ref },

	// Distance traveled per time period along the direction vector
	speed: { type: Types.Number },

	// A time offset so that faunas in the same cluster don't behave the same
	verticalVariationOffset: { type: Types.Number, default: 0 },
	horizontalVariationOffset: { type: Types.Number, default: 0 },
};
