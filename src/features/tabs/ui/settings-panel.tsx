import { useEffect, useState } from "react";
import type { TabSettings } from "../../../contracts/browser";
import { tabSettingsClient } from "../adapters/settings";
import { TAB_SETTINGS_DEFAULTS, TAB_SETTINGS_PREFIX } from "../domain/settings";

const switches = {
  includeOtherWindows: "Include tabs from other windows",
  wrap: "Wrap around at the ends",
  rememberPreviews: "Remember tabs I pass through",
} as const;

export function TabSettingsPanel() {
  const [port] = useState(tabSettingsClient);
  const [settings, setSettings] = useState<TabSettings>();
  const [seconds, setSeconds] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    let revision = 0;
    const read = () => {
      const request = ++revision;
      void port
        .readTabSettings()
        .then((value) => {
          if (!mounted || request !== revision) return;
          setSettings(value);
        })
        .catch(() => {
          if (mounted && request === revision)
            setError("Could not load tab-switching settings.");
        });
    };
    port.watch((changes, area) => {
      if (
        area === "sync" &&
        Object.keys(changes).some((id) => id.startsWith(TAB_SETTINGS_PREFIX))
      )
        read();
    });
    read();
    return () => {
      mounted = false;
      port.dispose();
    };
  }, [port]);

  useEffect(() => {
    if (settings) setSeconds(String(settings.pauseMs / 1000));
  }, [settings?.pauseMs]);

  async function save(patch: Partial<TabSettings>) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await port.saveTabSettings(patch);
      const latest = await port.readTabSettings();
      setSettings(latest);
      setSeconds(String(latest.pauseMs / 1000));
    } catch {
      setError("Could not save tab-switching settings. Try again.");
    } finally {
      setPending(false);
    }
  }
  function commitPause(input: HTMLInputElement) {
    if (!input.checkValidity() || !Number.isFinite(input.valueAsNumber)) {
      input.reportValidity();
      return;
    }
    const pauseMs = Math.round(input.valueAsNumber * 1000);
    if (pauseMs !== settings?.pauseMs) void save({ pauseMs });
  }
  return (
    <section
      id="tab-switching"
      tabIndex={-1}
      aria-label="Tab-switching behavior"
    >
      {settings && (
        <>
          <fieldset className="inline-tab-settings" disabled={pending}>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.resetAfterPause}
                onChange={(event) =>
                  void save({ resetAfterPause: event.target.checked })
                }
              />
              Start a fresh switch after a pause
            </label>
            <label className="field">
              Pause before a fresh switch (seconds)
              <input
                type="number"
                min="0.25"
                max="10"
                step="0.05"
                required
                value={seconds}
                disabled={!settings.resetAfterPause}
                onInput={(event) => {
                  setSeconds(event.currentTarget.value);
                }}
                onChange={(event) => {
                  commitPause(event.currentTarget);
                }}
              />
            </label>
            <input
              type="range"
              min="0.25"
              max="10"
              step="0.05"
              aria-label="Pause in seconds"
              disabled={!settings.resetAfterPause}
              value={seconds || String(settings.pauseMs / 1000)}
              onInput={(event) => {
                setSeconds(event.currentTarget.value);
              }}
              onChange={(event) => {
                commitPause(event.currentTarget);
              }}
            />
            {Object.entries(switches).map(([key, label]) => (
              <label className="check" key={key}>
                <input
                  type="checkbox"
                  checked={settings[key as keyof typeof switches]}
                  onChange={(event) =>
                    void save({ [key]: event.target.checked })
                  }
                />
                {label}
              </label>
            ))}
            <button onClick={() => void save(TAB_SETTINGS_DEFAULTS)}>
              Restore defaults
            </button>
          </fieldset>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
