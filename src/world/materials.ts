/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Ports of the legacy Woodland shaders as small onBeforeCompile patches on
 * stock Three.js materials:
 *
 * - water: three scrolling world-space voronoi normal samples, fresnel alpha,
 *   and an env-map blend that keeps specular highlights additive;
 * - sky: base gradient and cloud layer merged into one draw;
 * - matte mountains: exp2 fog that thins out with altitude;
 * - underwater dirt: tint and denser teal fog below the water line (y = 0).
 */

import {
  Color,
  CubeTexture,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MixOperation,
  RepeatWrapping,
  ShaderChunk,
  Vector3,
  Vector4,
  type Material,
  type MeshStandardMaterial,
  type Texture,
} from '@iwsdk/core';

const WORLD_VARYING_VS = (name: string): [string, string] => [
  '#include <common>',
  `#include <common>\nvarying vec3 ${name};`,
];
const WORLD_ASSIGN_VS = (name: string): [string, string] => [
  '#include <project_vertex>',
  `#include <project_vertex>\n${name} = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
];

/** Remove PBR maps the legacy override dropped so foliage reads matte. */
export function makeFullRough(material: MeshStandardMaterial): void {
  material.metalnessMap = null;
  material.roughnessMap = null;
  material.aoMap = null;
  material.metalness = 0;
  material.roughness = 1;
  if (material.map) material.map.anisotropy = 4;
}

/**
 * Matte terrain as Lambert: for a fully rough, non-metal surface it looks the
 * same as MeshStandardMaterial but skips the PBR and image-based-lighting
 * work per pixel (about 2 ms of GPU per frame on Quest 3 when the whole
 * island is in view).
 */
export function toLambert(source: MeshStandardMaterial): MeshLambertMaterial {
  const material = new MeshLambertMaterial({
    name: source.name,
    map: source.map,
    color: source.color,
    normalMap: source.normalMap,
    normalScale: source.normalScale,
    emissive: source.emissive,
    emissiveMap: source.emissiveMap,
    side: source.side,
    transparent: source.transparent,
    alphaTest: source.alphaTest,
    alphaToCoverage: source.alphaToCoverage,
    vertexColors: source.vertexColors,
  });
  material.shadowSide = source.shadowSide;
  material.onBeforeCompile = source.onBeforeCompile;
  material.customProgramCacheKey = source.customProgramCacheKey;
  return material;
}

/** Shared water tint (time of day dims reflections and body colour). */
export const waterUniforms = { uWaterTint: { value: new Color(1, 1, 1) } };

export interface WaterMaterial extends MeshPhongMaterial {
  userData: { wave: Vector4; flowSpeed: number };
}

export function createWaterMaterial(
  source: MeshStandardMaterial,
  normalTexture: Texture,
  envMap: CubeTexture | null,
  options: { flowSpeed: number; reflectivity: number; cacheKey: string },
): WaterMaterial {
  normalTexture.wrapS = normalTexture.wrapT = RepeatWrapping;
  const material = new MeshPhongMaterial({
    // Legacy colors were authored as linear values.
    color: new Color().setRGB(0x38 / 255, 0x63 / 255, 0x68 / 255),
    map: source.map,
    shininess: 3000,
    reflectivity: options.reflectivity,
    combine: MixOperation,
    transparent: true,
    envMap,
  }) as WaterMaterial;
  material.name = `Water:${source.name}`;
  const wave = new Vector4();
  material.userData = { wave, flowSpeed: options.flowSpeed };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWave = { value: wave };
    shader.uniforms.uWaterTint = waterUniforms.uWaterTint;
    shader.uniforms.uSkyMix = skyUniforms.uSkyMix;
    shader.uniforms.uZenith = skyUniforms.uZenith;
    shader.uniforms.uHorizon = skyUniforms.uHorizon;
    shader.uniforms.uWaterNormal = { value: normalTexture };
    shader.vertexShader = shader.vertexShader
      .replace(...WORLD_VARYING_VS('vWaterWorld'))
      .replace(...WORLD_ASSIGN_VS('vWaterWorld'));
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWaterWorld;
        uniform vec4 uWave;
        uniform vec3 uWaterTint;
        uniform float uSkyMix;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform sampler2D uWaterNormal;`,
      )
      .replace(
        '#include <color_fragment>',
        // Body colour follows the time of day as well as the reflection.
        `#include <color_fragment>
        diffuseColor.rgb *= uWaterTint;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `
        vec2 uv0 = (vWaterWorld.xz + vec2(-11.3, 4.4) * uWave.x) * 0.412;
        vec2 uv1 = (vWaterWorld.xz + vec2(6.0, -7.0) * uWave.x) * 0.572;
        vec2 uv2 = (vWaterWorld.xz + vec2(-3.3, -5.1) * uWave.x) * 0.272;
        vec3 mapN = normalize(
          (texture2D(uWaterNormal, uv0).xyz * 2.0 - 1.0) +
          (texture2D(uWaterNormal, uv1).xyz * 2.0 - 1.0) +
          (texture2D(uWaterNormal, uv2).xyz * 2.0 - 1.0));
        {
          vec3 q0 = dFdx(-vViewPosition);
          vec3 q1 = dFdy(-vViewPosition);
          vec2 st0 = dFdx(vWaterWorld.xz);
          vec2 st1 = dFdy(vWaterWorld.xz);
          vec3 N = normal;
          vec3 q1perp = cross(q1, N);
          vec3 q0perp = cross(N, q0);
          vec3 T = q1perp * st0.x + q0perp * st1.x;
          vec3 B = q1perp * st0.y + q0perp * st1.y;
          float det = max(dot(T, T), dot(B, B));
          float scale = (det == 0.0) ? 0.0 : faceDirection * inversesqrt(det);
          normal = normalize(T * (mapN.x * scale) + B * (mapN.y * scale) + N * mapN.z);
        }`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // Grazing angles mirror the sky; looking down reveals teal water.
        float waterF = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 3.0);
        {
          vec3 fragToCam = normalize(vViewPosition);
          float fresnel = 1.0 - saturate(2.25 * pow(max(dot(fragToCam, normal), 0.0), 2.0));
          vec3 lum = vec3(0.21, 0.72, 0.07);
          float specLum = dot(reflectedLight.directSpecular, lum) + dot(reflectedLight.indirectSpecular, lum);
          diffuseColor.a = max(fresnel, specLum);
        }`,
      )
      .replace(
        '#include <envmap_fragment>',
        // Chunks are expanded after onBeforeCompile, so patch the chunk text.
        ShaderChunk.envmap_fragment.replace(
          'outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );',
          `// Reflect the sky actually shown: the painted dome's map at sunset,
          // blended toward the live procedural gradient (no scene capture).
          vec3 skyGradient = mix(uHorizon, uZenith, smoothstep(0.0, 0.6, reflectVec.y));
          vec3 skyColor = mix(envColor.xyz * uWaterTint, skyGradient, uSkyMix);
          outgoingLight = mix(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance, skyColor, specularStrength * reflectivity * mix(0.25, 1.0, waterF));
          outgoingLight += reflectedLight.directSpecular;`,
        ),
      );
  };
  material.customProgramCacheKey = () => options.cacheKey;
  return material;
}

