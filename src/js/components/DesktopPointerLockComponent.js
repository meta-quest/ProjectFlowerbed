/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

/**
 * Holds a reference to the PointerLockControls used when entering Flowerbed on Desktop.
 * Currently unused.
 */
export class DesktopPointerLockComponent extends Component {}

DesktopPointerLockComponent.schema = {
	/**
	 * @type {import("three/examples/jsm/controls/PointerLockControls")}
	 */
	value: { type: Types.Ref },
};
