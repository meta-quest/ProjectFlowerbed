/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { COLLISION_LAYERS, PHYSICS_CONSTANTS } from '../../Constants';
import {
	CapsuleColliderComponent,
	CollisionWorldComponent,
} from '../../components/ColliderComponents';
import {
	PlayerColliderComponent,
	PlayerStateComponent,
} from '../../components/PlayerStateComponent';

import { SessionComponent } from '../../components/SessionComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { updateMatrixRecursively } from 'src/js/utils/object3dUtils';

export class PlayerPhysicsSystem extends System {
	execute(delta) {
		let renderer;
		this.queries.globals.results.forEach((entity) => {
			renderer = entity.getComponent(THREEGlobalComponent).renderer;
		});

		let sessionState;
		this.queries.session.results.forEach((entity) => {
			sessionState = entity.getComponent(SessionComponent);
		});

		// only run physics if we're in the experience
		if (!renderer || !sessionState.isExperienceOpened) {
			return;
		}

		// perform physics collisions
		let collisionWorld;
		this.queries.world.results.forEach((entity) => {
			collisionWorld = entity.getComponent(CollisionWorldComponent).world;
		});

		this.queries.player.results.forEach((entity) => {
			const playerState = entity.getMutableComponent(PlayerStateComponent);
			const expectedPlayerMovement = playerState.expectedMovement;
			playerState.didMove = expectedPlayerMovement.length() > 0;
			if (!collisionWorld) {
				// do a straight translation
				const viewerTransform = entity.getComponent(PlayerStateComponent)
					.viewerTransform;
				viewerTransform.position.add(expectedPlayerMovement);
			} else {
				for (let i = 0; i < PHYSICS_CONSTANTS.PHYSICS_STEPS; i++) {
					updatePlayerPhysics(
						delta / PHYSICS_CONSTANTS.PHYSICS_STEPS,
						collisionWorld,
						entity,
						i,
					);
				}
			}

			// reset expected player movement
			expectedPlayerMovement.set(0, 0, 0);

			updateHeadTransform(renderer, playerState.playerHead);
		});
	}
}

PlayerPhysicsSystem.queries = {
	globals: {
		components: [THREEGlobalComponent],
	},
	session: {
		components: [SessionComponent],
	},
	world: {
		components: [CollisionWorldComponent],
	},
	player: {
		components: [
			PlayerStateComponent,
			PlayerColliderComponent,
			CapsuleColliderComponent,
		],
	},
};

const updatePlayerPhysics = (
	delta,
	collisionWorld,
	playerEntity,
	stepNumber,
) => {
	const capsuleComponent = playerEntity.getComponent(CapsuleColliderComponent);
	const {
		expectedMovement,
		viewerTransform,
		deltaMovement,
	} = playerEntity.getComponent(PlayerStateComponent);
	const collisionComponent = playerEntity.getMutableComponent(
		PlayerColliderComponent,
	);

	const position = new THREE.Vector3();
	position.copy(viewerTransform.position);

	//gravity
	collisionComponent.velocity.y += collisionComponent.isGrounded
		? 0
		: delta * PHYSICS_CONSTANTS.GRAVITY;
	position.addScaledVector(collisionComponent.velocity, delta);

	// PLAYER MOVEMENT
	// the expectedMovement already took delta into account, so we just divide it by the number of steps
	const expectedMovementInStep = expectedMovement.clone();
	expectedMovementInStep.multiplyScalar(1 / PHYSICS_CONSTANTS.PHYSICS_STEPS);
	position.add(expectedMovementInStep);

	const xzMovement = new THREE.Vector3();
	xzMovement.copy(expectedMovementInStep);
	xzMovement.y = 0;

	// Uses a ray cast downwards to make sure we stick to downward slopes
	///////////////////////////////////////////////////////////////////////
	if (stepNumber === 0) {
		// raycasts are expensive, so we only calculate the slope normal once per frame, the first
		// time that the playercontroller step is run in that frame
		const center = new THREE.Vector3();
		const to = new THREE.Vector3();
		capsuleComponent.lineSegment.getCenter(center).add(position);
		to.copy(center);
		to.y -=
			capsuleComponent.radius +
			capsuleComponent.lineSegment.distance() / 2 +
			0.1;
		const slopeRay = collisionWorld.raycastPoints(center, to, {
			all: COLLISION_LAYERS.OBSTACLE,
		});

		if (slopeRay) {
			collisionComponent.lastSlopeNormal.copy(
				slopeRay.intersection.face.normal,
			);
			collisionComponent.hasHitSlope = true;
		} else {
			collisionComponent.hasHitSlope = false;
		}
	}

	if (collisionComponent.hasHitSlope) {
		const yOffset = collisionComponent.lastSlopeNormal.dot(xzMovement);
		if (yOffset > 0) {
			position.y -= yOffset;
		}
	}

	// COLLISIONS
	// We take the current position and shift it out of any obstacles it's overlapping
	//////////////////////////////////////////////////////////////////////////////////////////
	const collisionResult = collisionWorld.capsuleCast(
		position,
		capsuleComponent,
		{ all: COLLISION_LAYERS.OBSTACLE },
	);
	const deltaVector = new THREE.Vector3();

	if (collisionResult) {
		deltaVector.copy(collisionResult.displacement);
	}

	// if a significant factor of the collider's adjustment was that it should move up vertically,
	// we assume it's on the ground.
	collisionComponent.isGrounded =
		deltaVector.y > Math.abs(delta * collisionComponent.velocity.y * 0.25);

	// offset is calculated to deal with imprecision with floating point numbers. If deltaVector
	// ends up smaller than 1e-5 we assume that it's actually 0 and we don't move at all.
	const offset = Math.max(0, deltaVector.length() - 1e-5);
	deltaVector.normalize().multiplyScalar(offset);

	// check grounded state
	if (collisionComponent.isGrounded) {
		collisionComponent.velocity.set(0, 0, 0);
	}

	position.add(deltaVector);

	deltaMovement.copy(position).sub(viewerTransform.position);
	viewerTransform.position.copy(position);
};

/**
 * Update player head group transform after player physics finish executing
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Group} playerHead
 */
const updateHeadTransform = (renderer, playerHead) => {
	const xrManager = renderer.xr;
	const frame = xrManager.getFrame();
	if (!frame) {
		return;
	}
	const pose = frame.getViewerPose(xrManager.getReferenceSpace());
	if (!pose) {
		return;
	}
	const headsetMatrix = new THREE.Matrix4().fromArray(
		pose.views[0].transform.matrix,
	);
	headsetMatrix.decompose(
		playerHead.position,
		playerHead.quaternion,
		new THREE.Vector3(),
	);
	updateMatrixRecursively(playerHead);
};
