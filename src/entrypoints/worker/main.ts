import { registerRdpHelper } from "../../features/rdp-download/public";
import { createBrowserPort } from "../../platform/chrome/browser";
import { createWorker } from "../../composition/worker";
import { registerShortcutHistory } from "../../composition/shortcuts";
createWorker(createBrowserPort(chrome)).register();
registerShortcutHistory();
registerRdpHelper();
