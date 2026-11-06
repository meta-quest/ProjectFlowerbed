/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Glove hands (legacy HandCreationSystem + HandAnimationSystem).
 *
 * Flowerbed shows posed glove models instead of controllers. Each finger
 * group slerps between a DEFAULT and PRESSED pose driven by the trigger,
 * grip and thumb-rest touch, and each tool selects its own pose set (holding
 * the can, the seed packet, the camera, the seedbox). IWSDK's controller
 * models stay hidden except when the tutorial needs to show the A button.
 *
 * With hand tracking, a second glove (re-rigged to the WebXR hand skeleton)
 * follows the real hand: each frame every tracked joint matrix is copied onto
 * the bone of the same name, exactly as IWSDK drives its own hand model,
 * which stays hidden. While a hand holds a tool's prop (watering can, seed
 * packet, camera, seedbox) the posed controller glove takes over instead,
 * on the hand's virtual grip, so the prop sits in the same grip as with a
 * controller; a pinch drives the pose's index finger like a trigger.
 */

import {
  AssetManager,
  InputComponent,
  Object3D,
  Quaternion,
  createSystem,
  signal,
  type Mesh,
  Color,
  MeshStandardMaterial,
  type SkinnedMesh,
  CubeTexture,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from '@iwsdk/core';
import { BURST_STYLES, bursts } from '../core/bursts.js';
import { Layer, collisionWorld } from '../core/colliders.js';
import { haptic, selectValue } from '../core/input.js';
import type { Hand } from '../core/input.js';
import { Tool, activeTool, handMode, inXR, isToolLive, openPanel, teleporting, toolDialOpen } from '../core/state.js';
import {
  HAND_JOINTS,
  anyHandTracked,
  handTracked,
  jointTransforms,
  setTrackedWristRest,
  toolMount,
  updateToolMounts,
} from '../core/hands.js';
import { HAND_POSES, type HandPose } from '../data/hand-poses.js';
import { GOALS, goalDone, onFinishChange } from '../gardening/progress.js';

/** Polished gold: a light base colour lets bright reflections read as metal. */
const GOLD = new Color(0xe8a838);
const HANDS = ['left', 'right'] as const;

const THUMB_SPEED = 20;

/** Development A/B switch (PerfKnobs.boneUpload) for the pre-render bone upload. */
export const boneUpload = { enabled: true };

/** Set true to reveal the real controller model (tutorial A-button step). */
export const showControllerModel = signal(false);

interface Bone {
  object: Object3D;
  from: Quaternion;
  to: Quaternion;
}

interface GloveRig {
  root: Object3D;
  /** pose -> group -> bones */
  poses: Map<string, Record<keyof HandPose, Bone[]>>;
  thumb: number;
}

/** The hand-tracking glove: bones in XRHand joint order (null if absent). */
interface TrackedGlove {
  root: Object3D;
  bones: (Object3D | null)[];
}

export class HandsSystem extends createSystem({}) {
  /** Every glove's skinned meshes, for the pre-render bone upload. */
  private skinned: { root: Object3D; meshes: SkinnedMesh[] }[] = [];
  private rigs: Partial<Record<Hand, GloveRig>> = {};
  private tracked: Partial<Record<Hand, TrackedGlove>> = {};
  private gloves: {
    material: MeshStandardMaterial;
    color: Color;
    map: Texture | null;
    metalness: number;
    roughness: number;
  }[] = [];
  private wasGold: boolean | null = null;
  /** Gloves styled for the current gold state, so unrelated progress changes skip recompiles. */
  private styledGloves = 0;
  private touchTimer = 0;
  private touched = new Set<unknown>();
  private touchCooldown = { left: 0, right: 0 };

  /** Golden gloves leave a sparkle on any plant they brush (checked 6x a second). */
  private goldTouch(delta: number): void {
    this.touchCooldown.left -= delta;
    this.touchCooldown.right -= delta;
    this.touchTimer -= delta;
    if (this.touchTimer > 0) return;
    this.touchTimer = 0.16;
    for (const hand of HANDS) {
      if (this.touchCooldown[hand] > 0) continue;
      this.world.player.gripSpaces[hand].getWorldPosition(this.sparkleAt);
      this.touched.clear();
      collisionWorld.sphereOwners(this.sparkleAt, 0.14, Layer.Plant, this.touched);
      if (this.touched.size === 0) continue;
      this.touchCooldown[hand] = 0.6;
      bursts.emit(this.sparkleAt, BURST_STYLES.gold);
      haptic(this.world, hand, 0.15, 20);
    }
  }
  private sparkleAt = new Vector3();
  private goldEnv: CubeTexture | null = null;
  private gildGloves = (): void => {
    const gold = GOALS.every((goal) => goalDone(goal.id));
    if (gold === this.wasGold && this.gloves.length === this.styledGloves) return;
    this.styledGloves = this.gloves.length;
    // Solid polished gold: drop the fabric texture while gilded.
    for (const glove of this.gloves) {
      glove.material.color.copy(gold ? GOLD : glove.color);
      glove.material.map = gold ? null : glove.map;
      glove.material.metalness = gold ? 1 : glove.metalness;
      glove.material.roughness = gold ? 0.14 : glove.roughness;
      // A studio-style map with a hard horizon gives the metal real contrast.
      glove.material.envMap = gold ? (this.goldEnv ??= goldEnvironment()) : null;
      glove.material.envMapIntensity = gold ? 1.2 : 1;
      glove.material.onBeforeCompile = gold ? goldRim : () => {};
      glove.material.customProgramCacheKey = () => (gold ? 'glove-gold' : 'glove');
      glove.material.needsUpdate = true;
    }
    if (gold && this.wasGold === false) {
      // The moment they turn: a burst of gold at both hands.
      for (const hand of HANDS) {
        bursts.emit(this.world.player.gripSpaces[hand].getWorldPosition(this.sparkleAt), BURST_STYLES.gold);
      }
    }
    this.wasGold = gold;
  };

  override init(): void {
    // super-three defers texture uploads during the multiview eye pass, and
    // IWSDK flushes them only after the frame is drawn. A skinned glove's
    // bone texture changes every frame, so on Quest it was always drawn with
    // the previous frame's bones and trailed the hand while moving. Upload the
    // bones first: onBeforeRender runs after the scene's matrices update and
    // before the eye pass starts deferring (the 2022 three.js fork did the same).
    const scene = this.scene;
    const previous = scene.onBeforeRender;
    scene.onBeforeRender = (...args) => {
      previous.apply(scene, args);
      this.uploadBones();
    };
    this.cleanupFuncs.push(() => {
      scene.onBeforeRender = previous;
    });
  }

  private uploadBones(): void {
    const renderer = this.renderer;
    if (!boneUpload.enabled || !renderer.xr.enabled || !renderer.xr.isPresenting) return;
    for (const { root, meshes } of this.skinned) {
      if (!root.visible) continue;
      for (const mesh of meshes) {
        const skeleton = mesh.skeleton;
        skeleton.update();
        if (skeleton.boneTexture === null) skeleton.computeBoneTexture();
        renderer.initTexture(skeleton.boneTexture!);
      }
    }
  }

  /** Clone a glove's materials into the shared list (for the gold finish). */
  private adoptMaterials(root: Object3D): void {
    const meshes: SkinnedMesh[] = [];
    this.skinned.push({ root, meshes });
    root.traverse((node) => {
      if ((node as SkinnedMesh).isSkinnedMesh) meshes.push(node as SkinnedMesh);
      node.castShadow = false;
      node.frustumCulled = false;
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.renderOrder = 10;
      const material = (mesh.material as MeshStandardMaterial).clone();
      mesh.material = material;
      this.gloves.push({
        material,
        color: material.color.clone(),
        map: material.map,
        metalness: material.metalness,
        roughness: material.roughness,
      });
    });
  }

  private buildTracked(): boolean {
    if (this.tracked.left && this.tracked.right) return true;
    for (const hand of HANDS) {
      const gltf = AssetManager.getGLTF(`glove-tracked-${hand}`);
      if (!gltf) return false;
      const root = gltf.scene;
      root.name = `glove-tracked:${hand}`;
      this.adoptMaterials(root);
      root.visible = false;
      // Joint matrices are relative to the grip space, so the glove lives there.
      this.world.player.gripSpaces[hand].add(root);
      const bones = HAND_JOINTS.map((joint) => root.getObjectByName(joint) ?? null);
      // Its wrist rest pose defines where a controller grip sits in the hand.
      const wrist = bones[0];
      if (wrist) {
        wrist.updateMatrix();
        setTrackedWristRest(hand, wrist.matrix);
      }
      for (const bone of bones) if (bone) bone.matrixAutoUpdate = true;
      this.tracked[hand] = { root, bones };
    }
    this.gildGloves();
    return true;
  }

  /** Follow the tracked hand: copy each joint matrix onto its bone. */
  private poseTracked(hand: Hand, holdingProp: boolean): boolean {
    const glove = this.tracked[hand];
    const transforms = jointTransforms(this.world, hand);
    const show = glove != null && transforms != null && inXR.peek() && !holdingProp;
    if (glove) glove.root.visible = show;
    if (!show) return false;
    for (let i = 0; i < glove.bones.length; i++) {
      const bone = glove.bones[i];
      if (!bone) continue;
      bone.matrix.fromArray(transforms, i * 16);
      bone.matrix.decompose(bone.position, bone.quaternion, bone.scale);
    }
    return true;
  }

  private build(): boolean {
    if (this.rigs.left && this.rigs.right) return true;
    const gltfLeft = AssetManager.getGLTF('glove-hand');
    const gltfRight = AssetManager.getGLTF('glove-hand');
    if (!gltfLeft || !gltfRight) return false;
    for (const hand of HANDS) {
      const root = (hand === 'left' ? gltfLeft : gltfRight).scene;
      root.name = `glove:${hand}`;
      // Completing every goal turns the gloves gold.
      this.adoptMaterials(root);
      // The model is a left glove; mirror it for the right hand.
      if (hand === 'right') {
        const inner = root.children[0];
        inner.scale.y = 1;
        inner.position.x *= -1;
      }
      const poses = new Map<string, Record<keyof HandPose, Bone[]>>();
      for (const [name, pose] of Object.entries(HAND_POSES)) {
        const groups = {} as Record<keyof HandPose, Bone[]>;
        for (const group of ['THUMB', 'INDEX', 'HAND'] as const) {
          groups[group] = Object.entries(pose[group])
            .map(([boneName, [from, to]]) => {
              const object = root.getObjectByName(boneName);
              return object ? { object, from: new Quaternion(...from), to: new Quaternion(...to) } : null;
            })
            .filter((bone): bone is Bone => bone != null);
        }
        poses.set(name, groups);
      }
      // The controller grip, or a tracked hand's virtual grip (prop poses).
      toolMount(this.world, hand).add(root);
      this.rigs[hand] = { root, poses, thumb: 0 };
    }
    this.gildGloves();
    this.cleanupFuncs.push(onFinishChange(this.gildGloves));
    return true;
  }

  override update(delta: number): void {
    if (!this.build()) return;
    this.buildTracked();
    if (this.wasGold) this.goldTouch(delta);
    const xr = this.world.input.xr;
    const hands = anyHandTracked(this.world);
    updateToolMounts(this.world);
    if (hands !== handMode.peek()) handMode.value = hands;
    for (const hand of HANDS) {
      // IWSDK's own hand model stays hidden; our glove takes its place.
      const handModel = xr.visualAdapters.hand[hand].visual?.model;
      if (handModel) for (const child of handModel.children) child.visible = false;
      const rig = this.rigs[hand]!;
      const holdingProp = handTracked(this.world, hand) && this.propPose(rig, hand);
      this.poseTracked(hand, holdingProp);
      const pad = xr.gamepads[hand];
      const usingController = pad != null && xr.isPrimary('controller', hand);
      // Outside XR the grip keeps its last pose; hide the glove there.
      rig.root.visible = (usingController || holdingProp) && inXR.peek();
      // XRInputManager forces the model root visible every frame, so hide
      // its children instead (gloves replace controllers, legacy look).
      const model = xr.visualAdapters.controller[hand].visual?.model;
      const showModel = (showControllerModel.peek() && hand === 'right') || !usingController;
      if (model) for (const child of model.children) child.visible = showModel;
      if (!usingController || !pad) continue;

      const trigger = pad.getButtonValue(InputComponent.Trigger);
      const squeeze = pad.getButtonValue(InputComponent.Squeeze);
      const touching =
        pad.getButtonTouched(hand === 'right' ? InputComponent.A_Button : InputComponent.X_Button) ||
        pad.getButtonTouched(hand === 'right' ? InputComponent.B_Button : InputComponent.Y_Button) ||
        pad.getButtonTouched(InputComponent.Thumbstick);
      const target = touching ? 1 : 0;
      rig.thumb += Math.sign(target - rig.thumb) * Math.min(Math.abs(target - rig.thumb), delta * THUMB_SPEED);

      const tool =
        toolDialOpen.peek() || teleporting.peek() || openPanel.peek() !== 'none' ? Tool.Explore : activeTool.peek();
      if (hand === 'right') {
        switch (tool) {
          case Tool.Water:
            this.fixed(rig, 'WATERING');
            break;
          case Tool.Seeds:
            this.fixed(rig, 'PLANTING');
            break;
          case Tool.Camera:
            this.animate(rig, 'CAMERA', trigger, 0, 0);
            break;
          case Tool.Remove:
            this.animate(rig, 'GRABBING', trigger, trigger, trigger);
            break;
          default:
            this.animate(rig, 'EMPTY', trigger, squeeze, rig.thumb);
        }
      } else if (tool === Tool.Camera) {
        this.animate(rig, 'GRABBING', trigger, trigger, trigger);
      } else if (tool === Tool.Seeds) {
        this.animate(rig, 'SEEDBOX', 1, 1, rig.thumb);
      } else {
        this.animate(rig, 'EMPTY', trigger, squeeze, rig.thumb);
      }
    }
  }

  /**
   * A tracked hand holding a prop: apply the controller pose for it (a pinch
   * stands in for the trigger) and return true. False leaves the hand free.
   */
  private propPose(rig: GloveRig, hand: Hand): boolean {
    if (hand === 'right') {
      if (isToolLive(Tool.Water)) this.fixed(rig, 'WATERING');
      else if (isToolLive(Tool.Seeds)) this.fixed(rig, 'PLANTING');
      else if (isToolLive(Tool.Camera)) this.animate(rig, 'CAMERA', selectValue(this.world, 'right'), 0, 0);
      else return false;
      return true;
    }
    if (!isToolLive(Tool.Seeds)) return false;
    this.animate(rig, 'SEEDBOX', 1, 1, 0);
    return true;
  }

  private animate(rig: GloveRig, pose: string, index: number, hand: number, thumb: number): void {
    const groups = rig.poses.get(pose);
    if (!groups) return;
    for (const bone of groups.INDEX) bone.object.quaternion.slerpQuaternions(bone.from, bone.to, index);
    for (const bone of groups.HAND) bone.object.quaternion.slerpQuaternions(bone.from, bone.to, hand);
    for (const bone of groups.THUMB) bone.object.quaternion.slerpQuaternions(bone.from, bone.to, thumb);
  }

  private fixed(rig: GloveRig, pose: string): void {
    const groups = rig.poses.get(pose);
    if (!groups) return;
    for (const group of [groups.INDEX, groups.HAND, groups.THUMB]) {
      for (const bone of group) bone.object.quaternion.copy(bone.from);
    }
  }
}

/**
 * A tiny baked environment for gold: dark warm ground, a bright sky band at
 * the horizon and a hot sun spot, so polished metal shows a full light-to-dark
 * range wherever the player is. Built once (six 64 px faces).
 */
function goldEnvironment(): CubeTexture {
  const face = (kind: 'side' | 'sun' | 'top' | 'bottom') => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    if (kind === 'top') {
      ctx.fillStyle = '#d9e4f2';
      ctx.fillRect(0, 0, 64, 64);
    } else if (kind === 'bottom') {
      ctx.fillStyle = '#2a1d10';
      ctx.fillRect(0, 0, 64, 64);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, '#8a7a5a');
      g.addColorStop(0.34, '#fff6e0');
      g.addColorStop(0.4, '#5a4328');
      g.addColorStop(1, '#1c1209');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      if (kind === 'sun') {
        const sun = ctx.createRadialGradient(40, 18, 0, 40, 18, 14);
        sun.addColorStop(0, '#ffffff');
        sun.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sun;
        ctx.fillRect(0, 0, 64, 64);
      }
    }
    return canvas;
  };
  const texture = new CubeTexture([face('sun'), face('side'), face('top'), face('bottom'), face('side'), face('side')]);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** A warm fresnel rim so the gloves' edges catch light like metal. */
function goldRim(shader: { fragmentShader: string }): void {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    `float rim = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);
    outgoingLight += vec3(1.0, 0.94, 0.77) * rim * 0.2;
    #include <opaque_fragment>`,
  );
}
