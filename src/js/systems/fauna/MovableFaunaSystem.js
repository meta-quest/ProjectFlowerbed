/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { FaunaClusterComponent } from '../../components/FaunaClusterComponent';
import { MovableFaunaComponent } from '../../components/MovableFaunaComponent';
import { Object3DComponent } from '../../components/Object3DComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { rotateVertical } from '../../utils/vectorUtils';
import { updateMatrixRecursively } from '../../utils/object3dUtils';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class MovableFaunaSystem extends System {
	execute(delta, time) {
		if (!this.webxrManager) {
			this.queries.gameManager.results.forEach((entity) => {
				const threeglobal = entity.getComponent(THREEGlobalComponent);
				this.webxrManager = threeglobal.renderer.xr;
			});
		}

		if (this.webxrManager.getCamera() && this.webxrManager.isPresenting) {
			const playerPosition = this.webxrManager.getCamera().position.clone();
			playerPosition.y = 0;

			this.queries.faunaCluster.results.forEach((entity) => {
				const cluster = entity.getComponent(FaunaClusterComponent);

				// Determine if player can see the fauna area. If not, then
				// don't need to move the faunas.
				let shouldMove = false;
				if (cluster.meshObservationPoints.length) {
					for (const observationPoint of cluster.meshObservationPoints) {
						const distanceSquared = playerPosition.distanceToSquared(
							observationPoint.position,
						);
						if (distanceSquared < observationPoint.distanceSquared) {
							shouldMove = true;
							break;
						}
					}
				} else {
					shouldMove = true;
				}

				if (shouldMove) {
					this._move(cluster, delta, time);
				}
			});
		}
	}

	_move(cluster, _delta, time) {
		for (const entity of cluster.faunas) {
			const faunaComponent = entity.getMutableComponent(MovableFaunaComponent);
			const obj = entity.getComponent(Object3DComponent).value;

			const newDirection = faunaComponent.direction.clone();
			const turnAroundVector = this._turnAwayFromBounds(
				cluster,
				obj,
				newDirection,
			);
			newDirection.add(turnAroundVector);
			newDirection.add(
				this._getVariation(cluster, faunaComponent, newDirection, time),
			);
			newDirection.normalize();

			if (
				turnAroundVector.y === 0 &&
				cluster.boundingBoxOuterDimensions.y !== 0
			) {
				const angleRadian = this._verticalAngle(newDirection);
				if (angleRadian > cluster.maxYRadian) {
					rotateVertical(newDirection, -Math.PI / 180);
				} else if (angleRadian < cluster.minYRadian) {
					rotateVertical(newDirection, Math.PI / 180);
				}
			}

			obj.position.add(
				newDirection.clone().multiplyScalar(faunaComponent.speed),
			);

			const direction = newDirection.clone();
			if (cluster.negateDirection) {
				direction.negate();
			}
			direction.add(obj.position);
			obj.lookAt(direction);

			faunaComponent.direction = newDirection;

			updateMatrixRecursively(obj);
		}
	}

	_getVariation(cluster, faunaComponent, direction, time) {
		const variationVector = direction.clone();

		if (cluster.verticalPathVariationFactor !== 0) {
			const frequency = cluster.verticalPathVariationFrequency;
			const factor = cluster.verticalPathVariationFactor;
			const variationRadian =
				Math.sin(
					2 *
						Math.PI *
						frequency *
						(time + faunaComponent.verticalVariationOffset),
				) * factor;
			rotateVertical(variationVector, variationRadian);
		}

		if (cluster.horizontalPathVariationFactor !== 0) {
			const frequency = cluster.horizontalPathVariationFrequency;
			const factor = cluster.horizontalPathVariationFactor;
			const variationRadian =
				Math.sin(
					2 *
						Math.PI *
						frequency *
						(time + faunaComponent.horizontalVariationOffset),
				) * factor;
			variationVector.applyAxisAngle(Y_AXIS, variationRadian);
		}

		return variationVector.sub(direction);
	}

	_turnAwayFromBounds(cluster, obj, direction) {
		const newDirection = direction.clone();
		const nextPosition = obj.position.clone().add(direction);

		let appliedXZRotation = false;

		if (obj.position.x < cluster.boundingBoxInnerMin.x) {
			if (obj.position.z > nextPosition.z) {
				newDirection.applyAxisAngle(Y_AXIS, -1 * cluster.turnDegreesRadian);
			} else {
				newDirection.applyAxisAngle(Y_AXIS, cluster.turnDegreesRadian);
			}
			appliedXZRotation = true;
		} else if (obj.position.x > cluster.boundingBoxInnerMax.x) {
			if (obj.position.z > nextPosition.z) {
				newDirection.applyAxisAngle(Y_AXIS, cluster.turnDegreesRadian);
			} else {
				newDirection.applyAxisAngle(Y_AXIS, -1 * cluster.turnDegreesRadian);
			}
			appliedXZRotation = true;
		}

		if (cluster.boundingBoxOuterDimensions.y !== 0) {
			if (obj.position.y < cluster.boundingBoxInnerMin.y) {
				if (obj.position.x > nextPosition.x) {
					newDirection.applyAxisAngle(Z_AXIS, -1 * cluster.turnDegreesRadian);
				} else {
					newDirection.applyAxisAngle(Z_AXIS, cluster.turnDegreesRadian);
				}
			} else if (obj.position.y > cluster.boundingBoxInnerMax.y) {
				if (obj.position.x > nextPosition.x) {
					newDirection.applyAxisAngle(Z_AXIS, cluster.turnDegreesRadian);
				} else {
					newDirection.applyAxisAngle(Z_AXIS, -1 * cluster.turnDegreesRadian);
				}
			}
		}

		if (!appliedXZRotation) {
			if (obj.position.z < cluster.boundingBoxInnerMin.z) {
				if (obj.position.x > nextPosition.x) {
					newDirection.applyAxisAngle(Y_AXIS, cluster.turnDegreesRadian);
				} else {
					newDirection.applyAxisAngle(Y_AXIS, -1 * cluster.turnDegreesRadian);
				}
			} else if (obj.position.z > cluster.boundingBoxInnerMax.z) {
				if (obj.position.x > nextPosition.x) {
					newDirection.applyAxisAngle(Y_AXIS, -1 * cluster.turnDegreesRadian);
				} else {
					newDirection.applyAxisAngle(Y_AXIS, cluster.turnDegreesRadian);
				}
			}
		}

		return newDirection.sub(direction);
	}

	_verticalAngle(direction) {
		const xzDirection = direction.clone();
		xzDirection.y = 0;
		xzDirection.normalize();

		let angleRadian = direction.angleTo(xzDirection);
		if (direction.y > 0) {
			angleRadian *= -1;
		}
		return angleRadian;
	}
}

MovableFaunaSystem.queries = {
	gameManager: { components: [THREEGlobalComponent] },
	faunaCluster: { components: [FaunaClusterComponent] },
};
