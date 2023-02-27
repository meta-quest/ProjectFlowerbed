/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { AXES, BUTTONS, TRIGGERS } from '../../lib/ControllerInterface';
import {
	PhotoComponent,
	ScreenshotCameraComponent,
} from '../../components/ScreenshotCameraComponent';

import { AssetURLs } from '@config/AssetURLs';
import { GameStateComponent } from '../../components/GameStateComponent';
import { InteractionSystem } from '../../lib/InteractionSystem';
import { Object3DComponent } from '../../components/Object3DComponent';
import { OneshotAudioComponent } from '../../components/AudioComponents';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { SCREENSHOT_CAMERA_CONSTANTS } from '../../Constants';
import { SceneLightingComponent } from '../../components/SceneLightingComponent';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { getOnlyEntity } from '../../utils/entityUtils';
import { updateMatrixRecursively } from 'src/js/utils/object3dUtils';

const INTERACTION_MODES = GameStateComponent.INTERACTION_MODES;
const PRINT_FOV = false;
const PRINT_WATERMARK = false;

export class ScreenshotCameraSystem extends InteractionSystem {
	constructor(world, attributes) {
		super(world, attributes);
		this.interactionMode = INTERACTION_MODES.CAMERA;
	}

	init() {
		this.renderTimer = 1 / SCREENSHOT_CAMERA_CONSTANTS.RENDER_FRAME_RATE;
		this.textureLoader = new THREE.TextureLoader();
		this.isPrintingPhoto = false;
		this.printTimer = 0;
		this.currentPhotoTexture = null;
		this.currentPhotoDataUrl = null;
		this.currentPhotoEntity = null;
		this.shutterTimer = 0;
		this.shutterReleaseButtonYPosition = null;

		if (PRINT_WATERMARK) {
			this.waterMarkImage = new Image();
			this.waterMarkImage.src = AssetURLs.SCREENSHOT_CAMERA.WATER_MARK;
		}

		this.testRender = false;
	}

	onEnterVR() {
		/**
		 * detach the camera from user grip, put it above user, spin 360,
		 * render camera preview and photo in every angle, reattach to user
		 * grip. Temporary patch, should think about something cleaner in
		 * the future
		 */
		const cameraEntity = getOnlyEntity(this.queries.camera, false);
		if (!cameraEntity) return;
		const cameraObject = cameraEntity.getComponent(Object3DComponent).value;
		const cameraParent = cameraObject.parent;
		const cameraPosition = cameraObject.position.clone();
		const cameraQuaternion = cameraObject.quaternion.clone();
		this.playerStateComponent.viewerTransform.attach(cameraObject);
		cameraObject.position.set(0, 4, 0);
		cameraObject.quaternion.set(0, 0, 0, 1);
		let spinJobRuns = 0;
		const cameraComponent = cameraEntity.getComponent(
			ScreenshotCameraComponent,
		);
		const spinJobId = setInterval(() => {
			spinJobRuns += 1;
			cameraObject.rotateY(Math.PI / 4);
			this.renderCameraFrame(cameraComponent);

			let lightingComponent = null;
			this.queries.gameManager.results.forEach((entity) => {
				lightingComponent = entity.getMutableComponent(SceneLightingComponent);
			});
			lightingComponent.setCameraOverride(
				cameraComponent.photoCamera,
				false,
				true,
			);
			cameraComponent.photoRenderer.render(
				this.threeGlobalComponent.scene,
				cameraComponent.photoCamera,
			);
			lightingComponent.clearCameraOverride();
			if (spinJobRuns >= 8) {
				clearInterval(spinJobId);
				cameraParent.attach(cameraObject);
				cameraObject.position.copy(cameraPosition);
				cameraObject.quaternion.copy(cameraQuaternion);
			}
			updateMatrixRecursively(cameraObject);
		}, 100);
	}

