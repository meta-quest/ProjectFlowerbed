/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { System } from 'ecsy';
import { THREEGlobalComponent } from '../components/THREEGlobalComponent';
import { getOnlyEntity } from '../utils/entityUtils';

export class FaunaMovementBoundSamplerSystem extends System {
	init() {
		const scene = getOnlyEntity(this.queries.gameManager).getComponent(
			THREEGlobalComponent,
		).scene;
		const raycaster = new THREE.Raycaster();
		window.sampleRiverBound = () => {
			const riverBoundingMesh = scene.getObjectByName('RiverBoundingRegion');
			console.log(riverBoundingMesh);
			const origin = new THREE.Vector3(-100, 0, -14);
			const boundarySample = [];
			let startZ = null;
			while (origin.z <= 13) {
				raycaster.set(origin, new THREE.Vector3(1, 0, 0));
				const intersects = raycaster.intersectObject(riverBoundingMesh);
				if (intersects.length > 0) {
					boundarySample.push({
						x0: intersects[0].point.x,
						x1: intersects[1].point.x,
					});
					if (startZ == null) startZ = origin.z;
				}
				origin.z += 0.25;
			}
			console.log(startZ, JSON.stringify(boundarySample));
		};

		window.samplePondBound = () => {
			const pondBoundingMesh = scene.getObjectByName('PondBoundingRegion');
			console.log(pondBoundingMesh);
			const origin = new THREE.Vector3(-5, 0, 0);
			const boundarySample = [];
			let startX = null;
			while (origin.x <= 20) {
				raycaster.set(origin, new THREE.Vector3(0, 0, 1));
				const intersects = raycaster.intersectObject(pondBoundingMesh);
				console.log(intersects.length);
				if (intersects.length > 0) {
					boundarySample.push({
						x0: intersects[0].point.z,
						x1: intersects[1].point.z,
					});
					if (startX == null) startX = origin.x;
				}
				origin.x += 0.25;
			}
			console.log(startX, JSON.stringify(boundarySample));
		};
	}

	execute() {}
}

FaunaMovementBoundSamplerSystem.queries = {
	gameManager: { components: [THREEGlobalComponent] },
};
