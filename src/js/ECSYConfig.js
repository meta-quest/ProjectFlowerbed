/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
	AerialFaunaGroupComponent,
	AerialFaunaMovementComponent,
	WaterFaunaGroupComponent,
	WaterFaunaMovementComponent,
} from './components/FaunaComponents';
import {
	CapsuleColliderComponent,
	CollisionAreaComponent,
	CollisionWorldComponent,
	StaticColliderComponent,
	StaticColliderResources,
} from './components/ColliderComponents';
import {
	ControlsPanelComponent,
	SettingsComponent,
	SettingsPanelComponent,
} from './components/SettingsComponent';
import {
	CurvedRay,
	RayComponent,
	ShortRay,
	StraightRay,
} from './components/RayComponents';
import {
	EnvironmentProp,
	Hovered,
	IsActive,
	Light,
	MainEnvironment,
	Pressed,
} from './components/GameObjectTagComponents';
import {
	InstancedMeshComponent,
	InstancedMeshInstanceComponent,
} from './components/InstancedMeshComponent';
import {
	LoopingAudioComponent,
	LoopingAudioResources,
	OneshotAudioComponent,
	PlaylistAudioComponent,
	PlaylistAudioResources,
} from './components/AudioComponents';
import {
	MorphTargetAnimationComponent,
	MorphTargetMeshInitialized,
} from './components/MorphTargetAnimationComponent';
import {
	NUXMovementTriggerArea,
	NUXPanelComponent,
	NUXStateComponent,
} from './components/NUXStateComponent';
import {
	PhotoComponent,
	PhotoMenuComponent,
	ScreenshotCameraComponent,
} from './components/ScreenshotCameraComponent';
import {
	PickedPlantComponent,
	PlantGrowingComponent,
	PlantShrinkingComponent,
	PlantTinyColliderComponent,
	PlantedComponent,
	PlantingStateComponent,
	SeedAnimationComponent,
} from './components/PlantingComponents';
import {
	PlayerColliderComponent,
	PlayerStateComponent,
} from './components/PlayerStateComponent';
import {
	SeedComponent,
	SeedbagComponent,
	SeedboxButtonComponent,
	SeedboxComponent,
} from './components/SeedboxComponents';
import {
	UIPanelComponent,
	UIPanelMedia,
	UIPanelResources,
} from './components/UIPanelComponent';

