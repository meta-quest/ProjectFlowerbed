/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';
import './styles/index.css';
import './styles/about.css';
import './styles/overlay.css';

import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';

import {
	PlayerColliderComponent,
	PlayerStateComponent,
	createPlayerTransform,
} from './js/components/PlayerStateComponent';
import {
	acceleratedRaycast,
	computeBoundsTree,
	disposeBoundsTree,
} from 'three-mesh-bvh';
import {
	initializeCache,
	setupFetchWithCache,
} from './js/lib/caching/fetchWithCache';

import { CapsuleColliderComponent } from './js/components/ColliderComponents';
import { GameStateComponent } from './js/components/GameStateComponent';
import { LoopingAudioComponent } from './js/components/AudioComponents';
import { SessionComponent } from './js/components/SessionComponent';
import { THREEGlobalComponent } from './js/components/THREEGlobalComponent';
import { THREEJS_LAYERS } from './js/Constants';
import ThreeMeshUI from 'three-mesh-ui';
import { setupECSY } from './js/ECSYConfig';
import { setupRouter } from './js/LandingPage';

// need to load the pages before we load any 3D stuff
setupRouter();

const world = setupECSY();
const clock = new THREE.Clock();
let global_scene = null;
const AUDIT_MATRIX_UPDATES = false;

// three-mesh-bvh initialization
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

initializeCache()
	.then(() => {
		setupFetchWithCache();
		init();
	})
	.catch((e) => {
		console.warn(e);
		// no cache, but we should still initialize the rest of the experience
		init();
	});

function init() {
	let container = document.getElementById('scene-container');

	// set autoupdate to false! we'll set autoupdate on stuff that needs it, and manually update other things
	THREE.Object3D.DefaultMatrixAutoUpdate = false;

	let scene = new THREE.Scene();
	scene.background = null;

	global_scene = scene;

	let renderer = new THREE.WebGLRenderer({
		antialias: true,
		multiviewStereo: true,
		// precision: "mediump",
	});
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(container.offsetWidth, container.offsetHeight);
	renderer.outputEncoding = THREE.sRGBEncoding;
	renderer.xr.enabled = true;
	const xrCamera = renderer.xr.getCamera();
	xrCamera.matrixAutoUpdate = true;
	xrCamera.layers.enable(THREEJS_LAYERS.VIEWER_ONLY);
	renderer.debug.checkShaderErrors = false;
	renderer.domElement.style.width = '100%';
	renderer.domElement.style.height = '100%';

	renderer.setOpaqueSort((a, b) => {
		if (a.groupOrder !== b.groupOrder) {
			return a.groupOrder - b.groupOrder;
		} else if (a.renderOrder !== b.renderOrder) {
			return a.renderOrder - b.renderOrder;
		} else if (a.material.id !== b.material.id) {
			if (a.material.sort_z === b.material.sort_z) {
				return a.material.id - b.material.id;
			}
			return a.material.sort_z - b.material.sort_z;
		} else if (a.z !== b.z) {
			return a.z - b.z;
		} else {
			return a.id - b.id;
		}
	});

	// turn autoClear back on temporarily - requires a browser that has D38378146
	// or else this line causes a black screen
	// renderer.autoClear = false;
	container.appendChild(renderer.domElement);

	let camera = new THREE.PerspectiveCamera(
		50,
		container.offsetWidth / container.offsetHeight,
		0.1,
		800,
	);

	camera.position.set(0, 1.6, 0);
	camera.layers.enable(THREEJS_LAYERS.VIEWER_ONLY);
	camera.matrixAutoUpdate = true;

	let gameManager = world.createEntity();

	gameManager.addComponent(GameStateComponent, {
		allAssetsLoaded: false,
	});

	gameManager.addComponent(SessionComponent);

	gameManager.addComponent(THREEGlobalComponent, {
		renderer: renderer,
		scene: scene,
		camera: camera,
	});

	const player = world.createEntity();
	const playerHead = new THREE.Group();
	playerHead.frustumCulled = false;
	const viewerTransform = createPlayerTransform(scene, camera);
	viewerTransform.add(playerHead);
	player.addComponent(PlayerStateComponent, {
		viewerTransform: viewerTransform,
		playerHead: playerHead,
		expectedMovement: new THREE.Vector3(),
		deltaMovement: new THREE.Vector3(),
	});
	player.addComponent(PlayerColliderComponent, {
		velocity: new THREE.Vector3(),
		lastSlopeNormal: new THREE.Vector3(),
	});
	player.addComponent(CapsuleColliderComponent, {
		radius: 0.5,

		// this creates a capsule of height 2, since the line segment
		// of a capsule is the height of the cylinder portion, and we add the
		// two sphere halves on either end.
		lineSegment: new THREE.Line3(
			new THREE.Vector3(0, 0.5),
			new THREE.Vector3(0, 1.5, 0),
		),
	});

	const movieDiv = document.getElementById('splash-trailer');
	renderer.xr.addEventListener('sessionstart', function () {
		const xrSession = renderer.xr.getSession();

		let targetFrameRate = 72;
		if (xrSession.updateTargetFrameRate) {
			xrSession.updateTargetFrameRate(targetFrameRate);
			console.log('Frame rate updated to ' + targetFrameRate);
		} else {
			console.log('Update target frame not supported');
		}
	});

	window.addEventListener('experienceend', function () {
		gameManager.removeComponent(LoopingAudioComponent);
		movieDiv.play();
		document.body.style.overflow = 'auto';
	});

	window.addEventListener('experiencestart', function () {
		movieDiv.pause();

		// hide scrollbars on body
		document.body.style.overflow = 'hidden';
	});

	function onWindowResize() {
		camera.aspect = container.offsetWidth / container.offsetHeight;
		camera.updateProjectionMatrix();

		renderer.setSize(container.offsetWidth, container.offsetHeight);
	}

	window.addEventListener('resize', onWindowResize, false);
	window.goFullScreen = () => {
		const vw = Math.max(
			document.documentElement.clientWidth || 0,
			window.innerWidth || 0,
		);
		const vh = Math.max(
			document.documentElement.clientHeight || 0,
			window.innerHeight || 0,
		);

		camera.aspect = vw / vh;
		camera.updateProjectionMatrix();

		renderer.setSize(vw, vh);
	};

	renderer.setAnimationLoop(render);
}

