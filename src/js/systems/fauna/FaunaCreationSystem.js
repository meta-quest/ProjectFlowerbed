/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import {
	EnvironmentProp,
	MainEnvironment,
} from '../../components/GameObjectTagComponents';
import {
	MAX_SECONDS_BETWEEN_IDLE_ANIMATION,
	MIN_SECONDS_BETWEEN_IDLE_ANIMATION,
} from './StationaryFaunaSystem';
import {
	MorphTargetAnimationComponent,
	MorphTargetMeshInitialized,
} from '../../components/MorphTargetAnimationComponent';
import { Not, System } from 'ecsy';

import { DEBUG_CONSTANTS } from '../../Constants';
import { FaunaClusterComponent } from '../../components/FaunaClusterComponent';
import { FaunaColliderComponent } from '../../components/FaunaColliderComponent';
import { GameStateComponent } from '../../components/GameStateComponent';
import { MeshIdComponent } from '../../components/AssetReplacementComponents';
import { MovableFaunaComponent } from '../../components/MovableFaunaComponent';
import { Object3DComponent } from '../../components/Object3DComponent';
import { OptimizedModelComponent } from '../../components/OptimizedModelComponent';
import { PlantedComponent } from '../../components/PlantingComponents';
import { PlaylistAudioComponent } from '../../components/AudioComponents';
import { SkeletonAnimationComponent } from '../../components/SkeletonAnimationComponent';
import { StationaryFaunaComponent } from '../../components/StationaryFaunaComponent';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { createReplaceableMesh } from '../../components/AssetReplacementComponents';
import { rotateVertical } from '../../utils/vectorUtils';

const NUM_RABBITS = 1;
const NUM_SQUIRRELS = 1;
const NUM_STANDING_SEAGULLS = 0;

const INNER_BOX_LINE_COLOR = 'green';

const BUTTERFLY_SPAWN_AFTER_COUNT = 4;

const LOOK_AWAY_ANGLE_RADIAN = (90 * Math.PI) / 180;
const Y_DIRECTION = new THREE.Vector3(0, -1, 0);

const tempVector = new THREE.Vector3();

export class FaunaCreationSystem extends System {
	init() {
		this.persistentFaunasCreated = false;
		this.planters = [];
		this.scene = null;
		this.webxrManager = null;

		this.raycaster = new THREE.Raycaster();
		this.raycaster.far = 1;

		this.allSkeletonAnimationModelsLoaded = false;
		this.allPlantersLoaded = false;
	}

