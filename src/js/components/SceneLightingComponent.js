/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { Component, Types } from 'ecsy';

import { WoodlandCSM } from '../lib/shaders/WoodlandCSM.js';

const ENABLE_CSM = true;
const TIME_BETWEEN_SLOW_CSM_UPDATE = 15;
const TIME_BETWEEN_FAST_CSM_UPDATE = 0.005;
const DIRECTIONAL_LIGHT_COLOR = 0xff7755;
const DIRECTIONAL_LIGHT_INTENSITY = 1.2;
const DIRECTION_LIGHT_DIRECTION = new THREE.Vector3(
	0.35,
	-0.8,
	-1.0,
).normalize();
const AMBIENT_LIGHT_INTENSITY = 0.3;

export class SceneLightingComponent extends Component {
	constructor(props) {
		super(props);

		this.csm = null;
		this.lastCSMUpdateTime = -TIME_BETWEEN_SLOW_CSM_UPDATE / 2;
		this.needsFastUpdate = false;

		if (!this.scene) {
			return;
		}

		this.scene.add(
			new THREE.HemisphereLight(0xffeedd, 0x80c080, AMBIENT_LIGHT_INTENSITY),
		);

		if (ENABLE_CSM) {
			this.renderer.shadowMap.enabled = true;
			// this.renderer.shadowMap.type = THREE.PCFShadowMap;
			this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

			this.csm = new WoodlandCSM({
				maxFar: 50.0,
				cascades: 1,
				mode: 'practical',
				parent: this.scene,
				shadowMapSize: 512,
				shadowBias: -0.00015,
				lightDirection: DIRECTION_LIGHT_DIRECTION,
				lightIntensity: DIRECTIONAL_LIGHT_INTENSITY,
				lightColor: DIRECTIONAL_LIGHT_COLOR,
				camera: this.renderer.xr.getCamera(),
				globalFinalCascade: true,
				globalFinalCascadeBoundsMin: new THREE.Vector3(-68, 0, -43), // this value should be determined by content
				globalFinalCascadeBoundsMax: new THREE.Vector3(47, 5, 61), // this value should be determined by content
				globalFinalCascadeShadowMapSize: 1024,
			});
		} else {
			let light = new THREE.DirectionalLight(DIRECTIONAL_LIGHT_COLOR);
			light.position.set(3, 3, 1);
			light.shadow.camera.top = 50;
			light.shadow.camera.bottom = -50;
			light.shadow.camera.right = 75;
			light.shadow.camera.left = -75;
			light.intensity = DIRECTIONAL_LIGHT_INTENSITY;
			this.scene.add(light);
			light.updateMatrix();
		}
	}

	update(time) {
		if (this.csm) {
			if (
				time - this.lastCSMUpdateTime > TIME_BETWEEN_SLOW_CSM_UPDATE ||
				(this.needsFastUpdate &&
					time - this.lastCSMUpdateTime > TIME_BETWEEN_FAST_CSM_UPDATE)
			) {
				this.csm.update(true);
				this.lastCSMUpdateTime = time;
				this.needsFastUpdate = false;
			} else {
				this.csm.update(false);
			}
		}
	}

	setCameraOverride(newCamera, staticOnly, forceUpdate) {
		if (this.csm) {
			this.csm.setCamera(newCamera, staticOnly, forceUpdate);
		}
	}

	clearCameraOverride() {
		if (this.csm) {
			this.csm.setCamera(this.camera, false, false);
		}
	}
}

SceneLightingComponent.schema = {
	camera: { type: Types.Ref, default: undefined },
	renderer: { type: Types.Ref, default: undefined },
	scene: { type: Types.Ref, default: undefined },
};
