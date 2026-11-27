import { execFileSync } from "node:child_process";

export function connect(session) {
  const run = (action, ...args) =>
    JSON.parse(
      execFileSync(
        "chrome-devtools",
        [action, ...args, "--sessionId", session, "--output-format=json"],
        { encoding: "utf8", timeout: 15_000 },
      ),
    );
  const evaluate = (page, fn) => {
    const { message } = run(
      "evaluate_script",
      fn,
      "--pageId",
      String(page),
      "--waitForStableDom",
      "false",
    );
    return JSON.parse(
      message.split("```json\n")[1]?.split("\n```")[0] ?? "null",
    );
  };
  function openOptions(id, manifest) {
    const url = `chrome-extension://${id}/${manifest.options_ui.page}`;
    const before = new Set(
      (run("list_pages").extensionPages ?? []).map((page) => page.id),
    );
    const opened = run(
      "new_page",
      url,
      "--background",
      "true",
      "--timeout",
      "3500",
    );
    const page = (opened.extensionPages ?? []).find(
      (page) => page.url === url && !before.has(page.id),
    );
    if (!page) throw Error("Chrome did not open the requested extension page.");
    return page;
  }
  const inspectOptions = (id) =>
    evaluate(
      id,
      `async () => {
      for (let attempt = 0; attempt < 40 && !document.querySelector("main"); attempt++)
        await new Promise((resolve) => setTimeout(resolve, 50));
      return { id: chrome.runtime.id, manifest: chrome.runtime.getManifest(), ready: !!document.querySelector("main") };
    }`,
    );
  return { run, evaluate, openOptions, inspectOptions };
}