	execute(_delta, _time) {
		if (!this.webxrManager) {
			this.queries.gameManager.results.forEach((entity) => {
				const threeglobal = entity.getComponent(THREEGlobalComponent);
				this.webxrManager = threeglobal.renderer.xr;
			});
		}

		if (!this.persistentFaunasCreated) {
			this.queries.gameManager.results.forEach((entity) => {
				const gameState = entity.getComponent(GameStateComponent);
				if (gameState.allAssetsLoaded) {
					this.queries.mainEnvironment.results.forEach((envEntity) => {
						let environmentObj;
						if (envEntity.hasComponent(OptimizedModelComponent)) {
							environmentObj = envEntity.getComponent(OptimizedModelComponent)
								.model;
						} else {
							environmentObj = envEntity.getComponent(Object3DComponent).value;
						}
						const threeglobal = entity.getComponent(THREEGlobalComponent);
						this.scene = threeglobal.scene;
						if (DEBUG_CONSTANTS.DISABLE_LAND_FAUNA !== true) {
							this._createStationaryFaunas(threeglobal.scene, environmentObj);
						}

						this.persistentFaunasCreated = true;
					});
				}
			});
		}

		this._initializeSkeletonAnimationAfterModelLoaded();
		this._initializePlantersAfterModelLoaded();

		this._initializeMorphTargets();

		if (
			!this.scene ||
			!this.webxrManager ||
			!this.webxrManager.getCamera() ||
			!this.webxrManager.isPresenting
		) {
			return;
		}

		// Each time a new plant has been added, check whether that plant is in
		// one of the planters. Then based on how many plants are in the
		// planter, decide to spawn new butterflies.
		this.queries.planted.added.forEach((entity) => {
			const obj = entity.getComponent(Object3DComponent).value;
			for (const planter of this.planters) {
				const position = obj.position.clone();
				position.y += 0.5;
				this.raycaster.set(position, Y_DIRECTION);
				const intersects = this.raycaster.intersectObject(planter.planterObj);
				if (intersects.length) {
					planter.plants.push(obj);
					if (planter.plants.length === BUTTERFLY_SPAWN_AFTER_COUNT) {
						planter.pendingCluster = true;
					} else if (
						planter.plants.length % BUTTERFLY_SPAWN_AFTER_COUNT ===
						0
					) {
						planter.pendingButterfly = true;
					}
					break;
				}
			}
		});

		// Check if any of the planters need butterflies to be spawned. If any
		// of the planters does, then check to make sure the player isn't
		// facing the planter. Once the player isn't facing the planter, then
		// perform spawning action.
		const playerDirection = this.webxrManager
			.getCamera()
			.getWorldDirection(tempVector);
		const playerPosition = this.webxrManager.getCamera().position;
		for (const planter of this.planters) {
			if (planter.pendingCluster || planter.pendingButterfly) {
				const planterDirection = planter.planterObj.position
					.clone()
					.sub(playerPosition)
					.normalize();
				const angleRadian = planterDirection.angleTo(playerDirection);
				if (Math.abs(angleRadian) > LOOK_AWAY_ANGLE_RADIAN) {
					if (planter.pendingCluster) {
						const butterflyBox = this._getButterflyBox(planter);
						planter.cluster = this._createButterflies(this.scene, butterflyBox);
						planter.pendingCluster = false;
					} else if (planter.pendingButterfly) {
						const clusterComponent = planter.cluster.getMutableComponent(
							FaunaClusterComponent,
						);
						const butterflyBox = this._getButterflyBox(planter);

						clusterComponent.boundingBoxCenter = butterflyBox.center;
						clusterComponent.boundingBoxOuterDimensions =
							butterflyBox.outerDimensions;
						clusterComponent.boundingBoxInnerDimensions =
							butterflyBox.innerDimensions;
						clusterComponent.boundingBoxInnerMin = butterflyBox.innerMin;
						clusterComponent.boundingBoxInnerMax = butterflyBox.innerMax;
						clusterComponent.faunas.push(
							...this._randomButterflyEntities(this.scene, clusterComponent),
						);
						planter.pendingButterfly = false;

						this._addDebugBoundingBox(
							this.scene,
							butterflyBox.center,
							butterflyBox.outerDimensions,
							butterflyBox.innerDimensions,
						);
					}
				}
			}
		}
	}

	_initializeMorphTargets() {
		this.queries.morphTargetEntities.results.forEach((entity) => {
			const obj = entity.getComponent(Object3DComponent).value;
			if (!obj.children.length) {
				return;
			}

			const component = entity.getMutableComponent(
				MorphTargetAnimationComponent,
			);
			component.morphTargetMesh = obj.children[0];

			// Choose a random starting morph target so that faunas aren't all animating the same
			component.morphTargetSequenceIndex = Math.floor(
				Math.random() * component.morphTargetSequence.length,
			);

			// Further randomize a time offset within animating a morph target to allow faunas to differ
			const duration =
				component.morphTargetSequence[component.morphTargetSequenceIndex]
					.duration;
			component.morphTargetAnimationOffset = Math.random() * duration;

			entity.addComponent(MorphTargetMeshInitialized);
		});
	}

	_initializeSkeletonAnimationAfterModelLoaded() {
		if (this.allSkeletonAnimationModelsLoaded) {
			return;
		}

		this.allSkeletonAnimationModelsLoaded =
			this.queries.skeletonAnimationEntities.results.length > 0;
		this.queries.skeletonAnimationEntities.results.forEach((entity) => {
			if (!entity.getComponent(MeshIdComponent).modelHasChanged) {
				this.allSkeletonAnimationModelsLoaded = false;
				return;
			}
		});

		if (!this.allSkeletonAnimationModelsLoaded) {
			return;
		}

		this.queries.skeletonAnimationEntities.results.forEach((entity) => {
			const component = entity.getMutableComponent(SkeletonAnimationComponent);
			const obj = entity.getComponent(Object3DComponent).value;
			component.animationMixer = new THREE.AnimationMixer(obj);
			component.animationActions = [];
			component.idleAnimationSwitchTimer =
				Math.random() *
					(MAX_SECONDS_BETWEEN_IDLE_ANIMATION -
						MIN_SECONDS_BETWEEN_IDLE_ANIMATION) +
				MIN_SECONDS_BETWEEN_IDLE_ANIMATION;

			for (let i = 0; i < component.idleAnimations.length; i++) {
				const name = component.idleAnimations[i].name;
				const action = component.animationMixer.clipAction(name);
				if (action) {
					action.loop = component.idleAnimations[i].loop;
					action.play();
					if (component.currentAnimationActionIndex < 0) {
						component.currentAnimationActionIndex = i;
					} else {
						action.enabled = false;
					}
					component.animationActions.push(action);
				}
			}
			if (component.engagedAnimations) {
				for (const animation of component.engagedAnimations) {
					const action = component.animationMixer.clipAction(animation.name);
					if (action) {
						action.loop = animation.loop;
						action.play();
						action.enabled = false;
						component.animationActions.push(action);
					}
				}
			}
		});
	}

