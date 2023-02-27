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
import { deleteEntity, getOnlyEntity } from '../../utils/entityUtils';

import { AssetDatabaseComponent } from '../../components/AssetDatabaseComponent';
import { FaunaMaterial } from 'src/js/lib/shaders/WoodlandFaunaShader';
import { FullRoughMaterial } from '../../lib/shaders/WoodlandFullRoughShader';
import { GameStateComponent } from '../../components/GameStateComponent';
import { GroundMaterial } from '../../lib/shaders/WoodlandGroundShader.js';
import { InstancedMeshInstanceComponent } from '../../components/InstancedMeshComponent';
import { LOCOMOTION_CONSTANTS } from '../../Constants';
import { MatteMaterial } from '../../lib/shaders/WoodlandMatteShader';
import { MeshIdComponent } from '../../components/AssetReplacementComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { OptimizedModelComponent } from '../../components/OptimizedModelComponent';
import { PlantMaterial } from '../../lib/shaders/WoodlandPlantShader.js';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { SceneLightingComponent } from '../../components/SceneLightingComponent';
import { ScreenshotCameraComponent } from '../../components/ScreenshotCameraComponent';
import { SkyMaterial } from '../../lib/shaders/WoodlandSkyShader.js';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { UIPanelMaterial } from '../../lib/shaders/WoodlandUIPanelShader';
import { UnderwaterDirtMaterial } from '../../lib/shaders/WoodlandUnderwaterDirtShader.js';
import { WaterMaterial } from '../../lib/shaders/WoodlandWaterShader.js';
import { copyTransforms } from '../../utils/transformUtils';
import { updateMatrixRecursively } from '../../utils/object3dUtils';

const USE_CHEAP_MATERIAL = false;
const IGNORE_MATERIAL_TEXTURES = false;
const IGNORE_METAL_ROUGHNESS = true;
const IGNORE_NORMALS = false;
const IGNORE_ENVMAPS = true;
const OPTIMIZE_MODEL = true;
const cubeLoader = new THREE.CubeTextureLoader();

export class SceneCreationSystem extends System {
	init() {
		this.renderer = undefined;
		this.viewerTransform = undefined;
		this.hasCreatedControllers = false;
		this.clock = new THREE.Clock();
		this.materialOverrides = {};

		this.queries.gameManager.results.forEach((entity) => {
			this.renderer = entity.getComponent(THREEGlobalComponent).renderer;
		});

		const _this = this;
		this.envMap = cubeLoader
			.setPath('assets/images/cloud_env_cube/')
			.load(
				['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png'],
				function (texture) {
					// force generate the PMREM envmap texture!
					_this.renderer.cubeuvmaps.get(texture);
					_this.queries.screenShotCameras.results.forEach((ent) => {
						ent
							.getComponent(ScreenshotCameraComponent)
							.photoRenderer.cubeuvmaps.get(texture);
					});
				},
			);

		this.queries.gameManager.results.forEach((entity) => {
			this.renderer = entity.getComponent(THREEGlobalComponent).renderer;

			let scene = entity.getComponent(THREEGlobalComponent).scene;
			scene.fog = new THREE.FogExp2(0xead1d2, 0.0042);

			entity.addComponent(SceneLightingComponent, {
				camera: this.renderer.xr.getCamera(),
				renderer: this.renderer,
				scene: scene,
			});

			let lightingComponent = entity.getComponent(SceneLightingComponent);

			this.setupMaterialOverrides(lightingComponent);
		});
	}

	execute(_delta, time) {
		this.queries.gameManager.changed.forEach(() => {
			this.checkEnvironmentChange();
		});

		this.queries.player.results.forEach((entity) => {
			this.viewerTransform = entity.getComponent(
				PlayerStateComponent,
			).viewerTransform;
			if (!this.renderer) {
				console.warn('Player was created before THREE.JS state');
			}
		});

		this.queries.gameManager.results.forEach((entity) => {
			if (entity.hasComponent(SceneLightingComponent)) {
				entity.getMutableComponent(SceneLightingComponent).update(time);
			}
		});

		if (this.waterMaterial) {
			const config = this.waterMaterial.wave_config;
			const flowSpeed = 0.015;
			config.x += flowSpeed * _delta; // flowMapOffset0
		}
		if (this.fountainWaterMaterial) {
			const config = this.fountainWaterMaterial.wave_config;
			const flowSpeed = 0.02;
			config.x += flowSpeed * _delta; // flowMapOffset0
		}
	}

