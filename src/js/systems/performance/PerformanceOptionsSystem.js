/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { GameStateComponent } from '../../components/GameStateComponent';
import { Light } from '../../components/GameObjectTagComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { PerformanceOptionsComponent } from '../../components/PerformanceOptionsComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';

export class PerformanceOptionsSystem extends System {
	init() {
		this.perfUI = null;
		this.renderer = null;
		this.camera = null;
	}

	execute() {
		let allAssetsLoaded;
		let light;

		this.queries.gameManager.added.forEach((entity) => {
			this.perfUI = entity.getComponent(PerformanceOptionsComponent).perfUI;
			this.renderer = entity.getComponent(THREEGlobalComponent).renderer;
			this.camera = entity.getComponent(THREEGlobalComponent).camera;
		});

		if (!this.perfUI || !this.renderer || !this.camera) return;

		this.queries.gameState.results.forEach((entity) => {
			let gamestateComponent = entity.getComponent(GameStateComponent);
			allAssetsLoaded = gamestateComponent.allAssetsLoaded;
		});

		this.queries.light.results.forEach((entity) => {
			let object3DComponent = entity.getComponent(Object3DComponent);
			light = object3DComponent.value;
		});

		if (!light) return;

		updatePerformanceOptions(
			this.renderer,
			this.camera,
			this.perfUI,
			allAssetsLoaded,
			light,
		);
	}
}

PerformanceOptionsSystem.queries = {
	gameManager: {
		components: [PerformanceOptionsComponent, THREEGlobalComponent],
		listen: { added: true },
	},
	gameState: { components: [GameStateComponent] },
	light: { components: [Light] },
};

/**
 * Apply changes in performance options UI
 * @param {THREE.WebGLRenderer} renderer - webgl renderer for the game scene
 * @param {THREE.Camera} camera - camera used for rendering
 * @param {VRPerformanceUI} perfUI - performance UI object
 * @param {Boolean} allAssetsLoaded - flag for whether all assets have been loaded
 * @param {THREE.Light} light - main lighting in the scene
 */
const updatePerformanceOptions = (
	renderer,
	camera,
	perfUI,
	allAssetsLoaded,
	light,
) => {
	if (perfUI.pendingChange) {
		let options = perfUI.getPerfOptions();

		// update enable shadow
		let es = options.enableShadows;
		if (es.needsUpdate) {
			renderer.shadowMap.enabled = es.value;
			light.castShadow = es.value;
			console.log('update enable shadow state to: ' + es.value);
		}

		// update shadow map size
		let sms = options.shadowMapSize;
		if (sms.needsUpdate) {
			light.shadow.map = null;
			light.shadow.mapSize.set(sms.value, sms.value);
			renderer.shadowMap.needsUpdate = true;
			console.log('update shadow map size to: ' + sms.value);
		}

		// update rendering distance
		let rd = options.renderingDistance;
		if (rd.needsUpdate) {
			camera.far = parseInt(rd.value);
			camera.updateProjectionMatrix();
			console.log('update rendering distance to: ' + rd.value);
		}

		// update frame buffer scale
		let fbs = options.frameBufferScaleFactor;
		if (fbs.needsUpdate) {
			renderer.xr.setFramebufferScaleFactor(fbs.value);
			console.log('update frame buffer scale to: ' + fbs.value);
		}

		perfUI.resetChangeState();
	}

	if (
		renderer.shadowMap.enabled &&
		renderer.shadowMap.autoUpdate &&
		allAssetsLoaded
	) {
		console.log('disable shadow map auto update');
		renderer.shadowMap.autoUpdate = false;
	}
};
