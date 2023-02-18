/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import {
	MODE_SELECTION_WHEEL_CONSTANTS,
	SCREENSHOT_CAMERA_CONSTANTS,
} from '../../Constants';
import {
	PhotoComponent,
	PhotoMenuComponent,
} from '../../components/ScreenshotCameraComponent';
import { deleteEntity, getOnlyEntity } from '../../utils/entityUtils';

import { GameStateComponent } from '../../components/GameStateComponent';
import { InteractionSystem } from '../../lib/InteractionSystem';
import { MeshIdComponent } from 'src/js/components/AssetReplacementComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { OneshotAudioComponent } from '../../components/AudioComponents';
import { TRIGGERS } from '../../lib/ControllerInterface';
import { updateMatrixRecursively } from '../../utils/object3dUtils';
import { usedPhotoButtonEvent } from '../../lib/CustomEvents';

const INTERACTION_MODES = GameStateComponent.INTERACTION_MODES;
const PHOTO_ACTION = {
	DELETE: 0,
	SAVE: 1,
};

export class PhotoSystem extends InteractionSystem {
	constructor(world, attributes) {
		super(world, attributes);
		this.interactionMode = INTERACTION_MODES.CAMERA;
	}

	init() {
		this.targetRing = null;
		this.photoInHand = null;
		this.deleteButton = null;
		this.saveButton = null;
		this.actionButtons = null;
		this.cameraPosition = new THREE.Vector3();
		this.actionToTake = null;
	}

	onEnterMode() {
		if (!this.targetRing) this._setupTargetRing();
		const photoMenuEntity = getOnlyEntity(this.queries.photoMenu);
		this.actionButtons = photoMenuEntity.getComponent(Object3DComponent).value;
		this.deleteButton = photoMenuEntity.getComponent(
			PhotoMenuComponent,
		).deleteButton;
		this.saveButton = photoMenuEntity.getComponent(
			PhotoMenuComponent,
		).saveButton;
	}

	onExitMode() {
		this._detachPhoto();
		this.targetRing.visible = false;
		this.actionButtons.visible = false;
	}

	onCorrectInteractionMode(_delta, _time) {
		const grabbingController = this.controllerInterfaces.LEFT;

		this.targetRing.visible = false;
		this.threeGlobalComponent.renderer.xr
			.getCamera()
			.getWorldPosition(this.cameraPosition);

		if (!this.photoInHand) {
			// if no photo in hand, find closest photo within grab distance
			const [
				closestGrabbablePhotoEntity,
				closestDistance,
			] = this._findClosestGrabbablePhoto(grabbingController);

			if (closestGrabbablePhotoEntity) {
				if (
					closestDistance <= SCREENSHOT_CAMERA_CONSTANTS.PHOTO_GRAB_DISTANCE &&
					grabbingController.triggerPressed(TRIGGERS.INDEX_TRIGGER)
				) {
					// if grabbing, attach photo
					this._attachPhoto(closestGrabbablePhotoEntity, grabbingController);
				} else {
					// if not grabbing, update target ring
					this.targetRing.visible = true;
					this._updateTargetRing(closestGrabbablePhotoEntity, closestDistance);
				}
			}
		} else {
			this._updateActionButtons();
			if (!grabbingController.triggerPressed(TRIGGERS.INDEX_TRIGGER)) {
				this.actionButtons.visible = false;
				// if not grabbing, detach photo
				if (this.actionToTake != null) {
					switch (this.actionToTake) {
						case PHOTO_ACTION.DELETE:
							OneshotAudioComponent.createSFX(this.world, {
								id: 'CAMERA_DELETE',
								position: this.actionButtons.getWorldPosition(
									new THREE.Vector3(),
								),
							});
							this._deletePhoto(this.photoInHand);
							break;
						case PHOTO_ACTION.SAVE:
							OneshotAudioComponent.createSFX(this.world, {
								id: 'CAMERA_SAVE',
								position: this.actionButtons.getWorldPosition(
									new THREE.Vector3(),
								),
							});
							this._savePhoto(this.photoInHand);
							break;
						default:
							break;
					}
				} else {
					this._detachPhoto();
				}
			}
		}
	}

	/**
	 * Attach photo to controller
	 * @param {import('ecsy').Entity} entity - closest grabbable photo entity
	 * @param {import('../../lib/ControllerInterface').ControllerInterface} controller
	 */
	_attachPhoto(entity, controller) {
		const photoObject = entity.getComponent(Object3DComponent).value;
		const photoComponent = entity.getMutableComponent(PhotoComponent);
		controller.controllerModel.parent.attach(photoObject);
		photoComponent.attached = true;
		photoComponent.deleteTimer =
			SCREENSHOT_CAMERA_CONSTANTS.PHOTO_EXPIRATION_TIME;
		this.photoInHand = entity;

		this.actionButtons.position.copy(
			photoObject.getWorldPosition(new THREE.Vector3()),
		);
		this.actionButtons.visible = true;
		this.actionButtons.updateMatrix();
		this.actionButtons.lookAt(this.cameraPosition);
		updateMatrixRecursively(this.actionButtons);
	}

