export const preferenceKey = "mods.rdp.preferences";
export const runPrefix = "mods.rdp.run.";

export type Portal = { origin: string; path: string; desktop: string };
export type Run = {
  phase: "waiting" | "requested" | "downloaded" | "stopped";
  restarted: boolean;
  started?: number;
};
export type Preferences = { enabled: boolean; portal?: Portal };

export function portalAddress(url: string) {
  const address = URL.parse(url);
  return address?.protocol === "https:" &&
    !address.username &&
    !address.password
    ? address
    : null;
}

export function makePortal(url: string, label: string): Portal | null {
  const address = portalAddress(url);
  const desktop = label.trim().replace(/\s+/g, " ");
  if (
    !address ||
    address.pathname !== "/vdesk/webtop.eui" ||
    !desktop ||
    desktop.length > 160
  ) {
    return null;
  }
  return { origin: address.origin, path: address.pathname, desktop };
}

export function readPreferences(value: unknown): Preferences {
  if (typeof value !== "object" || value === null) return { enabled: true };
  const raw = value as Partial<Preferences>;
  const enabled = raw.enabled !== false;
  const portal = raw.portal;
  if (
    !portal ||
    typeof portal.origin !== "string" ||
    typeof portal.path !== "string" ||
    typeof portal.desktop !== "string"
  ) {
    return { enabled };
  }
  const parsed = makePortal(portal.origin + portal.path, portal.desktop);
  return parsed?.origin === portal.origin && parsed.path === portal.path
    ? { enabled, portal: parsed }
    : { enabled };
}

export function isMicrosoftSignIn(url: URL) {
  return [
    "login.microsoftonline.com",
    "login.microsoft.com",
    "login.windows.net",
  ].includes(url.hostname);
}

export function isExpectedDownload(
  item: {
    filename: string;
    url: string;
    finalUrl: string;
    referrer: string;
    startTime: string;
  },
  portal: Portal,
  started: number,
) {
  const startTime = Date.parse(item.startTime);
  const referrer = portalAddress(item.referrer);
  const request = portalAddress(item.url);
  const response = portalAddress(item.finalUrl || item.url);
  return (
    startTime >= started &&
    startTime <= started + 60_000 &&
    /\.rdp$/i.test(item.filename) &&
    request?.origin === portal.origin &&
    response?.origin === portal.origin &&
    referrer?.origin === portal.origin &&
    referrer.pathname === portal.path
  );
}
