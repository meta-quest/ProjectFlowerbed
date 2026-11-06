/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Runtime UIKitML panels: load a manifest panel, wrap it in a transform
 * entity, and make it ray-interactable. Panels are ticked by updatePanels(),
 * which index.ts installs as PanelUISystem's update.
 */

import {
  Object3D,
  RayInteractable,
  UIKit,
  loadUIKitMLAsset,
  type Entity,
  type UIKitMLAsset,
  type World,
} from '@iwsdk/core';
import { clickingHand, haptic } from '../core/input.js';
import { easeOutBack, tween } from '../core/tween.js';
import { uiConfirm, uiTick } from '../core/ui-sounds.js';
import { theme } from '@pmndrs/uikit-horizon';

// Toggles: "on" uses the same leaf green as selected tabs and chips. The
// kit only reads `.value` from its theme leaves, so a fixed value works.
const toggleTheme = theme.component.toggle as unknown as {
  background: Record<string, { value: string }>;
  handle: Record<string, { value: string }>;
};
toggleTheme.background.selected = { value: '#86dc3d' };
toggleTheme.handle.selected = { value: '#10200f' };

/** Every panel this module spawned. */
const assets = new Set<UIKitMLAsset>();

function inView(object: Object3D, world: World): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
    if (node === world.scene || node === world.camera) return true;
  }
  return false;
}

/**
 * Tick visible panels. IWSDK's PanelUISystem walks the whole scene graph
 * every frame to find documents and ticks hidden ones too (~1 ms of Quest
 * CPU); every panel here comes from spawnPanel, so a registry suffices.
 */
export function updatePanels(world: World, deltaMs: number): void {
  for (const asset of assets) {
    if (asset.document.disposed) assets.delete(asset);
    else if (inView(asset, world)) asset.document.rootElement.update?.(deltaMs);
  }
}

export interface SpawnedPanel {
  /** Null for passive panels attached directly to an Object3D. */
  entity: Entity | null;
  root: Object3D;
  asset: UIKitMLAsset;
  el<T extends UIKit.Component = UIKit.Component>(id: string): T;
  text(id: string, value: string): void;
  style(id: string, props: Record<string, unknown>): void;
  on(id: string, event: string, handler: (e?: unknown) => void): () => void;
  show(visible: boolean): void;
  /** Logical visibility (true during the show animation, false during hide). */
  readonly shown: boolean;
}

export async function spawnPanel(
  world: World,
  assetId: string,
  options: {
    scale?: number;
    interactive?: boolean;
    parent?: Entity;
    /** Passive panels may ride a plain Object3D (no entity, no rays). */
    attachTo?: Object3D;
    /** Scale-in/out when shown or hidden (default true). */
    animate?: boolean;
  } = {},
): Promise<SpawnedPanel> {
  const asset = await loadUIKitMLAsset(assetId, {
    kit: 'horizon',
    preferredColorScheme: 'dark',
  });
  assets.add(asset);
  const root = new Object3D();
  root.name = `panel:${assetId}`;
  root.add(asset);
  // A UIKit panel is hundreds of nodes; skip its matrices while hidden
  // (they recompute the frame it shows).
  const updateMatrixWorld = root.updateMatrixWorld.bind(root);
  root.updateMatrixWorld = (force?: boolean) => {
    if (root.visible) updateMatrixWorld(force);
  };
  root.scale.setScalar(options.scale ?? 1);
  // Parenting goes through the entity hierarchy; the transform system owns it.
  let entity: Entity | null = null;
  if (options.attachTo) {
    options.attachTo.add(root);
  } else {
    entity = world.createTransformEntity(root, {
      parent: options.parent,
      persistent: true,
    });
    if (options.interactive !== false) entity.addComponent(RayInteractable);
  }
  let shown = root.visible;
  const cache = new Map<string, UIKit.Component>();
  const el = <T extends UIKit.Component>(id: string): T => {
    let found = cache.get(id);
    if (!found) {
      found = asset.requireElementById<UIKit.Component>(id);
      cache.set(id, found);
    }
    return found as T;
  };
  return {
    get shown() {
      return shown;
    },
    entity,
    root,
    asset,
    el,
    text: (id, value) => el(id).setProperties({ text: value } as never),
    style: (id, props) => el(id).setProperties(props as never),
    on: (id, event, handler) => {
      const target = el(id);
      // Every clickable gets a hover tick + haptic and a confirm chime.
      const wrapped =
        event === 'click'
          ? (e?: unknown) => {
              uiConfirm();
              haptic(world, clickingHand(world), 0.3, 25);
              handler(e);
            }
          : handler;
      const hover = () => {
        uiTick();
        haptic(world, clickingHand(world), 0.06, 8);
      };
      target.addEventListener(event as never, wrapped as never);
      if (event === 'click') target.addEventListener('pointerenter' as never, hover as never);
      return () => {
        target.removeEventListener(event as never, wrapped as never);
        if (event === 'click') target.removeEventListener('pointerenter' as never, hover as never);
      };
    },
    show: (visible) => {
      const base = options.scale ?? 1;
      if (options.animate !== false && visible !== shown) {
        shown = visible;
        if (visible) {
          root.visible = true;
          tween(root, base * 0.88, base, 0.18, (v) => root.scale.setScalar(v), { ease: easeOutBack });
        } else {
          tween(root, root.scale.x, base * 0.9, 0.12, (v) => root.scale.setScalar(v), {
            done: () => {
              if (!shown) root.visible = false;
            },
          });
        }
      } else if (options.animate === false) {
        root.visible = visible;
      }
      if (!entity || options.interactive === false) return;
      // Hidden panels must not catch rays.
      if (visible && !entity.hasComponent(RayInteractable)) {
        entity.addComponent(RayInteractable);
      } else if (!visible && entity.hasComponent(RayInteractable)) {
        entity.removeComponent(RayInteractable);
      }
    },
  };
}
