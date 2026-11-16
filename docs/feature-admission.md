# Feature admission, performance, and packaging

Status: project policy. Applies before importing functionality from another extension or adding a substantial new feature. This revises the earlier assumption that every selected utility will ship in one Chrome Web Store package.

## Decide what belongs together

Sharing a repository, engineering standards, design tokens or implementation code does not require sharing an installed extension. Assess runtime and distribution boundaries separately. Multiple builds remain an option, not an architecture already implemented.

For every proposed feature, record a short decision in `docs/decisions/` covering:

- User workflow and relationship to this package's stated purpose.
- Existing implementation, useful behavior and safeguards to retain; do not import an entire background script by default.
- Recommendation: include in this extension, share code but ship separately, or defer. Explain the tradeoff.
- Code owner/module, dependency direction and integration points. Avoid shared mutable state and imports into another feature's internals.
- Required/optional permissions, site access, data flow and any external services.
- Activation and teardown: what runs on page load, worker wake, popup open and while idle; what happens when disabled or access is revoked.
- Expected cost and measurements, failure isolation, migration/rollback and acceptance checks.

The decision is part of implementation review; it is not a new user approval requirement. Do not presume that copying a feature or reducing the extension count improves performance.

## Runtime performance comes first

Package size, source line count and feature count are not performance budgets. Chrome currently permits packages up to 2 GB; that is an upload ceiling, never a target or evidence that a package is lightweight. A small script injected into every frame can cost more during browsing than a large feature used occasionally.

- Disabled modules register no feature-specific page listeners, observers, timers or background jobs. Shared control-plane listeners needed to re-enable a module are allowed; document their cost.
- Permission grants alone must not activate unrelated modules. Remove dynamic registrations and tear down existing activity on disable/revocation.
- Keep site-specific code scoped to relevant origins/frames. Choose on-demand injection when the workflow permits it.
- Load feature views and large indexes when needed. Avoid pulling every module into popup startup. Worker imports must follow Chrome's supported loading model; do not assume dynamic `import()` is available there.
- No idle polling, artificial worker keepalive, repeated all-tab queries per input, or whole-document scans per mutation.
- Bound caches and histories, invalidate indexes incrementally, coalesce updates and batch storage writes. Persist only what must survive worker suspension.
- A build step is acceptable. Judge shipped code and measured behavior; type checking/build-time tools do not inherently add runtime overhead.
- Optimize material problems. Do not trade clarity or correctness for tiny timing differences.

For additions that affect runtime, record a reproducible before/after comparison: browser/build, hardware, enabled modules, fixture size, cold/warm conditions, sample count and latency distribution. Compare against the separate extensions when claiming consolidation reduces cost.

Measure the relevant subset of popup time to usable UI, input-to-result latency, worker startup, page-load/interaction impact, idle CPU/wakeups, retained memory after repeated use/teardown, storage writes and script injection across tabs/frames. Include hundreds of tabs for tab-wide work and media-heavy pages for observers.

Investigate repeatable latency regressions exceeding both 20% and 20 ms, consistent with the architecture guide. This is a review trigger, not a universal safe threshold: idle activity, leaks, page jank, excessive writes and per-tab multiplication still need review below it. The benchmark suite and baselines are not yet implemented; passing current tests does not establish performance acceptance.

## Reliability and permission boundaries

Feature failures should produce scoped errors and leave unrelated tools usable. A single service worker remains a shared failure domain; folder boundaries alone do not provide process isolation. Keep heavy/specialized functionality separate when its lifecycle, permissions or failure modes warrant it.

Use narrow optional permissions where supported and request them for a concrete user action. Document permissions that cannot be optional. Module switches do not isolate privileges: privileged dispatch still validates message schemas, senders, tab/frame ownership and allowed actions.

Keep credentials local, data access feature-specific and diagnostics free of page contents/secrets. Coordinate shared badge, clipboard, shortcut and status services instead of letting modules overwrite one another's state. Preserve private/regular browsing separation.

## Chrome Web Store scope is a real constraint

The Store requires a narrow, understandable single purpose and discourages bundles of unrelated functionality. A broad title such as “browser improvements,” optional switches, a shared palette, or branding do not establish compliance. Do not promise Store acceptance for the full planned toolkit.

Before combining features in a Store build, document the package's actual purpose and explain why the included behaviors support it. Recheck current official guidance at submission. Clearly separate features may need separate extensions even if maintained in one codebase. Personal unpacked use is a separate distribution choice, not evidence that the combined Store build is acceptable.

## Migration and acceptance

- Candidate lists are evaluations, not commitments to a single runtime or Store package.
- Keep the old extension working until parity, failure recovery, migration and performance have been verified.
- Import settings through validated, reversible paths; extensions do not automatically share private storage.
- Port safeguards and behavior tests, not just happy paths. Check worker suspension, popup closure, navigation, permission denial/revocation and module disable/re-enable.
- Verify idle/disabled behavior and cleanup in the packaged extension, not only mocks.
- Retain attribution/licenses and document identity-dependent integrations such as OAuth.

## Primary references

Checked 2026-11-16; recheck policy and numeric limits before release.

- [Chrome Web Store quality guidelines](https://developer.chrome.com/docs/webstore/program-policies/policies#quality-guidelines): single purpose and unrelated functionality.
- [Chrome Web Store permission policy](https://developer.chrome.com/docs/webstore/program-policies/policies#use-of-permissions): narrow access for implemented functionality.
- [Publishing guidance](https://developer.chrome.com/docs/webstore/publish): package upload limit.
- [Service worker basics](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics): supported imports and packaged code.
- [Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts): registration/injection options and execution contexts.
