/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import {
	AerialFaunaGroupComponent,
	AerialFaunaMovementComponent,
} from 'src/js/components/FaunaComponents';

import { InstancedMeshInstanceComponent } from 'src/js/components/InstancedMeshComponent';
import { Object3DComponent } from 'src/js/components/Object3DComponent';
import { PlayerStateComponent } from 'src/js/components/PlayerStateComponent';
import { System } from 'ecsy';
import { getOnlyEntity } from 'src/js/utils/entityUtils';
import { isObjectCulled } from 'src/js/utils/object3dUtils';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export class AerialFaunaMovementSystem extends System {
	execute(delta, time) {
		const playerHead = getOnlyEntity(this.queries.player).getComponent(
			PlayerStateComponent,
		).playerHead;
		this.queries.faunaGroups.results.forEach((groupEntity) => {
			const faunaGroup = groupEntity.getComponent(AerialFaunaGroupComponent);
			faunaGroup.entities.forEach((entity) => {
				const object = entity.getComponent(Object3DComponent).value;
				object.isCulled = isObjectCulled(
					object,
					playerHead,
					faunaGroup.cullingDistance,
				);
				// still move ariel fauna when culled, but do not animate them
				moveAerialFauna(entity, faunaGroup, delta, time);
			});
		});
	}
}

AerialFaunaMovementSystem.queries = {
	faunaGroups: { components: [AerialFaunaGroupComponent] },
	player: { components: [PlayerStateComponent] },
};

const rotateVertical = (vector, angleRadian) => {
	// The cross product with the Y-axis will give a perpendicular axis
	// that can be used to rotate the direction vector vertically.
	const perpendicularAxis = vector.clone().cross(Y_AXIS).negate();
	vector.applyAxisAngle(perpendicularAxis, angleRadian);
};

const moveAerialFauna = (entity, group, delta, time) => {
	const movement = entity.getMutableComponent(AerialFaunaMovementComponent);
	const faunaObject = entity.getComponent(Object3DComponent).value;

	const newDirection = movement.direction.clone();
	const turnAroundVector = turnAwayFromBounds(group, faunaObject, newDirection);
	newDirection.add(turnAroundVector);
	newDirection.add(getVariation(group, movement, newDirection, time));
	newDirection.normalize();

	if (turnAroundVector.y === 0) {
		const angleRadian = verticalAngle(newDirection);
		if (angleRadian > group.maxYRadian) {
			rotateVertical(newDirection, -Math.PI / 180);
		} else if (angleRadian < group.minYRadian) {
			rotateVertical(newDirection, Math.PI / 180);
		}
	}

	faunaObject.position.add(
		newDirection.clone().multiplyScalar(movement.speed * delta),
	);

	const direction = newDirection.clone();
	direction.add(faunaObject.position);
	faunaObject.lookAt(direction);

	movement.direction = newDirection;

	const instancedMesh = entity.getComponent(InstancedMeshInstanceComponent)
		.instancedMesh;
	if (instancedMesh) {
		instancedMesh.updateInstance(entity);
	}
};

const getVariation = (group, faunaComponent, direction, time) => {
	const variationVector = direction.clone();

	if (group.verticalPathVariationFactor !== 0) {
		const frequency = group.verticalPathVariationFrequency;
		const factor = group.verticalPathVariationFactor;
		const variationRadian =
			Math.sin(
				2 *
					Math.PI *
					frequency *
					(time + faunaComponent.verticalVariationOffset),
			) * factor;
		rotateVertical(variationVector, variationRadian);
	}

	if (group.horizontalPathVariationFactor !== 0) {
		const frequency = group.horizontalPathVariationFrequency;
		const factor = group.horizontalPathVariationFactor;
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
};

const _sphere = new THREE.Sphere();
const _boundsCenter = new THREE.Vector3();
const turnAwayFromBounds = (group, faunaObject, direction) => {
	group.boundingBox3.getCenter(_boundsCenter);
	group.boundingBox3.getBoundingSphere(_sphere);

	const newDirection = direction.clone();
	const flatPos = faunaObject.position.clone().sub(_boundsCenter);
	flatPos.y = 0.0;
	if (flatPos.lengthSq() > _sphere.radius * _sphere.radius) {
		newDirection.applyAxisAngle(Y_AXIS, group.turnDegreesRadian);
	}

	return newDirection.sub(direction);
};

const verticalAngle = (direction) => {
	const xzDirection = direction.clone();
	xzDirection.y = 0;
	xzDirection.normalize();

	let angleRadian = direction.angleTo(xzDirection);
	if (direction.y > 0) {
		angleRadian *= -1;
	}
	return angleRadian;
};
