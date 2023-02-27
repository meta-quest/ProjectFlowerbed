/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { AXES, BUTTONS } from '../../lib/ControllerInterface';

import { GameStateComponent } from '../../components/GameStateComponent';
import { InteractionSystem } from '../../lib/InteractionSystem';
import { JOINTS_DATA } from '../../HandPoses';
import { Object3DComponent } from '../../components/Object3DComponent';
import { updateMatrixRecursively } from '../../utils/object3dUtils';

const THUMB_SPEED = 20;
const INTERACTION_MODES = GameStateComponent.INTERACTION_MODES;

export class HandAnimationSystem extends InteractionSystem {
	init() {
		this.joints = {};

		Object.entries(JOINTS_DATA).forEach(([mode, states]) => {
			this.joints[mode] = {};
			Object.entries(states).forEach(([sectionKey, sectionData]) => {
				this.joints[mode][sectionKey] = {};
				Object.entries(sectionData).forEach(([jointKey, jointData]) => {
					const joint = {};
					Object.entries(jointData).forEach(([state, poseData]) => {
						joint[state] = new THREE.Quaternion().fromArray(poseData);
					});
					this.joints[mode][sectionKey][jointKey] = joint;
				});
			});
		});

		this.thumbValues = {
			LEFT: 0,
			RIGHT: 0,
		};

		this.thumbTargetValues = {
			LEFT: 0,
			RIGHT: 0,
		};
	}

	onExecute(delta, _time) {
		// animate primary hand
		const primaryControllerComponent = this.vrControllerComponents.RIGHT;
		const primaryController = primaryControllerComponent.controllerInterface;
		const primaryHandModel = primaryControllerComponent.handModelEntity?.getComponent(
			Object3DComponent,
		).value;
		if (primaryController && primaryHandModel) {
			let renderEmptyHand = true;
			if (!this.gameStateComponent.interactionModeOverridden) {
				switch (this.gameStateComponent.interactionMode) {
					case INTERACTION_MODES.WATERING:
						this._overrideHandPose(primaryHandModel, this.joints.WATERING);
						renderEmptyHand = false;
						break;
					case INTERACTION_MODES.PLANTING:
						this._overrideHandPose(primaryHandModel, this.joints.PLANTING);
						renderEmptyHand = false;
						break;
					case INTERACTION_MODES.CAMERA:
						this._animateHand(
							primaryHandModel,
							this.joints.CAMERA,
							primaryController.getAxisInput(AXES.INDEX_TRIGGER),
							0,
							0,
						);
						renderEmptyHand = false;
						renderEmptyHand = false;
						break;
					case INTERACTION_MODES.PICKING:
						this._animateHand(
							primaryHandModel,
							this.joints.GRABBING,
							primaryController.getAxisInput(AXES.INDEX_TRIGGER),
							primaryController.getAxisInput(AXES.INDEX_TRIGGER),
							primaryController.getAxisInput(AXES.INDEX_TRIGGER),
						);
						renderEmptyHand = false;
						break;
				}
			}
			if (renderEmptyHand) {
				this._animateHand(
					primaryHandModel,
					this.joints.EMPTY,
					primaryController.getAxisInput(AXES.INDEX_TRIGGER),
					primaryController.getAxisInput(AXES.HAND_TRIGGER),
					this._calculateThumbValue(primaryController, delta),
				);
			}
			updateMatrixRecursively(primaryHandModel);
		}

		// animate secondary hand
		const secondaryControllerComponent = this.vrControllerComponents.LEFT;
		const secondaryController =
			secondaryControllerComponent.controllerInterface;
		const secondaryHandModel = secondaryControllerComponent.handModelEntity?.getComponent(
			Object3DComponent,
		).value;
		if (secondaryController && secondaryHandModel) {
			switch (this.gameStateComponent.interactionMode) {
				case INTERACTION_MODES.CAMERA:
					this._animateHand(
						secondaryHandModel,
						this.joints.GRABBING,
						secondaryController.getAxisInput(AXES.INDEX_TRIGGER),
						secondaryController.getAxisInput(AXES.INDEX_TRIGGER),
						secondaryController.getAxisInput(AXES.INDEX_TRIGGER),
					);
					break;
				case INTERACTION_MODES.PLANTING:
					this._animateHand(
						secondaryHandModel,
						this.joints.SEEDBOX,
						1,
						1,
						this._calculateThumbValue(secondaryController, delta),
					);
					break;
				default:
					this._animateHand(
						secondaryHandModel,
						this.joints.EMPTY,
						secondaryController.getAxisInput(AXES.INDEX_TRIGGER),
						secondaryController.getAxisInput(AXES.HAND_TRIGGER),
						this._calculateThumbValue(secondaryController, delta),
					);
			}
			updateMatrixRecursively(secondaryHandModel);
		}
	}

	_calculateThumbValue(controller, delta) {
		this.thumbTargetValues[controller.handKey] =
			controller.getButtonInput(BUTTONS.BUTTON_1).touched ||
			controller.getButtonInput(BUTTONS.BUTTON_2).touched ||
			controller.getButtonInput(BUTTONS.THUMBSTICK).touched
				? 1
				: 0;

		if (
			this.thumbValues[controller.handKey] <
			this.thumbTargetValues[controller.handKey]
		) {
			this.thumbValues[controller.handKey] = Math.min(
				this.thumbValues[controller.handKey] + delta * THUMB_SPEED,
				this.thumbTargetValues[controller.handKey],
			);
		} else if (
			this.thumbValues[controller.handKey] >
			this.thumbTargetValues[controller.handKey]
		) {
			this.thumbValues[controller.handKey] = Math.max(
				this.thumbValues[controller.handKey] - delta * THUMB_SPEED,
				0,
			);
		}
		return this.thumbValues[controller.handKey];
	}

	/**
	 * Animate empty hands according to trigger/grip/button input
	 * @param {string} handKey
	 * @param {string} delta
	 * @returns
	 */
	_animateHand(handModel, jointsData, indexValue, handValue, thumbValue) {
		// const indexValue = controller.getAxisInput(AXES.INDEX_TRIGGER);
		for (const [name, states] of Object.entries(jointsData.INDEX)) {
			const bone = handModel.getObjectByName(name);
			bone.quaternion.slerpQuaternions(
				states.DEFAULT,
				states.PRESSED,
				indexValue,
			);
		}

		// const handValue = controller.getAxisInput(AXES.HAND_TRIGGER);
		for (const [name, states] of Object.entries(jointsData.HAND)) {
			const bone = handModel.getObjectByName(name);
			bone.quaternion.slerpQuaternions(
				states.DEFAULT,
				states.PRESSED,
				handValue,
			);
		}

		for (const [name, states] of Object.entries(jointsData.THUMB)) {
			const bone = handModel.getObjectByName(name);
			bone.quaternion.slerpQuaternions(
				states.DEFAULT,
				states.PRESSED,
				thumbValue,
			);
		}
	}

	/**
	 * Override hand pose with static pose
	 * @param {string} handKey
	 * @param {string} mode
	 * @returns
	 */
	_overrideHandPose(handModel, jointsData) {
		for (const sectionData of Object.values(jointsData)) {
			for (const [name, states] of Object.entries(sectionData)) {
				const bone = handModel.getObjectByName(name);
				bone.quaternion.copy(states.DEFAULT);
			}
		}
	}
}
