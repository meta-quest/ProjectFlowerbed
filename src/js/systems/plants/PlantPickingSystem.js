/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import {
	CollisionWorldComponent,
	StaticColliderComponent,
} from '../../components/ColliderComponents';
import {
	InstancedMeshComponent,
	InstancedMeshInstanceComponent,
} from '../../components/InstancedMeshComponent';
import {
	PickedPlantComponent,
	PlantShrinkingComponent,
	PlantTinyColliderComponent,
	PlantedComponent,
} from '../../components/PlantingComponents';

import { COLLISION_LAYERS } from '../../Constants';
import { GameStateComponent } from '../../components/GameStateComponent';
import { InteractionSystem } from '../../lib/InteractionSystem';
import { MeshIdComponent } from '../../components/AssetReplacementComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { OneshotAudioComponent } from '../../components/AudioComponents';
import { RayComponent } from '../../components/RayComponents';
import { TRIGGERS } from '../../lib/ControllerInterface';
import { getOnlyEntity } from '../../utils/entityUtils';

const INTERACTION_MODES = GameStateComponent.INTERACTION_MODES;
const PICKED_STATES = PickedPlantComponent.STATES;

export class PlantPickingSystem extends InteractionSystem {
	constructor(world, attributes) {
		super(world, attributes);
		this.interactionMode = INTERACTION_MODES.PICKING;
	}

	init() {
		this.hoveredPlantEntity = null;
	}

	onEnterMode() {
		this.uiRayComponent.visible = true;
		this.uiRayComponent.setRayType(RayComponent.RAY_TYPES.PICKING_RAY);
	}

	onExitMode() {
		this.uiRayComponent.visible = false;
		if (this.hoveredPlantEntity) {
			this._setPlantHighlight(this.hoveredPlantEntity, false);
		}
	}

	onCorrectInteractionMode(_delta, _time) {
		const intersectedPlantEntity = this._getIntersectedPlantEntity(
			this.uiRayComponent.raycaster,
		);

		let pickedPlantAnimationInProgress = false;

		this.queries.picked.results.forEach((entity) => {
			let pickedPlantComponent = entity.getComponent(PickedPlantComponent);
			pickedPlantAnimationInProgress |=
				pickedPlantComponent.state === PICKED_STATES.FLYING_TO_HAND ||
				pickedPlantComponent.state === PICKED_STATES.IN_HAND;
		});

		// hide plant, ring and ray when plant picking animation is playing
		if (pickedPlantAnimationInProgress) {
			this.uiRayComponent.visible = false;
			return;
		} else {
			this.uiRayComponent.visible = true;
		}

		if (intersectedPlantEntity) {
			const [plantEntity, tinyColliderEntity] = getActualPlantEntity(
				intersectedPlantEntity,
			);

			if (plantEntity.hasComponent(PlantShrinkingComponent)) {
				if (this.hoveredPlantEntity) {
					this._setPlantHighlight(this.hoveredPlantEntity, false);
				}
				this.hoveredPlantEntity = null;
			} else {
				if (this.hoveredPlantEntity != plantEntity) {
					if (this.hoveredPlantEntity) {
						this._setPlantHighlight(this.hoveredPlantEntity, false);
					}
					this._setPlantHighlight(plantEntity, true);
					this.hoveredPlantEntity = plantEntity;
				}
				this.uiRayComponent.setRayMode(RayComponent.RAY_MODES.SPECIAL);
				if (
					this.controllerInterfaces.RIGHT.triggerJustPressed(
						TRIGGERS.INDEX_TRIGGER,
					)
				) {
					this._setPlantHighlight(plantEntity, false);
					this._tryPickPlant(plantEntity, tinyColliderEntity);
				}
			}
		} else {
			this.uiRayComponent.setRayMode(RayComponent.RAY_MODES.DEFAULT);
			if (this.hoveredPlantEntity) {
				this._setPlantHighlight(this.hoveredPlantEntity, false);
				this.hoveredPlantEntity = null;
			}
		}
	}

	/**
	 * Get the ECSY entity of the intersected plant
	 * @param {THREE.Raycaster|CurvedRaycaster} raycaster - raycaster that implements intersectObjects
	 * @returns {Entity?} - null or ECSY entity of the intersected plant
	 */
	_getIntersectedPlantEntity(raycaster) {
		let collisionWorldEntity = getOnlyEntity(this.queries.collisionWorld);

		const collisionWorld = collisionWorldEntity.getComponent(
			CollisionWorldComponent,
		).world;

		if (!collisionWorld) {
			return undefined;
		}

		const intersects = raycaster.intersectCollisionWorld(collisionWorld, {
			all: COLLISION_LAYERS.PLANT,
		});
		if (intersects) {
			let intersect = intersects.intersection;

			const plantEntity = StaticColliderComponent.getEntityFromCollider(
				intersect.object,
			);

			return plantEntity;
		}
		return undefined;
	}

	/**
	 * Remove the plant and clean up its entity if pickable
	 * @param {*} intersectedEntity - ECSY entity of the intersected plant
	 */
	_tryPickPlant(plantEntity, tinyColliderEntity) {
		let plantedComponent = plantEntity.getComponent(PlantedComponent);
		let plantObject = plantEntity.getComponent(Object3DComponent).value;
		if (!plantedComponent.pickable) return;

		if (plantEntity.hasComponent(InstancedMeshInstanceComponent)) {
			plantEntity.getMutableComponent(
				InstancedMeshInstanceComponent,
			).alwaysUpdate = true;
		}

		plantEntity.addComponent(PlantShrinkingComponent, {
			plantType: plantedComponent.plantType,
		});

		// remove tiny collider
		const tinyColliderObject = tinyColliderEntity.getComponent(
			StaticColliderComponent,
		).mesh;
		tinyColliderObject.parent.remove(tinyColliderObject);
		tinyColliderEntity.remove();

		OneshotAudioComponent.createSFX(this.world, {
			id: 'REMOVING_SEED',
			position: plantObject.position,
		});
		this.gameStateComponent.updateGardenPending = true;
	}

	_setPlantHighlight(plantEntity, highlight) {
		const meshId = plantEntity.getComponent(MeshIdComponent)?.id;
		if (!meshId) return;
		const instanceId = plantEntity.getComponent(InstancedMeshInstanceComponent)
			.instanceId;
		this.queries.meshInstances.results.forEach((entity) => {
			const instancedMeshComponent = entity.getComponent(
				InstancedMeshComponent,
			);
			if (instancedMeshComponent.meshId == meshId) {
				const newValues = highlight
					? { emissive: new THREE.Color().set(0x660000) }
					: { emissive: new THREE.Color().set(0x000000) };

				instancedMeshComponent.mesh.updateInstance(instanceId, newValues);
			}
		});
	}
}

PlantPickingSystem.addQueries({
	picked: { components: [PickedPlantComponent, Object3DComponent] },
	collisionWorld: { components: [CollisionWorldComponent] },
	meshInstances: { components: [InstancedMeshComponent] },
});

const getActualPlantEntity = (intersectedEntity) => {
	let plantEntity;
	let tinyColliderEntity;
	if (intersectedEntity.hasComponent(PlantTinyColliderComponent)) {
		plantEntity = intersectedEntity.getComponent(PlantTinyColliderComponent)
			.plantEntity;
		tinyColliderEntity = intersectedEntity;
	} else {
		plantEntity = intersectedEntity;
		tinyColliderEntity = plantEntity.getComponent(PlantedComponent)
			.tinyColliderEntity;
	}
	return [plantEntity, tinyColliderEntity];
};
