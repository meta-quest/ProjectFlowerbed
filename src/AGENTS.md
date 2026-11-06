# IWSDK scoped project guidance

This file augments the repository-root `AGENTS.md` for files in this directory.

## Layout

- `index.ts` creates the world and registers every system, in order.
- `assets.ts` and `components.ts` are the manifests shared with the editor.
- `core/` holds cross-cutting state and helpers: signals (`state.ts`),
  storage, audio, input and hands, colliders, tweens, the locomotion bridge.
- `gardening/`, `camera/`, `world/`, `ui/`, and `desktop/` hold the systems for
  each part of the game; `data/` holds static tables from the 2022 game.
- `components/` holds the ECS component declarations, free of system imports.
- `debug/` is loaded only in development builds.
- Unit tests sit next to the code as `*.test.ts`; shared fakes live in
  `test-utils/`.

# ECS API reference

## Field types

```
Types.Float32 Float64 Int8 Int16 Int32 Boolean String FilePath
Types.Vec2 Vec3 Vec4 Color(RGBA) Entity Enum
Types.Object   // avoid — not optimised
```

## Component

Declare in a system-free module, then list it in `src/components.ts` via
`defineComponents()` or the editor cannot author it.

```ts
export const MyComponent = createComponent('MyComponent', {
  speed: { type: Types.Float32, default: 1 },
  tint: { type: Types.Color, default: [1, 1, 1, 1] }, // RGBA
});
```

Optional metadata per field — `label`, `step`, `min`, `max`, `enum`, `help`,
`widget` — drives the editor inspector.

## System

```ts
export class MySystem extends createSystem(
  {
    items: { required: [MyComponent] },
    active: { required: [MyComponent], excluded: [Grabbed] },
  },
  { speed: { type: Types.Float32, default: 1 } }, // optional config
) {
  private temp!: Vector3;

  init() {
    this.temp = new Vector3();
    this.queries.items.subscribe('qualify', (entity) => { /* matched */ });
    this.cleanupFuncs.push(this.config.speed.subscribe((v) => { /* … */ }));
  }

  update(delta: number, time: number) {
    for (const entity of this.queries.active.entities) { /* no allocations */ }
  }
}
```

Queries take `required`, `excluded` and `where` (value predicates via `eq`, `ne`,
`lt`, `le`, `gt`, `ge`, `isin`, `nin`). `excluded` is the clean way to skip
entities in a transient state — e.g. excluding `Grabbed` so a held object is left
alone.

Register explicitly in `src/index.ts` with `world.registerSystem(MySystem)`.

Read fields with `entity.getValue(Component, 'field')`. For vector fields use
`entity.getVectorView(Component, 'field')` — it returns a `Float32Array` view with
no allocation, and `setValue` **throws** on vector fields in elics 3.4.x.

## Interaction components

`RayInteractable` plus `Hovered`/`Pressed` covers both mouse/touch canvas input
and XR rays. Grab components: `OneHandGrabbable` and `TwoHandsGrabbable` are
proximity-based and respond to **squeeze**, while `DistanceGrabbable` is
ray-based and responds to **trigger**. `Grabbed` is a transient tag managed by
`GrabSystem` — read it, never add or remove it. `GrabSystem.useHandPinchForGrab`
defaults to **true**, so a hand pinch grabs; set it to `false` to require squeeze.

`DistanceGrabbable` fields: `movementMode` (`MoveTowardsTarget`, `MoveFromTarget`,
`MoveAtSource`, `RotateAtSource`), `returnToOrigin`, `moveSpeedFactor`,
`detachOnGrab`, `translate`, `rotate`, `scale`, `targetPositionOffset`,
`targetQuaternionOffset`. `returnToOrigin: true` gives spring-back on release with
no custom code.

For a held object use `GrabSystem`'s public methods — `forceRelease(entity)`,
`getHolderHand(entity)` — never deep-import `Handle`.

## XR input

```ts
const pad = this.input.xr.gamepads.right;
pad?.getButtonDown(InputComponent.Trigger);   // just pressed
pad?.getAxesValues(InputComponent.Thumbstick);
this.player.head; this.player.raySpaces.left; this.player.gripSpaces.right;
```

Prefer `world.input.actions` for reusable intent (`locomotion.move`) over raw
buttons. Browser controls live at `world.input.keyboard` and
`world.input.browserGamepads`.

## Lifecycle

`world.visibilityState` reports `NonImmersive`, `Visible`, `VisibleBlurred` —
pause simulation on blur. `world.camera.position` is local to `world.player`; use
`getWorldPosition()` when logic needs the true viewer position.

# Asset manifest contract

`src/assets.ts` is imported **independently by the app runtime and the editor**,
in separate JS realms. It must therefore be deterministic and self-contained:

- no `World`, scene, iframe, editor object or DOM access
- no timers, no fetching ambient state
- no reliance on singleton object identity across realms
- prototypes immutable after registration, and never parented

A manifest entry is either a URL descriptor (`{ url, type, name?, priority? }`)
or a bare parentless `Object3D`. `AssetType` covers `GLTF`, `Audio`, `Texture`,
`HDRTexture`, `UIKitML`. Only glTF, UIKitML and `Object3D` entries are placeable
as scene content; audio/texture/HDR are for application systems.

Build public URLs from `import.meta.env.BASE_URL` so runtime, editor and subpath
builds resolve identically. A file in `public/` is **not** available to a scene
until it is registered here.

## Procedural assets

This project currently has no procedural assets. If one is added, export a
parentless `Object3D` from a system-free module and register it in
`src/assets.ts` under a stable ID. The registry rejects an already-parented
prototype.

Every placement is a distinct hierarchy clone, but **geometry and materials stay
shared**. Never dispose them from a placed clone; world teardown owns their
lifetime. Reassigning `mesh.material` on a clone is fine and is how you restyle
one instance — mutating the shared material in place changes every instance.

Bounds come from `Box3` over the instantiated asset and drive placement,
selection, framing and scatter collision. Put the origin where composition wants
it (usually floor contact, or the object's own pivot), keep transforms finite,
and don't let invisible helpers inflate bounds.

## Cost

Split tessellation by viewing distance rather than using one budget everywhere: a
close-range hero model and coarser display copies of the same form are two
prototypes from one factory function. Sphere/lathe segment counts dominate small
repeated detail more than people expect — check `renderStats.triangles` rather
than guessing.

Reuse material instances within a module. Prefer prefabs plus a deterministic
pattern for repetition; a pattern whose prefab resolves to a single component-free
mesh lowers to one `InstancedMesh`.

Start assets at `castShadow: false` and opt in only for grounded focal masses.
Don't build contact-shadow blob cards or `ShadowMaterial` catcher planes here: put
`ContactShadow` or `ShadowCatcher` node components on the scene nodes instead.