	_initializePlantersAfterModelLoaded() {
		if (this.allPlantersLoaded) {
			return;
		}

		const planterEntities = [];
		for (const propEntity of this.queries.props.results) {
			if (
				propEntity
					.getComponent(MeshIdComponent)
					.id.startsWith('Prop_Planter_Long')
			) {
				planterEntities.push(propEntity);
			}
		}

		this.allPlantersLoaded = planterEntities.length > 0;
		for (const entity of planterEntities) {
			if (!entity.getComponent(MeshIdComponent).modelHasChanged) {
				this.allPlantersLoaded = false;
				return;
			}
		}

		for (const entity of planterEntities) {
			const planter = entity.getComponent(Object3DComponent).value;
			this.planters.push({
				plants: [],
				planterObj: planter,
				cluster: null,
				pendingCluster: false,
				pendingButterfly: false,
			});
		}
	}

	_getChildrenByPrefix(environmentObj, prefix) {
		const children = [];
		for (const child of environmentObj.children) {
			if (child.name && child.name.startsWith(prefix)) {
				children.push(child);
			}
		}
		return children;
	}

	_getSpawnLocations(environmentObj, prefix) {
		const locations = [];
		for (const child of environmentObj.children) {
			if (child.name && child.name.startsWith(prefix)) {
				locations.push(child.position);
			}
		}
		return locations;
	}

	_createStationaryFaunas(scene, environmentObj) {
		this._createRabbits(scene, environmentObj);
		this._createSquirrels(scene, environmentObj);
		this._createStandingSeagulls(scene, environmentObj);
	}

	_createRabbits(scene, environmentObj) {
		const locations = this._getSpawnLocations(environmentObj, 'Rabbit_Spawn');
		let entities;
		if (DEBUG_CONSTANTS.DEBUG_FAUNA_RESPAWN) {
			entities = this._createStationaryFaunasWithLocations(
				scene,
				'FAUNA_RABBIT',
				1 /* count */,
				locations.slice(0, 2),
			);
		} else {
			entities = this._createStationaryFaunasWithLocations(
				scene,
				'FAUNA_RABBIT',
				NUM_RABBITS,
				locations,
			);
		}
		for (const entity of entities) {
			entity.addComponent(SkeletonAnimationComponent, {
				idleAnimations: [
					{
						name: 'Idle_01',
						loop: THREE.LoopRepeat,
					},
					{
						name: 'Idle_Var_01',
						loop: THREE.LoopOnce,
					},
					{
						name: 'Idle_Var_02',
						loop: THREE.LoopRepeat,
					},
					{
						name: 'Idle_Var_03',
						loop: THREE.LoopOnce,
					},
					{
						name: 'Idle_Var_04',
						loop: THREE.LoopOnce,
					},
				],
				engagedAnimations: [
					{
						name: 'Engaged_01',
						loop: THREE.LoopRepeat,
					},
				],
			});

			// rabbits are supposed to make squirrel sounds, apparently
			entity.addComponent(PlaylistAudioComponent, {
				ids: [
					'SQUIRRELS_LOOP_01',
					'SQUIRRELS_LOOP_02',
					'SQUIRRELS_LOOP_03',
					'SQUIRRELS_LOOP_04',
					'SQUIRRELS_LOOP_05',
				],
				minDelay: 2000,
				maxDelay: 8000,
			});
		}
	}

