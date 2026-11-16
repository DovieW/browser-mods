import { checkBundles } from "./checks/bundles.mjs";
import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { commands } from "../src/core/actions/catalog.ts";
await rm("dist", { recursive: true, force: true });
await mkdir("dist");
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
manifest.commands = commands;
for (const file of [
  "popup.html",
  "popup.css",
  "offscreen.html",
  "PRIVACY.md",
  "logo16.png",
  "logo48.png",
  "logo128.png",
  "LICENSE",
])
  await cp(file, `dist/${file}`);
await cp("node_modules/@doview/mods-shared/design/styles", "dist/theme", {
  recursive: true,
});
let html = await readFile("popup.html", "utf8");
html = html.replace(/\s*<script src="[^"]+"><\/script>/g, "");
await writeFile(
  "dist/popup.html",
  html.replace("</body>", '<script src="popup.js"></script></body>'),
);
await writeFile("dist/manifest.json", JSON.stringify(manifest, null, 2));
await writeFile(
  "dist/options.html",
  await readFile("src/entrypoints/options/index.html"),
);
const result = await build({
  entryPoints: {
    background: "src/entrypoints/worker/main.ts",
    popup: "src/entrypoints/popup/main.ts",
    options: "src/entrypoints/options/main.ts",
    offscreen: "src/entrypoints/offscreen/main.ts",
  },
  outdir: "dist",
  bundle: true,
  target: "chrome127",
  format: "iife",
  minify: true,
  metafile: true,
});
await writeFile("dist/build-meta.json", JSON.stringify(result.metafile));

const scripts = Object.fromEntries(
  await Promise.all(
    Object.keys(result.metafile.outputs)
      .filter((name) => name.endsWith(".js"))
      .map(async (name) => [name, await readFile(name, "utf8")]),
  ),
);
const errors = checkBundles(result.metafile, scripts);
if (errors.length) throw Error(errors.join("\n"));
