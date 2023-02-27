/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { CSMFrustum } from 'three/examples/jsm/csm/CSMFrustum.js';
import { WoodlandCSMShader } from './WoodlandCSMShader.js';

const _cameraToLightMatrix = new THREE.Matrix4();

const _lightSpaceFrustum = new CSMFrustum();

const _center = new THREE.Vector3();

const _bbox = new THREE.Box3();

export class WoodlandCSM extends CSM {
	constructor(data) {
		data = data || {};
		super(data);

		this.globalFinalCascade = data.globalFinalCascade || false;

		this.globalFinalCascadeBoundsMin = data.globalFinalCascadeBoundsMin || null;
		this.globalFinalCascadeBoundsMax = data.globalFinalCascadeBoundsMax || null;

		this.globalFinalCascadeSize = data.globalFinalCascadeSize || 0.0;

		// if we don't set the cascade size manually, get it from the bounds
		if (
			data.globalFinalCascadeBoundsMin &&
			data.globalFinalCascadeBoundsMax &&
			!this.globalFinalCascadeSize
		) {
			// this really should be projected into camera space to use the global shadowmap optimally
			this.globalFinalCascadeSize = data.globalFinalCascadeBoundsMax.distanceTo(
				data.globalFinalCascadeBoundsMin,
			);
		}

		this.globalFinalCascadeShadowMapSize =
			data.globalFinalCascadeShadowMapSize || this.shadowMapSize;

		this.staticOnly = false;

		this.materials = new Map();

		this.updateFrustums();
		this.lightColor = new THREE.Color(data.lightColor || 0xffffff);

		for (let i = 0; i < this.lights.length; i++) {
			const light = this.lights[i];
			light.name = `CSM_${i}`;
			light.color = this.lightColor;
			light.shadow.autoUpdate = false;
			light.shadow.needsUpdate = false;
			light.matrixAutoUpdate = true;
			light.shadow.matrixAutoUpdate = true;
			light.target.matrixAutoUpdate = true;

			if (this.globalFinalCascade && i == this.lights.length - 1) {
				light.shadow.mapSize.width = this.globalFinalCascadeShadowMapSize;
				light.shadow.mapSize.height = this.globalFinalCascadeShadowMapSize;
			}
		}
	}

	setCamera(newCamera, staticOnly, forceUpdate) {
		if (this.camera !== newCamera || this.staticOnly !== staticOnly) {
			this.camera = newCamera;
			this.staticOnly = staticOnly;

			this.updateFrustums();
			this.update(forceUpdate, staticOnly);
		}
	}

	updateShadowBounds() {
		const frustums = this.frustums;

		for (let i = 0; i < frustums.length; i++) {
			const light = this.lights[i];
			const shadowCam = light.shadow.camera;
			const frustum = this.frustums[i];
			let squaredBBWidth = this.globalFinalCascadeSize;

			if (!this.globalFinalCascade || i < frustums.length - 1) {
				// Get the two points that represent that furthest points on the frustum assuming
				// that's either the diagonal across the far plane or the diagonal across the whole
				// frustum itself.

				const nearVerts = frustum.vertices.near;
				const farVerts = frustum.vertices.far;
				const point1 = farVerts[0];
				let point2;

				if (point1.distanceTo(farVerts[2]) > point1.distanceTo(nearVerts[2])) {
					point2 = farVerts[2];
				} else {
					point2 = nearVerts[2];
				}

				squaredBBWidth = point1.distanceTo(point2);

				if (this.fade) {
					// expand the shadow extents by the fade margin if fade is enabled.
					const camera = this.camera;
					const far = Math.max(camera.far, this.maxFar);
					const linearDepth = frustum.vertices.far[0].z / (far - camera.near);
					const margin =
						0.25 * Math.pow(linearDepth, 2.0) * (far - camera.near);
					squaredBBWidth += margin;
				}
			}

			shadowCam.left = -squaredBBWidth / 2;
			shadowCam.right = squaredBBWidth / 2;
			shadowCam.top = squaredBBWidth / 2;
			shadowCam.bottom = -squaredBBWidth / 2;
			shadowCam.updateProjectionMatrix();
		}
	}

	updateUniforms() {
		if (this.materials) {
			this.materials.forEach(function (material, _uuid) {
				if (!material.defines) {
					material.defines = {};
				}

				if (!this.staticOnly && 'CSM_STATIC_ONLY' in material.defines) {
					delete material.defines.CSM_STATIC_ONLY;
					material.needsUpdate = true;
				} else if (
					this.staticOnly &&
					!('CSM_STATIC_ONLY' in material.defines)
				) {
					material.defines.CSM_STATIC_ONLY = '';
					material.needsUpdate = true;
				}

				if (!this.fade && 'CSM_FADE' in material.defines) {
					delete material.defines.CSM_FADE;
					material.needsUpdate = true;
				} else if (this.fade && !('CSM_FADE' in material.defines)) {
					material.defines.CSM_FADE = '';
					material.needsUpdate = true;
				}
			}, this);
		}
	}

