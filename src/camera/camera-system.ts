/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Camera tool (legacy ScreenshotCamera*, PhotoSystem, PhotoAutoDeleteSystem).
 *
 * The camera rides the right hand with a live 30 fps viewfinder. Right
 * trigger takes a photo: the screen flashes, a print slides out of the
 * camera, and a full-resolution JPEG is kept for saving. Left X / Y zoom in /
 * out (5x steps while the left grip is held). Prints can be grabbed with the
 * left trigger and left floating in the world, where an action bar offers
 * Save (download) and Discard; untouched floating prints expire after 5 s.
 */

import {
  AssetManager,
  createSystem,
  DoubleSide,
  Group,
  InputComponent,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
  type MeshStandardMaterial,
} from '@iwsdk/core';
import { audio } from '../core/audio.js';
import { gamepad, haptic, rayBusy, selectDown, selectUp, selectValue } from '../core/input.js';
import { Tool, activeTool, isToolLive, showToast } from '../core/state.js';
import { spawnPanel, type SpawnedPanel } from '../ui/panels.js';
import { toolEnvMap } from '../world/island-state.js';
import { finishOn, onFinishChange, record } from '../gardening/progress.js';
import { activeGarden } from '../gardening/garden-system.js';
import { BURST_STYLES, bursts } from '../core/bursts.js';
import { addToAlbum, makeThumb } from './photo-album.js';
import { uiKeep } from '../core/ui-sounds.js';
import { handHold, handTracked, holdMount, pinchPoint, toolMount } from '../core/hands.js';
import type { CubeTexture } from '@iwsdk/core';

export const VIEWER_ONLY_LAYER = 11;

const FOV = 37;
const PREVIEW_SIZE = [300, 200] as const;
const PHOTO_SIZE = [1200, 800] as const;
const PRINT_TIME = 1;
const FLASH_TIME = 0.7;
const EXPIRY = 5;
/** Loose prints allowed in the world before the oldest is filed away. */
const MAX_FLOATING = 5;
const GRAB_DISTANCE = 0.1;
const HIGHLIGHT_DISTANCE = 0.2;
const PHOTO_HEIGHT = 0.09;
const SCREEN = [0.106, 0.075] as const;
const CAMERA_OFFSET = {
  position: new Vector3(-0.083, 0.0123, 0.0566),
  quaternion: [-0.7378, -0.0241, 0.0019, 0.6745] as const,
  scale: 0.8,
};
/** Drop tiles: panel scale, distance left of the grab point, tile centre height, hit radius (m). */
const DROP_SCALE = 0.5;
const DROP_SIDE = 0.17;
const DROP_TILE_Y = 0.0525;
const DROP_RADIUS = 0.08;
/** Print held by the left hand: controller offset, and its left edge in a pinch. */
const PRINT_OFFSET = { position: new Vector3(0, 0.04, -0.09), pitch: -0.35 };
const PRINT_HAND = handHold([0, -0.058, 0.015], new Vector3(0, -1, 0), new Vector3(0, 0, -1));

type PhotoState = 'printing' | 'docked' | 'held' | 'floating';

interface Photo {
  group: Group;
  target: WebGLRenderTarget;
  /** Encoded full-size JPEG and its thumbnail, once ready. */
  image: { blob: Blob; thumb: string } | null;
  saveRequested?: boolean;
  state: PhotoState;
  t: number;
  expiry: number;
}

/** Number of photos saved this session, and a hook for tutorial hints. */
export const photoEvents = {
  taken: 0,
  cleared: 0,
  listeners: new Set<(event: 'taken' | 'printed' | 'cleared') => void>(),
};
/** Exposed for contextual hints (shutter glow). */
export let shutterButton: Mesh | null = null;
/** Desktop reach: the newest grabbable print, whether one is held, and the drop tiles. */
export const printLocator = {
  find: (_out: Vector3): boolean => false,
  holding: (): boolean => false,
  /** Where the left hand must go to drop the held print on a tile. */
  tile: (_action: 'keep' | 'discard', _out: Vector3): boolean => false,
};

/** Hand gamepad buttons for thumb microgestures (Quest). */
const MICRO_SWIPE_FORWARD = 7;
const MICRO_SWIPE_BACKWARD = 8;

