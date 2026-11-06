/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Prepares the authored island once the level has loaded:
 *
 * 1. applies the legacy material overrides (water, sky, mountains, sand,
 *    matte foliage) with one replacement per source material;
 * 2. pulls every authored collider mesh out of the render graph, tags it
 *    with its legacy layers for gameplay raycasts, and hands a baked copy to
 *    IWSDK locomotion as walkable/blocking geometry;
 * 3. hides navigation helpers and exposes the named anchors (SFX emitters,
 *    fauna regions) to other systems;
 * 4. animates water flow and keeps the static sun shadow fresh on demand.
 */

import {
  CubeTextureLoader,
  DirectionalLight,
  Group,
  LocomotionEnvironment,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  createSystem,
  type Material,
} from '@iwsdk/core';
import { Layer, collisionWorld } from '../core/colliders.js';
import { PLANT_SHADOW_LAYER } from '../gardening/plant-meshes.js';
import { createGroundCover, groundCoverTime, updateGroundCover } from './ground-cover.js';
import { mergeStaticMeshes } from './merge.js';
import {
  createSkyMaterial,
  createUnderwaterMaterial,
  createWaterMaterial,
  makeFullRough,
  patchMatteFog,
  toLambert,
  type WaterMaterial,
} from './materials.js';
import { islandReady, requestShadowUpdate, shadowRequests, toolEnvMap } from './island-state.js';

/** Props whose glTF has no collider node; the legacy app used the visual mesh. */
const VISUAL_COLLIDER_PROPS = /fountain/i;

const asset = (path: string) => `${import.meta.env.BASE_URL}flowerbed/${path}`;

export class IslandSystem extends createSystem({}) {
  private ready = false;
  private waterMaterials: WaterMaterial[] = [];
  private overrides = new Map<string, Material>();
  private sun: DirectionalLight | null = null;
  private shadowTimer = 0;
  private viewer = new Vector3();
  private lastShadowRequest = 0;

  override update(delta: number): void {
    if (!this.ready) {
      const island = this.world.getSceneObject('island');
      if (island && island.children.length > 0) this.prepare(island);
      return;
    }
    groundCoverTime.value += delta;
    updateGroundCover(this.world.camera.getWorldPosition(this.viewer));
    for (const material of this.waterMaterials) {
      material.userData.wave.x += material.userData.flowSpeed * delta;
    }
    this.updateShadow(delta);
  }