	/**
	 * Detach photo from controller and reparent it to the scene
	 */
	_detachPhoto() {
		if (!this.photoInHand) return;
		const photoComponent = this.photoInHand.getMutableComponent(PhotoComponent);
		const photoObject = this.photoInHand.getComponent(Object3DComponent).value;
		this.threeGlobalComponent.scene.attach(photoObject);
		photoComponent.attached = false;
		this.photoInHand = null;
	}

	/**
	 * Delete photo entities and reset photo in hand
	 * @param {import('ecsy').Entity} photoEntity
	 */
	_deletePhoto(photoEntity) {
		if (this.photoInHand == photoEntity) {
			this.photoInHand = null;
		}
		deleteEntity(this.threeGlobalComponent.scene, photoEntity);

		// event is used in the CameraPhotoGrabTooltipSystem to know that the user
		// has successfully saved or deleted a photo
		window.dispatchEvent(usedPhotoButtonEvent);
	}

	/**
	 * Save and delete photo entities and reset photo in hand
	 * @param {import('ecsy').Entity} photoEntity
	 */
	_savePhoto(photoEntity) {
		const photoComponent = photoEntity.getComponent(PhotoComponent);
		const link = document.createElement('a');
		link.download = 'woodland' + new Date().getTime() + '.png';
		link.href = photoComponent.rawDataUrl;
		link.click();
		this._deletePhoto(photoEntity);
	}

	/**
	 * Find the closest grabbable photo and its distance to the controller
	 * @param {import('../../lib/ControllerInterface').ControllerInterface} controller
	 * @returns {[import('ecsy').Entity, Number]}
	 */
	_findClosestGrabbablePhoto(controller) {
		let closestGrabbablePhotoEntity = null;
		let closestDistance = Infinity;
		this.queries.photo.results.forEach((entity) => {
			const photoObject = entity.getComponent(Object3DComponent).value;
			const distance = photoObject
				.getWorldPosition(new THREE.Vector3())
				.distanceTo(controller.getPosition());
			if (
				distance <= SCREENSHOT_CAMERA_CONSTANTS.PHOTO_HIGHLIGHT_DISTANCE &&
				distance <= closestDistance
			) {
				closestGrabbablePhotoEntity = entity;
				closestDistance = distance;
			}
		});
		return [closestGrabbablePhotoEntity, closestDistance];
	}

	/**
	 * Update the target ring opacity according to distance
	 * @param {import('ecsy').Entity} entity - closest grabbable photo entity
	 * @param {Number} distance - distance between the photo entity and controller
	 */
	_updateTargetRing(entity, distance) {
		const photoObject = entity.getComponent(Object3DComponent).value;
		this.targetRing.material.opacity =
			distance <= SCREENSHOT_CAMERA_CONSTANTS.PHOTO_GRAB_DISTANCE
				? 1
				: (SCREENSHOT_CAMERA_CONSTANTS.PHOTO_HIGHLIGHT_DISTANCE - distance) /
				  (SCREENSHOT_CAMERA_CONSTANTS.PHOTO_HIGHLIGHT_DISTANCE -
						SCREENSHOT_CAMERA_CONSTANTS.PHOTO_GRAB_DISTANCE);
		this.targetRing.position.copy(
			photoObject.getWorldPosition(new THREE.Vector3()),
		);
		this.targetRing.lookAt(this.cameraPosition);
		this.targetRing.updateMatrix();
	}

	/**
	 * Create target ring to highlight closest grabbable photo
	 */
	_setupTargetRing() {
		this.targetRing = new THREE.Mesh(
			new THREE.RingGeometry(0.015, 0.022, 32),
			new THREE.MeshBasicMaterial({
				color: 0xffffff,
				side: THREE.DoubleSide,
				transparent: true,
			}),
		);
		this.targetRing.visible = false;
		this.threeGlobalComponent.scene.add(this.targetRing);
		this.targetRing.renderOrder = 999;
		this.targetRing.material.depthTest = false;
		this.targetRing.material.depthWrite = false;
	}

	/**
	 * Check and update the action buttons
	 */
	_updateActionButtons() {
		const photoObject = this.photoInHand.getComponent(Object3DComponent).value;
		this.actionToTake = null;
		[
			[this.deleteButton, PHOTO_ACTION.DELETE],
			[this.saveButton, PHOTO_ACTION.SAVE],
		].forEach(([buttonMesh, action]) => {
			const distance = photoObject
				.getWorldPosition(new THREE.Vector3())
				.distanceTo(buttonMesh.getWorldPosition(new THREE.Vector3()));
			let tileFace = buttonMesh.faceMesh;
			if (distance < 0.08) {
				tileFace.material.color.setHex(
					MODE_SELECTION_WHEEL_CONSTANTS.TILE_FACE_COLOR_SELECTED,
				);
				this.actionToTake = action;
			} else {
				tileFace.material.color.setHex(
					MODE_SELECTION_WHEEL_CONSTANTS.TILE_FACE_COLOR_DEFAULT,
				);
			}
		});
		updateMatrixRecursively(this.actionButtons);
	}
}

PhotoSystem.addQueries({
	photo: { components: [PhotoComponent] },
	photoMenu: {
		components: [Object3DComponent, MeshIdComponent, PhotoMenuComponent],
	},
});
