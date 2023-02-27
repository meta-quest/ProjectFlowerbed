/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class StationaryFaunaComponent extends Component {}

StationaryFaunaComponent.schema = {
	// Whether player has come close to this fauna before
	playerBeenCloseBy: { type: Types.Boolean, default: false },

	/**
	 * @type {THREE.Vector3[]} list of locations where the fauna can appear at
	 */
	spawnLocations: { type: Types.Ref },
};
