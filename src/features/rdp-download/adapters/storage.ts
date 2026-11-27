import {
  preferenceKey,
  microsoftAccountOrigin,
  readPreferences,
  runPrefix,
  type Portal,
} from "../domain/portal";

export async function loadRdpPreferences() {
  return readPreferences(
    (await chrome.storage.local.get(preferenceKey))[preferenceKey],
  );
}

export async function configurePortal(portal: Portal) {
  if (
    !(await chrome.permissions.request({
      origins: [
        portal.origin + "/*",
        ...(portal.account ? [microsoftAccountOrigin + "/*"] : []),
      ],
      permissions: ["downloads"],
    }))
  )
    throw Error("Portal access was declined.");
  const current = await loadRdpPreferences();
  await chrome.storage.local.set({ [preferenceKey]: { ...current, portal } });
}

export async function enableRdp(enabled: boolean) {
  const current = await loadRdpPreferences();
  await chrome.storage.local.set({ [preferenceKey]: { ...current, enabled } });
}

export async function setPolicyAcceptance(origin: string, enabled: boolean) {
  if (
    enabled &&
    !(await chrome.permissions.request({ origins: [origin + "/*"] }))
  )
    throw Error("Portal access was declined.");
  const current = await loadRdpPreferences();
  await chrome.storage.local.set({
    [preferenceKey]: { ...current, policyOrigin: enabled ? origin : null },
  });
}

export async function readRdpRun(tabId: number) {
  const key = `${runPrefix}${tabId}`;
  return (await chrome.storage.session.get(key))[key] as
    import("../domain/portal").Run | undefined;
}
