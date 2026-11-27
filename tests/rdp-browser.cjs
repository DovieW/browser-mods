const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const portal = "https://remote.test";
const microsoft = "https://login.microsoft.com";
const preferenceKey = "mods.rdp.preferences";
const webtop = "/vdesk/webtop.eui";
const launch = "/f5vdi/rdp/launch/Common/test-desktop";

(async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "mods-rdp-"));
  const extension = path.join(fixture, "extension");
  const profile = path.join(fixture, "profile");
  await fs.cp(path.resolve("dist"), extension, { recursive: true });
  const manifestFile = path.join(extension, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
  manifest.host_permissions = [portal + "/*"];
  manifest.permissions.push("downloads");
  manifest.optional_permissions = manifest.optional_permissions.filter(
    (permission) => permission !== "downloads",
  );
  await fs.writeFile(manifestFile, JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    ignoreHTTPSErrors: true,
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
    let requests = 0;
    let restarts = 0;
    await context.route(portal + "/**", async (route) => {
      const { pathname, search } = new URL(route.request().url());
      if (pathname === launch && search !== "?ok")
        return route.fulfill({ status: 403, body: "" });
      if (pathname === "/accept")
        return route.fulfill({
          contentType: "text/html",
          body: `<script>location.replace("${microsoft}/fixture");</script>`,
        });
      if (pathname === "/desktop.rdp") {
        requests++;
        return route.fulfill({
          headers: {
            "content-type": "application/octet-stream",
            "content-disposition": 'attachment; filename="desktop.rdp"',
          },
          body: "fixture RDP file",
        });
      }
      if (pathname === "/") {
        restarts++;
        return route.fulfill({
          contentType: "text/html",
          body: '<script>location.replace("/my.policy");</script>',
        });
      }
      const pages = {
        "/vdesk/hangup.php3":
          '<h1>Your session is finished.</h1><a href="/">click here.</a>',
        "/my.policy": `<p>${search === "?different" ? "Updated policy" : "For authorized users only. Your activities may be monitored. You consent to such monitoring."}</p>
          <a href="/accept">I Accept</a><a href="/">I Don't Accept</a>`,
        [webtop]:
          search === "?ambiguous"
            ? '<a href="/desktop.rdp">Work Desktop</a><a href="/desktop.rdp">Work Desktop</a>'
            : `<main id="desktop"></main><script>
                setTimeout(() => {
                  document.getElementById("desktop").innerHTML = '<a href="/desktop.rdp">Work Desktop</a>';
                }, 180);
              </script>`,
      };
      await route.fulfill({
        contentType: "text/html",
        body: pages[pathname] || "Unknown",
      });
    });
    await context.route(microsoft + "/fixture", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<a href="${portal}${webtop}">Finish manual sign-in</a>`,
      }),
    );

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    const toggle = popup.getByRole("checkbox", { name: "RDP download helper" });
    await toggle.waitFor();
    assert.equal(await toggle.isChecked(), true);
    await toggle.click();
    await popup.waitForFunction(async (key) => {
      return (await chrome.storage.local.get(key))[key]?.enabled === false;
    }, preferenceKey);
    await worker.evaluate(
      ({ key, origin, pathname }) =>
        chrome.storage.local.set({
          [key]: {
            enabled: false,
            portal: { origin, path: pathname, desktop: "Work Desktop" },
          },
        }),
      { key: preferenceKey, origin: portal, pathname: webtop },
    );

    const page = await context.newPage();
    await page.goto(portal + webtop);
    await page.getByRole("link", { name: "Work Desktop" }).waitFor();
    assert.equal(requests, 0);
    await popup.bringToFront();
    await toggle.click();
    await popup.waitForFunction(async (key) => {
      return (await chrome.storage.local.get(key))[key]?.enabled === true;
    }, preferenceKey);

    const recovery = await context.newPage();
    await recovery.goto(portal + "/vdesk/hangup.php3").catch((error) => {
      if (!String(error).includes("interrupted")) throw error;
    });
    await recovery.waitForURL(portal + "/my.policy");
    assert.equal(restarts, 1);
    await recovery.getByRole("link", { name: "I Accept" }).click();
    await recovery.waitForURL(microsoft + "/fixture");
    assert.equal(requests, 0);
    const completed = recovery.waitForEvent("download", { timeout: 8000 });
    await recovery.getByRole("link", { name: "Finish manual sign-in" }).click();
    const download = await completed;
    assert.equal(download.suggestedFilename(), "desktop.rdp");
    assert.equal(await download.failure(), null);

    await popup.waitForFunction(async () => {
      const entries = Object.entries(await chrome.storage.session.get(null));
      return entries.some(
        ([key, value]) =>
          key.startsWith("mods.rdp.run.") && value.phase === "downloaded",
      );
    });
    await recovery.reload();
    await recovery.getByRole("link", { name: "Work Desktop" }).waitFor();
    assert.equal(requests, 1);
    await recovery.close();

    const ambiguous = await context.newPage();
    await ambiguous.goto(portal + webtop + "?ambiguous");
    await popup.waitForFunction(
      async () => {
        const entries = Object.entries(await chrome.storage.session.get(null));
        return entries.some(
          ([key, value]) =>
            key.startsWith("mods.rdp.run.") && value.phase === "stopped",
        );
      },
      undefined,
      { timeout: 15_000 },
    );
    assert.equal(requests, 1);
    const denied = await context.newPage();
    await denied.goto(portal + launch + "?ok");
    assert.equal(await denied.locator("body").innerText(), "Unknown");
    assert.equal(restarts, 1);
    await denied.goto(portal + launch).catch((error) => {
      if (!/ERR_HTTP_RESPONSE_CODE_FAILURE|interrupted/.test(String(error)))
        throw error;
    });
    await denied.waitForURL(portal + "/my.policy", { timeout: 5000 });
    assert.equal(restarts, 2);
    const deniedAgain = await denied.goto(portal + launch).catch((error) => {
      if (!String(error).includes("ERR_HTTP_RESPONSE_CODE_FAILURE"))
        throw error;
    });
    assert.equal(deniedAgain?.status() ?? 403, 403);
    await denied.getByText("HTTP ERROR 403").waitFor();
    assert.equal(restarts, 2);
    await denied.goto(portal + "/my.policy");
    await denied.getByRole("link", { name: "I Accept" }).click();
    const reauthenticated = denied.waitForEvent("download", { timeout: 8000 });
    await denied.getByRole("link", { name: "Finish manual sign-in" }).click();
    assert.equal(await (await reauthenticated).failure(), null);
    assert.equal(requests, 2);
    await worker.evaluate(
      ({ key, origin }) =>
        chrome.storage.local.set({
          [key]: { enabled: true, policyOrigin: origin },
        }),
      { key: preferenceKey, origin: portal },
    );
    const policy = await context.newPage();
    await policy.goto(portal + "/my.policy?different");
    await policy.getByText("Updated policy").waitFor();
    await policy.goto(portal + "/my.policy").catch((error) => {
      if (!String(error).includes("interrupted")) throw error;
    });
    await policy.waitForURL(microsoft + "/fixture");
    assert.equal(requests, 2);
    console.log(
      "PASS RDP default, opt-out, sign-out and launch error recovery, bounded restart, manual MFA, and download deduplication",
    );
  } finally {
    await context.close();
    await fs.rm(fixture, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
