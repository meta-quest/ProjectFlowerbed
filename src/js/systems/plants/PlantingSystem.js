/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import {
	COLLISION_LAYERS,
	PLANTING_CONSTANTS,
	PLANT_GROUPS,
} from '../../Constants';
import {
	CollisionWorldComponent,
	StaticColliderComponent,
} from '../../components/ColliderComponents';
import {
	PlantedComponent,
	PlantingStateComponent,
	SeedAnimationComponent,
} from '../../components/PlantingComponents';
import { deleteEntity, getOnlyEntity } from '../../utils/entityUtils';

import { FaunaColliderComponent } from '../../components/FaunaColliderComponent';
import { GameStateComponent } from '../../components/GameStateComponent';
import { InteractionSystem } from '../../lib/InteractionSystem';
import { MeshIdComponent } from '../../components/AssetReplacementComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { OneshotAudioComponent } from '../../components/AudioComponents';
import { PROP_TRANSFORM_OFFSET } from '../../PropsTransformOffset';
import { RayComponent } from '../../components/RayComponents';
import { SeedboxComponent } from '../../components/SeedboxComponents';
import { TRIGGERS } from '../../lib/ControllerInterface';
import { getSeedbagMeshId } from '../../utils/plantUtils';

const INTERACTION_MODES = GameStateComponent.INTERACTION_MODES;
const PLANTING_COOLDOWN = 1.0;

export class PlantingSystem extends InteractionSystem {
	constructor(world, attributes) {
		super(world, attributes);
		this.interactionMode = INTERACTION_MODES.PLANTING;
	}

	init() {
		const plantingSystemEntity = this.world.createEntity();
		plantingSystemEntity.addComponent(PlantingStateComponent);
		this.plantingStateComponent = plantingSystemEntity.getMutableComponent(
			PlantingStateComponent,
		);
		this.selectedSeedbagEntity = null;
		this.seedbagPlantIndex = null;
		this.lastPlantTime = 0;
	}

	onEnterMode() {
		this.targetRayComponent.visible = true;
		this.targetRayComponent.setRayType(RayComponent.RAY_TYPES.PLANTING_RAY);

		const seedboxComponent = getOnlyEntity(
			this.queries.seedbox,
		).getMutableComponent(SeedboxComponent);
		this._updateSeedbagInHand(seedboxComponent);
		this.seedbagPlantIndex = seedboxComponent.currentPlantIndex;
	}

	onExitMode() {
		this.targetRayComponent.visible = false;
		this.selectedSeedbagEntity.getComponent(
			Object3DComponent,
		).value.visible = false;
	}

	onCorrectInteractionMode(_delta, time) {
		const seedboxEntity = getOnlyEntity(this.queries.seedbox);
		const seedboxComponent = seedboxEntity.getMutableComponent(
			SeedboxComponent,
		);

		if (this.seedbagPlantIndex != seedboxComponent.currentPlantIndex) {
			this._updateSeedbagInHand(seedboxComponent);
			this.seedbagPlantIndex = seedboxComponent.currentPlantIndex;
		}

		if (
			seedboxComponent.inFocus &&
			(seedboxComponent.inSelectionZone || seedboxComponent.isPointedAt)
		) {
			this.targetRayComponent.visible = false;
			return;
		}

		this.targetRayComponent.visible = true;

		let collisionWorldEntity = getOnlyEntity(this.queries.collisionWorld);

		const collisionWorld = collisionWorldEntity.getComponent(
			CollisionWorldComponent,
		).world;
		if (!collisionWorld) {
			return;
		}

		// hide plant and ring if we're currently on top of another plant
		if (
			this._isIntersectingPlant(
				this.targetRayComponent.raycaster,
				collisionWorld,
			) ||
			this._isIntersectingStationaryFauna(this.targetRayComponent.raycaster)
		) {
			this.targetRayComponent.setRayMode(RayComponent.RAY_MODES.SPECIAL);
			this.plantingStateComponent.plantingPossible = false;
			return;
		} else {
			this.targetRayComponent.setRayMode(RayComponent.RAY_MODES.DEFAULT);
		}

		const intersect = this.targetRayComponent.raycaster.intersectCollisionWorld(
			collisionWorld,
			{
				all: COLLISION_LAYERS.OBSTACLE,
			},
		)?.intersection;

		if (
			intersect?.object &&
			StaticColliderComponent.getEntityFromCollider(intersect.object)
				.getComponent(StaticColliderComponent)
				.hasLayer(COLLISION_LAYERS.PLANTABLE_SURFACE) &&
			this.lastPlantTime + PLANTING_COOLDOWN < time
		) {
			this.targetRayComponent.setRayMode(RayComponent.RAY_MODES.DEFAULT);
			this.plantingStateComponent.plantingPossible = true;
			this.plantingStateComponent.plantingTarget.copy(intersect.point);
			this.indicatorRingComponent.setRingTransformFromIntersection(intersect);
		} else {
			this.targetRayComponent.setRayMode(RayComponent.RAY_MODES.SPECIAL);
			this.plantingStateComponent.plantingPossible = false;
		}

		const controller = this.controllerInterfaces.RIGHT;

		if (
			controller.triggerJustReleased(TRIGGERS.INDEX_TRIGGER) &&
			this.plantingStateComponent.plantingPossible === true
		) {
			this.lastPlantTime = time;
			this._shootSeed(seedboxEntity);
			controller.pulse(1, 10);
		}
	}

