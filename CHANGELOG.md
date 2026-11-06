# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2.0.0 — Unreleased

Project Flowerbed rebuilt on the Immersive Web SDK (IWSDK), replacing the 2022
Three.js r144 and ECSY codebase. The island, plants, props, fauna, hands, and
sounds are the original assets.

### Added

- Hand tracking for every tool: gardening gloves rigged to the WebXR hand
  skeleton, fixed grip poses while a hand holds a tool's prop, thumb
  microgestures for teleporting, turning and seed pages, and a **Tools**
  button on the inside of the left wrist.
- A radial tool dial and spatial panels authored in UIKitML: wrist seedbox
  labels, settings, tutorial cards, hints, and a HUD.
- Several saved gardens, goals that unlock glove and tool finishes, and weekly
  ribbons.
- Easels that display kept photos in the garden, a photo album saved on the
  device, and a garden tour.
- Morning, sunset, night, and automatic time-of-day looks, with fireflies at
  night.
- Mouse-and-keyboard play on desktop through the IWER emulator.
- Unit tests, linting, formatting, CI, and GitHub Pages deployment.

### Changed

- Locomotion is IWSDK's built-in, worker-threaded system (teleport, glide,
  snap or smooth turn, comfort vignette), with Flowerbed's sounds, comfort
  blink and recovery from falls.
- Photos are kept or discarded by dropping the print on a **Keep** or
  **Discard** tile, as in the 2022 game; kept photos go to an album on the
  device instead of downloading.
- Plants render as instanced meshes with distance-based levels of detail, and
  the island's static meshes are merged, so a large garden holds 72 fps on
  Meta Quest 3 at 1.25× resolution.
- The landing page, tutorial, and settings were redesigned.

### Removed

- The 2022 webpack build and asset pipeline. Raw `.blend` sources and
  uncompressed models remain in this repository's history.
