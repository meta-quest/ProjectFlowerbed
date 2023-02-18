/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';
import {
	doesMatchAll,
	doesMatchNone,
	doesMatchSome,
} from '../../utils/bitUtils';

import { EPSILON_SQUARED } from '../../Constants';
import { MeshBVH } from 'three-mesh-bvh';

const _vector0 = new THREE.Vector3();
const _vector1 = new THREE.Vector3();
const _vector2 = new THREE.Vector3();
const _displacement = new THREE.Vector3();
const _box0 = new THREE.Box3();
const _raycaster = new THREE.Raycaster();
const _line0 = new THREE.Line3();
const _matrix = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _tempHitResult = {
	displacement: new THREE.Vector3(),
};

/**
 * @typedef {Object} Capsule
 * @property {number} radius
 * @property {THREE.Line3} lineSegment - line representing the vertical segment of the cylindrical portion of the capsule
 */

/**
 * @typedef {Object} RayHitResult
 * @property {number} t - value from 0 to 1 that shows where along
 * the ray an intersection occurred. 0 is the start point of the ray, 1 is the end point,
 * and 0.5 means that collision happened at the midpoint.
 * @property {THREE.Intersection} intersection - the intersection object.
 * Will be the intersection closest to the start point of the ray.
 */

/**
 * @typedef {Object} ShapeHitResult
 * @property {THREE.Vector3} displacement - a vector representing how deep an intersection is,
 * and the direction of that intersection. Used to determine when to 'push out' an object from an
 * intersection. Only defined for capsule casts right now since it isn't needed for sphere casts, but we can extend if necesssary.
 * @property {THREE.Mesh[]} objects - an array of meshes that overlap the shapecast.
 */

/**
 * We need to refit the bounds tree *after* an object has been added to the scene so
 * that three-mesh-bvh behaves correctly; we do this lazily since it's an operation
 * that only needs to be done once per mesh.
 * @param {THREE.Mesh} obj - the mesh that needs to update its bounds tree.
 */
const _refitIfNeeded = (obj) => {
	// obj.hasRefit is not used anywhere else, so this is just a single-run operation
	// on static objects when we first attempt a collision check against them.
	if (!obj.hasRefit) {
		obj.hasRefit = true;
		obj.geometry.boundsTree.refit();
	}
};

/**
 * Private function used by the kd tree to raycast against an object, which can have multiple nested THREE.JS meshes in it.
 * @param {THREE.Object3D} obj - the object to test against.
 * @param {THREE.Vector3} from
 * @param {THREE.Vector3} to
 * @param {RayHitResult} hitResult - A reference to a RayHitResult whose t and intersection values
 * 		will be updated with the raycast results
 * @param {number} t - A number from 0 to 1 to determine the closest hit thus far.
 * 		Any point on the ray farther than t won't be checked. Set t to 1 to check the whole ray.
 * @returns {boolean} - True if we hit the object, false if we do not.
 */
export const raycastAgainstObject = (obj, from, to, hitResult, t = 1) => {
	_vector1.subVectors(to, from);
	let length = _vector1.length();
	_vector1.normalize();

	// see https://github.com/gkjohnson/three-mesh-bvh#acceleratedraycast for
	// documentation on firstHitOnly.
	_raycaster.firstHitOnly = true;

	_raycaster.set(from, _vector1);
	_raycaster.near = 0;
	_raycaster.far = length * t;

	let hit = false;

	obj.traverse((node) => {
		if (!node.isMesh) {
			return;
		}

		if (!node.geometry.boundsTree) {
			node.updateMatrixWorld();
			node.geometry.boundsTree = new MeshBVH(node.geometry);
		}

		_refitIfNeeded(node);

		const intersections = [];
		node.raycast(_raycaster, intersections);

		if (intersections.length === 0) {
			return;
		}

		intersections.sort((a, b) => {
			return a.distance - b.distance;
		});

		if (hitResult) {
			const tempT = Math.min(intersections[0].distance / length, 1);
			if (hitResult.t > tempT && tempT < 1) {
				hitResult.t = tempT;
				hitResult.intersection = intersections[0];
				hit = true;
			}
		}
	});

	return hit;
};

/**
 * Internal function for casting a capsule against a mesh.
 * @param {THREE.Vector3} position Position of the capsule in world space
 * @param {Capsule} capsule capsule, defined at (0, 0)
 * @param {THREE.Mesh} staticObject
 * @param {ShapeHitResult} hitResult
 * @returns
 */
