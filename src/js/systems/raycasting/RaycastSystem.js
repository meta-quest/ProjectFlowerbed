/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
	CurvedRay,
	RayComponent,
	ShortRay,
	StraightRay,
} from '../../components/RayComponents';

import { CurvedRaycaster } from '../../lib/objects/CurvedRaycaster';
import { StraightRaycaster } from '../../lib/objects/StraightRaycaster';
import { System } from 'ecsy';
import { VrControllerComponent } from '../../components/VrControllerComponent';

export class RaycastSystem extends System {
	init() {
		this.straightRayEntity = null;
		this.curvedRayEntity = null;
		this.shortUIRayEntity = null;
	}

	execute(_delta, _time) {
		let controllerInterface;

		this.queries.controllers.results.forEach((entity) => {
			let vrControllerComponent = entity.getComponent(VrControllerComponent);
			if (vrControllerComponent.handedness == 'right') {
				controllerInterface = vrControllerComponent.controllerInterface;

				if (!this.curvedRayEntity) {
					let curvedRaycaster = new CurvedRaycaster();
					this.curvedRayEntity = this.world.createEntity();
					this.curvedRayEntity.addComponent(RayComponent, {
						raycaster: curvedRaycaster,
					});
					this.curvedRayEntity.addComponent(CurvedRay);
				}

				if (!this.straightRayEntity) {
					let straightRaycaster = new StraightRaycaster();
					this.straightRayEntity = this.world.createEntity();
					this.straightRayEntity.addComponent(RayComponent, {
						raycaster: straightRaycaster,
					});
					this.straightRayEntity.addComponent(StraightRay);
				} else {
					this.straightRayEntity.getComponent(
						RayComponent,
					).raycaster.endPointOverride = false;
				}

				if (!this.shortUIRayEntity) {
					let straightRaycaster = new StraightRaycaster();
					straightRaycaster.far = 0.2;
					this.shortUIRayEntity = this.world.createEntity();
					this.shortUIRayEntity.addComponent(RayComponent, {
						raycaster: straightRaycaster,
					});
					this.shortUIRayEntity.addComponent(StraightRay);
					this.shortUIRayEntity.addComponent(ShortRay);
				} else {
					this.shortUIRayEntity.getComponent(
						RayComponent,
					).raycaster.endPointOverride = false;
				}
			}
		});

		if (!controllerInterface) return;

		let direction = controllerInterface.getDirection();
		let origin = controllerInterface.getPosition();

		this.queries.rays.results.forEach((entity) => {
			let rayComponent = entity.getComponent(RayComponent);
			if (rayComponent.originOverride) {
				origin = rayComponent.originOverride;
			}
			if (rayComponent.directionOverride) {
				direction = rayComponent.directionOverride;
			}
			rayComponent.raycaster.set(origin, direction);
		});
	}
}

RaycastSystem.queries = {
	controllers: {
		components: [VrControllerComponent],
	},
	rays: {
		components: [RayComponent],
	},
};
