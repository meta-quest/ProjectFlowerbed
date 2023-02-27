/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import {
	getObjectAngleToCamera,
	isObjectCulled,
	updateMatrixRecursively,
} from '../../utils/object3dUtils';

import { COLLISION_LAYERS } from '../../Constants';
import { CollisionWorldComponent } from '../../components/ColliderComponents';
import { DEBUG_CONSTANTS } from '../../Constants';
import { FaunaColliderComponent } from '../../components/FaunaColliderComponent';
import { Object3DComponent } from '../../components/Object3DComponent';
import { PlayerStateComponent } from 'src/js/components/PlayerStateComponent';
import { SkeletonAnimationComponent } from '../../components/SkeletonAnimationComponent';
import { StationaryFaunaComponent } from '../../components/StationaryFaunaComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { getOnlyEntity } from 'src/js/utils/entityUtils';

const CLOSE_BY_DISTANCE = 5;
const STOP_ANIMATION_DISTANCE = 25;

export const MAX_SECONDS_BETWEEN_IDLE_ANIMATION = 15;
export const MIN_SECONDS_BETWEEN_IDLE_ANIMATION = 5;

// Fauna could respawn if the player is more than respawn distance away and
// looking at least the respawn angle away from the fauna
const RESPAWN_DISTANCE = 30;
const RESPAWN_ANGLE_RADIAN = (60 * Math.PI) / 180;

export class StationaryFaunaSystem extends System {
	init() {
		// Needed to obtain the player position
		this.webxrManager = null;
		this.playerHead = getOnlyEntity(this.queries.player).getComponent(
			PlayerStateComponent,
		).playerHead;
	}

	execute(delta, time) {
		if (!this.webxrManager) {
			this.queries.gameManager.results.forEach((entity) => {
				const threeglobal = entity.getComponent(THREEGlobalComponent);
				this.webxrManager = threeglobal.renderer.xr;
			});
		}

		if (this.webxrManager.getCamera() && this.webxrManager.isPresenting) {
			const playerDirection = this.webxrManager
				.getCamera()
				.getWorldDirection(new THREE.Vector3());
			const playerPosition = this.webxrManager.getCamera().position;

			const faunasLocations = this.queries.stationaryFaunas.results.map(
				(entity) => {
					const obj = entity.getComponent(Object3DComponent).value;
					return obj.position;
				},
			);
			this.queries.stationaryFaunas.results.forEach((entity) => {
				this._reactToPlayer(
					entity,
					faunasLocations,
					playerPosition,
					playerDirection,
					time,
				);
			});
		}

		this._animate(delta);
	}

	_animate(delta) {
		this.queries.skeletonTargets.results.forEach((entity) => {
			const object = entity.getComponent(Object3DComponent).value;
			if (isObjectCulled(object, this.playerHead, STOP_ANIMATION_DISTANCE))
				return;
			const component = entity.getMutableComponent(SkeletonAnimationComponent);
			const mixer = component.animationMixer;
			if (mixer) {
				mixer.update(delta);

				if (component.animationActions.length === 0) {
					return;
				}

				const crossFadeTime = 0.5;
				if (component.currentEngagedAnimationIndex >= 0) {
					// Player is close by and we should be playing the engaged
					// animation action. Check to see if fauna has cross faded
					// to the engaged animation yet, if not then cross fade to it.
					if (!component.engagedAnimationAction) {
						const currentAction =
							component.animationActions[component.currentAnimationActionIndex];
						if (
							currentAction.loop === THREE.LoopOnce &&
							!currentAction.enabled
						) {
							currentAction.reset();
						}

						component.engagedAnimationAction =
							component.animationActions[
								component.currentEngagedAnimationIndex
							];
						component.engagedAnimationAction.enabled = true;

						currentAction.crossFadeTo(
							component.engagedAnimationAction,
							crossFadeTime,
							true,
						);
					}
				} else {
					// Player is no longer close by. Check to see if fauna has
					// cross faded to non-engaged animation action yet, if not
					// then do the cross fade.
					if (component.engagedAnimationAction) {
						const currentAction =
							component.animationActions[component.currentAnimationActionIndex];
						currentAction.enabled = true;

						component.engagedAnimationAction.crossFadeTo(
							currentAction,
							crossFadeTime,
							true,
						);
						component.engagedAnimationAction = null;
					} else {
						component.idleAnimationSwitchTimer -= delta;

						const currentAction =
							component.animationActions[component.currentAnimationActionIndex];

						let needsToSwitch = component.idleAnimationSwitchTimer < 0;
						if (
							currentAction.loop === THREE.LoopOnce &&
							!currentAction.enabled
						) {
							needsToSwitch = true;
							currentAction.reset();
						}

						if (needsToSwitch) {
							component.idleAnimationSwitchTimer =
								Math.random() *
									(MAX_SECONDS_BETWEEN_IDLE_ANIMATION -
										MIN_SECONDS_BETWEEN_IDLE_ANIMATION) +
								MIN_SECONDS_BETWEEN_IDLE_ANIMATION;

							let randomIndex = Math.floor(
								Math.random() * component.idleAnimations.length,
							);
							while (randomIndex === component.currentAnimationActionIndex) {
								randomIndex = Math.floor(
									Math.random() * component.idleAnimations.length,
								);
							}

							const newAction = component.animationActions[randomIndex];
							newAction.enabled = true;

							currentAction.crossFadeTo(newAction, crossFadeTime, true);
							component.currentAnimationActionIndex = randomIndex;
						}
					}
				}
			}
			updateMatrixRecursively(entity.getComponent(Object3DComponent).value);
		});
	}

