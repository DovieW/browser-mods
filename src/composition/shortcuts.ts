import { listenerScope } from "../platform/chrome/listeners";
import { createShortcutService } from "../core/shortcuts/application";
import { shortcutHistoryPort } from "../platform/storage/shortcut-history";
export function registerShortcutHistory() {
  const scope = listenerScope();
  const { reconcileShortcuts } = createShortcutService(
    shortcutHistoryPort(chrome),
  );
  function refresh(): void {
    void reconcileShortcuts().catch(() => undefined);
  }
  scope.listen(chrome.runtime.onStartup, refresh);
  scope.listen(chrome.runtime.onInstalled, refresh);
  scope.listen(chrome.commands.onCommand, refresh);
  scope.listen(
    chrome.runtime.onMessage,
    (message: unknown, sender, respond: (value: unknown) => void) => {
      if (
        !message ||
        typeof message !== "object" ||
        !("type" in message) ||
        message.type !== "mods.shortcuts.reconcile"
      )
        return false;
      if (
        sender.id !== chrome.runtime.id ||
        !sender.url?.startsWith(chrome.runtime.getURL(""))
      )
        return false;
      void reconcileShortcuts()
        .then((value) => {
          respond({ ok: true, value });
        })
        .catch(() => {
          respond({
            ok: false,
            error:
              "Could not save shortcut history. Your local records are retained; check storage access and sync quota.",
          });
        });
      return true;
    },
  );
  return scope.dispose;
}
