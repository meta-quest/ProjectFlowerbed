/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { FOLLOW_CONSTANTS } from '../../Constants';
import { GazeFollowerComponent } from '../../components/GazeFollowerComponent';
import { IsActive } from '../../components/GameObjectTagComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { applyPDVec3 } from '../../utils/pdAccelerations';

export class GazeFollowSystem extends System {
	init() {
		this.renderer = null;
		this.target = null;
		this.viewerTransform = null;
		this.cameraPosition = new THREE.Vector3();
		this.cameraDirection = new THREE.Vector3();

		this.queries.gameManager.results.forEach((entity) => {
			this.renderer = entity.getComponent(THREEGlobalComponent).renderer;
		});

		this.queries.player.results.forEach((entity) => {
			const playerState = entity.getComponent(PlayerStateComponent);
			this.target = new THREE.Object3D();
			this.viewerTransform = playerState.viewerTransform;
			this.viewerTransform.add(this.target);

			// visible target marker for debugging purpose
			const targetMarker = new THREE.Mesh(
				new THREE.SphereGeometry(0.05, 8, 4),
				new THREE.MeshBasicMaterial({ color: 0xffff00 }),
			);
			targetMarker.visible = FOLLOW_CONSTANTS.GAZE_TARGET_VISIBLE;
			if (FOLLOW_CONSTANTS.GAZE_TARGET_VISIBLE) {
				this.target.matrixAutoUpdate = true;
			}
			this.target.add(targetMarker);
		});
	}

	execute(delta, _time) {
		if (!this.renderer || !this.target) return;

		if (!this.queries.followers.results.length) {
			// no need to execute if there's nothing following the camera.
			return;
		}

		// TODO: renderer.xr.getCamera() is behind by a frame, so anything
		// that tries to immediately follow the camera will also be behind a frame.
		this.cameraPosition.copy(this.renderer.xr.getCamera().position);
		// the renderer.xr.getCamera object is not a child of viewerTransform
		// convert world position to local position to correctly update target
		this.cameraPosition = this.viewerTransform.worldToLocal(
			this.cameraPosition,
		);

		this.cameraDirection.set(0, 0, -1);
		// the renderer.xr.getCamera object is not a child of viewerTransform
		// apply the invert of viewertransform quaternion to correct the direction
		this.cameraDirection
			.applyQuaternion(this.renderer.xr.getCamera().quaternion)
			.applyQuaternion(this.viewerTransform.quaternion.clone().invert());
		this.cameraDirection.y = 0;
		this.cameraDirection.normalize();

		this._updateTargetPosition();

		this.queries.followers.results.forEach((entity) => {
			this._updateFollowerPosition(entity, delta);
		});
	}

	_resetTargetPosition() {
		this.target.position.copy(
			this.cameraPosition.clone().add(this.cameraDirection),
		);
	}

	_updateTargetPosition() {
		let delta = this.target.position.clone().sub(this.cameraPosition);
		delta.y = 0;
		let angle = this.cameraDirection.angleTo(delta);
		if (
			Math.abs(angle) > FOLLOW_CONSTANTS.STATIC_ZONE_ANGLE_THRESHOLD ||
			Math.abs(this.target.position.y - this.cameraPosition.y) >
				FOLLOW_CONSTANTS.TARGET_Y_RESET_THRESHOLD
		) {
			this._resetTargetPosition();
		}
	}

	_updateFollowerPosition(followerEntity, delta) {
		let followerObject = followerEntity.getComponent(Object3DComponent).value;
		let followerComponent = followerEntity.getMutableComponent(
			GazeFollowerComponent,
		);
		let targetPosition = this.target.position.clone();
		targetPosition.x *= followerComponent.radius;
		targetPosition.z *= followerComponent.radius;
		targetPosition.y += followerComponent.yOffset;

		if (followerComponent.shouldMoveImmediately) {
			followerObject.position.copy(targetPosition);
			followerComponent.velocity.set(0, 0, 0);
			followerComponent.shouldMoveImmediately = false;
		} else {
			applyPDVec3(
				followerObject.position,
				followerComponent.velocity,
				targetPosition,
				new THREE.Vector3(0, 0, 0),
				0.5,
				1,
				delta,
			);
		}

		let lookAtPosition = this.cameraPosition.clone();
		lookAtPosition.y = followerObject.position.y;
		lookAtPosition = this.viewerTransform.localToWorld(lookAtPosition);
		followerObject.lookAt(lookAtPosition);
	}
}

GazeFollowSystem.queries = {
	gameManager: {
		components: [THREEGlobalComponent],
		listen: { added: true },
	},
	player: {
		components: [PlayerStateComponent],
		listen: { added: true },
	},
	// the only gaze followers are UI panels, so we can ensure that only active panels
	// are tracked as followers
	followers: {
		components: [GazeFollowerComponent, Object3DComponent, IsActive],
	},
};
