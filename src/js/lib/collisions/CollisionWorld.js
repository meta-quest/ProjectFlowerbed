/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { KDTree } from './KDTree';
import { MeshBVH } from 'three-mesh-bvh';
import { testCollisionLayers } from './collisionFunctions';

export class CollisionWorld {
	/**
	 *
	 * @param {THREE.Box3} worldBounds box spanning the entire size of the collision world
	 */
	constructor(worldBounds) {
		// KD tree that represents all of the static objects in this
		// world
		this._kdTree = new KDTree(worldBounds, []);
		// list of all added static colliders
		// this is mostly to make it easier to iterate through all of them
		// and draw any debug meshes
		this._staticColliders = [];

		this._kdRayHitResult = {};
		this._kdShapeHitResult = {};

		// expose ability to test collision layers so we can filter
		// results by layer even outside the system.
		this.testCollisionLayers = testCollisionLayers;
	}

	/**
	 * Adds an object to the collision world
	 * @param {THREE.Object3D} object - the object to add. If it's a mesh, adds it directly; if it's a group of meshes, adds the meshes
	 * to the collision world while keeping a reference to the group.
	 * @param {string[]} defaultLayers - optional list of layers to add to the static meshes.
	 * @returns
	 */
	addStaticObject(object, defaultLayers) {
		object.traverse((node) => {
			if (!node.isMesh) {
				return;
			}

			if (this._staticColliders.indexOf(node) > -1) {
				console.warn('Object already exists in this collision world.');
				return;
			}

			// get a link from the node to the current object
			node.staticObject = object;
			if (!node.geometry.boundsTree) {
				// use MeshBVH to create a new boundsTree
				// for more efficient ray and shape casts
				node.updateMatrixWorld(true);
				node.geometry.boundsTree = new MeshBVH(node.geometry);
			}

			this._staticColliders.push(node);
			this._kdTree.insert(node, defaultLayers);
		});
	}

	removeStaticObject(object) {
		object.traverse((node) => {
			if (!node.isMesh) {
				return;
			}

			const index = this._staticColliders.indexOf(node);
			if (index < 0) {
				console.warn(
					'Attempting to remove an object from a collision world that does not exist in that collision world',
				);
				return;
			}
			this._staticColliders.splice(index, 1);

			delete node.staticObject;
			this._kdTree.remove(node);
		});
	}

	/**
	 * Performs a raycast against this collision world, returning the first intersection.
	 * @param {THREE.Vector3} from - point that the ray starts from
	 * @param {THREE.Vector3} to - point that the ray is cast to
	 * @param {import('./collisionFunctions').CollisionLayerQuery} layerQuery - collision layers to test against (omit to test against all layers)
	 * @returns {import('./collisionFunctions').RayHitResult | null} the intersection if it exists, or null if it does not
	 */
	raycastPoints(from, to, layerQuery) {
		if (this._kdTree.raycast(from, to, this._kdRayHitResult, layerQuery)) {
			return this._kdRayHitResult;
		}
		return null;
	}

	/**
	 * Performs a capsule cast against this collision world.
	 * @param {THREE.Vector3} position
	 * @param {import('./collisionFunctions').Capsule} capsule
	 * @param {import('./collisionFunctions').CollisionLayerQuery} layerQuery - collision layers to test against (omit to test against all layers)
	 * @returns {import('./collisionFunctions').ShapeHitResult | null} the intersection if it exists, or null if it does not
	 */
	capsuleCast(position, capsule, layerQuery) {
		if (
			this._kdTree.capsulecast(
				position,
				capsule,
				this._kdShapeHitResult,
				layerQuery,
			)
		) {
			return this._kdShapeHitResult;
		}
		return null;
	}

	/**
	 * Checks objects in the world that collides with the given sphere.
	 * @param {*} position Position of the sphere (in world coordinates)
	 * @param {*} radius Radius of the sphere
	 * @param {import('./collisionFunctions').CollisionLayerQuery} layerQuery - collision layers to test against (omit to test against all layers)
	 * @returns {THREE.Mesh[]} - a list of objects that was collided against.
	 */
	sphereCast(position, radius, layerQuery) {
		if (
			this._kdTree.sphereCast(
				position,
				radius,
				this._kdShapeHitResult,
				layerQuery,
			)
		) {
			return [...this._kdShapeHitResult.objects];
		}
		return [];
	}
}