	_createSquirrels(scene, environmentObj) {
		const locations = this._getSpawnLocations(environmentObj, 'Squirrel_Spawn');
		const entities = this._createStationaryFaunasWithLocations(
			scene,
			'FAUNA_SQUIRREL',
			NUM_SQUIRRELS,
			locations,
		);
		for (const entity of entities) {
			entity.addComponent(SkeletonAnimationComponent, {
				idleAnimations: [
					{
						name: 'Idle',
						loop: THREE.LoopRepeat,
					},
					{
						name: 'Idle_Var_01',
						loop: THREE.LoopOnce,
					},
					{
						name: 'Idle_Var_02',
						loop: THREE.LoopOnce,
					},
					{
						name: 'Idle_Var_03',
						loop: THREE.LoopOnce,
					},
				],
				engagedAnimations: [
					{
						name: 'Engage_01',
						loop: THREE.LoopRepeat,
					},
				],
			});

			// make squirrel noises
			entity.addComponent(PlaylistAudioComponent, {
				ids: [
					'SQUIRRELS_LOOP_01',
					'SQUIRRELS_LOOP_02',
					'SQUIRRELS_LOOP_03',
					'SQUIRRELS_LOOP_04',
					'SQUIRRELS_LOOP_05',
				],
				minDelay: 2000,
				maxDelay: 8000,
			});
		}
	}

	_createStandingSeagulls(scene, environmentObj) {
		const locations = this._getSpawnLocations(environmentObj, 'Seagull_Spawn');
		const entities = this._createStationaryFaunasWithLocations(
			scene,
			'FAUNA_SEAGULL_STANDING',
			NUM_STANDING_SEAGULLS,
			locations,
		);
		for (const entity of entities) {
			entity.addComponent(MorphTargetAnimationComponent, {
				morphTargetSequence: [
					{
						name: 'Look_Left',
						duration: 1,
					},
					{
						name: 'Look_Right',
						duration: 1,
					},
					{
						name: 'Relaxed',
						duration: 1,
					},
				],
			});
			entity.addComponent(PlaylistAudioComponent, {
				ids: [
					'SEAGULLS_LOOP_01',
					'SEAGULLS_LOOP_02',
					'SEAGULLS_LOOP_03',
					'SEAGULLS_LOOP_04',
					'SEAGULLS_LOOP_05',
				],
				maxDelay: 3000,
			});
		}
	}

	_createStationaryFaunasWithLocations(scene, models, count, locations) {
		if (!locations || !locations.length) {
			console.warn(
				'No fauna locations found. Were they exported properly from the environment?',
			);
			return [];
		}
		if (!Array.isArray(models)) {
			models = [models];
		}

		const entities = [];

		const usedIndices = {};
		for (let i = 0; i < count; i++) {
			const model = models[Math.floor(Math.random() * models.length)];
			const entity = this._createEntity(scene, model);
			const obj = entity.getComponent(Object3DComponent).value;

			entities.push(entity);

			entity.addComponent(StationaryFaunaComponent, {
				spawnLocations: locations,
			});

			let randomIndex = Math.floor(Math.random() * locations.length);
			while (usedIndices[randomIndex]) {
				randomIndex = Math.floor(Math.random() * locations.length);
			}

			obj.position.copy(locations[randomIndex]);
			usedIndices[randomIndex] = true;

			const randomDirection = new THREE.Vector3();
			randomDirection.random();
			randomDirection.y = 0;
			obj.lookAt(randomDirection);

			// add a collider
			const cylinder = new THREE.Mesh(
				new THREE.CylinderGeometry(0.3, 0.3, 1.1, 8),
				new THREE.MeshBasicMaterial({
					color: 0xffff00,
					transparent: true,
					opacity: 0.5,
				}),
			);
			cylinder.visible = DEBUG_CONSTANTS.SHOW_FAUNA_COLLIDERS;
			cylinder.position.copy(obj.position);
			cylinder.quaternion.copy(obj.quaternion);
			scene.add(cylinder);
			cylinder.updateMatrix();

			entity.addComponent(FaunaColliderComponent, {
				value: cylinder,
			});
		}

		if (DEBUG_CONSTANTS.DEBUG_FAUNA_RESPAWN) {
			for (let i = 0; i < locations.length; i++) {
				if (usedIndices[i]) {
					continue;
				}

				const location = locations[i];
				const cylinder = new THREE.Mesh(
					new THREE.CylinderGeometry(0.3, 0.3, 1.1, 8),
					new THREE.MeshBasicMaterial({
						color: 0x00ff00,
						transparent: true,
						opacity: 0.5,
					}),
				);
				cylinder.position.copy(location);
				scene.add(cylinder);
			}
		}

		return entities;
	}

