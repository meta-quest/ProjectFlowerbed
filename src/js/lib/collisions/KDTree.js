/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';
import {
	capsuleCastAgainstObject,
	raycastAgainstObject,
	sphereCastAgainstObject,
	testCollisionLayers,
} from './collisionFunctions';

// Implementation is a modification of
// https://github.com/davehill00/davehill00.github.io/blob/master/forest/src/kdTree.js

// temporary cache variables
const _vector0 = new THREE.Vector3();
const _vector1 = new THREE.Vector3();
const _box0 = new THREE.Box3();
const _box1 = new THREE.Box3();
const _line0 = new THREE.Line3();
const _sphere = new THREE.Sphere();
const _capsule = {
	lineSegment: new THREE.Line3(new THREE.Vector3(), new THREE.Vector3()),
	radius: 0,
};

const KD_MIN_DEPTH = 8;
const KD_MAX_DEPTH = 10;
const KD_MIN_EDGE_LENGTH = 5;

export class KDTree {
	/**
	 * Constructs a new KDTree with the objectsToPartition already inserted
	 * Currently, it assumes that the tree is uniform
	 * @param {THREE.Box3} treeBoundsBox
	 * @param {THREE.Mesh[]} objectsToPartition
	 * @param {number} depth
	 */
	constructor(treeBoundsBox, objectsToPartition, depth = 0) {
		// holds objects that are in this particular KD tree node
		this._objects = [];

		// sub KD trees
		this._childFront = null;
		this._childBack = null;
		this._parent = null;

		// bounding box of the tree node. Any object that does not intersect this bounding box
		// does not need to be tested against this particular subtree
		this._box = new THREE.Box3();

		// separating plane of the tree node. separates the subtree boxes.
		this._plane = new THREE.Plane();

		// number of objects in this tree and all its subtrees
		this._objectCountInclusive = 0;

		// raycasting results
		this._kdRayHitResult = {};
		this._kdShapeHitResult = {
			displacement: new THREE.Vector3(),
		};

		this._buildTree(treeBoundsBox, objectsToPartition, depth);
	}

	/**
	 * Inserts a mesh into the tree, which will then be used for collisions. Please note that instanced meshes
	 * should not be added to the KDTree.
	 * @param {THREE.Mesh} object - object to add to the tree
	 * @param {number[]} layers - collision layers that the object belongs to. Omit for no layers.
	 */
	insert(object, layers) {
		this._objectCountInclusive += 1;
		const objectBoundingBox = _box0;

		// add layers if needed
		if (layers && layers.length) {
			if (!object.collisionLayers) {
				object.collisionLayers = 0;
			}
			for (let layer of layers) {
				object.collisionLayers |= layer;
			}
		}

		objectBoundingBox.setFromObject(object);
		if (this._plane.intersectsBox(objectBoundingBox)) {
			this._objects.push(object);
			object.kdParent = this;
			return;
		}

		const centerPoint = _vector0;
		objectBoundingBox.getCenter(centerPoint);
		if (this._plane.distanceToPoint(centerPoint) > 0) {
			if (this._childFront) {
				this._childFront.insert(object);
			} else {
				this._objects.push(object);
				object.kdParent = this;
				return;
			}
		} else {
			if (this._childBack) {
				this._childBack.insert(object);
			} else {
				this._objects.push(object);
				object.kdParent = this;
				return;
			}
		}
	}

	/**
	 * Removes a mesh from the tree it belongs to.
	 * @param {THREE.Mesh} object
	 */
	remove(object) {
		if (!object.kdParent) {
			console.error('Object does not belong to a KDTree');
			return;
		}

		if (object.collisionLayers) {
			object.collisionLayers = 0;
		}

		// we want to refit the geometry if we add the object back to a kd tree,
		// so we delete that flag. (See _refitIfNeeded)
		if (object.hasRefit) {
			object.hasRefit = false;
		}

		if (object.kdParent === this) {
			const index = this._objects.indexOf(object);
			console.assert(index !== -1);

			this._objects.splice(index, 1);
			this._objectCountInclusive -= 1;
			let parent = this._parent;
			while (parent != null) {
				parent._objectCountInclusive--;
				parent = parent._parent;
			}
			return;
		}
		object.kdParent.remove(object);
	}

	/**
	 * @typedef {Object} RayHitResult
	 * @property {number} t - value from 0 to 1 that shows where along
	 * the ray an intersection occurred. 0 is the start point of the ray, 1 is the end point,
	 * and 0.5 means that collision happened at the midpoint.
	 * @property {THREE.Intersection} intersection - the intersection object.
	 * Will be the intersection closest to the start point of the ray.
	 */

