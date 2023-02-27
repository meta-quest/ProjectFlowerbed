/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class LoadingScreenComponent extends Component {}

LoadingScreenComponent.schema = {
	isDoneLoading: { type: Types.Boolean, default: false },
	totalMeshes: { type: Types.Number, default: 0 },
	loadedMeshes: { type: Types.Number, default: 0 },
};
