import { useEffect, useState } from "react";
import {
  configurePortal,
  enableRdp,
  loadRdpPreferences,
  readRdpRun,
  setAutoSubmitF5,
  setNativeAutofill,
  setPolicyAcceptance,
} from "../adapters/storage";
import { hasDesktopAccess, requestDesktopAccess } from "../adapters/native";
import {
  isMicrosoftSignIn,
  makePortal,
  portalAddress,
  type Preferences,
  type Run,
} from "../domain/portal";

const microsoftStatusText = {
  "looking-for-form": "Waiting for a recognized Microsoft sign-in form.",
  "waiting-for-focus": "Return to the Microsoft sign-in tab to continue.",
  "sending-shortcut": "Sending Ctrl+Shift+P to Bitwarden.",
  "helper-failed": "The desktop helper could not send Ctrl+Shift+P.",
  "waiting-for-fill": "Shortcut sent. Waiting for Bitwarden to fill the form.",
  "no-fill": "Browser Mods did not see Bitwarden fill the Microsoft form.",
  submitting:
    "Submitting the filled Microsoft form. Complete verification when prompted.",
} satisfies Record<NonNullable<Run["microsoftStatus"]>, string>;

export function RdpCard({
  url,
  tabId,
}: {
  url: string;
  tabId: number | undefined;
}) {
  const [prefs, setPrefs] = useState<Preferences>();
  const [run, setRun] = useState<Run>();
  const [label, setLabel] = useState("");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [desktopAccess, setDesktopAccess] = useState<boolean>();
  useEffect(() => {
    let active = true;
    void hasDesktopAccess()
      .then((allowed) => {
        if (active) setDesktopAccess(allowed);
      })
      .catch(() => {});
    void loadRdpPreferences()
      .then((value) => {
        if (active) {
          setPrefs(value);
          setLabel(value.portal?.desktop ?? "");
          setAccount(value.portal?.account ?? "");
        }
      })
      .catch(() => {
        if (active) setError("Could not read RDP settings.");
      });
    if (tabId !== undefined)
      void readRdpRun(tabId)
        .then((value) => {
          if (active) setRun(value);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [tabId]);

  async function save(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setPrefs(await loadRdpPreferences());
      setDesktopAccess(await hasDesktopAccess());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the helper.");
    } finally {
      setBusy(false);
    }
  }

  const portal = makePortal(url, label, account);
  const canConfigure = makePortal(url, "placeholder") !== null;
  const address = portalAddress(url);
  const policyOrigin =
    address?.pathname === "/my.policy" ? address.origin : prefs?.policyOrigin;
  const microsoft =
    run?.phase === "waiting" && address && isMicrosoftSignIn(address);
  return (
    <section className="card">
      <label>
        <input
          type="checkbox"
          checked={prefs?.enabled ?? true}
          disabled={!prefs || busy}
          onChange={(event) => {
            const enabled = event.target.checked;
            void save(() => enableRdp(enabled));
          }}
        />
        RDP download helper
      </label>
      {prefs?.enabled && policyOrigin && (
        <label>
          <input
            type="checkbox"
            checked={prefs.policyOrigin === policyOrigin}
            disabled={busy}
            onChange={(event) => {
              const enabled = event.target.checked;
              void save(() => setPolicyAcceptance(policyOrigin, enabled));
            }}
          />
          Automatically accept the F5 monitoring notice
        </label>
      )}
      {prefs?.enabled &&
        prefs.policyOrigin &&
        prefs.policyOrigin === prefs.portal?.origin && (
          <label className="check">
            <input
              type="checkbox"
              checked={prefs.autoSubmitF5 === true}
              disabled={busy}
              onChange={(event) => {
                const enabled = event.target.checked;
                void save(() => setAutoSubmitF5(enabled));
              }}
            />
            Submit the filled F5 login form
          </label>
        )}
      {prefs?.enabled && microsoft && (
        <p role="status">
          {prefs.nativeAutofill && run.microsoftStatus
            ? microsoftStatusText[run.microsoftStatus]
            : "Press Ctrl+Shift+P to fill the Microsoft form with Bitwarden. Complete verification to continue."}
        </p>
      )}
      {prefs?.enabled && prefs.portal?.account && (
        <label className="check">
          <input
            type="checkbox"
            checked={prefs.nativeAutofill === true}
            disabled={busy}
            onChange={(event) => {
              const enabled = event.target.checked;
              void save(() => setNativeAutofill(enabled));
            }}
          />
          Use the desktop helper for Bitwarden autofill
        </label>
      )}
      {prefs?.enabled && prefs.portal && desktopAccess === false && (
        <button disabled={busy} onClick={() => void save(requestDesktopAccess)}>
          Allow desktop session checks
        </button>
      )}
      {prefs?.enabled && canConfigure && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (portal) void save(() => configurePortal(portal));
          }}
        >
          <label>
            Desktop link text
            <input
              type="text"
              value={label}
              placeholder={prefs.portal?.desktop}
              maxLength={160}
              onChange={(event) => {
                setLabel(event.target.value);
              }}
            />
          </label>
          <label>
            Microsoft work email (optional)
            <input
              type="email"
              value={account}
              maxLength={254}
              onChange={(event) => {
                setAccount(event.target.value);
              }}
            />
          </label>
          <button disabled={!portal || busy}>Save this portal</button>
        </form>
      )}
      {prefs?.enabled && run?.phase === "downloaded" && (
        <p role="status">RDP file downloaded.</p>
      )}
      {prefs?.enabled && run?.phase === "connected" && (
        <p role="status">Remote Desktop is already connected.</p>
      )}
      {prefs?.enabled && run?.phase === "requested" && (
        <p role="status">
          {Date.now() - (run.started ?? 0) > 60_000
            ? "RDP download could not be confirmed."
            : "Checking the RDP download…"}
        </p>
      )}
      {prefs?.enabled && run?.phase === "stopped" && (
        <p role="status">
          RDP helper stopped. Check the portal or start a fresh visit.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
