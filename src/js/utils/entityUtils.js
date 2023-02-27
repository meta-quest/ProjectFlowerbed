/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { CollisionWorldComponent } from '../components/ColliderComponents';
import { Object3DComponent } from '../components/Object3DComponent';

export const deleteEntity = (scene, entity) => {
	// make sure that any refs on the entity are cleaned up.
	if (entity.hasComponent(Object3DComponent)) {
		const object3DComponent = entity.getComponent(Object3DComponent);
		object3DComponent.value.parent.remove(object3DComponent.value);
	}
	if (scene && entity.hasComponent(CollisionWorldComponent)) {
		const collisionWorldComponent = entity.getComponent(
			CollisionWorldComponent,
		);
		scene.remove(collisionWorldComponent.world);
	}

	entity.remove();
};

// syntactic sugar promised by ECSY before project termination
// TO-DO: integrate into custom ECSY fork
export const getOnlyEntity = (query, strict = true) => {
	if (query.results.length !== 1) {
		if (strict) throw 'number of queried entities != 1';
	} else {
		return query.results[0];
	}
};
