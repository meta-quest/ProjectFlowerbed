/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class FaunaColliderComponent extends Component {}

FaunaColliderComponent.schema = {
	/**
	 * @type {THREE.Mesh} mesh to use to detect collision with faunas
	 */
	value: { type: Types.Ref },
};
