import { useEffect, useState } from "react";
import {
  configurePortal,
  enableRdp,
  loadRdpPreferences,
  readRdpRun,
  setPolicyAcceptance,
} from "../adapters/storage";
import {
  isMicrosoftSignIn,
  makePortal,
  portalAddress,
  type Preferences,
  type Run,
} from "../domain/portal";

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
  useEffect(() => {
    let active = true;
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
      {prefs?.enabled && microsoft && (
        <p>
          Press Ctrl+Shift+P on the Microsoft username and password screens to
          fill with Bitwarden. Complete verification to continue.
        </p>
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
