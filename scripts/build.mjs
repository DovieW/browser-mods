import { parseArgs } from "node:util";
import { build } from "wxt";

const { values } = parseArgs({
  options: { "shortcut-labels": { type: "string" } },
});
if (values["shortcut-labels"])
  process.env.BROWSER_MODS_SHORTCUT_LABELS = values["shortcut-labels"];

await build();
