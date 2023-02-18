/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Raycaster, Vector3 } from 'three';

import { RAY_CONSTANTS } from '../../Constants';

export class StraightRaycaster extends Raycaster {
	constructor() {
		super();
		this.far = RAY_CONSTANTS.STRAIGHT_RAY_MAX_LENGTH;
		this._pNear = new Vector3();
		this._pFar = new Vector3();
		this.renderedPoints = [this.pNear, this.pFar];
	}

	get pNear() {
		return this.ray.at(this.near, this._pNear);
	}

	get pFar() {
		return this.ray.at(this.far, this._pFar);
	}

	set(origin, direction) {
		this.far = Math.min(this.far, RAY_CONSTANTS.STRAIGHT_RAY_MAX_LENGTH);
		super.set(origin, direction);
	}

	intersectObjects(objects, recursive = true, intersects = []) {
		super.intersectObjects(objects, recursive, intersects);
		if (intersects.length > 0 && intersects[0].distance <= 1) {
			this.renderedPoints[1] = intersects[0].point;
		}
		return intersects;
	}

	/**
	 * Performs a raycast against the collision world, returning the first intersection.
	 * @param {CollisionWorld} collisionWorld
	 * @param {import('./collisions/collisionFunctions').CollisionLayerQuery} layerQuery - collision layers to test against (omit to test against all layers)
	 * @returns {import('./collisions/collisionFunctions').RayHitResult | null} the intersection if it exists, or null if it does not
	 */
	intersectCollisionWorld(collisionWorld, layerQuery) {
		let kdRayHitResult = collisionWorld.raycastPoints(
			this.pNear,
			this.pFar,
			layerQuery,
		);

		if (kdRayHitResult) {
			this.renderedPoints[1] = kdRayHitResult.intersection.point.clone();
			return kdRayHitResult;
		}
	}

	getPoints(reset = false) {
		const points = [...this.renderedPoints];
		if (reset) {
			this.renderedPoints = [this.pNear, this.pFar];
		}
		return points;
	}

	/**
	 * @readonly
	 * @type {Number} - float number between 0 and 1 that indicates what portion
	 * of the ray is visible
	 */
	get renderedPortion() {
		if (this.renderedPoints) {
			let intersectPoint = this.renderedPoints[1];
			let renderedPortion =
				this.pNear.distanceTo(intersectPoint) / (this.far - this.near);
			return renderedPortion;
		} else {
			return RAY_CONSTANTS.STRAIGHT_RAY_MAX_LENGTH;
		}
	}
}