import { AerialFaunaCreationSystem } from './systems/fauna/AerialFaunaCreationSystem';
import { AerialFaunaMovementSystem } from './systems/fauna/AerialFaunaMovementSystem';
import { AmbientSoundCreationSystem } from './systems/audio/AmbientSoundCreationSystem';
import { AssetDatabaseComponent } from './components/AssetDatabaseComponent';
import { AssetLoadingSystem } from './systems/assets/AssetLoadingSystem';
import { AudioSystem } from './systems/audio/AudioSystem';
import { BootstrapSessionSystem } from './systems/core/BootstrapSessionSystem';
import { CameraHandContextualNUXSystem } from './systems/hands/CameraHandContextualNUXSystem';
import { CameraPhotoGrabTooltipSystem } from './systems/ui/progressiveTooltips/CameraPhotoGrabTooltipSystem';
import { CollisionAreaSystem } from './systems/collisions/CollisionAreaSystems';
import { CollisionWorldSystem } from './systems/collisions/CollisionSystem';
import { ControlsPanelSystem } from './systems/settings/ControlsPanelSystem';
import { DEBUG_CONSTANTS } from './Constants';
import { DebugClearFlagsSystem } from './systems/landing-page/DebugClearFlagsSystem';
import { EnterVRTransitionSystem } from './systems/locomotion/EnterVRTransitionSystem';
import { FaunaAnimationComponent } from './components/FaunaAnimationComponent';
import { FaunaAnimationSystem } from './systems/fauna/FaunaAnimationSystem';
import { FaunaClusterComponent } from './components/FaunaClusterComponent';
import { FaunaColliderComponent } from './components/FaunaColliderComponent';
import { FaunaCreationSystem } from './systems/fauna/FaunaCreationSystem';
import { FaunaMovementBoundSamplerSystem } from './devTools/FaunaMovementBoundSamplerSystem';
import { GameStateComponent } from './components/GameStateComponent';
import { GameStateUpdateSystem } from './systems/core/GameStateUpdateSystem';
import { GardenManagementSystem } from './systems/landing-page/GardenManagementSystem';
import { GazeFollowSystem } from './systems/ui/GazeFollowSystem';
import { GazeFollowerComponent } from './components/GazeFollowerComponent';
import { HandAnimationSystem } from './systems/hands/HandAnimationSystem';
import { HandCreationSystem } from './systems/hands/HandCreationSystem';
import { HandNUXSystem } from './systems/hands/HandNUXSystem';
import { HandPoseExtractionSystem } from './devTools/HandPoseExtractorSystem';
import { IndicatorRingComponent } from './components/IndicatorRingComponent';
import { IndicatorRingSystem } from './systems/ui/IndicatorRingSystem';
import { JoystickMovementSystem } from './systems/locomotion/JoystickMovementSystem';
import { LoadingScreenComponent } from './components/LoadingScreenComponent';
import { LoadingScreenSystem } from './systems/landing-page/LoadingScreenSystem';
import { LocalSaveDataSystem } from './systems/saveLoad/SaveDataSystem';
import { LocomotionVignetteSystem } from './systems/locomotion/LocomotionVignetteSystem';
import { MeshIdComponent } from './components/AssetReplacementComponents';
import { MeshInstancingSystem } from './systems/mesh/MeshInstancingSystem';
import { MeshPreviewObject } from './components/MeshPreviewObjectComponent';
import { ModelOptimizeSystem } from './systems/mesh/ModelOptimizeSystem';
import { MorphTargetAnimationSystem } from './systems/fauna/MorphTargetAnimationSystem';
import { MovableFaunaComponent } from './components/MovableFaunaComponent';
import { MovableFaunaSystem } from './systems/fauna/MovableFaunaSystem';
import { MusicSystem } from './systems/audio/MusicSystem';
import { NUXCreationSystem } from './systems/ui/NUXCreationSystem';
import { NUXSystem } from './systems/ui/NUXSystem';
import { Object3DComponent } from './components/Object3DComponent';
import { ObjectFollowSystem } from './systems/ui/ObjectFollowSystem';
import { ObjectFollowerComponent } from './components/ObjectFollowerComponent';
import { OptimizedModelComponent } from './components/OptimizedModelComponent';
import { PerformanceOptionsComponent } from './components/PerformanceOptionsComponent';
import { PerformanceTestSystem } from './systems/performance/PerformanceTestSystem';
import { PhotoAutoDeleteSystem } from './systems/camera/PhotoAutoDeleteSystem';
import { PhotoMenuCreationSystem } from './systems/camera/PhotoMenuCreationSystem';
import { PhotoSystem } from './systems/camera/PhotoSystem';
import { PlantColliderSystem } from './systems/plants/PlantColliderSystem';
import { PlantGrowingSystem } from './systems/plants/PlantGrowingSystem';
import { PlantPickingSystem } from './systems/plants/PlantPickingSystem';
import { PlantShrinkingSystem } from './systems/plants/PlantShrinkingSystem';
import { PlantingArrowSystem } from './systems/plants/PlantingArrowSystem';
import { PlantingSystem } from './systems/plants/PlantingSystem';
import { PlayerPhysicsSystem } from './systems/core/PlayerPhysicsSystem';
import { PlaylistAudioSystem } from './systems/audio/PlaylistAudioSystem';
import { PropsCalibrationSystem } from './devTools/PropsCalibrationSystem';
import { RayDrawingSystem } from './systems/raycasting/RayDrawingSystem';
import { RaycastSystem } from './systems/raycasting/RaycastSystem';
import { RenderingSystem } from './systems/core/RenderingSystem';
import { ResetNUXSystem } from './systems/ui/ResetNUXSystem';
import { SavableObject } from './components/SaveDataComponents';
import { SaveControllerSystem } from './systems/saveLoad/SaveControllerSystem';
import { SceneCreationSystem } from './systems/core/SceneCreationSystem';
import { SceneLightingComponent } from './components/SceneLightingComponent';
import { ScreenshotCameraCreationSystem } from './systems/camera/ScreenshotCameraCreationSystem';
import { ScreenshotCameraSystem } from './systems/camera/ScreenshotCameraSystem';
import { SeedAnimationSystem } from './systems/plants/SeedAnimationSystem';
import { SeedboxChangePageTooltipSystem } from './systems/ui/progressiveTooltips/SeedboxChangePageTooltipSystem';
import { SeedboxCreationSystem } from './systems/seedbox/SeedboxCreationSystem';
import { SeedboxFocusDetectionSystem } from './systems/seedbox/SeedboxFocusDetectionSystem';
import { SeedboxHandContextualNUXSystem } from './systems/hands/SeedboxHandContextualNUXSystem';
import { SeedboxSystem } from './systems/seedbox/SeedboxSystem';
import { SelectionWheelComponent } from './components/SelectionWheelComponent';
import { SelectionWheelCreationSystem } from './systems/selectionWheels/SelectionWheelCreationSystem';
import { SelectionWheelSystem } from './systems/selectionWheels/SelectionWheelSystem';
import { SessionComponent } from './components/SessionComponent';
import { SettingsCreationSystem } from './systems/settings/SettingsCreationSystem';
import { SettingsSystem } from './systems/settings/SettingsSystem';
import { SkeletonAnimationComponent } from './components/SkeletonAnimationComponent';
import { SnapTurnSystem } from './systems/locomotion/SnapTurnSystem';
import { StationaryFaunaComponent } from './components/StationaryFaunaComponent';
import { StationaryFaunaSystem } from './systems/fauna/StationaryFaunaSystem';
import { THREEGlobalComponent } from './components/THREEGlobalComponent';
import { TeleportationSystem } from './systems/locomotion/TeleportationSystem';
import { UIPanelInteractionSystem } from './systems/ui/UIPanelInteractionSystem';
import { UIPanelMediaSystem } from './systems/ui/UIPanelMediaSystem';
import { UIPanelPreviewSystem } from './systems/ui/UIPanelPreviewSystem';
import { UIPanelResourcesSystem } from './systems/ui/UIPanelResourcesSystem';
import { UserIdentityComponent } from './components/UserIdentityComponent';
import { VrControllerComponent } from './components/VrControllerComponent';
import { VrInputSystem } from './systems/core/VrInputSystem';
import { WaterFaunaCreationSystem } from './systems/fauna/WaterFaunaCreationSystem';
import { WaterFaunaMovementSystem } from './systems/fauna/WaterFaunaMovementSystem';
import { WateringSystem } from './systems/plants/WateringSystem';
import { World } from 'ecsy';

