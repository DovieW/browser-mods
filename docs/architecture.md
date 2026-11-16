# Architecture

Entrypoints compose; core owns actions/settings/shortcut reconciliation; platform owns Chrome adapters; features own their domain/application/adapters/UI. Feature internals cannot be imported by siblings. Pure domain code has no DOM, Chrome, network or storage access. Contracts are validated at privilege boundaries. No generic event bus or permanent worker.

Shared standards/theme dependency is pinned as a checked-in package archive because this workstation's npm policy blocks Git and remote package sources. vendor/ORIGIN.md records its exact revision. Runtime assets are bundled locally.

Current migration exceptions: background.js, popup.js, command-errors.js, shortcut-ui.js, shortcut-memory.js and offscreen.js. Existing regression tests execute these sources; the build bundles entrypoints. Extract ownership incrementally with behavior tests before removing a legacy file.

Target structure: src/entrypoints, composition, contracts, core, platform, features and ui. Create directories only when populated. No empty scaffolding. Worker imports stay static and event registration synchronous. Extension-page feature views may load on demand.

Quality: strict TypeScript, typed ESLint, dependency/cycle checks, Knip, unit/integration and disposable packaged browser tests. Review meaningful latency regressions (>20% and >20ms), idle work, storage writes and teardown. No speculative micro-optimization.