	onEnterMode() {
		const cameraEntity = getOnlyEntity(this.queries.camera, false);
		if (cameraEntity) {
			cameraEntity.getComponent(Object3DComponent).value.visible = true;

			if (this.shutterReleaseButtonYPosition === null) {
				const cameraObject = cameraEntity.getComponent(Object3DComponent).value;
				const shutterReleaseButton = cameraObject.getObjectByName(
					'shutter_release_button',
				);
				this.shutterReleaseButtonYPosition = shutterReleaseButton.position.y;
			}
		}
	}

	onExitMode() {
		const cameraEntity = getOnlyEntity(this.queries.camera, false);
		if (cameraEntity) {
			cameraEntity.getComponent(Object3DComponent).value.visible = false;
			this.renderTimer = 0;
		}
	}

	onCorrectInteractionMode(delta, _time) {
		const cameraEntity = getOnlyEntity(this.queries.camera, false);
		if (!cameraEntity) return;

		const didMove = getOnlyEntity(this.queries.player, false)?.getComponent(
			PlayerStateComponent,
		).didMove;

		const cameraComponent = cameraEntity.getComponent(
			ScreenshotCameraComponent,
		);
		const cameraObject = cameraEntity.getComponent(Object3DComponent).value;

		const previewCamera = cameraComponent.previewCamera;
		const photoCamera = cameraComponent.photoCamera;
		const fovDelta = this.controllerInterfaces.LEFT.triggerPressed(
			TRIGGERS.HAND_TRIGGER,
		)
			? 5
			: 1;
		if (this.controllerInterfaces.LEFT.buttonJustPressed(BUTTONS.BUTTON_1)) {
			previewCamera.fov -= fovDelta;
			previewCamera.updateProjectionMatrix();
			photoCamera.fov -= fovDelta;
			photoCamera.updateProjectionMatrix();
		}
		if (this.controllerInterfaces.LEFT.buttonJustPressed(BUTTONS.BUTTON_2)) {
			previewCamera.fov += fovDelta;
			previewCamera.updateProjectionMatrix();
			photoCamera.fov += fovDelta;
			photoCamera.updateProjectionMatrix();
		}

		// lower frame rate when player is doing joystick movement to alleviate
		// camera shaky when moving problem
		this.renderTimer -=
			delta *
			(didMove
				? SCREENSHOT_CAMERA_CONSTANTS.FRAME_RATE_MULTIPLIER_WHEN_MOVING
				: 1);
		if (this.renderTimer <= 0) {
			this.renderCameraFrame(cameraComponent);
			this.renderTimer = 1 / SCREENSHOT_CAMERA_CONSTANTS.RENDER_FRAME_RATE;
		}

		const controller = this.controllerInterfaces.RIGHT;

		if (this.isPrintingPhoto) {
			this.printTimer += delta;
			this.printPhoto(cameraObject);
		} else if (controller.triggerJustPressed(TRIGGERS.INDEX_TRIGGER)) {
			this.shutterTimer = SCREENSHOT_CAMERA_CONSTANTS.SHUTTER_EFFECT_DURATION;
			this.renderPhoto(cameraComponent, cameraObject);
			controller.pulse(
				0.1,
				SCREENSHOT_CAMERA_CONSTANTS.PHOTO_PRINTING_DURATION * 1000,
			);

			OneshotAudioComponent.createSFX(this.world, {
				id: 'CAMERA_SHUTTER',
				position: controller.getPosition(),
			});
		}

		const shutterReleaseButton = cameraObject.getObjectByName(
			'shutter_release_button',
		);
		shutterReleaseButton.position.y =
			this.shutterReleaseButtonYPosition +
			controller.getAxisInput(AXES.INDEX_TRIGGER) *
				SCREENSHOT_CAMERA_CONSTANTS.SHUTTER_BUTTON_DEPRESSED_Y_OFFSET;
		this.shutterTimer -= delta;
		if (this.shutterTimer <= 0) {
			this.shutterTimer = 0;
		} else {
			this.playShutterEffect(cameraComponent);
		}
		updateMatrixRecursively(cameraObject);
	}

