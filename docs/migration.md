# Migration status

## Completed

- Repository and product rename, retaining Simple Shortcuts command IDs and store identity.
- Shared standards/theme repository and revision-pinned archive dependency.
- Strict TypeScript, ESLint, import/cycle checks, Knip and CI.
- Build/package boundary with documented exact legacy exceptions.
- Pure shortcut reconciliation, per-device sync shards, worker-owned writes, popup notice and options history.

## Feature scope decision required

The earlier unified-toolkit plan is now conditional. Before each substantial migration, follow [feature admission](feature-admission.md) and document whether it belongs in this extension, shares code in a separate package, or is deferred. This roadmap does not authorize treating unrelated utilities as one acceptable Store product. A shared repository/design system and one installed extension are separate decisions.

Store single-purpose review, runtime/permission boundaries and performance baselines remain outstanding. Multiple extension builds are possible but have not been implemented. No additional utility should be folded in merely to reduce the extension count.

## Remaining implementation

1. Complete shortcut UX: explicit global unassignment, import/export with rollback, 40KiB global history eviction, 100 revisions per shortcut locally, full adapter tests and performance baselines. Current synced history keeps ten per command per device; quota pressure surfaces a failure rather than silently discarding data. Legacy snapshot UI remains separate until this conversion is finished.
2. Extract legacy tabs/clipboard/UI into typed feature modules; preserve regression tests and remove exact exceptions.
3. Evaluate package fit, then port updated Quick Bookmark including ranking and playlist intent tests; configure OAuth for the retained extension identity and reconnect locally.
4. Evaluate package fit, then port tab discarding with protection/race checks and coordinated badge ownership.
5. Evaluate package fit, then port middle-click search with frame targeting, handoff authorization and cancellation tests.
6. Evaluate package fit, then port Omnivore with local-only credentials, consent, resumable operations and no duplicate destructive retries.
7. Evaluate package fit, then port media arbitration/visibility behavior and formal models, replacing broad observation only after profiling.
8. Complete module enablement/permissions, contextual palette views, validated migrations, docs/store assets and benchmark gates.

Source repositories are intact. Do not remove or disable their installations until their replacement is verified. No store publication has occurred. Preserve licenses/attribution. New features must follow shared standards rather than adding to root legacy JS files.

## Review notes

Per-device sync keys avoid whole-snapshot overwrites. Worker-owned queues serialize observations across extension pages. First observations and empty bindings cannot replace an existing desired key. Lamport revisions establish causality; observation time and ID break concurrent ties. Offline change timestamps are unknown. Repeated observations don't claim newer intent. Local revisions persist before sync writes, allowing retries after quota/network errors.

The root worker and popup remain legacy build exceptions to preserve regression coverage during extraction. Build checks apply to typed additions; do not mistake this for full legacy static-analysis coverage.
