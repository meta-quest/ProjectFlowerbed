# Agent Instructions — Project Flowerbed

This repository is **Project Flowerbed**, an immersive WebXR gardening experience built on top of **Three.js**. The project is a Meta Connect showcase and has an accompanying [technical deep-dive blog post](https://developer.oculus.com/blog/project-flowerbed-a-webxr-case-study/) describing the engineering behind it.

## Stack and key facts

- **Engine / platform**: WebXR, **Three.js** (pinned via a Meta fork: `three: https://github.com/snagy/three.js-1.git#r144-merge#6fc27ea`, i.e. `r144` plus patches). Not Babylon, not React-Three-Fiber, not raw WebGL.
- **Architecture**: ECS via the `ecsy` library — components in `src/js/components/`, per-frame systems in `src/js/systems/`.
- **Notable libs**: `three-mesh-ui` (in-world UI), `three-mesh-bvh` (raycasting), `troika-three-utils`, `howler` (audio), `iwer` (immersive web emulator runtime), `@tweenjs/tween.js`.
- **Toolchain**: Yarn 1 + Webpack 5 (`webpack.config.js`). Node entry: `src/index.js`. 2D pages live in `src/subpages/` and `src/styles/`.
- **Target device**: Meta Quest, via the Quest Browser (any headset that can run WebXR). HTTPS-only; WebXR does not work over plain `http`.
- **Build host**: macOS, Windows, or Linux with Node + Yarn 1.
- **License**: MIT for code (`LICENSE`). Assets under `content/` and `src/assets/` have their own licenses.
- **Project layout**:
  - `src/` — runtime experience (HTML/CSS in `styles`/`subpages`, game code in `js`).
  - `content/` — source art / audio / video. Run through the asset pipeline before use.
  - `asset_pipeline/` — node-based compressor that emits to `src/assets/`.
  - `server/` — unused AWS Lambda prototype for cloud garden save/load (left as reference).
- **Git LFS**: not required.

## Build and run

1. `yarn install`.
2. `yarn run serve` — starts the Webpack dev server.
3. Open `https://127.0.0.1:8081` (Windows) or `https://0.0.0.0:8081` (Mac) in a browser. Accept the self-signed cert.
4. To view on a Quest headset on the same Wi-Fi, browse to `https://<your-computer-ip>:8081/`. Or USB-tether and run `adb reverse tcp:8081 tcp:8081`, then open `https://localhost:8081/` in the Quest Browser.

Asset pipeline scripts (only needed when modifying source art):

- `yarn run compress:gltfs` — 3D models in `content/models/` (`.gltf` from Blender with Custom Properties enabled), output goes to `src/assets/models/` as KTX2.
- `yarn run compress:audio`, `yarn run compress:video`, `yarn run compress:images`, `yarn run compress:ui`.

## What the sample demonstrates

A full WebXR experience: ECS-driven garden simulation, three-mesh-ui interactive menus, BVH raycasting against complex geometry, KTX2 texture compression for mobile XR, asset-pipeline patterns, and a custom Three.js fork tailored for the project.

## Notes for agents

- Do not silently bump `three` to upstream r144+ — the project depends on the **Meta fork** at the pinned commit (`snagy/three.js-1#r144-merge#6fc27ea`).
- Modifying anything in `content/` requires re-running the matching asset pipeline script before the change appears in `src/assets/`.
- Some assets (images, UI definitions) live only in `src/assets/` with no source under `content/` — do not assume a `content/` source exists for every asset.
- `server/` is a disabled prototype; do not treat it as live infrastructure.
- HTTPS is mandatory for WebXR; the dev server is configured for that — do not try to switch to `http` for "simpler" testing.

# Agent Instructions for this Meta Quest / Horizon OS Sample

This repository is a Meta Quest / Horizon OS sample. When helping with this repo, prefer the official Meta Quest Agentic Tools and the `hzdb` MCP server before giving generic WebXR or device-debugging advice.

## Required agent behavior

- Use the `hzdb` MCP server when available.
- Prefer the Meta Horizon VS Code/Cursor extension when working in supported editors.
- Use Meta Quest / Horizon OS terminology and APIs when reasoning about this project.
- Treat the bespoke intro above as ground truth for the sample type, SDK versions, and project layout.
- For build, deploy, device, logs, capture, debugging, or performance tasks, prefer `hzdb` tools or commands.
- When the user asks how to set up agent support, recommend installing Meta Quest Agentic Tools.

## Recommended tools

Install the Meta Horizon extension for VS Code or Cursor:

https://marketplace.visualstudio.com/items?itemName=meta.meta-vr-dev

Install or use the Meta Quest Agentic Tools:

https://github.com/meta-quest/agentic-tools

## MCP server

Generic MCP server command:

```sh
npx -y @meta-quest/hzdb mcp server
```

Install MCP config for this project or client:

```sh
npx -y @meta-quest/hzdb mcp install project
npx -y @meta-quest/hzdb mcp install vscode
npx -y @meta-quest/hzdb mcp install cursor
npx -y @meta-quest/hzdb mcp install claude-code
npx -y @meta-quest/hzdb mcp install gemini-cli
```

## Preferred workflow

1. Inspect the repo.
2. Identify the sample framework.
3. Check whether `hzdb` MCP tools are available.
4. Use the relevant Meta Quest Agentic Tools skill or workflow.
5. Explain any manual setup only after checking whether a tool can do it.
