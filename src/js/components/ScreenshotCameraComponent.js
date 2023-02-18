/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

import { SCREENSHOT_CAMERA_CONSTANTS } from '../Constants';

export class ScreenshotCameraComponent extends Component {}

ScreenshotCameraComponent.schema = {
	/**
	 * @type {THREE.Mesh } plane mesh to display the image texture captured by the screenshot camera
	 */
	screen: { type: Types.Ref, default: undefined },

	/**
	 * @type {THREE.Mesh} plane mesh to animate the shutter effect when taking a photo
	 */
	shutterEffect: { type: Types.Ref, default: undefined },

	/**
	 * @type {THREE.PerspectiveCamera} camera used to render the preview on the camera model
	 */
	previewCamera: { type: Types.Ref, default: undefined },

	/**
	 * @type {THREE.WebGLRenderTarget}
	 */
	previewRenderTarget: { type: Types.Ref, default: undefined },

	// photo camera and renderer are used for rendering the photo taken
	// image quality takes a priority instead of efficiency
	/**
	 * @type {THREE.PerspectiveCamera}
	 */
	photoCamera: { type: Types.Ref, default: undefined },

	/**
	 * @type {THREE.WebGLRenderTarget}
	 */
	photoRenderer: { type: Types.Ref, default: undefined },
};

export class PhotoComponent extends Component {}

PhotoComponent.schema = {
	/**
	 * @type {THREE.Texture}
	 */
	texture: { type: Types.Ref, default: undefined },

	rawDataUrl: { type: Types.String, default: undefined },

	// whether the photo is held in your hand or not
	attached: { type: Types.Boolean, default: true },

	deleteTimer: {
		type: Types.Number,
		default: SCREENSHOT_CAMERA_CONSTANTS.PHOTO_EXPIRATION_TIME,
	},
	/**
	 * @type {CircleTimer} see PhotoAutoDeleteSystem for class definition
	 */
	timerObject: { type: Types.Ref, default: undefined },
};

export class PhotoMenuComponent extends Component {}

PhotoMenuComponent.schema = {
	/**
	 * @type {THREE.Mesh}
	 */
	deleteButton: { type: Types.Ref, default: undefined },

	/**
	 * @type {THREE.Mesh}
	 */
	saveButton: { type: Types.Ref, default: undefined },
};