	/**
	 * Checks whether raycast intersects any plants
	 * @param {CurvedRaycaster} raycaster - raycaster that implements intersectCollisionWorld
	 * @param {CollisionWorld} collisionWorld
	 * @returns {Boolean}
	 */
	_isIntersectingPlant(raycaster, collisionWorld) {
		const intersects = raycaster.intersectCollisionWorld(collisionWorld, {
			all: COLLISION_LAYERS.PLANT,
		});

		if (intersects) {
			return true;
		}
		return false;
	}

	/**
	 * Checks whether raycast intersects any stationary faunas
	 * @param {CurvedRaycaster} raycaster
	 * @returns {Boolean}
	 */
	_isIntersectingStationaryFauna(raycaster) {
		const colliders = this.queries.faunaColliders.results.map(
			(e) => e.getComponent(FaunaColliderComponent).value,
		);
		const intersections = raycaster.intersectObjects(colliders);
		return !!intersections.length;
	}

	_updateSeedbagInHand(seedboxComponent) {
		if (this.selectedSeedbagEntity) {
			deleteEntity(this.threeGlobalComponent.scene, this.selectedSeedbagEntity);
		}
		this.selectedSeedbagEntity = this.world.createEntity();

		const seedbagMesh = new THREE.Object3D();
		this.controllerInterfaces.RIGHT.controllerModel.parent.add(seedbagMesh);

		const transformOffset = PROP_TRANSFORM_OFFSET['SEEDBAG'];

		seedbagMesh.position.fromArray(transformOffset.position);
		seedbagMesh.quaternion.fromArray(transformOffset.quaternion);
		seedbagMesh.scale.fromArray(transformOffset.scale);

		this.selectedSeedbagEntity.addComponent(Object3DComponent, {
			value: seedbagMesh,
		});
		this.selectedSeedbagEntity.addComponent(MeshIdComponent, {
			id: getSeedbagMeshId(seedboxComponent.getCurrentPlantGroup()),
		});
	}

	/**
	 * Spawn and shoot the seed
	 * @param {Entity} seedboxEntity
	 */
	_shootSeed(seedboxEntity) {
		const flightCurve = new THREE.CatmullRomCurve3(
			this.targetRayComponent.raycaster.getPoints(),
		);
		const arcLength = flightCurve.getLength();
		const flightTime = arcLength / PLANTING_CONSTANTS.SEED_FLYING_SPEED;

		const seedObject = new THREE.Mesh(
			new THREE.SphereGeometry(0.02, 16, 8),
			new THREE.MeshPhongMaterial({ color: 0x013220 }),
		);
		seedObject.position.copy(flightCurve.getPointAt(0));
		this.threeGlobalComponent.scene.add(seedObject);

		const plantGroup = seedboxEntity
			.getComponent(SeedboxComponent)
			.getCurrentPlantGroup();

		// randomize the plant type from all variants under the plantGroup
		const plantType =
			PLANT_GROUPS[plantGroup][
				Math.floor(Math.random() * PLANT_GROUPS[plantGroup].length)
			];

		const plantingIndicator = this.plantingStateComponent.plantingIndicatorEntity.getComponent(
			Object3DComponent,
		).value;

		const seedEntity = this.world.createEntity();
		seedEntity.addComponent(Object3DComponent, { value: seedObject });
		seedEntity.addComponent(SeedAnimationComponent, {
			flightCurve,
			flightTime,
			plantType,
			plantedPosition: plantingIndicator.position.clone(),
			plantedQuaternion: plantingIndicator.quaternion.clone(),
		});

		OneshotAudioComponent.createSFX(this.world, {
			id: 'THROW_SEED',
			position: seedObject.position,
		});
	}
}

PlantingSystem.addQueries({
	seedbox: { components: [SeedboxComponent] },
	seed: { components: [SeedAnimationComponent, Object3DComponent] },
	collisionWorld: { components: [CollisionWorldComponent] },
	planted: { components: [PlantedComponent, Object3DComponent] },
	faunaColliders: { components: [FaunaColliderComponent] },
});
