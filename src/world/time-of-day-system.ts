/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Time of day (new): morning, the painted sunset, a moonlit night, or Auto
 * (follows the local clock). Each preset blends over two seconds: light
 * colours, fog, a procedural sky (gradient, recoloured clouds, sun or moon,
 * stars), water tint, and fireflies at night. The static shadow map
 * refreshes once per change, so nothing costs extra per frame except the
 * night-only fireflies (one small Points draw).
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  IBLGradient,
  Points,
  ShaderMaterial,
  CanvasTexture,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { Layer, collisionWorld, createHit } from '../core/colliders.js';
import { finishOn, onFinishChange, ribbonMilestone, weekly } from '../gardening/progress.js';
import { BURST_STYLES, bursts } from '../core/bursts.js';
import { timePreset } from '../core/state.js';
import { settings } from '../core/settings.js';
import { islandReady, requestShadowUpdate } from './island-state.js';
import { skyUniforms, waterUniforms } from './materials.js';

export type TimeOfDay = 'morning' | 'sunset' | 'night' | 'auto';
type Preset = 'morning' | 'sunset' | 'night';

interface Look {
  sun: Color;
  sunIntensity: number;
  sky: Color;
  ground: Color;
  hemiIntensity: number;
  fog: Color;
  fogDensity: number;
  skyMix: number;
  zenith: Color;
  horizon: Color;
  cloud: Color;
  stars: number;
  disc: Color;
  discDir: Vector3;
  discSize: number;
  water: Color;
  /** Image-based ambient (scene IBLGradient) strength. */
  ibl: number;
  /** 1 at sunset (for the "Sunset lanterns" finish). */
  dusk: number;
}

const c = (r: number, g: number, b: number) => new Color(r, g, b);

const LOOKS: Record<Preset, Look> = {
  morning: {
    sun: c(1, 0.93, 0.82),
    sunIntensity: 3.4,
    sky: c(0.9, 0.95, 1),
    ground: c(0.55, 0.72, 0.5),
    hemiIntensity: 1.3,
    fog: c(0.78, 0.86, 0.95),
    fogDensity: 0.0034,
    skyMix: 1,
    zenith: c(0.22, 0.45, 0.85),
    horizon: c(0.8, 0.88, 0.97),
    cloud: c(1, 1, 1),
    stars: 0,
    disc: c(1.4, 1.3, 1.1),
    discDir: new Vector3(-0.4, 0.7, -0.6).normalize(),
    discSize: 0.9993,
    water: c(0.75, 0.9, 1.05),
    ibl: 0.45,
    dusk: 0,
  },
  sunset: {
    sun: c(1, 0.467, 0.333),
    sunIntensity: 3.77,
    sky: c(1, 0.933, 0.867),
    ground: c(0.502, 0.753, 0.502),
    hemiIntensity: 0.94,
    fog: c(0.918, 0.82, 0.824),
    fogDensity: 0.0042,
    skyMix: 0,
    zenith: c(0.4, 0.3, 0.6),
    horizon: c(1, 0.75, 0.7),
    cloud: c(1, 0.8, 0.85),
    stars: 0,
    disc: c(0, 0, 0),
    discDir: new Vector3(0, 1, 0),
    discSize: 1,
    water: c(1, 1, 1),
    ibl: 0.35,
    dusk: 1,
  },
  night: {
    sun: c(0.5, 0.62, 1),
    sunIntensity: 0.85,
    sky: c(0.28, 0.34, 0.58),
    ground: c(0.1, 0.13, 0.18),
    hemiIntensity: 0.55,
    fog: c(0.04, 0.06, 0.12),
    fogDensity: 0.0055,
    skyMix: 1,
    zenith: c(0.01, 0.015, 0.05),
    horizon: c(0.06, 0.09, 0.2),
    cloud: c(0.12, 0.14, 0.22),
    stars: 1,
    disc: c(0.9, 0.95, 1.1),
    discDir: new Vector3(0.5, 0.55, -0.65).normalize(),
    discSize: 0.9996,
    water: c(0.18, 0.22, 0.38),
    ibl: 0.05,
    dusk: 0,
  },
};

const BLEND_TIME = 2;
const FIREFLIES = 70;
/** Weekly ribbons needed for gold lanterns. */
const GOLD_LANTERNS_AT = 10;
/** The "Firefly swarm" finish wakes the extra ones. */
const FIREFLY_MAX = 120;
const LANTERNS = 12;
const POINTS = FIREFLY_MAX + LANTERNS;

