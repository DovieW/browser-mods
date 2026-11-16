# Runtime dependency decisions

Reviewed 2026-11-16. This is a recommendation and revisit checklist, not a record of installed packages. Browser Mods currently ships no third-party JavaScript runtime libraries. Build/check/test tools are development dependencies; the shared package contributes local theme assets.

The goal is reliable, maintainable functionality with good measured performance. Zero dependencies is not a goal in itself, and a few extra kilobytes are not sufficient reason to prefer a harder-to-maintain implementation.

## Next implementation: runtime validation with Zod

**Recommend standard Zod as the next runtime dependency. Not installed yet.**

A validator checks data while the extension is running. TypeScript checks our source while developing; its types cannot verify a JSON import, a Chrome message or old/corrupt saved settings. For example, a saved pause value of `"fast"` needs a real runtime check, not a TypeScript annotation.

Zod and Valibot are separate alternatives for this same job. Each describes expected data using a schema, validates unknown values, and can derive a TypeScript type from the schema. Valibot is not Zod and is not a wrapper around it. Standard Zod emphasizes a convenient method-based API; Valibot uses modular functions that bundlers can discard when unused. Modern Zod also provides `zod/mini`, a functional, tree-shakable variant, so comparisons must not assume an older Zod build.

Prefer standard Zod initially for readable, discoverable schemas and its documented integrations. There is no measured project-specific runtime advantage supporting the earlier recommendation to choose Valibot primarily for bundle footprint. Do not claim Zod is faster either: compare the actual implementation.

Implementation scope:

- Start with one worker message contract and one settings/import schema before converting all validators.
- Preserve current behavior for unknown fields, missing fields, defaulting, numeric bounds and malformed values. Saved preferences and old backups must remain compatible.
- Infer data types from schemas where appropriate; keep validation at message/storage/import boundaries rather than repeatedly parsing trusted internal values.
- Preserve stable user-facing error codes; do not surface raw payloads or validation details containing sensitive data.
- Measure actual per-context bundles, validation latency and the existing popup/operation benchmarks. Keep meaningful behavior and failure tests.
- Use one schema library. Reconsider Valibot or Zod Mini only for a demonstrated footprint/performance need or a concrete integration advantage; do not install both speculatively.

Sources: [Zod introduction](https://zod.dev/), [Zod Mini and tradeoffs](https://zod.dev/packages/mini), [Valibot introduction](https://valibot.dev/guides/introduction/).

## Revisit with a concrete feature

| Candidate                | Plain-language purpose                                                                       | Revisit trigger                                                                                  | Adoption conditions                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@floating-ui/dom`       | Keep a popup/menu attached to a button or media element as the page moves                    | Media migration or anchored menus with real positioning/collision problems                       | First compare native layout/CSS. Start updates only while mounted; clean up on close/navigation. This does not solve player compatibility or speed arbitration.                                         |
| `@tanstack/virtual-core` | Render the visible portion of a huge scrollable list rather than thousands of rows           | Tab, bookmark or history views show measured rendering/scrolling cost with realistic collections | Preserve keyboard navigation, focus and accessibility. Test realistic list sizes; a short search-result list may need no virtualization. It does not accelerate the search algorithm itself.            |
| `lit-html`               | Write UI templates and update changed portions instead of assembling every DOM node manually | Options redesign or repeated DOM update code is becoming hard to maintain                        | Prototype one self-contained view. Compare clarity, startup, focus/selection preservation and updates. Keep it in UI bundles, never worker/domain code. Avoid unsafe HTML insertion for user/page data. |

These candidates are alternatives to writing difficult infrastructure ourselves, not mandatory packages. Recheck their current APIs, support and licenses when the trigger occurs. A revisit can conclude that native browser capabilities are sufficient.

Sources: [Floating UI lifecycle and cleanup](https://floating-ui.com/docs/autoupdate), [framework-free Virtual Core](https://tanstack.com/virtual/latest/docs/installation#virtual-core-no-framework), [standalone lit-html](https://lit.dev/docs/libraries/standalone-templates/).

## How to keep this actionable

Before implementing runtime validation, overlays, large lists or a UI redesign, consult the corresponding entry above and record adoption or deferral in the feature decision/PR. Update the status here after a real comparison or installation. These recommendations do not install anything automatically and do not make future projects depend on the same libraries.

All adopted code ships locally in the extension. Keep dependencies out of unrelated contexts, pin the resolved version in the lockfile, and review transitive dependencies, maintenance, licenses and actual bundled cost. A small library that removes substantial risk can be preferable to a larger body of custom code.
