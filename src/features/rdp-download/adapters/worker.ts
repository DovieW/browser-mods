import { listenerScope } from "../../../platform/chrome/listeners";
import {
  isExpectedDownload,
  isMicrosoftSignIn,
  portalAddress,
  preferenceKey,
  runPrefix,
  type Portal,
  type Preferences,
  type Run,
} from "../domain/portal";
import { inspectPortal, isFreshPortalVisit } from "./page";
import { loadRdpPreferences, readRdpRun } from "./storage";

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

  async function handlePage(id: number, url: string) {
    const { enabled, portal } = await prefs;
    if (!enabled || !portal) return;
    await restored;
    const address = portalAddress(url);
    if (address?.origin !== portal.origin) {
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

    if (
      address.pathname !== portal.path &&
      address.pathname !== "/vdesk/hangup.php3"
    ) {
      if (previous?.phase === "waiting") {
        await write(id, { ...waiting, phase: "stopped" });
      }
      return;
    }
    const page = await result(id, inspectPortal, [portal, url, "inspect"]);
    if (!(await stillEnabled(portal, id, url))) return;
    if (page?.result === "signed-out" && !waiting.restarted) {
      await write(id, { phase: "waiting", restarted: true });
      if (await stillEnabled(portal, id, url)) {
        await result(
          id,
          inspectPortal,
          [portal, url, "restart"],
          page.documentId,
        );
      }
      return;
    }
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

  scope.listen(chrome.tabs.onUpdated, (id, change, tab) => {
    if (
      change.status !== "complete" ||
      !tab.url ||
      (settings && (!settings.enabled || !settings.portal))
    )
      return;
    const url = tab.url;
    const previous = jobs.get(id) ?? Promise.resolve();
    const next = previous.then(() => handlePage(id, url)).catch(() => {});
    jobs.set(id, next);
    void next.then(() => {
      if (jobs.get(id) === next) jobs.delete(id);
    });
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
    if (area !== "local" || !changes[preferenceKey]) return;
    prefs = (async () => {
      await restored;
      const keys = storedRuns(await chrome.storage.session.get(null)).map(
        ([key]) => key,
      );
      if (keys.length) await chrome.storage.session.remove(keys);
      ownedTabs.clear();
      return configured();
    })().catch(() => ({ enabled: false }));
  });
  scope.listen(chrome.permissions.onAdded, watchDownloads);
  scope.listen(chrome.permissions.onRemoved, watchDownloads);
  watchDownloads();
}
