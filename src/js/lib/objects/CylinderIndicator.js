/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

function generateLinearGradient() {
	var canvas = document.createElement('canvas');
	canvas.width = 64;
	canvas.height = 64;

	var ctx = canvas.getContext('2d');

	var gradient = ctx.createLinearGradient(0, 0, 0, 64);
	gradient.addColorStop(0, 'black');
	gradient.addColorStop(1, 'white');

	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, 64, 64);

	return canvas;
}

export class CylinderIndicator extends THREE.Object3D {
	constructor(radius, color) {
		super();
		this.radius = radius;
		this.color = color;
		this.geometry = new THREE.CylinderBufferGeometry(
			radius,
			radius,
			1,
			24,
			1,
			true,
		);

		this.material = new THREE.MeshBasicMaterial({
			color: 0xffffff,
			side: THREE.DoubleSide,
			alphaMap: new THREE.CanvasTexture(generateLinearGradient()),
			transparent: true,
		});

		this.indicatorMesh = new THREE.Mesh(this.geometry, this.material);
		this.add(this.indicatorMesh);
	}
}