	_reactToPlayer(
		entity,
		faunasLocations,
		playerPosition,
		playerDirection,
		_time,
	) {
		const obj = entity.getComponent(Object3DComponent).value;
		const distance = obj.position.distanceTo(playerPosition);

		const faunaComponent = entity.getMutableComponent(StationaryFaunaComponent);
		let animationComponent = entity.getMutableComponent(
			SkeletonAnimationComponent,
		);

		if (distance < CLOSE_BY_DISTANCE) {
			faunaComponent.playerBeenCloseBy = true;
			if (animationComponent && animationComponent.engagedAnimations.length) {
				animationComponent.currentEngagedAnimationIndex =
					Math.floor(
						Math.random() * animationComponent.engagedAnimations.length,
					) + animationComponent.idleAnimations.length;
			}
		} else if (animationComponent) {
			animationComponent.currentEngagedAnimationIndex = -1;
		}

		if (faunaComponent.playerBeenCloseBy) {
			// Figure out if the player is looking at the entity
			const angleRadian = getObjectAngleToCamera(obj, this.playerHead);

			if (
				distance > RESPAWN_DISTANCE &&
				Math.abs(angleRadian) > RESPAWN_ANGLE_RADIAN
			) {
				let collisionWorld;
				this.queries.collisionWorld.results.forEach((entity) => {
					collisionWorld = entity.getComponent(CollisionWorldComponent).world;
				});

				const colliderObj = entity.getComponent(FaunaColliderComponent).value;
				let radius;
				if (
					colliderObj.geometry.parameters.radiusBottom ||
					colliderObj.geometry.parameters.radius
				) {
					radius =
						colliderObj.geometry.parameters.radiusBottom ||
						colliderObj.geometry.parameters.radius;
				} else {
					if (!colliderObj.geometry.boundingSphere) {
						colliderObj.geometry.computeBoundingSphere();
					}
					radius = colliderObj.geometry.boundingSphere.radius;
				}

				// When the player is far away and not looking at the fauna, pick a
				// random spawn location and move the fauna there.
				const candidateLocations = faunaComponent.spawnLocations.filter(
					(candidatePosition) => {
						if (candidatePosition.equals(obj.position)) {
							return false;
						}

						// Don't pick a place that's close to the player
						const candidateDistance = candidatePosition.distanceTo(
							playerPosition,
						);
						if (candidateDistance < RESPAWN_DISTANCE) {
							return false;
						}

						// Don't pick a place that the player might be looking at
						const candidateDirection = candidatePosition
							.clone()
							.sub(playerPosition)
							.normalize();
						const candidateAngleRadian = candidateDirection.angleTo(
							playerDirection,
						);
						if (Math.abs(candidateAngleRadian) < RESPAWN_ANGLE_RADIAN) {
							return false;
						}

						// Don't pick a place where there are plants already
						const plantObjects = collisionWorld.sphereCast(
							candidatePosition,
							radius,
							{
								all: COLLISION_LAYERS.PLANT,
							},
						);
						if (plantObjects.length) {
							return false;
						}

						// Don't pick a place another fauna is at
						for (const location of faunasLocations) {
							if (candidatePosition.equals(location)) {
								return false;
							}
						}

						return true;
					},
				);

				if (candidateLocations.length) {
					const randomIndex = Math.floor(
						Math.random() * candidateLocations.length,
					);
					const newLocation = candidateLocations[randomIndex];
					obj.position.copy(newLocation);

					const colliderObj = entity.getComponent(FaunaColliderComponent).value;
					colliderObj.position.copy(newLocation);
					colliderObj.updateMatrix();

					const randomDirection = new THREE.Vector3();
					randomDirection.random();
					randomDirection.y = 0;
					obj.lookAt(randomDirection);

					faunaComponent.playerBeenCloseBy = false;
				} else if (DEBUG_CONSTANTS.DEBUG_FAUNA_RESPAWN) {
					const colliderObj = entity.getComponent(FaunaColliderComponent).value;
					colliderObj.material.color = new THREE.Color(0xff0000);
				}
			}
		}
	}
}

StationaryFaunaSystem.queries = {
	gameManager: { components: [THREEGlobalComponent] },
	player: { components: [PlayerStateComponent] },
	stationaryFaunas: { components: [StationaryFaunaComponent] },
	collisionWorld: { components: [CollisionWorldComponent] },
	skeletonTargets: {
		components: [StationaryFaunaComponent, SkeletonAnimationComponent],
	},
};
