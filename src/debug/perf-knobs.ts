/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Development-only performance knobs for on-device A/B tests. Headset pages
 * accept ECS commands but not script evaluation, so each knob is a field on
 * one `PerfKnobs` entity: `ecs set-component` flips it and this system
 * applies the change (layer visibility, shadows, foveation).
 */

import {
  MeshStandardMaterial,
  Vector3,
  type Entity,
  Types,
  createComponent,
  createSystem,
  type Material,
  type Mesh,
  type Object3D,
} from '@iwsdk/core';
import { Plant } from '../components/garden.js';
import { Layer, collisionWorld, createHit } from '../core/colliders.js';
import { Tool, activeTool, markGardenDirty } from '../core/state.js';
import { spawnPlant } from '../gardening/plant-system.js';
import { TutorialSystem } from '../ui/tutorial-system.js';
import { boneUpload } from '../world/hands-system.js';

export const PerfKnobs = createComponent('PerfKnobs', {
  water: { type: Types.Boolean, default: true },
  underwater: { type: Types.Boolean, default: true },
  sky: { type: Types.Boolean, default: true },
  terrain: { type: Types.Boolean, default: true },
  props: { type: Types.Boolean, default: true },
  plants: { type: Types.Boolean, default: true },
  plantBlobs: { type: Types.Boolean, default: true },
  shadows: { type: Types.Boolean, default: true },
  /** Fixed foveation 0..1; negative leaves the renderer's value alone. */
  foveation: { type: Types.Float32, default: -1 },
  /** Anisotropic filtering for terrain textures (0 leaves it alone). */
  anisotropy: { type: Types.Float32, default: 0 },
  /** Switch the active tool ('explore', 'seeds', 'water', 'camera', 'remove'). */
  tool: { type: Types.String, default: '' },
  /** Fully grown test plants in a grid near spawn (0 removes them). */
  testPlants: { type: Types.Int32, default: 0 },
  /** Use only this plant id for test plants (empty mixes varieties). */
  testVariety: { type: Types.String, default: '' },
  /** Each increment plants this many new seeds near spawn (they grow in). */
  growPlants: { type: Types.Int32, default: 0 },
  /** End the tutorial as its Skip button does. */
  skipTutorial: { type: Types.Boolean, default: false },
  /** Each increment removes every plant and saves the empty garden. */
  clearGarden: { type: Types.Int32, default: 0 },
  /** Plant cutouts: 0 as built, 1 alpha test without alpha-to-coverage, 2 opaque. */
  plantAlpha: { type: Types.Int32, default: 0 },
  /** Upload glove bones before the eye pass (off shows the one-frame lag). */
  boneUpload: { type: Types.Boolean, default: true },
});

const TEST_VARIETIES = [
  'sunflower_a',
  'tulip_a',
  'rose_a',
  'allium_a',
  'daffodil_a',
  'carnation_a',
  'nasturtium_a',
  'tulip_b',
  'rose_b',
  'sunflower_b',
];

/**
 * CPU profile published every 2 s (read with ecs query): per-system update
 * time, renderer.render() submit time, and the frame interval.
 */
export const PerfStats = createComponent('PerfStats', {
  frameAvg: { type: Types.Float32, default: 0 },
  frameMax: { type: Types.Float32, default: 0 },
  /** Frames longer than 1.5x the 72 Hz budget in the window. */
  hitches: { type: Types.Int32, default: 0 },
  systemsAvg: { type: Types.Float32, default: 0 },
  renderAvg: { type: Types.Float32, default: 0 },
  renderMax: { type: Types.Float32, default: 0 },
  /** Top systems: "Name avg/max ms; ...". */
  top: { type: Types.String, default: '' },
  /** Worst frame: interval, our JS in it, and its slowest system. */
  worst: { type: Types.String, default: '' },
});

interface Timing {
  name: string;
  total: number;
  max: number;
  /** Time spent in the current frame. */
  frame: number;
}

type Layer = 'water' | 'underwater' | 'sky' | 'terrain' | 'props' | 'plants' | 'plantBlobs';
const LAYERS: Layer[] = ['water', 'underwater', 'sky', 'terrain', 'props', 'plants', 'plantBlobs'];

function layerOf(mesh: Object3D): Layer | null {
  const name = mesh.name;
  if (/terrain_underwater/i.test(name)) return 'underwater';
  if (
    /(\b|_)water(\b|_)/i.test(name) ||
    /water/i.test((mesh as Mesh).material && ((mesh as Mesh).material as Material).name)
  )
    return 'water';
  if (/sky/i.test(name)) return 'sky';
  if (name === 'plants:shadows') return 'plantBlobs';
  for (let node: Object3D | null = mesh; node; node = node.parent) {
    if (node.name === 'flowerbed-plants') return 'plants';
    if (node.name === 'Island Props') return 'props';
    if (node.name === 'Island') return 'terrain';
  }
  return null;
}

