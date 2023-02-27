/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { SCREENSHOT_CAMERA_CONSTANTS, THREEJS_LAYERS } from '../../Constants';
import { deleteEntity, getOnlyEntity } from '../../utils/entityUtils';

import { MeshIdComponent } from '../../components/AssetReplacementComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { PROP_TRANSFORM_OFFSET } from '../../PropsTransformOffset';
import { SceneLightingComponent } from 'src/js/components/SceneLightingComponent';
import { ScreenshotCameraComponent } from '../../components/ScreenshotCameraComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from 'src/js/components/THREEGlobalComponent';
import { VrControllerComponent } from 'src/js/components/VrControllerComponent';

export class ScreenshotCameraCreationSystem extends System {
	init() {
		this.cameraAssetEntity = null;
		this.screenshotCameraEntity = null;
		const gameManager = getOnlyEntity(this.queries.gameManager);
		this.threeGlobalComponent = gameManager.getComponent(THREEGlobalComponent);
		this.lightingComponent = gameManager.getMutableComponent(
			SceneLightingComponent,
		);
		this.cameraAttachedToHand = false;
	}

	execute(_delta, _time) {
		if (this.cameraAssetEntity == null) {
			this.cameraAssetEntity = this.world.createEntity();
			const placeholderObject = new THREE.Object3D();
			this.threeGlobalComponent.scene.add(placeholderObject);
			this.cameraAssetEntity.addComponent(Object3DComponent, {
				value: placeholderObject,
			});
			this.cameraAssetEntity.addComponent(MeshIdComponent, { id: 'CAMERA' });
			return;
		}

		if (this.cameraAssetEntity.getComponent(MeshIdComponent).modelHasChanged) {
			// clean up old screenshotCameraEntity
			if (this.screenshotCameraEntity) {
				deleteEntity(
					this.threeGlobalComponent.scene,
					this.screenshotCameraEntity,
				);
			}

			this.setupScreenshotCamera();
		}

		if (!this.cameraAttachedToHand && this.screenshotCameraEntity) {
			this.queries.controllers.results.forEach((entity) => {
				let vrControllerComponent = entity.getComponent(VrControllerComponent);
				if (vrControllerComponent.handedness == 'right') {
					const cameraParent = this.threeGlobalComponent.renderer.xr.getControllerGrip(
						vrControllerComponent.threeControllerIdx,
					);
					const cameraObject = this.screenshotCameraEntity.getComponent(
						Object3DComponent,
					).value;
					cameraParent.add(cameraObject);
					cameraObject.updateMatrix();
					this.cameraAttachedToHand = true;
				}
			});
		}
	}

	setupScreenshotCamera() {
		const cameraParent = this.threeGlobalComponent.renderer.xr.getControllerGrip(
			1,
		);
		const cameraObject = this.cameraAssetEntity.getComponent(Object3DComponent)
			.value;

		const transformOffset = PROP_TRANSFORM_OFFSET['CAMERA'];

		cameraObject.position.fromArray(transformOffset.position);
		cameraObject.quaternion.fromArray(transformOffset.quaternion);
		cameraObject.scale.fromArray(transformOffset.scale);
		this.screenshotCameraEntity = this.world.createEntity();
		this.screenshotCameraEntity.addComponent(Object3DComponent, {
			value: cameraObject,
		});
		cameraObject.updateMatrix();
		cameraParent.add(cameraObject);
		cameraObject.visible = false;

		// create perspective camera for live preview
		const cameraAnchor = cameraObject.getObjectByName('camera_anchor');
		const previewCamera = new THREE.PerspectiveCamera(
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_FOV,
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PREVIEW_RESOLUTION_WIDTH /
				SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PREVIEW_RESOLUTION_HEIGHT,
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PREVIEW_NEAR,
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PREVIEW_FAR,
		);
		previewCamera.layers.enable(THREEJS_LAYERS.SCREENSHOT_ONLY);
		cameraAnchor.add(previewCamera);

		const previewRenderTarget = new THREE.WebGLRenderTarget(
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PREVIEW_RESOLUTION_WIDTH,
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PREVIEW_RESOLUTION_HEIGHT,
			{ samples: 4, generateMipmaps: true },
		);

		// create camera screen for live feed
		const screenAnchor = cameraObject.getObjectByName('screen_anchor');
		const screenGeometry = new THREE.PlaneGeometry(
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_SCREEN_WIDTH,
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_SCREEN_HEIGHT,
		);
		const screen = new THREE.Mesh(
			screenGeometry,
			new THREE.MeshBasicMaterial({
				map: new THREE.Texture(),
			}),
		);
		screenAnchor.add(screen);
		const shutterEffect = new THREE.Mesh(
			screenGeometry,
			new THREE.MeshBasicMaterial({
				transparent: true,
				color: 0xffffff,
				opacity: 0,
			}),
		);
		shutterEffect.position.z = 0.00001;
		shutterEffect.updateMatrix();
		screenAnchor.add(shutterEffect);

		// create perspective camera for taking photo
		const photoCamera = new THREE.PerspectiveCamera(
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_FOV,
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PHOTO_RESOLUTION_WIDTH /
				SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PHOTO_RESOLUTION_HEIGHT,
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PHOTO_NEAR,
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PHOTO_FAR,
		);
		photoCamera.layers.enable(THREEJS_LAYERS.SCREENSHOT_ONLY);
		cameraAnchor.add(photoCamera);

		// create renderer for rendering photo taken
		const photoRenderer = new THREE.WebGLRenderer({ antialias: true });
		photoRenderer.setPixelRatio(
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PHOTO_RESOLUTION_WIDTH /
				SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PHOTO_RESOLUTION_HEIGHT,
		);
		photoRenderer.setSize(
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PHOTO_RESOLUTION_WIDTH,
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PHOTO_RESOLUTION_HEIGHT,
		);
		photoRenderer.outputEncoding = THREE.sRGBEncoding;
		photoRenderer.shadowMap.enabled = true;
		photoRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

		this.screenshotCameraEntity.addComponent(ScreenshotCameraComponent, {
			screen,
			shutterEffect,
			previewCamera,
			previewRenderTarget,
			photoCamera,
			photoRenderer,
		});
	}
}

ScreenshotCameraCreationSystem.queries = {
	controllers: { components: [VrControllerComponent] },
	gameManager: { components: [THREEGlobalComponent, SceneLightingComponent] },
};