	/**
	 * Casts a ray against all objects in the KDtree and returns the first intersection.
	 *
	 * @param {THREE.Vector3} from - point that the ray starts from
	 * @param {THREE.Vector3} to - point that the ray is cast to
	 * @param {RayHitResult} hitResult - a reference to a RayHitResult object that will be filled in with intersection information
	 * @param {CollisionLayerQuery} layers - optional. if set, the collision will be filtered by the collision layers in the query
	 * @param {number} level - unset, only for recursion.
	 * @returns {boolean} - if we hit an object in the tree
	 */
	raycast(from, to, hitResult, layers = {}, level = 0) {
		if (level === 0) {
			hitResult.t = 1;
		}

		this._kdRayHitResult.t = 1;
		this._kdRayHitResult.intersection = undefined;

		const rayBox = _box0;
		rayBox.makeEmpty();
		rayBox.expandByPoint(from);
		_vector0.lerpVectors(from, to, hitResult.t);
		rayBox.expandByPoint(_vector0);

		const doesBoxIntersect = this._box.intersectsBox(rayBox);
		if (!doesBoxIntersect) {
			return false;
		}

		let hit = false;
		if (this._objects.length) {
			for (let obj of this._objects) {
				// filter out objects that don't match the collision layers
				if (!testCollisionLayers(obj, layers)) {
					continue;
				}

				const objectBoundingBox = _box1;
				objectBoundingBox.setFromObject(obj);
				if (!objectBoundingBox.intersectsBox(rayBox)) {
					continue;
				}

				if (
					raycastAgainstObject(obj, from, to, this._kdRayHitResult, hitResult.t)
				) {
					if (this._kdRayHitResult.t < hitResult.t) {
						Object.assign(hitResult, this._kdRayHitResult);
						hit = true;
						rayBox.makeEmpty();
						rayBox.expandByPoint(from);
						_vector0.lerpVectors(from, to, hitResult.t);
						rayBox.expandByPoint(_vector0);
					}
				}
			}
		}

		if (this._childFront && this._childFront._objectCountInclusive > 0) {
			if (this._childFront.raycast(from, to, hitResult, layers, level + 1)) {
				hit = true;
			}
		}

		if (this._childBack && this._childBack._objectCountInclusive > 0) {
			if (this._childBack.raycast(from, to, hitResult, layers, level + 1)) {
				hit = true;
			}
		}

		return hit;
	}

	/**
	 *
	 * @param {THREE.Vector3} position
	 * @param {Capsule} capsule
	 * @param {ShapeHitResult} hitResult
	 * @param {CollisionLayerQuery} layers
	 * @param {number} level
	 * @returns {boolean} - if we hit an object in the tree
	 */
	capsulecast(position, capsule, hitResult, layers = {}, level = 0) {
		if (level === 0) {
			// at any level other than 0 the capsule fed into capsuleCast will
			// already be _capsule, so this is unnecessary.
			_capsule.lineSegment.copy(capsule.lineSegment);
			_capsule.radius = capsule.radius;
		}
		const meshBox = _box0;

		const translatedCapsuleLine = _line0;
		translatedCapsuleLine.copy(_capsule.lineSegment);
		translatedCapsuleLine.start.add(position);
		translatedCapsuleLine.end.add(position);

		meshBox.makeEmpty();
		meshBox.expandByPoint(translatedCapsuleLine.start);
		meshBox.expandByPoint(translatedCapsuleLine.end);

		meshBox.min.addScalar(-_capsule.radius);
		meshBox.max.addScalar(_capsule.radius);

		const doesBoxIntersect = this._box.intersectsBox(meshBox);
		if (!doesBoxIntersect) {
			return false;
		}

		this._kdShapeHitResult.displacement.set(0, 0, 0);
		if (!hitResult.displacement) {
			hitResult.displacement = new THREE.Vector3();
		} else if (level === 0) {
			// we only want to reset this if this is a top-level capsule cast
			// because we need to accumulate the displacements from all the recursion
			hitResult.displacement.set(0, 0, 0);
			hitResult.objects = [];
		}

		let hit = false;
		if (this._objects.length) {
			for (let obj of this._objects) {
				// filter out objects that don't match the collision layers
				if (!testCollisionLayers(obj, layers)) {
					continue;
				}
				if (
					capsuleCastAgainstObject(
						position,
						_capsule,
						obj,
						this._kdShapeHitResult,
					)
				) {
					// add the object to the list of intersected objects
					if (!hitResult.objects) {
						hitResult.objects = [];
					}
					hitResult.objects.push(obj);

					// handle the displacement
					hitResult.displacement.add(this._kdShapeHitResult.displacement);
					_capsule.lineSegment.start.add(this._kdShapeHitResult.displacement);
					_capsule.lineSegment.end.add(this._kdShapeHitResult.displacement);
					hit = true;
				}
			}
		}

		if (this._childFront && this._childFront._objectCountInclusive > 0) {
			if (
				this._childFront.capsulecast(
					position,
					_capsule,
					hitResult,
					layers,
					level + 1,
				)
			) {
				hit = true;
			}
		}

		if (this._childBack && this._childBack._objectCountInclusive > 0) {
			if (
				this._childBack.capsulecast(
					position,
					_capsule,
					hitResult,
					layers,
					level + 1,
				)
			) {
				hit = true;
			}
		}

		return hit;
	}