export class PerfKnobsSystem extends createSystem({ knobs: { required: [PerfKnobs] }, plants: { required: [Plant] } }) {
  /** Knob values in effect; layers start on, matching the scene as built. */
  private applied = new Map<string, number | boolean | string>([
    ...LAYERS.map((layer) => [layer, true] as const),
    ['shadows', true],
    ['foveation', -1],
  ]);
  private testPlants: Entity[] = [];
  /** Meshes a knob hid, so turning it back on restores only those. */
  private hidden = new Map<Layer, Object3D[]>();

  private timings: Timing[] = [];
  private render: Timing = { name: 'render', total: 0, max: 0, frame: 0 };
  private worst = '';
  private worstFrame = 0;
  private frames = 0;
  private frameTotal = 0;
  private frameMax = 0;
  private hitches = 0;
  private lastFrame = 0;
  private window = 0;
  private stats!: Entity;

  override init(): void {
    this.world.createEntity().addComponent(PerfKnobs);
    this.stats = this.world.createEntity().addComponent(PerfStats);
    for (const system of this.world.getSystems()) {
      if (system === (this as unknown)) continue;
      const timing: Timing = { name: system.constructor.name, total: 0, max: 0, frame: 0 };
      this.timings.push(timing);
      const update = system.update.bind(system);
      system.update = (delta: number, time: number) => {
        const start = performance.now();
        update(delta, time);
        const spent = performance.now() - start;
        timing.total += spent;
        timing.frame += spent;
        if (spent > timing.max) timing.max = spent;
      };
    }
    const renderer = this.renderer;
    const render = renderer.render.bind(renderer);
    const timing = this.render;
    renderer.render = (scene, camera) => {
      const start = performance.now();
      render(scene, camera);
      const spent = performance.now() - start;
      timing.total += spent;
      timing.frame += spent;
      if (spent > timing.max) timing.max = spent;
    };
  }

  private profile(): void {
    const now = performance.now();
    if (this.lastFrame > 0) {
      const frame = now - this.lastFrame;
      this.frames++;
      this.frameTotal += frame;
      if (frame > this.frameMax) this.frameMax = frame;
      if (frame > 20.8) this.hitches++;
      this.window += frame;
      if (frame > this.worstFrame) {
        this.worstFrame = frame;
        let js = this.render.frame;
        let top = this.render;
        for (const timing of this.timings) {
          js += timing.frame;
          if (timing.frame > top.frame) top = timing;
        }
        this.worst = `${frame.toFixed(1)}ms frame, js ${js.toFixed(1)} (top ${top.name.replace(/System$/, '')} ${top.frame.toFixed(1)})`;
      }
    }
    for (const timing of this.timings) timing.frame = 0;
    this.render.frame = 0;
    this.lastFrame = now;
    if (this.window < 2000 || this.frames === 0) return;
    const n = this.frames;
    const ranked = [...this.timings].sort((a, b) => b.total - a.total);
    const stats = this.stats;
    stats.setValue(PerfStats, 'frameAvg', this.frameTotal / n);
    stats.setValue(PerfStats, 'frameMax', this.frameMax);
    stats.setValue(PerfStats, 'hitches', this.hitches);
    stats.setValue(PerfStats, 'systemsAvg', this.timings.reduce((sum, t) => sum + t.total, 0) / n);
    stats.setValue(PerfStats, 'renderAvg', this.render.total / n);
    stats.setValue(PerfStats, 'renderMax', this.render.max);
    stats.setValue(
      PerfStats,
      'top',
      ranked
        .slice(0, 8)
        .map((t) => `${t.name.replace(/System$/, '')} ${(t.total / n).toFixed(2)}/${t.max.toFixed(1)}`)
        .join('; '),
    );
    stats.setValue(PerfStats, 'worst', this.worst);
    this.worstFrame = 0;
    for (const timing of [...this.timings, this.render]) timing.total = timing.max = 0;
    this.frames = this.hitches = 0;
    this.frameTotal = this.frameMax = this.window = 0;
  }

  private plantAlphaBase = new Map<Material, [number, boolean]>();

  private setPlantAlpha(mode: number): void {
    this.scene.traverse((node) => {
      const material = (node as Mesh).material as Material | undefined;
      if (!material || layerOf(node) !== 'plants') return;
      if (!this.plantAlphaBase.has(material))
        this.plantAlphaBase.set(material, [material.alphaTest, material.alphaToCoverage]);
      const [alphaTest, a2c] = this.plantAlphaBase.get(material)!;
      if (alphaTest === 0) return;
      material.alphaTest = mode === 2 ? 0 : alphaTest;
      material.alphaToCoverage = mode === 0 ? a2c : false;
      material.needsUpdate = true;
    });
  }

  /** New seeds in a row 3 m in front of spawn; they play the full growth. */
  private plantSeeds(count: number): void {
    const hit = createHit();
    const from = new Vector3();
    const to = new Vector3();
    for (let i = 0; i < count; i++) {
      const x = 38.5 + i * 0.6;
      const z = 31 - i * 0.6;
      if (!collisionWorld.raySegment(from.set(x, 20, z), to.set(x, -5, z), Layer.Obstacle | Layer.Plantable, hit))
        continue;
      spawnPlant(this.world, TEST_VARIETIES[i % TEST_VARIETIES.length], hit.point);
    }
  }

