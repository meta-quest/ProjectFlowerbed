/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { COLLISION_LAYERS, LOCOMOTION_CONSTANTS } from '../../Constants';

import {
	CollisionWorldComponent,
	StaticColliderComponent,
} from '../../components/ColliderComponents';
import { CurvedRay, RayComponent } from '../../components/RayComponents';

import { GameStateComponent } from '../../components/GameStateComponent';
import { IndicatorRingComponent } from '../../components/IndicatorRingComponent';
import { OneshotAudioComponent } from '../../components/AudioComponents';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { VrControllerComponent } from '../../components/VrControllerComponent';

export class TeleportationSystem extends System {
	init() {
		this.teleportIsEngaged = false;
		this.teleportWasEngaged = false;
	}

	execute(/*delta	, time*/) {
		let controllerInterface, webxrManager, scene;
		let player;
		let collisionWorld;
		let gameStateComponent;

		this.queries.gameManager.results.forEach((entity) => {
			let threeglobal = entity.getComponent(THREEGlobalComponent);
			webxrManager = threeglobal.renderer.xr;
			scene = threeglobal.scene;

			gameStateComponent = entity.getMutableComponent(GameStateComponent);
		});

		this.queries.collisionWorld.results.forEach((entity) => {
			collisionWorld = entity.getComponent(CollisionWorldComponent).world;
		});

		this.queries.player.results.forEach((entity) => {
			player = entity.getMutableComponent(PlayerStateComponent);
		});

		let targetRayComponent;

		this.queries.targetRay.results.forEach((entity) => {
			targetRayComponent = entity.getMutableComponent(RayComponent);
		});

		let indicatorRingComponent;
		this.queries.indicatorRing.results.forEach((entity) => {
			indicatorRingComponent = entity.getMutableComponent(
				IndicatorRingComponent,
			);
		});

		if (
			!webxrManager ||
			!scene ||
			!player ||
			!gameStateComponent ||
			gameStateComponent.interactionModeOverridden ||
			!collisionWorld ||
			targetRayComponent == null ||
			indicatorRingComponent == null
		)
			return;

		this.queries.controllers.results.forEach((entity) => {
			let vrControllerComponent = entity.getComponent(VrControllerComponent);
			if (vrControllerComponent.handedness == 'right') {
				controllerInterface = vrControllerComponent.controllerInterface;
			}
		});

		if (!controllerInterface) return;

		this.teleportIsEngaged = isJoystickEngaged(controllerInterface);
		gameStateComponent.interactionModeOverridden = this.teleportIsEngaged;

		if (this.teleportIsEngaged && !this.teleportWasEngaged) {
			OneshotAudioComponent.createSFX(this.world, {
				id: 'TELEPORT_EXTEND_LINE',
			});
			targetRayComponent.setRayType(RayComponent.RAY_TYPES.TELEPORT_RAY);
		}

		player.didJustTeleport = false;

		let intersection = null;
		let canTeleport = false;
		let shouldShowIntersection = true;

		if (this.teleportWasEngaged) {
			// first pass: do a straight raycast from the viewerTransform to the hand
			// to avoid being able to teleport past a wall by extending your hand beyond it.
			if (
				collisionWorld.raycastPoints(
					player.viewerTransform.position,
					controllerInterface.getPosition(),
					{
						all: COLLISION_LAYERS.OBSTACLE,
					},
				)
			) {
				canTeleport = false;
			} else {
				intersection = targetRayComponent.raycaster.intersectCollisionWorld(
					collisionWorld,
					{
						all: COLLISION_LAYERS.OBSTACLE,
						none: COLLISION_LAYERS.BOUNDARY,
					},
				)?.intersection;

				if (
					intersection?.object &&
					StaticColliderComponent.getEntityFromCollider(intersection.object)
						.getComponent(StaticColliderComponent)
						.hasLayer(COLLISION_LAYERS.INVISIBLE)
				) {
					shouldShowIntersection = false;
				}

				// the intersection may be with a wall. Make sure that we hit a teleport surface before teleporting.
				if (
					intersection?.object &&
					StaticColliderComponent.getEntityFromCollider(intersection.object)
						.getComponent(StaticColliderComponent)
						.hasLayer(COLLISION_LAYERS.TELEPORT_SURFACE)
				) {
					canTeleport = true;
				}

				// make sure we have enough space to teleport before doing so.
				if (canTeleport) {
					// test to see if the teleport point is too close to an obstacle. We do this with a sphere cast.
					const boundaryTestPoint = intersection.point.clone();
					boundaryTestPoint.y += LOCOMOTION_CONSTANTS.TELEPORT_BUFFER_RADIUS;

					if (
						collisionWorld.sphereCast(
							boundaryTestPoint,
							LOCOMOTION_CONSTANTS.TELEPORT_BUFFER_RADIUS,
							{
								all: COLLISION_LAYERS.OBSTACLE,
								none: COLLISION_LAYERS.TELEPORT_SURFACE,
							},
						).length
					) {
						canTeleport = false;
					}
				}

				if (
					!this.teleportIsEngaged &&
					canTeleport &&
					// if the joystick is still pushed past threshold, but the joystick is
					// no longer engaged for teleport, it most likely have drifted to snap
					// turn zones, do not teleport under this scenario
					Math.abs(controllerInterface.getJoystickValue()) <
						LOCOMOTION_CONSTANTS.TELEPORT_VALUE_MIN
				) {
					const teleportDistance = intersection.point.distanceToSquared(
						player.viewerTransform.position,
					);
					teleport(player.viewerTransform, intersection.point, webxrManager);

					// short teleports should use the shorter snap turn sound.
					OneshotAudioComponent.createSFX(this.world, {
						id:
							teleportDistance >
							LOCOMOTION_CONSTANTS.TELEPORT_SHORT_DISTANCESQ_THRESHOLD
								? 'TELEPORT'
								: 'TELEPORT_SNAP_TURN',
					});
					player.didJustTeleport = true;
				}
			}
		}

		this.updateRay(targetRayComponent, canTeleport);
		this.updateMarker(
			indicatorRingComponent,
			canTeleport,
			shouldShowIntersection ? intersection : undefined,
		);

		this.teleportWasEngaged = this.teleportIsEngaged;
	}

