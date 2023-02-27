/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { InteractionSystem } from '../lib/InteractionSystem';
import { MeshIdComponent } from '../components/AssetReplacementComponents';
import { Object3DComponent } from '../components/Object3DComponent';

const ANIMATION_TRACK_POSE_MAPPING = {
	EMPTY: {
		DEFAULT: 'EMPTY_DEFAULT',
		PRESSED: 'EMPTY_PRESSED',
	},
	WATERING: {
		DEFAULT: 'WATERING_DEFAULT',
	},
	CAMERA: {
		DEFAULT: 'CAMERA_DEFAULT',
		PRESSED: 'CAMERA_PRESSED',
	},
	PLANTING: {
		DEFAULT: 'SEEDBAG_DEFAULT',
	},
	GRABBING: {
		DEFAULT: 'EMPTY_DEFAULT',
		PRESSED: 'Hold_CameraPhoto',
	},
	SEEDBOX: {
		DEFAULT: 'SEEDBOX_DEFAULT',
		PRESSED: 'SEEDBOX_PRESSED',
	},
};

export class HandPoseExtractionSystem extends InteractionSystem {
	init() {
		this.handEntity = this.world.createEntity();
		this.handEntity.addComponent(MeshIdComponent, { id: 'HAND_REST_LEFT' });
		this.handEntity.addComponent(Object3DComponent, {
			value: new THREE.Object3D(),
		});

		window.addEventListener(
			'keydown',
			(event) => {
				switch (event.code) {
					case 'KeyP':
						console.log(this._extractPoses());
						break;
					default:
						return;
				}
			},
			true,
		);
	}

	_extractPoses() {
		const mesh = this.handEntity.getComponent(Object3DComponent).value;
		const clips = mesh.animations;
		const bonesData = {};
		Object.entries(ANIMATION_TRACK_POSE_MAPPING).forEach(([mode, states]) => {
			const bones = {
				THUMB: {},
				INDEX: {},
				HAND: {},
			};
			Object.entries(states).forEach(([state, clipName]) => {
				const clip = THREE.AnimationClip.findByName(clips, clipName);

				clip.tracks.forEach((track) => {
					const [boneName, valueType] = track.name.split('.');
					if (valueType == 'quaternion') {
						if (boneName.includes('Thumb')) {
							if (!bones.THUMB[boneName]) {
								bones.THUMB[boneName] = {};
							}
							bones.THUMB[boneName][state] = [...track.values];
						} else if (boneName.includes('Index')) {
							if (!bones.INDEX[boneName]) {
								bones.INDEX[boneName] = {};
							}
							bones.INDEX[boneName][state] = [...track.values];
						} else if (
							boneName.includes('Middle') ||
							boneName.includes('Ring') ||
							boneName.includes('Pinky')
						) {
							if (!bones.HAND[boneName]) {
								bones.HAND[boneName] = {};
							}
							bones.HAND[boneName][state] = [...track.values];
						}
					}
				});
			});
			bonesData[mode] = bones;
		});

		console.log(JSON.stringify(bonesData));
	}

	onExecute() {}
}
