/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';
import * as localForage from 'localforage';

import { deleteEntity, getOnlyEntity } from '../../utils/entityUtils';

import { AssetDatabaseComponent } from '../../components/AssetDatabaseComponent';
import { GameStateComponent } from '../../components/GameStateComponent';
import { LOCOMOTION_CONSTANTS } from '../../Constants';
import { PlantTinyColliderComponent } from '../../components/PlantingComponents';
import { PlayerStateComponent } from '../../components/PlayerStateComponent';
import { SavableObject } from '../../components/SaveDataComponents';
import { StaticColliderComponent } from '../../components/ColliderComponents';
import { StorageInterface } from '../../lib/StorageInterface';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';

const UPDATE_MIN_INTERVAL = 5;

/**
 * Localhost save data system.
 */
export class LocalSaveDataSystem extends System {
	init() {
		this.scene = null;
		this.gameStateComponent = null;
		this.lastUpdated = 0;

		// TEMPORARY - run a save load on keyboard press
		// Keeping for debug purposes, will remove once auto save is implemented
		// we'll have to have other ways to call into it somehow.
		this.currentGardenId = null;
		window.addEventListener('keydown', function (e) {
			switch (e.code) {
				case 'KeyB': // clear database
					localForage.clear().then((value) => {
						console.log('database cleared', value);
					});
					break;
			}
		});
	}

	execute(_delta, time) {
		let gameManager = getOnlyEntity(this.queries.gameManager);
		this.scene = gameManager.getComponent(THREEGlobalComponent).scene;
		this.gameStateComponent = gameManager.getMutableComponent(
			GameStateComponent,
		);

		let gardenId = this.gameStateComponent.currentGardenId;
		if (this.gameStateComponent.loadGardenPending) {
			this.gameStateComponent.loadGardenPending = false;
			this.loadGarden(gardenId);
		} else if (this.gameStateComponent.updateGardenPending || this.shouldSave) {
			if (time - this.lastUpdated > UPDATE_MIN_INTERVAL) {
				// TO-DO: remove this.shouldSave when implementing auto save
				this.lastUpdated = time;
				this.shouldSave = false;
				this.gameStateComponent.updateGardenPending = false;
				this.updateGardenSave(gardenId);
			}
		} else if (this.gameStateComponent.createGardenPending) {
			this.gameStateComponent.createGardenPending = false;
			this.createGarden();
		}
	}

	resetGarden() {
		// remove all savable objects
		// we have to iterate backwards to avoid mutating results during the iteration
		// see https://ecsy.io/docs/#/manual/Architecture?id=systems
		const results = this.queries.saveObjects.results;
		for (let i = results.length - 1; i >= 0; i--) {
			const entity = results[i];
			deleteEntity(this.scene, entity);
		}

		[...this.queries.helperColliders.results].forEach((entity) => {
			const tinyColliderObject = entity.getComponent(StaticColliderComponent)
				.mesh;
			tinyColliderObject.parent.remove(tinyColliderObject);
			entity.remove();
		});

		// reset player location
		this.queries.player.results.forEach((entity) => {
			const playerState = entity.getComponent(PlayerStateComponent);
			let initialPosition =
				LOCOMOTION_CONSTANTS.INITIAL_POSITION[
					this.gameStateComponent.currentBaseMapId
				];
			playerState.viewerTransform.position.set(
				initialPosition.x,
				initialPosition.y,
				initialPosition.z,
			);
			playerState.viewerTransform.rotation.setFromQuaternion(
				new THREE.Quaternion(0, 0.3826832701261641, 0, 0.9238791864568084),
			);
		});

		// reset interaction mode
		this.gameStateComponent.resetInteractionMode();
	}

	updateGardenSave(gardenId) {
		console.log('Updating garden:', gardenId);
		// TO-DO: implement feedback to let the user know save has completed

		let gardenData = this._serializeAllSaveObjects();
		// put it into localStorage
		StorageInterface.updateGarden(gardenId, gardenData).catch((err) => {
			console.log('Update garden failed', err);
		});
	}

	createGarden() {
		this.resetGarden();
		StorageInterface.createGarden(this.gameStateComponent.currentBaseMapId)
			.then((gardenId) => {
				this.gameStateComponent.currentGardenId = gardenId;
				console.log('Created new garden', gardenId);
				this.gameStateComponent.gardenListNeedsRefresh = true;
			})
			.catch((err) => {
				console.log('Create garden failed', err);
			});
	}

	loadGarden(gardenId) {
		console.log('Loading garden:', gardenId);
		// TO-DO: add and enable a loading screen here
		// disable the loading screen in then()

		StorageInterface.loadGardenData(gardenId)
			.then((gardenData) => {
				this.resetGarden();
				// deserialize all objects
				this._deserializeJSON(JSON.parse(JSON.stringify(gardenData)));
			})
			.catch((err) => {
				console.log('Load garden failed', err);
			});
	}

	_serializeAllSaveObjects() {
		const objects = [];
		this.queries.saveObjects.results.forEach((entity) => {
			const components = entity.getComponents();
			const obj = {};
			for (let key in components) {
				let component = components[key];

				const name = component.getName();
				if (!component.serialize) {
					continue;
				}
				obj[name] = component.serialize();
			}
			objects.push(obj);
		});

		return objects;
	}

	_deserializeJSON(jsonObjects) {
		const entities = [];
		for (let object of jsonObjects) {
			const newEntity = this.world.createEntity();
			for (let key in object) {
				const componentType = getComponentFromName(this.world, key);
				newEntity.addComponent(componentType);

				let componentInstance = newEntity.getMutableComponent(componentType);
				if (componentInstance.deserialize) {
					componentInstance.deserialize(object[key]);
				}
			}

			// second pass, for any components that need access to the whole entity
			const components = newEntity.getComponents();
			for (let key in components) {
				const component = components[key];
				if (component.afterDeserialize) {
					const assetDatabase = getOnlyEntity(
						this.queries.assetDatabase,
					).getComponent(AssetDatabaseComponent);
					component.afterDeserialize(newEntity, this.scene, assetDatabase);
				}
			}

			entities.push(newEntity);
		}

		return entities;
	}
}

const getComponentFromName = (world, componentName) => {
	// get the component
	const componentManager = world.componentsManager;
	const component = componentManager.Components.find((c) => {
		return c.getName() === componentName;
	});
	if (!component) {
		return undefined;
	}
	return component;
};

LocalSaveDataSystem.queries = {
	gameManager: { components: [GameStateComponent, THREEGlobalComponent] },
	player: { components: [PlayerStateComponent] },
	saveObjects: { components: [SavableObject] },
	helperColliders: { components: [PlantTinyColliderComponent] },
	assetDatabase: { components: [AssetDatabaseComponent] },
};