	setupMaterialOverrides(lightingComponent) {
		let scs = this;
		let skyCloudNode = null;
		let skyBaseNode = null;
		let simpleMaterialOverride = (node) => {
			if (node.material) {
				let newMaterial = this.materialOverrides[node.material.uuid];
				if (!newMaterial) {
					if (
						IGNORE_METAL_ROUGHNESS &&
						!node.material.name.match(/bench/i) &&
						!node.material.name.match(/camera/i) &&
						!node.material.name.match(/watering/i)
					) {
						node.material.occlusionMetalRoughnessMap = null;
						node.material.aoMap = null;
						node.material.roughnessMap = null;
						node.material.metalnessMap = null;
						node.material.metalness = 0.0;
						node.material.roughness = 1.0;
					}

					if (IGNORE_NORMALS) {
						node.material.normalMap = null;
					}

					if (node.material.map) {
						node.material.map.anisotropy = 4;
					}

					if (node.material.name.match(/SkinnedPlant/i)) {
						PlantMaterial.setupNode(node);
						newMaterial = node.material;
						if (lightingComponent.csm) {
							lightingComponent.csm.setupMaterial(newMaterial);
						}

						// Set env map on plants to provide omni-directional lighting.
						if (IGNORE_ENVMAPS !== true) {
							newMaterial.envMap = scs.envMap;
							newMaterial.envMapIntensity = 0.5;
						}
						node.renderOrder = 900;
					} else if (node.material.name.match(/road/i)) {
						node.castShadow = false;
						newMaterial = node.material;
						newMaterial.alphaTest = 0.0;
						newMaterial.transparent = false;
						FullRoughMaterial.setupMaterial(newMaterial);

						if (lightingComponent.csm) {
							lightingComponent.csm.setupMaterial(newMaterial);
						}
					} else if (
						node.material.name.match(/fish/i) ||
						node.material.name.match(/duck/i) ||
						node.material.name.match(/seagull/i)
					) {
						node.castShadow = false;
						FaunaMaterial.setupNode(node);
						newMaterial = node.material;

						if (lightingComponent.csm) {
							lightingComponent.csm.setupMaterial(newMaterial);
						}
					} else if (node.material.name.match(/(\b|_)water(\b|_)/i)) {
						node.renderOrder = 900;
						newMaterial = new THREE.MeshPhongMaterial({
							color: node.material.color,
							map: node.material.map,
						});

						WaterMaterial.setupMaterial(newMaterial);
						newMaterial.envMap = scs.envMap;

						if (lightingComponent.csm) {
							lightingComponent.csm.setupMaterial(newMaterial);
						}

						if (node.material.name.match(/M_Prop_Fountain_Water/i)) {
							scs.waterMaterial = newMaterial;
						} else {
							newMaterial.customProgramCacheKey = function () {
								return 'fountain_water';
							};
							newMaterial.reflectivity = 0.6;
							scs.fountainWaterMaterial = newMaterial;
						}
					} else if (node.material.name.match(/material_has_been_cut/i)) {
						newMaterial = node.material.clone();
						GroundMaterial.setupMaterial(newMaterial);

						if (lightingComponent.csm) {
							lightingComponent.csm.setupMaterial(newMaterial);
						}
					} else if (
						node.material.name.match(/UIPanel/i) ||
						node.material.name.match(/Tooltip/i)
					) {
						newMaterial = node.material.clone();
						UIPanelMaterial.setupMaterial(newMaterial);
						newMaterial.emissive.setHex(0xffffff);
						newMaterial.emissiveIntensity = 0.3;
					} else if (node.material.name.match(/sky/i)) {
						// use a custom shader that takes in both sky textures
						// so we don't have to render two meshes
						newMaterial = new THREE.MeshBasicMaterial({
							map: node.material.map,
							fog: false,
							transparent: false,
						});

						if (node.material.name.match(/base/i)) {
							skyBaseNode = node;
						} else if (node.material.name.match(/cloud/i)) {
							skyCloudNode = node;
						}
					} else if (
						node.material.name.match(/underwater/i) ||
						node.material.name.match(/sand/i)
					) {
						newMaterial = new THREE.MeshPhongMaterial({
							color: node.material.color,
							map: node.material.map,
							reflectivity: Math.max(1.0 - node.material.roughness, 0.0),
							shininess: Math.max(1.0 - node.material.roughness, 0.0) * 64.0,
						});
						UnderwaterDirtMaterial.setupMaterial(newMaterial);

						if (lightingComponent.csm) {
							lightingComponent.csm.setupMaterial(newMaterial);
						}
					} else if (node.material.name.match(/matte_mountain/i)) {
						node.renderOrder = -900;
						newMaterial = node.material.clone();
						MatteMaterial.setupMaterial(newMaterial);
						newMaterial.fog_config.x = 20.0; // start of fade
						newMaterial.fog_config.y = 0.0125; // fade factor - 1/fog_config.y is where this hits zero
					} else if (node.material.name.match(/herotree/i)) {
						newMaterial = node.material.clone();
						if (IGNORE_ENVMAPS !== true) {
							newMaterial.envMap = scs.envMap;
							newMaterial.envMapIntensity = 0.75;
						}
						if (lightingComponent.csm) {
							lightingComponent.csm.setupMaterial(newMaterial);
						}
					} else {
						if (USE_CHEAP_MATERIAL) {
							newMaterial = new THREE.MeshPhongMaterial({
								color: node.material.color,
								reflectivity: Math.max(1.0 - node.material.roughness, 0.0),
								shininess: Math.max(1.0 - node.material.roughness, 0.0) * 64.0,
							});
						} else if (IGNORE_MATERIAL_TEXTURES) {
							newMaterial = new THREE.MeshStandardMaterial({
								color: node.material.color,
								roughness: node.material.roughness,
								metalness: node.material.metalness,
							});
						} else {
							newMaterial = node.material.clone();
						}

						// Assign environment map to specific materials here.
						if (
							node.material.name.match(/watering/i) ||
							node.material.name.match(/camera/i)
						) {
							newMaterial.metalness = 1.0;
							newMaterial.roughness = 0.4;
							node.renderOrder = -10;
							newMaterial.envMap = scs.envMap;
						} else if (!node.material.name.match(/bench/i)) {
							FullRoughMaterial.setupMaterial(newMaterial);
						}

						if (node.material.name.match(/Prop_SeedPacket_Decal/i)) {
							newMaterial.side = THREE.FrontSide;
						}

						if (lightingComponent.csm) {
							lightingComponent.csm.setupMaterial(newMaterial);
						}
					}

					newMaterial.name = 'OVERRIDDEN_' + node.material.name;

					// set the shadowside to the same as the material side
					newMaterial.shadowSide = node.material.side;

					if (newMaterial.alphaTest > 0.0) {
						newMaterial.alphaToCoverage = true;
						newMaterial.transparent = true;
						newMaterial.alphaTest = 0.0;
					}
					this.materialOverrides[node.material.uuid] = newMaterial;
				}

				node.material = newMaterial;

				if (node.name.match(/terrain_underwater/i)) {
					node.renderOrder = 800;
				}

				// if we have both a sky base and cloud, combine them
				if (skyBaseNode && skyCloudNode) {
					SkyMaterial.setupMaterial(
						skyBaseNode.material,
						skyCloudNode.material.map,
					);
					skyCloudNode.visible = false;

					skyBaseNode.renderOrder = 1001;
					scs.skyMaterial = skyBaseNode.material;
				}
			}
		};

		let assetDatabaseComponent = getOnlyEntity(
			this.queries.assetDatabase,
		).getComponent(AssetDatabaseComponent);
		assetDatabaseComponent.meshes.setMaterialOverride(simpleMaterialOverride);
	}

