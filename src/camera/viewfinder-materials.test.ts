/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  BoxGeometry,
  DoubleSide,
  FrontSide,
  Material,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  type WebGLRenderer,
} from '@iwsdk/core';
import { renderWithStandIns } from './viewfinder-materials.js';

/** A renderer that records the material each mesh draws with, and writes to it the way three does. */
function fakeRenderer(onDraw?: (material: Material) => void) {
  const drawn: Material[] = [];
  const renderer = {
    render(scene: Scene) {
      scene.traverseVisible((object) => {
        const material = (object as Mesh).material as Material | undefined;
        if (!material) return;
        drawn.push(material);
        onDraw?.(material);
      });
    },
  };
  return { renderer: renderer as unknown as WebGLRenderer, drawn };
}

function setup() {
  const scene = new Scene();
  const material = new MeshBasicMaterial({ color: 0xff0000 });
  const mesh = new Mesh(new BoxGeometry(), material);
  scene.add(mesh);
  return { scene, mesh, material, camera: new PerspectiveCamera() };
}

describe('viewfinder stand-in materials', () => {
  it('draw each mesh with a stand-in, then put its material back', () => {
    const { scene, mesh, material, camera } = setup();
    const { renderer, drawn } = fakeRenderer();
    renderWithStandIns(renderer, scene, camera);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).not.toBe(material);
    expect(mesh.material).toBe(material);
    renderWithStandIns(renderer, scene, camera);
    expect(drawn[1]).toBe(drawn[0]);
  });

  it('share colours and other objects with their material, and copy plain fields at each render', () => {
    const { scene, material, camera } = setup();
    const { renderer, drawn } = fakeRenderer();
    renderWithStandIns(renderer, scene, camera);
    const view = drawn[0] as MeshBasicMaterial;
    expect(view).toBeInstanceOf(MeshBasicMaterial);
    const id = (m: Material) => (m as unknown as { id: number }).id;
    expect(id(view)).toBe(id(material));
    material.color.set(0x00ff00);
    expect(view.color.getHex()).toBe(0x00ff00);
    material.opacity = 0.5;
    material.needsUpdate = true;
    renderWithStandIns(renderer, scene, camera);
    expect(view.opacity).toBe(0.5);
    expect(view.version).toBe(material.version);
    expect(material.opacity).toBe(0.5);
  });

  it("undo three's draw-time writes at the next render", () => {
    const { scene, material, camera } = setup();
    material.side = DoubleSide;
    let write = true;
    const { renderer, drawn } = fakeRenderer((m) => {
      if (!write) return;
      // three's two-pass double-sided transparency, then the uniform upload flag
      m.side = FrontSide;
      m.needsUpdate = true;
      (m as unknown as { uniformsNeedUpdate: boolean }).uniformsNeedUpdate = false;
    });
    renderWithStandIns(renderer, scene, camera);
    const view = drawn[0];
    expect(material.side).toBe(DoubleSide);
    write = false;
    renderWithStandIns(renderer, scene, camera);
    expect(view.side).toBe(DoubleSide);
    expect(view.version).toBe(material.version);
  });

  it('skip meshes the camera does not see and hidden ones', () => {
    const { scene, mesh, material, camera } = setup();
    const other = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    other.layers.set(11);
    const hidden = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    hidden.visible = false;
    scene.add(other, hidden);
    const seen: Material[] = [];
    const renderer = {
      render: () => seen.push(mesh.material as Material, other.material as Material, hidden.material as Material),
    } as unknown as WebGLRenderer;
    renderWithStandIns(renderer, scene, camera);
    expect(seen[0]).not.toBe(material);
    expect(seen[1]).toBe(other.material);
    expect(seen[2]).toBe(hidden.material);
  });

  it('stand in for each material of a multi-material mesh, reusing the array', () => {
    const scene = new Scene();
    const materials = [new MeshBasicMaterial(), new MeshBasicMaterial()];
    const mesh = new Mesh(new BoxGeometry(), materials);
    scene.add(mesh);
    const seen: Material[][] = [];
    const renderer = { render: () => seen.push(mesh.material as Material[]) } as unknown as WebGLRenderer;
    renderWithStandIns(renderer, scene, new PerspectiveCamera());
    renderWithStandIns(renderer, scene, new PerspectiveCamera());
    expect(seen[0]).not.toBe(materials);
    expect(seen[0][0]).not.toBe(materials[0]);
    expect(seen[1]).toBe(seen[0]);
    expect(mesh.material).toBe(materials);
  });

  it('restore the materials when the render throws', () => {
    const { scene, mesh, material, camera } = setup();
    const renderer = {
      render: () => {
        throw new Error('lost context');
      },
    } as unknown as WebGLRenderer;
    expect(() => renderWithStandIns(renderer, scene, camera)).toThrow('lost context');
    expect(mesh.material).toBe(material);
  });

  it('are disposed with their material', () => {
    const { scene, material, camera } = setup();
    const { renderer, drawn } = fakeRenderer();
    renderWithStandIns(renderer, scene, camera);
    const disposed = vi.fn();
    drawn[0].addEventListener('dispose', disposed);
    material.dispose();
    expect(disposed).toHaveBeenCalledTimes(1);
  });
});