	/**
	 * Get a bounding box that encapsulates all provided plants in a planter
	 */
	_getButterflyBox(planter) {
		const box = new THREE.Box3();
		for (const plant of planter.plants) {
			box.expandByPoint(plant.position);
		}
		box.min.y += 0.5;
		box.max.y += 1.5;

		const center = new THREE.Vector3();
		box.getCenter(center);

		const outerDimensions = new THREE.Vector3();
		box.getSize(outerDimensions);

		// Downside of using THREE.Box3 as boundary is that for planter boxes
		// that are orientated a certain way, the box required to contain all
		// plants is pretty big due to the orientation of the planter. Reduce
		// the size in those cases.
		if (outerDimensions.x > 5 && outerDimensions.z > 5) {
			center.x = planter.planterObj.position.x;
			center.z = planter.planterObj.position.z;
			outerDimensions.x /= 2;
			outerDimensions.z /= 2;
		}

		outerDimensions.x = Math.max(1.5, outerDimensions.x);
		outerDimensions.z = Math.max(1.5, outerDimensions.z);

		const innerDimensions = outerDimensions.clone().multiplyScalar(0.8);

		return {
			center: center,
			outerDimensions: outerDimensions,
			innerDimensions: innerDimensions,
			innerMin: center.clone().sub(innerDimensions.clone().multiplyScalar(0.5)),
			innerMax: center.clone().add(innerDimensions.clone().multiplyScalar(0.5)),
		};
	}

	_createButterflies(scene, butterflyBox) {
		const cluster = this.world.createEntity();
		cluster.addComponent(FaunaClusterComponent, {
			boundingBoxCenter: butterflyBox.center,
			boundingBoxOuterDimensions: butterflyBox.outerDimensions,
			boundingBoxInnerDimensions: butterflyBox.innerDimensions,
			boundingBoxInnerMin: butterflyBox.innerMin,
			boundingBoxInnerMax: butterflyBox.innerMax,
			minSpeed: 0.005,
			maxSpeed: 0.01,
			minYRadian: (-20 * Math.PI) / 180,
			maxYRadian: (20 * Math.PI) / 180,
			avoidanceDistance: 0.1,
			avoidanceFactor: 0.5,
			turnDegreesRadian: (5 * Math.PI) / 180,
			verticalPathVariationFrequency: 0.5,
			verticalPathVariationFactor: Math.PI / 180,
			horizontalPathVariationFrequency: 0.5,
			horizontalPathVariationFactor: Math.PI / 180,
			negateDirection: true,
		});
		const clusterComponent = cluster.getMutableComponent(FaunaClusterComponent);
		clusterComponent.faunas = this._randomButterflyEntities(
			scene,
			clusterComponent,
		);
		this._addDebugBoundingBox(
			scene,
			butterflyBox.center,
			butterflyBox.outerDimensions,
			butterflyBox.innerDimensions,
		);
		return cluster;
	}

	/**
	 * Create a butterfly entity and randomize between either blue or orange butterfly
	 */
	_randomButterflyEntities(scene, clusterComponent) {
		let butterflyEntities;
		if (Math.random() >= 0.5) {
			butterflyEntities = this._createEntities(
				scene,
				'FAUNA_BLUE_BUTTERFLY',
				1,
				clusterComponent,
			);
		} else {
			butterflyEntities = this._createEntities(
				scene,
				'FAUNA_ORANGE_BUTTERFLY',
				1,
				clusterComponent,
			);
		}

		for (const entity of butterflyEntities) {
			const component = entity.getMutableComponent(
				MorphTargetAnimationComponent,
			);
			component.morphTargetSequence = [
				{
					name: 'Flap_Up',
					duration: 0.1,
				},
				{
					name: 'Flap_Down',
					duration: 0.1,
				},
			];
		}
		return butterflyEntities;
	}