const ENABLE_HAND_POSER = false;

export const setupECSY = () => {
	let world = new World();

	registerTagComponents(world);

	registerComponents(world);

	registerSystems(world);

	return world;
};

/**
 * Register TagComponents
 * @param {World} world
 */
const registerTagComponents = (world) => {
	world.registerComponent(Light);
	world.registerComponent(Hovered);
	world.registerComponent(Pressed);
	world.registerComponent(IsActive);
	world.registerComponent(StraightRay);
	world.registerComponent(ShortRay);
	world.registerComponent(CurvedRay);
	world.registerComponent(MainEnvironment);
	world.registerComponent(EnvironmentProp);
	world.registerComponent(MorphTargetMeshInitialized);
};

/**
 * Regitser normal components
 * @param {World} world
 */
const registerComponents = (world) => {
	world.registerComponent(VrControllerComponent);
	world.registerComponent(Object3DComponent);
	world.registerComponent(GameStateComponent);
	world.registerComponent(PlayerStateComponent);
	world.registerComponent(OptimizedModelComponent);
	world.registerComponent(PerformanceOptionsComponent);
	world.registerComponent(THREEGlobalComponent);
	world.registerComponent(SeedComponent);
	world.registerComponent(CollisionWorldComponent);
	world.registerComponent(StaticColliderComponent);
	world.registerComponent(StaticColliderResources);
	world.registerComponent(CapsuleColliderComponent);
	world.registerComponent(PlayerColliderComponent);
	world.registerComponent(SeedboxComponent);
	world.registerComponent(SeedboxButtonComponent);
	world.registerComponent(GazeFollowerComponent);
	world.registerComponent(ObjectFollowerComponent);
	world.registerComponent(UIPanelComponent);
	world.registerComponent(UIPanelResources);
	world.registerComponent(UIPanelMedia);
	world.registerComponent(NUXStateComponent);
	world.registerComponent(NUXPanelComponent);
	world.registerComponent(RayComponent);
	world.registerComponent(IndicatorRingComponent);
	world.registerComponent(PlantedComponent);
	world.registerComponent(PickedPlantComponent);
	world.registerComponent(SavableObject);
	world.registerComponent(CollisionAreaComponent);
	world.registerComponent(NUXMovementTriggerArea);
	world.registerComponent(ScreenshotCameraComponent);
	world.registerComponent(PhotoComponent);
	world.registerComponent(PhotoMenuComponent);
	world.registerComponent(AssetDatabaseComponent);
	world.registerComponent(MeshIdComponent);
	world.registerComponent(SelectionWheelComponent);
	world.registerComponent(OneshotAudioComponent);
	world.registerComponent(PlantGrowingComponent);
	world.registerComponent(PlantShrinkingComponent);
	world.registerComponent(PlantingStateComponent);
	world.registerComponent(LoopingAudioComponent);
	world.registerComponent(LoopingAudioResources);
	world.registerComponent(PlaylistAudioComponent);
	world.registerComponent(PlaylistAudioResources);
	world.registerComponent(PlantTinyColliderComponent);
	world.registerComponent(SeedAnimationComponent);
	world.registerComponent(SeedbagComponent);
	world.registerComponent(InstancedMeshComponent);
	world.registerComponent(InstancedMeshInstanceComponent);
	world.registerComponent(FaunaClusterComponent);
	world.registerComponent(FaunaColliderComponent);
	world.registerComponent(FaunaAnimationComponent);
	world.registerComponent(MorphTargetAnimationComponent);
	world.registerComponent(SkeletonAnimationComponent);
	world.registerComponent(MovableFaunaComponent);
	world.registerComponent(StationaryFaunaComponent);
	world.registerComponent(MeshPreviewObject);
	world.registerComponent(SceneLightingComponent, false); // disable component pooling so we can setup on construction
	world.registerComponent(LoadingScreenComponent);
	world.registerComponent(UserIdentityComponent);
	world.registerComponent(WaterFaunaMovementComponent);
	world.registerComponent(WaterFaunaGroupComponent);
	world.registerComponent(SettingsPanelComponent);
	world.registerComponent(ControlsPanelComponent);
	world.registerComponent(SettingsComponent);
	world.registerComponent(AerialFaunaMovementComponent);
	world.registerComponent(AerialFaunaGroupComponent);
	world.registerComponent(SessionComponent);
};

