/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

/**
 * This is only used for testing, and only in the MeshPreviewSystem,
 * which can be used to hot swap models in the experience without a reload.
 */
export class MeshPreviewObject extends Component {}
MeshPreviewObject.schema = {
	distance: { type: Types.Number, default: 0.1 },
};
