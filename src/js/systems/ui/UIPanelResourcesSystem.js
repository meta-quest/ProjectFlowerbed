/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import {
	UIPanelComponent,
	UIPanelResources,
} from '../../components/UIPanelComponent';

import { AssetDatabaseComponent } from '../../components/AssetDatabaseComponent';
import { GazeFollowerComponent } from '../../components/GazeFollowerComponent';
import { IsActive } from '../../components/GameObjectTagComponents';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { getOnlyEntity } from '../../utils/entityUtils';

export class UIPanelResourcesSystem extends System {
	init() {
		this.threeGlobals = null;
		this.queries.gameManager.results.forEach((entity) => {
			this.threeGlobals = entity.getComponent(THREEGlobalComponent);
		});
	}

	execute() {
		const meshDatabase = getOnlyEntity(this.queries.assets).getComponent(
			AssetDatabaseComponent,
		).meshes;

		// for added panels, add them to the scene at the expected position
		this.queries.panels.added.forEach((entity) => {
			const panelComponent = entity.getComponent(UIPanelComponent);

			const panelObject = panelComponent.uiPanel;

			let panelBackground;
			let mediaSurface;

			if (panelComponent.backgroundMeshId) {
				panelBackground = meshDatabase.getMesh(panelComponent.backgroundMeshId);

				if (panelComponent.backgroundTextureURL) {
					const backgroundTexture = new THREE.TextureLoader().load(
						panelComponent.backgroundTextureURL,
					);
					backgroundTexture.flipY = false;
					const backgroundPanelTarget = panelBackground.getObjectByName(
						'PanelGraphic',
					);
					backgroundPanelTarget.traverse((node) => {
						if (!node.isMesh) {
							return;
						}
						node.material = node.material.clone();
						node.material.map = backgroundTexture;
					});
				}
				const mediaSurfaceTarget = panelBackground.getObjectByName('VideoMask');
				if (mediaSurfaceTarget) {
					mediaSurfaceTarget.traverse((node) => {
						if (node.isMesh) {
							mediaSurface = node;
						}
					});
				}

				panelObject.setBackgroundMesh(
					panelBackground,
					panelComponent.backgroundOffset,
				);
			}

			// create an additional resource component with the mesh
			// so that we keep a reference to it when we remove the UIPanel.
			entity.addComponent(UIPanelResources, {
				uiPanel: panelObject,
				uiBackground: panelBackground,
				mediaSurface,
			});
		});

		// we do these queries after handling input, because the listener to see if a component has
		// been added or removed runs in order for the same execution, but is lost by the next
		// frame.
		// see https://ecsy.io/docs/#/manual/Architecture?id=clearing-removal-queues
		this.queries.panels.removed.forEach((entity) => {
			const panelResources = entity.getComponent(UIPanelResources);
			const panelObject = panelResources.uiPanel;

			panelObject.removeFromSceneTree();

			if (panelResources.mediaElement) {
				// TODO: we set a media resource, so we need to get rid of the element and also
				// dispose of the custom created texture.
			}

			entity.removeComponent(UIPanelResources);
		});

		this.queries.visiblePanels.added.forEach((entity) => {
			const panelComponent = entity.getComponent(UIPanelComponent);
			const parent = panelComponent.parent ?? this.threeGlobals.scene;
			const panelObject = panelComponent.uiPanel;
			panelObject.addToSceneTree(parent);

			if (entity.hasComponent(GazeFollowerComponent)) {
				const gazeFollower = entity.getMutableComponent(GazeFollowerComponent);
				gazeFollower.shouldMoveImmediately = true;
			}
		});

		this.queries.visiblePanels.removed.forEach((entity) => {
			if (entity.hasComponent(UIPanelComponent)) {
				const panelComponent = entity.getComponent(UIPanelComponent);
				const panelObject = panelComponent.uiPanel;
				panelObject.removeFromSceneTree();
			}
		});
	}
}

UIPanelResourcesSystem.queries = {
	gameManager: {
		components: [THREEGlobalComponent],
	},
	panels: {
		components: [UIPanelComponent],
		listen: { added: true, removed: true },
	},
	visiblePanels: {
		components: [UIPanelComponent, IsActive],
		listen: { added: true, removed: true },
	},
	assets: {
		components: [AssetDatabaseComponent],
	},
};
