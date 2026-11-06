/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Re-rig the Flowerbed glove onto the WebXR hand skeleton (25 joints, flat,
// WebXR names and axis convention), keeping the authored skin weights.
//   node scripts/glove-rerig/rerig.mjs [outDir]
// Reference skeletons: ref/{left,right}.glb, the WebXR generic hand (see ref/README.md).
// Writes glove-left / glove-right (.gltf + .bin), by default next to the
// original asset in public/flowerbed/models/hands.
import fs from 'node:fs';
import path from 'node:path';
import { loadGltf, worldMatrices, accessor, THREE } from './gl.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const SRC = path.join(ROOT, 'public/flowerbed/models/hands/PlayerElement_Hand_Left.gltf');
const REF = (side) => path.join(ROOT, `scripts/glove-rerig/ref/${side}.glb`);
const OUT_DIR = process.argv[2] ?? path.join(ROOT, 'public/flowerbed/models/hands');
fs.mkdirSync(OUT_DIR, { recursive: true });

const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const CAP = { index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Pinky' };
// WebXR joint order (XRHand iteration order).
const JOINTS = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'];
for (const f of FINGERS) {
  for (const j of ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'])
    JOINTS.push(`${f}-finger-${j}`);
}

// Glove bone -> WebXR joint (weights move with it). The glove thumb has an
// extra mid-metacarpal joint (A); by length fraction it belongs to the
// metacarpal, so B is the MCP (proximal) and C the IP (distal).
const WEIGHT_MAP = {
  Arm: 'wrist',
  Wrist: 'wrist',
  Thumb_Metacarpal: 'thumb-metacarpal',
  Thumb_A: 'thumb-metacarpal',
  Thumb_B: 'thumb-phalanx-proximal',
  Thumb_C: 'thumb-phalanx-distal',
};
for (const f of FINGERS) {
  WEIGHT_MAP[`${CAP[f]}_Metacarpal`] = `${f}-finger-metacarpal`;
  WEIGHT_MAP[`${CAP[f]}_A`] = `${f}-finger-phalanx-proximal`;
  WEIGHT_MAP[`${CAP[f]}_B`] = `${f}-finger-phalanx-intermediate`;
  WEIGHT_MAP[`${CAP[f]}_C`] = `${f}-finger-phalanx-distal`;
}
// Where each WebXR joint sits on the glove (glove bone origin), tips computed.
const POSITION_FROM = {
  wrist: 'Wrist',
  'thumb-metacarpal': 'Thumb_Metacarpal',
  'thumb-phalanx-proximal': 'Thumb_B',
  'thumb-phalanx-distal': 'Thumb_C',
};
for (const f of FINGERS) {
  POSITION_FROM[`${f}-finger-metacarpal`] = `${CAP[f]}_Metacarpal`;
  POSITION_FROM[`${f}-finger-phalanx-proximal`] = `${CAP[f]}_A`;
  POSITION_FROM[`${f}-finger-phalanx-intermediate`] = `${CAP[f]}_B`;
  POSITION_FROM[`${f}-finger-phalanx-distal`] = `${CAP[f]}_C`;
}
const NEXT = {};
for (const chain of [
  ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  ...FINGERS.map((f) =>
    ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((j) => `${f}-finger-${j}`),
  ),
]) {
  for (let i = 0; i < chain.length - 1; i++) NEXT[chain[i]] = chain[i + 1];
}

// ---- 1. Bake the glove's bind pose into one space (skinning formula). ----
const g = loadGltf(SRC);
const W = worldMatrices(g.json);
const prim = g.json.meshes[0].primitives[0];
const skin = g.json.skins[0];
const ibm = accessor(g, skin.inverseBindMatrices);
const jointMatrix = skin.joints.map((node, i) => W[node].clone().multiply(new THREE.Matrix4().fromArray(ibm, i * 16)));
const pos = accessor(g, prim.attributes.POSITION);
const nor = accessor(g, prim.attributes.NORMAL);
const tan = accessor(g, prim.attributes.TANGENT);
const uv = accessor(g, prim.attributes.TEXCOORD_0);
const col = accessor(g, prim.attributes.COLOR_0);
const jnt = accessor(g, prim.attributes.JOINTS_0);
const wgt = accessor(g, prim.attributes.WEIGHTS_0);
const idx = accessor(g, prim.indices);
const count = pos.length / 3;

const bindPos = new Float32Array(count * 3);
const bindNor = new Float32Array(count * 3);
const bindTan = new Float32Array(count * 4);
const m = new THREE.Matrix4();
const nm = new THREE.Matrix3();
const v = new THREE.Vector3();
let mirroredBind = false;
for (let i = 0; i < count; i++) {
  m.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  for (let k = 0; k < 4; k++) {
    const w = wgt[i * 4 + k];
    if (w <= 0) continue;
    const e = jointMatrix[jnt[i * 4 + k]].elements;
    for (let c = 0; c < 16; c++) m.elements[c] += e[c] * w;
  }
  if (i === 0) mirroredBind = m.determinant() < 0;
  v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(m);
  bindPos.set([v.x, v.y, v.z], i * 3);
  nm.getNormalMatrix(m);
  v.set(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2])
    .applyMatrix3(nm)
    .normalize();
  bindNor.set([v.x, v.y, v.z], i * 3);
  v.set(tan[i * 4], tan[i * 4 + 1], tan[i * 4 + 2]).transformDirection(m);
  bindTan.set([v.x, v.y, v.z, tan[i * 4 + 3] * (mirroredBind ? -1 : 1)], i * 4);
}
// A mirrored bind flips triangle winding; restore outward-facing fronts.
const indices = Uint32Array.from(idx);
if (mirroredBind)
  for (let t = 0; t < indices.length; t += 3) [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]];
console.log('bind mirrored:', mirroredBind, 'vertices', count);

// ---- 2. Remap weights to WebXR joints (merge duplicates, renormalize). ----
const oldName = skin.joints.map((n) => g.json.nodes[n].name);
const newJoints = new Uint8Array(count * 4);
const newWeights = new Float32Array(count * 4);
for (let i = 0; i < count; i++) {
  const acc = new Map();
  for (let k = 0; k < 4; k++) {
    const w = wgt[i * 4 + k];
    if (w <= 0) continue;
    const target = JOINTS.indexOf(WEIGHT_MAP[oldName[jnt[i * 4 + k]]]);
    acc.set(target, (acc.get(target) ?? 0) + w);
  }
  const sorted = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = sorted.reduce((s, [, w]) => s + w, 0);
  sorted.forEach(([j, w], k) => {
    newJoints[i * 4 + k] = j;
    newWeights[i * 4 + k] = w / sum;
  });
}

// ---- 3. Joint positions on the glove (bones + fingertips from the mesh). ----
const gloveNode = (name) => g.json.nodes.findIndex((n) => n.name === name);
const P = {};
for (const [joint, bone] of Object.entries(POSITION_FROM))
  P[joint] = new THREE.Vector3().setFromMatrixPosition(W[gloveNode(bone)]);
const tipFrom = (distal, tipJoint, prev) => {
  const j = JOINTS.indexOf(distal);
  const dir = P[distal].clone().sub(P[prev]).normalize();
  let reach = 0;
  for (let i = 0; i < count; i++) {
    if (newJoints[i * 4] !== j || newWeights[i * 4] < 0.5) continue;
    reach = Math.max(
      reach,
      v
        .set(bindPos[i * 3], bindPos[i * 3 + 1], bindPos[i * 3 + 2])
        .sub(P[distal])
        .dot(dir),
    );
  }
  // The WebXR tip sits just inside the fingertip surface.
  P[tipJoint] = P[distal].clone().addScaledVector(dir, reach * 0.85);
};
tipFrom('thumb-phalanx-distal', 'thumb-tip', 'thumb-phalanx-proximal');
for (const f of FINGERS) tipFrom(`${f}-finger-phalanx-distal`, `${f}-finger-tip`, `${f}-finger-phalanx-intermediate`);

// ---- 4. Joint frames: reference frames aligned at the wrist, then swung
// so each joint's -Z follows the glove's own bone. ----
function landmarkFrame(get) {
  const wrist = get('wrist');
  const forward = get('middle-finger-phalanx-proximal').sub(wrist).normalize();
  const across = get('index-finger-metacarpal').sub(get('pinky-finger-metacarpal'));
  across.addScaledVector(forward, -across.dot(forward)).normalize();
  const normal = new THREE.Vector3().crossVectors(forward, across);
  return new THREE.Matrix4().makeBasis(across, normal, forward);
}
function buildSkeleton(side, positions) {
  const ref = loadGltf(REF(side));
  const RW = worldMatrices(ref.json);
  const refNode = (name) => RW[ref.json.nodes.findIndex((n) => n.name === name)];
  const refPos = (name) => new THREE.Vector3().setFromMatrixPosition(refNode(name));
  const align = landmarkFrame((n) => positions[n].clone()).multiply(landmarkFrame(refPos).transpose());
  const alignQ = new THREE.Quaternion().setFromRotationMatrix(align);
  const frames = {};
  for (const joint of JOINTS) {
    const q = new THREE.Quaternion().setFromRotationMatrix(refNode(joint)).premultiply(alignQ);
    const next = NEXT[joint];
    if (next) {
      const minusZ = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      const dir = positions[next].clone().sub(positions[joint]).normalize();
      q.premultiply(new THREE.Quaternion().setFromUnitVectors(minusZ, dir));
    }
    frames[joint] = q;
  }
  // Tips take their distal joint's orientation.
  frames['thumb-tip'] = frames['thumb-phalanx-distal'].clone();
  for (const f of FINGERS) frames[`${f}-finger-tip`] = frames[`${f}-finger-phalanx-distal`].clone();
  return JOINTS.map((j) => new THREE.Matrix4().compose(positions[j], frames[j], new THREE.Vector3(1, 1, 1)));
}

// ---- 5. Write glTF (flat joints under one root, like the generic hand). ----
function writeGlove(side, data) {
  const { positions, normals, tangents, tris, bind } = data;
  const chunks = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const add = (array, type, componentType, target, extra = {}) => {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) });
    chunks.push(bytes, Buffer.alloc(pad));
    offset += bytes.length + pad;
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    accessors.push({ bufferView: bufferViews.length - 1, componentType, type, count: array.length / n, ...extra });
    return accessors.length - 1;
  };
  const minMax = (a) => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < a.length; i += 3)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], a[i + k]);
        max[k] = Math.max(max[k], a[i + k]);
      }
    return { min, max };
  };
  const attributes = {
    POSITION: add(positions, 'VEC3', 5126, 34962, minMax(positions)),
    NORMAL: add(normals, 'VEC3', 5126, 34962),
    TANGENT: add(tangents, 'VEC4', 5126, 34962),
    TEXCOORD_0: add(Float32Array.from(uv), 'VEC2', 5126, 34962),
    COLOR_0: add(
      Uint8Array.from(col, (c) => Math.round(c * 255)),
      'VEC4',
      5121,
      34962,
      { normalized: true },
    ),
    JOINTS_0: add(newJoints, 'VEC4', 5121, 34962),
    WEIGHTS_0: add(newWeights, 'VEC4', 5126, 34962),
  };
  const indicesAccessor = add(tris, 'SCALAR', 5125, 34963);
  const ibms = new Float32Array(JOINTS.length * 16);
  bind.forEach((b, i) =>
    b
      .clone()
      .invert()
      .toArray(ibms, i * 16),
  );
  const ibmAccessor = add(ibms, 'MAT4', 5126);
  const nodes = [
    { name: `glove-${side}`, children: [] },
    { name: `glove-${side}-mesh`, mesh: 0, skin: 0 },
  ];
  nodes[0].children.push(1);
  const jointNodes = bind.map((b, i) => {
    const t = new THREE.Vector3(),
      r = new THREE.Quaternion(),
      s = new THREE.Vector3();
    b.decompose(t, r, s);
    nodes.push({ name: JOINTS[i], translation: t.toArray(), rotation: r.toArray() });
    nodes[0].children.push(nodes.length - 1);
    return nodes.length - 1;
  });
  const bin = Buffer.concat(chunks);
  const file = `glove-${side}`;
  const json = {
    asset: { version: '2.0', generator: 'flowerbed glove re-rig (WebXR hand skeleton)' },
    extensionsUsed: ['KHR_texture_basisu'],
    extensionsRequired: ['KHR_texture_basisu'],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes: [{ name: `glove-${side}`, primitives: [{ attributes, indices: indicesAccessor, material: 0, mode: 4 }] }],
    skins: [{ joints: jointNodes, inverseBindMatrices: ibmAccessor, skeleton: 0 }],
    materials: g.json.materials,
    textures: g.json.textures,
    images: g.json.images,
    samplers: g.json.samplers,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length, uri: `${file}.bin` }],
  };
  fs.writeFileSync(path.join(OUT_DIR, `${file}.gltf`), JSON.stringify(json));
  fs.writeFileSync(path.join(OUT_DIR, `${file}.bin`), bin);
  console.log('wrote', file, 'joints', JOINTS.length, 'bytes', bin.length);
}

