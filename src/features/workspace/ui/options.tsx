import { Input } from "./input";
import { RdpCard } from "../../rdp-download/public-ui";
import { ScreenshotLabelSettings } from "../../clipboard/public-ui";
export type OptionsProps = {
  port: WorkspacePort;
  prefs: Preferences;
  save: <K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) => Promise<void>;
  fail: (e: unknown) => void;
  notice: string;
  setNotice: (s: string) => void;
  actions: Result[];
};
import { useEffect, useState } from "react";
import { parsePreferences, type Preferences } from "../domain/preferences";
import type { WorkspacePort } from "../adapters/browser";
import {
  featureRoutes,
  optionsRoute,
  pages,
  settings,
  workflow,
  workflows,
  type Result,
} from "./model";
export function Options({
  port,
  prefs,
  save,
  fail,
  notice,
  setNotice,
  actions: allActions,
}: OptionsProps) {
  const [route, setRoute] = useState(() => optionsRoute(location.hash));
  const { page, control } = route;
  const [shortcutQuery, setShortcutQuery] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [rdpTab, setRdpTab] = useState<{ id: number; url: string }>();
  const [query, setQuery] = useState("");
  const [origins, setOrigins] = useState<string[]>([]);
  const [splitAccess, setSplitAccess] = useState(false);
  const enabled = allActions.filter(
    (r) => r.id !== "open-palette" && !prefs.disabled.includes(r.group),
  );
  const byOrder = (a: Result, b: Result) => {
    const rank = (id: string) => {
      const i = prefs.order.indexOf(id);
      return i < 0 ? 10000 : i;
    };
    return rank(a.id) - rank(b.id) || a.label.localeCompare(b.label);
  };
  useEffect(() => {
    const readRoute = () => {
      const next = optionsRoute(location.hash);
      setRoute(next);
      setShowHistory(next.control === "shortcut-history");
      setQuery("");
      setNotice("");
    };
    window.addEventListener("hashchange", readRoute);
    readRoute();
    return () => {
      window.removeEventListener("hashchange", readRoute);
    };
  }, [setNotice]);
  useEffect(() => {
    if (!control || query) return;
    const element = document.getElementById(control);
    element?.focus();
    element?.scrollIntoView({ block: "nearest" });
  }, [page, control, query]);
  useEffect(() => {
    if (page !== featureRoutes.RDP[1]) return;
    const id = Number(new URLSearchParams(location.search).get("sourceTab"));
    if (!Number.isSafeInteger(id) || id <= 0) return;
    let active = true;
    void port
      .sourceTab(id)
      .then((tab) => {
        if (active) setRdpTab(tab);
      })
      .catch(fail);
    return () => {
      active = false;
    };
  }, [page, port]);
  function routeLink(target: string, id = "") {
    return "#" + encodeURIComponent(target + (id ? "|" + id : ""));
  }
  function navigate(target: string, id = "") {
    setQuery("");
    location.hash = routeLink(target, id);
  }
  useEffect(() => {
    if (page === "Site access")
      void port
        .permissions()
        .then((p) => {
          setOrigins(p.origins ?? []);
        })
        .catch(fail);
  }, [page, port]);
  useEffect(() => {
    if (page !== "Screenshots") return;
    let active = true;
    void port
      .hasSplitScreenshotAccess()
      .then((granted) => {
        if (active) setSplitAccess(granted);
      })
      .catch(fail);
    return () => {
      active = false;
    };
  }, [page, port]);
  function toggle(key: "pins" | "hidden", id: string) {
    void save(
      key,
      prefs[key].includes(id)
        ? prefs[key].filter((x) => x !== id)
        : [...prefs[key], id],
    );
  }
  function reorder(key: "order" | "pins", id: string, delta: number) {
    const ids =
      key === "order"
        ? [...enabled].sort(byOrder).map((a) => a.id)
        : [...prefs[key]];
    const index = ids.indexOf(id),
      next = index + delta;
    if (index < 0 || next < 0 || next >= ids.length) return;
    ids.splice(index, 1);
    ids.splice(next, 0, id);
    void save(key, ids);
  }
  const select = (
    label: string,
    key: "placement" | "searchMode",
    choices: readonly (readonly [string, string])[],
  ) => (
    <label className="field">
      {label}
      <select
        aria-label={label}
        id={key}
        value={prefs[key]}
        onChange={(e) => {
          const p = parsePreferences({ [key]: e.target.value });
          void save(key, p[key]);
        }}
      >
        {choices.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  const feature = Object.entries(featureRoutes).find(
    ([, [, name]]) => name === page,
  );
  return (
    <>
      <div className="settings-layout">
        <nav aria-label="Options sections" className="navigation">
          {pages.map((p) => (
            <a
              key={p}
              href={routeLink(p)}
              aria-current={
                page === p || (p === "Features" && feature) ? "page" : undefined
              }
            >
              {p}
            </a>
          ))}
        </nav>
        <main>
          <label className="field">
            Search settings
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="Search features, shortcuts, permissions…"
            />
          </label>
          {query.trim() ? (
            <section aria-label="Settings results">
              {settings
                .filter((entry) =>
                  `${entry.label} ${entry.page}`
                    .toLowerCase()
                    .includes(query.trim().toLowerCase()),
                )
                .map((entry) => (
                  <button
                    className="feature-link"
                    key={entry.control}
                    onClick={() => {
                      navigate(entry.page, entry.control);
                    }}
                  >
                    {entry.label}
                    <small>{entry.page}</small>
                  </button>
                ))}
              {!settings.some((entry) =>
                `${entry.label} ${entry.page}`
                  .toLowerCase()
                  .includes(query.trim().toLowerCase()),
              ) && <p className="muted">No matching settings.</p>}
            </section>
          ) : (
            <>
              {feature && (
                <a className="breadcrumb" href={routeLink("Features")}>
                  Features
                </a>
              )}
              <h2
                id={
                  page === "Shortcuts"
                    ? "shortcut-settings"
                    : page === "Features"
                      ? "mod-settings"
                      : page === "Site access"
                        ? "site-settings"
                        : page === "Sync & backup"
                          ? "backup-settings"
                          : undefined
                }
                tabIndex={-1}
              >
                {page}
              </h2>
              {page === "Appearance & controls" && (
                <>
                  {select("Command palette location", "placement", [
                    ["toolbar", "Toolbar popup"],
                    ["centered", "Centered page launcher"],
                  ])}
                  {select("Palette search", "searchMode", [
                    ["scoped", "Actions + scoped searches"],
                    ["everything", "Everything"],
                    ["commands", "Commands only"],
                  ])}
                  <label className="check">
                    <input
                      type="checkbox"
                      id="includeDisabled"
                      checked={prefs.includeDisabled}
                      onChange={(e) => {
                        void save("includeDisabled", e.target.checked);
                      }}
                    />
                    Include disabled features in search
                  </label>
                  <h3 id="action-order" tabIndex={-1}>
                    Actions
                  </h3>
                  <p className="muted">
                    Pin favorites, hide controls, and arrange your command list.
                  </p>
                  {enabled.sort(byOrder).map((r) => (
                    <div className="custom-row" key={r.id}>
                      <span>{r.label}</span>
                      <button
                        aria-pressed={prefs.pins.includes(r.id)}
                        onClick={() => {
                          toggle("pins", r.id);
                        }}
                      >
                        Pin
                      </button>
                      <button
                        aria-pressed={prefs.hidden.includes(r.id)}
                        onClick={() => {
                          toggle("hidden", r.id);
                        }}
                      >
                        Hide
                      </button>
                      <button
                        aria-label={`Move ${r.label} up`}
                        onClick={() => {
                          reorder("order", r.id, -1);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move ${r.label} down`}
                        onClick={() => {
                          reorder("order", r.id, 1);
                        }}
                      >
                        ↓
                      </button>
                    </div>
                  ))}
                  <h3>Favorites order</h3>
                  {prefs.pins.map((id) => (
                    <div className="custom-row" key={id}>
                      <span>
                        {allActions.find((r) => r.id === id)?.label ?? id}
                      </span>
                      <button
                        aria-label={`Move favorite ${id} up`}
                        onClick={() => {
                          reorder("pins", id, -1);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move favorite ${id} down`}
                        onClick={() => {
                          reorder("pins", id, 1);
                        }}
                      >
                        ↓
                      </button>
                    </div>
                  ))}
                </>
              )}
              {page === "Shortcuts" && (
                <>
                  <div className="settings-actions">
                    <button
                      onClick={() => {
                        void port.editKeys().catch(fail);
                      }}
                    >
                      Edit in Chrome
                    </button>
                    <button
                      id="shortcut-history"
                      aria-expanded={showHistory}
                      onClick={() => {
                        setShowHistory(!showHistory);
                      }}
                    >
                      Assignment history & recovery
                    </button>
                  </div>
                  {showHistory && (
                    <iframe
                      className="settings-frame"
                      title="Shortcut setup and history"
                      src="history.html"
                    />
                  )}
                  <label className="field">
                    Search shortcuts
                    <Input
                      type="search"
                      value={shortcutQuery}
                      onChange={(event) => {
                        setShortcutQuery(event.target.value);
                      }}
                    />
                  </label>
                  {[...workflows, "Shortcuts"].map((name) => {
                    const matches = allActions.filter(
                      (action) =>
                        (action.id === "open-palette"
                          ? "Shortcuts"
                          : workflow(action)) === name &&
                        `${action.label} ${action.description ?? ""} ${action.key ?? ""}`
                          .toLowerCase()
                          .includes(shortcutQuery.trim().toLowerCase()),
                    );
                    if (!matches.length) return null;
                    return (
                      <section key={name}>
                        <h3>{name}</h3>
                        {matches.map((action) => (
                          <div className="custom-row" key={action.id}>
                            <span>{action.label}</span>
                            {action.key ? (
                              <kbd>{action.key}</kbd>
                            ) : (
                              <small>Unassigned</small>
                            )}
                          </div>
                        ))}
                      </section>
                    );
                  })}
                </>
              )}
              {page === "Features" &&
                workflows.map((name) => {
                  const entries = Object.values(featureRoutes).filter(
                    ([group]) => group === name,
                  );
                  if (!entries.length) return null;
                  return (
                    <section key={name} className="feature-group">
                      <h3>{name}</h3>
                      {entries.map(([, label]) => (
                        <a
                          key={label}
                          className="feature-link"
                          href={routeLink(label)}
                        >
                          {label}
                          <span aria-hidden="true">›</span>
                        </a>
                      ))}
                    </section>
                  );
                })}
              {feature && feature[0] !== "RDP" && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!prefs.disabled.includes(feature[0])}
                    onChange={(event) => {
                      const key = feature[0];
                      void save(
                        "disabled",
                        event.target.checked
                          ? prefs.disabled.filter((value) => value !== key)
                          : [...prefs.disabled, key],
                      );
                    }}
                  />
                  Enable {feature[1][0]}
                </label>
              )}
              {page === "Screenshots" && (
                <>
                  <ScreenshotLabelSettings
                    style={prefs}
                    save={(key, value) =>
                      save(key, value as Preferences[typeof key])
                    }
                  />
                  {splitAccess ? (
                    <p id="split-screenshots" tabIndex={-1}>
                      Split screenshot access enabled.{" "}
                      <a href={routeLink("Site access")}>Manage access</a>
                    </p>
                  ) : (
                    <button
                      id="split-screenshots"
                      onClick={() => {
                        void port
                          .allowSplitScreenshots()
                          .then((granted) => {
                            if (granted) setSplitAccess(true);
                            else
                              fail(
                                Error("Split screenshot access was declined."),
                              );
                          })
                          .catch(fail);
                      }}
                    >
                      Allow split screenshots
                    </button>
                  )}
                </>
              )}
              {page === "Tab switching" && (
                <button
                  id="tab-switching"
                  onClick={() => {
                    void port.open(port.url("legacy.html")).catch(fail);
                  }}
                >
                  Tab-switching behavior
                </button>
              )}
              {page === "RDP download helper" && (
                <div id="rdp-settings" tabIndex={-1}>
                  <RdpCard url={rdpTab?.url ?? ""} tabId={rdpTab?.id} />
                </div>
              )}
              {page === "Site access" && (
                <>
                  <p>
                    Access is requested when a tool needs it. Removing access
                    can prevent that tool from running.
                  </p>
                  {origins.length ? (
                    origins.map((o) => (
                      <div className="custom-row" key={o}>
                        <span>{o}</span>
                        <button
                          onClick={() => {
                            void port
                              .revoke([o])
                              .then(() => {
                                setOrigins(origins.filter((x) => x !== o));
                              })
                              .catch(fail);
                          }}
                        >
                          Revoke
                        </button>
                      </div>
                    ))
                  ) : (
                    <p>No optional site access granted.</p>
                  )}
                </>
              )}
              {page === "Sync & backup" && (
                <>
                  <p>
                    Interface preferences sync through Chrome. Changes to
                    separate controls merge independently; concurrent edits to
                    the same control use Chrome’s resolved value. Running jobs,
                    grants, and browser shortcut assignments stay on this
                    device.
                  </p>
                  <button
                    onClick={() => {
                      const blob = new Blob(
                        [
                          JSON.stringify(
                            { version: 1, preferences: prefs },
                            null,
                            2,
                          ),
                        ],
                        { type: "application/json" },
                      );
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "browser-mods-settings-v1.json";
                      a.click();
                      setTimeout(() => {
                        URL.revokeObjectURL(url);
                      }, 1000);
                    }}
                  >
                    Export interface settings
                  </button>
                  <label className="field">
                    Import interface settings
                    <input
                      type="file"
                      accept="application/json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 65536) {
                          fail(Error("Settings file is too large."));
                          return;
                        }
                        void file
                          .text()
                          .then(async (text) => {
                            const data: unknown = JSON.parse(text);
                            if (
                              !data ||
                              typeof data !== "object" ||
                              !("version" in data) ||
                              data.version !== 1 ||
                              !("preferences" in data) ||
                              !data.preferences ||
                              typeof data.preferences !== "object"
                            )
                              throw Error("Invalid settings backup.");
                            await port.importPreferences(data.preferences);
                            setNotice("Imported settings.");
                          })
                          .catch(fail);
                      }}
                    />
                  </label>
                  <button
                    onClick={() => {
                      void port.open(port.url("legacy.html")).catch(fail);
                    }}
                  >
                    Shortcut backup & recovery
                  </button>
                  <button
                    onClick={() => {
                      void port
                        .restorePreferences()
                        .then(() => {
                          setNotice(
                            "Restored settings from before the last import.",
                          );
                        })
                        .catch(fail);
                    }}
                  >
                    Undo last settings import
                  </button>
                </>
              )}
            </>
          )}
          <p role="status" className="muted">
            {notice}
          </p>
        </main>
      </div>
    </>
  );
}
