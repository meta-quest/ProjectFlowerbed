/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { Object3DComponent } from '../../components/Object3DComponent';
import { PhotoComponent } from '../../components/ScreenshotCameraComponent';
import { SCREENSHOT_CAMERA_CONSTANTS } from '../../Constants';
import { System } from 'ecsy';
import { deleteEntity } from '../../utils/entityUtils';
import { updateMatrixRecursively } from '../../utils/object3dUtils';

export class PhotoAutoDeleteSystem extends System {
	init() {}

	execute(delta, _time) {
		this.queries.photo.results.forEach((entity) => {
			const photoObject = entity.getComponent(Object3DComponent).value;
			const photoComponent = entity.getMutableComponent(PhotoComponent);
			if (!photoComponent.timerObject) {
				const circleTimer = new CircleTimer({ numSectors: 20, radius: 0.025 });
				photoComponent.timerObject = circleTimer;
				photoObject.add(circleTimer);
				circleTimer.position.z += 0.01;
				updateMatrixRecursively(circleTimer);
			}
			if (!photoComponent.attached) {
				photoComponent.timerObject.visible = true;
				photoComponent.deleteTimer -= delta;
				photoComponent.timerObject.setValue(
					photoComponent.deleteTimer /
						SCREENSHOT_CAMERA_CONSTANTS.PHOTO_EXPIRATION_TIME,
				);
			} else {
				photoComponent.timerObject.visible = false;
			}
			if (photoComponent.deleteTimer <= 0) {
				deleteEntity(null, entity);
			}
		});
	}
}

PhotoAutoDeleteSystem.queries = {
	photo: { components: [PhotoComponent] },
};

class CircleTimer extends THREE.Object3D {
	constructor(props = {}) {
		// the circle timer is constructed from a number of sectors
		// the sectors are shown/hidden in sequence to produce the
		// animation of counting down
		const numSectors = props.numSectors ?? 5;
		super();
		const anglePerSector = (Math.PI * 2) / numSectors;
		const geometry = new THREE.CircleGeometry(
			props.radius ?? 0.1,
			numSectors * 3,
			0,
			anglePerSector,
		);
		const material = new THREE.MeshBasicMaterial({
			color: props.color ?? 0xffff00,
		});
		this.sectors = [new THREE.Mesh(geometry, material)];
		this.sectorMaterial = material;
		this.add(this.sectors[0]);
		for (let i = 1; i < numSectors; i++) {
			const newSector = this.sectors[i - 1].clone();
			newSector.rotateZ(anglePerSector);
			this.add(newSector);
			this.sectors.push(newSector);
		}
	}

	setValue(value) {
		for (let i = 0; i < this.sectors.length; i++) {
			const currentStage = i / this.sectors.length;
			const nextStage = (i + 1) / this.sectors.length;
			if (value >= nextStage) {
				this.sectors[i].visible = true;
			} else if (nextStage > value && value >= currentStage) {
				this.sectors[i].visible = nextStage - value < value - currentStage;
			} else {
				this.sectors[i].visible = false;
			}
		}
		if (value >= 0.6) {
			this.sectorMaterial.color.setHex(0x00ff00);
		} else if (0.6 > value && value >= 0.3) {
			this.sectorMaterial.color.setHex(0xffff00);
		} else {
			this.sectorMaterial.color.setHex(0xff0000);
		}
	}
}
