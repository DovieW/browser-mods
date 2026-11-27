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

export const optionsSections = {
  Features: Object.values(featureRoutes).map(([, page]) => page),
  Shortcuts: ["Keyboard shortcuts", "Assignment history"],
  "Appearance & controls": ["Toolbar popup", "Command palette"],
  "Site access": [],
  "Sync & backup": ["Interface backup", "Shortcut backup"],
} as const;
export const defaultOptionsPage = featureRoutes.Tabs[1];

export function optionsHash(page: string, control = "") {
  return "#" + encodeURIComponent(page + (control ? "|" + control : ""));
}

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
    page: "Command palette",
    control: "placement",
  },
  {
    label: "Palette search mode",
    page: "Command palette",
    control: "searchMode",
  },
  {
    label: "Show disabled features in search",
    page: "Command palette",
    control: "includeDisabled",
  },
  {
    label: "Command palette action visibility and ordering",
    page: "Command palette",
    control: "action-order",
  },
  {
    label: "Choose and reorder toolbar popup items",
    page: "Toolbar popup",
    control: "popup-items",
  },
  {
    label: "Keyboard shortcuts",
    page: "Keyboard shortcuts",
    control: "shortcut-settings",
  },
  {
    label: "Shortcut assignment history and recovery",
    page: "Assignment history",
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
    page: "Tab switching",
    control: "mod-settings",
  },
  {
    label: "Site permissions and access",
    page: "Site access",
    control: "site-settings",
  },
  {
    label: "Sync, import and export",
    page: "Interface backup",
    control: "backup-settings",
  },
  {
    label: "Shortcut backup and recovery",
    page: "Shortcut backup",
    control: "shortcut-backup",
  },
];

export function optionsRoute(hash: string) {
  let target = "";
  let control = "";
  try {
    [target = "", control = ""] = decodeURIComponent(hash.slice(1)).split("|");
  } catch {
    return { page: defaultOptionsPage, control };
  }
  if (target === "Mods")
    target = control.startsWith("screenshot") ? "Screenshots" : "Features";
  if (target === "Appearance & navigation") target = "Appearance & controls";
  if (target === "Appearance & controls" && control === "layout")
    control = "action-order";
  if (target === "Appearance & controls")
    target = control === "popup-items" ? "Toolbar popup" : "Command palette";
  if (target === "Shortcuts")
    target =
      control === "shortcut-history"
        ? "Assignment history"
        : "Keyboard shortcuts";
  if (target === "Sync & backup") target = "Interface backup";
  if (target === "Features") target = defaultOptionsPage;
  const valid = Object.entries(optionsSections).some(
    ([section, children]) =>
      (section === target && !children.length) ||
      children.some((page) => page === target),
  );
  return {
    page: valid ? target : defaultOptionsPage,
    control: valid ? control : "",
  };
}