	renderToTarget(camera, renderTarget, staticShadowsOnly) {
		// override camera
		let lightingComponent = null;
		let renderer = this.threeGlobalComponent.renderer;
		this.queries.gameManager.results.forEach((entity) => {
			lightingComponent = entity.getMutableComponent(SceneLightingComponent);
		});

		lightingComponent.setCameraOverride(camera, staticShadowsOnly, false);
		let oldRenderTarget = renderer.getRenderTarget();

		let oldXREnabled = false;
		if (renderer.xr) {
			oldXREnabled = renderer.xr.enabled;
			renderer.xr.enabled = false;
		}

		renderer.setRenderTarget(renderTarget);

		renderer.render(this.threeGlobalComponent.scene, camera);
		renderer.setRenderTarget(oldRenderTarget);

		if (renderer.xr) {
			renderer.xr.enabled = oldXREnabled;
		}

		lightingComponent.clearCameraOverride();
	}

	/**
	 * Render one frame of camera live view with lower resolution and stricter frustum culling
	 * @param {ScreenshotCameraComponent} cameraComponent
	 */
	renderCameraFrame(cameraComponent) {
		this.renderToTarget(
			cameraComponent.previewCamera,
			cameraComponent.previewRenderTarget,
			true,
		);

		cameraComponent.screen.material.map =
			cameraComponent.previewRenderTarget.texture;
	}

	/**
	 * Update shutter effect opacity according to shutter timer
	 * @param {ScreenshotCameraComponent} cameraComponent
	 */
	playShutterEffect(cameraComponent) {
		cameraComponent.shutterEffect.material.opacity =
			(this.shutterTimer - 0) /
			SCREENSHOT_CAMERA_CONSTANTS.SHUTTER_EFFECT_DURATION;
	}

