/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { BufferGeometry } from 'three';
import { Float32BufferAttribute } from 'three';
import { Vector2 } from 'three';
import { Vector3 } from 'three';

class DynamicTubeGeometry extends BufferGeometry {
	constructor(
		tubularSegments = 64,
		radiiFunc = (_i) => 0.02,
		radialSegments = 8,
		closed = false,
	) {
		super();
		this.type = 'DynamicTubeGeometry';

		this.parameters = {
			tubularSegments: tubularSegments,
			radialSegments: radialSegments,
			radiiFunc: radiiFunc,
			closed: closed,
		};

		this.tangents = null;
		this.normals = null;
		this.binormals = null;

		// helper variables
		this._vertex = null;
		this._normal = null;
		this._uv = null;
		this._P = null;
		this._vertices = null;
		this._normals = null;
		this._uvs = null;
		this._indices = null;

		// this.setFromPath();
	}

	/**
	 * Dynamically update the tube geometry based on the new curve data
	 * @param {THREE.Curve} path - Built-in curves (e.g. CatmullRomCurve3).
	 */
	setFromPath(path) {
		let tubularSegments = this.parameters['tubularSegments'];
		let closed = this.parameters['closed'];
		const frames = path.computeFrenetFrames(tubularSegments, closed);

		// expose internals
		this.tangents = frames.tangents;
		this.normals = frames.normals;
		this.binormals = frames.binormals;

		// reset helper variables
		this._vertex = new Vector3();
		this._normal = new Vector3();
		this._uv = new Vector2();
		this._P = new Vector3();
		this._vertices = [];
		this._normals = [];
		this._uvs = [];
		this._indices = [];

		// create buffer data

		this._generateBufferData(path);

		// build geometry

		this.setIndex(this._indices);
		this.setAttribute(
			'position',
			new Float32BufferAttribute(this._vertices, 3),
		);
		this.setAttribute('normal', new Float32BufferAttribute(this._normals, 3));
		this.setAttribute('uv', new Float32BufferAttribute(this._uvs, 2));
	}

	/**
	 * Generate the ith segment of the tube geometry
	 * @param {Number} i - segment id
	 * @param {THREE.Curve} path - Built-in curves (e.g. CatmullRomCurve3).
	 */
	_generateSegment(i, path) {
		let tubularSegments = this.parameters['tubularSegments'];
		let radialSegments = this.parameters['radialSegments'];
		let radiiFunc = this.parameters['radiiFunc'];
		let renderedPortion = this.parameters['renderedPortion'] ?? 1;
		let spanOverride = this.parameters['spanOverride'] ?? 1;
		// we use getPointAt to sample evenly distributed points from the given path

		this._P = path.getPointAt((i * spanOverride) / tubularSegments, this._P);

		// retrieve corresponding normal and binormal

		const N = this.normals[i];
		const B = this.binormals[i];

		// generate normals and vertices for the current segment

		for (let j = 0; j <= radialSegments; j++) {
			const v = (j / radialSegments) * Math.PI * 2;

			const sin = Math.sin(v);
			const cos = -Math.cos(v);

			// normal

			this._normal.x = cos * N.x + sin * B.x;
			this._normal.y = cos * N.y + sin * B.y;
			this._normal.z = cos * N.z + sin * B.z;
			this._normal.normalize();

			this._normals.push(this._normal.x, this._normal.y, this._normal.z);

			// vertex

			let curRadius = radiiFunc((i / tubularSegments) * renderedPortion);
			this._vertex.x = this._P.x + curRadius * this._normal.x;
			this._vertex.y = this._P.y + curRadius * this._normal.y;
			this._vertex.z = this._P.z + curRadius * this._normal.z;

			this._vertices.push(this._vertex.x, this._vertex.y, this._vertex.z);
		}
	}

	/**
	 * Generate indices to create faces
	 */
	_generateIndices() {
		let tubularSegments = this.parameters['tubularSegments'];
		let radialSegments = this.parameters['radialSegments'];
		for (let j = 1; j <= tubularSegments; j++) {
			for (let i = 1; i <= radialSegments; i++) {
				const a = (radialSegments + 1) * (j - 1) + (i - 1);
				const b = (radialSegments + 1) * j + (i - 1);
				const c = (radialSegments + 1) * j + i;
				const d = (radialSegments + 1) * (j - 1) + i;

				// faces

				this._indices.push(a, b, d);
				this._indices.push(b, c, d);
			}
		}
	}

	/**
	 * Generate UVs
	 */
	_generateUVs() {
		let tubularSegments = this.parameters['tubularSegments'];
		let radialSegments = this.parameters['radialSegments'];

		for (let i = 0; i <= tubularSegments; i++) {
			for (let j = 0; j <= radialSegments; j++) {
				this._uv.x = i / tubularSegments;
				this._uv.y = j / radialSegments;

				this._uvs.push(this._uv.x, this._uv.y);
			}
		}
	}

	/**
	 * Update the buffer data for the tube geometry
	 * @param {THREE.Curve} path - Built-in curves (e.g. CatmullRomCurve3).
	 */
	_generateBufferData(path) {
		let tubularSegments = this.parameters['tubularSegments'];
		let closed = this.parameters['closed'];
		for (let i = 0; i < tubularSegments; i++) {
			this._generateSegment(i, path);
		}

		// if the geometry is not closed, generate the last row of vertices and normals
		// at the regular position on the given path
		//
		// if the geometry is closed, duplicate the first row of vertices and normals (uvs will differ)

		this._generateSegment(closed === false ? tubularSegments : 0, path);

		// uvs are generated in a separate function.
		// this makes it easy compute correct values for closed geometries

		this._generateUVs();

		// finally create faces

		this._generateIndices();
	}

	toJSON() {
		const data = super.toJSON();

		data.path = this.parameters.path.toJSON();

		return data;
	}

	static fromJSON(data) {
		return new DynamicTubeGeometry(
			data.tubularSegments,
			(_i) => 0.02,
			data.radialSegments,
			data.closed,
		);
	}

	setRadiiFunc(radiiFunc) {
		this.parameters['radiiFunc'] = radiiFunc;
	}

	setRenderedPortion(renderedPortion) {
		this.parameters['renderedPortion'] = renderedPortion;
	}

	setSpanOverride(percentage) {
		this.parameters['spanOverride'] = percentage;
	}
}

export {
	DynamicTubeGeometry,
	DynamicTubeGeometry as DynamicTubeBufferGeometry,
};
