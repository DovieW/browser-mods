const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "mods-workspace-"));
  const extension = path.resolve("dist");
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
    const popup = await context.newPage();
    popup.on("pageerror", (e) => errors.push(e.message));
    await popup.goto(base + "popup.html");
    await popup.locator(".result").first().waitFor();
    await popup.setViewportSize({ width: 1000, height: 700 });
    const { width, height } = await popup
      .locator(".popup-workspace")
      .boundingBox();
    assert.deepEqual({ width, height }, { width: 800, height: 600 });
    assert.equal(await popup.locator(".result").count(), 4);
    await popup.locator("#search").fill("screenshot");
    const screenshotCommand = popup.getByRole("option", {
      name: /Copy screenshot with URL/,
    });
    const screenshotSetting = popup.getByRole("option", {
      name: /Screenshot URL label/,
    });
    await screenshotCommand.waitFor();
    await screenshotSetting.waitFor();
    await popup.locator("#search").press("ArrowDown");
    assert.equal(await popup.locator("[aria-selected=true]").count(), 1);
    await popup.locator("#search").fill("");
    const options = await context.newPage();
    options.on("pageerror", (e) => errors.push(e.message));
    await options.goto(base + "options.html#Mods%7CscreenshotLabelCorner");
    await options.getByRole("heading", { name: "Screenshots" }).waitFor();
    await options.locator("#screenshotLabelCorner").waitFor();
    await options
      .getByRole("link", { name: "Features", exact: true })
      .first()
      .click();
    await popup
      .getByRole("button", { name: "All actions", exact: true })
      .click();
    await popup
      .getByRole("heading", { name: "Clipboard & capture", exact: true })
      .waitFor();
    if (process.env.MODS_UI_ARTIFACTS) {
      await popup.setViewportSize({ width: 800, height: 600 });
      await popup.screenshot({
        path: path.join(process.env.MODS_UI_ARTIFACTS, "all-actions.png"),
      });
    }
    await popup
      .getByRole("button", { name: "Clipboard & capture", exact: true })
      .click();
    const copyPlain = "Copy screenshot without URL";
    const menu = popup.getByRole("button", {
      name: `More actions for ${copyPlain}`,
    });
    await menu.focus();
    await menu.press("Enter");
    await popup.getByRole("menuitem", { name: "Add to Favorites" }).waitFor();
    await popup.keyboard.press("Escape");
    await popup.getByRole("menu").waitFor({ state: "hidden" });
    await popup.waitForFunction(
      (label) => document.activeElement?.getAttribute("aria-label") === label,
      `More actions for ${copyPlain}`,
    );
    await menu.click();
    await popup.getByRole("menuitem", { name: "Add to Favorites" }).click();
    await popup.getByRole("button", { name: "Favorites", exact: true }).click();
    await popup.getByRole("button", { name: copyPlain, exact: true }).waitFor();
    await popup
      .getByRole("button", { name: "Clipboard & capture", exact: true })
      .click();
    await popup.locator("#search").fill("screenshot");
    await popup.locator("#search").press("Escape");
    await popup
      .getByRole("heading", { name: "Clipboard & capture", exact: true })
      .waitFor();
    await popup.setViewportSize({ width: 390, height: 430 });
    assert.equal(
      await popup.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await popup.setViewportSize({ width: 800, height: 600 });
    if (process.env.MODS_UI_ARTIFACTS)
      await popup.screenshot({
        path: path.join(process.env.MODS_UI_ARTIFACTS, "popup.png"),
      });
    await options
      .getByRole("link", { name: "Appearance & controls", exact: true })
      .click();
    await options
      .getByLabel("Palette search", { exact: true })
      .selectOption("commands");
    await popup.locator("#search").fill("Find tab");
    assert.equal(await popup.locator(".result").count(), 0);
    await options
      .getByLabel("Palette search", { exact: true })
      .selectOption("scoped");
    await popup.getByRole("option", { name: /Find tab/ }).waitFor();
    await popup.getByRole("option", { name: /Find tab/ }).click();
    await popup.getByRole("combobox", { name: "Search tabs" }).waitFor();
    await popup.getByRole("combobox", { name: "Search tabs" }).press("Escape");
    await popup
      .getByRole("combobox", { name: "Search Browser Mods" })
      .waitFor();
    await options
      .getByRole("link", { name: "Features", exact: true })
      .first()
      .click();
    await options
      .getByRole("link", { name: "Screenshots", exact: true })
      .click();
    await options
      .getByLabel("Enable Clipboard & capture", { exact: true })
      .uncheck();
    await popup.locator("#search").fill("screenshot");
    await screenshotCommand.waitFor({ state: "hidden" });
    await screenshotSetting.waitFor();
    await options
      .getByRole("link", { name: "Appearance & controls", exact: true })
      .click();
    await options.getByLabel("Include disabled features in search").check();
    const disabledClipboardCommands = popup.getByRole("option", {
      name: /Enable Clipboard/,
    });
    await disabledClipboardCommands.nth(1).waitFor();
    assert.equal(await disabledClipboardCommands.count(), 2);
    await options
      .getByRole("link", { name: "Features", exact: true })
      .first()
      .click();
    await options
      .getByRole("link", { name: "Screenshots", exact: true })
      .click();
    await options
      .getByLabel("Enable Clipboard & capture", { exact: true })
      .check();
    await options.getByRole("link", { name: "Shortcuts", exact: true }).click();
    await options
      .getByRole("button", { name: "Assignment history & recovery" })
      .click();
    await options
      .frameLocator("iframe")
      .locator("#shortcuts tr")
      .first()
      .waitFor();
    assert.equal(
      await options.frameLocator("iframe").locator("#shortcuts tr").count(),
      25,
    );
    await options
      .getByRole("link", { name: "Sync & backup", exact: true })
      .click();
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
    await options
      .getByRole("link", { name: "Appearance & controls", exact: true })
      .click();
    await options.getByLabel("Search settings").fill("location");
    await options
      .getByRole("button", { name: /Command palette location/ })
      .click();
    assert.equal(
      await options
        .locator("#placement")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    for (const search of ["scoped", "commands", "everything"]) {
      await options
        .getByLabel("Palette search", { exact: true })
        .selectOption(search);
      await popup.locator("#search").fill("copy-url");
      await popup.getByRole("option", { name: /Copy links/ }).waitFor();
    }
    await options.getByLabel("Search settings").fill("screenshot url");
    await options.getByRole("button", { name: /Screenshot URL label/ }).click();
    await options.locator("#screenshotLabelCorner").waitFor();
    assert.equal(
      await options
        .locator("#screenshotLabelCorner")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await options.goBack();
    await options
      .getByRole("heading", { name: "Appearance & controls" })
      .waitFor();
    await options.goForward();
    await options.getByRole("heading", { name: "Screenshots" }).waitFor();
    if (process.env.MODS_UI_ARTIFACTS)
      await options.screenshot({
        path: path.join(process.env.MODS_UI_ARTIFACTS, "options.png"),
      });
    await popup.locator("#search").fill("");
    await popup
      .getByRole("button", { name: "Clipboard & capture", exact: true })
      .click();
    await menu.click();
    const openedSettings = context.waitForEvent("page");
    await popup.getByRole("menuitem", { name: "Feature settings" }).click();
    const settingsTab = await openedSettings;
    await settingsTab.getByRole("heading", { name: "Screenshots" }).waitFor();
    await settingsTab.close();
    const launcher = await context.newPage();
    await launcher.goto(base + "launcher.html");
    await launcher.waitForTimeout(200);
    assert.equal(await launcher.locator("#app").innerText(), "");
    assert.deepEqual(errors, []);
    console.log(
      "PASS popup navigation, Radix row menus, live sync, search, narrow layout, Options history and deep links, invalid import, unauthorized launcher",
    );
  } finally {
    await context.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
