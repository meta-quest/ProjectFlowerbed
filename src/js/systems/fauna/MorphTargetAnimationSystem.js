/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { MorphTargetAnimationComponent } from '../../components/MorphTargetAnimationComponent';
import { System } from 'ecsy';

export class MorphTargetAnimationSystem extends System {
	execute(delta) {
		this.queries.entities.results.forEach((entity) => {
			this._animate(entity, delta);
		});
	}

	_animate(entity, delta) {
		const component = entity.getMutableComponent(MorphTargetAnimationComponent);
		const morphTargetMesh = component.morphTargetMesh;
		if (!morphTargetMesh) {
			return;
		}

		const currentMorphTargetInSequence =
			component.morphTargetSequence[component.morphTargetSequenceIndex];
		const currentIndex =
			morphTargetMesh.morphTargetDictionary[currentMorphTargetInSequence.name];

		// Advance the animation time and see whether to transition to the next animation morph target
		component.morphTargetAnimationOffset += delta;
		if (
			component.morphTargetAnimationOffset >
			currentMorphTargetInSequence.duration
		) {
			// Reset the current morph target before modifying the next one
			morphTargetMesh.morphTargetInfluences[currentIndex] = 0;

			component.morphTargetAnimationOffset -=
				currentMorphTargetInSequence.duration;
			component.morphTargetSequenceIndex++;
			component.morphTargetSequenceIndex %=
				component.morphTargetSequence.length;

			const newMorphTargetInSequence =
				component.morphTargetSequence[component.morphTargetSequenceIndex];
			const newIndex =
				morphTargetMesh.morphTargetDictionary[newMorphTargetInSequence.name];

			this._adjustMorphTargetInfluence(
				morphTargetMesh,
				newIndex,
				component.morphTargetAnimationOffset,
				newMorphTargetInSequence.duration,
				newMorphTargetInSequence.maxInfluence,
			);
		} else {
			this._adjustMorphTargetInfluence(
				morphTargetMesh,
				currentIndex,
				component.morphTargetAnimationOffset,
				currentMorphTargetInSequence.duration,
				currentMorphTargetInSequence.maxInfluence,
			);
		}
	}

	_adjustMorphTargetInfluence(
		morphTargetMesh,
		targetIndex,
		animationTimeOffset,
		duration,
		maxInfluence,
	) {
		maxInfluence ||= 1;

		// Each morph target will be animated by adjusting the influence from 0
		// to maxInfluence, then from maxInfluence back to 0 again.
		const halfDuration = duration / 2;

		// The morph target influence is calculated based on the % time elapsed
		// when compared to the duration
		if (animationTimeOffset <= halfDuration) {
			morphTargetMesh.morphTargetInfluences[targetIndex] =
				(animationTimeOffset / halfDuration) * maxInfluence;
		} else {
			const timeOffset = animationTimeOffset - halfDuration;
			morphTargetMesh.morphTargetInfluences[targetIndex] =
				(1 - timeOffset / halfDuration) * maxInfluence;
		}
	}
}

MorphTargetAnimationSystem.queries = {
	entities: { components: [MorphTargetAnimationComponent] },
};
