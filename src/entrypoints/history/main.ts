import { initializeOptions } from "../../features/shortcut-setup/public-options";
if (new URLSearchParams(location.search).get("view") === "options")
  document.body.classList.add("history-pane");
initializeOptions();
