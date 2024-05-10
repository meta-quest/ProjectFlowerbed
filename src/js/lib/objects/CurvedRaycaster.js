/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

export class CurvedRaycaster {
	constructor(
		origin,
		direction,
		numSegments = 10,
		shootingSpeed = 10,
		minY = -1,
	) {
		this.numSegments = numSegments;
		this.points = Array.from(
			{ length: this.numSegments + 1 },
			() => new THREE.Vector3(),
		);
		this.renderedPoints = null;
		this.shootingSpeed = shootingSpeed;
		this.minY = minY;
		this.raycaster = new THREE.Raycaster(origin, direction);
		this.raycaster.firstHitOnly = true;

		this.isCurved = true;
	}

	set(origin, direction) {
		const g = -9.8;
		const a = new THREE.Vector3(0, g, 0);
		let v0 = new THREE.Vector3();
		v0.copy(direction).multiplyScalar(this.shootingSpeed);
		let max_t = calculateMaxTime(origin, v0, a, this.minY);
		let dt = max_t / this.numSegments;
		let newPos = new THREE.Vector3();
		for (var i = 0; i < this.numSegments + 1; i++) {
			parabolicCurve(origin, v0, a, dt * i, newPos);
			this.points[i].copy(newPos);
		}
		this.renderedPoints = null;
	}

	setShootingSpeed(shootingSpeed) {
		this.shootingSpeed = shootingSpeed;
	}

	getPoints() {
		return this.renderedPoints ? this.renderedPoints : this.points;
	}

	/**
	 * @readonly
	 * @type {Number} - float number between 0 and 1 that indicates what portion
	 * of the ray is visible
	 */
	get renderedPortion() {
		if (this.renderedPoints) {
			let i = this.renderedPoints.length - 2;
			let segmentStart = this.points[i];
			let segmentEnd = this.points[i + 1];
			let intersectPoint = this.renderedPoints[this.renderedPoints.length - 1];
			let renderedPortion =
				i / this.numSegments +
				segmentStart.distanceTo(intersectPoint) /
					segmentStart.distanceTo(segmentEnd) /
					this.numSegments;
			return renderedPortion;
		} else {
			return 1;
		}
	}

	intersectObject(object, recursive = false, intersects = [], lazy = true) {
		return this.intersectObjects([object], recursive, intersects, lazy);
	}

	intersectObjects(objects, recursive = false, intersects = [], lazy = true) {
		let p1, p2;
		let intersected = false;
		for (let i = 0; i < this.numSegments; i++) {
			p1 = this.points[i];
			p2 = this.points[i + 1];
			let segment = p2.clone().sub(p1);
			this.raycaster.far =
				segment.length() * (i == this.numSegments - 1 ? 1.1 : 1);
			this.raycaster.set(p1, segment.normalize());
			const segmentIntersects = this.raycaster.intersectObjects(
				objects,
				recursive,
			);

			intersects = intersects.concat(segmentIntersects);

			if (segmentIntersects.length > 0) {
				if (!intersected) {
					this.renderedPoints = [];
					for (let j = 0; j <= i; j++) {
						this.renderedPoints.push(this.points[j].clone());
					}
					this.renderedPoints.push(intersects[0].point.clone());
					intersected = true;
				}

				if (lazy) break;
			}
		}
		return intersects;
	}

	/**
	 * Performs a raycast against the collision world, returning the first intersection.
	 * @param {CollisionWorld} collisionWorld
	 * @param {import('../collisions/collisionFunctions').CollisionLayerQuery} layerQuery - collision layers to test against (omit to test against all layers)
	 * @returns {import('../collisions/collisionFunctions').RayHitResult | null} the intersection if it exists, or null if it does not
	 */
	intersectCollisionWorld(collisionWorld, layerQuery) {
		let p1, p2;
		for (let i = 0; i < this.numSegments; i++) {
			p1 = this.points[i];
			p2 = this.points[i + 1];

			let kdRayHitResult = collisionWorld.raycastPoints(p1, p2, layerQuery);

			if (kdRayHitResult) {
				this.renderedPoints = [];
				for (let j = 0; j <= i; j++) {
					this.renderedPoints.push(this.points[j].clone());
				}
				this.renderedPoints.push(kdRayHitResult.intersection.point.clone());
				return kdRayHitResult;
			}
		}
	}
}

const calculateMaxTime = (p0, v0, a, minY) => {
	let p1 = a.y / 2;
	let p2 = v0.y;
	let p3 = p0.y - minY;
	// solve p1*x^2 + p2*x + p3 = 0
	var t =
		(-1 * p2 - Math.sqrt(Math.max(0.001, Math.pow(p2, 2) - 4 * p1 * p3))) /
		(2 * p1);
	return t;
};

// Utils
// Parabolic motion equation, y = p0 + v0*t + 1/2at^2
const parabolicCurveScalar = (p0, v0, a, t) => {
	return p0 + v0 * t + 0.5 * a * t * t;
};

// Parabolic motion equation applied to 3 dimensions
const parabolicCurve = (p0, v0, a, t, out) => {
	out.x = parabolicCurveScalar(p0.x, v0.x, a.x, t);
	out.y = parabolicCurveScalar(p0.y, v0.y, a.y, t);
	out.z = parabolicCurveScalar(p0.z, v0.z, a.z, t);
	return out;
};
