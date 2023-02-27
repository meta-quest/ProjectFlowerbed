/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, TagComponent, Types } from 'ecsy';

import { RAY_CONSTANTS } from '../Constants';

const RAY_TYPES = {
	UI_RAY: 0,
	SHORT_RAY: 1,
	PLANTING_RAY: 2,
	PICKING_RAY: 3,
	TELEPORT_RAY: 4,
	WATERING_RAY: 5,
	SELECTION_RAY: 6,
};

const RAY_MODES = {
	DEFAULT: 0,
	SPECIAL: 1,
};

const RAY_CONFIG_MAPPING = {};
RAY_CONFIG_MAPPING[RAY_TYPES.SHORT_RAY] = RAY_CONSTANTS.SHORT_RAY;
RAY_CONFIG_MAPPING[RAY_TYPES.UI_RAY] = RAY_CONSTANTS.UI_RAY;
RAY_CONFIG_MAPPING[RAY_TYPES.PLANTING_RAY] = RAY_CONSTANTS.PLANTING_RAY;
RAY_CONFIG_MAPPING[RAY_TYPES.PICKING_RAY] = RAY_CONSTANTS.PICKING_RAY;
RAY_CONFIG_MAPPING[RAY_TYPES.TELEPORT_RAY] = RAY_CONSTANTS.TELEPORT_RAY;
RAY_CONFIG_MAPPING[RAY_TYPES.WATERING_RAY] = RAY_CONSTANTS.WATERING_RAY;
RAY_CONFIG_MAPPING[RAY_TYPES.SELECTION_RAY] = RAY_CONSTANTS.SELECTION_RAY;

export class RayComponent extends Component {
	/**
	 * sets the ray's type and updates its appearance
	 * specifically sets the radii_func and shooting speed of the current ray
	 * it should only be called once when interaction mode changes
	 * @param {number} type
	 * @see RAY_TYPES
	 */
	setRayType(type) {
		if (this.rayType != type && this.rayMesh != null) {
			let rayConfig = RAY_CONFIG_MAPPING[type];
			if (rayConfig.SHOOTING_SPEED) {
				this.raycaster.setShootingSpeed(rayConfig.SHOOTING_SPEED);
			}
			this.rayMesh.geometry.setRadiiFunc(rayConfig.RADII_FUNC);

			this.rayType = type;

			this.setRayMode(RAY_MODES.DEFAULT);
		}
	}

	/**
	 * sets the ray's mode and update its appearance
	 * potentially changing color and opacity of the ray
	 * @param {number} mode
	 * @see RAY_MODES
	 */
	setRayMode(mode) {
		if (this.rayMesh != null) {
			let rayConfig = RAY_CONFIG_MAPPING[this.rayType];
			if (rayConfig.COLOR[mode]) this.color = rayConfig.COLOR[mode];
			if (rayConfig.OPACITY[mode]) this.opacity = rayConfig.OPACITY[mode];

			if (rayConfig.RAY_GRADIENT_START && rayConfig.RAY_GRADIENT_START[mode]) {
				this.rayGradientStart = rayConfig.RAY_GRADIENT_START[mode];
			} else {
				this.rayGradientStart = 0.0;
			}

			if (
				rayConfig.RAY_GRADIENT_OPAQUE_START &&
				rayConfig.RAY_GRADIENT_OPAQUE_START[mode]
			) {
				this.rayGradientOpaqueStart = rayConfig.RAY_GRADIENT_OPAQUE_START[mode];
			} else {
				this.rayGradientOpaqueStart = 0.0;
			}

			if (
				rayConfig.RAY_GRADIENT_OPAQUE_END &&
				rayConfig.RAY_GRADIENT_OPAQUE_END[mode]
			) {
				this.rayGradientOpaqueEnd = rayConfig.RAY_GRADIENT_OPAQUE_END[mode];
			} else {
				this.rayGradientOpaqueEnd = 1.0;
			}

			if (rayConfig.RAY_GRADIENT_END && rayConfig.RAY_GRADIENT_END[mode]) {
				this.rayGradientEnd = rayConfig.RAY_GRADIENT_END[mode];
			} else {
				this.rayGradientEnd = 1.0;
			}

			if (rayConfig.SPAN_OVERRIDE && rayConfig.SPAN_OVERRIDE[mode]) {
				this.rayMesh.geometry.setSpanOverride(rayConfig.SPAN_OVERRIDE[mode]);
			} else {
				this.rayMesh.geometry.setSpanOverride(1.0);
			}
		}
	}
}

RayComponent.RAY_TYPES = RAY_TYPES;
RayComponent.RAY_MODES = RAY_MODES;

RayComponent.schema = {
	/**
	 * @type {THREE.Raycaster}
	 */
	raycaster: { type: Types.Ref, default: null },
	/**
	 * @type {THREE.Mesh} mesh for the ray
	 */
	rayMesh: { type: Types.Ref, default: null },
	/**
	 * @type {THREE.Curve}
	 */
	rayPath: { type: Types.Ref, default: null },
	/**
	 * @type {boolean}
	 */
	visible: { type: Types.Boolean, default: false },
	/**
	 * @type {number}
	 * @default 0xffffff
	 */
	color: { type: Types.Number, default: 0xffffff },
	/**
	 * @type {number}
	 * @default 0.3
	 */
	opacity: { type: Types.Number, default: 0.3 },
	/**
	 * @type {number}
	 * @default -1
	 */
	rayType: { type: Types.Number, default: -1 },
	/**
	 * indicates in percentage where the gradient effect starts on the ray mesh
	 * @type {number}
	 * @default 0.0
	 */
	rayGradientStart: { type: Types.Number, default: 0.0 },
	/**
	 * indicates in percentage where the opaque section of the gradient effect starts on the ray mesh
	 * @type {number}
	 * @default 0.0
	 */
	rayGradientOpaqueStart: { type: Types.Number, default: 0.0 },
	/**
	 * indicates in percentage where the opaque section of the gradient effect ends on the ray mesh
	 * @type {number}
	 * @default 1.0
	 */
	rayGradientOpaqueEnd: { type: Types.Number, default: 1.0 },
	/**
	 * indicates in percentage where the gradient effect ends on the ray mesh
	 * @type {number}
	 * @default 0.0
	 */
	rayGradientEnd: { type: Types.Number, default: 1.0 },
	/**
	 * override the rendered span of the ray mesh, in percentage, useful when ray hits an object but does not penetrate
	 * @type {number}
	 * @default 0.0
	 */
	spanOverride: { type: Types.Number, default: 1.0 },
	/**
	 * @type {THREE.Vector3} override ray origin position
	 */
	originOverride: { type: Types.Ref, default: null },
	/**
	 * @type {THREE.Vector3} override ray direction
	 */
	directionOverride: { type: Types.Ref, default: null },
};

export class StraightRay extends TagComponent {}

export class ShortRay extends TagComponent {}

export class CurvedRay extends TagComponent {}
