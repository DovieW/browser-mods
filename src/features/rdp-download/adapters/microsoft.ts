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
    const heading = [
      ...document.querySelectorAll<HTMLElement>(
        "h1, h2, [role=heading], #loginHeader",
      ),
    ]
      .find(visible)
      ?.innerText.trim();
    const stage: MicrosoftStage | null =
      heading === "Sign in"
        ? "username"
        : heading === "Enter password"
          ? "password"
          : null;
    if (!stage || !stages.includes(stage)) return null;
    const field = document.querySelector<HTMLInputElement>(
      stage === "username"
        ? 'input#i0116[name="loginfmt"]'
        : 'input#i0118[type="password"][name="passwd"]',
    );
    const button = document.querySelector<HTMLInputElement | HTMLButtonElement>(
      "input#idSIButton9[type=submit], button#idSIButton9[type=submit]",
    );
    if (
      !field ||
      !button ||
      !visible(field) ||
      !visible(button) ||
      field.disabled ||
      button.disabled
    )
      return null;
    const label =
      button instanceof HTMLInputElement ? button.value : button.innerText;
    if (label.trim() !== (stage === "username" ? "Next" : "Sign in"))
      return null;
    if (
      stage === "username" &&
      field.value &&
      field.value.trim().toLowerCase() !== email
    )
      return null;
    return { field, button, stage };
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
