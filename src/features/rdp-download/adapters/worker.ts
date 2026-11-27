import { listenerScope } from "../../../platform/chrome/listeners";
import {
  isExpectedDownload,
  isMicrosoftSignIn,
  microsoftAccountOrigin,
  portalAddress,
  preferenceKey,
  readPreferences,
  runPrefix,
  type Portal,
  type Preferences,
  type Run,
} from "../domain/portal";
import {
  acceptPolicy,
  inspectPortal,
  isFreshPortalVisit,
  selectMicrosoftAccount,
  submitFilledF5,
} from "./page";
import { loadRdpPreferences, nativeHost, readRdpRun } from "./storage";
import { microsoftForm, type MicrosoftStage } from "./microsoft";

export function registerRdpHelper() {
  const scope = listenerScope();
  const downloadScope = listenerScope();
  let settings: Preferences | undefined;
  const configured = async () => {
    settings = await loadRdpPreferences().catch(() => ({ enabled: false }));
    return settings;
  };
  let prefs = configured();
  const ownedTabs = new Set<number>();
  const storedRuns = (state: Record<string, unknown>) =>
    Object.entries(state).filter(([key]) => key.startsWith(runPrefix));
  const restored = prefs
    .then(async ({ enabled, portal }) => {
      if (!enabled || !portal) return;
      for (const [key] of storedRuns(await chrome.storage.session.get(null)))
        ownedTabs.add(Number(key.slice(runPrefix.length)));
    })
    .catch(() => {});
  const jobs = new Map<number, Promise<void>>();
  let downloadQueue = Promise.resolve();

  const write = (id: number, run: Run) => {
    ownedTabs.add(id);
    return chrome.storage.session.set({ [`${runPrefix}${id}`]: run });
  };
  const clear = (id: number) => {
    ownedTabs.delete(id);
    return chrome.storage.session.remove(`${runPrefix}${id}`);
  };
  const currentUrl = async (id: number) => {
    const tab = await chrome.tabs.get(id).catch(() => null);
    return tab?.url;
  };
  const result = async <Args extends unknown[], Value>(
    id: number,
    func: (...args: Args) => Value,
    args: Args,
    documentId?: string,
  ) => {
    const [entry] = await chrome.scripting
      .executeScript({
        target: documentId
          ? { tabId: id, documentIds: [documentId] }
          : { tabId: id },
        func,
        args,
      })
      .catch(() => []);
    return entry;
  };

  const permitted = (portal: Portal) =>
    chrome.permissions.contains({
      origins: [portal.origin + "/*"],
      permissions: ["downloads"],
    });
  const stillEnabled = async (portal: Portal, id: number, url: string) => {
    const settings = await loadRdpPreferences();
    return (
      settings.enabled &&
      settings.portal?.origin === portal.origin &&
      settings.portal.path === portal.path &&
      settings.portal.desktop === portal.desktop &&
      (await permitted(portal)) &&
      (await currentUrl(id)) === url
    );
  };

  async function runMicrosoftAutofill(
    id: number,
    url: string,
    portal: Portal,
    account: string,
  ) {
    const documentMatches = async () => {
      const live = await loadRdpPreferences();
      if (
        !live.enabled ||
        !live.nativeAutofill ||
        live.portal?.origin !== portal.origin ||
        live.portal.account !== account ||
        !(await chrome.permissions.contains({
          permissions: ["nativeMessaging"],
          origins: [microsoftAccountOrigin + "/*"],
        }))
      )
        return false;
      const tab = await chrome.tabs.get(id);
      return (
        tab.url === url &&
        !tab.pendingUrl &&
        tab.active &&
        (await chrome.windows.get(tab.windowId)).focused
      );
    };
    const run = await readRdpRun(id);
    if (run?.phase !== "waiting") return;
    const attempted = run.microsoftShortcuts ?? [];
    const status = (microsoftStatus: NonNullable<Run["microsoftStatus"]>) =>
      write(id, { ...run, microsoftShortcuts: attempted, microsoftStatus });
    if (!(await documentMatches())) {
      await status("waiting-for-focus");
      return;
    }
    const stages: MicrosoftStage[] = ["username", "password"];
    const remaining = stages.filter((stage) => !attempted.includes(stage));
    while (remaining.length) {
      await status("looking-for-form");
      const detected = await result(id, microsoftForm, [
        url,
        account,
        remaining,
        "detect",
      ]);
      const stage = detected?.result;
      if (!stage || !detected.documentId) return;
      const focus = await result(
        id,
        microsoftForm,
        [url, account, [stage], "focus"],
        detected.documentId,
      );
      if (!focus?.result || !(await documentMatches())) {
        await status("waiting-for-focus");
        return;
      }
      attempted.push(stage);
      await status("sending-shortcut");
      if (!(await documentMatches())) return;
      const reply: unknown = await chrome.runtime
        .sendNativeMessage(nativeHost, { action: "bitwarden-autofill" })
        .catch(() => null);
      if (
        !reply ||
        typeof reply !== "object" ||
        !("ok" in reply) ||
        reply.ok !== true
      ) {
        await status("helper-failed");
        return;
      }
      await status("waiting-for-fill");
      const filled = await result(
        id,
        microsoftForm,
        [url, account, [stage], "wait"],
        detected.documentId,
      );
      if (!filled?.result || !(await documentMatches())) {
        await status("no-fill");
        return;
      }
      await status("submitting");
      await result(
        id,
        microsoftForm,
        [url, account, [stage], "submit"],
        detected.documentId,
      );
      // Microsoft can replace the sign-in form before Chrome returns the script result.
      if (stage === "password") return;
      remaining.splice(remaining.indexOf(stage), 1);
      if (!remaining.length || !(await documentMatches())) return;
    }
  }

  async function recoverLaunchError(
    portal: Portal,
    id: number,
    url: string,
    previous: Run | undefined,
  ) {
    if (previous?.restarted && previous.phase !== "downloaded") return;
    const denied = await chrome.scripting
      .executeScript({
        target: { tabId: id },
        func: () => {
          const navigation = performance.getEntriesByType("navigation")[0] as
            PerformanceNavigationTiming | undefined;
          return navigation?.responseStatus === 403;
        },
      })
      .then(([entry]) => entry?.result)
      .catch((error: unknown) => {
        // Chrome's generated HTTP error document cannot run extension scripts.
        return (
          error instanceof Error && /is showing error page/i.test(error.message)
        );
      });
    if (!denied || !(await stillEnabled(portal, id, url))) return;
    await write(id, { phase: "waiting", restarted: true });
    if (!(await stillEnabled(portal, id, url))) return;
    const tab = await chrome.tabs.get(id);
    if (tab.url === url && !tab.pendingUrl)
      await chrome.tabs.update(id, { url: portal.origin + "/" });
  }

  async function handlePage(id: number, url: string) {
    const { enabled, portal, policyOrigin } = await prefs;
    if (!enabled) return;
    const address = portalAddress(url);
    const shouldAccept =
      policyOrigin &&
      address?.origin === policyOrigin &&
      address.pathname === "/my.policy";
    if (shouldAccept) {
      let run: Run | undefined;
      if (portal?.origin === policyOrigin) {
        await restored;
        run = await readRdpRun(id);
        if (run?.phase !== "waiting" && (await currentUrl(id)) === url) {
          run = { phase: "waiting", restarted: false };
          await write(id, run);
        }
      }
      const policyEnabled = async (current: Preferences) =>
        current.enabled &&
        current.policyOrigin === policyOrigin &&
        (await chrome.permissions.contains({
          origins: [policyOrigin + "/*"],
        })) &&
        (await currentUrl(id)) === url;
      const current = await loadRdpPreferences();
      if (!(await policyEnabled(current))) return;
      const acknowledged = await result(id, acceptPolicy, [url]);
      if (
        acknowledged?.result ||
        !run ||
        run.f5Submitted ||
        !current.autoSubmitF5
      )
        return;
      const ready = await result(id, submitFilledF5, [url, "wait"]);
      if (!ready?.result || !ready.documentId) return;
      const live = await loadRdpPreferences();
      if (!live.autoSubmitF5 || !(await policyEnabled(live))) return;
      await write(id, { ...run, f5Submitted: true });
      await result(id, submitFilledF5, [url, "submit"], ready.documentId);
      return;
    }
    if (!portal) return;
    await restored;
    if (address?.origin !== portal.origin) {
      if (
        portal.account &&
        address?.origin === microsoftAccountOrigin &&
        ownedTabs.has(id) &&
        (await readRdpRun(id))?.phase === "waiting" &&
        (await chrome.permissions.contains({
          origins: [microsoftAccountOrigin + "/*"],
        })) &&
        (await currentUrl(id)) === url
      ) {
        const live = await loadRdpPreferences();
        if (
          live.enabled &&
          live.portal?.origin === portal.origin &&
          live.portal.account === portal.account
        ) {
          await result(id, selectMicrosoftAccount, [url, portal.account]);
          if (live.nativeAutofill && address.pathname.endsWith("/saml2"))
            await runMicrosoftAutofill(id, url, portal, portal.account);
        }
      }
      if (
        ownedTabs.has(id) &&
        (!address || !isMicrosoftSignIn(address)) &&
        (await currentUrl(id)) === url
      )
        await clear(id);
      return;
    }
    if ((await currentUrl(id)) !== url) return;
    if (!(await permitted(portal))) return;

    const previous = await readRdpRun(id);
    if (address.pathname === "/vdesk/hangup.php3") {
      const page = await result(id, inspectPortal, [portal, url, "inspect"]);
      if (
        page?.result !== "signed-out-from-webtop" &&
        (page?.result !== "signed-out" ||
          (previous?.restarted && previous.phase !== "downloaded"))
      )
        return;
      if (!(await stillEnabled(portal, id, url))) return;
      await write(id, { phase: "waiting", restarted: true });
      if (await stillEnabled(portal, id, url))
        await result(
          id,
          inspectPortal,
          [portal, url, "restart"],
          page.documentId,
        );
      return;
    }
    if (
      address.pathname.startsWith("/f5vdi/rdp/launch/") &&
      address.pathname !== "/f5vdi/rdp/launch/"
    ) {
      await recoverLaunchError(portal, id, url, previous);
      return;
    }
    if (previous && previous.phase !== "waiting") {
      const expired =
        previous.phase === "requested" &&
        Date.now() - (previous.started ?? 0) > 60_000;
      if (
        (previous.phase === "requested" && !expired) ||
        !(await result(id, isFreshPortalVisit, []))?.result
      )
        return;
    }
    const waiting: Run =
      previous?.phase === "waiting"
        ? previous
        : { phase: "waiting", restarted: false };
    if (address.pathname === "/" || address.pathname === "/my.policy") {
      if (!previous || previous.phase !== "waiting") await write(id, waiting);
      return;
    }

    if (address.pathname !== portal.path) {
      if (previous?.phase === "waiting") {
        await write(id, { ...waiting, phase: "stopped" });
      }
      return;
    }
    const page = await result(id, inspectPortal, [portal, url, "inspect"]);
    if (!(await stillEnabled(portal, id, url))) return;
    if (page?.result !== "ready") {
      await write(id, { phase: "stopped", restarted: waiting.restarted });
      return;
    }

    // Downloads have no tab ID. Allow only one outstanding request for the portal.
    downloadQueue = downloadQueue
      .catch(() => {})
      .then(async () => {
        if (!(await stillEnabled(portal, id, url))) return;
        const started = Date.now();
        const state = await chrome.storage.session.get(null);
        const pending = storedRuns(state).some(([, value]) => {
          const other = value as Run | undefined;
          return (
            other?.phase === "requested" &&
            started - (other.started ?? 0) <= 60_000
          );
        });
        if (pending) {
          await write(id, { ...waiting, phase: "stopped" });
          return;
        }
        const requested: Run = { ...waiting, phase: "requested", started };
        await write(id, requested);
        if (!(await stillEnabled(portal, id, url))) return;
        if (
          (
            await result(
              id,
              inspectPortal,
              [portal, url, "download"],
              page.documentId,
            )
          )?.result === "unknown"
        )
          await write(id, { ...requested, phase: "stopped" });
      });
    await downloadQueue;
  }

  function watchDownloads() {
    downloadScope.dispose();
    const downloads = (chrome as Partial<typeof chrome>).downloads;
    if (!downloads) return;
    downloadScope.listen(downloads.onChanged, (delta) => {
      if (
        delta.state?.current !== "complete" &&
        delta.state?.current !== "interrupted"
      )
        return;
      const finalPhase =
        delta.state.current === "complete" ? "downloaded" : "stopped";
      void (async () => {
        const { enabled, portal } = await prefs;
        if (!enabled || !portal) return;
        const [item] = await downloads.search({ id: delta.id });
        if (!item) return;
        for (const [key, value] of storedRuns(
          await chrome.storage.session.get(null),
        )) {
          const run = value as Run | undefined;
          if (
            run?.phase === "requested" &&
            run.started !== undefined &&
            isExpectedDownload(item, portal, run.started)
          ) {
            await chrome.storage.session.set({
              [key]: { ...run, phase: finalPhase },
            });
          }
        }
      })().catch(() => {});
    });
  }

  function queuePage(id: number, url: string) {
    const previous = jobs.get(id) ?? Promise.resolve();
    const next = previous.then(() => handlePage(id, url)).catch(() => {});
    jobs.set(id, next);
    void next.then(() => {
      if (jobs.get(id) === next) jobs.delete(id);
    });
  }
  async function resumeMicrosoft(tabId?: number) {
    const { enabled, nativeAutofill } = await prefs;
    if (!enabled || !nativeAutofill) return;
    await restored;
    const tab =
      tabId === undefined
        ? (
            await chrome.tabs.query({ active: true, lastFocusedWindow: true })
          )[0]
        : await chrome.tabs.get(tabId);
    if (!tab?.id || !tab.url || !ownedTabs.has(tab.id) || jobs.has(tab.id))
      return;
    if (portalAddress(tab.url)?.origin === microsoftAccountOrigin)
      queuePage(tab.id, tab.url);
  }
  scope.listen(chrome.tabs.onUpdated, (id, change, tab) => {
    if (
      change.status !== "complete" ||
      !tab.url ||
      (settings &&
        (!settings.enabled || (!settings.portal && !settings.policyOrigin)))
    )
      return;
    queuePage(id, tab.url);
  });
  scope.listen(chrome.tabs.onActivated, ({ tabId }) => {
    if (settings?.nativeAutofill) void resumeMicrosoft(tabId).catch(() => {});
  });
  scope.listen(chrome.windows.onFocusChanged, (windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE && settings?.nativeAutofill)
      void resumeMicrosoft().catch(() => {});
  });
  scope.listen(chrome.tabs.onRemoved, (id) => {
    if (settings && !settings.portal) return;
    void (jobs.get(id) ?? restored)
      .then(async () => {
        if (ownedTabs.has(id)) await clear(id);
      })
      .catch(() => {});
  });
  scope.listen(chrome.storage.onChanged, (changes, area) => {
    const change = changes[preferenceKey];
    if (area !== "local" || !change) return;
    const previous = readPreferences(change.oldValue);
    const next = readPreferences(change.newValue);
    const samePortal =
      previous.enabled &&
      next.enabled &&
      previous.policyOrigin === next.policyOrigin &&
      previous.portal?.origin === next.portal?.origin &&
      previous.portal?.path === next.portal?.path &&
      previous.portal?.desktop === next.portal?.desktop &&
      previous.portal?.account === next.portal?.account;
    prefs = (async () => {
      await restored;
      if (samePortal) return configured();
      const keys = storedRuns(await chrome.storage.session.get(null)).map(
        ([key]) => key,
      );
      if (keys.length) await chrome.storage.session.remove(keys);
      ownedTabs.clear();
      return configured();
    })().catch(() => ({ enabled: false }));
    if (samePortal && next.nativeAutofill && !previous.nativeAutofill)
      void resumeMicrosoft().catch(() => {});
  });
  scope.listen(chrome.permissions.onAdded, watchDownloads);
  scope.listen(chrome.permissions.onRemoved, watchDownloads);
  watchDownloads();
}