  private prepare(island: Object3D): void {
    this.ready = true;
    // The asset manifest has no cube-map type, and both textures are only
    // sampled by the island's own shaders, so they load directly here.
    const loader = new TextureLoader();
    const waterNormal = loader.load(asset('images/voronoi_normal_1.png'));
    const envMap = new CubeTextureLoader()
      .setPath(asset('images/cloud_env_cube/'))
      .load(['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']);
    envMap.colorSpace = SRGBColorSpace;
    toolEnvMap.value = envMap;

    const roots: Object3D[] = [island];
    const props = this.world.getSceneObject('island-props');
    props?.children.forEach((child) => roots.push(child));
    this.scene.updateMatrixWorld(true);
    const colliderGroup = new Group();
    colliderGroup.name = 'flowerbed-locomotion-colliders';

    for (const root of roots) {
      const isProp = root !== island;
      const isSky = /sky/i.test(root.name);
      const colliders: Mesh[] = [];
      root.traverse((node) => {
        const mesh = node as Mesh;
        if (node.userData?.collider || this.hasColliderAncestor(node)) {
          if (mesh.isMesh) colliders.push(mesh);
          return;
        }
        if (!mesh.isMesh) return;
        this.overrideMaterial(mesh, waterNormal, envMap, !isProp);
      });
      if (isProp && colliders.length === 0 && VISUAL_COLLIDER_PROPS.test(root.name)) {
        root.traverse((node) => {
          if ((node as Mesh).isMesh) colliders.push(this.cloneAsCollider(node as Mesh));
        });
      }
      if (isSky) continue;
      for (const collider of colliders) {
        const layers = this.layersFor(collider);
        collider.visible = false;
        collider.castShadow = false;
        collider.receiveShadow = false;
        collider.updateMatrixWorld(true);
        // Gameplay copy, detached from the render graph.
        const gameplay = new Mesh(collider.geometry);
        gameplay.name = collider.name;
        gameplay.matrixAutoUpdate = false;
        gameplay.matrix.copy(collider.matrixWorld);
        gameplay.matrixWorld.copy(collider.matrixWorld);
        gameplay.userData = { ...collider.userData };
        collisionWorld.add(gameplay, layers);
        // Locomotion copy: every static collider blocks or supports the player.
        const walk = new Mesh(collider.geometry);
        walk.name = collider.name;
        walk.visible = false;
        collider.matrixWorld.decompose(walk.position, walk.quaternion, walk.scale);
        colliderGroup.add(walk);
        collider.removeFromParent();
      }
    }

    for (const name of ['PondBoundingRegion', 'RiverBoundingRegion']) {
      const helper = island.getObjectByName(name);
      if (helper) helper.visible = false;
    }

    // Ground cover on the lawns, then merge static island meshes by material
    // (the draw calls saved pay for the tufts several times over).
    const lawns: Mesh[] = [];
    island.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh && mesh.visible && /Landscape_Grass/i.test((mesh.material as Material).name ?? '')) {
        lawns.push(mesh);
      }
    });
    createGroundCover(lawns, island);
    mergeStaticMeshes(island, island);

    // The walkable floor is added here rather than in the scene JSON because the
    // colliders come from the loaded island. The landing page keeps Enter
    // disabled until islandReady, so no one spawns before the floor exists.
    const locomotionEntity = this.world.createTransformEntity(colliderGroup);
    locomotionEntity.addComponent(LocomotionEnvironment, { type: 'static' });

    this.scene.traverse((node) => {
      if ((node as DirectionalLight).isDirectionalLight) {
        this.sun = node as DirectionalLight;
      }
    });
    if (this.sun) {
      this.sun.shadow.autoUpdate = false;
      this.sun.shadow.needsUpdate = true;
      // Plants cast from their full (unculled) instance set on this layer.
      this.sun.shadow.camera.layers.enable(PLANT_SHADOW_LAYER);
    }
    islandReady.value = { island, anchors: this.collectAnchors(island) };
    requestShadowUpdate();
    // The island, props and colliders never move again. Their matrices are
    // final, so skip these subtrees (and the hidden merge sources inside)
    // in the per-frame scene walk: about 1 ms of Quest CPU per frame.
    // Three 0.185 has no public switch for this. Invariant: nothing under
    // these roots may move, be added or be reparented after this point.
    for (const root of [island, props, colliderGroup]) {
      if (!root) continue;
      root.updateMatrixWorld(true);
      root.updateMatrixWorld = () => {};
    }
  }

  private hasColliderAncestor(node: Object3D): boolean {
    let current = node.parent;
    while (current) {
      if (current.userData?.collider) return true;
      current = current.parent;
    }
    return false;
  }

  private cloneAsCollider(mesh: Mesh): Mesh {
    const clone = new Mesh(mesh.geometry);
    clone.name = `${mesh.name}_collider`;
    mesh.updateMatrixWorld(true);
    mesh.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
    clone.updateMatrixWorld(true);
    clone.userData = { collider: 1 };
    return clone;
  }

  private layersFor(mesh: Mesh): number {
    const extras = mesh.userData ?? {};
    let layers = Layer.Obstacle;
    if (extras.teleport) layers |= Layer.Teleport;
    if (extras.plantable) layers |= Layer.Plantable;
    if (extras.outer_boundary) layers |= Layer.Invisible;
    else if (extras.boundary) layers |= Layer.Boundary;
    return layers;
  }

  private overrideMaterial(
    mesh: Mesh,
    waterNormal: import('@iwsdk/core').Texture,
    envMap: import('@iwsdk/core').CubeTexture,
    terrain: boolean,
  ): void {
    const source = mesh.material as MeshStandardMaterial;
    if (!source || Array.isArray(source)) return;
    const name = source.name ?? '';
    if (/sky/i.test(name)) {
      // Sky base and clouds merge into one draw on the base mesh.
      if (/cloud/i.test(name)) {
        mesh.visible = false;
        return;
      }
      const cloudsMesh = mesh.parent?.children.find((child) =>
        /cloud/i.test(((child as Mesh).material as Material | undefined)?.name ?? ''),
      ) as Mesh | undefined;
      const clouds = (cloudsMesh?.material as MeshStandardMaterial | undefined)?.map ?? null;
      mesh.material = createSkyMaterial(source.map!, clouds);
      mesh.renderOrder = -1000;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if (cloudsMesh) cloudsMesh.visible = false;
      return;
    }
    const key = `${source.uuid}:${terrain}`;
    let material = this.overrides.get(key);
    if (!material) {
      material = this.buildOverride(source, waterNormal, envMap, terrain);
      this.overrides.set(key, material);
    }
    mesh.material = material;
    if (/(\b|_)water(\b|_)/i.test(name)) {
      // Legacy used 900; keep water below spatial UI in the transparent pass.
      mesh.renderOrder = -1;
      mesh.castShadow = false;
    } else if (/road/i.test(name)) {
      mesh.castShadow = false;
    } else if (/matte_mountain/i.test(name)) {
      mesh.renderOrder = -900;
      mesh.castShadow = false;
    }
    if (/terrain_underwater/i.test(mesh.name)) mesh.renderOrder = 800;
  }

  private buildOverride(
    source: MeshStandardMaterial,
    waterNormal: import('@iwsdk/core').Texture,
    envMap: import('@iwsdk/core').CubeTexture,
    terrain: boolean,
  ): Material {
    const name = source.name ?? '';
    if (/(\b|_)water(\b|_)/i.test(name)) {
      const water = createWaterMaterial(
        source,
        waterNormal,
        envMap,
        /M_Prop_Fountain_Water/i.test(name)
          ? { flowSpeed: 0.015, reflectivity: 0.75, cacheKey: 'flowerbed-fountain-water' }
          : { flowSpeed: 0.02, reflectivity: 0.6, cacheKey: 'flowerbed-water' },
      );
      this.waterMaterials.push(water);
      return water;
    }
    if (/underwater|sand/i.test(name)) return createUnderwaterMaterial(source);
    const material = source.clone();
    const keepPbr = /bench|camera|watering/i.test(name);
    if (!keepPbr) makeFullRough(material);
    if (/road/i.test(name)) {
      material.alphaTest = 0;
      material.transparent = false;
    }
    if (/matte_mountain/i.test(name)) patchMatteFog(material);
    if (material.alphaTest > 0) {
      material.alphaToCoverage = true;
      material.alphaTest = 0.5;
    }
    material.shadowSide = source.side;
    return terrain && !keepPbr ? toLambert(material) : material;
  }

  private collectAnchors(island: Object3D): Map<string, Object3D[]> {
    const anchors = new Map<string, Object3D[]>();
    island.traverse((node) => {
      const match = /^(SFX_[A-Z_]+?|Rabbit_Spawn|Squirrel_Spawn|Seagull_Spawn)(?:[._]?\d+)?$/.exec(node.name);
      if (!match) return;
      const key = match[1];
      const list = anchors.get(key) ?? [];
      list.push(node);
      anchors.set(key, list);
    });
    return anchors;
  }

  /** Static shadow map: re-render on request (plants changed), at most 4 Hz. */
  private updateShadow(delta: number): void {
    if (!this.sun) return;
    this.shadowTimer += delta;
    const requests = shadowRequests.peek();
    if (requests !== this.lastShadowRequest && this.shadowTimer > 0.25) {
      this.lastShadowRequest = requests;
      this.shadowTimer = 0;
      this.sun.shadow.needsUpdate = true;
    } else if (this.shadowTimer > 15) {
      this.shadowTimer = 0;
      this.sun.shadow.needsUpdate = true;
    }
  }
}
