/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';
import { Not, System } from 'ecsy';
import {
	UIPanelComponent,
	UIPanelMedia,
	UIPanelResources,
} from '../../components/UIPanelComponent';

import { IsActive } from '../../components/GameObjectTagComponents';

export class UIPanelMediaSystem extends System {
	execute() {
		this.queries.uiPanelsWithoutMedia.added.forEach((entity) => {
			const uiResources = entity.getMutableComponent(UIPanelResources);
			const mediaSurface = uiResources.mediaSurface;

			if (mediaSurface) {
				mediaSurface.visible = false;
			}
		});

		this.queries.uiPanelsWithMedia.results.forEach((entity) => {
			const uiResources = entity.getMutableComponent(UIPanelResources);
			const backgroundObject = uiResources.uiBackground;
			const mediaSurface = uiResources.mediaSurface;

			if (!backgroundObject || !mediaSurface) {
				console.warn(
					'Tried to create media on a UI panel with no background, aborting.',
				);
				entity.removeComponent(UIPanelMedia);
				return;
			}

			const uiPanel = entity.getComponent(UIPanelComponent).uiPanel;

			if (mediaSurface.hasMedia) {
				// free up the old UI elements
				mediaSurface.material.dispose();
			}

			mediaSurface.visible = true;
			mediaSurface.hasMedia = true;

			const uiMedia = entity.getComponent(UIPanelMedia);

			if (uiMedia.isVideo) {
				// create an HTML video element
				const video = document.createElement('video');
				video.src = uiMedia.url;
				video.muted = true;
				video.playsInline = true;
				video.loop = true;
				video.hidden = true;
				document.body.appendChild(video);

				uiResources.mediaElement = video;

				uiPanel.addVideoElement(video);

				// create a VideoTexture with that video element
				const texture = new THREE.VideoTexture(video);
				texture.encoding = THREE.sRGBEncoding;
				texture.flipY = false;

				mediaSurface.material = new THREE.MeshBasicMaterial({
					map: texture,
				});

				// only play the video on creation if the panel is already visible.
				if (entity.hasComponent(IsActive)) {
					video.play();
				}
			} else {
				// TODO: don't create a new loader every time...
				const loader = new THREE.TextureLoader();
				loader.load(uiMedia.url, (texture) => {
					mediaSurface.material = new THREE.MeshBasicMaterial({
						map: texture,
					});
				});
			}

			entity.removeComponent(UIPanelMedia);
		});
	}

	_getMediaSurface(backgroundObject) {
		const mediaSurfaceTarget = backgroundObject.getObjectByName('VideoMask001');

		let mediaSurface;
		mediaSurfaceTarget.traverse((node) => {
			if (node.isMesh) {
				mediaSurface = node;
			}
		});

		return mediaSurface;
	}
}

UIPanelMediaSystem.queries = {
	uiPanelsWithoutMedia: {
		components: [UIPanelComponent, Not(UIPanelMedia)],
		listen: { added: true },
	},
	uiPanelsWithMedia: {
		components: [UIPanelComponent, UIPanelMedia],
	},
};
