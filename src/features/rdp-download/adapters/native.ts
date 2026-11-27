export const nativeHost = "com.doview.browser_mods";
const permission: chrome.permissions.Permissions = {
  permissions: ["nativeMessaging"],
};

export const hasDesktopAccess = () => chrome.permissions.contains(permission);
export async function requestDesktopAccess() {
  if (!(await chrome.permissions.request(permission)))
    throw Error("Desktop helper access was declined.");
}

export async function remoteDesktopIsActive(): Promise<boolean | undefined> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!(await hasDesktopAccess())) return;
    const response: unknown = await Promise.race([
      chrome.runtime.sendNativeMessage(nativeHost, {
        action: "rdp-session-status",
      }),
      new Promise((resolve) => {
        timeout = setTimeout(resolve, 1_500);
      }),
    ]);
    if (
      response &&
      typeof response === "object" &&
      "ok" in response &&
      response.ok === true &&
      "active" in response &&
      typeof response.active === "boolean"
    )
      return response.active;
  } catch {
    // Older or uninstalled desktop helpers leave download behavior unchanged.
  } finally {
    clearTimeout(timeout);
  }
}
