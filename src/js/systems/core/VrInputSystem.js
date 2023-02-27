/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { System } from 'ecsy';
import { VrControllerComponent } from '../../components/VrControllerComponent';

export class VrInputSystem extends System {
	execute(/*delta, time*/) {
		this.queries.controllers.results.forEach((entity) => {
			let vrControllerComponent = entity.getComponent(VrControllerComponent);
			vrControllerComponent.controllerInterface.update();
		});
	}
}

VrInputSystem.queries = {
	controllers: { components: [VrControllerComponent] },
};
