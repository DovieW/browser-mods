import type { Portal } from "../domain/portal";

export function acceptPolicy(expectedUrl: string) {
  if (location.href !== expectedUrl || location.pathname !== "/my.policy")
    return;
  const notice = document.body.innerText.replace(/\s+/g, " ");
  if (
    !/authorized users only/i.test(notice) ||
    !/activities (?:may be |are )?monitored/i.test(notice) ||
    !/consent to such monitoring/i.test(notice)
  )
    return;
  const controls = [
    ...document.querySelectorAll<HTMLAnchorElement>("a[href]"),
  ].filter(
    (control) =>
      control.getClientRects().length > 0 &&
      getComputedStyle(control).visibility === "visible" &&
      !control.matches('[aria-disabled="true"]') &&
      URL.parse(control.href)?.origin === location.origin,
  );
  const accept = controls.filter((control) =>
    /^I Accept$/i.test(control.innerText.trim()),
  );
  if (
    accept.length !== 1 ||
    !controls.some((control) =>
      /^I (?:Don['’]t|Do Not) Accept$/i.test(control.innerText.trim()),
    )
  )
    return;
  const control = accept[0];
  if (!control || control.dataset.browserModsAccepted !== undefined) return;
  control.dataset.browserModsAccepted = "";
  control.click();
}

// Chrome serializes this function into an isolated world. Keep it self-contained.
export async function inspectPortal(
  portal: Portal,
  expectedUrl: string,
  action: "inspect" | "download" | "restart",
) {
  if (location.href !== expectedUrl || location.origin !== portal.origin)
    return "unknown" as const;

  const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
  const visible = (element: HTMLElement) =>
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility === "visible" &&
    !element.matches('[disabled], [aria-disabled="true"]');

  const restartLink = () => {
    if (location.pathname !== "/vdesk/hangup.php3") return null;
    const text = document.body.innerText;
    if (!/your session is finished|logged out successfully/i.test(text))
      return null;
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("a[href]"),
    ).filter((link) => {
      const target = URL.parse(link.href);
      return (
        target?.origin === portal.origin &&
        ["/", "/my.policy"].includes(target.pathname) &&
        !target.search &&
        !target.hash &&
        visible(link) &&
        /^click here\.?$/i.test(normalize(link.innerText))
      );
    });
    return links.length === 1 ? links[0] : null;
  };

  if (
    action === "restart" ||
    (action === "inspect" && location.pathname === "/vdesk/hangup.php3")
  ) {
    const link = restartLink();
    if (!link) return "unknown" as const;
    if (action === "restart") link.click();
    return "signed-out" as const;
  }

  if (location.pathname !== portal.path) return "unknown" as const;
  const selector = "a, button, [role=button]";
  const controls = new Set(document.querySelectorAll<HTMLElement>(selector));
  const matches = () =>
    Array.from(controls).filter((element) => {
      if (!element.isConnected) {
        controls.delete(element);
        return false;
      }

      if (!visible(element)) return false;
      if (
        element instanceof HTMLAnchorElement &&
        element.hasAttribute("href")
      ) {
        const target = URL.parse(element.href);
        if (
          !target ||
          (target.origin !== portal.origin && target.protocol !== "javascript:")
        )
          return false;
      }
      const image = element.querySelector("img[alt]");
      const text = [
        element.innerText,
        element.getAttribute("aria-label"),
        image?.getAttribute("alt"),
      ];
      return text.some((value) => value && normalize(value) === portal.desktop);
    });

  if (action === "download") {
    const controls = matches();
    if (controls.length !== 1) return "unknown" as const;
    controls[0]?.click();
    return "ready" as const;
  }

  if (matches().length === 1) return "ready" as const;
  return new Promise<"ready" | "unknown">((resolve) => {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches(selector)) controls.add(node);
          for (const element of node.querySelectorAll<HTMLElement>(selector))
            controls.add(element);
        }
        if (
          record.target instanceof HTMLElement &&
          record.target.matches(selector)
        )
          controls.add(record.target);
      }
      if (matches().length === 1) finish("ready");
    });
    const timer = setTimeout(() => {
      finish("unknown");
    }, 10_000);
    function finish(result: "ready" | "unknown") {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("pagehide", onHide);
      resolve(result);
    }
    function onHide() {
      finish("unknown");
    }
    window.addEventListener("pagehide", onHide, { once: true });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "class",
        "role",
        "alt",
        "href",
        "hidden",
        "style",
        "aria-label",
        "disabled",
        "aria-disabled",
      ],
    });
  });
}

export function isFreshPortalVisit() {
  const navigation = performance.getEntriesByType("navigation")[0] as
    PerformanceNavigationTiming | undefined;
  return navigation?.type === "navigate" && document.referrer === "";
}
