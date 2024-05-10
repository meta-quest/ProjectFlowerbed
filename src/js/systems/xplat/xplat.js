/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Group, Object3D, Quaternion, Vector2, Vector3 } from 'three';

import { GameStateComponent } from 'src/js/components/GameStateComponent';
import { SettingsComponent } from 'src/js/components/SettingsComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from 'src/js/components/THREEGlobalComponent';
import { getOnlyEntity } from 'src/js/utils/entityUtils';
import { updateMatrixRecursively } from 'src/js/utils/object3dUtils';

const DEFAULT_POSITIONS = {
	left: new Vector3(-0.18, -0.11, -0.35),
	right: new Vector3(0.18, -0.11, -0.35),
};

export class XPlatControlSystem extends System {
	init(attributes) {
		const gameManager = getOnlyEntity(this.queries.gameManager);
		const { scene, renderer } = gameManager.getComponent(THREEGlobalComponent);
		this._gameState = gameManager.getComponent(GameStateComponent);
		this._scene = scene;
		this._renderer = renderer;
		this._xrdevice = attributes.xrdevice;

		this._quat = new Quaternion();
		this._vec3 = new Vector3();
		this._cameraMovement = [0, 0];

		// emulated player rig
		this._playerSpace = new Group();
		this._scene.add(this._playerSpace);
		this._cameraRig = new Group();
		this._playerSpace.add(this._cameraRig);
		this._cameraRig.position.copy(this._xrdevice.position);
		this._cameraRig.quaternion.copy(this._xrdevice.quaternion);

		// setup left hand proxy
		const leftHandProxy = new Object3D();
		this._cameraRig.add(leftHandProxy);
		leftHandProxy.position.copy(DEFAULT_POSITIONS.left);
		leftHandProxy.userData = {
			targetPosition: new Vector3().copy(leftHandProxy.position),
			targetQuaternion: new Quaternion().copy(leftHandProxy.quaternion),
		};

		// setup right hand proxy
		const rightHandProxy = new Object3D();
		this._cameraRig.add(rightHandProxy);
		rightHandProxy.position.copy(DEFAULT_POSITIONS.right);
		rightHandProxy.userData = {
			targetPosition: new Vector3().copy(rightHandProxy.position),
			targetQuaternion: new Quaternion().copy(rightHandProxy.quaternion),
		};

		this._cameraRig.userData = {
			leftHandProxy,
			rightHandProxy,
		};

		this._keyStates = {
			KeyW: false,
			KeyA: false,
			KeyS: false,
			KeyD: false,
		};

		this._gamemode = GameStateComponent.INTERACTION_MODES.DEFAULT;

		const onDocumentMouseMove = (e) => {
			if (!this._pointerLocked) return;
			const movementX = e.movementX || e.mozMovementX || 0;
			const movementY = e.movementY || e.mozMovementY || 0;
			this._cameraMovement[0] += movementX;
			this._cameraMovement[1] += movementY;
		};

		const onDocumentKeyDown = (e) => {
			if (!this._pointerLocked) return;
			switch (e.code) {
				case 'KeyF':
					if (!this._keyStates[e.code]) {
						this._xrdevice.controllers.right.updateButtonValue('a-button', 1);
					}
					break;
				case 'KeyE':
					if (!this._keyStates[e.code]) {
						if (this._gamemode === 1) {
							this._xrdevice.controllers.left.updateButtonValue('x-button', 1);
						} else if (this._gamemode === 4) {
							leftHandProxy.userData.targetPosition.set(0, -0.11, -0.35);
							leftHandProxy.userData.destCallback = () => {
								this._xrdevice.controllers.left.updateButtonValue('trigger', 1);
							};
						}
					}
					break;
				case 'KeyW':
				case 'KeyA':
				case 'KeyS':
				case 'KeyD':
					this._keyStates[e.code] = true;
					break;
			}

			this._keyStates[e.code] = true;
		};

		const onDocumentKeyUp = (e) => {
			if (!this._pointerLocked) return;
			switch (e.code) {
				case 'KeyF':
					this._xrdevice.controllers.right.updateButtonValue('a-button', 0);
					break;
				case 'KeyE':
					if (this._gamemode === 1) {
						this._xrdevice.controllers.left.updateButtonValue('x-button', 0);
					} else if (this._gamemode === 4) {
						leftHandProxy.userData.targetPosition.copy(DEFAULT_POSITIONS.left);
						leftHandProxy.userData.destCallback = null;
						this._xrdevice.controllers.left.updateButtonValue('trigger', 0);
					}
					break;
				case 'KeyW':
				case 'KeyA':
				case 'KeyS':
				case 'KeyD':
					this._keyStates[e.code] = false;
					break;
			}

			delete this._keyStates[e.code];
		};

		const onCanvasMouseDown = (event) => {
			if (!this._pointerLocked) {
				if (this._canvas.requestPointerLock) {
					this._canvas.requestPointerLock();
				} else {
					throw new Error('canvas.requestPointerLock not supported');
				}
			} else {
				if (event.button === 0) {
					this._xrdevice.controllers.right.updateButtonValue('trigger', 1);
				} else if (event.button === 2) {
					if (this._gamemode === 1) {
						leftHandProxy.userData.targetPosition.set(-0.1, 0, -0.5);
						leftHandProxy.userData.targetQuaternion.fromArray([
							0.3826834323650898,
							0,
							0,
							0.9238795325112867,
						]);
						leftHandProxy.userData.destCallback = () => {
							this._scene.attach(leftHandProxy);
						};
					} else if (this._gamemode === 4) {
						rightHandProxy.userData.targetPosition.set(0.07, 0.05, -0.18);
						rightHandProxy.userData.targetQuaternion.fromArray([
							0.38450312618762766,
							0.07324298621533143,
							0.040356580962121864,
							0.919328101003798,
						]);
					}
				}
			}
		};

		const onCanvasMouseUp = (event) => {
			if (event.button === 0) {
				this._xrdevice.controllers.right.updateButtonValue('trigger', 0);
			} else if (event.button === 2) {
				if (this._gamemode === 1) {
					this._cameraRig.attach(leftHandProxy);
					leftHandProxy.userData.targetPosition.copy(DEFAULT_POSITIONS.left);
					leftHandProxy.userData.targetQuaternion.set(0, 0, 0, 1);
					leftHandProxy.userData.destCallback = null;
				} else if (this._gamemode === 4) {
					rightHandProxy.userData.targetPosition.copy(DEFAULT_POSITIONS.right);
					rightHandProxy.userData.targetQuaternion.set(0, 0, 0, 1);
				}
			}
		};

		this._pointerLocked = false;

		document.addEventListener('pointerlockchange', () => {
			if (document.pointerLockElement) {
				this._pointerLocked = true;
				document.addEventListener('mousemove', onDocumentMouseMove);
			} else {
				this._pointerLocked = false;
				document.removeEventListener('mousemove', onDocumentMouseMove);
			}
		});

		renderer.xr.addEventListener('sessionstart', () => {
			this._canvas = renderer.xr.getBaseLayer().context.canvas;
			this._canvas.requestPointerLock =
				this._canvas.requestPointerLock || this._canvas.mozRequestPointerLock;
			this._canvas.focus();
			this._canvas.addEventListener('mousedown', onCanvasMouseDown);
			this._canvas.addEventListener('mouseup', onCanvasMouseUp);
			document.addEventListener('keydown', onDocumentKeyDown);
			document.addEventListener('keyup', onDocumentKeyUp);
		});

		renderer.xr.addEventListener('sessionend', () => {
			this._canvas.removeEventListener('mousedown', onCanvasMouseDown);
			this._canvas.removeEventListener('mouseup', onCanvasMouseUp);
			document.removeEventListener('keydown', onDocumentKeyDown);
			document.removeEventListener('keyup', onDocumentKeyUp);
			this._canvas = null;
		});
	}