function render() {
	// cap delta at 0.1 to avoid the player falling through the floor on big framerate gaps.
	// This is the solution that is used in three-mesh-bvh's physics example, and is good enough
	// to keep physics from making massive jumps as a result of slow frames.
	// However, this also means that the physics themselves will slow down during those slow frames.
	// TODO: implement a way to separate rendering and physics logic.
	// See https://gafferongames.com/post/fix_your_timestep/ for some principles around this.
	const delta = Math.min(clock.getDelta(), 0.1);
	const elapsedTime = clock.elapsedTime;

	if (AUDIT_MATRIX_UPDATES) {
		global_scene.traverse((node) => {
			node.numMatrixUpdates = 0;
		});

		THREE.Object3D.prototype.updateMatrix = function () {
			this.matrix.compose(this.position, this.quaternion, this.scale);
			this.matrixWorldNeedsUpdate = true;
			this.numMatrixUpdates += 1;
			if (this.numMatrixUpdates > 1) {
				console.log(`multi update!`);
			}
		};
	}

	world.execute(delta, elapsedTime);
	ThreeMeshUI.update();
	TWEEN.update();

	if (AUDIT_MATRIX_UPDATES) {
		let matrixUpdateCounts = [0, 0, 0, 0, 0, 0, 0];
		global_scene.traverse((node) => {
			if (node.numMatrixUpdates < matrixUpdateCounts.length) {
				matrixUpdateCounts[node.numMatrixUpdates] += 1;
			} else {
				matrixUpdateCounts[matrixUpdateCounts.length - 1] += 1;
			}
		});
		console.log(`matrix update counts: `);
		console.log(matrixUpdateCounts);
	}
}
