/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Photo displays (new): any kept photo can stand in the garden on a small
 * wooden easel, facing where you stood when you placed it. Displays belong
 * to the garden and persist with it. Grab an easel with the ray to move it:
 * a ring on the ground shows where it will land (red where it cannot
 * stand), and it settles facing you. Goal finishes turn the frames gold
 * and the wood to walnut.
 *
 * Each easel is built once around its photo's aspect ratio (bevelled frame,
 * turned legs, a ledge carrying a brass name plaque); nothing runs per frame
 * except the drop ring while one is held.
 */

import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DistanceGrabbable,
  ExtrudeGeometry,
  Grabbed,
  GrabSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MovementMode,
  PlaneGeometry,
  RayInteractable,
  RingGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  Texture,
  Vector3,
  createSystem,
  signal,
  type CubeTexture,
  type Entity,
  type Material,
} from '@iwsdk/core';
import { PhotoEasel, Plant } from '../components/garden.js';
import { audio } from '../core/audio.js';
import { BURST_STYLES, bursts } from '../core/bursts.js';
import { Layer, collisionWorld, createHit } from '../core/colliders.js';
import { haptic, selectDown, type Hand } from '../core/input.js';
import { blink, byInput, showToast, timePreset } from '../core/state.js';
import { tween } from '../core/tween.js';
import { uiBloom, uiDeny, uiWood } from '../core/ui-sounds.js';
import { activeGarden } from '../gardening/garden-system.js';
import {
  CHAMPION_COLOR,
  RIBBON_COLORS,
  finishOn,
  onFinishChange,
  record,
  recordBest,
  weekly,
} from '../gardening/progress.js';
import { toolEnvMap } from '../world/island-state.js';
import { albumPhotos, getAlbumBlob } from './photo-album.js';
import { teleportPlayer } from '../core/locomotion-bridge.js';

export interface PhotoDisplay {
  photoId: string;
  position: [number, number, number];
  yaw: number;
}

const MAX_DISPLAYS = 6;
/** Displays in the active garden (GardenSystem loads and saves them). */
export const displays = signal<PhotoDisplay[]>([]);

export const displayCommands = {
  show: (_photoId: string) => {},
  remove: (_photoId: string) => {},
  /** Teleport to stand in front of a photo's easel. */
  visit: (_photoId: string) => {},
  /** Visit every easel in turn, then come back. */
  tour: () => {},
};

/** Seconds spent at each easel on a garden tour. */
const TOUR_STOP = 5;

/** Long edge of the print, metres. */
const PRINT = 0.44;
/** Frame moulding width. */
const MOULD = 0.035;
const FRAME_Y = 1.08;
const TILT = -0.12;
/** Keep easels this far from plants and from each other. */
const PLANT_CLEARANCE = 0.45;
const EASEL_CLEARANCE = 0.6;
const BED = /planter|circular|long_/i;
/** Mat border inside the frame, as a fraction of the print's long edge. */
const MAT = 0.065;
/** Prints glow a little so they read like the photo, less so at night. */
const PRINT_GLOW = { morning: 0.5, sunset: 0.45, night: 0.1 };
/** Easel feet in its local space (front legs, back prop). */
const FEET: [number, number][] = [
  [-0.3, 0.12],
  [0.3, 0.12],
  [0, -0.42],
];

interface Easel {
  group: Group;
  aspect: number;
  photo: MeshStandardMaterial;
  plaque: MeshStandardMaterial;
  geometries: BufferGeometry[];
}

