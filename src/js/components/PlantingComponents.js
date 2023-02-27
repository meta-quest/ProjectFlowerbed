/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Transition data used for plant growth and shrinking animations.
 * @typedef {{
 * 	startTime: number,
 * 	animationDuration: number,
 * 	totalDuration: number,
 * 	pdDamping: number,
 * 	pdFrequency: number,
 * 	pdConvergingDamping: number,
 * 	pdConvergingFrequency: number,
 * 	value: number,
 * 	speed: number,
 * 	targetValue: number
 * }} TransitionData
 */

import * as THREE from 'three';

import { Component, Types } from 'ecsy';
import {
	deserializeComponentDefault,
	serializeComponentDefault,
} from './SaveDataComponents';

import { MeshIdComponent } from './AssetReplacementComponents';
import { Object3DComponent } from './Object3DComponent';
import { getPlantMeshId } from '../utils/plantUtils';

export class PlantedComponent extends Component {
	serialize() {
		let pickable = this.pickable;
		this.pickable = true;
		// we handle plantedScale and segmentScales separately, so can ignore the warning
		// about them being refs
		// we also deliberately drop tinyColliderEntity because that will be regenerated on load.
		let serialized = serializeComponentDefault(this, true);
		this.pickable = pickable;
		serialized.plantedScale = this.plantedScale.toArray();
		serialized.segmentScales = this.segmentScales.toArray();
		return serialized;
	}

	deserialize(jsonData) {
		deserializeComponentDefault(this, jsonData);
		this.plantedScale = new THREE.Vector3().fromArray(jsonData.plantedScale);
		this.segmentScales = new THREE.Vector4().fromArray(jsonData.segmentScales);
	}

	async afterDeserialize(entity, _scene) {
		if (!entity.hasComponent(Object3DComponent)) {
			entity.addComponent(Object3DComponent, {
				value: new THREE.Object3D(),
			});
		}

		if (!entity.hasComponent(MeshIdComponent)) {
			entity.addComponent(MeshIdComponent, {
				id: getPlantMeshId(this.plantType),
			});
		}
	}
}

PlantedComponent.schema = {
	/**
	 * @type {string} - the type of plant
	 * @see plantUtils.PLANT_TYPES
	 */
	plantType: { type: Types.String },
	/**
	 * @type {THREE.Vector3} - the scale of the plant when it was planted
	 */
	plantedScale: { type: Types.Ref, default: undefined },
	/**
	 * @type {THREE.Vector4} - the scale of each segment of the plant when it was planted
	 */
	segmentScales: { type: Types.Ref, default: undefined },
	/**
	 * @type {number} - the multiplier to apply to the scale of the plant
	 */
	scaleMultiplier: { type: Types.Number, default: 1 },
	/**
	 * @type {number} - the speed at which the scale multiplier increases over time
	 */
	growSpeed: { type: Types.Number, default: 0.4 },
	/**
	 * @type {boolean} - whether the plant can be picked
	 */
	pickable: { type: Types.Boolean, default: false },
	/**
	 * @type {import('ecsy').Entity} - a small collider to optimize picking for when the plant is small
	 */
	tinyColliderEntity: { type: Types.Ref, default: undefined },
};

export class PickedPlantComponent extends Component {}

PickedPlantComponent.STATES = {
	FLYING_TO_HAND: 0,
	IN_HAND: 1,
	FLYING_AWAY: 2,
};

PickedPlantComponent.schema = {
	/**
	 * @type {number} - the state of the plant
	 * @see PickedPlantComponent.STATES
	 */
	state: {
		type: Types.Number,
		default: PickedPlantComponent.STATES.FLYING_TO_HAND,
	},
};

export class PlantGrowingComponent extends Component {}

PlantGrowingComponent.schema = {
	/**
	 * @type {string} - the type of plant
	 * @see plantUtils.PLANT_TYPES
	 */
	plantType: { type: Types.String },
	/**
	 * @type {number} - the time that the plant has been growing for
	 */
	growingTimer: { type: Types.Number, default: 0 },
	/**
	 * @type {TransitionData} - the data for the plant's growth
	 */
	growingData: { type: Types.Ref },
};

export class PlantShrinkingComponent extends Component {}

PlantShrinkingComponent.schema = {
	/**
	 * @type {string} - the type of plant
	 * @see plantUtils.PLANT_TYPES
	 */
	plantType: { type: Types.String },
	/**
	 * @type {number} - the time that the plant has been shrinking for
	 */
	shrinkingTimer: { type: Types.Number, default: 0 },
	/**
	 * @type {TransitionData} - the data for the plant's shrinking
	 */
	shrinkingData: { type: Types.Ref },
};

export class PlantingStateComponent extends Component {}

PlantingStateComponent.schema = {
	/**
	 * @type {boolean} - whether the plant can be planted currently at the plantingTarget
	 */
	plantingPossible: { type: Types.Boolean, default: false },
	/**
	 * @type {THREE.Vector3} - the target position for planting
	 */
	plantingTarget: { type: Types.Ref, default: new THREE.Vector3() },
	/**
	 * @type {import('ecsy').Entity} - the planting indicator entity
	 */
	plantingIndicatorEntity: { type: Types.Ref, default: undefined },
};

export class PlantTinyColliderComponent extends Component {}

PlantTinyColliderComponent.schema = {
	/**
	 * @type {import('ecsy').Entity}
	 */
	plantEntity: { type: Types.Ref, default: undefined },
};

export class SeedAnimationComponent extends Component {}

SeedAnimationComponent.schema = {
	/**
	 * @type {THREE.Curve} - the curve to follow when flying
	 */
	flightCurve: { type: Types.Ref, default: undefined },
	/**
	 * @type {number} - the animation duration of the flight
	 */
	flightTime: { type: Types.Number, default: 0 },
	/**
	 * @type {string} - the type of plant
	 * @see plantUtils.PLANT_TYPES
	 */
	plantType: { type: Types.String },
	/**
	 * @type {THREE.Vector3} - the position that the seed was planted at
	 */
	plantedPosition: { type: Types.Ref, default: undefined },
	/**
	 * @type {THREE.Quaternion} - the rotation that the seed was planted at
	 */
	plantedQuaternion: { type: Types.Ref, default: undefined },
	/**
	 * @type {number} - the time that the seed has been flying for
	 */
	timer: { type: Types.Number, default: 0 },
};