function presetFor(choice: TimeOfDay): Preset {
  if (choice !== 'auto') return choice;
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 16) return 'morning';
  if (hour >= 16 && hour < 20) return 'sunset';
  return 'night';
}

/** Where the garden is; the sun orbits the spot it lights here. */
const ISLAND_CENTER = new Vector3(4, 0, 14);
const FORWARD = new Vector3(0, 0, -1);

export class TimeOfDaySystem extends createSystem({
  ibl: { required: [IBLGradient] },
}) {
  private current: Look = cloneLook(LOOKS.sunset);
  private from: Look = cloneLook(LOOKS.sunset);
  private to: Look = LOOKS.sunset;
  private t = 1;
  private preset: Preset = 'sunset';
  private sun: DirectionalLight | null = null;
  private hemi: HemisphereLight | null = null;
  private fireflies!: Points;
  private flyBase = new Float32Array(FIREFLY_MAX * 3);
  private flyCount = FIREFLIES;
  private glows: InstancedMesh | null = null;
  private glowMaterial = new MeshBasicMaterial({
    map: glowTexture(),
    color: 0xffa25a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  private flyPositions = new Float32Array(POINTS * 3);
  private flySizes = new Float32Array(POINTS);
  private flyPhases = new Float32Array(POINTS);
  private flyColors = new Float32Array(POINTS * 3);
  private lanterns = 0;
  private flyMaterial = new ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uLantern: { value: 0 }, uTime: { value: 0 }, uScale: { value: 700 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      attribute vec3 aColor;
      uniform float uTime, uScale, uOpacity, uLantern;
      varying vec3 vColor;
      varying float vBlink;
      void main() {
        vColor = aColor;
        // Fireflies blink on their own rhythm; lanterns (phase < 0) glow steadily.
        vBlink = aPhase < 0.0
          ? (0.85 + 0.15 * sin(uTime * 1.3)) * uLantern
          : (0.15 + 0.85 * pow(max(sin(uTime * 1.7 + aPhase), 0.0), 2.0)) * uOpacity;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(-mv.z, 0.05);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vBlink;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float glow = 0.55 * exp(-d * d * 3.0) + exp(-d * d * 30.0);
        float a = glow * vBlink;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor * a, a);
        #include <colorspace_fragment>
      }`,
  });
  private elapsed = 0;
  private autoCheck = 0;
  private center = new Vector3();

  override init(): void {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.flyPositions, 3));
    geometry.setAttribute('aSize', new BufferAttribute(this.flySizes, 1));
    geometry.setAttribute('aPhase', new BufferAttribute(this.flyPhases, 1));
    geometry.setAttribute('aColor', new BufferAttribute(this.flyColors, 3));
    for (let i = 0; i < FIREFLY_MAX; i++) {
      this.flySizes[i] = i < FIREFLIES ? 0.11 + Math.random() * 0.06 : 0;
      this.flyPhases[i] = Math.random() * 20;
      this.flyColors.set([0.85, 1, 0.4], i * 3);
    }
    this.fireflies = new Points(geometry, this.flyMaterial);
    this.fireflies.frustumCulled = false;
    this.fireflies.renderOrder = -2;
    this.fireflies.visible = false;
    this.scene.add(this.fireflies);
    this.cleanupFuncs.push(
      settings.subscribe(() => this.choose(false)),
      weekly.subscribe((state) => this.goldLanterns(state.ribbons >= GOLD_LANTERNS_AT)),
      ribbonMilestone.subscribe((milestone) => milestone?.at === GOLD_LANTERNS_AT && this.sparkleLanterns()),
      onFinishChange(() => {
        // Firefly swarm: wake the extra fireflies; lanterns may glow at sunset.
        this.flyCount = finishOn('nightowl') ? FIREFLY_MAX : FIREFLIES;
        for (let i = FIREFLIES; i < FIREFLY_MAX; i++) {
          this.flySizes[i] = i < this.flyCount ? 0.11 + ((i * 7919) % 60) / 1000 : 0;
          this.flyPhases[i] = i * 2.3;
          this.flyColors.set([0.85, 1, 0.4], i * 3);
        }
        const geometry = this.fireflies.geometry;
        geometry.attributes.aSize.needsUpdate = true;
        geometry.attributes.aPhase.needsUpdate = true;
        geometry.attributes.aColor.needsUpdate = true;
        if (islandReady.peek()) this.apply();
      }),
      islandReady.subscribe((ready) => {
        if (ready) this.placeLanterns();
        this.choose(true);
      }),
    );
  }

  private choose(immediate: boolean): void {
    if (!islandReady.peek()) return;
    const preset = presetFor((settings.peek().timeOfDay ?? 'sunset') as TimeOfDay);
    if (preset === this.preset && !immediate) return;
    this.preset = preset;
    timePreset.value = preset;
    this.from = cloneLook(this.current);
    this.to = LOOKS[preset];
    this.t = immediate ? 1 : 0;
    if (immediate) this.current = cloneLook(this.to);
    this.scene.traverse((node) => {
      if ((node as DirectionalLight).isDirectionalLight) this.sun = node as DirectionalLight;
      if ((node as HemisphereLight).isHemisphereLight) this.hemi = node as HemisphereLight;
    });
    this.apply();
    requestShadowUpdate();
    if (immediate) this.placeSun();
  }

  /**
   * Re-capture the surroundings into a small cube map once per time-of-day
   * change, so water and metal tools reflect the current sky (no per-frame
   * cost; six low-resolution renders at the end of each blend).
   */
  /**
   * Point the shadow-casting light from the sun (or moon) in the sky, so
   * shadows change with the time of day. Sunset keeps the authored light.
   */
  /**
   * Swing the sun around the point on the island it lights, keeping its
   * distance (and so its shadow camera framing), to match the sky's disc.
   */
  private placeSun(): void {
    const sun = this.sun;
    if (!sun) return;
    sun.updateMatrixWorld(true);
    sun.target.updateMatrixWorld(true);
    if (!this.sunHome) {
      const light = sun.getWorldPosition(new Vector3());
      const dir = sun.target.getWorldPosition(new Vector3()).sub(light).normalize();
      const reach = Math.max(1, ISLAND_CENTER.clone().sub(light).dot(dir));
      this.sunHome = { light, dir, reach, aim: light.clone().addScaledVector(dir, reach) };
    }
    const home = this.sunHome;
    const dir = this.preset === 'sunset' ? home.dir.clone() : LOOKS[this.preset].discDir.clone().negate().normalize();
    const light = home.aim.clone().addScaledVector(dir, -home.reach);
    // IWSDK drives the light from its parent entity (forward is -Z), so move
    // and turn that object; the binding re-syncs the light and its target.
    const rig = sun.parent;
    if (!rig) return;
    if (rig.parent) rig.parent.worldToLocal(light);
    rig.position.copy(light);
    rig.quaternion.setFromUnitVectors(FORWARD, dir);
    if (rig.parent) {
      rig.parent.getWorldQuaternion(this.parentQuat);
      rig.quaternion.premultiply(this.parentQuat.invert());
    }
    rig.updateMatrixWorld(true);
  }

  private parentQuat = new Quaternion();
  private sunHome: { light: Vector3; dir: Vector3; reach: number; aim: Vector3 } | null = null;

  /** Ten weekly ribbons turn every lantern's glow a rich gold. */
  private goldLanterns(gold: boolean): void {
    if (gold === this.lanternGold) return;
    const color = gold ? [1, 0.84, 0.4] : [1, 0.62, 0.28];
    for (let i = 0; i < this.lanterns; i++) {
      this.flyColors.set(color, (FIREFLY_MAX + i) * 3);
      // Gold lanterns are also bigger and brighter.
      this.flySizes[FIREFLY_MAX + i] *= gold ? 1.4 : 1 / 1.4;
    }
    const geometry = this.fireflies.geometry;
    geometry.attributes.aColor.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
    this.glowMaterial.color.set(gold ? 0xffd27a : 0xffa25a);
    this.lanternGold = gold;
    if (islandReady.peek()) this.apply();
  }

  /** The moment gold lanterns unlock, each lantern bursts with sparkles. */
  private sparkleLanterns(): void {
    for (let i = 0; i < this.lanterns; i++) {
      const k = (FIREFLY_MAX + i) * 3;
      this.sparkAt.set(this.flyPositions[k], this.flyPositions[k + 1], this.flyPositions[k + 2]);
      bursts.emit(this.sparkAt, BURST_STYLES.gold);
    }
  }

  private sparkAt = new Vector3();

  private lanternGold = false;

  private groundBelow(at: Vector3): number {
    this.rayFrom.set(at.x, at.y - 0.2, at.z);
    this.rayTo.set(at.x, at.y - 6, at.z);
    return collisionWorld.raySegment(this.rayFrom, this.rayTo, Layer.Obstacle, this.rayHit)
      ? this.rayHit.point.y + 0.03
      : at.y - 1;
  }

  private rayFrom = new Vector3();
  private rayTo = new Vector3();
  private rayHit = createHit();

  /** Warm night glows at the gazebo, fountain, pergola, gate and bridges. */
  private placeLanterns(): void {
    const props = this.world.getSceneObject('island-props');
    const spots: [RegExp, number, number][] = [
      [/^Gazebo /, 2.4, 0.9],
      [/^Fountain /, 1.5, 0.6],
      [/^Pergola /, 2.3, 0.7],
      [/^Gate /, 1.9, 0.45],
      [/^Bridge /, 1.2, 0.45],
    ];
    const at = new Vector3();
    let index = FIREFLY_MAX;
    props?.children.forEach((child) => {
      const spot = spots.find(([test]) => test.test(child.name));
      if (!spot || index >= POINTS) return;
      child.getWorldPosition(at);
      this.flyPositions.set([at.x, at.y + spot[1], at.z], index * 3);
      this.flySizes[index] = spot[2] * (this.lanternGold ? 1.4 : 1);
      this.flyPhases[index] = -1;
      this.flyColors.set(this.lanternGold ? [1, 0.82, 0.35] : [1, 0.62, 0.28], index * 3);
      index++;
    });
    this.lanterns = index - FIREFLY_MAX;
    const geometry = this.fireflies.geometry;
    geometry.setDrawRange(0, FIREFLY_MAX + this.lanterns);
    // A warm pool of light on the ground under each lantern (one draw).
    const glows = new InstancedMesh(
      new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      this.glowMaterial,
      Math.max(1, this.lanterns),
    );
    const matrix = new Matrix4();
    for (let i = 0; i < this.lanterns; i++) {
      const k = (FIREFLY_MAX + i) * 3;
      const radius = 1.6 + this.flySizes[FIREFLY_MAX + i] * 3;
      at.set(this.flyPositions[k], this.flyPositions[k + 1], this.flyPositions[k + 2]);
      at.y = this.groundBelow(at);
      matrix.makeScale(radius, 1, radius).setPosition(at);
      glows.setMatrixAt(i, matrix);
    }
    glows.count = this.lanterns;
    glows.name = 'lantern-glows';
    // Draw before UI panels so glows never show through them.
    glows.renderOrder = -2;
    glows.visible = false;
    glows.frustumCulled = false;
    this.glows?.removeFromParent();
    this.glows = glows;
    this.scene.add(glows);
    geometry.attributes.aSize.needsUpdate = true;
    geometry.attributes.aPhase.needsUpdate = true;
    geometry.attributes.aColor.needsUpdate = true;
    geometry.attributes.position.needsUpdate = true;
  }

  override update(delta: number): void {
    this.elapsed += delta;
    skyUniforms.uTime.value = this.elapsed;
    // Auto follows the clock; re-check once a minute.
    this.autoCheck += delta;
    if (this.autoCheck > 60) {
      this.autoCheck = 0;
      if (settings.peek().timeOfDay === 'auto') this.choose(false);
    }
    if (this.t < 1) {
      this.t = Math.min(1, this.t + delta / BLEND_TIME);
      const k = this.t * this.t * (3 - 2 * this.t);
      lerpLook(this.current, this.from, this.to, k);
      this.apply();
      if (this.t >= 1) {
        requestShadowUpdate();
        this.placeSun();
      }
    }
    this.updateFireflies(delta);
  }

  private apply(): void {
    const look = this.current;
    if (this.sun) {
      this.sun.color.copy(look.sun);
      this.sun.intensity = look.sunIntensity;
    }
    if (this.hemi) {
      this.hemi.color.copy(look.sky);
      this.hemi.groundColor.copy(look.ground);
      this.hemi.intensity = look.hemiIntensity;
    }
    const fog = this.scene.fog as FogExp2 | null;
    if (fog) {
      fog.color.copy(look.fog);
      fog.density = look.fogDensity;
    }
    skyUniforms.uSkyMix.value = look.skyMix;
    skyUniforms.uZenith.value.copy(look.zenith);
    skyUniforms.uHorizon.value.copy(look.horizon);
    skyUniforms.uCloudTint.value.copy(look.cloud);
    skyUniforms.uStars.value = look.stars;
    skyUniforms.uSunColor.value.copy(look.disc);
    skyUniforms.uSunDir.value.copy(look.discDir);
    skyUniforms.uSunSize.value = look.discSize;
    waterUniforms.uWaterTint.value.copy(look.water);
    this.flyMaterial.uniforms.uOpacity.value = look.stars;
    // Gold lanterns (10 weekly ribbons) are lit from sunset on, like the finish.
    const lantern = Math.max(look.stars, finishOn('duskkeeper') || this.lanternGold ? look.dusk * 0.85 : 0);
    this.flyMaterial.uniforms.uLantern.value = lantern;
    this.glowMaterial.opacity = lantern * (this.lanternGold ? 1 : 0.8);
    if (this.glows) this.glows.visible = lantern > 0.02;
    for (const entity of this.queries.ibl.entities) {
      entity.setValue(IBLGradient, 'intensity', look.ibl);
    }
  }

  /** A loose cloud of fireflies drifting around the player at night. */
  private updateFireflies(delta: number): void {
    this.flyMaterial.uniforms.uTime.value = this.elapsed;
    const visible = this.flyMaterial.uniforms.uOpacity.value > 0.02 || this.flyMaterial.uniforms.uLantern.value > 0.02;
    this.fireflies.visible = visible;
    if (!visible) return;
    this.world.player.getWorldPosition(this.center);
    for (let i = 0; i < this.flyCount; i++) {
      const k = i * 3;
      const bx = this.flyBase[k] - this.center.x;
      const bz = this.flyBase[k + 2] - this.center.z;
      // Respawn fireflies that drift too far from the player.
      if (this.flyBase[k + 1] === 0 || bx * bx + bz * bz > 100) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 1.2 + Math.random() * 5;
        this.flyBase[k] = this.center.x + Math.cos(angle) * radius;
        this.flyBase[k + 1] = this.center.y + 0.3 + Math.random() * 1.6;
        this.flyBase[k + 2] = this.center.z + Math.sin(angle) * radius;
      }
      const t = this.elapsed * 0.4 + i * 1.7;
      this.flyPositions[k] = this.flyBase[k] + Math.sin(t) * 0.35;
      this.flyPositions[k + 1] = this.flyBase[k + 1] + Math.sin(t * 1.3) * 0.18;
      this.flyPositions[k + 2] = this.flyBase[k + 2] + Math.cos(t * 0.9) * 0.35;
    }
    void delta;
    this.fireflies.geometry.attributes.position.needsUpdate = true;
  }
}

function cloneLook(look: Look): Look {
  return {
    ...look,
    sun: look.sun.clone(),
    sky: look.sky.clone(),
    ground: look.ground.clone(),
    fog: look.fog.clone(),
    zenith: look.zenith.clone(),
    horizon: look.horizon.clone(),
    cloud: look.cloud.clone(),
    disc: look.disc.clone(),
    discDir: look.discDir.clone(),
    water: look.water.clone(),
  };
}

function lerpLook(out: Look, a: Look, b: Look, k: number): void {
  const n = (x: number, y: number) => x + (y - x) * k;
  out.sun.lerpColors(a.sun, b.sun, k);
  out.sunIntensity = n(a.sunIntensity, b.sunIntensity);
  out.sky.lerpColors(a.sky, b.sky, k);
  out.ground.lerpColors(a.ground, b.ground, k);
  out.hemiIntensity = n(a.hemiIntensity, b.hemiIntensity);
  out.fog.lerpColors(a.fog, b.fog, k);
  out.fogDensity = n(a.fogDensity, b.fogDensity);
  out.skyMix = n(a.skyMix, b.skyMix);
  out.zenith.lerpColors(a.zenith, b.zenith, k);
  out.horizon.lerpColors(a.horizon, b.horizon, k);
  out.cloud.lerpColors(a.cloud, b.cloud, k);
  out.stars = n(a.stars, b.stars);
  out.disc.lerpColors(a.disc, b.disc, k);
  out.discDir.lerpVectors(a.discDir, b.discDir, k).normalize();
  out.discSize = n(a.discSize, b.discSize);
  out.water.lerpColors(a.water, b.water, k);
  out.ibl = n(a.ibl, b.ibl);
  out.dusk = n(a.dusk, b.dusk);
}

function glowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}
