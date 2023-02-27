/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

/**
 * Helper class to draw individual triangles in the scene.
 * This was primarily used to debug collisions, and is currently unused.
 */
export class DebugTriangleDrawer {
	constructor(scene) {
		this.triangles = [];
		this.lastVisibleTriangle = -1;
		this.scene = scene;
	}

	setScene(scene) {
		this.scene = scene;
	}

	/**
	 * Clears all visible debug triangles
	 */
	clearTriangles() {
		for (let triangle of this.triangles) {
			triangle.visible = false;
		}

		this.lastVisibleTriangle = -1;
	}

	/**
	 * Draws a new triangle onto the screen.
	 * @param {THREE.Triangle} triangle
	 */
	drawNewTriangle(triangle) {
		if (!this.scene) {
			console.warn(
				'Trying to draw a debug triangle without a corresponding scene',
			);
		}

		this.lastVisibleTriangle += 1;
		while (this.lastVisibleTriangle >= this.triangles.length) {
			let newTriangle = this._createTriangle();
			this.scene.add(newTriangle);
			this.triangles.push(newTriangle);
		}
		let tri = this.triangles[this.lastVisibleTriangle];

		tri.visible = true;
		this._moveTriangle(tri, triangle.a, triangle.b, triangle.c);
	}

	/**
	 * Creates a new triangle and adds it to the scene
	 * @returns {THREE.Mesh}
	 */
	_createTriangle() {
		let geometry = new THREE.BufferGeometry();
		let material = new THREE.MeshBasicMaterial({
			side: THREE.DoubleSide,
			transparent: false,
			vertexColors: THREE.VertexColors,
			depthTest: false,
		});
		let mesh = new THREE.Mesh(geometry, material);
		mesh.renderOrder = 1000;
		let positions = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]);
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geometry.setDrawRange(0, 3);

		var colors = new Float32Array([0, 0, 1, 0, 0, 0, 0, 0, 0]);
		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		return mesh;
	}

	/**
	 * Moves an existing triangle to fit 3 points
	 * @param {THREE.Mesh} triangleMesh
	 * @param {THREE.Vector3} a
	 * @param {THREE.Vector3} b
	 * @param {THREE.Vector3} c
	 */
	_moveTriangle(triangleMesh, a, b, c) {
		const p = triangleMesh.geometry.attributes.position.array;

		let i = 0;
		p[i++] = a.x;
		p[i++] = a.y;
		p[i++] = a.z;
		p[i++] = b.x;
		p[i++] = b.y;
		p[i++] = b.z;
		p[i++] = c.x;
		p[i++] = c.y;
		p[i++] = c.z;

		triangleMesh.geometry.attributes.position.needsUpdate = true;
	}
}
