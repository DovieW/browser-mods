const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mods-reload-"));
  const extension = path.join(root, "extension");
  const profile = path.join(root, "profile");
  const manifestPath = path.join(extension, "manifest.json");
  const settings = { key: "mods.ui.v1.placement", value: "centered" };
  const launch = () =>
    chromium.launchPersistentContext(profile, {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    });
  let context;
  try {
    await fs.cp(
      process.env.SHORTCUTS_TEST_EXTENSION || ".output/chrome-mv3",
      extension,
      { recursive: true },
    );
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    context = await launch();
    const manager = await context.newPage();
    await manager.goto("chrome://extensions/");
    await manager.evaluate(() =>
      chrome.developerPrivate.updateProfileConfiguration({
        inDeveloperMode: true,
      }),
    );
    await manager.close();
    const firstWorker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const origin = `chrome-extension://${new URL(firstWorker.url()).host}`;
    const optionsUrl = origin + "/" + manifest.options_ui.page;
    const options = async () => {
      const page = await context.newPage();
      for (let attempt = 0; ; attempt++) {
        try {
          await page.goto(optionsUrl);
          break;
        } catch (error) {
          if (
            attempt === 30 ||
            !String(error).includes("ERR_BLOCKED_BY_CLIENT")
          )
            throw error;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      await page.locator("main").waitFor();
      return page;
    };
    const read = (page) =>
      page.evaluate(
        async ({ key }) => ({
          id: chrome.runtime.id,
          manifest: chrome.runtime.getManifest(),
          saved: (await chrome.storage.sync.get(key))[key],
        }),
        settings,
      );
    let page = await options();
    await page.evaluate(
      ({ key, value }) => chrome.storage.sync.set({ [key]: value }),
      settings,
    );
    const before = await read(page);
    for (const title of ["Reload fixture 1", "Reload fixture 2"]) {
      manifest.action.default_title = title;
      await fs.writeFile(manifestPath, JSON.stringify(manifest));
      const closed = page.waitForEvent("close", { timeout: 10_000 });
      await page.evaluate(() => {
        setTimeout(() => chrome.runtime.reload(), 150);
      });
      await closed;
      page = await options();
      const after = await read(page);
      assert.equal(after.id, before.id);
      assert.equal(after.saved, settings.value);
      assert.equal(after.manifest.version, before.manifest.version);
      assert.equal(after.manifest.action.default_title, title);
    }
    await context.close();
    context = await launch();
    const reopened = await read(await options());
    assert.equal(reopened.id, before.id);
    assert.equal(reopened.saved, settings.value);
    assert.equal(reopened.manifest.action.default_title, "Reload fixture 2");
    console.log(
      "PASS true same-version reload twice, stable ID and settings, and restart with the same unpacked path",
    );
  } finally {
    await context?.close();
    await fs.rm(root, { force: true, recursive: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
