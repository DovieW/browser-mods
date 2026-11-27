import { connect } from "./chrome-devtools.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";

const root = fileURLToPath(new URL("..", import.meta.url));
const build = join(root, ".output", "chrome-mv3");
const session = createHash("sha256").update(root).digest("hex").slice(0, 10);
const profile = resolve(
  process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"),
  "browser-mods",
  `chrome-${session}`,
);
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { headed: { type: "boolean" } },
});
const [command = "refresh"] = positionals;

const { run: devtools, openOptions, inspectOptions } = connect(session);

const status = spawnSync(
  "chrome-devtools",
  ["status", "--sessionId", session],
  {
    encoding: "utf8",
    timeout: 5_000,
  },
);
if (status.error) throw status.error;
const running = status.stdout.includes("daemon is running.");
if (status.status !== 0 || (running && !status.stdout.includes(profile)))
  throw Error("The named daemon belongs to a different browser profile.");

if (command === "stop") {
  if (running)
    execFileSync("chrome-devtools", ["stop", "--sessionId", session], {
      stdio: "inherit",
    });
} else {
  if (!["refresh", "reload", "inspect"].includes(command))
    throw Error("Expected refresh, reload, inspect or stop.");
  if (command === "refresh")
    execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
  const manifest = JSON.parse(
    readFileSync(join(build, "manifest.json"), "utf8"),
  );
  if (!running) {
    mkdirSync(profile, { recursive: true });
    execFileSync(
      "chrome-devtools",
      [
        "start",
        "--sessionId",
        session,
        "--autoConnect=false",
        `--headless=${!values.headed}`,
        "--categoryExtensions=true",
        "--no-usage-statistics",
        "--no-performance-crux",
        "--userDataDir",
        profile,
        "--workspace",
        root,
      ],
      { cwd: root, stdio: "inherit", timeout: 30_000 },
    );
  }

  const loaded = () =>
    devtools("list_extensions").extensions.find(
      (extension) => extension.path === build && extension.enabled,
    );
  const previous = loaded();
  if (command !== "inspect") {
    if (previous) devtools("reload_extension", previous.id);
    else devtools("install_extension", build);
  }
  const extension = loaded();
  if (!extension || (previous && extension.id !== previous.id))
    throw Error("Chrome did not retain the expected development extension.");

  const origin = `chrome-extension://${extension.id}/`;
  const options = openOptions(extension.id, manifest);
  try {
    const observed = inspectOptions(options.id);
    if (!observed?.ready || !isDeepStrictEqual(observed.manifest, manifest))
      throw Error(
        "Options did not render the manifest from the current build.",
      );
    const worker = (devtools("list_pages").extensionServiceWorkers ?? []).find(
      (worker) => worker.url === origin + manifest.background.service_worker,
    );
    console.log(
      JSON.stringify({
        session,
        profile,
        ...extension,
        options: options.url,
        worker: worker?.url,
      }),
    );
  } finally {
    devtools("close_page", String(options.id));
  }
}
