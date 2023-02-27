/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import {
	CurvedRay,
	RayComponent,
	StraightRay,
} from '../../components/RayComponents';

import { DynamicTubeGeometry } from '../../lib/objects/DynamicTubeGeometry';
import { RAY_CONSTANTS } from '../../Constants';
import { System } from 'ecsy';
import { THREEGlobalComponent } from '../../components/THREEGlobalComponent';
import { TextureLoader } from 'three';

export class RayDrawingSystem extends System {
	init() {
		this.canvas = document.createElement('CANVAS');
		this.canvas.width = RAY_CONSTANTS.RAY_TEXTURE_SIZE;
		this.canvas.height = RAY_CONSTANTS.RAY_TEXTURE_SIZE;

		this.textureLoader = new TextureLoader();
	}

	execute(_delta, _time) {
		const createRay = (segments, radiiFunc) => (entity) => {
			const rayComponent = entity.getMutableComponent(RayComponent);

			const rayMesh = new THREE.Mesh(
				new DynamicTubeGeometry(segments, radiiFunc, 8, false),
				new THREE.MeshStandardMaterial({
					transparent: true,
					metalness: 0.1,
					roughness: 0.7,
					map: new THREE.Texture(),
				}),
			);
			rayMesh.frustumCulled = false;
			rayMesh.receiveShadow = true;
			rayMesh.renderOrder = RAY_CONSTANTS.RENDER_ORDER;

			rayComponent.rayMesh = rayMesh;
			rayComponent.rayPath = new THREE.CatmullRomCurve3();

			this.queries.gameManager.results.forEach((entity) => {
				const scene = entity.getComponent(THREEGlobalComponent).scene;
				scene.add(rayMesh);
			});
		};

		this.queries.curvedRay.added.forEach(
			createRay(RAY_CONSTANTS.CURVED_RAY_SEGEMENTS, (_) => 0),
		);
		this.queries.straightRay.added.forEach(
			createRay(RAY_CONSTANTS.STRAIGHT_RAY_SEGEMENTS, (_) => 0),
		);

		const updateRayMesh = (entity) => {
			let rayComponent = entity.getComponent(RayComponent);
			let color = rayComponent.color;
			let rayGradientStart = rayComponent.rayGradientStart;
			let rayGradientOpaqueStart = rayComponent.rayGradientOpaqueStart;
			let rayGradientOpaqueEnd = rayComponent.rayGradientOpaqueEnd;
			let rayGradientEnd = rayComponent.rayGradientEnd;

			if (
				color != entity.prevColor ||
				rayGradientStart != entity.rayGradientStart ||
				rayGradientOpaqueStart != entity.rayGradientOpaqueStart ||
				rayGradientOpaqueEnd != entity.rayGradientOpaqueEnd ||
				rayGradientEnd != entity.rayGradientEnd
			) {
				let rayMesh = rayComponent.rayMesh;

				updateRayTexture(
					rayMesh,
					this.canvas,
					color,
					rayGradientOpaqueStart,
					rayGradientStart,
					rayGradientOpaqueEnd,
					rayGradientEnd,
					this.textureLoader,
				);

				entity.prevColor = color;

				entity.rayGradientStart = rayGradientStart;
				entity.rayGradientOpaqueStart = rayGradientOpaqueStart;
				entity.rayGradientEnd = rayGradientEnd;
				entity.rayGradientOpaqueEnd = rayGradientOpaqueEnd;
			}
		};

		const updateRay = (entity) => {
			let rayComponent = entity.getComponent(RayComponent);
			let raycaster = rayComponent.raycaster;
			let rayMesh = rayComponent.rayMesh;
			let rayPath = rayComponent.rayPath;
			let visible = rayComponent.visible;
			let opacity = rayComponent.opacity;

			rayMesh.visible = visible;
			if (visible) {
				// update ray position
				rayPath.points = raycaster.getPoints(true);

				// update ray appearance
				rayMesh.geometry.setFromPath(rayPath);
				rayMesh.geometry.setRenderedPortion(raycaster.renderedPortion);

				rayMesh.material.opacity = opacity;

				updateRayMesh(entity);
			}
		};

		this.queries.curvedRay.results.forEach(updateRay);
		this.queries.straightRay.results.forEach(updateRay);
	}
}

RayDrawingSystem.queries = {
	curvedRay: {
		components: [RayComponent, CurvedRay],
		listen: { added: true, removed: true },
	},
	straightRay: {
		components: [RayComponent, StraightRay],
		listen: { added: true, removed: true },
	},
	gameManager: {
		components: [THREEGlobalComponent],
	},
};

export const updateRayTexture = (
	rayMesh,
	canvas,
	color,
	rayGradientOpaqueStart,
	rayGradientStart,
	rayGradientOpaqueEnd,
	rayGradientEnd,
	textureLoader,
) => {
	const ctx = canvas.getContext('2d');

	ctx.clearRect(0, 0, canvas.width, canvas.height);

	var grd = ctx.createLinearGradient(0, 0, RAY_CONSTANTS.RAY_TEXTURE_SIZE, 0);

	let colorStringOpaque = '#' + color.toString(16) + 'ff';
	let colorStringTransparent = '#' + color.toString(16) + '00';

	if (rayGradientOpaqueStart > 0.0) {
		grd.addColorStop(0.0, colorStringTransparent);
		grd.addColorStop(rayGradientStart, colorStringTransparent);
		grd.addColorStop(rayGradientOpaqueStart, colorStringOpaque);
	} else {
		grd.addColorStop(0.0, colorStringOpaque);
	}

	if (rayGradientOpaqueEnd < 1.0) {
		grd.addColorStop(rayGradientOpaqueEnd, colorStringOpaque);
		grd.addColorStop(rayGradientEnd, colorStringTransparent);
		grd.addColorStop(1.0, colorStringTransparent);
	} else {
		grd.addColorStop(1.0, colorStringOpaque);
	}

	ctx.fillStyle = grd;
	ctx.fillRect(
		0,
		0,
		RAY_CONSTANTS.RAY_TEXTURE_SIZE,
		RAY_CONSTANTS.RAY_TEXTURE_SIZE,
	);

	textureLoader.load(canvas.toDataURL(), (texture) => {
		rayMesh.material.map = texture;
	});
};
