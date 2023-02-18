/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, SystemStateComponent, Types } from 'ecsy';
import { CylinderIndicator } from '../lib/objects/CylinderIndicator';
import { updateMatrixRecursively } from '../utils/object3dUtils';

/**
 * Used to label objects that act as static (non-moving) colliders
 * in the game world
 */
export class StaticColliderComponent extends Component {
	static getEntityFromCollider(mesh) {
		// since the mesh could be a child of the actual
		// object in the collision world, we first fetch
		// a reference to the object tied to the entity
		// See lib/CollisionWorld.js for where this is defined.
		const staticObject = mesh.staticObject ?? mesh;

		// now return the entity that it's linked to
		// this is set in systems/CollisionWorldSystem.js
		return staticObject.colliderEntity;
	}

	hasLayer(layer) {
		return this.layers.indexOf(layer) >= 0;
	}
}

StaticColliderComponent.schema = {
	mesh: { type: Types.Ref }, // THREE.Mesh or THREE.Object3D (group of meshes)
	layers: { type: Types.Ref }, // number[] (technically Constants.COLLISION_LAYERS[])
	needsUpdate: { type: Types.Boolean, default: false }, // set only when the collider changes and we need to
	// re-insert it into the collision world. This is too expensive to run per-frame.
};

// we don't want to serialize colliders since the mesh will be lost,
// and we tend to generate colliders when objects are created anyway.
StaticColliderComponent.prototype.serialize = undefined;

/**
 * Helper component that keeps track of resources used in StaticColliderComponent,
 * even if the components are removed.
 *
 * Please do not manually add this component to any entities.
 */
export class StaticColliderResources extends SystemStateComponent {}
StaticColliderResources.schema = {
	mesh: { type: Types.Ref }, // THREE.Mesh
};

StaticColliderResources.prototype.serialize = undefined;

/**
 * Singleton component that holds a reference to the collision world
 */
export class CollisionWorldComponent extends Component {}

CollisionWorldComponent.schema = {
	world: { type: Types.Ref }, // CollisionWorld
};

export class CapsuleColliderComponent extends Component {}

CapsuleColliderComponent.schema = {
	radius: { type: Types.Number, default: 0.5 },
	lineSegment: { type: Types.Ref }, // THREE.Line3
};

/**
 * Designates a collision area that changes the collision state if the player
 * has just entered or just left the area defined as the sphere with the defined radius around
 * a Vector3D point.
 *
 * Used primarily for creating specific areas that react when the player enters them for NUX.
 * See CollisionAreaSystem for how it generally runs.
 */
export class CollisionAreaComponent extends Component {
	createIndicator() {
		this.indicator = new CylinderIndicator(this.radius, 0xffffff);
		this.indicator.position.copy(this.position);
		updateMatrixRecursively(this.indicator);
	}

	removeIndicator() {
		if (!this.indicator) {
			return;
		}
		this.indicator.removeFromParent();
		this.indicator = undefined;
	}
}

CollisionAreaComponent.schema = {
	isIntersecting: { type: Types.Boolean, default: false },
	radius: { type: Types.Number, default: 1 },

	/**
	 * @type {THREE.Vector3}
	 */
	position: { type: Types.Ref },

	/**
	 * @type {import("../lib/objects/CylinderIndicator")}
	 */
	indicator: { type: Types.Ref },

	shouldShowIndicator: { type: Types.Boolean, default: false },
};