// Left glove: the baked bind as is.
writeGlove('left', {
  positions: bindPos,
  normals: bindNor,
  tangents: bindTan,
  tris: indices,
  bind: buildSkeleton('left', P),
});

// Right glove: a true mirror across X (geometry, winding, joints), framed on
// the right-hand reference so its axes follow the WebXR right convention.
const mirrorX = (a, stride) => {
  const out = Float32Array.from(a);
  for (let i = 0; i < out.length; i += stride) out[i] = -out[i];
  return out;
};
const rTan = mirrorX(bindTan, 4);
for (let i = 3; i < rTan.length; i += 4) rTan[i] = -rTan[i];
const rTris = Uint32Array.from(indices);
for (let t = 0; t < rTris.length; t += 3) [rTris[t + 1], rTris[t + 2]] = [rTris[t + 2], rTris[t + 1]];
const PR = {};
for (const [k, p] of Object.entries(P)) PR[k] = new THREE.Vector3(-p.x, p.y, p.z);
writeGlove('right', {
  positions: mirrorX(bindPos, 3),
  normals: mirrorX(bindNor, 3),
  tangents: rTan,
  tris: rTris,
  bind: buildSkeleton('right', PR),
});

// Report segment lengths against the reference, for the record.
const ref = loadGltf(REF('left'));
const RW = worldMatrices(ref.json);
const rp = (n) => new THREE.Vector3().setFromMatrixPosition(RW[ref.json.nodes.findIndex((x) => x.name === n)]);
for (const [a, b] of Object.entries(NEXT)) {
  if (!a.startsWith('index') && !a.startsWith('thumb')) continue;
  console.log(
    `  ${a} -> ${b}: glove ${(P[a].distanceTo(P[b]) * 100).toFixed(1)} cm, generic ${(rp(a).distanceTo(rp(b)) * 100).toFixed(1)} cm`,
  );
}
