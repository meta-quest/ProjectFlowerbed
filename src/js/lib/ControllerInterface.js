/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

export const TRIGGERS = {
	INDEX_TRIGGER: 0,
	HAND_TRIGGER: 1,
};

export const BUTTONS = {
	THUMBSTICK: 0,
	BUTTON_1: 1,
	BUTTON_2: 2,
};

export const AXES = {
	INDEX_TRIGGER: 0,
	HAND_TRIGGER: 1,
	THUMBSTICK_X: 2,
	THUMBSTICK_Y: 3,
};

const INPUT_MAPPING = {
	INDEX_TRIGGER: 0,
	HAND_TRIGGER: 1,
	THUMBSTICK: 3,
	BUTTON_1: 4,
	BUTTON_2: 5,
};

const THUMBSTICK_AXES_MAPPING = {
	THUMBSTICK_X: 2,
	THUMBSTICK_Y: 3,
};

const MAX_VIBRATION_DURATION = 20;

export class ControllerInterface {
	constructor(handedness, controller, gamepad, controllerModel) {
		this._clock = new THREE.Clock();
		this._handedness = handedness;
		this._controller = controller;
		this._gamepad = gamepad;
		this._vec3 = new THREE.Vector3();
		this._quat = new THREE.Quaternion();

		this.controllerModel = controllerModel;

		this._buttonInput = {};
		for (let key in BUTTONS) {
			this._buttonInput[BUTTONS[key]] = {
				currentFrame: {
					pressed: false,
					touched: false,
				},
				lastFrame: {
					pressed: false,
					touched: false,
				},
				pressedSince: 0,
				pressId: 0,
			};
		}

		this._triggerInput = {};
		for (let key in TRIGGERS) {
			this._triggerInput[TRIGGERS[key]] = {
				currentFrame: {
					pressed: false,
					touched: false,
					fullyPressed: false,
				},
				lastFrame: {
					pressed: false,
					touched: false,
					fullyPressed: false,
				},
			};
		}

		this._axisInput = {};
		this._axisInput[AXES.INDEX_TRIGGER] = 0;
		this._axisInput[AXES.HAND_TRIGGER] = 0;
		this._axisInput[AXES.THUMBSTICK_X] = 0;
		this._axisInput[AXES.THUMBSTICK_Y] = 0;
	}

	get handKey() {
		return this._handedness.toUpperCase();
	}

	get grip() {
		return this.controllerModel.parent;
	}

	get targetRaySpace() {
		return this._controller;
	}

	setGamepad(gamepad) {
		this._gamepad = gamepad;
	}

	getPosition() {
		this._controller.getWorldPosition(this._vec3);
		return this._vec3.clone();
	}

	getPalmPosition() {
		this.controllerModel.getWorldPosition(this._vec3);
		return this._vec3.clone();
	}

	getQuaternion() {
		this._controller.getWorldQuaternion(this._quat);
		return this._quat.clone();
	}

	getDirection() {
		this._controller.getWorldDirection(this._vec3);
		return this._vec3.clone().negate();
	}

	getButtonInput(button) {
		return this._buttonInput[button].currentFrame;
	}

	getTriggerInput(trigger) {
		return this._triggerInput[trigger].currentFrame;
	}

	getAxisInput(axis) {
		return this._axisInput[axis];
	}

	buttonPressed(button) {
		return this._buttonInput[button].currentFrame.pressed;
	}

	triggerPressed(trigger) {
		return this._triggerInput[trigger].currentFrame.fullyPressed;
	}

	buttonJustPressed(button) {
		return (
			this._buttonInput[button].currentFrame.pressed &&
			!this._buttonInput[button].lastFrame.pressed
		);
	}

	buttonPressedFor(button) {
		if (!this.buttonPressed(button)) return 0;
		return (
			this._clock.getElapsedTime() - this._buttonInput[button].pressedSince
		);
	}

	getButtonPressId(button) {
		if (!this.buttonPressed(button)) return -1;
		return this._buttonInput[button].pressId;
	}

	buttonJustReleased(button) {
		return (
			!this._buttonInput[button].currentFrame.pressed &&
			this._buttonInput[button].lastFrame.pressed
		);
	}