export class CameraSystem extends createSystem({}) {
  private rig = new Object3D();
  private model: Object3D | null = null;
  private previewCamera = new PerspectiveCamera(FOV, PREVIEW_SIZE[0] / PREVIEW_SIZE[1], 0.15, 800);
  private previewTarget = new WebGLRenderTarget(PREVIEW_SIZE[0], PREVIEW_SIZE[1], { samples: 4 });
  private photoTarget = new WebGLRenderTarget(PHOTO_SIZE[0], PHOTO_SIZE[1], { samples: 4 });
  private flash = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
  private flashT = 0;
  private renderTimer = 0;
  private photos: Photo[] = [];
  private freeTargets: WebGLRenderTarget[] = [];
  /** Keep / Discard drop tiles shown beside the print in the left hand. */
  private drop: SpawnedPanel | null = null;
  private dropAction: 'keep' | 'discard' | null = null;
  private dropTiles = { keep: new Vector3(), discard: new Vector3() };
  private start = new Vector3();
  private end = new Vector3();
  private shutterBase = 0;
  private ring = new Mesh(
    new RingGeometry(0.015, 0.022, 32),
    new MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false }),
  );
  private v = new Vector3();
  private v2 = new Vector3();
  private head = new Vector3();
  private pixels = new Uint8Array(PHOTO_SIZE[0] * PHOTO_SIZE[1] * 4);
  private canvas = document.createElement('canvas');
  private backerGeometry = new PlaneGeometry((172 / 110) * PHOTO_HEIGHT, PHOTO_HEIGHT);
  private photoGeometry = new PlaneGeometry((172 / 110) * (PHOTO_HEIGHT - 0.01), PHOTO_HEIGHT - 0.01);
  private backerMaterial = new MeshBasicMaterial({ color: 0xfaf8f2, side: DoubleSide });

  override init(): void {
    this.previewTarget.texture.colorSpace = SRGBColorSpace;
    this.photoTarget.texture.colorSpace = SRGBColorSpace;
    this.rig.name = 'photo-camera';
    this.rig.position.copy(CAMERA_OFFSET.position);
    this.rig.quaternion.set(...CAMERA_OFFSET.quaternion);
    this.rig.scale.setScalar(CAMERA_OFFSET.scale);
    this.rig.visible = false;
    // A tracked hand holds it in the posed glove on its virtual grip.
    toolMount(this.world, 'right').add(this.rig);
    this.world.camera.layers.enable(VIEWER_ONLY_LAYER);
    this.ring.renderOrder = 999;
    this.ring.visible = false;
    this.ring.layers.set(VIEWER_ONLY_LAYER);
    this.scene.add(this.ring);
    printLocator.find = (out) => {
      const photo = [...this.photos].reverse().find((p) => p.state === 'docked' || p.state === 'floating');
      if (!photo) return false;
      photo.group.getWorldPosition(out);
      return true;
    };
    printLocator.holding = () => this.photos.some((photo) => photo.state === 'held');
    printLocator.tile = (action, out) => {
      const held = this.photos.find((photo) => photo.state === 'held');
      if (!held) return false;
      // Where the hand must go so the print it carries lands on the tile.
      held.group.getWorldPosition(out);
      this.world.player.gripSpaces.left.getWorldPosition(this.v2);
      out.sub(this.v2).negate().add(this.dropTiles[action]);
      return true;
    };
    this.canvas.width = PHOTO_SIZE[0];
    this.canvas.height = PHOTO_SIZE[1];
    void spawnPanel(this.world, 'photo-drop', { scale: DROP_SCALE, interactive: false }).then((drop) => {
      drop.show(false);
      drop.root.traverse((child) => child.layers.set(VIEWER_ONLY_LAYER));
      this.drop = drop;
    });
  }

  private build(): boolean {
    const gltf = AssetManager.getGLTF('photo-camera');
    if (!gltf) return false;
    const model = gltf.scene;
    model.traverse((node) => {
      node.layers.set(VIEWER_ONLY_LAYER);
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      const material = (mesh.material as MeshStandardMaterial).clone();
      material.metalness = 1;
      material.roughness = 0.4;
      const baseColor = material.color.clone();
      const finish = () => {
        // "Green thumb" reward: a mint finish.
        if (finishOn('photographer')) material.color.setRGB(0.86, 0.89, 0.93);
        else if (finishOn('greenthumb')) material.color.setRGB(0.55, 0.95, 0.78);
        else material.color.copy(baseColor);
      };
      finish();
      this.cleanupFuncs.push(onFinishChange(finish));
      const apply = (map: CubeTexture | null) => {
        material.envMap = map;
        material.needsUpdate = true;
      };
      apply(toolEnvMap.peek());
      this.cleanupFuncs.push(toolEnvMap.subscribe(apply));
      mesh.material = material;
    });
    this.rig.add(model);
    this.model = model;
    model.getObjectByName('camera_anchor')?.add(this.previewCamera);
    const screenAnchor = model.getObjectByName('screen_anchor');
    const screenGeometry = new PlaneGeometry(SCREEN[0], SCREEN[1]);
    const screen = new Mesh(
      screenGeometry,
      new MeshBasicMaterial({ map: this.previewTarget.texture, toneMapped: false }),
    );
    const flash = new Mesh(screenGeometry, this.flash);
    flash.position.z = 0.0001;
    for (const mesh of [screen, flash]) mesh.layers.set(VIEWER_ONLY_LAYER);
    screenAnchor?.add(screen, flash);
    shutterButton = (model.getObjectByName('shutter_release_button') as Mesh) ?? null;
    this.shutterBase = shutterButton?.position.y ?? 0;
    this.start.copy(model.getObjectByName('photo_start')?.position ?? this.start);
    this.end.copy(model.getObjectByName('photo_end')?.position ?? this.end);
    return true;
  }

  override update(delta: number): void {
    if (!this.model && !this.build()) return;
    const live = isToolLive(Tool.Camera);
    this.rig.visible = live;
    this.world.player.head.getWorldPosition(this.head);
    this.updatePhotos(delta);
    if (!live) {
      if (activeTool.peek() !== Tool.Camera) this.dropHeld();
      return;
    }

    const left = gamepad(this.world, 'left');
    const step = left?.getButtonPressed(InputComponent.Squeeze) ? 5 : 1;
    if (left?.getButtonDown(InputComponent.X_Button)) this.zoom(-step);
    if (left?.getButtonDown(InputComponent.Y_Button)) this.zoom(step);
    // Tracked left hand on Quest: swipe the thumb forward or back to zoom.
    if (handTracked(this.world, 'left')) {
      if (left?.getButtonDownByIdx(MICRO_SWIPE_FORWARD)) this.zoom(step);
      if (left?.getButtonDownByIdx(MICRO_SWIPE_BACKWARD)) this.zoom(-step);
    }
    if (shutterButton) {
      shutterButton.position.y = this.shutterBase - selectValue(this.world, 'right') * 0.008;
    }

    // Viewfinder at 30 fps.
    this.renderTimer += delta;
    if (this.renderTimer >= 1 / 30) {
      this.renderTimer = 0;
      this.renderTo(this.previewCamera, this.previewTarget);
    }
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - delta);
      this.flash.opacity = this.flashT / FLASH_TIME;
    }

    let printing = false;
    for (const photo of this.photos) if (photo.state === 'printing') printing = true;
    if (!printing && !rayBusy(this.world) && selectDown(this.world, 'right')) {
      this.takePhoto();
    }
  }

  private zoom(delta: number): void {
    const fov = Math.min(90, Math.max(10, this.previewCamera.fov + delta));
    this.previewCamera.fov = fov;
    this.previewCamera.updateProjectionMatrix();
    haptic(this.world, 'left', 0.1, 15);
  }

  private renderTo(camera: PerspectiveCamera, target: WebGLRenderTarget): void {
    const renderer = this.renderer;
    const xrEnabled = renderer.xr.enabled;
    const previous = renderer.getRenderTarget();
    renderer.xr.enabled = false;
    // Scene matrices are fresh from the eye render; only the camera (on the
    // moving hand) needs updating. Skipping the scene walk halves the cost.
    camera.updateWorldMatrix(true, false);
    const sceneAuto = this.scene.matrixWorldAutoUpdate;
    this.scene.matrixWorldAutoUpdate = false;
    // A throwing render must not leave XR disabled or the eyes drawing offscreen.
    try {
      renderer.setRenderTarget(target);
      renderer.render(this.scene, camera);
    } finally {
      renderer.setRenderTarget(previous);
      this.scene.matrixWorldAutoUpdate = sceneAuto;
      renderer.xr.enabled = xrEnabled;
    }
  }

  private takePhoto(): void {
    this.flashT = FLASH_TIME;
    haptic(this.world, 'right', 0.1, 1000);
    this.rig.getWorldPosition(this.v);
    audio.play('CAMERA_SHUTTER', this.v);

    // Any print still on the camera is released into the world.
    for (const photo of this.photos) if (photo.state === 'docked') this.release(photo);

    // Full resolution for saving.
    const photoCamera = this.previewCamera.clone();
    photoCamera.aspect = PHOTO_SIZE[0] / PHOTO_SIZE[1];
    photoCamera.updateProjectionMatrix();
    this.previewCamera.parent?.add(photoCamera);
    this.renderTo(photoCamera, this.photoTarget);
    photoCamera.removeFromParent();
    const encoding = this.encode(this.portraitRotation());

    // The print shows a fresh preview-resolution render.
    // Print textures are pooled; each print keeps one until it is removed.
    let target = this.freeTargets.pop();
    if (!target) {
      target = new WebGLRenderTarget(PREVIEW_SIZE[0], PREVIEW_SIZE[1], { samples: 4 });
      target.texture.colorSpace = SRGBColorSpace;
      target.texture.minFilter = LinearFilter;
    }
    this.renderTo(this.previewCamera, target);

    const group = new Group();
    group.name = 'photo';
    const backer = new Mesh(this.backerGeometry, this.backerMaterial);
    const image = new Mesh(this.photoGeometry, new MeshBasicMaterial({ map: target.texture, toneMapped: false }));
    image.position.z = 0.0001;
    group.add(backer, image);
    group.position.copy(this.start);
    this.model!.add(group);
    const photo: Photo = {
      group,
      target,
      image: null,
      state: 'printing',
      t: 0,
      expiry: EXPIRY,
    };
    this.photos.push(photo);
    void encoding.then((image) => {
      photo.image = image;
      if (photo.saveRequested) this.save(photo);
    });
    // Too many loose prints: the oldest is filed into the album.
    const floating = this.photos.filter((p) => p.state === 'floating');
    if (floating.length > MAX_FLOATING) this.save(floating[0]);
    audio.play('CAMERA_PICTURE_SLIDING', this.v);
    photoEvents.taken += 1;
    record('photos');
    photoEvents.listeners.forEach((listener) => listener('taken'));
  }

  /** Portrait detection from the camera's roll (legacy rule). */
  private portraitRotation(): 0 | 1 | -1 {
    const up = this.v.set(0, 1, 0).applyQuaternion(this.previewCamera.getWorldQuaternion(tmpQuat));
    const rightAxis = this.v2.set(1, 0, 0).applyQuaternion(tmpQuat);
    if (up.y < 0.707 && Math.abs(rightAxis.y) > 0.707) return rightAxis.y > 0 ? 1 : -1;
    return 0;
  }

  /**
   * Read back and JPEG-encode the full-resolution shot without stalling the
   * frame: async GPU readback, then an async canvas blob.
   */
  private async encode(rotation: 0 | 1 | -1): Promise<{ blob: Blob; thumb: string }> {
    const [w, h] = PHOTO_SIZE;
    await this.renderer.readRenderTargetPixelsAsync(this.photoTarget, 0, 0, w, h, this.pixels);
    const source = this.canvas;
    const ctx = source.getContext('2d')!;
    const image = ctx.createImageData(w, h);
    // Flip rows: GL origin is bottom-left.
    for (let y = 0; y < h; y++) {
      image.data.set(this.pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    }
    ctx.putImageData(image, 0, 0);
    if (rotation === 0) return toImage(source);
    const rotated = document.createElement('canvas');
    rotated.width = h;
    rotated.height = w;
    const rctx = rotated.getContext('2d')!;
    rctx.translate(h / 2, w / 2);
    rctx.rotate((rotation > 0 ? -0.5 : 0.5) * Math.PI);
    rctx.drawImage(source, -w / 2, -h / 2);
    return toImage(rotated);
  }

  private updatePhotos(delta: number): void {
    const grip = this.world.player.gripSpaces.left;
    // A tracked hand grabs where it pinches.
    if (!pinchPoint(this.world, 'left', this.v2)) grip.getWorldPosition(this.v2);
    let nearest: Photo | null = null;
    let nearestDistance = HIGHLIGHT_DISTANCE;
    for (const photo of [...this.photos]) {
      if (photo.state === 'printing') {
        photo.t += delta;
        const k = Math.min(photo.t / PRINT_TIME, 1);
        photo.group.position.lerpVectors(this.start, this.end, k);
        if (k >= 1) {
          photo.state = 'docked';
          photoEvents.listeners.forEach((listener) => listener('printed'));
        }
        continue;
      }
      if (photo.state !== 'held') {
        const d = photo.group.getWorldPosition(this.v).distanceTo(this.v2);
        if (d < nearestDistance && photo.group.visible) {
          nearestDistance = d;
          nearest = photo;
        }
      }
      if (photo.state === 'floating') {
        // Turn the print to face the player so it reads like a held photo.
        tmpObject.position.copy(photo.group.getWorldPosition(this.v));
        tmpObject.lookAt(this.head);
        photo.group.quaternion.slerp(tmpObject.quaternion, Math.min(1, delta * 6));
        // Prints no longer expire: they wait until kept or discarded.
      }
    }

    // Highlight ring and left-trigger grab.
    if (nearest) {
      nearest.group.getWorldPosition(this.v);
      this.ring.visible = true;
      this.ring.position.copy(this.v);
      this.ring.lookAt(this.head);
      (this.ring.material as MeshBasicMaterial).opacity =
        nearestDistance <= GRAB_DISTANCE ? 1 : (HIGHLIGHT_DISTANCE - nearestDistance) / 0.1;
      if (nearestDistance <= GRAB_DISTANCE && selectDown(this.world, 'left')) {
        this.grab(nearest);
        return;
      }
    } else {
      this.ring.visible = false;
    }
    const held = this.photos.find((photo) => photo.state === 'held');
    if (!held) return;
    // Lay the tiles out a frame after the grab, once the print's new parent
    // (the hand mount) has world matrices.
    if (!this.drop?.shown) this.showDrop(held);
    this.updateDrop(held);
    if (!selectUp(this.world, 'left')) return;
    // Let go over a tile to keep or discard; anywhere else it floats.
    const action = this.dropAction;
    this.hideDrop();
    if (action === 'keep') this.save(held);
    else if (action === 'discard') this.removePhoto(held, true);
    else this.release(held);
  }

  /** Show the tiles beside the print, facing the eyes, where it was picked up. */
  private showDrop(photo: Photo): void {
    const drop = this.drop;
    if (!drop) return;
    const root = drop.root;
    photo.group.getWorldPosition(this.v);
    root.position.copy(this.v);
    root.lookAt(this.head);
    // Out to the left of the hand, away from the camera in the right hand.
    this.v2.set(-DROP_SIDE, 0, 0).applyQuaternion(root.quaternion);
    root.position.add(this.v2);
    // Tile centres, from the pose just set (a hidden panel skips its matrices).
    this.v2.set(0, DROP_TILE_Y, 0).applyQuaternion(root.quaternion);
    this.dropTiles.keep.copy(root.position).add(this.v2);
    this.dropTiles.discard.copy(root.position).sub(this.v2);
    this.dropAction = null;
    this.paintDrop();
    drop.show(true);
  }

  /** Light the tile the held print is over (legacy 8 cm). */
  private updateDrop(photo: Photo): void {
    if (!this.drop) return;
    photo.group.getWorldPosition(this.v);
    let action: 'keep' | 'discard' | null = null;
    if (this.v.distanceTo(this.dropTiles.keep) < DROP_RADIUS) action = 'keep';
    else if (this.v.distanceTo(this.dropTiles.discard) < DROP_RADIUS) action = 'discard';
    if (action === this.dropAction) return;
    this.dropAction = action;
    if (action) haptic(this.world, 'left', 0.25, 25);
    this.paintDrop();
  }

  private paintDrop(): void {
    const drop = this.drop!;
    const keep = this.dropAction === 'keep';
    const discard = this.dropAction === 'discard';
    drop.style('drop-keep', {
      backgroundColor: keep ? '#2f5a3c' : '#15211b',
      borderColor: keep ? '#86dc3d' : '#35503f',
      transformScale: keep ? 1.08 : 1,
    });
    drop.style('drop-discard', {
      backgroundColor: discard ? '#5a2f2a' : '#15211b',
      borderColor: discard ? '#e2725b' : '#35503f',
      transformScale: discard ? 1.08 : 1,
    });
  }

  private hideDrop(): void {
    this.dropAction = null;
    this.drop?.show(false);
  }

  private grab(photo: Photo): void {
    // Hold it like a print between the fingers: ahead of and above the palm.
    photo.group.position.copy(PRINT_OFFSET.position);
    photo.group.rotation.set(PRINT_OFFSET.pitch, 0, 0);
    photo.group.updateMatrix();
    holdMount(this.world, 'left', 'print', 'pinch', PRINT_HAND, photo.group.matrix).add(photo.group);
    photo.state = 'held';
    photo.expiry = EXPIRY;
    haptic(this.world, 'left', 0.3, 30);
  }

  private release(photo: Photo): void {
    this.scene.attach(photo.group);
    photo.state = 'floating';
    photo.expiry = EXPIRY;
  }

  /** Leaving Camera drops a held print; prints on the camera stay with it. */
  private dropHeld(): void {
    for (const photo of this.photos) {
      if (photo.state === 'held') {
        this.hideDrop();
        this.release(photo);
      }
    }
  }

  /** Keep a print: it files itself into the garden's album. */
  private save(photo: Photo): void {
    if (!photo.image) {
      // Still encoding: keep it as soon as it is ready.
      photo.saveRequested = true;
      return;
    }
    const gardenId = activeGarden.peek()?.id ?? 'default';
    const at = photo.group.getWorldPosition(new Vector3());
    audio.play('CAMERA_SAVE', at);
    bursts.emit(at, BURST_STYLES.bloom);
    uiKeep();
    // Count and confirm the photo only once the album has it.
    addToAlbum(gardenId, photo.image.blob, photo.image.thumb).then(
      () => {
        record('kept', at);
        showToast('Saved to album', 'Find it in Settings - Photos', '#f6c443', 'left');
      },
      (error: unknown) => {
        console.warn('[flowerbed] could not save photo', error);
        showToast('Photo not saved', 'Browser storage is full or blocked', '#e2725b', 'left');
      },
    );
    this.removePhoto(photo, true, false);
  }

  private removePhoto(photo: Photo, byUser: boolean, playDelete = byUser): void {
    if (playDelete) {
      photo.group.getWorldPosition(this.v);
      audio.play('CAMERA_DELETE', this.v);
    }
    photo.group.removeFromParent();
    ((photo.group.children[1] as Mesh).material as MeshBasicMaterial).dispose();
    this.freeTargets.push(photo.target);
    if (photo.state === 'held') this.hideDrop();
    this.photos.splice(this.photos.indexOf(photo), 1);
    if (byUser) {
      photoEvents.cleared += 1;
      photoEvents.listeners.forEach((listener) => listener('cleared'));
    }
  }
}

const tmpQuat = new Quaternion();
const tmpObject = new Object3D();

/**
 * Mint and silver cameras print with a coloured deckle border and a small
 * signature, so their photos look different, not only the camera.
 */
function signPrint(canvas: HTMLCanvasElement): void {
  const color = finishOn('photographer') ? '#e6eaf0' : finishOn('greenthumb') ? '#bff3dc' : null;
  if (!color) return;
  const ctx = canvas.getContext('2d')!;
  const edge = Math.round(Math.min(canvas.width, canvas.height) * 0.035);
  ctx.strokeStyle = color;
  ctx.lineWidth = edge * 2;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(edge, edge, canvas.width - 2 * edge, canvas.height - 2 * edge);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = `italic ${Math.round(edge * 1.1)}px Georgia, serif`;
  ctx.textAlign = 'right';
  ctx.fillText(`Flowerbed - ${new Date().toLocaleDateString()}`, canvas.width - edge * 1.6, canvas.height - edge * 1.6);
}

function toImage(canvas: HTMLCanvasElement): Promise<{ blob: Blob; thumb: string }> {
  signPrint(canvas);
  const thumb = makeThumb(canvas);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve({ blob: blob ?? new Blob(), thumb }), 'image/jpeg', 0.9);
  });
}
