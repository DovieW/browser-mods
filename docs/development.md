# Browser Mods development

Use Node and npm from the checkout. WXT builds the Chrome MV3 extension from `src/entrypoints/` and writes the unpacked extension to `.output/chrome-mv3/`. The build verifies the generated manifest against `manifest.json` and the command catalog. Existing popup, Options, launcher, and maintenance URLs are preserved.

## Isolated iteration

```sh
npm ci
npm run verify
npm run dev
npm run dev:browser -- inspect
npm run dev:browser -- reload
npm run dev:browser -- stop
```

`dev` builds, then installs or reloads the unpacked extension through the installed Chrome DevTools CLI. Chrome uses a dedicated profile under `${XDG_STATE_HOME:-$HOME/.local/state}/browser-mods/`, derived from the checkout path. The dev commands print the session ID and discover the current worker and Options targets. Use `npm run dev -- --headed` when starting a visible session. Stop the current development session before changing its headed setting.

Use the returned session ID with Chrome DevTools CLI for extension lifecycle and diagnostics. Use Playwright for website and extension behavior. When troubleshooting a real toolbar popup, trigger the extension action and inspect the new popup target. Re-discover page and worker targets after a reload. Refresh only affected fixture tabs when checking changed content scripts. Use the [Chrome DevTools extension guide](https://developer.chrome.com/docs/devtools/agents/extensions) and [WXT entrypoint guide](https://wxt.dev/guide/essentials/entrypoints.html).

```sh
npx playwright install chromium
npm run test:browser:packaged
npm run test:performance
npm run package
```

The packaged browser suite launches disposable Chromium profiles. It checks two successive same-version reloads and verifies the extension ID, a saved setting, and the new manifest after a browser restart with the same unpacked path. The local DevTools session and packaged tests use separate profiles. `npm run package` creates archives locally.

## Update the existing unpacked Chrome install on Kubuntu

Use a browser-level Chrome DevTools session explicitly authorized for the profile that already loads this checkout's `dist/`. Chrome can request debugging consent when the session connects. Developer mode must be enabled for the unpacked install. The Playwright browser connector cannot open the private Browser Mods Options context used by this workflow.

```sh
npm run verify
chrome-devtools start --sessionId <devtools-session-id> --autoConnect=true --categoryExtensions=true --no-usage-statistics --no-performance-crux
npm run deploy:local -- --session <devtools-session-id> --verify-only
npm run deploy:local -- --session <devtools-session-id>
```

Choose a separate session ID made of hexadecimal digits and hyphens. Use the same ID throughout the update.

The deployment command expects GNU `mv` with atomic directory exchange and the candidate and install on the same filesystem. It verifies the current running manifest, exchanges the directories at the original unpacked path, calls Chrome's extension reload from the extension's own Options context, and verifies that Options reopened with the deployed build. It keeps the previous unpacked build at the printed backup path. If verification fails after the exchange, it restores the previous files. If Chrome already accepted the reload, verify the running extension again before relying on the restored copy.

Use a permanent install directory for everyday Chrome. For a first local installation, extract a packaged archive to that directory. Regular builds overwrite `.output/chrome-mv3/`.
