/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class OptimizedModelComponent extends Component {}

OptimizedModelComponent.schema = {
	model: { type: Types.Ref },
	materialOverride: { type: Types.Ref },
	shadowCastingObjects: { type: Types.Ref },

	// derived fields; these should be calculated by the system
	instancedMeshes: { type: Types.Ref },
	optimizedModel: { type: Types.Ref },
};
