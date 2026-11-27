import type { Portal } from "../domain/portal";

// Chrome serializes this function into an isolated world.
export function selectMicrosoftAccount(expectedUrl: string, email: string) {
  if (location.href !== expectedUrl) return;
  const loginForm = () =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "#loginHeader, h1, [role=heading]",
      ),
    ].some(
      (heading) =>
        heading.getClientRects().length > 0 &&
        ["Sign in", "Enter password"].includes(heading.innerText.trim()),
    );
  if (loginForm()) return;
  const pick = () => {
    if (document.visibilityState !== "visible") return;
    const visible = (element: HTMLElement) =>
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility === "visible";
    if (
      ![
        ...document.querySelectorAll<HTMLElement>(
          "h1, h2, [role=heading], #loginHeader",
        ),
      ].some(
        (node) => visible(node) && node.innerText.trim() === "Pick an account",
      )
    )
      return;
    const buttons = [
      ...document.querySelectorAll<HTMLElement>(
        'button, [role="button"], a[href]',
      ),
    ].filter(
      (button) =>
        visible(button) &&
        !button.matches('[disabled], [aria-disabled="true"]') &&
        ([button, ...button.querySelectorAll<HTMLElement>("span, div")].some(
          (element) => element.innerText.trim().toLowerCase() === email,
        ) ||
          button.getAttribute("aria-label")?.trim().toLowerCase() === email),
    );
    if (
      buttons.length !== 1 ||
      !buttons[0] ||
      buttons[0].dataset.browserModsSelected !== undefined
    )
      return;
    buttons[0].dataset.browserModsSelected = "";
    buttons[0].click();
    return true;
  };
  if (pick()) return;
  return new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (pick() || loginForm()) finish();
    });
    const timer = setTimeout(finish, 5000);
    function finish() {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("pagehide", finish);
      resolve();
    }
    window.addEventListener("pagehide", finish, { once: true });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["hidden", "class", "style", "aria-label"],
    });
  });
}

export function acceptPolicy(expectedUrl: string) {
  if (
    location.href !== expectedUrl ||
    location.pathname !== "/my.policy" ||
    document.visibilityState !== "visible"
  )
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
  return true;
}

export function submitFilledF5(expectedUrl: string, action: "wait" | "submit") {
  if (
    location.href !== expectedUrl ||
    location.pathname !== "/my.policy" ||
    !/Secure Logon\s+for F5 Networks/i.test(document.body.innerText)
  )
    return false;
  const visible = (element: HTMLElement) =>
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility === "visible";
  const forms = [...document.forms].filter((form) => {
    const target = URL.parse(form.action);
    return (
      form.method === "post" &&
      target?.origin === location.origin &&
      target.pathname === location.pathname
    );
  });
  const candidates = forms.flatMap((form) => {
    const usernames = [
      ...form.querySelectorAll<HTMLInputElement>(
        'input[name="username" i], input[autocomplete="username"]',
      ),
    ].filter(
      (field) =>
        ["text", "email"].includes(field.type) &&
        visible(field) &&
        !field.disabled,
    );
    const passwords = [
      ...form.querySelectorAll<HTMLInputElement>('input[type="password"]'),
    ].filter((field) => visible(field) && !field.disabled);
    const buttons = [
      ...form.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
        'input[type="submit"], button[type="submit"], button:not([type])',
      ),
    ].filter(
      (button) =>
        visible(button) &&
        !button.disabled &&
        (button instanceof HTMLInputElement
          ? button.value
          : button.innerText
        ).trim() === "Logon" &&
        !button.hasAttribute("formaction") &&
        !button.hasAttribute("formmethod"),
    );
    const [username] = usernames;
    const [password] = passwords;
    const [button] = buttons;
    return usernames.length === 1 &&
      passwords.length === 1 &&
      buttons.length === 1 &&
      username &&
      password &&
      button
      ? [{ form, username, password, button }]
      : [];
  });
  const [candidate] = candidates;
  if (candidates.length !== 1 || !candidate) return false;
  const { form, username, password, button } = candidate;
  const filled = () =>
    Boolean(username.value && password.value) && !button.disabled;
  if (action === "submit") {
    if (!filled() || document.visibilityState !== "visible") return false;
    button.click();
    return true;
  }
  if (filled()) return true;
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(stop, 20_000);
    function finish(ready: boolean) {
      clearTimeout(timer);
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onInput);
      form.removeEventListener("submit", stop);
      window.removeEventListener("pagehide", stop);
      resolve(ready);
    }
    function stop() {
      finish(false);
    }
    function onInput(event: Event) {
      if (
        event.isTrusted &&
        (event.target === username || event.target === password)
      ) {
        stop();
        return;
      }
      if (filled()) finish(true);
    }
    form.addEventListener("input", onInput);
    form.addEventListener("change", onInput);
    form.addEventListener("submit", stop, { once: true });
    window.addEventListener("pagehide", stop, { once: true });
  });
}

// Chrome serializes this function into an isolated world. Keep it self-contained.
export async function inspectPortal(
  portal: Portal,
  expectedUrl: string,
  action: "inspect" | "download" | "restart",
) {
  if (location.href !== expectedUrl || location.origin !== portal.origin)
    return "unknown" as const;
  if (action !== "inspect" && document.visibilityState !== "visible")
    return "paused" as const;

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
  const selector = "a, button, [role=button], span.favorite[id]";
  const controls = new Set(document.querySelectorAll<HTMLElement>(selector));
  const matches = () =>
    Array.from(controls).filter((element) => {
      if (!element.isConnected) {
        controls.delete(element);
        return false;
      }

      if (!visible(element)) return false;
      if (element.matches("span.favorite[id]"))
        return (
          element
            .querySelector(".caption")
            ?.textContent.trim()
            .replace(/\s+/g, " ") === portal.desktop
        );
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
        if (record.target instanceof Element) {
          const favorite =
            record.target.closest<HTMLElement>("span.favorite[id]");
          if (favorite) controls.add(favorite);
        }
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
