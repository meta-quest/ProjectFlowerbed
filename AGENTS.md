# Project Flowerbed Contributor Guide

This repository is a WebXR VR gardening showcase built on IWSDK. `src/index.ts`
creates the world from `virtual:iwsdk-project` and explicitly registers every
system; gameplay lives in `src/gardening/`, `src/camera/`, `src/world/`, and
`src/ui/`.

## IWSDK 1.1 project setup

`iwsdk.config.json` is the committed authority for the world, XR, render,
locomotion, scene, asset, and component settings. `vite.config.ts` only wires
`iwsdkDev()` plus build behavior (a relative `base` for GitHub Pages, and
copying the license files into `dist/`). Editing `iwsdk.config.json` restarts
Vite in place.

`public/scenes/main.iwsdk.scene.json` places the island props and the player
spawn; it was generated from the 2022 environment model by
`scripts/generate-flowerbed-scene.mjs`. The terrain, water, colliders, and the
walkable `LocomotionEnvironment` are built at runtime in
`src/world/island-system.ts`, and the landing page keeps **Start gardening**
disabled until `islandReady`, so the player never spawns before the floor
exists. Plants, photos, and easels are runtime-owned and saved to browser
storage, not the scene.

## Start Here

1. Run `npm ci`.
2. Run `npm run typecheck` before browser or XR testing.
3. Check `npx @iwsdk/cli dev status` before starting a server.
4. If no runtime is connected, run `npm run dev`.
5. Run `npm run check` and `npm run build` before a pull request.

UIKitML sources live in and are served directly from `public/ui/`. Game media
are under `public/flowerbed/` and registered in `src/assets.ts`; plant, sound,
and growth data are in `src/data/`.

## IWSDK Rules

- Keep all `@iwsdk/*` packages on the same exact version.
- Import Three.js runtime values and types from `@iwsdk/core`, never `three`.
  The only permitted direct Three.js import is a loader-only type that IWSDK
  does not export.
- Declare fixed assets in `src/assets.ts`; use `AssetManager` for dynamic
  assets. Do not instantiate Three.js loaders. (The island's water normal map
  and sky cube map are the documented exceptions in `island-system.ts`.)
- Create gameplay objects with `world.createTransformEntity`. Render-only
  helpers with no ECS state (ray tubes, target markers, bursts, the photo
  viewfinder) may be added to the scene directly.
- Use ECS queries instead of maintaining entity arrays in systems.
- Register every signal/query subscription in `cleanupFuncs`.
- Allocate reusable vectors, quaternions, matrices, raycasters, and hit arrays
  outside `update()`. Treat per-frame allocation as a bug.
- Use `.peek()` for signal reads in hot loops.
- Use `entity.dispose()` for resources the entity owns. When geometry or
  materials are shared (seeds, easels), call
  `entity.dispose({ disposeResources: false })` and free the owned parts
  explicitly.
- Use IWSDK's built-in locomotion (it runs in a worker); do not replace its
  systems. Reach LocomotionSystem internals only through
  `src/core/locomotion-bridge.ts`, and pause turning or teleporting only
  through `src/core/locomotion-holds.ts`.
- Skinned meshes that move every frame (the gloves) need their bone texture
  uploaded before the Quest multiview pass; see `HandsSystem.uploadBones`.
- `setValue` throws on vector fields; use `entity.getVectorView(...)`.

The world is configured for immersive VR with hand tracking, IWSDK locomotion
(worker, snap turn, comfort vignette, thumb microgestures for tracked hands),
distance grabbing for easels, and the Horizon spatial UI kit. Physics, scene
understanding, and environment raycasts are disabled. Do not enable a built-in feature without also adding its
required components and tests.

## Performance

The game holds 72 fps on Meta Quest 3 at `RENDER_SCALE = 1.25`
(`src/index.ts`). The island, props, and colliders have frozen world matrices
after load (`island-system.ts`); nothing under them may move or be reparented.
Development builds register on-device A/B switches from `src/debug/perf-knobs.ts`
and accept `?renderScale=`. Profile changes that add draw calls, shader
variants, or per-frame work on a headset.

## Agent Skills and Rules

Project skills live in `.agents/skills/`: `iwsdk-dev` (entry point for IWSDK
changes), `iwsdk-build-model`, `iwsdk-compose-scene`, `iwsdk-ui`, `iwsdk-ray`,
`iwsdk-debug`, and `iwsdk-native-xr-test`. File-scoped rules live in
`.cursor/rules/` and `.github/instructions/` (kept in sync), with additional
scoped guidance in `src/AGENTS.md`.

## Automation

Development builds expose `window.__flowerbed` (world, state, `spawnPlant`,
`teleport`) for agent and browser scripts. Production builds do not.

## Verification

Always typecheck before testing:

```bash
npm run typecheck
npm run test:run
npm run build
```

The editor render does not run application systems: verify anything a system
drives with a runtime screenshot, not an editor screenshot. Pose, hand, and
controller claims need an active XR session (`npx @iwsdk/cli xr status`). Test
both the IWER emulator and a Quest headset for changes involving hand tracking,
locomotion, or rendering cost.