	updateMarker(indicatorRingComponent, canTeleport, intersection) {
		const visible = !!intersection && this.teleportIsEngaged;
		indicatorRingComponent.setRingVisible(visible);
		if (visible) {
			indicatorRingComponent.setRingTransformFromIntersection(intersection);
			indicatorRingComponent.setRingType(
				canTeleport
					? IndicatorRingComponent.RING_TYPES.TELEPORTABLE_RING
					: IndicatorRingComponent.RING_TYPES.NOT_TELEPORTABLE_RING,
			);
		}
	}

	updateRay(targetRayComponent, canTeleport) {
		if (this.teleportIsEngaged) {
			targetRayComponent.visible = true;
			targetRayComponent.setRayMode(
				canTeleport
					? RayComponent.RAY_MODES.DEFAULT
					: RayComponent.RAY_MODES.SPECIAL,
			);
		} else {
			if (this.teleportWasEngaged) {
				targetRayComponent.visible = false;
			}
		}
	}
}

TeleportationSystem.queries = {
	controllers: { components: [VrControllerComponent] },
	targetRay: { components: [RayComponent, CurvedRay] },
	indicatorRing: { components: [IndicatorRingComponent] },
	collisionWorld: { components: [CollisionWorldComponent] },
	gameManager: {
		components: [THREEGlobalComponent, GameStateComponent],
	},
	player: {
		components: [PlayerStateComponent],
	},
};

/**
 * Check whether joystick is engaged for teleport
 * @param {import('../../lib/ControllerInterface').ControllerInterface} controllerInterface
 * @returns {Boolean}
 */
const isJoystickEngaged = (controllerInterface) => {
	if (!controllerInterface) return false;
	let axisRad = controllerInterface.getJoystickAngle();
	let axisVal = controllerInterface.getJoystickValue();

	return (
		(Math.abs(axisRad) > LOCOMOTION_CONSTANTS.TELEPORT_BACKWARD_ANGLE_MIN &&
			Math.abs(axisRad) <= LOCOMOTION_CONSTANTS.TELEPORT_BACKWARD_ANGLE_MAX &&
			Math.abs(axisVal) >= LOCOMOTION_CONSTANTS.TELEPORT_VALUE_MIN) ||
		(Math.abs(axisRad) >= LOCOMOTION_CONSTANTS.TELEPORT_FORWARD_ANGLE_MIN &&
			Math.abs(axisRad) < LOCOMOTION_CONSTANTS.TELEPORT_FORWARD_ANGLE_MAX &&
			Math.abs(axisVal) >= LOCOMOTION_CONSTANTS.TELEPORT_VALUE_MIN)
	);
};

/**
 * Execute teleport action
 * @param {THREE.Object3D} viewerTransform
 * @param {THREE.Vector3} teleportPosition
 * @param {*} webxrManager
 */
const teleport = (viewerTransform, teleportPosition, webxrManager) => {
	const footPositionVec = new THREE.Vector3();
	webxrManager.getCamera().getWorldPosition(footPositionVec);

	// we want to teleport the viewerTransform to the position that the ground should be,
	// not where the camera is. This is to avoid 'falling' onto a teleport location.
	const footPositionOffset =
		webxrManager.getCamera().position.y - viewerTransform.position.y;
	footPositionVec.y -= footPositionOffset;

	const offset = new THREE.Vector3();
	offset.copy(teleportPosition);

	// retrieve the offset
	offset.addScaledVector(footPositionVec, -1);

	// locomotion
	viewerTransform.position.add(offset);
};
