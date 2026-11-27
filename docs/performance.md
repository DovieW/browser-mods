# Performance baseline

For the separate native DOM/Preact/React/Redact experiment, see [UI runtime results](performance/ui-runtime-2026-11-16.md). Those fixtures are not the production popup and their timings must not be compared directly with the architecture baseline below.

The architecture refactor is compared with commit `3bf1b0a`, before the runtime extraction. Measurements used disposable profiles and fictional local tab data; no live browser or user content was accessed.

## Method

Three alternating before/after runs, each launching Chromium 153.0.8010.12 on Linux, Intel Core Ultra 9 285H, Node v26.13.1. Each run opens the popup 15 times and waits for usable command rows. The first popup is reported separately; the remaining 14 supply warm percentiles. Each tab-size fixture executes 25 copy-links operations against the stateful browser mock. The table shows medians across the three runs. Browser launch time includes browser overhead and is not an isolated worker-start metric.

| Metric (ms)                         | Before |  After |
| ----------------------------------- | -----: | -----: |
| First popup                         | 182.85 | 153.39 |
| Warm popup p50                      |  87.79 |  87.60 |
| Warm popup p95                      | 110.48 | 112.27 |
| 500 synthetic tabs: copy links p95  |   3.84 |   3.30 |
| 1000 synthetic tabs: copy links p95 |   3.32 |   3.21 |

Warm popup latency is broadly unchanged; these samples do not establish a general speed improvement. Cold timings vary between runs. No repeatable regression crosses both the 20% and 20ms review thresholds. Raw measurements are in [2026-11-16.json](performance/2026-11-16.json); [before](performance/before-median.json) and [after](performance/after-median.json) summaries can be compared with the CLI.

## Repeat

The configurable screenshot label adds one synced settings read to each labeled capture and no recurring work. Plain single-tab captures skip that read and reuse the original PNG. Split View still stitches the two panes for both commands. Both use the existing capture permissions and clipboard cleanup. In one before/after benchmark against the original Split View implementation (`ea156de`), first popup time was 151 to 166 ms and warm p95 was 106 to 95 ms. The benchmark does not time screenshot rendering.

```sh
npm run test:performance
MODS_BENCH_OUTPUT=/tmp/mods-current.json npm run test:performance
npm run performance:compare -- docs/performance/after-median.json /tmp/mods-current.json
```

Compare only matching hardware/browser/Node conditions. `MODS_BENCH_EXTENSION` and `MODS_BENCH_HARNESS` select a separately built baseline checkout. The comparison command flags meaningful regressions for repeated investigation; do not treat a single noisy sample as a release verdict. CI records a fresh benchmark artifact, not a cross-hardware comparison against this laptop.

## Unified popup and Options navigation

Three alternating before/after runs on the same Linux machine with Chromium 153.0.8010.12 used the standard 15-load fixture. Medians across runs were 157.8 → 157.0 ms for the first popup, 77.7 → 90.0 ms for warm p50, and 102.2 → 103.8 ms for warm p95. The repeated measurements stayed below the latency review threshold. An initial standalone post-change run measured 243.1 ms for the first popup. The alternating runs did not reproduce that result.

Gzipped popup JavaScript grew from 35.1 to 64.7 KiB. The Radix dropdown is loaded only in the popup. Options moved from 37.9 to 38.6 KiB and the launcher from 35.0 to 33.7 KiB. The worker still contains neither Redact nor Radix. The navigation adds no permissions, polling, or persistent page scripts. The popup menu unmounts with the popup, options listeners detach with their view, and the in-page palette retains its on-demand lifecycle. The contextual controls in the workflow fixture do not ship.

## WXT build migration

One before/after pair on the Kubuntu IdeaPad used Chromium 153.0.8010.12, Node 26.13.1, and the standard 15-load popup fixture. The first popup measured 181.0 → 166.6 ms, warm p50 measured 88.5 → 84.1 ms, and warm p95 measured 128.5 → 101.2 ms. A later WXT run measured 208.8, 93.6, and 102.1 ms respectively. Both WXT runs stayed below the regression threshold against this baseline. These samples do not establish a speedup.

The packaged manifest comparison verifies the same permission set, content-script registration, and background entrypoint. WXT and DevTools run outside the extension, Redact stays in the UI, and the existing runtime listeners retain their lifecycle. The migration adds no polling, keepalive, or persistent page code. The benchmark does not measure idle CPU or memory.

## Automated protections and limits

- Lifecycle tests verify zero recurring tab queries/writes/injections during idle quiescence and removal of runtime listeners on disposal.
- Shortcut-service tests verify unchanged observations do not write storage; failed sync retries preserve local intent; concurrent requests do not duplicate history.
- Architecture tests reject forbidden dependencies and direct APIs in pure code. Build guards reject DOM/UI inputs in the worker and any test bridge in shipped bundles.
- Packaged browser checks cover real interactions and behavior preservation. White-box tests use a bridge only in disposable instrumented fixtures.

This is an initial baseline, not a full browser profiler. Synthetic tab timings do not measure renderer memory or the cost of 1000 live pages. These runs do not establish long-session heap stability, precise idle CPU usage, or page-observer cost. Existing media pausing injects only on demand; future persistent page scripts need their own realistic workload, retention and disabled-state tests. No new persistent polling or page observers were introduced by this refactor.
