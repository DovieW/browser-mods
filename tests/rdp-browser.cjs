const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const portal = "https://remote.test";
const microsoft = "https://login.microsoftonline.com";
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
  manifest.host_permissions = [portal + "/*", microsoft + "/*"];
  manifest.permissions.push("downloads", "nativeMessaging");
  manifest.optional_permissions = manifest.optional_permissions.filter(
    (permission) => !["downloads", "nativeMessaging"].includes(permission),
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
    let signIns = 0;
    await context.route(portal + "/**", async (route) => {
      const { pathname, search } = new URL(route.request().url());
      if (
        pathname === "/my.policy" &&
        (search === "?autofill" || route.request().method() === "POST")
      ) {
        if (route.request().method() === "POST") signIns++;
        return route.fulfill({
          contentType: "text/html",
          body: `<h1>Secure Logon for F5 Networks</h1>
            <form method="post" action="/my.policy">
              <label>Username <input name="username"></label>
              <label>Password <input type="password" name="password"></label>
              <input type="submit" value="Logon">
            </form>
            <script>
              setTimeout(() => {
                for (const field of document.querySelectorAll("input:not([type=submit])")) {
                  field.value = "fixture";
                  field.dispatchEvent(new Event("input", { bubbles: true }));
                }
              }, 400);
            </script>`,
        });
      }
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
                  const favorite = document.createElement("span");
                  favorite.id = "/Common/test-desktop";
                  favorite.className = "favorite";
                  favorite.innerHTML = '<span class="caption"><span>Work Desktop</span></span>';
                  favorite.addEventListener("click", () => { location.href = "/desktop.rdp"; });
                  document.getElementById("desktop").append(favorite);
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
        body: `<h1>Pick an account</h1>
          <button onclick="document.body.textContent = 'Wrong account'">personal@example.test</button>
          <div role="button" onclick="document.getElementById('next').hidden = false"><span>work@example.test</span></div>
          <a id="next" hidden href="${portal}${webtop}">Finish manual sign-in</a>`,
      }),
    );

    await context.route(microsoft + "/fixture/saml2", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<h1 id="loginHeader">Sign in</h1><main></main><script>
          const main = document.querySelector("main");
          function stage(password) {
            document.getElementById("loginHeader").textContent = password ? "Enter password" : "Sign in";
            main.innerHTML = password ? '<input id="i0118" type="password" name="passwd"><input id="idSIButton9" type="submit" value="Sign in">' :
              '<input id="i0116" type="email" name="loginfmt"><input id="idSIButton9" type="submit" value="Next">';
            document.getElementById("idSIButton9").onclick = () => {
              if (!password) { stage(true); return; }
              document.getElementById("loginHeader").textContent = "Verify your identity";
              main.innerHTML = '<input name="otp"><button>Verify</button>';
            };
          }
          stage(false);
        </script>`,
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
            portal: {
              origin,
              path: pathname,
              desktop: "Work Desktop",
              account: "work@example.test",
            },
          },
        }),
      { key: preferenceKey, origin: portal, pathname: webtop },
    );

    const page = await context.newPage();
    await page.goto(portal + webtop);
    await page.getByText("Work Desktop", { exact: true }).waitFor();
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
    await recovery.getByText("Work Desktop", { exact: true }).waitFor();
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
      async ({ key, origin, pathname }) => {
        await chrome.storage.local.set({
          [key]: {
            enabled: true,
            policyOrigin: origin,
            autoSubmitF5: true,
            portal: { origin, path: pathname, desktop: "Work Desktop" },
          },
        });
      },
      { key: preferenceKey, origin: portal, pathname: webtop },
    );
    const filled = await context.newPage();
    await filled.goto(portal + "/my.policy?autofill");
    await filled.waitForURL(portal + "/my.policy", { timeout: 6_000 });
    await filled.waitForFunction(
      () => document.querySelector('input[type="password"]').value !== "",
    );
    assert.equal(
      signIns,
      1,
      "A second filled F5 form must not be submitted in the same run",
    );
    await worker.evaluate(
      async ({ key, origin, pathname }) => {
        await chrome.storage.local.set({
          [key]: {
            enabled: true,
            policyOrigin: origin,
            nativeAutofill: false,
            portal: {
              origin,
              path: pathname,
              desktop: "Work Desktop",
              account: "work@example.test",
            },
          },
        });
        chrome.runtime.sendNativeMessage = async (host, message) => {
          if (
            host !== "com.doview.browser_mods" ||
            message.action !== "bitwarden-autofill"
          )
            return { ok: false };
          const [tab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true,
          });
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const field = document.activeElement;
              if (!["i0116", "i0118"].includes(field.id))
                throw Error("Unexpected focus");
              field.value =
                field.id === "i0116" ? "work@example.test" : "fixture";
              document.body.dataset.nativeCalls = String(
                Number(document.body.dataset.nativeCalls || 0) + 1,
              );
              field.dispatchEvent(new Event("input", { bubbles: true }));
            },
          });
          return { ok: true };
        };
      },
      { key: preferenceKey, origin: portal, pathname: webtop },
    );
    const helper = await context.newPage();
    await helper.bringToFront();
    await helper.goto(portal + "/my.policy?different");
    await helper.getByText("Updated policy").waitFor();
    await helper.goto(microsoft + "/fixture/saml2");
    await helper.getByText("Sign in", { exact: true }).waitFor();
    await popup.bringToFront();
    await worker.evaluate(async (key) => {
      const previous = (await chrome.storage.local.get(key))[key];
      await chrome.storage.local.set({
        [key]: { ...previous, nativeAutofill: true },
      });
    }, preferenceKey);
    assert.equal(
      await helper.locator("body").getAttribute("data-native-calls"),
      null,
    );
    await helper.bringToFront();
    await helper.getByText("Verify your identity").waitFor({ timeout: 12000 });
    assert.equal(
      await helper.locator("body").getAttribute("data-native-calls"),
      "2",
    );
    assert.equal(await helper.locator('input[name="otp"]').inputValue(), "");
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
    assert.equal(
      await policy
        .getByRole("link", { name: "Finish manual sign-in" })
        .isVisible(),
      false,
    );
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