	/**
	 * Render photo taken with higher resolution and relaxed frustum culling
	 * @param {ScreenshotCameraComponent} cameraComponent
	 */
	renderPhoto(cameraComponent, cameraObject) {
		if (this.currentPhotoEntity) {
			const photoObject = this.currentPhotoEntity.getComponent(
				Object3DComponent,
			)?.value;

			if (photoObject && photoObject.parent == cameraObject) {
				this.threeGlobalComponent.scene.attach(photoObject);
				const photoComponent = this.currentPhotoEntity.getMutableComponent(
					PhotoComponent,
				);
				if (photoComponent) photoComponent.attached = false;
			} else {
				this.currentPhotoEntity = null;
			}
		}
		// override camera
		let lightingComponent = null;
		this.queries.gameManager.results.forEach((entity) => {
			lightingComponent = entity.getMutableComponent(SceneLightingComponent);
		});
		lightingComponent.setCameraOverride(
			cameraComponent.photoCamera,
			false,
			true,
		);

		cameraComponent.photoRenderer.render(
			this.threeGlobalComponent.scene,
			cameraComponent.photoCamera,
		);
		lightingComponent.clearCameraOverride();

		const rawCanvas = cameraComponent.photoRenderer.domElement;

		const processedCanvas = this.processPhoto(
			rawCanvas,
			cameraComponent.photoCamera,
		);

		//
		// Handle portrait rotations of the camera.
		//
		let rotatedCanvas = null;
		const cameraRotation = new THREE.Matrix4();
		cameraRotation.extractRotation(cameraObject.matrixWorld);
		// Get camera up vector in world space
		const cameraUp = new THREE.Vector3(0.0, 1.0, 0.0);
		cameraUp.applyMatrix4(cameraRotation);
		// Get camera right vector in world space
		const cameraRight = new THREE.Vector3(1.0, 0.0, 0.0);
		cameraRight.applyMatrix4(cameraRotation);

		// if camera is in roughly portrait mode, rotate the downloaded photo appropriately.
		// Compare up axis y-component to tell that the camera is not pointing approximately forward,
		// then check the right-axis y-component to confirm that that the camera is in oriented in
		// portrait mode (vs. looking down at ground, up at sky).
		let needPortraitMode =
			cameraUp.y < 0.707 && Math.abs(cameraRight.y) > 0.707;

		if (needPortraitMode) {
			rotatedCanvas = this.rotatePhoto(
				rawCanvas,
				cameraRight.y > 0.0 ? true : false, //rotate clockwise
			);
		} else {
			rotatedCanvas = rawCanvas;
		}

		const _this = this;

		const photoGeometry = new THREE.PlaneGeometry(
			(processedCanvas.width / processedCanvas.height) *
				(SCREENSHOT_CAMERA_CONSTANTS.PHOTO_HEIGHT -
					SCREENSHOT_CAMERA_CONSTANTS.PREVIEW_PADDING[1]),
			SCREENSHOT_CAMERA_CONSTANTS.PHOTO_HEIGHT -
				SCREENSHOT_CAMERA_CONSTANTS.PREVIEW_PADDING[0],
		);
		const backerGeometry = new THREE.PlaneGeometry(
			(processedCanvas.width / processedCanvas.height) *
				SCREENSHOT_CAMERA_CONSTANTS.PHOTO_HEIGHT,
			SCREENSHOT_CAMERA_CONSTANTS.PHOTO_HEIGHT,
		);
		const photoObject = new THREE.Group();

		const backMesh = new THREE.Mesh(
			backerGeometry,
			new THREE.MeshBasicMaterial({
				color: 0xffffff,
				side: THREE.DoubleSide,
			}),
		);

		// back side with solid color
		photoObject.add(backMesh);

		cameraObject.add(photoObject);
		photoObject.position.copy(
			cameraObject.getObjectByName('photo_start').position,
		);
		const photoEntity = _this.world.createEntity();
		photoEntity.addComponent(Object3DComponent, { value: photoObject });
		_this.currentPhotoEntity = photoEntity;
		_this.isPrintingPhoto = true;
		_this.readyToSavePhoto = false;
		_this.printTimer = 0;

		photoEntity.addComponent(OneshotAudioComponent, {
			id: 'CAMERA_PICTURE_SLIDING',
			position: photoObject.position,
		});

		const savedRenderTarget = new THREE.WebGLRenderTarget(
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PREVIEW_RESOLUTION_WIDTH,
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PREVIEW_RESOLUTION_HEIGHT,
			{ samples: 4, generateMipmaps: true },
		);
		this.renderToTarget(cameraComponent.previewCamera, savedRenderTarget, true);

		_this.photoMaterial = new THREE.MeshBasicMaterial({
			map: savedRenderTarget.texture,
			transparent: false,
			opacity: 1.0,
		});

		const photoMesh = new THREE.Mesh(photoGeometry, _this.photoMaterial);
		// offset this a bit to avoid zfighting
		photoMesh.position.z += 0.0001;

		// front side with texture
		photoObject.add(photoMesh);

		_this.currentPhotoTexture = savedRenderTarget.texture;
		_this.currentPhotoDataUrl = rotatedCanvas.toDataURL('image/jpeg', 0.9);
	}

