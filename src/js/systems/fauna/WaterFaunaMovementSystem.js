/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import {
	WATER_FAUNA_AREAS,
	extrapolateDistanceToCollision,
	generateRandomPointInArea,
	isPointInArea,
} from 'src/js/utils/waterBoundsCheckUtils';
import {
	WaterFaunaGroupComponent,
	WaterFaunaMovementComponent,
} from 'src/js/components/FaunaComponents';

import { InstancedMeshInstanceComponent } from 'src/js/components/InstancedMeshComponent';
import { Object3DComponent } from 'src/js/components/Object3DComponent';
import { PlayerStateComponent } from 'src/js/components/PlayerStateComponent';
import { System } from 'ecsy';
import { getOnlyEntity } from 'src/js/utils/entityUtils';
import { isObjectCulled } from 'src/js/utils/object3dUtils';

const FORWARD_VECTOR = new THREE.Vector3(0, 0, 1);

export class WaterFaunaMovementSystem extends System {
	execute(delta, _time) {
		const playerHead = getOnlyEntity(this.queries.player).getComponent(
			PlayerStateComponent,
		).playerHead;
		this.queries.faunaGroups.results.forEach((groupEntity) => {
			const faunaGroup = groupEntity.getComponent(WaterFaunaGroupComponent);
			faunaGroup.entities.forEach((entity) => {
				const object = entity.getComponent(Object3DComponent).value;
				object.isCulled = isObjectCulled(
					object,
					playerHead,
					faunaGroup.cullingDistance,
				);
				if (object.isCulled) return;
				moveWaterFauna(
					entity,
					delta,
					faunaGroup.areaId,
					faunaGroup.turnStages,
					faunaGroup.turnFactorMultiplier,
					faunaGroup.avoidOthers,
					faunaGroup.entities,
				);
			});
		});
	}
}

WaterFaunaMovementSystem.queries = {
	faunaGroups: { components: [WaterFaunaGroupComponent] },
	player: { components: [PlayerStateComponent] },
};

/**
 * Check min distance from other fauna in the group
 * HIGHLY EXPENSIVE FOR BIG GROUPS!! ONLY USE FOR SMALL GROUPS
 * @param {*} self
 * @param {*} all
 * @returns
 */
const getMinDistanceFromOthers = (self, all) => {
	const selfPosition = self.getComponent(Object3DComponent).value.position;
	let minDistance = Infinity;
	all.forEach((entity) => {
		if (entity == self) return;
		const otherPosition = entity.getComponent(Object3DComponent).value.position;
		minDistance = Math.min(minDistance, selfPosition.distanceTo(otherPosition));
	});
	return minDistance;
};

const moveWaterFauna = (
	entity,
	delta,
	areaId,
	turnStages,
	turnFactorMultiplier,
	avoidOthers,
	allEntities,
) => {
	const mesh = entity.getComponent(Object3DComponent).value;
	const movement = entity.getMutableComponent(WaterFaunaMovementComponent);
	const faunaArea = WATER_FAUNA_AREAS[areaId];
	const originalMovementDirection = FORWARD_VECTOR.clone().applyQuaternion(
		mesh.quaternion,
	);

	let estimatedDistance;

	if (faunaArea.IS_VERTICALLY_SAMPLED) {
		estimatedDistance = extrapolateDistanceToCollision(
			mesh.position.x,
			mesh.position.z,
			-originalMovementDirection.x,
			originalMovementDirection.z,
			faunaArea,
		);
	} else {
		estimatedDistance = extrapolateDistanceToCollision(
			mesh.position.z,
			mesh.position.x,
			-originalMovementDirection.z,
			originalMovementDirection.x,
			faunaArea,
		);
	}

	if (avoidOthers) {
		estimatedDistance = Math.min(
			getMinDistanceFromOthers(entity, allEntities) * 3,
			estimatedDistance,
		);
	}

	if (estimatedDistance > turnStages[0]) {
		mesh.position.add(
			originalMovementDirection.multiplyScalar(delta * movement.speed),
		);
		if (movement.isTurning) {
			movement.turnSign = Math.random() > 0.5 ? 1 : -1;
		}
		movement.isTurning = false;
	} else {
		movement.isTurning = true;
		let turnFactor;
		if (estimatedDistance > turnStages[1]) {
			turnFactor = turnStages[0] - estimatedDistance;
		} else if (estimatedDistance > turnStages[2]) {
			turnFactor =
				Math.pow(turnStages[0] - estimatedDistance, 2) -
				Math.pow(turnStages[0] - turnStages[1], 2) +
				turnStages[0] -
				turnStages[1];
		} else {
			turnFactor =
				Math.pow(turnStages[0] - estimatedDistance, 3) -
				Math.pow(turnStages[0] - turnStages[2], 3) +
				Math.pow(turnStages[0] - turnStages[2], 2) -
				Math.pow(turnStages[0] - turnStages[1], 2) +
				turnStages[0] -
				turnStages[1];
		}
		mesh.rotateY(
			movement.turnSign * turnFactor * turnFactorMultiplier * Math.PI * delta,
		);
		const adjustedMovementDirection = FORWARD_VECTOR.clone().applyQuaternion(
			mesh.quaternion,
		);
		mesh.position.add(
			adjustedMovementDirection.multiplyScalar(delta * movement.speed),
		);
	}

	// should only happen when a fauna is spawned at the edge of the water
	let isMovementLegal = faunaArea.IS_VERTICALLY_SAMPLED
		? isPointInArea(mesh.position.x, mesh.position.z, faunaArea)
		: isPointInArea(mesh.position.z, mesh.position.x, faunaArea);

	if (!isMovementLegal) {
		const [x, y] = generateRandomPointInArea(faunaArea);
		if (faunaArea.IS_VERTICALLY_SAMPLED) {
			mesh.position.x = x;
			mesh.position.z = y;
		} else {
			mesh.position.x = y;
			mesh.position.z = x;
		}
	}

	const instancedMesh = entity.getComponent(InstancedMeshInstanceComponent)
		.instancedMesh;
	if (instancedMesh) {
		instancedMesh.updateInstance(entity);
	}
};
