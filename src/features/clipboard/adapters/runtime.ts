import type { BrowserPort } from "../../../platform/chrome/browser";
import type { CommandContext, Tab } from "../../../contracts/browser";
import { commandError } from "../../../core/actions/errors";
import { succeeded } from "../../../contracts/action-messages";
import { createScreenshot } from "./screenshot";

export function createClipboard(
  chrome: Pick<
    BrowserPort,
    "tabs" | "windows" | "permissions" | "runtime" | "offscreen"
  >,
  showScreenshotUrl: () => Promise<boolean>,
  activatePane: (tab: Tab) => Promise<unknown>,
) {
  const captureScreenshot = createScreenshot(
    chrome,
    showScreenshotUrl,
    activatePane,
  );
  let creatingOffscreen: Promise<void> | undefined;
  async function writeClipboard(type: string, payload: Record<string, string>) {
    try {
      const url = chrome.runtime.getURL("offscreen.html");
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [url],
      });
      if (!contexts.length) {
        if (!creatingOffscreen)
          creatingOffscreen = chrome.offscreen
            .createDocument({
              url: "offscreen.html",
              reasons: ["CLIPBOARD", "BLOBS", "IFRAME_SCRIPTING"],
              justification:
                "Copy selected tab links or a captured PNG image to the clipboard.",
            })
            .finally(() => {
              creatingOffscreen = undefined;
            });
        await creatingOffscreen;
      }
      const response: unknown = await chrome.runtime.sendMessage({
        target: "offscreen",
        type,
        ...payload,
      });
      if (!succeeded(response)) throw commandError("clipboard_failed");
    } catch {
      throw commandError("clipboard_failed");
    }
  }

  async function copyUrls(context: CommandContext) {
    let selected = context.selected.length
      ? context.selected
      : context.active
        ? [context.active]
        : [];
    const splitId = context.active?.splitViewId;
    if (splitId !== undefined && splitId >= 0) {
      const selectedIds = new Set(selected.map((tab) => tab.id));
      selected = context.tabs.filter(
        (tab) => tab.splitViewId === splitId || selectedIds.has(tab.id),
      );
    }
    if (!selected.length) throw commandError("no_tab");
    if (selected.some((tab) => !tab.url)) throw commandError("no_url");
    await writeClipboard("copy-url", {
      text: selected.map((tab) => tab.url).join("\n"),
    });
  }

  async function copyScreenshot(
    context: CommandContext,
    _granted?: boolean,
    invokedTab?: chrome.tabs.Tab,
  ) {
    const [first, second] = await captureScreenshot(context, invokedTab);
    if (second) {
      if (first.dataUrl.length + second.dataUrl.length > 60 * 1024 * 1024)
        throw commandError("screenshot_failed");
      await writeClipboard("copy-image", {
        ...first,
        secondDataUrl: second.dataUrl,
        secondUrl: second.url,
      });
      return;
    }
    await writeClipboard(
      "copy-image",
      first.url ? { ...first } : { dataUrl: first.dataUrl },
    );
  }
  return { copyUrls, copyScreenshot };
}
