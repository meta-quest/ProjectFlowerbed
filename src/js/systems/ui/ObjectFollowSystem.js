/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { Object3DComponent } from '../../components/Object3DComponent';
import { ObjectFollowerComponent } from '../../components/ObjectFollowerComponent';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { applyPDVec3 } from '../../utils/pdAccelerations';
import { getOnlyEntity } from '../../utils/entityUtils';
import { updateMatrixRecursively } from '../../utils/object3dUtils';

const _vector = new THREE.Vector3();
const _matrix = new THREE.Matrix4();

export class ObjectFollowSystem extends System {
	init() {
		this.targetPosition = new THREE.Vector3();

		this.viewerTransform = getOnlyEntity(this.queries.player).getComponent(
			PlayerStateComponent,
		).viewerTransform;
	}

	execute(delta) {
		this.queries.followers.results.forEach((entity) => {
			const objectFollowerComponent = entity.getMutableComponent(
				ObjectFollowerComponent,
			);
			const followerObject = entity.getComponent(Object3DComponent).value;
			if (!followerObject.visible) {
				return;
			}

			if (!objectFollowerComponent.target) {
				return;
			}

			updateMatrixRecursively(objectFollowerComponent.target);
			objectFollowerComponent.target.getWorldPosition(this.targetPosition);
			if (objectFollowerComponent.isChildOfViewerTransform) {
				// move it to local space of viewerTransform
				_matrix.copy(this.viewerTransform.matrixWorld);
				_matrix.invert();
				this.targetPosition.applyMatrix4(_matrix);
			}

			// calculate offsets
			// all offsets applied as relative to viewerTransform, not the object's transform
			if (objectFollowerComponent.offset) {
				_vector.copy(objectFollowerComponent.offset);
				if (!objectFollowerComponent.isChildOfViewerTransform) {
					_vector.applyMatrix4(this.viewerTransform.matrixWorld);
					_vector.sub(this.viewerTransform.position);
				}

				this.targetPosition.add(_vector);
			}

			if (objectFollowerComponent.shouldMoveImmediately) {
				followerObject.position.copy(this.targetPosition);
				objectFollowerComponent.velocity.set(0, 0, 0);
				objectFollowerComponent.shouldMoveImmediately = false;
			} else {
				applyPDVec3(
					followerObject.position,
					objectFollowerComponent.velocity,
					this.targetPosition,
					new THREE.Vector3(0, 0, 0),
					2.0,
					1,
					delta,
				);
			}
		});
	}
}

ObjectFollowSystem.queries = {
	gameManager: {
		components: [THREEGlobalComponent],
	},
	player: {
		components: [PlayerStateComponent],
	},
	followers: {
		components: [Object3DComponent, ObjectFollowerComponent],
		listen: { added: true },
	},
};
