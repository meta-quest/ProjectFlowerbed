/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class THREEGlobalComponent extends Component {
	getCamera() {
		if (this.renderer.xr.isPresenting) {
			return this.renderer.xr.getCamera();
		}
		return this.camera;
	}
}

THREEGlobalComponent.schema = {
	/**
	 * @type {THREE.WebGLRenderer}
	 */
	renderer: { type: Types.Ref, default: undefined },

	/**
	 * @type {THREE.Scene}
	 */
	scene: { type: Types.Ref, default: undefined },

	/**
	 * @type {THREE.PerspectiveCamera}
	 */
	camera: { type: Types.Ref, default: undefined },
};
