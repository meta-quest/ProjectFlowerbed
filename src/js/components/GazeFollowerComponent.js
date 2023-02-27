/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class GazeFollowerComponent extends Component {}

GazeFollowerComponent.schema = {
	shouldMoveImmediately: { type: Types.Boolean, default: false },
	yOffset: { type: Types.Number, default: 0 },
	radius: { type: Types.Number, default: 1 },
	speed: { type: Types.Number, default: 0 },

	/**
	 * @type {THREE.Vector3}
	 */
	velocity: { type: Types.Ref, default: null },
};
