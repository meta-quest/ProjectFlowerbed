/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
	MeshIdComponent,
	createReplaceableMesh,
} from 'src/js/components/AssetReplacementComponents';
import {
	WATER_FAUNA_AREAS,
	generateRandomPointInArea,
} from 'src/js/utils/waterBoundsCheckUtils';
import {
	WaterFaunaGroupComponent,
	WaterFaunaMovementComponent,
} from 'src/js/components/FaunaComponents';

import { DEBUG_CONSTANTS } from '../../Constants';
import { FaunaAnimationComponent } from 'src/js/components/FaunaAnimationComponent';
import { GameStateComponent } from 'src/js/components/GameStateComponent';
import { InstancedMeshInstanceComponent } from 'src/js/components/InstancedMeshComponent';
import { Object3DComponent } from 'src/js/components/Object3DComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from 'src/js/components/THREEGlobalComponent';
import { WATER_FAUNA_CONSTANTS } from 'src/js/Constants';
import { getOnlyEntity } from 'src/js/utils/entityUtils';

export class WaterFaunaCreationSystem extends System {
	init() {
		this._scene = getOnlyEntity(this.queries.gameManager).getComponent(
			THREEGlobalComponent,
		).scene;

		if (DEBUG_CONSTANTS.DISABLE_WATER_FAUNA !== true) {
			WATER_FAUNA_CONSTANTS.GROUPS.forEach((group) => {
				const entities = [];
				for (let i = 0; i < group.NUMBER_OF_FAUNA; i++) {
					entities.push(this._generateRandomWaterFauna(group));
				}
				this.world.createEntity().addComponent(WaterFaunaGroupComponent, {
					areaId: group.AREA_ID,
					entities: entities,
					turnStages: group.TURN_STAGE_THRESHOLDS,
					turnFactorMultiplier: group.TURN_FACTOR_MULTIPLIER,
					avoidOthers: group.AVOID_OTHERS,
					cullingDistance: group.CULLING_DISTANCE,
				});
			});
		}

		this._gameState = getOnlyEntity(this.queries.gameManager).getComponent(
			GameStateComponent,
		);
		this._collidersHidden = false;
	}

	_generateRandomWaterFauna(group) {
		const {
			AREA_ID,
			VARIATION_MESH_IDS,
			SELF_ALTER_ANIM_IDS,
			SELF_ALTER_ANIM_DURATION,
			SELF_ALTER_ANIM_MAX_INFLUENCE,
			SYNC_ANIM_SEQUENCE_IDS,
			ANIM_SEQUENCE_DURATION,
			ANIM_SEQUENCE_MAX_INFLUENCE,
			BASE_SPEED,
			SPEED_DELTA_RANGE,
			BASE_DEPTH,
			DEPTH_DELTA_RANGE,
			BASE_SCALE,
			SCALE_DELTA_RANGE,
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
		entity.addComponent(WaterFaunaMovementComponent, {
			speed,
			turnSign: Math.random() > 0.5 ? 1 : -1,
		});
		this._scene.add(mesh);
		const [x, y] = generateRandomPointInArea(WATER_FAUNA_AREAS[AREA_ID]);
		if (WATER_FAUNA_AREAS[AREA_ID].IS_VERTICALLY_SAMPLED) {
			mesh.position.set(x, 0, y);
		} else {
			mesh.position.set(y, 0, x);
		}
		mesh.rotateY(Math.random() * Math.PI * 2);
		mesh.position.y =
			BASE_DEPTH - DEPTH_DELTA_RANGE / 2 + Math.random() * DEPTH_DELTA_RANGE;
		mesh.scale.setScalar(
			BASE_SCALE - SCALE_DELTA_RANGE / 2 + Math.random() * SCALE_DELTA_RANGE,
		);
		return entity;
	}

	execute(_delta, _time) {
		if (this._gameState.allAssetsLoaded) {
			if (!this._collidersHidden) {
				this._scene.getObjectByName('RiverBoundingRegion').visible = false;
				this._scene.getObjectByName('PondBoundingRegion').visible = false;
				this._collidersHidden = true;
			}
			this.queries.faunaGroups.results.forEach((groupEntity) => {
				const faunaGroup = groupEntity.getComponent(WaterFaunaGroupComponent);
				faunaGroup.entities.forEach((entity) => {
					if (entity.getComponent(MeshIdComponent).modelHasChanged) {
						entity.addComponent(InstancedMeshInstanceComponent, {
							meshId: entity.getComponent(MeshIdComponent).id,
						});
						const realFish = entity.getComponent(Object3DComponent).value;
						realFish.children[0].rotateY(Math.PI);
					}
				});
			});
		}
	}
}

WaterFaunaCreationSystem.queries = {
	gameManager: { components: [THREEGlobalComponent, GameStateComponent] },
	faunaGroups: { components: [WaterFaunaGroupComponent] },
};