	_syncProxyTransforms(delta) {
		const { leftHandProxy, rightHandProxy } = this._cameraRig.userData;
		const cameraMovement = new Vector2().fromArray(this._cameraMovement);
		this._cameraMovement = [0, 0];

		// move camera
		this._cameraRig.rotateX(-cameraMovement.y * 0.001);
		this._playerSpace.rotateY(-cameraMovement.x * 0.001);
		updateMatrixRecursively(this._playerSpace);

		cameraMovement.set(0, 0);

		// sync transforms
		this._cameraRig.getWorldQuaternion(this._quat);
		this._xrdevice.quaternion.copy(this._quat);

		Object.entries({ left: leftHandProxy, right: rightHandProxy }).forEach(
			([handedness, handProxy]) => {
				if (handProxy.parent === this._cameraRig) {
					const distance = handProxy.position.distanceTo(
						handProxy.userData.targetPosition,
					);
					if (distance > 0) {
						const alpha = (delta * 1.2) / distance;
						if (alpha >= 1) {
							if (handProxy.userData.destCallback) {
								handProxy.userData.destCallback();
							}
							handProxy.position.copy(handProxy.userData.targetPosition);
							handProxy.quaternion.copy(handProxy.userData.targetQuaternion);
						} else {
							handProxy.position.lerp(handProxy.userData.targetPosition, alpha);
							handProxy.quaternion.slerp(
								handProxy.userData.targetQuaternion,
								alpha,
							);
						}
					}

					handProxy.getWorldPosition(this._vec3);
					this._xrdevice.controllers[handedness].position.copy(this._vec3);
					handProxy.getWorldQuaternion(this._quat);
					this._xrdevice.controllers[handedness].quaternion.copy(this._quat);
				}
			},
		);
	}

	_handleJoystickMovement() {
		const deltaX =
			(this._keyStates.KeyD ? 1 : 0) - (this._keyStates.KeyA ? 1 : 0);
		const deltaY =
			(this._keyStates.KeyS ? 1 : 0) - (this._keyStates.KeyW ? 1 : 0);
		const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
		if (magnitude === 0) {
			this._xrdevice.controllers.left.updateAxes('thumbstick', 0, 0);
		} else {
			this._xrdevice.controllers.left.updateAxes(
				'thumbstick',
				deltaX / magnitude,
				deltaY / magnitude,
			);
		}
	}

	execute(delta) {
		if (this._gamemode !== this._gameState.interactionMode) {
			this._gamemode = this._gameState.interactionMode;
		}
		// disabling locomotion vignette on Desktop by default
		const settings = getOnlyEntity(
			this.queries.settings,
			false,
		)?.getMutableComponent(SettingsComponent);
		if (settings && !this._vignetteDisabled) {
			settings.updateSettings({ vignetteEnabled: false });
			this._vignetteDisabled = true;
		}
		this._syncProxyTransforms(delta);
		this._handleJoystickMovement();

		document.getElementById('app-overlay').style.visibility =
			this._renderer.xr.isPresenting && !this._pointerLocked
				? 'visible'
				: 'hidden';
	}
}

XPlatControlSystem.queries = {
	gameManager: {
		components: [THREEGlobalComponent, GameStateComponent],
	},
	settings: {
		components: [SettingsComponent],
	},
};
