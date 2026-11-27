const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "mods-workspace-"));
  const extension = path.resolve(
    process.env.SHORTCUTS_TEST_EXTENSION || ".output/chrome-mv3",
  );
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
    const base = `chrome-extension://${id}/`;
    const errors = [];
    const page = async (url) => {
      const opened = await context.newPage();
      opened.on("pageerror", (e) => errors.push(e.message));
      await opened.goto(url);
      return opened;
    };
    await worker.evaluate(() =>
      chrome.storage.sync.set({
        "mods.ui.v1.pins": ["copy-screenshot-plain"],
      }),
    );
    let popup = await page(base + "popup.html");
    const customize = popup.getByRole("button", { name: "Customize popup" });
    await customize.waitFor();
    assert.equal(await popup.locator(".result, kbd, nav, input").count(), 0);
    await popup.setViewportSize({ width: 800, height: 153 });
    assert.equal(
      (await popup.locator(".popup-workspace").boundingBox()).height,
      600,
    );
    await popup.setViewportSize({ width: 1000, height: 700 });
    const { width, height } = await popup
      .locator(".popup-workspace")
      .boundingBox();
    assert.deepEqual({ width, height }, { width: 800, height: 600 });

    const settingsOpened = context.waitForEvent("page");
    await customize.click();
    const picker = await settingsOpened;
    await picker.getByRole("heading", { name: "Toolbar popup" }).waitFor();
    await picker.close();

    const options = await page(base + "options.html");
    const nav = options.getByRole("navigation", { name: "Options sections" });
    const heading = (name) =>
      options.getByRole("heading", { name, exact: true });
    const open = async (group, leaf) => {
      const disclosure = nav.getByRole("button", { name: group, exact: true });
      if ((await disclosure.getAttribute("aria-expanded")) === "false")
        await disclosure.click();
      await nav.getByRole("link", { name: leaf, exact: true }).click();
      await heading(leaf).waitFor();
    };
    await heading("Tab switching").waitFor();
    const pause = options.getByLabel("Pause before a fresh switch (seconds)");
    await pause.fill("2.75");
    await pause.press("Tab");
    const readSync = (key) =>
      worker.evaluate(
        async (key) => (await chrome.storage.sync.get(key))[key],
        key,
      );
    async function until(read, expected) {
      for (let attempt = 0; attempt < 80; attempt++) {
        if (JSON.stringify(await read()) === JSON.stringify(expected)) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.deepEqual(await read(), expected);
    }
    await until(() => readSync("tabSwitchingV1-pauseMs"), 2750);
    await options.getByRole("button", { name: "Restore defaults" }).click();
    await until(() => readSync("tabSwitchingV1-pauseMs"), 1500);
    await nav
      .getByRole("button", { name: "Features", exact: true })
      .press("Enter");
    await nav
      .getByRole("link", { name: "Screenshots" })
      .waitFor({ state: "hidden" });
    await nav
      .getByRole("button", { name: "Features", exact: true })
      .press("Space");
    await nav.getByRole("link", { name: "Screenshots" }).waitFor();
    await options.goto(base + "options.html#Mods%7CscreenshotLabelCorner");
    await heading("Screenshots").waitFor();
    await options.waitForFunction(
      () => document.activeElement?.id === "screenshotLabelCorner",
    );
    assert.equal(
      await nav
        .getByRole("link", { name: "Screenshots" })
        .getAttribute("aria-current"),
      "page",
    );

    await open("Shortcuts", "Assignment history");
    const assignmentFrame = options.frameLocator(
      'iframe[title="Shortcut setup and history"]',
    );
    await assignmentFrame.locator("#shortcuts tr").first().waitFor();
    assert.equal(await assignmentFrame.locator("#shortcuts tr").count(), 25);
    await options.goto(base + "options.html#Shortcuts%7Cshortcut-history");
    await heading("Assignment history").waitFor();
    await open("Sync & backup", "Shortcut backup");
    const backup = options.frameLocator(
      'iframe[title="Shortcut backup and recovery"]',
    );
    await backup
      .getByRole("button", { name: "Remember current shortcuts" })
      .click();
    const exportButton = backup.getByRole("button", {
      name: "Export shortcut backup",
    });
    const download = options.waitForEvent("download");
    await exportButton.click();
    assert.match(
      (await download).suggestedFilename(),
      /^simple-shortcuts-.+\.json$/,
    );
    await open("Sync & backup", "Interface backup");
    await options.getByLabel("Import interface settings").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":1,"preferences":{"layout":"bad"}}'),
    });
    await options
      .getByRole("alert")
      .filter({ hasText: "Invalid settings backup" })
      .waitFor();
    await options.getByRole("button", { name: "Dismiss error" }).click();
    await open("Appearance & controls", "Toolbar popup");
    const field = options.getByLabel("Add an item");
    const add = async (id) => {
      await field.selectOption(id);
      await options.getByRole("button", { name: "Add", exact: true }).click();
    };
    const curatedKey = "mods.ui.v1.popupItems";
    await add("copy-screenshot");
    await until(() => readSync(curatedKey), ["copy-screenshot"]);
    await add("pin-tab");
    await until(() => readSync(curatedKey), ["copy-screenshot", "pin-tab"]);
    await add("rdp-tools");
    await until(
      () => readSync(curatedKey),
      ["copy-screenshot", "pin-tab", "rdp-tools"],
    );
    await options
      .getByRole("button", { name: "Move Pin / unpin tabs up" })
      .click();
    const order = ["pin-tab", "copy-screenshot", "rdp-tools"];
    await until(() => readSync(curatedKey), order);
    popup = await page(base + "popup.html");
    await popup.locator(".result").nth(1).waitFor();
    const commands = () => popup.locator(".result").allTextContents();
    assert.deepEqual(await commands(), [
      "Pin / unpin tabs",
      "Copy screenshot with URL",
    ]);
    assert.equal(await popup.locator("kbd, nav, input").count(), 0);
    assert.equal(
      await popup
        .getByRole("button", { name: "RDP download helper settings" })
        .count(),
      0,
    );
    // Shortcut assignments never decide which picks are visible.
    assert.ok(
      await popup.evaluate(async () =>
        (await chrome.commands.getAll()).some(
          ({ name, shortcut }) => name.endsWith("-copy-screenshot") && shortcut,
        ),
      ),
    );
    await open("Appearance & controls", "Command palette");
    const visibility = options
      .locator(".custom-row")
      .filter({ hasText: "Copy screenshot with URL" });
    await visibility.getByRole("button", { name: "Hide" }).click();
    await until(() => readSync("mods.ui.v1.hidden"), ["copy-screenshot"]);
    assert.deepEqual(await commands(), [
      "Pin / unpin tabs",
      "Copy screenshot with URL",
    ]);

    await worker.evaluate(() =>
      chrome.storage.session.set({ "mods.palette.open": true }),
    );
    const palette = await page(base + "popup.html");
    const input = palette.getByRole("combobox", {
      name: "Search Browser Mods",
    });
    await palette.setViewportSize({ width: 620, height: 61 });
    await palette.getByRole("option").first().waitFor();
    const paletteViewport = await palette
      .locator(".palette-layout")
      .boundingBox();
    assert.equal(paletteViewport.height, 430);
    await palette.setViewportSize({ width: 800, height: 600 });
    await input.fill("screenshot");
    const screenshotCommand = palette.getByRole("option", {
      name: /Copy screenshot with URL/,
    });
    assert.equal(await screenshotCommand.count(), 0);
    await visibility.getByRole("button", { name: "Hide" }).click();
    await screenshotCommand.waitFor();
    await input.press("ArrowDown");
    assert.equal(await palette.locator("[aria-selected=true]").count(), 1);
    await input.fill("Find tab");
    await palette
      .getByRole("option", { name: "Find tab", exact: true })
      .click();
    await palette
      .getByRole("combobox", { name: "Search tabs" })
      .press("Escape");
    await input.waitFor();
    for (const mode of ["commands", "everything", "scoped"]) {
      await options
        .getByLabel("Palette search", { exact: true })
        .selectOption(mode);
      await input.fill("copy-url");
      await palette.getByRole("option", { name: /Copy links/ }).waitFor();
    }
    await open("Features", "Screenshots");
    await options.getByLabel("Enable Clipboard & capture").uncheck();
    await popup
      .getByRole("button", { name: "Copy screenshot with URL" })
      .waitFor({ state: "hidden" });
    await input.fill("screenshot");
    await screenshotCommand.waitFor({ state: "hidden" });
    await open("Appearance & controls", "Command palette");
    await options.getByLabel("Include disabled features in search").check();
    await palette
      .getByRole("option", {
        name: /Enable Clipboard.*Copy screenshot with URL/,
      })
      .waitFor();
    await open("Features", "Screenshots");
    await options.getByLabel("Enable Clipboard & capture").check();

    await options.getByLabel("Search settings").fill("location");
    await options
      .getByRole("button", { name: /Command palette location/ })
      .click();
    await options.waitForFunction(
      () => document.activeElement?.id === "placement",
    );
    await options.getByLabel("Search settings").fill("screenshot url");
    await options.getByRole("button", { name: /Screenshot URL label/ }).click();
    await options.waitForFunction(
      () => document.activeElement?.id === "screenshotLabelCorner",
    );
    await options.goBack();
    await heading("Command palette").waitFor();
    await options.goForward();
    await heading("Screenshots").waitFor();
    await options.setViewportSize({ width: 390, height: 640 });
    assert.ok(
      await options.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await popup.setViewportSize({ width: 390, height: 430 });
    assert.ok(
      await popup.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );

    const portalUrl = "https://office.example.test/vdesk/webtop.eui";
    await context.route(portalUrl, (route) =>
      route.fulfill({ body: "Portal fixture" }),
    );
    const portal = await page(portalUrl);
    const rdpPopup = await context.newPage();
    await portal.bringToFront();
    await rdpPopup.goto(base + "popup.html");
    const rdpOpened = context.waitForEvent("page");
    await rdpPopup
      .getByRole("button", { name: "RDP download helper settings" })
      .click();
    const rdpSettings = await rdpOpened;
    await rdpSettings
      .getByRole("heading", { name: "RDP download helper" })
      .waitFor();
    await rdpSettings.getByLabel("Desktop link text").waitFor();
    await rdpSettings.close();
    const launcher = await page(base + "launcher.html");
    await launcher.waitForTimeout(200);
    assert.equal(await launcher.locator("#app").innerText(), "");
    assert.deepEqual(errors, []);
    console.log(
      "PASS curated popup, context, single sidebar, legacy links, inline settings, maintenance panes, palette search and launcher authorization",
    );
  } finally {
    await context.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
