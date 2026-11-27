import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { defineConfig } from "wxt";
import sourceManifest from "./manifest.json";
import { browserCommandId, commands } from "./src/core/actions/catalog";
import { validateShortcutSnapshot } from "./src/features/shortcut-setup/adapters/snapshots";
import { verifyOutput } from "./scripts/checks/wxt-output.mjs";

const { manifest_version: manifestVersion, ...manifest } = sourceManifest;
const labelsPath = process.env.BROWSER_MODS_SHORTCUT_LABELS;
const preferred = labelsPath
  ? validateShortcutSnapshot(JSON.parse(readFileSync(labelsPath, "utf8")))
      .bindings
  : {};

const manifestCommands = Object.fromEntries(
  Object.entries(commands).map(
    ([id, { shortcutGroup, description, ...binding }]) => [
      browserCommandId(id, shortcutGroup),
      {
        ...binding,
        description: [shortcutGroup, description, preferred[id]]
          .filter(Boolean)
          .join(" - "),
      },
    ],
  ),
);

export default defineConfig({
  srcDir: "src",
  manifestVersion: manifestVersion as 3,
  imports: false,
  manifest: { ...manifest, commands: manifestCommands },
  webExt: { disabled: true },
  vite: () => ({
    resolve: {
      alias: [
        { find: /^react$/, replacement: "@tanstack/redact" },
        { find: /^react-dom$/, replacement: "@tanstack/redact/dom" },
        {
          find: /^react-dom\/client$/,
          replacement: "@tanstack/redact/dom-client",
        },
        {
          find: /^react\/jsx-(dev-)?runtime$/,
          replacement: "@tanstack/redact/jsx-runtime",
        },
      ],
    },
    oxc: { jsx: { runtime: "automatic" } },
    build: {
      target: `chrome${sourceManifest.minimum_chrome_version}`,
      modulePreload: { polyfill: false },
    },
    plugins: [verifyOutput()],
  }),
  hooks: {
    "build:publicAssets": (_wxt, files) => {
      for (const name of [
        "popup.css",
        "PRIVACY.md",
        "LICENSE",
        "THIRD-PARTY-NOTICES",
        "logo16.png",
        "logo48.png",
        "logo128.png",
      ]) {
        files.push({ absoluteSrc: resolve(name), relativeDest: name });
      }
      files.push({
        absoluteSrc: resolve("src/features/workspace/ui/workspace.css"),
        relativeDest: "workspace.css",
      });
      const theme = resolve("node_modules/@doview/mods-shared/design/styles");
      for (const entry of readdirSync(theme, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".css"))
          files.push({
            absoluteSrc: resolve(theme, entry.name),
            relativeDest: `theme/${entry.name}`,
          });
      }
    },
    "build:manifestGenerated": (_wxt, generated) => {
      // This is our shortcut history page, never a Chrome history override.
      delete generated.chrome_url_overrides;
      generated.options_ui = sourceManifest.options_ui;
      if (generated.action)
        generated.action.default_title = sourceManifest.action.default_title;
    },
    "build:done": (wxt, output) => {
      if (wxt.config.command !== "build") return;
      const expected = { ...sourceManifest, commands: manifestCommands };
      const generated = JSON.parse(JSON.stringify(output.manifest));
      if (!isDeepStrictEqual(generated, expected))
        throw Error(
          "Generated Chrome manifest differs from the Browser Mods manifest and command catalog.",
        );
    },
    "vite:build:extendConfig": (entries, config) => {
      const output = config.build?.rollupOptions?.output;
      if (
        output &&
        !Array.isArray(output) &&
        entries.some((entry) => entry.inputPath.endsWith(".html"))
      )
        output.entryFileNames = "[name].js";
    },
  },
});