	processPhoto(canvas, camera) {
		const newCanvas = document.createElement('CANVAS');
		newCanvas.width =
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PREVIEW_RESOLUTION_WIDTH +
			SCREENSHOT_CAMERA_CONSTANTS.PHOTO_PADDING[1] +
			SCREENSHOT_CAMERA_CONSTANTS.PHOTO_PADDING[3];
		newCanvas.height =
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PREVIEW_RESOLUTION_HEIGHT +
			SCREENSHOT_CAMERA_CONSTANTS.PHOTO_PADDING[0] +
			SCREENSHOT_CAMERA_CONSTANTS.PHOTO_PADDING[2];
		const ctx = newCanvas.getContext('2d');

		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);
		ctx.drawImage(
			canvas,
			SCREENSHOT_CAMERA_CONSTANTS.PHOTO_PADDING[3],
			SCREENSHOT_CAMERA_CONSTANTS.PHOTO_PADDING[0],
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PREVIEW_RESOLUTION_WIDTH,
			SCREENSHOT_CAMERA_CONSTANTS.CAMERA_PREVIEW_RESOLUTION_HEIGHT,
		);

		if (PRINT_WATERMARK) {
			ctx.drawImage(
				this.waterMarkImage,
				newCanvas.width -
					SCREENSHOT_CAMERA_CONSTANTS.PHOTO_PADDING[1] -
					SCREENSHOT_CAMERA_CONSTANTS.PHOTO_WATERMARK_OFFSET -
					SCREENSHOT_CAMERA_CONSTANTS.PHOTO_WATERMARK_SIZE,
				newCanvas.height -
					SCREENSHOT_CAMERA_CONSTANTS.PHOTO_PADDING[3] -
					SCREENSHOT_CAMERA_CONSTANTS.PHOTO_WATERMARK_OFFSET -
					SCREENSHOT_CAMERA_CONSTANTS.PHOTO_WATERMARK_SIZE,
				SCREENSHOT_CAMERA_CONSTANTS.PHOTO_WATERMARK_SIZE,
				SCREENSHOT_CAMERA_CONSTANTS.PHOTO_WATERMARK_SIZE,
			);
		}

		if (PRINT_FOV) {
			ctx.font = 'bold 50pt Calibri';
			ctx.fillStyle = 'black';
			ctx.fillText('FOV - ' + camera.fov, 20, 70);
		}

		return newCanvas;
	}

	rotatePhoto(canvas, rotateClockwise) {
		const newCanvas = document.createElement('CANVAS');
		newCanvas.width = canvas.height;
		newCanvas.height = canvas.width;
		const ctx = newCanvas.getContext('2d');

		if (rotateClockwise) {
			ctx.translate(0.0, newCanvas.height);
			ctx.rotate(Math.PI * -0.5);
		} else {
			ctx.translate(newCanvas.width, 0.0);
			ctx.rotate(Math.PI * 0.5);
		}

		ctx.drawImage(canvas, 0, 0);

		return newCanvas;
	}

	printPhoto(cameraObject) {
		const photoObject = this.currentPhotoEntity.getComponent(Object3DComponent)
			.value;

		if (
			this.printTimer >= SCREENSHOT_CAMERA_CONSTANTS.PHOTO_PRINTING_DURATION
		) {
			photoObject.position.copy(
				cameraObject.getObjectByName('photo_end').position,
			);
			this.printTimer = 0;
			this.isPrintingPhoto = false;

			this.currentPhotoEntity.addComponent(PhotoComponent, {
				texture: this.currentPhotoTexture,
				rawDataUrl: this.currentPhotoDataUrl,
			});
		} else {
			const deltaVector = new THREE.Vector3()
				.subVectors(
					cameraObject.getObjectByName('photo_end').position,
					cameraObject.getObjectByName('photo_start').position,
				)
				.multiplyScalar(
					this.printTimer / SCREENSHOT_CAMERA_CONSTANTS.PHOTO_PRINTING_DURATION,
				);
			photoObject.position.copy(
				deltaVector.add(cameraObject.getObjectByName('photo_start').position),
			);
		}
		photoObject.updateMatrix();
	}
}

ScreenshotCameraSystem.addQueries({
	gameManager: {
		components: [THREEGlobalComponent, SceneLightingComponent],
	},
	camera: { components: [ScreenshotCameraComponent, Object3DComponent] },
	player: { components: [PlayerStateComponent] },
});
