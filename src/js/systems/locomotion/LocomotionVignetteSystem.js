/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';
import {
	LOCOMOTION_VIGNETTE_CONSTATNTS,
	THREEJS_LAYERS,
} from '../../Constants';

import { AXES } from '../../lib/ControllerInterface';
import { InteractionSystem } from '../../lib/InteractionSystem';
import { SettingsComponent } from '../../components/SettingsComponent';
import { getOnlyEntity } from '../../utils/entityUtils';

export class LocomotionVignetteSystem extends InteractionSystem {
	init() {
		this.vignetteTube = null;

		const canvas = document.createElement('CANVAS');
		canvas.width = LOCOMOTION_VIGNETTE_CONSTATNTS.TUBE_TEXTURE_SIZE;
		canvas.height = LOCOMOTION_VIGNETTE_CONSTATNTS.TUBE_TEXTURE_SIZE;

		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		const grd = ctx.createLinearGradient(
			0,
			0,
			0,
			LOCOMOTION_VIGNETTE_CONSTATNTS.TUBE_TEXTURE_SIZE,
		);
		grd.addColorStop(0, '#000000ff');
		grd.addColorStop(
			LOCOMOTION_VIGNETTE_CONSTATNTS.GRADIENT_START_OFFSET,
			'#000000ff',
		);
		grd.addColorStop(0.9, '#00000000');

		ctx.fillStyle = grd;
		ctx.fillRect(
			0,
			0,
			LOCOMOTION_VIGNETTE_CONSTATNTS.TUBE_TEXTURE_SIZE,
			LOCOMOTION_VIGNETTE_CONSTATNTS.TUBE_TEXTURE_SIZE,
		);

		const self = this;
		new THREE.TextureLoader().load(canvas.toDataURL(), (texture) => {
			self.vignetteMap = texture;
		});
	}

	onExecute(_delta, _time) {
		if (!this.vignetteTube && this.vignetteMap) {
			this._createVignetteTube();
		}

		if (this.vignetteTube) {
			this._updateVignetteTube();
		}
	}

	play() {
		const settings = getOnlyEntity(this.queries.settings, false);
		if (settings) {
			const settingsValues = settings.getComponent(SettingsComponent);
			if (!settingsValues.vignetteEnabled) {
				// turn this off right away.
				this.stop();
				return;
			}
		}

		super.play();
		if (this.vignetteTube) {
			this.vignetteTube.visible = true;
		}
	}

	stop() {
		if (this.vignetteTube) {
			this.vignetteTube.visible = false;
		}
		super.stop();
	}

	_createVignetteTube() {
		this.vignetteTube = new THREE.Mesh(
			new THREE.CylinderGeometry(
				LOCOMOTION_VIGNETTE_CONSTATNTS.TUBE_RADIUS,
				LOCOMOTION_VIGNETTE_CONSTATNTS.TUBE_RADIUS,
				LOCOMOTION_VIGNETTE_CONSTATNTS.TUBE_LENGTH,
				32,
				1,
				true,
			),
			new THREE.MeshBasicMaterial({
				// color: 0x000000,
				side: THREE.BackSide,
				transparent: true,
				depthWrite: false,
			}),
		);
		this.vignetteTube.renderOrder = 1000;
		this.vignetteTube.material.depthTest = false;
		this.vignetteTube.material.depthWrite = false;
		this.vignetteTube.frustumCulled = false;
		this.vignetteTube.rotateX(Math.PI / 2);
		this.vignetteTube.position.z =
			LOCOMOTION_VIGNETTE_CONSTATNTS.TUBE_LENGTH / 2;
		this.vignetteTube.material.map = this.vignetteMap;
		this.vignetteTube.layers.disableAll();
		// this.vignetteTube.layers.enable(0);
		this.vignetteTube.layers.enable(THREEJS_LAYERS.VIEWER_ONLY);
		this.playerStateComponent.playerHead.add(this.vignetteTube);
	}

	_updateVignetteTube() {
		const controller = this.controllerInterfaces.LEFT;
		const absoluteSpeedFactor = Math.sqrt(
			Math.pow(controller.getAxisInput(AXES.THUMBSTICK_X), 2) +
				Math.pow(controller.getAxisInput(AXES.THUMBSTICK_Y), 2),
		);
		const deploymentFactor = Math.min(
			1,
			absoluteSpeedFactor /
				LOCOMOTION_VIGNETTE_CONSTATNTS.MAX_DEPLOYMENT_THRESHOLD,
		);
		this.vignetteTube.position.z =
			(1 - deploymentFactor) * LOCOMOTION_VIGNETTE_CONSTATNTS.TUBE_LENGTH -
			LOCOMOTION_VIGNETTE_CONSTATNTS.TUBE_LENGTH / 2;
	}
}

LocomotionVignetteSystem.addQueries({
	settings: {
		components: [SettingsComponent],
	},
});
