/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class FaunaClusterComponent extends Component {}

/**
 * Information for a fauna cluster, which allows a group of fauna to move around within a set
 * of bounding boxes and smoothly turn around in the box and avoid each other.
 */
FaunaClusterComponent.schema = {
	/**
	 * @type {THREE.Vector3}
	 */
	boundingBoxCenter: { type: Types.Ref },
	/**
	 * @type {THREE.Vector3} represents the outer dimensions of the bounding box.
	 * Entities will not go beyond these dimensions.
	 */
	boundingBoxOuterDimensions: { type: Types.Ref },

	/**
	 * @type {THREE.Vector3} represents the inner dimensions of the bounding box.
	 * Entities will begin to turn around to remain in the bounding box once it
	 * exceeds the inner dimensions.
	 */
	boundingBoxInnerDimensions: { type: Types.Ref },

	/**
	 * @type {THREE.Vector3} represents the min x,y,z values of the inner bounding box
	 */
	boundingBoxInnerMin: { type: Types.Ref },

	/**
	 * @type {THREE.Vector3} represents the max x,y,z values of the inner bounding box
	 */
	boundingBoxInnerMax: { type: Types.Ref },

	/**
	 * @type {THREE.Mesh} the bounding mesh where fauna should remain in
	 */
	boundingMesh: { type: Types.Ref },

	/**
	 * @type {{position: THREE.Vector3, distance: number}[]}
	 * determines how close the player needs to be to fauna for the fauna to move
	 */
	meshObservationPoints: { type: Types.Array },

	minSpeed: { type: Types.Number },
	maxSpeed: { type: Types.Number },
	// THREE.Vector3 that represents any adjustments to the entities position
	positionOffset: { type: Types.Ref },

	// Min and Max angles (radian) allowed for the vertical direction used to
	// avoid entities traveling in steep angles
	minYRadian: { type: Types.Number, default: 0 },
	maxYRadian: { type: Types.Number, default: 0 },

	// Used to determine when and how fast to react to other entities in order
	// to avoid bumping into them
	avoidanceDistance: { type: Types.Number, default: 0 },
	avoidanceFactor: { type: Types.Number, default: 1 },

	// The amount of turn once entity exceeds the inner dimensions so the
	// entity can get back into bounds
	turnDegreesRadian: { type: Types.Number, default: Math.PI / 180 },
	negateDirection: { type: Types.Boolean, default: false },
	verticalPathVariationFrequency: { type: Types.Number, default: 1 },
	verticalPathVariationFactor: { type: Types.Number, default: 0 },
	horizontalPathVariationFrequency: { type: Types.Number, default: 1 },
	horizontalPathVariationFactor: { type: Types.Number, default: 0 },

	/**
	 * @type {import("ecsy/src/Entity")[]}
	 */
	faunas: { type: Types.Array },
};