	setupMapOverrides(scene, mapObject) {
		mapObject.traverse((node) => {
			if (node.userData?.link) {
				node.visible = false;
				// we hide the existing node, and then create an entity
				// that generates the new link.
				let propEntity = this.world.createEntity();
				let placeholder = new THREE.Object3D();
				copyTransforms(node, placeholder);
				node.parent.add(placeholder);
				scene.attach(placeholder);
				propEntity.addComponent(Object3DComponent, {
					value: placeholder,
				});
				propEntity.addComponent(MeshIdComponent, {
					id: node.userData.link,
				});
				propEntity.addComponent(EnvironmentProp);

				// make all the benches & fences instanced meshes
				if (node.userData.link.match(/Bench/i)) {
					propEntity.addComponent(InstancedMeshInstanceComponent, {
						meshId: node.userData.link,
					});
				}
				if (node.userData.link.match(/Fence/i)) {
					propEntity.addComponent(InstancedMeshInstanceComponent, {
						meshId: node.userData.link,
					});
				}
				if (node.userData.link.match(/Bridge/i)) {
					propEntity.addComponent(InstancedMeshInstanceComponent, {
						meshId: node.userData.link,
					});
				}
				if (node.userData.link.match(/planter/i)) {
					propEntity.addComponent(InstancedMeshInstanceComponent, {
						meshId: node.userData.link,
					});
				}
			}
		});
	}

