/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { Not, System } from 'ecsy';
import {
	PlantGrowingComponent,
	PlantedComponent,
} from '../../components/PlantingComponents';

import { GameStateComponent } from '../../components/GameStateComponent';
import { InstancedMeshInstanceComponent } from '../../components/InstancedMeshComponent';
import { MeshIdComponent } from '../../components/AssetReplacementComponents';
import { Object3DComponent } from '../../components/Object3DComponent';
import { PLANT_CONFIG } from '../../PlantConfigs';
import { SavableObject } from '../../components/SaveDataComponents';
import { SceneLightingComponent } from '../../components/SceneLightingComponent';
import { applyPDScalar } from '../../utils/pdAccelerations';
import { getOnlyEntity } from '../../utils/entityUtils';
import { updateMatrixRecursively } from '../../utils/object3dUtils';

export class PlantGrowingSystem extends System {
	execute(delta, _time) {
		const gameStateComponent = getOnlyEntity(
			this.queries.gameManager,
		).getMutableComponent(GameStateComponent);

		this.queries.unplantedPlant.results.forEach((entity) => {
			const plantMeshId = entity.getComponent(MeshIdComponent);
			entity.addComponent(InstancedMeshInstanceComponent, {
				meshId: plantMeshId.value,
			});
			this._randomizePlant(entity);
		});

		this.queries.growingPlant.results.forEach((entity) => {
			const plantGrowingComponent = entity.getMutableComponent(
				PlantGrowingComponent,
			);
			const plantConfig =
				PLANT_CONFIG[plantGrowingComponent.plantType] ?? PLANT_CONFIG.default;

			const totalTime =
				plantConfig.growthDuration + plantConfig.convergenceDuration;
			if (plantGrowingComponent.growingTimer >= totalTime) {
				entity.getMutableComponent(PlantedComponent).pickable = true;
				entity.removeComponent(PlantGrowingComponent);
				entity.addComponent(SavableObject);
				gameStateComponent.updateGardenPending = true;
			} else {
				plantGrowingComponent.growingTimer += delta;

				this._growPlant(entity, delta);

				if (entity.hasComponent(InstancedMeshInstanceComponent)) {
					entity.getMutableComponent(
						InstancedMeshInstanceComponent,
					).needsUpdate = true;
				}
				getOnlyEntity(this.queries.gameManager).getMutableComponent(
					SceneLightingComponent,
				).needsFastUpdate = true;
			}
		});
	}

	/**
	 * Randomize the size and growth parameters for the plant
	 * @param {import('ecsy').Entity} entity - plant entity
	 */
	_randomizePlant(entity) {
		const plantGrowingComponent = entity.getMutableComponent(
			PlantGrowingComponent,
		);
		const plantConfig =
			PLANT_CONFIG[plantGrowingComponent.plantType] ?? PLANT_CONFIG.default;

		const randomizedScale = new THREE.Vector3().setScalar(
			plantConfig.baselineScale,
		);
		randomizedScale.y *=
			1 -
			plantConfig.heightMargin +
			Math.random() * plantConfig.heightMargin * 2;

		plantGrowingComponent.growingData = this._initializeGrowthData(plantConfig);

		entity.addComponent(PlantedComponent, {
			plantType: plantGrowingComponent.plantType,
			plantedScale: randomizedScale,
			segmentScales: new THREE.Vector4(0, 0, 0, 0),
		});

		const plantObject = entity.getComponent(Object3DComponent).value;
		plantObject.clear();
		plantObject.rotateY(
			plantConfig.rotationRange.minY +
				(plantConfig.rotationRange.maxY - plantConfig.rotationRange.minY) *
					Math.random(),
		);
		updateMatrixRecursively(plantObject);
	}

	/**
	 * Calculate the pd controller parameters for growing the plant
	 * @param {*} plantConfig - Config data for the plant
	 * @returns
	 */
	_initializeGrowthData(plantConfig) {
		const growingData = {};
		Object.entries(plantConfig.growthConfig).forEach(([key, value]) => {
			growingData[key] = {
				startTime: plantConfig.growthDuration * value.delayedStartPercentage,
				animationDuration: plantConfig.growthDuration,
				totalDuration:
					plantConfig.growthDuration + plantConfig.convergenceDuration,
				pdDamping: value.pdDamping,
				pdFrequency: value.pdFrequency,
				pdConvergingDamping: plantConfig.convergenceDamping,
				pdConvergingFrequency: plantConfig.convergenceFrequency,
				value: 0,
				speed: 0,
				targetValue: 1 - value.margin + Math.random() * value.margin * 2,
			};
		});
		return growingData;
	}

	/**
	 * Calculate and apply new scales to root and parts of the plant
	 * @param {import('ecsy').Entity} entity - plant entity
	 * @param {Number} delta - time passed in this frame in seconds
	 */
	_growPlant(entity, delta) {
		const plantObject = entity.getComponent(Object3DComponent).value;
		const plantGrowingComponent = entity.getMutableComponent(
			PlantGrowingComponent,
		);
		const growingData = plantGrowingComponent.growingData;
		const plantedComponent = entity.getComponent(PlantedComponent);
		Object.entries(growingData).forEach(([key, data]) => {
			if (
				plantGrowingComponent.growingTimer >= data.startTime &&
				plantGrowingComponent.growingTimer < data.totalDuration
			) {
				let frequency = data.pdFrequency;
				let damping = data.pdDamping;
				if (plantGrowingComponent.growingTimer >= data.animationDuration) {
					// the custom animation has ended, now force the value to converge
					const convergingProgress =
						(plantGrowingComponent.growingTimer - data.animationDuration) /
						(data.totalDuration - data.animationDuration);

					frequency =
						convergingProgress *
							(data.pdConvergingFrequency - data.pdFrequency) +
						data.pdFrequency;

					damping =
						convergingProgress * (data.pdConvergingDamping - data.pdDamping) +
						data.pdDamping;
				}
				[data.speed, data.value] = applyPDScalar(
					data.value,
					data.speed,
					data.targetValue,
					0,
					frequency,
					damping,
					delta,
				);
			}

			if (key == 'root') {
				plantObject.scale
					.copy(plantedComponent.plantedScale)
					.multiplyScalar(data.value);
			} else {
				plantedComponent.segmentScales[key] = data.value;
			}
			// updateMatrixRecursively(plantObject);
		});
	}
}

PlantGrowingSystem.queries = {
	unplantedPlant: {
		components: [
			PlantGrowingComponent,
			Not(PlantedComponent),
			Object3DComponent,
		],
	},
	growingPlant: {
		components: [PlantGrowingComponent, PlantedComponent, Object3DComponent],
	},
	gameManager: { components: [GameStateComponent] },
};
