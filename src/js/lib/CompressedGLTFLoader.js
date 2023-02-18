/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export class CompressedGLTFLoader extends GLTFLoader {
	/**
	 * Creates a GLTFLoader that has meshopt and ktx2 support.
	 * @param {THREE.Renderer} renderer
	 * @param {THREE.LoadingManager} manager - optional manager to link to the loader
	 */
	constructor(renderer, manager) {
		super(manager);
		this.ktx2Loader = new KTX2Loader(manager);
		this.ktx2Loader.setTranscoderPath('vendor/');
		this.ktx2Loader.detectSupport(renderer);
		this.setKTX2Loader(this.ktx2Loader);

		this.setMeshoptDecoder(MeshoptDecoder);
	}
}
