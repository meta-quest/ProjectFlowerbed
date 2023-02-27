/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { COLLISION_LAYERS, RAY_CONSTANTS } from '../../Constants';
import {
	CollisionWorldComponent,
	StaticColliderComponent,
} from '../../components/ColliderComponents';
import {
	PlantGrowingComponent,
	PlantTinyColliderComponent,
	PlantedComponent,
} from '../../components/PlantingComponents';

import { GameStateComponent } from '../../components/GameStateComponent';
import { InstancedMeshInstanceComponent } from '../../components/InstancedMeshComponent';
import { InteractionSystem } from '../../lib/InteractionSystem';
import { LoopingAudioComponent } from '../../components/AudioComponents';
import { MeshIdComponent } from '../../components/AssetReplacementComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { PROP_TRANSFORM_OFFSET } from '../../PropsTransformOffset';
import { RayComponent } from '../../components/RayComponents';
import { SceneLightingComponent } from '../../components/SceneLightingComponent';
import { TRIGGERS } from '../../lib/ControllerInterface';
import { getOnlyEntity } from '../../utils/entityUtils';
import { updateMatrixRecursively } from '../../utils/object3dUtils';

const INTERACTION_MODES = GameStateComponent.INTERACTION_MODES;
const DEBUG = false;

export class WateringSystem extends InteractionSystem {
	constructor(world, attributes) {
		super(world, attributes);
		this.interactionMode = INTERACTION_MODES.WATERING;
	}

	init() {
		this.gameObjectsCreated = false;

		this.colliderObject = null;
		this.colliderSphere = null;

		this.waterSoundEntity = this.world.createEntity();
		this.growingSoundEntity = this.world.createEntity();
		this.growingSoundEntity2 = this.world.createEntity();
		this.wateringCanSpout = null;
		this.wateringSpoutPosition = new THREE.Vector3();
		this.wateringSpoutDirection = new THREE.Vector3();

		this.intersectedPlantEntities = new Set();

		this.wasWatering = false;
	}

	onEnterMode() {
		if (!this.gameObjectsCreated) {
			this._createGameObjects();
			this.gameObjectsCreated = true;
		}

		this.wateringCanEntity.getComponent(Object3DComponent).value.visible = true;

		this.targetRayComponent.originOverride = this.wateringSpoutPosition;
		this.targetRayComponent.directionOverride = this.wateringSpoutDirection;
	}

	onExitMode() {
		this.wateringCanEntity.getComponent(
			Object3DComponent,
		).value.visible = false;
		this.colliderObject.visible = false;

		if (this.waterSoundEntity.hasComponent(LoopingAudioComponent)) {
			this.waterSoundEntity.removeComponent(LoopingAudioComponent);
		}
		if (this.growingSoundEntity.hasComponent(LoopingAudioComponent)) {
			this.growingSoundEntity.removeComponent(LoopingAudioComponent);
		}
		if (this.growingSoundEntity2.hasComponent(LoopingAudioComponent)) {
			this.growingSoundEntity2.removeComponent(LoopingAudioComponent);
		}

		this.targetRayComponent.originOverride = null;
		this.targetRayComponent.directionOverride = null;

		this.wasWatering = false;
		this.controllerInterfaces.RIGHT.stopVibration();
	}

