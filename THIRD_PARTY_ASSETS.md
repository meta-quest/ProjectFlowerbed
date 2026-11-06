# Third-Party Assets

Source code in this repository is licensed under the MIT license (see
`LICENSE`). The game's media are distributed under their own licenses, listed
below. Trademarks, including Meta Quest controller imagery, remain the property
of their respective owners.

## Project Flowerbed art, audio, and video

Unless listed otherwise below, every file under `public/flowerbed/` (3D models,
textures, sound effects, music, images, and videos) is from the 2022 Project
Flowerbed release, © Meta Platforms, Inc. and affiliates, licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The full license
text is in [`public/flowerbed/LICENSE`](public/flowerbed/LICENSE).

These files are the compressed builds from that release, unmodified, except:

- `public/flowerbed/models/hands/glove-left.*` and `glove-right.*` are adapted
  from `PlayerElement_Hand_Left.gltf`: the glove was re-skinned onto the
  25-joint WebXR hand skeleton by `scripts/glove-rerig/rerig.mjs`, keeping its
  mesh and skin weights, and mirrored for the right hand. The skeleton comes
  from the WebXR generic hand (see below).
- `public/flowerbed/models/props/Prop_Camera/Prop_Camera.gltf` had its Blender
  add-on metadata removed.

These files outside `public/flowerbed/` are adaptations of those assets and are
also licensed under CC BY 4.0, © Meta Platforms, Inc. and affiliates:

- `public/scenes/main.iwsdk.scene.json`, which places the island props at the
  positions recorded in the 2022 environment model, extracted by
  `scripts/generate-flowerbed-scene.mjs`.
- `docs/images/demo.webp` and `public/og-image.jpg`, captures of the game.

## Arabesque No. 1

`public/flowerbed/audio/soundtrack/arabesque.mp3` is a synthesized piano
rendition of Claude Debussy's Arabesque No. 1 (1888–1891). The score and this
rendition are in the public domain.

## WebXR generic hand

`scripts/glove-rerig/ref/left.glb` and `right.glb` are the unmodified
`generic-hand` models from
[`@webxr-input-profiles/assets`](https://github.com/immersive-web/webxr-input-profiles)
1.0.20, MIT License, Copyright (c) 2019 Amazon. The re-rigged gloves above use
their joint hierarchy. The license notice is in
[`scripts/glove-rerig/ref/LICENSE.md`](scripts/glove-rerig/ref/LICENSE.md).

## Bundled with the build

The production build also embeds, through npm dependencies:

- the Inter typeface in MSDF form (`@pmndrs/msdfonts`), Copyright (c)
  2016-2020 The Inter Project Authors, licensed under the
  [SIL Open Font License 1.1](https://openfontlicense.org/);
- Lucide icons (`@pmndrs/uikit-lucide`), licensed under the
  [ISC License](https://lucide.dev/license).

## Project Assets

All other media were created for this project and are distributed under the
repository MIT license, including:

- the spatial UI panels in `public/ui/`
- the README buttons in `docs/images/cta-*.svg`
- the site icons `public/favicon.svg`, `public/favicon-32.png`, and
  `public/apple-touch-icon.png`
