import { defineBackground } from "wxt/utils/define-background";
import { registerRdpHelper } from "../features/rdp-download/public";
import { createBrowserPort } from "../platform/chrome/browser";
import { createWorker } from "../composition/worker";
import { registerShortcutHistory } from "../composition/shortcuts";
export default defineBackground(() => {
  createWorker(createBrowserPort(chrome)).register();
  registerShortcutHistory();
  registerRdpHelper();
});
