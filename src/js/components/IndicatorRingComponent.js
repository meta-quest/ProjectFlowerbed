/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { Component, Types } from 'ecsy';

import { INDICATOR_RING_CONSTANTS } from '../Constants';

const RING_TYPES = {
	PLANTABLE_RING: 0,
	NOT_PLANTABLE_RING: 1,
	TELEPORTABLE_RING: 2,
	NOT_TELEPORTABLE_RING: 3,
};

const RING_CONFIG_MAPPING = {};
RING_CONFIG_MAPPING[RING_TYPES.PLANTABLE_RING] =
	INDICATOR_RING_CONSTANTS.PLANTABLE_RING;
RING_CONFIG_MAPPING[RING_TYPES.NOT_PLANTABLE_RING] =
	INDICATOR_RING_CONSTANTS.NOT_PLANTABLE_RING;
RING_CONFIG_MAPPING[RING_TYPES.TELEPORTABLE_RING] =
	INDICATOR_RING_CONSTANTS.TELEPORTABLE_RING;
RING_CONFIG_MAPPING[RING_TYPES.NOT_TELEPORTABLE_RING] =
	INDICATOR_RING_CONSTANTS.NOT_TELEPORTABLE_RING;

export class IndicatorRingComponent extends Component {
	/**
	 * creates a default ring mesh and adds it to the parent object
	 * @param {THREE.Object3D} parent - parent object to add the ring to
	 * @returns {ThisType}
	 */
	createDefaultRing(parent) {
		if (this.ringMesh != null) throw 'ring mesh already exsists';

		const ringGeometry = new THREE.TorusGeometry(0.5, 0.07, 7, 32);
		const ringMaterial = new THREE.MeshStandardMaterial({
			color: 0xffffff,
			transparent: true,
			metalness: 0.1,
			roughness: 0.7,
		});

		this.ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
		this.ringMesh.visible = false;
		this.ringMesh.receiveShadow = true;
		this.ringMesh.rotation.x = 1.57;
		parent.add(this.ringMesh);
		return this;
	}

	/**
	 * sets the ring's type and updates its appearance
	 * @param {number} type - one of the RING_TYPES
	 * @see RING_TYPES
	 */
	setRingType(type) {
		if (this.ringType != type && this.ringMesh != null) {
			let ringConfig = RING_CONFIG_MAPPING[type];
			this.ringMesh.scale.set(
				ringConfig.RADIUS,
				ringConfig.RADIUS,
				ringConfig.RADIUS,
			);
			this.ringMesh.material.color.setHex(ringConfig.COLOR);
			this.ringMesh.material.opacity = ringConfig.OPACITY;
		}
	}

	/**
	 * sets the ring's visibility
	 * @param {boolean} visible
	 */
	setRingVisible(visible) {
		if (this.ringMesh != null) {
			this.ringMesh.visible = visible;
			this.ringMesh.matrixAutoUpdate = visible;
			this.snapRotationOnReveal = visible;
		}
	}

	/**
	 * Updates the indicator ring's position and rotation
	 * to match an intersection point. This assumes you want the
	 * indicator ring to be flush with the intersection's surface.
	 * @param {THREE.Intersection} intersection
	 * @returns
	 */
	setRingTransformFromIntersection(intersection) {
		if (!this.ringMesh) {
			return;
		}

		this.updateRingPosition(intersection.point);
	}

	/**
	 * sets the ring's position
	 * @param {THREE.Vector3} position
	 */
	updateRingPosition(position) {
		if (this.ringMesh != null) {
			this.ringMesh.position.copy(position);
			this.ringMesh.position.y += 0.1;
		}
	}
}

IndicatorRingComponent.RING_TYPES = RING_TYPES;

IndicatorRingComponent.schema = {
	/**
	 * @type {THREE.Mesh} - the ring mesh
	 */
	ringMesh: { type: Types.Ref, default: null },
	/**
	 * @type {number} - one of the RING_TYPES
	 * @default -1
	 * @see RING_TYPES
	 */
	ringType: { type: Types.Number, default: -1 },
};