  /** A square grid of grown plants on plantable ground around (36.5, 29.5), in front of spawn. */
  private spawnTestPlants(count: number, variety: string): void {
    for (const plant of this.testPlants) plant.dispose();
    this.testPlants = [];
    const side = Math.ceil(Math.sqrt(count));
    const hit = createHit();
    const from = new Vector3();
    const to = new Vector3();
    for (let i = 0; i < count; i++) {
      const x = 36.5 + ((i % side) - side / 2) * 0.9;
      const z = 29.5 + (Math.floor(i / side) - side / 2) * 0.9;
      if (!collisionWorld.raySegment(from.set(x, 20, z), to.set(x, -5, z), Layer.Obstacle | Layer.Plantable, hit))
        continue;
      const type = variety || TEST_VARIETIES[i % TEST_VARIETIES.length];
      this.testPlants.push(
        spawnPlant(this.world, type, hit.point, {
          type,
          position: [hit.point.x, hit.point.y, hit.point.z],
          yaw: i * 2.4,
          scale: [1, 1, 1],
          growth: 1,
          segments: [1, 1, 1, 1],
          thirst: 1,
        }),
      );
    }
  }

  override update(): void {
    this.profile();
    for (const entity of this.queries.knobs.entities) {
      for (const layer of LAYERS) {
        const on = entity.getValue(PerfKnobs, layer) as boolean;
        if (this.applied.get(layer) === on) continue;
        this.applied.set(layer, on);
        if (on) {
          for (const node of this.hidden.get(layer) ?? []) node.visible = true;
          this.hidden.delete(layer);
          continue;
        }
        const hidden: Object3D[] = [];
        this.scene.traverse((node) => {
          if ((node as Mesh).isMesh && node.visible && layerOf(node) === layer) {
            node.visible = false;
            hidden.push(node);
          }
        });
        this.hidden.set(layer, hidden);
      }
      const shadows = entity.getValue(PerfKnobs, 'shadows') as boolean;
      if (this.applied.get('shadows') !== shadows) {
        this.applied.set('shadows', shadows);
        this.renderer.shadowMap.enabled = shadows;
        this.scene.traverse((node) => {
          const material = (node as Mesh).material as Material | Material[] | undefined;
          if (material) for (const m of Array.isArray(material) ? material : [material]) m.needsUpdate = true;
        });
      }
      const anisotropy = entity.getValue(PerfKnobs, 'anisotropy') as number;
      if (anisotropy > 0 && this.applied.get('anisotropy') !== anisotropy) {
        this.applied.set('anisotropy', anisotropy);
        this.scene.traverse((node) => {
          const material = (node as Mesh).material as MeshStandardMaterial | undefined;
          if (!material?.map || layerOf(node) !== 'terrain') return;
          material.map.anisotropy = anisotropy;
          material.map.needsUpdate = true;
        });
      }
      boneUpload.enabled = entity.getValue(PerfKnobs, 'boneUpload') as boolean;
      if (entity.getValue(PerfKnobs, 'skipTutorial') && !this.applied.get('skipTutorial')) {
        this.applied.set('skipTutorial', true);
        (this.world.getSystem(TutorialSystem) as unknown as { setStep(step: number): void }).setStep(99);
      }
      const plantAlpha = entity.getValue(PerfKnobs, 'plantAlpha') as number;
      if ((this.applied.get('plantAlpha') ?? 0) !== plantAlpha) {
        this.applied.set('plantAlpha', plantAlpha);
        this.setPlantAlpha(plantAlpha);
      }
      const clear = entity.getValue(PerfKnobs, 'clearGarden') as number;
      if ((this.applied.get('clearGarden') ?? 0) !== clear) {
        this.applied.set('clearGarden', clear);
        for (const plant of [...this.queries.plants.entities]) plant.dispose();
        this.testPlants = [];
        markGardenDirty();
      }
      const grow = entity.getValue(PerfKnobs, 'growPlants') as number;
      if ((this.applied.get('growPlants') ?? 0) !== grow) {
        this.applied.set('growPlants', grow);
        this.plantSeeds(grow);
      }
      const tool = entity.getValue(PerfKnobs, 'tool') as string;
      if (tool && this.applied.get('tool') !== tool) {
        this.applied.set('tool', tool);
        activeTool.value = tool as Tool;
      }
      const plants = entity.getValue(PerfKnobs, 'testPlants') as number;
      if ((this.applied.get('testPlants') ?? 0) !== plants) {
        this.applied.set('testPlants', plants);
        this.spawnTestPlants(plants, entity.getValue(PerfKnobs, 'testVariety') as string);
      }
      const foveation = entity.getValue(PerfKnobs, 'foveation') as number;
      if (this.applied.get('foveation') !== foveation) {
        this.applied.set('foveation', foveation);
        if (foveation >= 0) this.renderer.xr.setFoveation(foveation);
      }
    }
  }
}
