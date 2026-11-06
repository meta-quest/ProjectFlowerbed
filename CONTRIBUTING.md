# Contributing to Project Flowerbed

We want to make contributing to this project as easy and transparent as
possible.

## Development Setup

Use Node.js 22 LTS (pinned in `.nvmrc`); CI also tests Node.js 24. Other
versions allowed by the `engines` field in `package.json` may work but are not
tested.

```bash
nvm use
npm ci
npm run dev
```

Useful commands:

| Command                 | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `npm run dev`           | Start the IWSDK dev server and open the app   |
| `npm run typecheck`     | Type-check with `tsc`                         |
| `npm run lint`          | Run ESLint                                    |
| `npm run format`        | Format with Prettier                          |
| `npm run test:run`      | Run unit tests once                           |
| `npm run test:coverage` | Run unit tests with coverage                  |
| `npm run check`         | Format check, lint, typecheck, and unit tests |
| `npm run build`         | Build the production app into `dist/`         |

Project conventions:

- Keep all `@iwsdk/*` packages on the same exact version.
- Import Three.js runtime values and types from `@iwsdk/core`, not `three`.
- Load assets through the manifest in `src/assets.ts` (`defineAssets()`) and
  `AssetManager` rather than Three.js loaders.
- Avoid allocations in ECS `update()` methods, and register every signal or
  query subscription in `cleanupFuncs`.
- Keep the game at 72 fps on Meta Quest 3: profile changes that add draw
  calls, shaders, or per-frame work on a headset.

See `AGENTS.md` and `src/AGENTS.md` for more detailed architecture notes.

## Pull Requests

We actively welcome your pull requests.

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed behavior or APIs, update the documentation.
4. Ensure `npm run check` and `npm run build` pass.
5. For changes involving XR input, hand tracking, locomotion, or rendering
   cost, test in the IWER emulator and, if possible, on a Meta Quest headset,
   and describe what you tested in the pull request.
6. If you haven't already, complete the Contributor License Agreement ("CLA").

## Contributor License Agreement ("CLA")

In order to accept your pull request, we need you to submit a CLA. You only need
to do this once to work on any of Meta's open source projects.

Complete your CLA here: <https://code.facebook.com/cla>

## Issues

We use GitHub issues to track public bugs. Please ensure your description is
clear and has sufficient instructions to be able to reproduce the issue,
including the browser and headset you tested and whether the issue also occurs
in the IWER emulator.

Meta has a [bounty program](https://bugbounty.meta.com/) for the safe
disclosure of security bugs. In those cases, please go through the process
outlined on that page and do not file a public issue. See `SECURITY.md`.

## Coding Style

Formatting is enforced by Prettier and linting by ESLint. Run `npm run format`
to format your changes and `npm run lint` to check them; `npm run check` runs
both along with type-checking and tests.

## License

By contributing to Project Flowerbed, you agree that your contributions will be
licensed under the LICENSE file in the root directory of this source tree.
