import type { CommandContext, Tab } from "../../../contracts/browser";
import { SPLIT_SCREENSHOT_ORIGINS } from "../../../contracts/clipboard";
import { commandError, commandErrorCode } from "../../../core/actions/errors";
import type { BrowserPort } from "../../../platform/chrome/browser";

type CapturePort = Pick<BrowserPort, "tabs" | "windows" | "permissions">;
type Image = { dataUrl: string; url: string };

function screenshotUrl(raw: string): string {
  const url = URL.parse(raw);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:"))
    return "";
  url.username = "";
  url.password = "";
  return url.href.length > 240 ? url.href.slice(0, 239) + "…" : url.href;
}

function unchanged(current: Tab | undefined, original: Tab) {
  return (
    current?.id === original.id &&
    current.url === original.url &&
    !current.pendingUrl
  );
}

export function createScreenshot(
  chrome: CapturePort,
  showScreenshotUrl: () => Promise<boolean>,
  activatePane: (tab: Tab) => Promise<unknown>,
) {
  async function capture(tab: Tab, stamp: boolean): Promise<Image> {
    let dataUrl: string;
    try {
      dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "png",
      });
    } catch (error) {
      const message =
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
          ? error.message
          : "";
      if (/activeTab|<all_urls>|permission|Cannot access/i.test(message))
        throw commandError("screenshot_permission");
      if (/MAX_CAPTURE_VISIBLE_TAB|too many|quota|exceeded/i.test(message))
        throw commandError("screenshot_busy");
      if (commandErrorCode(error) === "no_tab") throw commandError("no_tab");
      throw commandError("screenshot_failed");
    }
    if (!dataUrl.startsWith("data:image/png;base64,"))
      throw commandError("screenshot_failed");
    return { dataUrl, url: stamp ? screenshotUrl(tab.url) : "" };
  }

  async function assertActive(tab: Tab) {
    const [active] = await chrome.tabs.query({
      windowId: tab.windowId,
      active: true,
    });
    if (!unchanged(active, tab)) throw commandError("screenshot_changed");
  }

  async function captureSplit(original: Tab, partner: Tab, stamp: boolean) {
    if (
      !(await chrome.permissions.contains({
        origins: SPLIT_SCREENSHOT_ORIGINS,
      }))
    )
      throw commandError("screenshot_split_permission");

    const windowId = original.windowId;
    const splitId = original.splitViewId;
    const originalFirst = original.index < partner.index;
    let switched = false;
    let interrupted = false;
    const wasInterrupted = () => interrupted;
    let expectedActivation = partner.id;
    const onActivate = (info: { windowId: number; tabId: number }) => {
      if (info.windowId === windowId && info.tabId !== expectedActivation)
        interrupted = true;
    };
    const onFocus = (id: number) => {
      if (id !== windowId && id !== chrome.windows.WINDOW_ID_NONE)
        interrupted = true;
    };
    const readPair = () =>
      Promise.all([
        chrome.windows.get(windowId),
        chrome.tabs.get(original.id),
        chrome.tabs.get(partner.id),
      ])
        .then(([window, first, second]) => ({ window, first, second }))
        .catch(() => null);

    async function assertPair(active: Tab) {
      const pair = await readPair();
      if (!pair) throw commandError("screenshot_changed");
      const { window, first, second } = pair;
      const ordered = first.index < second.index;
      const activePane = active.id === original.id ? first : second;
      if (
        interrupted ||
        !window.focused ||
        first.windowId !== windowId ||
        second.windowId !== windowId ||
        first.splitViewId !== splitId ||
        second.splitViewId !== splitId ||
        ordered !== originalFirst ||
        !unchanged(first, original) ||
        !unchanged(second, partner) ||
        !activePane.active
      )
        throw commandError("screenshot_changed");
    }

    chrome.tabs.onActivated.addListener(onActivate);
    chrome.windows.onFocusChanged.addListener(onFocus);
    try {
      await assertPair(original);
      const first = await capture(original, stamp);
      await assertPair(original);
      switched = true;
      await activatePane(partner);
      await assertPair(partner);
      const second = await capture(partner, stamp);
      await assertPair(partner);
      return originalFirst
        ? ([first, second] as const)
        : ([second, first] as const);
    } finally {
      try {
        if (switched && !wasInterrupted()) {
          const pair = await readPair();
          if (
            pair &&
            !wasInterrupted() &&
            pair.window.focused &&
            pair.first.windowId === windowId &&
            pair.second.windowId === windowId &&
            pair.first.splitViewId === splitId &&
            pair.second.splitViewId === splitId &&
            pair.second.active
          ) {
            expectedActivation = original.id;
            await activatePane(original);
            await assertPair(original);
          } else {
            throw commandError("screenshot_changed");
          }
        } else if (switched) {
          throw commandError("screenshot_changed");
        }
      } finally {
        chrome.tabs.onActivated.removeListener(onActivate);
        chrome.windows.onFocusChanged.removeListener(onFocus);
      }
    }
  }

  return async (context: CommandContext, invokedTab?: chrome.tabs.Tab) => {
    const tab = context.active;
    if (!tab) throw commandError("no_tab");
    if (invokedTab && (invokedTab.id !== tab.id || invokedTab.url !== tab.url))
      throw commandError("screenshot_changed");

    const stamp = await showScreenshotUrl();
    const splitId = tab.splitViewId;
    const partner =
      splitId === undefined || splitId < 0
        ? undefined
        : context.tabs.find(
            (candidate) =>
              candidate.id !== tab.id && candidate.splitViewId === splitId,
          );
    if (partner) return captureSplit(tab, partner, stamp);

    await assertActive(tab);
    const image = await capture(tab, stamp);
    await assertActive(tab);
    return [image] as const;
  };
}
