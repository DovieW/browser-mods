import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { setTimeout } from "node:timers/promises";
import { connect } from "./chrome-devtools.mjs";

const { values } = parseArgs({
  options: { session: { type: "string" }, "verify-only": { type: "boolean" } },
});
if (!values.session || !/^[a-f\d-]+$/i.test(values.session))
  throw Error(
    "Supply the explicitly authorized browser-level DevTools session with --session.",
  );

const root = fileURLToPath(new URL("..", import.meta.url));
const deployed = join(root, "dist");
const candidate = join(root, ".output", "chrome-mv3");
const readManifest = (dir) =>
  JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const expected = readManifest(candidate);
const previous = readManifest(deployed);
if (previous.key || expected.key)
  throw Error(
    "This Linux deploy command expects the existing path-based unpacked extension.",
  );
const id = createHash("sha256")
  .update(realpathSync(deployed))
  .digest("hex")
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (char) => String.fromCharCode(97 + parseInt(char, 16)));

const { run, evaluate, openOptions, inspectOptions } = connect(values.session);
function checkedOptions(manifest) {
  const page = openOptions(id, manifest);
  let observed;
  try {
    observed = inspectOptions(page.id);
  } catch (error) {
    run("close_page", String(page.id));
    throw error;
  }
  if (
    observed?.id !== id ||
    !observed.ready ||
    !isDeepStrictEqual(observed.manifest, manifest)
  ) {
    run("close_page", String(page.id));
    throw Error(
      "The target browser is not running the expected Browser Mods build.",
    );
  }
  return page;
}

const existing = checkedOptions(previous);
if (values["verify-only"]) {
  run("close_page", String(existing.id));
  console.log(`Verified browser connection for ${id}.`);
} else {
  const stage = mkdtempSync(join(root, ".output", "deploy-"));
  const staged = join(stage, "extension");
  let exchanged = false;
  let reloadRequested = false;
  const exchange = () =>
    execFileSync("mv", [
      "-T",
      "--exchange",
      "--no-copy",
      "--",
      staged,
      deployed,
    ]);
  try {
    cpSync(candidate, staged, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    const { acknowledged } =
      evaluate(
        existing.id,
        `() => {
      if (chrome.runtime.id !== ${JSON.stringify(id)}) return { acknowledged: false };
      return { acknowledged: true };
    }`,
      ) ?? {};
    if (!acknowledged)
      throw Error("Chrome lost the expected extension context.");
    exchange();
    exchanged = true;
    reloadRequested = true;
    const { scheduled } =
      evaluate(
        existing.id,
        `() => {
      if (chrome.runtime.id !== ${JSON.stringify(id)}) return { scheduled: false };
      setTimeout(() => chrome.runtime.reload(), 150);
      return { scheduled: true };
    }`,
      ) ?? {};
    if (!scheduled) {
      reloadRequested = false;
      throw Error("Chrome did not schedule Browser Mods' reload.");
    }

    for (let attempt = 0; ; attempt++) {
      await setTimeout(250);
      try {
        const stillOpen = (run("list_pages").extensionPages ?? []).some(
          (page) => page.id === existing.id,
        );
        if (stillOpen)
          throw Error("The previous extension page has not closed.");
        const updated = checkedOptions(expected);
        run("close_page", String(updated.id));
        break;
      } catch (error) {
        if (attempt === 5) throw error;
      }
    }
    console.log(
      `Reloaded ${id} at version ${expected.version}. Previous build retained at ${staged}.`,
    );
  } catch (error) {
    if (exchanged) exchange();
    rmSync(stage, { recursive: true, force: true });
    if (!reloadRequested) {
      try {
        run("close_page", String(existing.id));
      } catch {
        /* Browser connection is gone. */
      }
      throw error;
    }
    throw Error(
      "Deployment verification failed. Restored the old build on disk. The browser may need a reload.",
      { cause: error },
    );
  }
}
