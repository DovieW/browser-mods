# Dovie's Browser Mods

This product is one Chrome extension. Read `docs/architecture.md` and `docs/feature-admission.md` before substantial changes. The shared package supplies standards/theme assets, not another extension. Preserve existing command IDs.

All runtime code belongs under `src/` as strict TypeScript. Entrypoints compose, domain code is pure, browser effects belong in adapters, and sibling feature internals are private. Do not restore root JS runtime scripts or add migration exemptions. Public exports must not bypass boundaries.

Performance and data preservation come first. Record workload, idle/disabled cost, permissions, teardown and meaningful before/after measurements for substantial additions. No polling/keepalive or speculative micro-optimization. Store policy concerns require an explicit feature/product discussion; do not silently redesign this as multiple extensions.

Run `npm run verify`; run packaged browser tests for runtime changes and `npm run test:performance` when changing startup, rendering, tab-wide operations, storage or observation. Add negative architecture fixtures when changing enforcement. No test bridge may ship in production. Review failures, concurrency, suspension and privacy boundaries. See `docs/review.md` for the current review record.