	_positionMovableFauna(faunaEntity, clusterComponent) {
		const obj = faunaEntity.getComponent(Object3DComponent).value;

		// Randomize position within the bounding box
		const x =
			Math.random() * clusterComponent.boundingBoxInnerDimensions.x +
			clusterComponent.boundingBoxInnerMin.x;
		const y =
			Math.random() * clusterComponent.boundingBoxInnerDimensions.y +
			clusterComponent.boundingBoxInnerMin.y +
			(clusterComponent.positionOffset ? clusterComponent.positionOffset.y : 0);
		const z =
			Math.random() * clusterComponent.boundingBoxInnerDimensions.z +
			clusterComponent.boundingBoxInnerMin.z;
		obj.position.set(x, y, z);

		// Randomize an initial direction
		const faunaComponent = faunaEntity.getMutableComponent(
			MovableFaunaComponent,
		);
		const initialDirection = new THREE.Vector3().random();
		initialDirection.y = 0;
		initialDirection.normalize();

		if (
			!clusterComponent.boundingMesh &&
			clusterComponent.boundingBoxOuterDimensions.y !== 0
		) {
			const randomAngleRadian =
				Math.random() *
					(clusterComponent.maxYRadian - clusterComponent.minYRadian) +
				clusterComponent.minYRadian;

			rotateVertical(initialDirection, randomAngleRadian);
		}

		faunaComponent.direction = initialDirection;

		// Randomize an initial speed
		faunaComponent.speed =
			Math.random() * (clusterComponent.maxSpeed - clusterComponent.minSpeed) +
			clusterComponent.minSpeed;

		const direction = initialDirection.clone();
		if (clusterComponent.negateDirection) {
			direction.negate();
		}
		direction.add(obj.position);
		obj.lookAt(direction);

		// Randomize variation offsets
		if (clusterComponent.verticalPathVariationFactor !== 0) {
			faunaComponent.verticalVariationOffset =
				Math.random() / clusterComponent.verticalPathVariationFrequency;
		}
		if (clusterComponent.horizontalPathVariationFactor !== 0) {
			faunaComponent.horizontalVariationOffset =
				Math.random() / clusterComponent.horizontalPathVariationFrequency;
		}
	}

	_createEntities(scene, meshId, count, clusterComponent) {
		const entities = [];

		if (DEBUG_CONSTANTS.DISABLE_AIR_FAUNA !== true) {
			for (let i = 0; i < count; i++) {
				const entity = this._createEntity(scene, meshId);
				entity.addComponent(MovableFaunaComponent);
				entity.addComponent(MorphTargetAnimationComponent);

				this._positionMovableFauna(entity, clusterComponent);

				entities.push(entity);
			}
		}

		return entities;
	}

	_createEntity(scene, meshId) {
		const entity = this.world.createEntity();
		const placeholder = createReplaceableMesh(entity, meshId);
		scene.add(placeholder);
		return entity;
	}

	_getBoundingBox(center, dimensions, color) {
		const width = dimensions.x / 2;
		const height = dimensions.y / 2;
		const depth = dimensions.z / 2;
		color = color || 'red';

		const geometry = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(width, height, depth),
			new THREE.Vector3(width, height, -depth),
			new THREE.Vector3(width, -height, -depth),
			new THREE.Vector3(width, -height, depth),
			new THREE.Vector3(-width, height, depth),
			new THREE.Vector3(-width, height, -depth),
			new THREE.Vector3(-width, -height, -depth),
			new THREE.Vector3(-width, -height, depth),
		]);
		geometry.setIndex([
			0,
			1,
			1,
			2,
			2,
			3,
			3,
			0,
			4,
			5,
			5,
			6,
			6,
			7,
			7,
			4,
			0,
			4,
			1,
			5,
			2,
			6,
			3,
			7,
		]);
		const material = new THREE.LineBasicMaterial({ color });
		const lineSegments = new THREE.LineSegments(geometry, material);
		lineSegments.position.copy(center);
		return lineSegments;
	}

	_addDebugBoundingBox(scene, center, outerDimensions, innerDimensions) {
		if (DEBUG_CONSTANTS.SHOW_FAUNA_BOUNDARIES) {
			const outerBox = this._getBoundingBox(center, outerDimensions);
			scene.add(outerBox);
			outerBox.updateMatrix();

			const innerBox = this._getBoundingBox(
				center,
				innerDimensions,
				INNER_BOX_LINE_COLOR,
			);
			scene.add(innerBox);
			innerBox.updateMatrix();
		}
	}
}

FaunaCreationSystem.queries = {
	gameManager: { components: [THREEGlobalComponent] },
	mainEnvironment: { components: [MainEnvironment] },
	props: { components: [EnvironmentProp] },
	planted: {
		components: [PlantedComponent, Object3DComponent],
		listen: { added: true },
	},
	morphTargetEntities: {
		components: [
			MorphTargetAnimationComponent,
			Not(MorphTargetMeshInitialized),
		],
	},
	skeletonAnimationEntities: { components: [SkeletonAnimationComponent] },
};
