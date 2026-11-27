export type Result = {
  id: string;
  label: string;
  description?: string;
  group: string;
  key?: string;
  setting?: string;
  run: () => Promise<unknown>;
  stay?: boolean;
};

export const pages = [
  "Features",
  "Shortcuts",
  "Appearance & controls",
  "Site access",
  "Sync & backup",
] as const;

export const workflows = [
  "Tabs & windows",
  "Bookmarks & reading",
  "Clipboard & capture",
  "Media",
  "Web tools",
] as const;

export const featureRoutes = {
  Tabs: ["Tabs & windows", "Tab switching"],
  Clipboard: ["Clipboard & capture", "Screenshots"],
  Media: ["Media", "Media controls"],
  RDP: ["Web tools", "RDP download helper"],
} as const;

export function workflow(action: Result) {
  if (action.id === "go-home") return "Web tools";
  if (action.group === "Clipboard") return "Clipboard & capture";
  if (action.group === "Media") return "Media";
  if (action.group === "Tabs") return "Tabs & windows";
  return action.group;
}

export const settings = [
  {
    label: "Command palette location",
    page: "Appearance & controls",
    control: "placement",
  },
  {
    label: "Palette search mode",
    page: "Appearance & controls",
    control: "searchMode",
  },
  {
    label: "Show disabled features in search",
    page: "Appearance & controls",
    control: "includeDisabled",
  },
  {
    label: "Pinned actions and ordering",
    page: "Appearance & controls",
    control: "action-order",
  },
  {
    label: "Keyboard shortcuts",
    page: "Shortcuts",
    control: "shortcut-settings",
  },
  {
    label: "Shortcut assignment history and recovery",
    page: "Shortcuts",
    control: "shortcut-history",
  },
  {
    label: "Screenshot URL label",
    page: "Screenshots",
    control: "screenshotLabelCorner",
  },
  ...(
    [
      ["screenshotLabelTextColor", "Screenshot URL text color"],
      ["screenshotLabelBackgroundColor", "Screenshot URL background color"],
      ["screenshotLabelFontSize", "Screenshot URL font size"],
      ["screenshotLabelPadding", "Screenshot URL padding"],
      ["screenshotLabelMaxLength", "Screenshot maximum URL length"],
    ] as const
  ).map(([control, label]) => ({ control, label, page: "Screenshots" })),
  {
    label: "Allow split screenshots",
    page: "Screenshots",
    control: "split-screenshots",
  },
  {
    label: "Tab-switching behavior",
    page: "Tab switching",
    control: "tab-switching",
  },
  {
    label: "Desktop helper and RDP settings",
    page: "RDP download helper",
    control: "rdp-settings",
  },
  {
    label: "Enable or disable features",
    page: "Features",
    control: "mod-settings",
  },
  {
    label: "Site permissions and access",
    page: "Site access",
    control: "site-settings",
  },
  {
    label: "Sync, import and export",
    page: "Sync & backup",
    control: "backup-settings",
  },
];

export function optionsRoute(hash: string) {
  let target = "";
  let control = "";
  try {
    [target = "", control = ""] = decodeURIComponent(hash.slice(1)).split("|");
  } catch {
    return { page: pages[0], control };
  }
  if (target === "Mods")
    target = control.startsWith("screenshot") ? "Screenshots" : "Features";
  if (target === "Appearance & navigation") target = "Appearance & controls";
  if (target === "Appearance & controls" && control === "layout")
    control = "action-order";
  const valid =
    pages.some((page) => page === target) ||
    Object.values(featureRoutes).some(([, page]) => page === target);
  return { page: valid ? target : pages[0], control };
}
