/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { DEBUG_CONSTANTS } from '../../Constants.js';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';

export class PerformanceTestSystem extends System {
	init() {
		this.lockedPosition = new THREE.Vector3(0.0, 6.0, 0.0);
		this.lockedRotation = new THREE.Euler(0, 0, 0);
		this.vrCameraPosition = new THREE.Vector3(0.0, 0.0, 0.0);
		this.vrCameraPositionRight = new THREE.Vector3(0.064, 0.0, 0.0);
		this.vrCameraRotation = new THREE.Euler(0, 0, 0);
	}

	execute() {
		if (DEBUG_CONSTANTS.LOCK_VIEW_FOR_PERF_TESTS) {
			this.queries.gameManager.results.forEach((entity) => {
				const xrManager = entity.getComponent(THREEGlobalComponent).renderer.xr;
				if (xrManager) {
					let cameraVR = xrManager.getCamera();

					cameraVR.position.copy(this.vrCameraPosition);
					cameraVR.rotation.copy(this.vrCameraRotation);
					cameraVR.updateMatrix();

					for (let i = 0; i < cameraVR.cameras.length; i++) {
						let camera = cameraVR.cameras[i];
						if (i === 1) {
							camera.position.copy(this.vrCameraPositionRight);
						} else {
							camera.position.copy(this.vrCameraPosition);
						}

						camera.rotation.copy(this.vrCameraRotation);
						camera.updateMatrix();
					}
				}
			});

			this.queries.player.results.forEach((entity) => {
				const viewerTransform = entity.getComponent(PlayerStateComponent)
					.viewerTransform;

				viewerTransform.position.copy(this.lockedPosition);
				viewerTransform.rotation.copy(this.lockedRotation);
			});
		}
	}
}

PerformanceTestSystem.queries = {
	gameManager: { components: [THREEGlobalComponent] },
	player: {
		components: [PlayerStateComponent],
	},
};