	triggerJustPressed(trigger) {
		return (
			this._triggerInput[trigger].currentFrame.fullyPressed &&
			!this._triggerInput[trigger].lastFrame.fullyPressed
		);
	}

	triggerJustReleased(trigger) {
		return (
			!this._triggerInput[trigger].currentFrame.fullyPressed &&
			this._triggerInput[trigger].lastFrame.fullyPressed
		);
	}

	getJoystickAngle() {
		let axisX = this.getAxisInput(AXES.THUMBSTICK_X);
		let axisY = this.getAxisInput(AXES.THUMBSTICK_Y);
		let rad = Math.atan(axisX / axisY);
		if (axisX == 0 && axisY == 0) {
			return NaN;
		}
		if (axisX >= 0) {
			if (axisY < 0) {
				rad *= -1;
			} else if (axisY > 0) {
				rad = Math.PI - rad;
			} else if (axisY == 0) {
				rad = Math.PI / 2;
			}
		} else {
			if (axisY < 0) {
				rad *= -1;
			} else if (axisY > 0) {
				rad = -Math.PI - rad;
			} else if (axisY == 0) {
				rad = -Math.PI / 2;
			}
		}
		return rad;
	}

	getJoystickValue() {
		let axisX = this.getAxisInput(AXES.THUMBSTICK_X);
		let axisY = this.getAxisInput(AXES.THUMBSTICK_Y);
		return Math.sqrt(axisX * axisX + axisY * axisY);
	}

	pulse(intensity, duration) {
		if (this._gamepad.hapticActuators) {
			this._gamepad.hapticActuators[0]?.pulse(intensity, duration);
		} else {
			console.warn(`Haptic Actuators not found in gamepad object`);
		}
	}

	/**
	 * USE WITH CAUTION!! start vibration until stopVibration() is called
	 * if not stopVibration() is never called, the vibration will stop at MAX_VIBRATION_DURATION seconds
	 * quiting the WebXR session will also cause the vibration to stop within 15 seconds (system allows max 15s pulses if the job is not renewed)
	 * @param {Number} intensity - intensity of vibration ranging from 0 to 1
	 */
	startVibration(intensity) {
		this.pulse(intensity, MAX_VIBRATION_DURATION * 1000);
	}

	stopVibration() {
		this.pulse(0, 1);
	}

	update() {
		// update triggers
		for (let key in TRIGGERS) {
			let triggerId = TRIGGERS[key];
			let triggerGamepadIndex = INPUT_MAPPING[key];
			let triggerData = this._triggerInput[triggerId];
			let triggerGamepadData = this._gamepad.buttons[triggerGamepadIndex];

			triggerData.lastFrame = Object.assign({}, triggerData.currentFrame);

			triggerData.currentFrame.pressed = triggerGamepadData.value > 0;
			triggerData.currentFrame.fullyPressed = triggerGamepadData.value > 0.5;
			triggerData.currentFrame.touched = triggerGamepadData.touched;

			let axisId = AXES[key];
			this._axisInput[axisId] = triggerGamepadData.value;
		}

		// update binary buttons
		for (let key in BUTTONS) {
			let buttonId = BUTTONS[key];
			let buttonGamepadIndex = INPUT_MAPPING[key];
			let buttonData = this._buttonInput[buttonId];
			let buttonGamepadData = this._gamepad.buttons[buttonGamepadIndex];

			buttonData.lastFrame = Object.assign({}, buttonData.currentFrame);

			buttonData.currentFrame.pressed = buttonGamepadData.pressed;
			buttonData.currentFrame.touched = buttonGamepadData.touched;

			if (!buttonData.lastFrame.pressed && buttonData.currentFrame.pressed) {
				buttonData.pressedSince = this._clock.getElapsedTime();
			} else if (
				buttonData.lastFrame.pressed &&
				!buttonData.currentFrame.pressed
			) {
				buttonData.pressId += 1;
			}
		}

		// update thumbstick
		for (let key in THUMBSTICK_AXES_MAPPING) {
			let axisGamepadIndex = THUMBSTICK_AXES_MAPPING[key];
			let axisId = AXES[key];
			this._axisInput[axisId] = this._gamepad.axes[axisGamepadIndex];
		}
	}
}
