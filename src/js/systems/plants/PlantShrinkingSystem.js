/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
	PlantShrinkingComponent,
	PlantedComponent,
} from '../../components/PlantingComponents';

import { GameStateComponent } from '../../components/GameStateComponent';
import { InstancedMeshInstanceComponent } from '../../components/InstancedMeshComponent';
import { Object3DComponent } from '../../components/Object3DComponent';
import { PLANT_CONFIG } from '../../PlantConfigs';
import { SavableObject } from '../../components/SaveDataComponents';
import { SceneLightingComponent } from '../../components/SceneLightingComponent';
import { StaticColliderComponent } from '../../components/ColliderComponents';
import { System } from 'ecsy';
import { applyPDScalar } from '../../utils/pdAccelerations';
import { getOnlyEntity } from '../../utils/entityUtils';

export class PlantShrinkingSystem extends System {
	execute(delta, _time) {
		const gameStateComponent = getOnlyEntity(
			this.queries.gameManager,
		).getMutableComponent(GameStateComponent);

		this.queries.shrinkingPlant.results.forEach((entity) => {
			const plantShrinkingComponent = entity.getMutableComponent(
				PlantShrinkingComponent,
			);

			if (!plantShrinkingComponent.shrinkingData) {
				plantShrinkingComponent.shrinkingData = this._initializeShrinkingData(
					plantShrinkingComponent.plantType,
				);
				const plantObject = entity.getComponent(Object3DComponent).value;
				plantObject.scaleBeforeShrinking = plantObject.scale.clone();
			}

			if (
				plantShrinkingComponent.shrinkingTimer >=
				plantShrinkingComponent.shrinkingData.shrinkDuration
			) {
				removePlant(entity);
				gameStateComponent.updateGardenPending = true;
			} else {
				plantShrinkingComponent.shrinkingTimer += delta;

				this._shrinkPlant(entity, delta);

				if (entity.hasComponent(InstancedMeshInstanceComponent)) {
					entity.getMutableComponent(
						InstancedMeshInstanceComponent,
					).needsUpdate = true;
				}
			}

			// if anythning is shrinking, update the shadow
			getOnlyEntity(this.queries.gameManager).getMutableComponent(
				SceneLightingComponent,
			).needsFastUpdate = true;
		});
	}

	/**
	 * Calculate the pd controller parameters for shrinking the plant
	 * @param {import('ecsy').Entity} entity - plant entity
	 * @returns
	 */
	_initializeShrinkingData(plantType) {
		const plantConfig = PLANT_CONFIG[plantType] ?? PLANT_CONFIG.default;
		const shrinkingData = {};
		Object.entries(plantConfig.shrinkConfig).forEach(([key, value]) => {
			shrinkingData[key] = {
				startTime: plantConfig.shrinkDuration * value.delayedStartPercentage,
				animationDuration: plantConfig.shrinkDuration,
				totalDuration:
					plantConfig.shrinkDuration + plantConfig.convergenceDuration,
				pdDamping: value.pdDamping,
				pdFrequency: value.pdFrequency,
				pdConvergingDamping: plantConfig.convergenceDamping,
				pdConvergingFrequency: plantConfig.convergenceFrequency,
				value: 1,
				speed: 0,
				targetValue: 0,
			};
		});
		shrinkingData.shrinkDuration = plantConfig.shrinkDuration;
		return shrinkingData;
	}

	/**
	 * Calculate and apply new scales to root and parts of the plant
	 * @param {import('ecsy').Entity} entity - plant entity
	 * @param {Number} delta - time passed in this frame in seconds
	 */
	_shrinkPlant(entity, delta) {
		const plantObject = entity.getComponent(Object3DComponent).value;
		const plantShrinkingComponent = entity.getComponent(
			PlantShrinkingComponent,
		);
		const shrinkingData = plantShrinkingComponent.shrinkingData;
		const plantedComponent = entity.getComponent(PlantedComponent);
		Object.entries(shrinkingData).forEach(([key, data]) => {
			if (
				plantShrinkingComponent.shrinkingTimer >= data.startTime &&
				plantShrinkingComponent.shrinkingTimer < data.totalDuration
			) {
				let frequency = data.pdFrequency;
				let damping = data.pdDamping;
				if (plantShrinkingComponent.shrinkingTimer >= data.animationDuration) {
					// the custom animation has ended, now force the value to converge
					const convergingProgress =
						(plantShrinkingComponent.shrinkingTimer - data.animationDuration) /
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
					.copy(plantObject.scaleBeforeShrinking)
					.multiplyScalar(data.value);
			} else {
				plantedComponent.segmentScales[key] = data.value;
			}
		});
	}
}

PlantShrinkingSystem.queries = {
	shrinkingPlant: { components: [PlantShrinkingComponent, Object3DComponent] },
	gameManager: { components: [GameStateComponent] },
};

const removePlant = (plantEntity) => {
	plantEntity.removeComponent(StaticColliderComponent);
	plantEntity.removeComponent(SavableObject);
	const plantedComponent = plantEntity.getComponent(PlantedComponent);
	const tinyColliderEntity = plantedComponent.tinyColliderEntity;
	tinyColliderEntity.removeComponent(StaticColliderComponent);
	plantEntity.removeComponent(PlantedComponent);
	plantEntity.removeComponent(InstancedMeshInstanceComponent);
	const plantObject = plantEntity.getComponent(Object3DComponent).value;
	plantEntity.remove();
	plantObject.parent.remove(plantObject);
};