const _capsuleCastAgainstObject = (
	position,
	capsule,
	staticObject,
	hitResult,
) => {
	let hit = false;

	_matrix.copy(staticObject.matrixWorld).invert();
	const tempCapsuleLine = _line0;
	tempCapsuleLine.copy(capsule.lineSegment);
	tempCapsuleLine.start.add(position);
	tempCapsuleLine.end.add(position);

	// get the position of the capsule in the local space of the collider
	tempCapsuleLine.start.applyMatrix4(_matrix);
	tempCapsuleLine.end.applyMatrix4(_matrix);

	// use the sphere to apply the matrix and get local radius for the capsule
	// note that since we don't have any notion of x, y, and z scale for the capsule,
	// non-uniform scalings will break.
	const tempSphere = _sphere;
	tempSphere.radius = capsule.radius;
	tempSphere.applyMatrix4(_matrix);
	const tempCapsuleRadius = tempSphere.radius;

	const capsuleBox = _box0;
	capsuleBox.makeEmpty();
	capsuleBox.expandByPoint(tempCapsuleLine.start);
	capsuleBox.expandByPoint(tempCapsuleLine.end);
	capsuleBox.min.addScalar(-tempCapsuleRadius);
	capsuleBox.max.addScalar(tempCapsuleRadius);

	const tempDisplacement = _vector2;
	tempDisplacement.set(0, 0, 0);

	// see https://github.com/gkjohnson/three-mesh-bvh/blob/474a26cbc3052a46a89d992052adbbc72638ab9c/example/characterMovement.js#L381
	// for the logic I'm using here
	staticObject.geometry.boundsTree.shapecast({
		intersectsBounds: (box) => {
			return box.intersectsBox(capsuleBox);
		},

		// this function is called for every triangle that the shape can collide with
		intersectsTriangle: (tri) => {
			const triPoint = _vector0;
			const capsulePoint = _vector1;

			const distance = tri.closestPointToSegment(
				tempCapsuleLine,
				triPoint,
				capsulePoint,
			);

			if (distance < tempCapsuleRadius) {
				hit = true;

				const localDepth = tempCapsuleRadius - distance; // depth = how deep the capsule overlaps this triangle
				const direction = capsulePoint.sub(triPoint).normalize(); // this is in the direction that the capsule needs to be pushed out

				tempCapsuleLine.start.addScaledVector(direction, localDepth);
				tempCapsuleLine.end.addScaledVector(direction, localDepth);
				tempDisplacement.addScaledVector(direction, localDepth);
			}
		},
	});

	if (tempDisplacement.lengthSq() > EPSILON_SQUARED) {
		hitResult.displacement
			.copy(tempCapsuleLine.start)
			.applyMatrix4(staticObject.matrixWorld)
			.sub(position)
			.sub(capsule.lineSegment.start);
	}

	return hit;
};

/**
 * Tests whether a capsule hits a THREE.JS object
 * @param {THREE.Vector3} position Position of the capsule in world space
 * @param {Capsule} capsule capsule, defined at (0, 0)
 * @param {THREE.Object3D} object The object to test the collision against.
 * @param {ShapeHitResult} hitResult
 * @returns {boolean} true if we have an intersection
 */
export const capsuleCastAgainstObject = (
	position,
	capsule,
	object,
	hitResult,
) => {
	if (!hitResult.displacement) {
		hitResult.displacement = _displacement;
	}
	hitResult.displacement.set(0, 0, 0);

	let hit = false;

	const tempHitResult = _tempHitResult;
	_tempHitResult.displacement.set(0, 0, 0);

	object.traverse((node) => {
		if (!node.isMesh) {
			return;
		}

		if (!node.geometry.boundsTree) {
			// use MeshBVH to create a new boundsTree
			// for more efficient ray and shape casts
			node.updateMatrixWorld();
			node.geometry.boundsTree = new MeshBVH(node.geometry);
		}

		_refitIfNeeded(node);

		if (_capsuleCastAgainstObject(position, capsule, node, tempHitResult)) {
			// handle the displacement
			hitResult.displacement.add(tempHitResult.displacement);
			hit = true;
		}
	});

	if (hit) {
		if (!hitResult.objects) {
			hitResult.objects = [];
		}
		hitResult.objects.push(object);
	}

	return hit;
};

/**
 *
 * @param {THREE.Vector3} position
 * @param {number} radius
 * @param {THREE.Object3D} object
 * @param {ShapeHitResult} hitResult
 * @returns
 */
export const sphereCastAgainstObject = (
	position,
	radius,
	object,
	hitResult,
) => {
	_sphere.center.copy(position);
	_sphere.radius = radius;

	let hit = false;

	const objBoundingBox = _box0;
	objBoundingBox.setFromObject(object);

	if (!objBoundingBox.intersectsSphere(_sphere)) {
		return false;
	}

	object.traverse((node) => {
		if (!node.isMesh) {
			return;
		}

		if (!node.geometry.boundsTree) {
			// use MeshBVH to create a new boundsTree
			// for more efficient ray and shape casts
			node.updateMatrixWorld();
			node.geometry.boundsTree = new MeshBVH(node.geometry);
		}
		_refitIfNeeded(node);

		_sphere.center.copy(position);
		_sphere.radius = radius;
		// set the sphere to be in the local space of the object.
		_matrix.copy(node.matrixWorld).invert();
		_sphere.applyMatrix4(_matrix);

		if (node.geometry.boundsTree.intersectsSphere(_sphere)) {
			hit = true;
		}
	});

	if (hit) {
		if (!hitResult.objects) {
			hitResult.objects = [];
		}
		hitResult.objects.push(object);
	}

	return hit;
};

/**
 *
 * @typedef {Object} CollisionLayerQuery
 * @property {number} all - matches only objects that have all the layers in this query
 * @property {number} any - matches objects that have any of the layers in this query
 * @property {number} none - matches objects that do not have any layers in this query
 */

/**
 * Takes a THREE.Mesh and tests whether it matches the provided collision layer query
 * @param {THREE.Mesh} obj - an object within the KDTree
 * @param {CollisionLayerQuery} layerQuery
 * @returns {boolean} if the mesh matches the collision layer query
 */
export const testCollisionLayers = (obj, layerQuery = {}) => {
	if (!obj.collisionLayers) {
		if (!layerQuery?.all && !layerQuery?.any) {
			return true;
		}
		return false;
	}

	if (layerQuery?.all) {
		if (!doesMatchAll(obj.collisionLayers, layerQuery.all)) {
			return false;
		}
	}

	if (layerQuery?.any) {
		if (!doesMatchSome(obj.collisionLayers, layerQuery.some)) {
			return false;
		}
	}

	if (layerQuery?.none) {
		if (!doesMatchNone(obj.collisionLayers, layerQuery.none)) {
			return false;
		}
	}

	return true;
};