export class PhotoDisplaySystem extends createSystem({
  held: { required: [PhotoEasel, Grabbed] },
  plants: { required: [Plant] },
}) {
  private easels = new Map<string, Easel>();
  private entities = new Map<string, Entity>();
  private textures = new Map<string, Texture>();
  private hit = createHit();
  private from = new Vector3();
  private to = new Vector3();
  private ground = new Vector3();
  private v = new Vector3();
  private dir = new Vector3();
  private grain = woodGrain();
  private wood = new MeshStandardMaterial({ color: 0xc08a5a, map: this.grain, roughness: 0.55 });
  private walnut = new MeshStandardMaterial({ color: 0x6a4630, map: this.grain, roughness: 0.45 });
  private mat = new MeshStandardMaterial({ color: 0xf1e8d6, roughness: 0.9 });
  private gold = new MeshStandardMaterial({ color: 0xe8b84a, roughness: 0.3, metalness: 0.85 });
  private ring = new Mesh(
    new RingGeometry(0.2, 0.25, 40).rotateX(-Math.PI / 2),
    // Drawn over everything so the held easel cannot hide it.
    new MeshBasicMaterial({ color: 0x86dc3d, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false }),
  );
  private feet = new Vector3();
  /** The hand holding an easel, for release haptics. */
  private holder: Hand = 'right';

  override init(): void {
    this.ring.visible = false;
    this.ring.renderOrder = 20;
    this.scene.add(this.ring);
    displayCommands.show = (photoId) => this.place(photoId);
    displayCommands.remove = (photoId) => {
      displays.value = displays.peek().filter((d) => d.photoId !== photoId);
    };
    displayCommands.visit = (photoId) => this.visit(photoId);
    displayCommands.tour = () => this.startTour();
    this.cleanupFuncs.push(
      displays.subscribe((list) => this.sync(list)),
      onFinishChange(() => this.refinish()),
      toolEnvMap.subscribe((map) => this.applyEnv(map)),
      weekly.subscribe(() => {
        // Redraw plaques when a ribbon is won.
        for (const [id, easel] of this.easels) {
          easel.plaque.map?.dispose();
          easel.plaque.map = this.plaqueTexture(id);
          easel.plaque.needsUpdate = true;
        }
      }),
      timePreset.subscribe((preset) => {
        for (const easel of this.easels.values()) easel.photo.emissiveIntensity = PRINT_GLOW[preset];
      }),
      this.queries.held.subscribe('disqualify', (entity) => this.settle(entity)),
      // Pickup cue: a light knock and a tick on the hand.
      this.queries.held.subscribe('qualify', (entity) => {
        const hand = this.world.getSystem(GrabSystem)?.getHolderHand(entity);
        if (hand === 'left' || hand === 'right') this.holder = hand;
        uiWood(1.35);
        haptic(this.world, this.holder, 0.25, 30);
      }),
    );
  }

  override update(delta: number): void {
    this.tickTour(delta);
    // While an easel is held, a ring marks where it would land.
    let shown = false;
    for (const entity of this.queries.held.entities) {
      const object = entity.object3D!;
      const id = entity.getValue(PhotoEasel, 'photoId') ?? '';
      const ok = this.spotFor(object.position.x, object.position.z, object.position.y + 0.5, id);
      const hand = this.world.getSystem(GrabSystem)?.getHolderHand(entity);
      if (hand === 'left' || hand === 'right') this.holder = hand;
      if (!ok) {
        this.from.set(object.position.x, object.position.y + 1.5, object.position.z);
        this.to.set(object.position.x, object.position.y - 4, object.position.z);
        if (!collisionWorld.raySegment(this.from, this.to, Layer.Obstacle, this.hit)) continue;
      }
      this.ring.position.copy(ok ? this.ground : this.hit.point);
      this.ring.position.y += 0.02;
      (this.ring.material as MeshBasicMaterial).color.setHex(ok ? 0x86dc3d : 0xef6a4f);
      shown = true;
    }
    this.ring.visible = shown;
  }

  /** Stand a new easel in front of the player, facing them. */
  private place(photoId: string): void {
    if (displays.peek().some((d) => d.photoId === photoId)) return;
    if (displays.peek().length >= MAX_DISPLAYS) {
      showToast('Gallery full', `Up to ${MAX_DISPLAYS} photos can stand in one garden`, '#ef8a6f', 'left');
      return;
    }
    const head = this.world.player.head;
    head.getWorldPosition(this.v);
    head.getWorldDirection(this.dir).negate();
    this.dir.y = 0;
    this.dir.normalize();
    // Open ground in front (lawn or path; not water, beds or plants).
    let spot: Vector3 | null = null;
    for (const distance of [1.3, 1.0, 1.7, 0.8, 2.2]) {
      for (const side of [0, 0.5, -0.5, 1, -1]) {
        const x = this.v.x + this.dir.x * distance - this.dir.z * side;
        const z = this.v.z + this.dir.z * distance + this.dir.x * side;
        if (this.spotFor(x, z, this.v.y, photoId)) {
          spot = this.ground.clone();
          break;
        }
      }
      if (spot) break;
    }
    if (!spot) {
      uiDeny();
      showToast('No room here', 'Stand on open lawn or a path to place a photo', '#ef8a6f', 'left');
      return;
    }
    const yaw = Math.atan2(this.v.x - spot.x, this.v.z - spot.z);
    const next = [...displays.peek(), { photoId, position: [spot.x, spot.y, spot.z] as [number, number, number], yaw }];
    displays.value = next;
    recordBest('displayed', next.length);
    record('displaysPlaced');
    bursts.emit(this.v.set(spot.x, spot.y + 0.9, spot.z), BURST_STYLES.bloom);
    uiBloom(0.05);
    showToast('On display', 'Grab the easel with your ray to move it', '#f6c443', 'left');
  }

  /**
   * Whether an easel can stand at (x, z): walkable lawn or path, not water,
   * a planter bed, or crowding a plant or another easel. Leaves the ground
   * point in `this.ground`.
   */
  private spotFor(x: number, z: number, fromY: number, self: string, yaw = this.yawTo(x, z)): boolean {
    if (!this.groundOk(x, z, fromY)) return false;
    this.ground.copy(this.hit.point);
    // All three feet need the same kind of ground, at about the same height.
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    for (const [fx, fz] of FEET) {
      const wx = x + fx * cos + fz * sin;
      const wz = z - fx * sin + fz * cos;
      if (!this.groundOk(wx, wz, fromY) || Math.abs(this.hit.point.y - this.ground.y) > 0.12) return false;
    }
    this.hit.point.copy(this.ground);
    for (const plant of this.queries.plants.entities) {
      const p = plant.object3D!.position;
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < PLANT_CLEARANCE ** 2) return false;
    }
    for (const display of displays.peek()) {
      if (display.photoId === self) continue;
      const [dx, , dz] = display.position;
      if ((dx - x) ** 2 + (dz - z) ** 2 < EASEL_CLEARANCE ** 2) return false;
    }
    return true;
  }

  private groundOk(x: number, z: number, fromY: number): boolean {
    this.from.set(x, fromY + 1, z);
    this.to.set(x, fromY - 4, z);
    if (!collisionWorld.raySegment(this.from, this.to, Layer.Obstacle | Layer.Plant, this.hit)) return false;
    if (!(this.hit.layers & (Layer.Teleport | Layer.Plantable))) return false;
    return !BED.test(this.hit.mesh?.name ?? '');
  }

  /** Yaw that faces the player's head from (x, z). */
  private yawTo(x: number, z: number): number {
    this.world.player.head.getWorldPosition(this.feet);
    return Math.atan2(this.feet.x - x, this.feet.z - z);
  }

  private tour: { index: number; timer: number; home: Vector3; homeYaw: number } | null = null;

  private startTour(): void {
    const list = displays.peek();
    if (!list.length) return;
    // Music softens for the tour and returns when it ends.
    audio.setMusicDuck(0.4);
    record('tours');
    this.tour = {
      index: -1,
      timer: 0,
      home: this.world.player.position.clone(),
      homeYaw: this.world.player.rotation.y,
    };
  }

  /** Garden tour: stand before each easel for a few seconds; trigger ends it. */
  private tickTour(delta: number): void {
    const tour = this.tour;
    if (!tour) return;
    const stop = tour.index >= 0 && (selectDown(this.world, 'right') || selectDown(this.world, 'left'));
    tour.timer -= delta;
    if (!stop && tour.timer > 0) return;
    const list = displays.peek();
    tour.index++;
    if (stop || tour.index >= list.length) {
      // Back to where the tour started.
      this.tour = null;
      this.caption.visible = false;
      audio.setMusicDuck(1);
      this.teleportTo(tour.home, tour.homeYaw);
      showToast('Tour finished', 'Back where you started', '#f6c443', 'left');
      return;
    }
    tour.timer = TOUR_STOP;
    const stopAt = list[tour.index];
    this.visit(stopAt.photoId);
    this.showCaption(stopAt, tour.index + 1, list.length);
    if (tour.index === 0)
      showToast(
        'Garden tour',
        byInput('Pull a trigger any time to end it', 'Pinch any time to end it'),
        '#f6c443',
        'left',
      );
  }

  private captionCanvas = document.createElement('canvas');
  private captionTexture = new CanvasTexture(this.captionCanvas);
  private caption = new Mesh(
    new PlaneGeometry(0.6, 0.15),
    new MeshBasicMaterial({ map: this.captionTexture, transparent: true, depthWrite: false }),
  );

  /** A floating caption above the easel during a tour stop. */
  private showCaption(display: PhotoDisplay, index: number, total: number): void {
    const canvas = this.captionCanvas;
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = 'rgba(17, 26, 22, 0.88)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 120, 28);
    ctx.fill();
    ctx.fillStyle = '#f6f3ea';
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px sans-serif';
    const photo = albumPhotos.peek().find((p) => p.id === display.photoId);
    const when = photo ? new Date(photo.created).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : '';
    ctx.fillText(`${activeGarden.peek()?.name ?? 'Garden'} - ${when}`, 256, 58);
    ctx.fillStyle = '#f6c443';
    ctx.font = '30px sans-serif';
    ctx.fillText(`Stop ${index} of ${total}`, 256, 100);
    this.captionTexture.colorSpace = SRGBColorSpace;
    this.captionTexture.needsUpdate = true;
    const [x, y, z] = display.position;
    this.caption.position.set(x, y + 1.85, z);
    this.caption.rotation.set(0, display.yaw, 0);
    this.caption.renderOrder = 15;
    this.caption.visible = true;
    const material = this.caption.material as MeshBasicMaterial;
    tween(material, 0, 1, 0.6, (v) => (material.opacity = v));
    if (!this.caption.parent) this.scene.add(this.caption);
  }

  private teleportTo(position: Vector3, yaw: number): void {
    if (!teleportPlayer(this.world, position)) return;
    blink.value = blink.peek() + 1;
    this.world.player.rotation.y = yaw;
  }

  private visit(photoId: string): void {
    const display = displays.peek().find((d) => d.photoId === photoId);
    if (!display) return;
    const [x, y, z] = display.position;
    // Stand 1.4 m in front of the easel.
    this.v.set(x + Math.sin(display.yaw) * 1.4, y, z + Math.cos(display.yaw) * 1.4);
    if (!teleportPlayer(this.world, this.v)) return;
    blink.value = blink.peek() + 1;
    this.world.player.rotation.y = display.yaw - this.world.camera.rotation.y;
  }

  private settle(entity: Entity): void {
    this.ring.visible = false;
    const id = entity.getValue(PhotoEasel, 'photoId') ?? '';
    const easel = this.easels.get(id)?.group;
    const display = displays.peek().find((d) => d.photoId === id);
    if (!easel || !display) return;
    if (!this.spotFor(easel.position.x, easel.position.z, easel.position.y + 0.5, id)) {
      // Glide back to where it stood, with a "no" cue.
      const start = easel.position.clone();
      const target = new Vector3().fromArray(display.position);
      easel.rotation.set(0, display.yaw, 0);
      tween(easel, 0, 1, 0.28, (k) => easel.position.lerpVectors(start, target, k));
      uiDeny();
      haptic(this.world, this.holder, 0.2, 40);
      showToast("Can't stand there", 'Easels need open lawn or a path', '#ef8a6f', this.holder);
      return;
    }
    const ground = this.ground;
    this.world.player.head.getWorldPosition(this.v);
    const yaw = Math.atan2(this.v.x - ground.x, this.v.z - ground.z);
    easel.position.copy(ground);
    easel.rotation.set(0, yaw, 0);
    uiWood(1);
    bursts.emit(ground, BURST_STYLES.poof);
    haptic(this.world, this.holder, 0.45, 50);
    const position: [number, number, number] = [ground.x, ground.y, ground.z];
    displays.value = displays.peek().map((d) => (d.photoId === id ? { ...d, position, yaw } : d));
  }

  private sync(list: PhotoDisplay[]): void {
    const wanted = new Set(list.map((d) => d.photoId));
    for (const [id, easel] of this.easels) {
      if (wanted.has(id)) continue;
      // Wood, mat and gold materials are shared by every easel; this easel's own
      // geometry, photo and plaque are freed below.
      this.entities.get(id)?.dispose({ disposeResources: false });
      this.entities.delete(id);
      easel.group.removeFromParent();
      for (const geometry of easel.geometries) geometry.dispose();
      easel.photo.dispose();
      easel.plaque.map?.dispose();
      easel.plaque.dispose();
      this.easels.delete(id);
      this.textures.get(id)?.dispose();
      this.textures.delete(id);
    }
    for (const display of list) {
      if (this.easels.has(display.photoId)) continue;
      const group = new Group();
      group.name = 'photo-easel';
      group.position.fromArray(display.position);
      group.rotation.y = display.yaw;
      const easel: Easel = {
        group,
        aspect: 1.5,
        // Matte paper: no sun glare bleaching the print.
        photo: new MeshStandardMaterial({ color: 0xdddddd, roughness: 0.9, envMapIntensity: 0.1 }),
        plaque: new MeshStandardMaterial({ map: this.plaqueTexture(display.photoId), roughness: 0.4, metalness: 0.45 }),
        geometries: [],
      };
      this.easels.set(display.photoId, easel);
      this.build(easel);
      const entity = this.world.createTransformEntity(group);
      entity.addComponent(PhotoEasel, { photoId: display.photoId });
      entity.addComponent(RayInteractable);
      entity.addComponent(DistanceGrabbable, {
        movementMode: MovementMode.MoveFromTarget,
        rotate: false,
        scale: false,
      });
      this.entities.set(display.photoId, entity);
      void this.loadTexture(display.photoId);
    }
  }

  private woodMaterial(): Material {
    return finishOn('album') ? this.gold : finishOn('curator') ? this.walnut : this.wood;
  }

  /** (Re)build an easel's meshes around its print's aspect ratio. */
  private build(easel: Easel): void {
    const { group } = easel;
    group.clear();
    for (const geometry of easel.geometries) geometry.dispose();
    easel.geometries = [];
    const keep = <T extends BufferGeometry>(geometry: T): T => {
      easel.geometries.push(geometry);
      return geometry;
    };
    const w = easel.aspect >= 1 ? PRINT : PRINT * easel.aspect;
    const h = easel.aspect >= 1 ? PRINT / easel.aspect : PRINT;
    const wood = this.woodMaterial();
    const woodMesh = (geometry: BufferGeometry) => {
      const mesh = new Mesh(geometry, wood);
      mesh.userData.wood = true;
      mesh.castShadow = true;
      return mesh;
    };

    // Frame, photo and ledge share one tilted pivot.
    const pivot = new Group();
    pivot.position.set(0, FRAME_Y, 0);
    pivot.rotation.x = TILT;
    group.add(pivot);
    pivot.add(woodMesh(keep(bevelledFrame(w, h))));
    // A cream mat around the print, like a framed photograph.
    const mat = new Mesh(keep(new PlaneGeometry(w, h)), this.mat);
    mat.position.z = 0.002;
    pivot.add(mat);
    const border = Math.max(w, h) * MAT;
    const photo = new Mesh(keep(new PlaneGeometry(w - 2 * border, h - 2 * border)), easel.photo);
    photo.position.z = 0.004;
    pivot.add(photo);
    const ledgeWidth = w + 2 * MOULD + 0.05;
    const ledge = woodMesh(keep(new BoxGeometry(ledgeWidth, 0.06, 0.05)));
    ledge.position.set(0, -h / 2 - MOULD - 0.03, 0.012);
    pivot.add(ledge);
    const plaque = new Mesh(keep(new PlaneGeometry(Math.min(0.24, ledgeWidth - 0.03), 0.048)), easel.plaque);
    plaque.position.set(0, ledge.position.y, 0.038);
    pivot.add(plaque);

    // Turned legs: two splayed front legs, a back prop, and a crossbar.
    const top = FRAME_Y + h / 2 + MOULD + 0.07;
    const spread = w / 2 + MOULD;
    const leg = (a: Vector3, b: Vector3, r: number) => {
      const length = a.distanceTo(b);
      const mesh = woodMesh(keep(new CylinderGeometry(r * 0.75, r, length, 10)));
      mesh.position.addVectors(a, b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(UP, this.v.subVectors(a, b).normalize());
      group.add(mesh);
    };
    for (const side of [-1, 1]) {
      leg(new Vector3(side * spread * 0.62, top, -0.05), new Vector3(side * (spread + 0.08), 0, 0.12), 0.016);
    }
    leg(new Vector3(0, top - 0.12, -0.05), new Vector3(0, 0, -0.42), 0.014);
    const bar = woodMesh(keep(new CylinderGeometry(0.009, 0.009, spread * 2 + 0.1, 8)));
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.38, 0.07);
    group.add(bar);
    this.applyEnv(toolEnvMap.peek());
  }

  private async loadTexture(photoId: string): Promise<void> {
    const blob = await getAlbumBlob(photoId);
    const easel = this.easels.get(photoId);
    if (!blob || !easel) return;
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' });
    if (!this.easels.has(photoId)) return;
    const texture = new Texture(bitmap);
    texture.colorSpace = SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;
    this.textures.set(photoId, texture);
    // Keep the photo's true shape: the whole easel is sized around it.
    easel.aspect = Math.min(2.2, Math.max(0.45, bitmap.width / bitmap.height));
    this.build(easel);
    easel.photo.map = texture;
    easel.photo.emissiveMap = texture;
    easel.photo.emissive.set(0xffffff);
    easel.photo.emissiveIntensity = PRINT_GLOW[timePreset.peek()];
    easel.photo.color.set(0xffffff);
    easel.photo.needsUpdate = true;
  }

  /** A brass plaque for the ledge: garden name and date, sized to read at arm's length. */
  private plaqueTexture(photoId: string): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 104;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 104);
    gradient.addColorStop(0, '#d9b469');
    gradient.addColorStop(1, '#a87e3a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 104);
    ctx.strokeStyle = '#6e4f1f';
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, 496, 88);
    if (weekly.peek().ribbons >= 15) {
      // 15 ribbons: a gold ribbon trims every plaque.
      ctx.strokeStyle = CHAMPION_COLOR;
      ctx.lineWidth = 7;
      ctx.strokeRect(2, 2, 508, 100);
    }
    ctx.fillStyle = '#2e2010';
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px Georgia, serif';
    ctx.fillText(activeGarden.peek()?.name ?? 'My garden', 256, 52);
    const photo = albumPhotos.peek().find((p) => p.id === photoId);
    ctx.font = '28px Georgia, serif';
    if (photo) {
      ctx.fillText(
        new Date(photo.created).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
        256,
        86,
      );
    }
    // Weekly ribbons won show as little rosettes at the plaque's ends.
    const won = weekly.peek().ribbons;
    const ribbons = Math.min(3, won);
    // Best first: a gold champion rosette leads once you have five.
    const colors = [...(won >= 5 ? [CHAMPION_COLOR] : []), ...RIBBON_COLORS];
    for (let i = 0; i < ribbons; i++) {
      for (const x of [40 + i * 26, 472 - i * 26]) {
        ctx.beginPath();
        ctx.arc(x, 52, 13, 0, Math.PI * 2);
        ctx.fillStyle = colors[i];
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, 52, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#f3d27a';
        ctx.fill();
      }
    }
    if (won > 3) {
      // More ribbons than fit: the count under the rosettes, both ends.
      ctx.font = 'bold 16px Georgia, serif';
      ctx.fillStyle = '#2e2010';
      for (const x of [66, 446]) ctx.fillText(`x${won}`, x, 88);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  private applyEnv(map: CubeTexture | null): void {
    for (const material of [this.wood, this.walnut, this.gold, this.mat]) {
      if (material.envMap === map) continue;
      material.envMap = map;
      material.needsUpdate = true;
    }
    for (const easel of this.easels.values()) {
      for (const material of [easel.photo, easel.plaque]) {
        if (material.envMap === map) continue;
        material.envMap = map;
        material.needsUpdate = true;
      }
    }
  }

  private refinish(): void {
    const material = this.woodMaterial();
    for (const easel of this.easels.values()) {
      easel.group.traverse((node) => {
        if (node.userData.wood) (node as Mesh).material = material;
      });
    }
  }
}

