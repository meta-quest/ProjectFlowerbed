/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class LODWithHysteresis extends THREE.LOD {
	constructor(hysteresis = 5) {
		super();
		this._hysteresis = hysteresis;
	}

	update(camera) {
		const levels = this.levels;

		if (levels.length > 1) {
			_v1.setFromMatrixPosition(camera.matrixWorld);
			_v2.setFromMatrixPosition(this.matrixWorld);

			const distance = _v1.distanceTo(_v2) / camera.zoom;

			levels[0].object.visible = true;

			let i, l;

			for (i = 1, l = levels.length; i < l; i++) {
				let targetLevel = levels[i].distance;
				if (this._currentLevel < i) {
					targetLevel = targetLevel + this._hysteresis;
				}

				if (distance >= targetLevel) {
					levels[i - 1].object.visible = false;
					levels[i].object.visible = true;
				} else {
					break;
				}
			}

			this._currentLevel = i - 1;

			for (; i < l; i++) {
				levels[i].object.visible = false;
			}
		}
	}
}