	sphereCast(position, radius, hitResult, layers = {}, level = 0) {
		_sphere.center.copy(position);
		_sphere.radius = radius;
		const doesBoxIntersect = this._box.intersectsSphere(_sphere);
		if (!doesBoxIntersect) {
			return false;
		}

		// we don't actually set displacement for spherecasts because as of right now
		// we don't need to. We may come back and add in the functionality later if it becomes
		// relevant.
		this._kdShapeHitResult.displacement.set(0, 0, 0);
		if (!hitResult.displacement) {
			hitResult.displacement = new THREE.Vector3();
		} else if (level === 0) {
			hitResult.objects = [];
			hitResult.displacement.set(0, 0, 0);
		}

		let hit = false;
		if (this._objects.length) {
			for (let obj of this._objects) {
				// filter out objects that don't match the collision layers
				if (!testCollisionLayers(obj, layers)) {
					continue;
				}

				if (
					sphereCastAgainstObject(position, radius, obj, this._kdShapeHitResult)
				) {
					// add the object to the list of intersected objects
					if (!hitResult.objects) {
						hitResult.objects = [];
					}
					hitResult.objects.push(obj);
					hit = true;
				}
			}
		}

		if (this._childFront && this._childFront._objectCountInclusive > 0) {
			if (
				this._childFront.sphereCast(
					position,
					radius,
					hitResult,
					layers,
					level + 1,
				)
			) {
				hit = true;
			}
		}

		if (this._childBack && this._childBack._objectCountInclusive > 0) {
			if (
				this._childBack.sphereCast(
					position,
					radius,
					hitResult,
					layers,
					level + 1,
				)
			) {
				hit = true;
			}
		}

		return hit;
	}

	_buildTree(treeBoundsBox, objectsToPartition, depth = 0) {
		// GENERATE THE PLANE
		/////////////////////
		this._box.copy(treeBoundsBox);
		const normalVector = _vector0;

		let splitDimension;
		treeBoundsBox.getSize(normalVector);

		if (normalVector.x > normalVector.y && normalVector.x > normalVector.z) {
			normalVector.set(1, 0, 0);
			splitDimension = 'x';
		} else if (normalVector.z > normalVector.y) {
			normalVector.set(0, 0, 1);
			splitDimension = 'z';
		} else {
			normalVector.set(0, 1, 0);
			splitDimension = 'y';
		}

		const centerVector = _vector1;
		treeBoundsBox.getCenter(centerVector);

		const midOnSplitDimension = centerVector[splitDimension];
		this._plane.setFromNormalAndCoplanarPoint(normalVector, centerVector);

		// ADD OBJECTS
		///////////////
		const frontObjects = [];
		const backObjects = [];

		for (const object of objectsToPartition) {
			let dist = this._plane.distanceToPoint(object.position);
			let radius = object.geometry.boundingSphere.radius;

			radius *= Math.max(
				object.scale.x,
				Math.max(object.scale.y, object.scale.z),
			);

			if (dist > radius) {
				frontObjects.push(object);
			} else if (dist < -radius) {
				backObjects.push(object);
			} else {
				this._objects.push(object);
				// adds a new field kdParent to reference the kd tree that the object
				// belongs too. This is useful for removing objects from the tree later.
				object.kdParent = this;
			}
		}

		// RECURSIVELY ADD SUBTREES
		////////////////////////////
		const edgeLength =
			this._box.max[splitDimension] - this._box.min[splitDimension] * 0.5;
		if (depth < KD_MAX_DEPTH && edgeLength > KD_MIN_EDGE_LENGTH) {
			const subBox = _box0;

			if (depth < KD_MIN_DEPTH || frontObjects.length) {
				const subBoxMin = _vector0;
				subBoxMin.copy(this._box.min);
				subBoxMin[splitDimension] = midOnSplitDimension;

				subBox.set(subBoxMin, this._box.max);
				this._childFront = new KDTree(subBox, frontObjects, depth + 1);
				this._childFront.setParent(this);
				this._objectCountInclusive += frontObjects.length;
			}

			if (depth < KD_MIN_DEPTH || backObjects.length) {
				const subBoxMax = _vector0;
				subBoxMax.copy(this._box.max);
				subBoxMax[splitDimension] = midOnSplitDimension;

				subBox.set(this._box.min, subBoxMax);
				this._childBack = new KDTree(subBox, backObjects, depth + 1);
				this._childBack.setParent(this);
				this._objectCountInclusive += backObjects.length;
			}
		} else {
			// we can't split the tree any more, so we just add all the objects
			// to the current node of the tree

			for (const frontObj of frontObjects) {
				this._objects.push(frontObj);
			}
			for (const backObj of backObjects) {
				this._objects.push(backObj);
			}
		}

		this._objectCountInclusive += this._objects.length;
	}

	/**
	 * Only used in the recursive step of the KDTree to link nodes properly with each other
	 * @param {KDTree} parent
	 */
	setParent(parent) {
		this._parent = parent;
	}
}