const UP = new Vector3(0, 1, 0);

/** A picture frame with a bevelled moulding and a backing board. */
function bevelledFrame(w: number, h: number): BufferGeometry {
  const ow = w / 2 + MOULD;
  const oh = h / 2 + MOULD;
  const shape = new Shape();
  shape.moveTo(-ow, -oh);
  shape.lineTo(ow, -oh);
  shape.lineTo(ow, oh);
  shape.lineTo(-ow, oh);
  shape.lineTo(-ow, -oh);
  const hole = new Shape();
  hole.moveTo(-w / 2, -h / 2);
  hole.lineTo(-w / 2, h / 2);
  hole.lineTo(w / 2, h / 2);
  hole.lineTo(w / 2, -h / 2);
  hole.lineTo(-w / 2, -h / 2);
  shape.holes.push(hole);
  const moulding = new ExtrudeGeometry(shape, {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.007,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 1,
  });
  moulding.translate(0, 0, -0.006);
  // Backing board behind the print.
  const back = new BoxGeometry(w + 0.01, h + 0.01, 0.006).translate(0, 0, -0.004);
  const merged = mergeTwo(moulding.toNonIndexed(), back.toNonIndexed());
  moulding.dispose();
  back.dispose();
  return merged;
}

function mergeTwo(a: BufferGeometry, b: BufferGeometry): BufferGeometry {
  const merged = new BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const A = a.attributes[name].array as Float32Array;
    const B = b.attributes[name].array as Float32Array;
    const data = new Float32Array(A.length + B.length);
    data.set(A, 0);
    data.set(B, A.length);
    merged.setAttribute(
      name,
      new (a.attributes[name].constructor as typeof import('@iwsdk/core').BufferAttribute)(
        data,
        a.attributes[name].itemSize,
      ),
    );
  }
  merged.computeBoundingSphere();
  a.dispose();
  b.dispose();
  return merged;
}

/** Fine vertical wood grain, drawn once. */
function woodGrain(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#d9d0c4';
  ctx.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 64;
    ctx.strokeStyle = `rgba(90, 60, 35, ${0.12 + Math.random() * 0.22})`;
    ctx.lineWidth = 0.6 + Math.random() * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y <= 256; y += 32) ctx.lineTo(x + Math.sin(y * 0.03 + i) * 2.5, y);
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}
