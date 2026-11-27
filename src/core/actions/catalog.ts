export const commands = {
  "open-palette": {
    shortcutGroup: "MODS",
    description: "Open Browser Mods command palette",
  },
  "duplicate-tab": {
    shortcutGroup: "TABS",
    suggested_key: "Alt+Shift+D",
    description: "Duplicate tab(s)",
  },
  "discard-tabs": {
    shortcutGroup: "TABS",
    description: "Unload highlighted tab(s), keeping them open",
  },
  "pin-tab": {
    shortcutGroup: "TABS",
    suggested_key: "Alt+Shift+P",
    description: "Pin tab(s)",
  },
  "go-incognito": {
    shortcutGroup: "NAVIGATION",
    suggested_key: "Alt+Shift+N",
    description: "Open the current tab(s) in incognito",
  },
  "open-tab-near": {
    shortcutGroup: "TABS",
    description: "Open tab near current and in same group",
  },
  "add-tab-to-current-group": {
    shortcutGroup: "GROUPS",
    description: "Open tab at the end of the current group",
  },
  "open-tab-at-end": {
    shortcutGroup: "TABS",
    description: "Open tab at the end of all tabs",
  },
  "move-tabs-left": {
    shortcutGroup: "TABS",
    description: "Move highlighted tab(s) left",
  },
  "move-tabs-right": {
    shortcutGroup: "TABS",
    description: "Move highlighted tab(s) right",
  },
  "move-tabs-to-front": {
    shortcutGroup: "TABS",
    description: "Move highlighted tab(s) to the front",
  },
  "move-tabs-to-back": {
    shortcutGroup: "TABS",
    description: "Move highlighted tab(s) to the back",
  },
  "switch-windows": {
    shortcutGroup: "WINDOWS",
    description: "Switch between windows",
  },
  "toggle-collapse-groups": {
    shortcutGroup: "GROUPS",
    description: "Toggle collapse all tab groups",
  },
  "switch-to-last-tab": {
    shortcutGroup: "TABS",
    description: "Switch to the last active tab",
  },
  "walk-recent-tabs": {
    shortcutGroup: "TABS",
    description: "Walk backward through recently used tabs (up to 32)",
  },
  "walk-recent-tabs-forward": {
    shortcutGroup: "TABS",
    description:
      "Walk forward toward newer tabs in the same recent-tab history",
  },
  "copy-url": {
    shortcutGroup: "CLIPBOARD",
    description: "Copy highlighted tab URLs to clipboard (one per line)",
  },
  "copy-screenshot": {
    shortcutGroup: "CLIPBOARD",
    suggested_key: "Alt+Shift+S",
    description: "Copy a screenshot of the visible page with URL",
  },
  "copy-screenshot-plain": {
    shortcutGroup: "CLIPBOARD",
    description: "Copy a screenshot of the visible page without URL",
  },
  "move-tabs-to-window": {
    shortcutGroup: "WINDOWS",
    description: "Move highlighted tab(s) to different window (cycle)",
  },
  "move-all-groups": {
    shortcutGroup: "GROUPS",
    description: "Move all groups to front or back",
  },
  "go-home": {
    shortcutGroup: "NAVIGATION",
    description: "Navigate to the root/home of the current site",
  },
  "cycle-tab-groups": {
    shortcutGroup: "GROUPS",
    description: "Move highlighted tabs to the next group",
  },
  "pause-all-tabs": {
    shortcutGroup: "MEDIA",
    description: "Pause media in all normal browser tabs",
  },
} as const;

export type CommandId = keyof typeof commands;

// Chrome sorts by manifest command ID and uses it to remember assignments.
export function browserCommandId(
  id: string,
  group: (typeof commands)[CommandId]["shortcutGroup"],
): string {
  return `${group.toLowerCase()}-${id}`;
}

const internalIds = new Map(
  Object.entries(commands).map(([id, { shortcutGroup }]) => [
    browserCommandId(id, shortcutGroup),
    id,
  ]),
);

export function internalCommandId(browserId: string): string {
  return internalIds.get(browserId) ?? browserId;
}
