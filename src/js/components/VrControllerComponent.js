/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class VrControllerComponent extends Component {}

VrControllerComponent.schema = {
	/**
	 * @type {string} - 'left' or 'right'
	 */
	handedness: { type: Types.String, default: 'none' },
	/**
	 * @type {import('../lib/ControllerInterface').ControllerInterface}
	 */
	controllerInterface: { type: Types.Ref, default: undefined },
	/**
	 * @type {import('ecsy').Entity}
	 */
	handModelEntity: { type: Types.Ref, default: undefined },
	/**
	 * id for renderer.xr.getController()
	 * @type {number}
	 */
	threeControllerIdx: { type: Types.Number },
};
