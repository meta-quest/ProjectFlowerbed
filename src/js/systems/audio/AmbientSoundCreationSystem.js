/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetURLs } from '@config/AssetURLs';
import { GameStateComponent } from '../../components/GameStateComponent';
import { LoopingAudioComponent } from '../../components/AudioComponents';
import { MainEnvironment } from '../../components/GameObjectTagComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { OptimizedModelComponent } from '../../components/OptimizedModelComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { getOnlyEntity } from '../../utils/entityUtils';

export class AmbientSoundCreationSystem extends System {
	execute() {
		const gameManager = getOnlyEntity(this.queries.gameManager);
		const gameState = gameManager.getComponent(GameStateComponent);
		if (!gameState.allAssetsLoaded) {
			return;
		}
		this.oceanAmbientEntity = this.world.createEntity();
		this.oceanAmbientEntity.addComponent(LoopingAudioComponent, {
			id: 'HEADLOCKED_AMBIENT_LOOP',
		});

		this._createPositionalAmbientSounds();
		this.stop();
	}

	_createPositionalAmbientSounds() {
		const gameManager = getOnlyEntity(this.queries.gameManager);
		const scene = gameManager.getComponent(THREEGlobalComponent).scene;
		this.queries.mainEnvironment.results.forEach((envEntity) => {
			let environmentObj;
			if (envEntity.hasComponent(OptimizedModelComponent)) {
				environmentObj = envEntity.getComponent(OptimizedModelComponent).model;
			} else {
				environmentObj = envEntity.getComponent(Object3DComponent).value;
			}

			let ambientEntities = [];

			environmentObj.traverse((node) => {
				if (!node.name || !node.name.startsWith('SFX_')) {
					return;
				}

				// any node that starts with SFX_ is assumed to be a sound.
				let soundId;
				if (node.name.match(/WATER_FLOW/)) {
					// choose between the 4 water flow sounds
					const loopNumber = Math.floor(Math.random() * 4) + 1;
					soundId = 'WATER_FLOW_LOOP_0' + loopNumber.toString();
				} else if (node.name.match(/OCEAN/)) {
					const loopNumber = Math.floor(Math.random() * 4) + 1;
					soundId = 'OCEAN_WAVES_LOOP_0' + loopNumber.toString();
				} else if (node.name.match(/DUCKS/)) {
					soundId = 'DUCKS_LOOP';
				}

				if (!soundId || !AssetURLs.AUDIO[soundId]) {
					console.warn('No ambient sound found with id', soundId);
					return;
				}

				const soundEntity = this.world.createEntity();
				soundEntity.addComponent(Object3DComponent, {
					value: node,
				});
				soundEntity.addComponent(LoopingAudioComponent, {
					id: soundId,
				});
				ambientEntities.push(soundEntity);
			});

			// loop through the ambient entities' object3Ds, and attach them to the scene
			// so local position is also global position.
			for (let entity of ambientEntities) {
				const obj = entity.getComponent(Object3DComponent).value;
				scene.attach(obj);
			}
		});
	}
}

AmbientSoundCreationSystem.queries = {
	gameManager: {
		components: [THREEGlobalComponent, GameStateComponent],
	},
	mainEnvironment: {
		components: [MainEnvironment],
	},
};