	injectInclude() {
		THREE.ShaderChunk.lights_fragment_begin =
			WoodlandCSMShader.lights_fragment_begin;
		THREE.ShaderChunk.lights_pars_begin = WoodlandCSMShader.lights_pars_begin;
	}

	setupMaterial(material) {
		const breaksVec2 = [];
		const far = Math.min(this.camera.far, this.maxFar);
		this.getExtendedBreaks(breaksVec2);

		material.defines = material.defines || {};
		material.defines.USE_CSM = 1;
		material.defines.CSM_CASCADES = this.cascades;

		// hack a const array into the material by appending it (with a newline) below a standard define
		material.defines.CSM_CASCADE_BREAKS_DUMMY =
			`1\n` +
			`const vec2 CSM_CASCADE_BREAKS[${breaksVec2.length}] = vec2[${breaksVec2.length}](`;
		for (const i in breaksVec2) {
			const breakVec = breaksVec2[i];
			material.defines.CSM_CASCADE_BREAKS_DUMMY += `vec2(${breakVec.x},${breakVec.y})`;
			if (i < breaksVec2.length - 1) {
				material.defines.CSM_CASCADE_BREAKS_DUMMY += ',';
			}
		}
		material.defines.CSM_CASCADE_BREAKS_DUMMY += `);`;

		material.defines.CSM_CAMERA_NEAR = this.camera.near + 0.00001; // try to insure this emits as a float
		material.defines.CSM_SHADOW_FAR = far + 0.00001; // try to insure this emits as a float

		if (this.fade) {
			material.defines.CSM_FADE = '';
		}

		const materials = this.materials;
		materials.set(material.uuid, material);
	}

	getExtendedBreaks(target) {
		while (target.length < this.breaks.length) {
			target.push(new THREE.Vector2());
		}

		target.length = this.breaks.length;

		for (let i = 0; i < this.cascades; i++) {
			const amount = this.breaks[i];
			const prev = this.breaks[i - 1] || 0;
			target[i].x = prev;
			target[i].y = amount;
		}

		if (this.globalFinalCascade) {
			target[target.length - 1].y = 100000.0;
		}
	}

	update(updateGlobal, suppressLocal) {
		const camera = this.camera;
		const frustums = this.frustums;
		// camera.updateMatrixWorld( );

		for (let i = 0; i < frustums.length; i++) {
			const light = this.lights[i];
			light.updateMatrixWorld(true);
			const shadowCam = light.shadow.camera;
			shadowCam.matrixAutoUpdate = true;
			shadowCam.updateMatrixWorld();
			const texelWidth =
				(shadowCam.right - shadowCam.left) / this.shadowMapSize;
			const texelHeight =
				(shadowCam.top - shadowCam.bottom) / this.shadowMapSize;
			if (this.globalFinalCascade && i >= frustums.length - 1) {
				_center.x =
					(this.globalFinalCascadeBoundsMin.x +
						this.globalFinalCascadeBoundsMax.x) /
					2;
				_center.y =
					(this.globalFinalCascadeBoundsMin.y +
						this.globalFinalCascadeBoundsMax.y) /
					2;
				_center.z =
					(this.globalFinalCascadeBoundsMin.z +
						this.globalFinalCascadeBoundsMax.z) /
					2;
				light.shadow.needsUpdate = light.shadow.needsUpdate || updateGlobal;
			} else {
				light.shadow.needsUpdate = light.shadow.needsUpdate || !suppressLocal;

				_cameraToLightMatrix.multiplyMatrices(
					shadowCam.matrixWorldInverse,
					camera.matrixWorld,
				);

				frustums[i].toSpace(_cameraToLightMatrix, _lightSpaceFrustum);
				const nearVerts = _lightSpaceFrustum.vertices.near;
				const farVerts = _lightSpaceFrustum.vertices.far;

				_bbox.makeEmpty();

				for (let j = 0; j < 4; j++) {
					_bbox.expandByPoint(nearVerts[j]);
					_bbox.expandByPoint(farVerts[j]);
				}

				_bbox.getCenter(_center);

				_center.z = _bbox.max.z + this.lightMargin;
				_center.x = Math.floor(_center.x / texelWidth) * texelWidth;
				_center.y = Math.floor(_center.y / texelHeight) * texelHeight;

				_center.applyMatrix4(light.shadow.camera.matrixWorld);
			}

			light.position.copy(_center);
			light.position.x -= this.lightDirection.x * this.globalFinalCascadeSize;
			light.position.y -= this.lightDirection.y * this.globalFinalCascadeSize;
			light.position.z -= this.lightDirection.z * this.globalFinalCascadeSize;
			light.target.position.copy(_center);
			light.updateMatrixWorld(true);
		}
	}
}
