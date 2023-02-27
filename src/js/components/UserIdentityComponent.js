/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class UserIdentityComponent extends Component {}

UserIdentityComponent.schema = {
	playerToken: { type: Types.String, default: '' },
	created: { type: Types.String, default: '' },
	lastModified: { type: Types.String, default: '' },
};