/**
 * Register the systems that need to run on startup in the world.
 * These include anything that interacts with the 2D landing page, or
 * any code that needs to setup THREE.JS before assets are loaded.
 * @param {World} world
 */
const registerSystems = (world) => {
	world.registerSystem(GardenManagementSystem);
	// the AssetLoadingSystem calls `registerSystemsAfterLoad` once all assets
	// have finished loading.
	world.registerSystem(AssetLoadingSystem, { priority: -10 });

	// loading screen is calculated after we spin up asset loading, before everything else
	world.registerSystem(LoadingScreenSystem, { priority: -9 });

	// allows for resetting the NUX before loading
	world.registerSystem(DebugClearFlagsSystem);
	world.registerSystem(ResetNUXSystem);

	// rendering should happen after all the logic of the frame has been calculated.
	world.registerSystem(RenderingSystem, { priority: 99 });
};

/**
 * Systems that don't need to run until after we've loaded in the assets
 * should be defined here. Most gameplay systems fall into this category.
 * @param {World} world
 */
export const registerSystemsAfterLoad = (world) => {
	// collisions and other level-altering systems rely on scene creation
	// running first.
	world.registerSystem(SceneCreationSystem, { priority: -2 });

	// model optimization processing needs to happen before calculating
	// collisions
	world.registerSystem(ModelOptimizeSystem, { priority: -1 });
	world.registerSystem(BootstrapSessionSystem);

	// the UI systems need to come before any systems that create UI panels.
	world.registerSystem(UIPanelResourcesSystem);
	world.registerSystem(UIPanelInteractionSystem);
	world.registerSystem(UIPanelMediaSystem);

	world.registerSystem(HandCreationSystem);
	world.registerSystem(EnterVRTransitionSystem);
	world.registerSystem(ScreenshotCameraCreationSystem);
	world.registerSystem(PhotoMenuCreationSystem);
	world.registerSystem(SelectionWheelCreationSystem);
	world.registerSystem(SeedboxCreationSystem);
	world.registerSystem(CollisionWorldSystem);
	world.registerSystem(CollisionAreaSystem);
	world.registerSystem(VrInputSystem);
	world.registerSystem(HandAnimationSystem);

	world.registerSystem(PlayerPhysicsSystem);
	world.registerSystem(WateringSystem); // needs to be executed before RaycastSystem to update water ray in time

	// Raycast system sets up rays based on controller inputs -- needs to happen after controller movement, but before
	// any of the systems that use raycasting. This way, we set the ray (which clears out renderedPoints), then use the ray
	// (which may generate rendered points), then render the ray
	world.registerSystem(RaycastSystem);

	// GameStateUpdateSystem resets the interactionModeOverridden flag every frame
	// It needs to be executed before mode selection and teleportaion
	world.registerSystem(GameStateUpdateSystem);
	world.registerSystem(SelectionWheelSystem);
	world.registerSystem(IndicatorRingSystem);
	world.registerSystem(SnapTurnSystem);
	world.registerSystem(TeleportationSystem);
	world.registerSystem(HandNUXSystem);
	world.registerSystem(SeedboxHandContextualNUXSystem);
	world.registerSystem(CameraHandContextualNUXSystem);
	world.registerSystem(JoystickMovementSystem);
	if (ENABLE_HAND_POSER) {
		// hand poser and keyboard movement are using the same keys, enable only one
		world.registerSystem(HandPoseExtractionSystem);
	}

	world.registerSystem(GazeFollowSystem);
	world.registerSystem(ObjectFollowSystem);
	world.registerSystem(NUXCreationSystem);
	world.registerSystem(SettingsCreationSystem);

	world.registerSystem(SettingsSystem);
	world.registerSystem(ControlsPanelSystem);

	// plant picking system executes before planting system as it controls the
	// entry and exit of planting mode
	world.registerSystem(ScreenshotCameraSystem);
	world.registerSystem(PhotoSystem);
	world.registerSystem(PhotoAutoDeleteSystem);
	world.registerSystem(PlantPickingSystem);
	world.registerSystem(SeedboxFocusDetectionSystem);
	world.registerSystem(SeedboxSystem);
	world.registerSystem(PlantingSystem);
	world.registerSystem(PlantingArrowSystem);
	world.registerSystem(SeedAnimationSystem);
	world.registerSystem(PlantGrowingSystem);
	world.registerSystem(PlantShrinkingSystem);
	world.registerSystem(PlantColliderSystem);
	world.registerSystem(SaveControllerSystem);
	world.registerSystem(RayDrawingSystem);
	world.registerSystem(LocalSaveDataSystem);
	world.registerSystem(WaterFaunaCreationSystem);
	world.registerSystem(WaterFaunaMovementSystem);
	world.registerSystem(AerialFaunaCreationSystem);
	world.registerSystem(AerialFaunaMovementSystem);
	world.registerSystem(FaunaAnimationSystem);
	world.registerSystem(FaunaCreationSystem);
	world.registerSystem(MovableFaunaSystem);
	world.registerSystem(FaunaMovementBoundSamplerSystem);
	world.registerSystem(StationaryFaunaSystem);
	world.registerSystem(MorphTargetAnimationSystem);
	world.registerSystem(PerformanceTestSystem);
	world.registerSystem(LocomotionVignetteSystem);
	if (ENABLE_HAND_POSER) {
		world.registerSystem(PropsCalibrationSystem);
	}
	// add this near the end so it can properly collect removed instances
	world.registerSystem(MeshInstancingSystem);
};

/**
 * Systems that should only be initialized after the player is ready to move
 * (e.g. programs and materials compiled) go here.
 * Audio, notably, goes here.
 * @param {World} world
 */
export const registerSystemsAfterReady = (world) => {
	// needs to be registered after first person mouselook
	// so that the pointerlock component is created.

	world.registerSystem(AudioSystem);

	world.registerSystem(AmbientSoundCreationSystem);
	world.registerSystem(MusicSystem);
	world.registerSystem(PlaylistAudioSystem);

	// NUX system needs to be after gaze follow system until the xrCamera position is no longer
	// behind a frame, otherwise the NUX won't 'snap' to the camera properly upon entering XR.
	world.registerSystem(NUXSystem);

	world.registerSystem(SeedboxChangePageTooltipSystem);
	world.registerSystem(CameraPhotoGrabTooltipSystem);

	if (DEBUG_CONSTANTS.ENABLE_UI_PREVIEW_SYSTEM) {
		world.registerSystem(UIPanelPreviewSystem);
	}
};