	checkEnvironmentChange() {
		let mapId = null;
		let gameState = null;
		let scene = null;
		this.queries.gameManager.results.forEach((entity) => {
			gameState = entity.getMutableComponent(GameStateComponent);
			mapId = gameState.currentBaseMapId;
			scene = entity.getComponent(THREEGlobalComponent).scene;
		});

		let assetDatabaseComponent = getOnlyEntity(
			this.queries.assetDatabase,
		).getComponent(AssetDatabaseComponent);

		let isEnvironmentAlreadyActivated = false;

		this.queries.environmentObject.results.forEach((mainEnvironmentEntity) => {
			if (mainEnvironmentEntity) {
				if (mainEnvironmentEntity.mapId == mapId) {
					isEnvironmentAlreadyActivated = true;
				} else {
					// remove any old environments we find
					let optimizedModel = mainEnvironmentEntity.getComponent(
						OptimizedModelComponent,
					);
					if (optimizedModel) {
						optimizedModel.model.parent.remove(optimizedModel.model);
						optimizedModel.optimizedModel.parent.remove(
							optimizedModel.optimizedModel,
						);
					}
					deleteEntity(scene, mainEnvironmentEntity);
				}
			}
		});

		if (isEnvironmentAlreadyActivated) {
			return;
		}

		let environmentObject = assetDatabaseComponent.meshes.getMesh(mapId);
		this.setupMapOverrides(scene, environmentObject);

		// set default player start position
		// actual player position is set in SaveDataSystem; we do the ungood thing of
		// modifying the initial position constant so that when we do load a garden
		// the player starts at a place that the map defines.
		// If the map does not define the Player_Start point, we use the default.
		const playerStart = environmentObject.getObjectByName('Player_Start');
		if (playerStart) {
			LOCOMOTION_CONSTANTS.INITIAL_POSITION[gameState.currentBaseMapId].copy(
				playerStart.position,
			);
		}

		let islandEntity = this.world.createEntity();
		islandEntity.mapId = mapId;
		if (OPTIMIZE_MODEL) {
			islandEntity.addComponent(OptimizedModelComponent, {
				model: environmentObject,
				materialOverride: null,
				shadowCastingObjects: [
					/Lantern/i,
					/Tree/i,
					/Plant/i,
					/Crystal/i,
					/Bench/i,
					/Gazebo/i,
					/Box/i,
					/Bridge/i,
					/Pergola/i,
				],
			});
		} else {
			// we're not optimizing anything, so we add it directly to the scene
			scene.add(environmentObject);
			islandEntity.addComponent(Object3DComponent, {
				value: environmentObject,
			});
		}

		// link up the object with the MainEnvironment tag component
		// so that we don't lose track of it.
		islandEntity.addComponent(MainEnvironment);

		gameState.allAssetsLoaded = true;
		updateMatrixRecursively(scene);
		scene.updateMatrixWorld(true);
	}
}

SceneCreationSystem.queries = {
	environmentObject: {
		components: [MainEnvironment],
	},
	gameManager: {
		components: [THREEGlobalComponent, GameStateComponent],
		listen: { changed: [GameStateComponent] },
	},
	player: {
		components: [PlayerStateComponent],
		listen: { added: true, removed: true },
	},
	assetDatabase: {
		components: [AssetDatabaseComponent],
	},
	screenShotCameras: {
		components: [ScreenshotCameraComponent],
	},
};
