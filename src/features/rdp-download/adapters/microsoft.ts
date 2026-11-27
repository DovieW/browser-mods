export type MicrosoftStage = "username" | "password";

// Injected into the tracked Microsoft sign-in tab. The password never leaves the page.
export function microsoftForm(
  expectedUrl: string,
  email: string,
  stages: MicrosoftStage[],
  action: "detect" | "focus" | "wait" | "submit",
) {
  if (location.href !== expectedUrl) return null;
  const visible = (element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    return (
      element.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
      }) &&
      bounds.bottom > 0 &&
      bounds.right > 0 &&
      bounds.top < innerHeight &&
      bounds.left < innerWidth
    );
  };
  const find = () => {
    const headings = [
      ...document.querySelectorAll<HTMLElement>(
        "h1, h2, [role=heading], #loginHeader",
      ),
    ]
      .filter(visible)
      .map((element) => element.innerText.trim());
    const matches = stages.flatMap((stage) => {
      const username = stage === "username";
      if (!headings.includes(username ? "Sign in" : "Enter password"))
        return [];
      const fields = [
        ...document.querySelectorAll<HTMLInputElement>(
          username
            ? 'input#i0116[name="loginfmt"]'
            : 'input#i0118[type="password"][name="passwd"]',
        ),
      ].filter((field) => !field.disabled && visible(field));
      const buttons = [
        ...document.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
          "input#idSIButton9[type=submit], button#idSIButton9[type=submit]",
        ),
      ].filter((button) => {
        const label =
          button instanceof HTMLInputElement ? button.value : button.innerText;
        return (
          !button.disabled &&
          visible(button) &&
          label.trim() === (username ? "Next" : "Sign in")
        );
      });
      const [field] = fields;
      const [button] = buttons;
      if (fields.length !== 1 || buttons.length !== 1 || !field || !button)
        return [];
      if (username && field.value && field.value.trim().toLowerCase() !== email)
        return [];
      return [{ field, button, stage }];
    });
    return matches.length === 1 ? (matches[0] ?? null) : null;
  };
  const inspect = () => {
    const form = find();
    if (!form || !document.hasFocus()) return null;
    if ((action === "wait" || action === "submit") && !form.field.value)
      return null;
    if (action === "focus") {
      form.field.focus({ preventScroll: true });
      if (document.activeElement !== form.field) return null;
    }
    if (action === "submit") form.button.click();
    return form.stage;
  };

  const immediate = inspect();
  if (immediate || action === "submit" || action === "focus") return immediate;

  return new Promise<MicrosoftStage | null>((resolve) => {
    const observer = new MutationObserver(probe);
    const timer = setTimeout(stop, 8000);
    function finish(stage: MicrosoftStage | null) {
      clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("input", changed);
      document.removeEventListener("change", changed);
      window.removeEventListener("pagehide", stop);
      window.removeEventListener("focus", probe);
      window.removeEventListener("blur", onBlur);
      resolve(stage);
    }
    function stop() {
      finish(null);
    }
    function onBlur() {
      if (action === "wait") stop();
    }
    function probe() {
      const stage = inspect();
      if (stage) finish(stage);
    }
    function changed(event: Event) {
      if (event.isTrusted && event.target === find()?.field) {
        stop();
        return;
      }
      probe();
    }
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["disabled", "hidden", "style", "class"],
    });
    document.addEventListener("input", changed);
    document.addEventListener("change", changed);
    window.addEventListener("pagehide", stop, { once: true });
    window.addEventListener("focus", probe);
    window.addEventListener("blur", onBlur);
  });
}
