import { createRoot } from "react-dom/client";
import { workspaceBrowser } from "../adapters/browser";
import { mountWorkspace } from "./app";
import { ToolbarPopup } from "./toolbar-popup";

export function mountPopup(palette: boolean) {
  if (palette) {
    mountWorkspace({ mode: "popup" });
    return;
  }
  const container = document.getElementById("app");
  if (!container) throw Error("Missing app container");
  document.body.classList.add("popup");
  const root = createRoot(container);
  root.render(<ToolbarPopup port={workspaceBrowser()} />);
  window.addEventListener(
    "pagehide",
    () => {
      root.unmount();
    },
    { once: true },
  );
}
