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
import {
	MeshIdComponent,
	createReplaceableMesh,
} from 'src/js/components/AssetReplacementComponents';

import { AERIAL_FAUNA_CONSTANTS } from 'src/js/Constants';
import { DEBUG_CONSTANTS } from '../../Constants';
import { FaunaAnimationComponent } from 'src/js/components/FaunaAnimationComponent';
import { GameStateComponent } from 'src/js/components/GameStateComponent';
import { InstancedMeshInstanceComponent } from 'src/js/components/InstancedMeshComponent';
import { PlaylistAudioComponent } from 'src/js/components/AudioComponents';
import { System } from 'ecsy';
import { THREEGlobalComponent } from 'src/js/components/THREEGlobalComponent';
import { getOnlyEntity } from 'src/js/utils/entityUtils';

export class AerialFaunaCreationSystem extends System {
	init() {
		this._scene = getOnlyEntity(this.queries.gameManager).getComponent(
			THREEGlobalComponent,
		).scene;

		if (DEBUG_CONSTANTS.DISABLE_AIR_FAUNA !== true) {
			AERIAL_FAUNA_CONSTANTS.GROUPS.forEach((group) => {
				const entities = [];
				for (let i = 0; i < group.NUMBER_OF_FAUNA; i++) {
					entities.push(this._generateRandomAerialFauna(group));
				}
				this.world.createEntity().addComponent(AerialFaunaGroupComponent, {
					entities: entities,
					boundingBox3: group.BOUNDING_BOX3,
					minYRadian: group.MIN_Y_RAD,
					maxYRadian: group.MAX_Y_RAD,
					turnDegreesRadian: group.TURN_RAD,
					verticalPathVariationFrequency: group.VERTICAL_PATH_VARIATION_FREQ,
					verticalPathVariationFactor: group.VERTICAL_PATH_VARIATION_FACTOR,
					horizontalPathVariationFrequency:
						group.HORIZONTAL_PATH_VARIATION_FREQ,
					horizontalPathVariationFactor: group.HORIZONTAL_PATH_VARIATION_FACTOR,
					cullingDistance: group.CULLING_DISTANCE,
				});
			});
		}

		this._gameState = getOnlyEntity(this.queries.gameManager).getComponent(
			GameStateComponent,
		);
	}

	_generateRandomAerialFauna(group) {
		const {
			BOUNDING_BOX3,
			VARIATION_MESH_IDS,
			SELF_ALTER_ANIM_IDS,
			SELF_ALTER_ANIM_DURATION,
			SELF_ALTER_ANIM_MAX_INFLUENCE,
			SYNC_ANIM_SEQUENCE_IDS,
			ANIM_SEQUENCE_DURATION,
			ANIM_SEQUENCE_MAX_INFLUENCE,
			BASE_SPEED,
			SPEED_DELTA_RANGE,
			VERTICAL_PATH_VARIATION_FREQ,
			VERTICAL_PATH_VARIATION_FACTOR,
			HORIZONTAL_PATH_VARIATION_FREQ,
			HORIZONTAL_PATH_VARIATION_FACTOR,
			AUDIO_CONFIG,
		} = group;
		const entity = this.world.createEntity();
		const mesh = createReplaceableMesh(
			entity,
			VARIATION_MESH_IDS[Math.floor(Math.random() * VARIATION_MESH_IDS.length)],
		);
		const speed =
			BASE_SPEED - SPEED_DELTA_RANGE / 2 + Math.random() * SPEED_DELTA_RANGE;
		entity.addComponent(FaunaAnimationComponent, {
			selfAlternatingAnimations: SELF_ALTER_ANIM_IDS.map((animId) => ({
				animId: animId,
				duration: SELF_ALTER_ANIM_DURATION,
				maxInfluence: SELF_ALTER_ANIM_MAX_INFLUENCE,
			})),
			synchronizedAnimationSequence: SYNC_ANIM_SEQUENCE_IDS.map((animId) => ({
				animId: animId,
				duration: ANIM_SEQUENCE_DURATION / (speed / BASE_SPEED),
				maxInfluence: ANIM_SEQUENCE_MAX_INFLUENCE,
			})),
		});

		const initialDirection = new THREE.Vector3().random();
		initialDirection.y = 0;
		initialDirection.normalize();

		this._scene.add(mesh);
		mesh.position.copy(generateRandomPointInBox3(BOUNDING_BOX3));
		mesh.lookAt(initialDirection);
		entity.addComponent(AerialFaunaMovementComponent, {
			speed,
			direction: initialDirection,
			verticalVariationOffset:
				VERTICAL_PATH_VARIATION_FACTOR == 0
					? 0
					: Math.random() / VERTICAL_PATH_VARIATION_FREQ,
			horizontalVariationOffset:
				HORIZONTAL_PATH_VARIATION_FACTOR == 0
					? 0
					: Math.random() / HORIZONTAL_PATH_VARIATION_FREQ,
		});
		if (AUDIO_CONFIG) {
			entity.addComponent(PlaylistAudioComponent, AUDIO_CONFIG);
		}
		return entity;
	}

	execute(_delta, _time) {
		if (this._gameState.allAssetsLoaded) {
			this.queries.faunaGroups.results.forEach((groupEntity) => {
				const faunaGroup = groupEntity.getComponent(AerialFaunaGroupComponent);
				faunaGroup.entities.forEach((entity) => {
					if (entity.getComponent(MeshIdComponent).modelHasChanged) {
						entity.addComponent(InstancedMeshInstanceComponent, {
							meshId: entity.getComponent(MeshIdComponent).id,
						});
					}
				});
			});
		}
	}
}

AerialFaunaCreationSystem.queries = {
	gameManager: { components: [THREEGlobalComponent, GameStateComponent] },
	faunaGroups: { components: [AerialFaunaGroupComponent] },
};

const generateRandomPointInBox3 = (box3) => {
	const x = box3.min.x + (box3.max.x - box3.min.x) * Math.random();
	const y = box3.min.y + (box3.max.y - box3.min.y) * Math.random();
	const z = box3.min.z + (box3.max.z - box3.min.z) * Math.random();
	return new THREE.Vector3(x, y, z);
};
