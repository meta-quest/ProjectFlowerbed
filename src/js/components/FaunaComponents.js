/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class WaterFaunaMovementComponent extends Component {}

WaterFaunaMovementComponent.schema = {
	speed: { type: Types.Number, default: 0 },
	isTurning: { type: Types.Boolean, default: false },
	/**
	 * @type {number} 1 or -1 to determine the direction of turning
	 */
	turnSign: { type: Types.Number, default: 1 },
};

export class WaterFaunaGroupComponent extends Component {}

WaterFaunaGroupComponent.schema = {
	/**
	 * Area id to identify the group
	 * @type {string}
	 */
	areaId: { type: Types.String },
	/**
	 * @type {imort('ecsy').Entity[]} Entities in the group
	 */
	entities: { type: Types.Ref },
	/**
	 * @type {number[]} distance thresholds for each stage of turning
	 */
	turnStages: { type: Types.Ref },
	/**
	 * @type {number[]} turning speed multiplier for each stage of turning
	 */
	turnFactorMultiplier: { type: Types.Number },
	avoidOthers: { type: Types.Boolean },
	/**
	 * @type {number} Distance to stop animation of the group
	 */
	cullingDistance: { type: Types.Number },
};

export class AerialFaunaMovementComponent extends Component {}

AerialFaunaMovementComponent.schema = {
	/**
	 * @type {import('three').Vector3 } normalized direction vector
	 */
	direction: { type: Types.Ref },
	/**
	 * @type {number} Distance traveled per time period along the direction vector
	 */
	speed: { type: Types.Number },
	/**
	 * @type {number} Time offset for the vertical variation of fauna animation
	 * @default 0
	 */
	verticalVariationOffset: { type: Types.Number, default: 0 },
	/**
	 * @type {number} Time offset for the horizontal variation of fauna animation
	 * @default 0
	 */
	horizontalVariationOffset: { type: Types.Number, default: 0 },
};

export class AerialFaunaGroupComponent extends Component {}

AerialFaunaGroupComponent.schema = {
	/**
	 * @type {import('ecsy').Entity[]} Entities in the group
	 */
	entities: { type: Types.Ref },
	/**
	 * @type {import('three').Box3} Bounding box for the group
	 */
	boundingBox3: { type: Types.Ref },
	/**
	 * @type {number} Min angle (radian) allowed for the vertical direction
	 */
	minYRadian: { type: Types.Number, default: 0 },
	/**
	 * @type {number} Max angle (radian) allowed for the vertical direction
	 */
	maxYRadian: { type: Types.Number, default: 0 },
	/**
	 * @type {number} Base turning angle (radian)
	 */
	turnDegreesRadian: { type: Types.Number, default: Math.PI / 180 },
	/**
	 * @type {number} variation frequency for the vertical path
	 */
	verticalPathVariationFrequency: { type: Types.Number, default: 1 },
	/**
	 * @type {number} variation factor for the vertical path
	 */
	verticalPathVariationFactor: { type: Types.Number, default: 0 },
	/**
	 * @type {number} variation frequency for the horizontal path
	 */
	horizontalPathVariationFrequency: { type: Types.Number, default: 1 },
	/**
	 * @type {number} variation factor for the horizontal path
	 */
	horizontalPathVariationFactor: { type: Types.Number, default: 0 },
	/**
	 * @type {number} Distance to stop animation of the group
	 */
	cullingDistance: { type: Types.Number },
};
