/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { FaunaAnimationComponent } from 'src/js/components/FaunaAnimationComponent';
import { InstancedMeshInstanceComponent } from 'src/js/components/InstancedMeshComponent';
import { Object3DComponent } from 'src/js/components/Object3DComponent';
import { System } from 'ecsy';

export class FaunaAnimationSystem extends System {
	execute(delta, _time) {
		this.queries.faunaInstance.added.forEach((entity) => {
			const animComponent = entity.getMutableComponent(FaunaAnimationComponent);
			animComponent.selfAlternatingAnimationTimers = new Array(
				animComponent.selfAlternatingAnimations.length,
			).fill(0);
			animComponent.animationSequenceTimer = 0;
			animComponent.animationSequenceCurrentIdx = 0;
		});
		this.queries.faunaInstance.results.forEach((entity) => {
			const object = entity.getComponent(Object3DComponent).value;
			if (object.isCulled) return;

			const instanceComponent = entity.getComponent(
				InstancedMeshInstanceComponent,
			);
			const instancedMesh = instanceComponent.instancedMesh?.mesh;
			if (!instancedMesh) return;

			const morphTargetDictionary = instancedMesh.morphTargetDictionary;

			const animComponent = entity.getMutableComponent(FaunaAnimationComponent);
			const influences = [0, 0, 0, 0];
			this._updateSelfAlternatingAnimations(
				influences,
				animComponent,
				morphTargetDictionary,
				delta,
			);
			this._updateSynchronizedAnimationSequence(
				influences,
				animComponent,
				morphTargetDictionary,
				delta,
			);

			const instanceId = instanceComponent.instanceId;
			instancedMesh.updateInstance(instanceId, {
				influences: new THREE.Vector4().fromArray(influences),
			});
		});
	}

	_updateSelfAlternatingAnimations(
		influences,
		animComponent,
		morphTargetDictionary,
		delta,
	) {
		animComponent.selfAlternatingAnimations.forEach((animData, i) => {
			const influenceIdx = morphTargetDictionary[animData.animId];
			if (animComponent.selfAlternatingAnimationTimers[i] > animData.duration) {
				animComponent.selfAlternatingAnimationTimers[i] = 0;
				influences[influenceIdx] = 0;
			} else {
				influences[influenceIdx] =
					(-4 *
						Math.pow(
							animComponent.selfAlternatingAnimationTimers[i] /
								animData.duration -
								0.5,
							2,
						) +
						1) *
					animData.maxInfluence;
			}
			animComponent.selfAlternatingAnimationTimers[i] += delta;
		});
	}

	_updateSynchronizedAnimationSequence(
		influences,
		animComponent,
		morphTargetDictionary,
		delta,
	) {
		const animData =
			animComponent.synchronizedAnimationSequence[
				animComponent.animationSequenceCurrentIdx
			];
		if (!animData) return;

		const influenceIdx = morphTargetDictionary[animData.animId];

		if (animComponent.animationSequenceTimer > animData.duration) {
			animComponent.animationSequenceTimer = 0;
			// clear all influences in animation sequence
			animComponent.synchronizedAnimationSequence.forEach((animData) => {
				influences[morphTargetDictionary[animData.animId]] = 0;
			});
			// switch to next morph target
			animComponent.animationSequenceCurrentIdx =
				(animComponent.animationSequenceCurrentIdx + 1) %
				animComponent.synchronizedAnimationSequence.length;
		} else {
			// parabolic curve instead of linear changes, make animation smoother
			influences[influenceIdx] =
				(-4 *
					Math.pow(
						animComponent.animationSequenceTimer / animData.duration - 0.5,
						2,
					) +
					1) *
				animData.maxInfluence;
		}
		animComponent.animationSequenceTimer += delta;
	}
}

FaunaAnimationSystem.queries = {
	faunaInstance: {
		components: [
			Object3DComponent,
			InstancedMeshInstanceComponent,
			FaunaAnimationComponent,
		],
		listen: { added: true },
	},
};
