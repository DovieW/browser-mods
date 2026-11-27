import { TabSettingsPanel } from "../../tabs/public-options";
import { PopupItems } from "./popup-items";
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
  optionsHash,
  optionsSections,
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
  const sectionFor = (target: string) =>
    Object.entries(optionsSections).find(([, leaves]) =>
      leaves.some((leaf) => leaf === target),
    )?.[0];
  const activeSection = sectionFor(page);
  const [expanded, setExpanded] = useState<string[]>(() =>
    activeSection ? [activeSection] : [],
  );
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
      const group = sectionFor(next.page);
      if (group)
        setExpanded((previous) =>
          previous.includes(group) ? previous : [...previous, group],
        );
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
    if (page !== featureRoutes.RDP[1]) {
      setRdpTab(undefined);
      return;
    }
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
  function navigate(target: string, id = "") {
    setQuery("");
    location.hash = optionsHash(target, id);
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
  function toggleVisibility(id: string) {
    const key = "hidden";
    void save(
      key,
      prefs[key].includes(id)
        ? prefs[key].filter((x) => x !== id)
        : [...prefs[key], id],
    );
  }
  function reorder(id: string, delta: number) {
    const ids = [...enabled].sort(byOrder).map((a) => a.id);
    const index = ids.indexOf(id),
      next = index + delta;
    if (index < 0 || next < 0 || next >= ids.length) return;
    ids.splice(index, 1);
    ids.splice(next, 0, id);
    void save("order", ids);
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
          {Object.entries(optionsSections).map(([section, children], index) => {
            if (!children.length)
              return (
                <a
                  key={section}
                  href={optionsHash(section)}
                  aria-current={page === section ? "page" : undefined}
                  onClick={() => {
                    setQuery("");
                  }}
                >
                  {section}
                </a>
              );
            const open = expanded.includes(section);
            const id = `settings-group-${index}`;
            return (
              <div key={section} className="settings-nav-group">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={id}
                  onClick={() => {
                    setExpanded((previous) =>
                      open
                        ? previous.filter((name) => name !== section)
                        : [...previous, section],
                    );
                  }}
                >
                  <span aria-hidden="true" className="settings-chevron">
                    {open ? "▾" : "▸"}
                  </span>
                  {section}
                </button>
                <ul id={id} hidden={!open}>
                  {children.map((child) => (
                    <li key={child}>
                      <a
                        href={optionsHash(child)}
                        aria-current={page === child ? "page" : undefined}
                        onClick={() => {
                          setQuery("");
                        }}
                      >
                        {child}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
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
              <h2
                id={
                  {
                    "Keyboard shortcuts": "shortcut-settings",
                    "Assignment history": "shortcut-history",
                    "Tab switching": "mod-settings",
                    "Site access": "site-settings",
                    "Interface backup": "backup-settings",
                    "Shortcut backup": "shortcut-backup",
                  }[page]
                }
                tabIndex={-1}
              >
                {page}
              </h2>
              {page === "Toolbar popup" && (
                <PopupItems
                  actions={allActions}
                  items={prefs.popupItems}
                  save={(items) => save("popupItems", items)}
                />
              )}
              {page === "Command palette" && (
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
                  {enabled.sort(byOrder).map((r) => (
                    <div className="custom-row" key={r.id}>
                      <span>{r.label}</span>
                      <button
                        aria-pressed={prefs.hidden.includes(r.id)}
                        onClick={() => {
                          toggleVisibility(r.id);
                        }}
                      >
                        Hide
                      </button>
                      <button
                        aria-label={`Move ${r.label} up`}
                        onClick={() => {
                          reorder(r.id, -1);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move ${r.label} down`}
                        onClick={() => {
                          reorder(r.id, 1);
                        }}
                      >
                        ↓
                      </button>
                    </div>
                  ))}
                </>
              )}
              {page === "Keyboard shortcuts" && (
                <>
                  <div className="settings-actions">
                    <button
                      onClick={() => {
                        void port.editKeys().catch(fail);
                      }}
                    >
                      Edit in Chrome
                    </button>
                  </div>
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
              {page === "Assignment history" && (
                <iframe
                  className="settings-frame"
                  title="Shortcut setup and history"
                  src="history.html?view=options"
                />
              )}
              {page === "Shortcut backup" && (
                <iframe
                  className="settings-frame"
                  title="Shortcut backup and recovery"
                  src="legacy.html?view=shortcut-backup"
                />
              )}
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
                      <a href={optionsHash("Site access")}>Manage access</a>
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
              {page === "Tab switching" && <TabSettingsPanel />}
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
              {page === "Interface backup" && (
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