	onCorrectInteractionMode(delta, _time) {
		const controllerInterface = this.controllerInterfaces.RIGHT;
		this.colliderObject.visible = false;

		// make sure the origin of the water is the spout of the watering can.
		if (!this.wateringCanSpout) {
			const wateringCanObject = this.wateringCanEntity.getComponent(
				Object3DComponent,
			).value;
			this.wateringCanSpout = wateringCanObject.getObjectByName('water_origin');
			// should rotate this in blender by 90 degree instead of doing it in code
			if (this.wateringCanSpout) this.wateringCanSpout.rotateY(-Math.PI / 2);
			// only need to do it once after model is loaded
			updateMatrixRecursively(wateringCanObject);
		}

		if (this.wateringCanSpout) {
			this.wateringCanSpout.getWorldPosition(this.wateringSpoutPosition);
			this.wateringCanSpout.getWorldDirection(this.wateringSpoutDirection);
		} else {
			this.wateringSpoutPosition.copy(controllerInterface.getPosition());
		}

		this.targetRayComponent.setRayType(RayComponent.RAY_TYPES.WATERING_RAY);

		let triggerPressed = controllerInterface.triggerPressed(
			TRIGGERS.INDEX_TRIGGER,
		);

		this.targetRayComponent.visible = triggerPressed;

		if (triggerPressed) {
			let collisionWorld;
			this.queries.collisionWorld.results.forEach((entity) => {
				collisionWorld = entity.getComponent(CollisionWorldComponent).world;
			});

			let expectedSoundToPlay = 'WATERING_GROUND_LOOP';
			this._updateColliderSphere(
				this.targetRayComponent.raycaster,
				collisionWorld,
			);

			this._updateIntersectedPlantEntities(
				this.targetRayComponent.raycaster,
				collisionWorld,
			);

			if (this.intersectedPlantEntities.size) {
				if (!this.growingSoundEntity.hasComponent(LoopingAudioComponent)) {
					this.growingSoundEntity.addComponent(LoopingAudioComponent, {
						id: 'PLANT_GROWTH_LOOP',
						fadeInDuration: 300,
						fadeOutDuration: 300,
					});
				}
				if (!this.growingSoundEntity2.hasComponent(LoopingAudioComponent)) {
					this.growingSoundEntity2.addComponent(LoopingAudioComponent, {
						id: 'PLANT_GROWTH_LOOP_02',
						fadeInDuration: 300,
						fadeOutDuration: 300,
					});
				}

				getOnlyEntity(this.queries.gameManager).getMutableComponent(
					SceneLightingComponent,
				).needsFastUpdate = true;
			} else {
				if (this.growingSoundEntity.hasComponent(LoopingAudioComponent)) {
					this.growingSoundEntity.removeComponent(LoopingAudioComponent);
				}
				if (this.growingSoundEntity2.hasComponent(LoopingAudioComponent)) {
					this.growingSoundEntity2.removeComponent(LoopingAudioComponent);
				}
			}

			for (let intersectedPlantEntity of this.intersectedPlantEntities) {
				expectedSoundToPlay = 'WATERING_SEED_LOOP';
				this._growIntersectedPlantObject(intersectedPlantEntity, delta);
				this.gameStateComponent.updateGardenPending = true;
			}

			if (!this.waterSoundEntity.hasComponent(LoopingAudioComponent)) {
				this.waterSoundEntity.addComponent(LoopingAudioComponent, {
					id: expectedSoundToPlay,
					fadeInDuration: 500,
					fadeOutDuration: 500,
				});
			} else {
				const loop = this.waterSoundEntity.getMutableComponent(
					LoopingAudioComponent,
				);
				if (loop.id !== expectedSoundToPlay) {
					loop.id = expectedSoundToPlay;
				}
			}
		} else {
			if (this.waterSoundEntity.hasComponent(LoopingAudioComponent)) {
				this.waterSoundEntity.removeComponent(LoopingAudioComponent);
			}
			if (this.growingSoundEntity.hasComponent(LoopingAudioComponent)) {
				this.growingSoundEntity.removeComponent(LoopingAudioComponent);
			}
			if (this.growingSoundEntity2.hasComponent(LoopingAudioComponent)) {
				this.growingSoundEntity2.removeComponent(LoopingAudioComponent);
			}
		}

		if (triggerPressed && !this.wasWatering) {
			this.colliderObject.matrixAutoUpdate = true;
			controllerInterface.startVibration(0.1);
		} else if (!triggerPressed && this.wasWatering) {
			controllerInterface.stopVibration();
			this.colliderObject.matrixAutoUpdate = false;
		}

		this.wasWatering = triggerPressed;
	}

	/**
	 * Create collider and watering can, add them to scene
	 */
	_createGameObjects() {
		const wateringCanObject = new THREE.Object3D();

		// the transform of the watering can is calibrated with HandPoserSystem
		wateringCanObject.position.fromArray(
			PROP_TRANSFORM_OFFSET['WATERING_CAN'].position,
		);
		wateringCanObject.quaternion.fromArray(
			PROP_TRANSFORM_OFFSET['WATERING_CAN'].quaternion,
		);
		wateringCanObject.scale.fromArray(
			PROP_TRANSFORM_OFFSET['WATERING_CAN'].scale,
		);

		this.wateringCanEntity = this.world.createEntity();
		this.wateringCanEntity.addComponent(Object3DComponent, {
			value: wateringCanObject,
		});
		this.wateringCanEntity.addComponent(MeshIdComponent, {
			id: 'WATERING_CAN',
		});

		this.colliderObject = new THREE.Object3D();
		// debug visual representation of collider
		if (DEBUG) {
			const colliderSphereGeometry = new THREE.SphereGeometry(1, 32, 16);
			const colliderSphereMaterial = new THREE.MeshBasicMaterial({
				color: 0xffff00,
			});
			this.colliderSphere = new THREE.Mesh(
				colliderSphereGeometry,
				colliderSphereMaterial,
			);
			this.colliderObject.add(this.colliderSphere);
		}

		this.controllerInterfaces.RIGHT.controllerModel.parent.add(
			wateringCanObject,
		);

		this.threeGlobalComponent.scene.add(this.colliderObject);

		// we add the collider sphere to the audio object so that the sound emits from the point where the water lands
		this.waterSoundEntity.addComponent(Object3DComponent, {
			value: this.colliderObject,
		});
		this.growingSoundEntity.addComponent(Object3DComponent, {
			value: this.colliderObject,
		});
	}

