import { SPLIT_SCREENSHOT_ORIGINS } from "../../../contracts/clipboard";
import { succeeded } from "../../../contracts/action-messages";
import { commandErrorMessage } from "../../../core/actions/errors";
import { MEDIA_ORIGINS } from "../../../contracts/media";
import { readBrowserCommands } from "../../../platform/chrome/commands";
import {
  readPreferences,
  savePreference,
  importPreferences,
  restorePreferences,
  watchPreferences,
} from "./preferences";
export function workspaceBrowser() {
  return {
    readPreferences,
    savePreference,
    importPreferences,
    restorePreferences,
    watchPreferences,
    commands: () => readBrowserCommands(chrome.commands),
    async run(command: string) {
      if (
        command === "pause-all-tabs" &&
        !(await chrome.permissions.request({ origins: MEDIA_ORIGINS }))
      )
        throw Error("Site access declined.");
      const result: unknown = await chrome.runtime.sendMessage({
        target: "background",
        type: "run-command",
        command,
      });
      if (!succeeded(result))
        throw Error(
          commandErrorMessage(
            result &&
              typeof result === "object" &&
              "code" in result &&
              typeof result.code === "string"
              ? result.code
              : "action_failed",
          ),
        );
    },
    async currentTab() {
      const [t] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      return {
        id: t?.id,
        url: t?.url ?? "",
      };
    },
    async sourceTab(id: number) {
      const [source, own] = await Promise.all([
        chrome.tabs.get(id).catch(() => undefined),
        chrome.tabs.getCurrent(),
      ]);
      if (
        !source?.url ||
        !own ||
        source.windowId !== own.windowId ||
        source.incognito !== own.incognito
      )
        return undefined;
      return { id, url: source.url };
    },
    async tabs() {
      return (await chrome.tabs.query({ currentWindow: true })).map((t) => ({
        id: t.id ?? -1,
        title: t.title ?? "Untitled tab",
        url: t.url ?? "",
      }));
    },
    async focus(id: number) {
      const result: unknown = await chrome.runtime.sendMessage({
        target: "background",
        type: "focus-tab",
        tabId: id,
      });
      if (!succeeded(result)) throw Error("This tab is no longer available.");
    },
    async bookmarks(query: string) {
      if (!(await chrome.permissions.contains({ permissions: ["bookmarks"] })))
        return [];
      return (await chrome.bookmarks.search(query))
        .filter((b) => b.url)
        .slice(0, 50)
        .map((b) => ({ id: b.id, title: b.title, url: b.url ?? "" }));
    },
    requestBookmarks: () =>
      chrome.permissions.request({ permissions: ["bookmarks"] }),
    open: (url: string) => chrome.tabs.create({ url }),
    url: (path: string) => chrome.runtime.getURL(path),
    editKeys: () =>
      chrome.tabs.create({ url: "chrome://extensions/shortcuts" }),
    error: async () =>
      (await chrome.storage.session.get("lastError")).lastError as
        { code: string; command: string } | undefined,
    hasSplitScreenshotAccess: () =>
      chrome.permissions.contains({ origins: SPLIT_SCREENSHOT_ORIGINS }),
    allowSplitScreenshots: () =>
      chrome.permissions.request({ origins: SPLIT_SCREENSHOT_ORIGINS }),
    permissions: () => chrome.permissions.getAll(),
    revoke: (origins: string[]) => chrome.permissions.remove({ origins }),
  };
}
export type WorkspacePort = ReturnType<typeof workspaceBrowser>;
