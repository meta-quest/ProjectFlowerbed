/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class SelectionWheelComponent extends Component {}

export const WHEEL_STATE = {
	RETRACTED: 0,
	DEPLOYED: 1,
	RETRACTING: 2,
	DEPLOYING: 3,
};

SelectionWheelComponent.schema = {
	/**
	 * @type {THREE.Object3D[]}
	 */
	wheelTiles: { type: Types.Array, default: [] },
	/**
	 * @type {THREE.Object3D}
	 */
	focusedTile: { type: Types.Ref },

	state: { type: Types.Number, default: WHEEL_STATE.RETRACTED },
	transitionTimer: { type: Types.Number, default: 0 },
};
