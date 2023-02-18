/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { IndicatorRingComponent } from '../../components/IndicatorRingComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';

// Indicator ring is the target marker at the end of target rays
export class IndicatorRingSystem extends System {
	init() {
		this.indicatorRingEntity = null;
		this.indicatorRingComponent = null;
	}

	execute(_delta, _time) {
		if (this.indicatorRingEntity == null) {
			this.indicatorRingEntity = this.world.createEntity();
			this.indicatorRingEntity.addComponent(IndicatorRingComponent);
			this.queries.gameManager.results.forEach((entity) => {
				let scene = entity.getComponent(THREEGlobalComponent).scene;
				this.indicatorRingComponent = this.indicatorRingEntity
					.getMutableComponent(IndicatorRingComponent)
					.createDefaultRing(scene);
			});
		}

		if (this.indicatorRingComponent != null) {
			// hide indicator ring by default, active interaction mode will enable if needed
			this.indicatorRingComponent.setRingVisible(false);
		}
	}
}

IndicatorRingSystem.queries = {
	gameManager: {
		components: [THREEGlobalComponent],
	},
};
