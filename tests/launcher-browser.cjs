const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const assert = require("node:assert/strict");
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "mods-launcher-"));
  const extension = path.join(profile, "extension");
  await fs.cp(
    process.env.SHORTCUTS_TEST_EXTENSION || ".output/chrome-mv3",
    extension,
    { recursive: true },
  );
  const manifest = JSON.parse(
    await fs.readFile(path.join(extension, "manifest.json")),
  );
  manifest.host_permissions = ["http://127.0.0.1/*"];
  await fs.writeFile(
    path.join(extension, "manifest.json"),
    JSON.stringify(manifest),
  );
  const preview = await fs.readFile(
    path.join(__dirname, "fixtures/workspace-preview.html"),
  );
  const server = http.createServer((request, response) => {
    if (request.url === "/preview") response.end(preview);
    else
      response.end(
        '<title>Launcher fixture</title><button id="previous">Previous focus</button>',
      );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  try {
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    const id = new URL(worker.url()).host;
    const controls = await context.newPage();
    await controls.goto(`chrome-extension://${id}/popup.html`);
    await controls.locator(".result").first().waitFor();
    await worker.evaluate(() =>
      chrome.storage.sync.set({ "mods.ui.v1.placement": "centered" }),
    );
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator("#previous").focus();
    await page.bringToFront();
    const launch = () =>
      controls.evaluate(() =>
        chrome.runtime.sendMessage({
          target: "background",
          type: "run-command",
          command: "open-palette",
        }),
      );
    assert.equal((await launch()).ok, true);
    let frame;
    for (let i = 0; i < 80; i++) {
      frame = page.frames().find((f) => f.url().includes("/launcher.html"));
      if (frame) break;
      await page.waitForTimeout(25);
    }
    assert.ok(frame, "centered iframe attached");
    await frame.locator("#search").waitFor();
    await frame.locator("#search").fill("duplicate");
    assert.equal(await frame.locator(".result").count(), 1);
    if (process.env.MODS_UI_ARTIFACTS)
      await page.screenshot({
        path: path.join(process.env.MODS_UI_ARTIFACTS, "palette.png"),
      });
    await frame.locator("#search").fill("");
    await frame.locator("#search").press("Escape");
    await page.waitForFunction(
      () => !document.getElementById("browser-mods-launcher"),
    );
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "previous",
    );
    assert.equal((await launch()).ok, true);
    await page.waitForFunction(
      () => !!document.getElementById("browser-mods-launcher"),
    );
    await launch();
    await page.waitForFunction(
      () => !document.getElementById("browser-mods-launcher"),
    );
    await page.goto(`http://127.0.0.1:${server.address().port}/preview`);
    await page.locator("#example").evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      getSelection().addRange(range);
    });
    await page.getByRole("button", { name: "Search selection" }).waitFor();
    await page.getByRole("button", { name: "Search selection" }).click();
    await page
      .getByRole("status")
      .getByText(/Search preview for/)
      .waitFor();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Search selection" })
      .waitFor({ state: "hidden" });
    for (const [triggerName, dialogName, image] of [
      ["Save to folder", "Save to folder", "folder-picker.png"],
      ["Find duplicate tabs", "Review duplicate tabs", "duplicate-review.png"],
    ]) {
      const trigger = page.getByRole("button", {
        name: triggerName,
        exact: true,
      });
      await trigger.click();
      const task = page.getByRole("dialog", { name: dialogName });
      await task.waitFor();
      if (process.env.MODS_UI_ARTIFACTS)
        await page.screenshot({
          path: path.join(process.env.MODS_UI_ARTIFACTS, image),
        });
      await page.keyboard.press("Escape");
      await task.waitFor({ state: "hidden" });
      assert.equal(
        await trigger.evaluate((el) => el === document.activeElement),
        true,
      );
    }
    console.log(
      "PASS centered launcher handshake, scoped search, Escape, focus restoration, repeat invocation cleanup, and in-page workflow previews",
    );
  } finally {
    await context.close();
    server.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