/** Live sky controls, animated by TimeOfDaySystem. */
export const skyUniforms = {
  uSkyMix: { value: 0 },
  uZenith: { value: new Color(0.25, 0.45, 0.85) },
  uHorizon: { value: new Color(0.85, 0.9, 1.0) },
  uCloudTint: { value: new Color(1, 1, 1) },
  uStars: { value: 0 },
  uSunDir: { value: new Vector3(0.35, 0.8, 1).normalize() },
  uSunColor: { value: new Color(1, 0.95, 0.85) },
  uSunSize: { value: 0.9995 },
  uTime: { value: 0 },
};

/**
 * Sky: the painted sunset dome (base + cloud layer merged in one draw), and a
 * procedural gradient sky with clouds, sun or moon disc and twinkling stars
 * that time of day can blend in. Still one draw call.
 */
export function createSkyMaterial(base: Texture, clouds: Texture | null): Material {
  const material = new MeshBasicMaterial({ map: base, fog: false });
  material.name = 'Sky';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uClouds = { value: clouds ?? base };
    Object.assign(shader.uniforms, skyUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkyDir;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vSkyDir = (modelMatrix * vec4(transformed, 1.0)).xyz - cameraPosition;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uClouds;
        uniform float uSkyMix, uStars, uSunSize, uTime;
        uniform vec3 uZenith, uHorizon, uCloudTint, uSunDir, uSunColor;
        varying vec3 vSkyDir;
        float skyHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`,
      )
      .replace(
        '#include <map_fragment>',
        `vec4 skyBase = texture2D(map, vMapUv);
        vec4 skyCloud = texture2D(uClouds, vMapUv);
        vec3 painted = mix(skyBase.rgb, skyCloud.rgb, skyCloud.a);
        vec3 dir = normalize(vSkyDir);
        float h = clamp(dir.y * 1.4 + 0.08, 0.0, 1.0);
        vec3 grad = mix(uHorizon, uZenith, pow(h, 0.65));
        // Reuse the painted cloud layer's shapes, recoloured.
        grad = mix(grad, uCloudTint, skyCloud.a * 0.85);
        // Sun or moon disc with a soft halo.
        float d = dot(dir, normalize(uSunDir));
        grad += uSunColor * (smoothstep(uSunSize, uSunSize + 0.0003, d) + pow(max(d, 0.0), 64.0) * 0.25);
        // Stars above the horizon, gently twinkling.
        vec3 cell = floor(dir * 260.0);
        float star = step(0.9965, skyHash(cell)) * smoothstep(0.05, 0.35, dir.y);
        star *= 0.6 + 0.4 * sin(uTime * 2.0 + skyHash(cell + 1.0) * 30.0);
        grad += vec3(star) * uStars * (1.0 - skyCloud.a);
        diffuseColor *= vec4(mix(painted, grad, uSkyMix), 1.0);`,
      );
  };
  material.customProgramCacheKey = () => 'flowerbed-sky';
  return material;
}

/** Distant matte mountains: fog fades out between y = 20 and y = 100. */
export function patchMatteFog(material: Material, start = 20, falloff = 0.0125): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(...WORLD_VARYING_VS('vMatteWorld'))
      .replace(...WORLD_ASSIGN_VS('vMatteWorld'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMatteWorld;')
      .replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
          float matteDepth = vFogDepth * (1.0 - saturate(max(vMatteWorld.y - ${start.toFixed(1)}, 0.0) * ${falloff}));
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * matteDepth * matteDepth);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
        #endif`,
      );
  };
  material.customProgramCacheKey = () => 'flowerbed-matte';
}

/** Sand and underwater rock: tint and teal fog below the water line. */
export function createUnderwaterMaterial(source: MeshStandardMaterial): Material {
  const gloss = Math.max(1 - source.roughness, 0);
  const material = new MeshPhongMaterial({
    color: source.color,
    map: source.map,
    normalMap: source.normalMap,
    reflectivity: gloss,
    shininess: gloss * 64,
    side: source.side,
  });
  material.name = `Underwater:${source.name}`;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(...WORLD_VARYING_VS('vDirtWorld'))
      .replace(...WORLD_ASSIGN_VS('vDirtWorld'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDirtWorld;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        if (vDirtWorld.y < 0.0) {
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.329, 0.3), min(saturate(-0.5 * vDirtWorld.y), 0.5));
        }`,
      )
      .replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
          if (vDirtWorld.y < 0.0) {
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.1, 0.45, 0.355), saturate(-0.2 * vDirtWorld.y));
          } else {
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
          }
        #endif`,
      );
  };
  material.customProgramCacheKey = () => 'flowerbed-underwater';
  return material;
}
