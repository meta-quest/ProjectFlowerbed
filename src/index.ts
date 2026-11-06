/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Project Flowerbed on IWSDK: world bootstrap and system registration.
 */

import { PanelUISystem, Vector3, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { CameraSystem } from './camera/camera-system.js';
import { PhotoDisplaySystem } from './camera/photo-display-system.js';
import { audio } from './core/audio.js';
import { DesktopSystem } from './desktop/desktop-system.js';
import { ensureEmulator } from './desktop/emulator.js';
import { AttractCameraSystem, mountLanding } from './ui/landing.js';
import { updatePanels } from './ui/panels.js';
import { trackAssetLoading } from './ui/load-progress.js';
import * as state from './core/state.js';
import { Layer, collisionWorld } from './core/colliders.js';
import { teleportPlayer } from './core/locomotion-bridge.js';
import { GardenSystem } from './gardening/garden-system.js';
import { PlantSystem, spawnPlant } from './gardening/plant-system.js';
import { PlantingSystem } from './gardening/planting-system.js';
import { RemoveSystem } from './gardening/remove-system.js';
import { SeedboxSystem } from './gardening/seedbox-system.js';
import { WateringSystem } from './gardening/watering-system.js';
import { HudSystem } from './ui/hud-system.js';
import { SettingsSystem } from './ui/settings-system.js';
import { ToolDialSystem } from './ui/tool-dial-system.js';
import { TutorialSystem, tutorialStep } from './ui/tutorial-system.js';
import { AmbienceSystem } from './world/ambience-system.js';
import { FaunaSystem } from './world/fauna-system.js';
import { HandsSystem } from './world/hands-system.js';
import { IslandSystem } from './world/island-system.js';
import { FootstepsSystem } from './world/footsteps-system.js';
import { TimeOfDaySystem } from './world/time-of-day-system.js';
import { FeedbackSystem } from './ui/feedback-system.js';
import { PropBatchSystem } from './world/prop-batch-system.js';
import { FlowerbedTeleportSystem } from './world/teleport-system.js';
import { RibbonSystem } from './world/ribbon-system.js';

// Quest fires sessiongranted once while a VR link loads. When
// xr.launchOnSessionGranted is on (the IWSDK dev plugin enables it for
// native-XR-control sessions on a headset), IWSDK only starts listening inside
// World.create, which waits on the emulator check below. Catch the grant now
// and replay it once IWSDK is listening.
let sessionGranted = false;
navigator.xr?.addEventListener('sessiongranted', () => (sessionGranted = true), { once: true });

/**
 * XR render resolution relative to the headset's recommended size. On
 * Quest 3, 1.25 keeps every mode (a 100-plant garden, live viewfinder,
 * watering) at 72 fps with the GPU around 75% of its top clock; the camera
 * viewfinder starts dropping frames at 1.3. Development builds accept
 * ?renderScale= to compare values.
 */
const RENDER_SCALE = 1.25;
const renderScale =
  (import.meta.env.DEV && Number(new URLSearchParams(location.search).get('renderScale'))) || RENDER_SCALE;

trackAssetLoading();
await ensureEmulator();

const worldReady = World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions);
if (sessionGranted) navigator.xr?.dispatchEvent(new Event('sessiongranted'));

worldReady.then((world) => {
  // Read when the session starts; IWSDK has only requested it at this point.
  world.renderer.xr.setFramebufferScaleFactor(renderScale);
  // Tick only our visible panels instead of walking the scene for them. In
  // @iwsdk/core 1.1.0-rc.2 PanelUISystem.update only ticks documents (loading
  // is event-driven), so every panel must come from spawnPanel.
  const panelSystem = world.getSystem(PanelUISystem);
  if (panelSystem) panelSystem.update = (delta: number) => updatePanels(world, delta * 1000);
  mountLanding(world);
  audio.init(world.scene, world.player.head);
  // Debug and automation handle for dev builds (agent and browser scripts).
  if (import.meta.env.DEV) {
    (window as unknown as { __flowerbed: unknown }).__flowerbed = {
      world,
      state,
      tutorialStep,
      collisionWorld,
      Layer,
      spawnPlant,
      camera: () => world.getSystem(CameraSystem),
      teleport: (x: number, y: number, z: number) => teleportPlayer(world, new Vector3(x, y, z)),
    };
  }
  world
    .registerSystem(IslandSystem)
    .registerSystem(PropBatchSystem)
    .registerSystem(ToolDialSystem)
    .registerSystem(SeedboxSystem)
    .registerSystem(PlantingSystem)
    .registerSystem(WateringSystem)
    .registerSystem(RemoveSystem)
    .registerSystem(CameraSystem)
    .registerSystem(PhotoDisplaySystem)
    .registerSystem(PlantSystem)
    .registerSystem(GardenSystem)
    .registerSystem(FlowerbedTeleportSystem)
    .registerSystem(AmbienceSystem)
    .registerSystem(FaunaSystem)
    .registerSystem(SettingsSystem)
    .registerSystem(TutorialSystem)
    .registerSystem(HudSystem)
    .registerSystem(HandsSystem)
    .registerSystem(FootstepsSystem)
    .registerSystem(TimeOfDaySystem)
    .registerSystem(RibbonSystem)
    .registerSystem(FeedbackSystem)
    .registerSystem(DesktopSystem)
    .registerSystem(AttractCameraSystem);
  // On-device performance A/B switches (ecs set-component), dev builds only.
  if (import.meta.env.DEV) {
    void import('./debug/perf-knobs.js').then(({ PerfKnobs, PerfStats, PerfKnobsSystem }) =>
      world.registerComponent(PerfKnobs).registerComponent(PerfStats).registerSystem(PerfKnobsSystem),
    );
  }
}, showStartupError);

/** A failed start (no WebGL, blocked module) would otherwise leave the landing page loading forever. */
function showStartupError(error: unknown): void {
  console.error('[flowerbed] could not start', error);
  const label = document.getElementById('enter-label');
  if (label) label.textContent = 'Could not start the garden. Reload to try again.';
}
