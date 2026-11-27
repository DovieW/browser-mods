import type { BrowserPort } from "../../../platform/chrome/browser";
import type {
  CommandContext,
  CommandHandler,
  Tab,
} from "../../../contracts/browser";
import { commandError } from "../../../core/actions/errors";
import { succeeded } from "../../../contracts/action-messages";
import { createScreenshot } from "./screenshot";
import type { ScreenshotLabelStyle } from "../../../core/clipboard/screenshot-label";

function screenshotUrl(raw: string, limit: number): string {
  const url = URL.parse(raw);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:"))
    return "";
  url.username = "";
  url.password = "";
  return url.href.length > limit
    ? url.href.slice(0, limit - 1) + "…"
    : url.href;
}

export function createClipboard(
  chrome: Pick<
    BrowserPort,
    "tabs" | "windows" | "permissions" | "runtime" | "offscreen"
  >,
  readScreenshotLabelStyle: () => Promise<ScreenshotLabelStyle>,
  activatePane: (tab: Tab) => Promise<unknown>,
) {
  const captureScreenshot = createScreenshot(chrome, activatePane);
  let creatingOffscreen: Promise<void> | undefined;
  async function writeClipboard(
    type: string,
    payload: Record<string, unknown>,
  ) {
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

  function screenshotCommand(withUrl: boolean): CommandHandler {
    return async (context, _granted, invokedTab) => {
      const [first, second] = await captureScreenshot(context, invokedTab);
      if (
        second &&
        first.dataUrl.length + second.dataUrl.length > 60 * 1024 * 1024
      )
        throw commandError("screenshot_failed");

      const labelStyle = withUrl ? await readScreenshotLabelStyle() : undefined;
      const label = (url: string) =>
        labelStyle
          ? screenshotUrl(url, labelStyle.screenshotLabelMaxLength)
          : "";
      await writeClipboard("copy-image", {
        dataUrl: first.dataUrl,
        ...(labelStyle ? { url: label(first.url), labelStyle } : {}),
        ...(second ? { secondDataUrl: second.dataUrl } : {}),
        ...(second && labelStyle ? { secondUrl: label(second.url) } : {}),
      });
    };
  }
  return {
    copyUrls,
    copyScreenshot: screenshotCommand(true),
    copyPlainScreenshot: screenshotCommand(false),
  };
}
