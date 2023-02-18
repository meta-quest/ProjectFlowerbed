/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Vector2 } from 'three';

const _touchPoint = new Vector2();

/**
 * Creates joystick controls for use on mobile devices, and injects them onto the DOM.
 * Currently unused because by default we don't support running Flowerbed outside of VR.
 */
export class MobileJoystickControls {
	/**
	 *
	 * @param {HTMLElement} domElement
	 * @param {number} radius
	 */
	constructor(domElement, padRadius = 96, handleRadius = 32) {
		this.element = domElement;

		this.pad = {
			radius: padRadius,
			center: new Vector2(),
		};
		this.pad.center.set(
			this.element.offsetLeft + padRadius,
			this.element.offsetTop + padRadius,
		);
		this.pad.radiusSq = this.pad.radius * this.pad.radius;

		this.handle = {
			// position is relative to the pad center
			position: new Vector2(),
			radius: handleRadius,
		};

		this.isActive = false;
		// delta has x and y values from -1 to 1.
		this.joystickDelta = new Vector2();

		// events
		this.element.addEventListener('touchstart', (event) => {
			event.preventDefault();
			this.isActive = true;

			// relocate the joystick
			this.pad.center.set(
				event.targetTouches[0].pageX,
				event.targetTouches[0].pageY,
			);
			this._update(event.targetTouches[0].pageX, event.targetTouches[0].pageY);
		});
		let touchEnd = (event) => {
			event.preventDefault();

			// if there are more touches on the element, we shouldn't reset the joystick.
			for (let touch of event.touches) {
				if (this._isPointOnElement(touch.pageX, touch.pageY)) {
					return;
				}
			}

			this.isActive = false;
			this._reset();
		};

		document.addEventListener('touchend', touchEnd);
		document.addEventListener('touchcancel', touchEnd);

		document.addEventListener('touchmove', (event) => {
			if (!this.isActive) return;
			for (let touch of event.touches) {
				if (this._isPointOnElement(touch.pageX, touch.pageY)) {
					this._update(touch.pageX, touch.pageY);
					break;
				}
			}
		});
	}

	_isPointOnElement(pageX, pageY) {
		return (
			pageX >= this.element.offsetLeft &&
			pageX <= this.element.offsetLeft + this.element.offsetWidth &&
			pageY >= this.element.offsetTop &&
			pageY <= this.element.offsetTop + this.element.offsetHeight
		);
	}

	_update(absoluteX, absoluteY) {
		_touchPoint.set(absoluteX, absoluteY);
		this.joystickDelta.copy(_touchPoint).sub(this.pad.center);
		const distanceSqFromCenter = _touchPoint.distanceToSquared(this.pad.center);
		if (distanceSqFromCenter > this.pad.radiusSq) {
			this.joystickDelta.normalize();
			this.joystickDelta.multiplyScalar(this.pad.radius);
		}
		this.handle.position.copy(this.joystickDelta);
		this.joystickDelta.multiplyScalar(1 / this.pad.radius);
	}

	_reset() {
		this.handle.position.set(0, 0);
		this.joystickDelta.set(0, 0);
	}
}

export class MobileJoystickVisualizer {
	/**
	 *
	 * @param {MobileJoystickControls} controls
	 */
	constructor(controls) {
		this.controls = controls;
		this.visible = false;

		this.padElement = document.createElement('div');
		this.padElement.classList.add('mobile-joystick-pad');
		this.padElement.style.display = 'none';
		this.padElement.style.width = `${this.controls.pad.radius * 2}px`;
		this.padElement.style.height = `${this.controls.pad.radius * 2}px`;
		this.padElement.style.borderRadius = `${this.controls.pad.radius}px`;
		this.controls.element.appendChild(this.padElement);

		this.handleElement = document.createElement('div');
		this.handleElement.classList.add('mobile-joystick-handle');
		this.handleElement.style.width = `${this.controls.handle.radius * 2}px`;
		this.handleElement.style.height = `${this.controls.handle.radius * 2}px`;
		this.handleElement.style.borderRadius = `${this.controls.handle.radius}px`;
		this.padElement.appendChild(this.handleElement);
	}

	update() {
		if (this.controls.isActive) {
			this.visible = true;
			this.padElement.style.display = 'block';

			const padElementX = Math.floor(
				this.controls.pad.center.x -
					this.controls.pad.radius -
					this.controls.element.offsetLeft,
			);
			const padElementY = Math.floor(
				this.controls.pad.center.y -
					this.controls.pad.radius -
					this.controls.element.offsetTop,
			);
			this.padElement.style.transform = `translate(${padElementX}px, ${padElementY}px)`;

			const handleElementX =
				this.controls.handle.position.x +
				this.controls.pad.radius -
				this.controls.handle.radius;
			const handleElementY =
				this.controls.handle.position.y +
				this.controls.pad.radius -
				this.controls.handle.radius;
			this.handleElement.style.transform = `translate(${handleElementX}px, ${handleElementY}px)`;
		} else if (this.visible) {
			this.visible = false;
			this.padElement.style.display = 'none';
		}
	}
}