	/**
	 * Update the collider sphere's position with raycaster
	 * @param {THREE.Raycaster|CurvedRaycaster} raycaster - raycaster that implements intersectObjects
	 */
	_updateColliderSphere(raycaster, collisionWorld) {
		const intersects = raycaster.intersectCollisionWorld(collisionWorld, {
			all: COLLISION_LAYERS.OBSTACLE,
		});

		if (intersects) {
			this.colliderObject.visible = true;
			this.colliderObject.position.copy(intersects.intersection.point);
			this.colliderSphere?.scale.setScalar(
				RAY_CONSTANTS.WATERING_RAY.RADII_FUNC(raycaster.renderedPortion),
			);
		} else {
			this.colliderObject.visible = false;
		}
	}

	/**
	 * Get the ECSY entities of the intersected plant
	 * @returns {Entity[]} - null or ECSY entity of the intersected plant
	 */
	_updateIntersectedPlantEntities(raycaster, collisionWorld) {
		this.intersectedPlantEntities.clear();

		const waterRadius = RAY_CONSTANTS.WATERING_RAY.RADII_FUNC(
			raycaster.renderedPortion,
		);
		const plantObjects = collisionWorld.sphereCast(
			this.colliderObject.position,
			waterRadius,
			{
				all: COLLISION_LAYERS.PLANT,
			},
		);

		if (plantObjects) {
			for (let obj of plantObjects) {
				let intersectedEntity = StaticColliderComponent.getEntityFromCollider(
					obj,
				);
				let plantEntity;
				if (intersectedEntity.hasComponent(PlantTinyColliderComponent)) {
					plantEntity = intersectedEntity.getComponent(
						PlantTinyColliderComponent,
					).plantEntity;
				} else {
					plantEntity = intersectedEntity;
				}
				this.intersectedPlantEntities.add(plantEntity);
			}
		}

		this.colliderSphere?.material.color.set(
			this.intersectedPlantEntities.size != 0 ? 0xe91e63 : 0x666666,
		);
	}

	/**
	 * Scale up the Object3D of the intersected plant
	 * @param {Entity} intersectedPlantEntity - ECSY entity of the intersected plant
	 * @param {Number} delta - time passed this frame in seconds
	 */
	_growIntersectedPlantObject(intersectedPlantEntity, delta) {
		if (intersectedPlantEntity.hasComponent(PlantGrowingComponent)) {
			return;
		}
		let plantedComponent = intersectedPlantEntity.getMutableComponent(
			PlantedComponent,
		);
		plantedComponent.scaleMultiplier += delta * plantedComponent.growSpeed;
		let newScale = new THREE.Vector3()
			.copy(plantedComponent.plantedScale)
			.multiplyScalar(plantedComponent.scaleMultiplier);

		let intersectedPlantObject = intersectedPlantEntity.getComponent(
			Object3DComponent,
		).value;
		intersectedPlantObject.scale.copy(newScale);

		// set the collider size too
		let staticCollider = intersectedPlantEntity.getMutableComponent(
			StaticColliderComponent,
		);
		staticCollider.mesh.scale.copy(newScale);

		updateMatrixRecursively(intersectedPlantObject);
		updateMatrixRecursively(staticCollider.mesh);

		if (intersectedPlantEntity.hasComponent(InstancedMeshInstanceComponent)) {
			intersectedPlantEntity.getMutableComponent(
				InstancedMeshInstanceComponent,
			).needsUpdate = true;
		}
	}
}

WateringSystem.addQueries({
	collisionWorld: { components: [CollisionWorldComponent] },
	planted: { components: [PlantedComponent, Object3DComponent] },
	gameManager: { components: [GameStateComponent] },
});
