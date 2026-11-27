import { Input } from "./input";
import type { ActionMenu } from "./action-menu";
import {
  PlaylistDurationCard,
  playlistTab,
} from "../../playlist-duration/public-ui";
import { shortCommandLabel } from "../../../ui/shortcut-labels";
import { commandErrorMessage } from "../../../core/actions/errors";
import type { OptionsProps } from "./options";
import type { ComponentType } from "react";
import {
  featureRoutes,
  pages,
  settings,
  workflow,
  workflows,
  type Result,
} from "./model";
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { commands } from "../../../core/actions/catalog";
import {
  actionSection,
  preferenceDefaults,
  type Preferences,
} from "../domain/preferences";
import { workspaceBrowser, type WorkspacePort } from "../adapters/browser";

const message = (e: unknown) =>
  e instanceof Error ? e.message : "Could not complete this action.";
function App({
  port,
  mode,
  initialPalette = false,
  Settings,
  RowMenu,
}: {
  port: WorkspacePort;
  mode: "popup" | "options" | "launcher";
  initialPalette?: boolean;
  Settings: ComponentType<OptionsProps> | undefined;
  RowMenu: typeof ActionMenu | undefined;
}) {
  const [prefs, setPrefs] = useState<Preferences>({ ...preferenceDefaults });
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [query, setQuery] = useState(""),
    [scope, setScope] = useState(""),
    [selected, setSelected] = useState(0);
  const [keys, setKeys] = useState<Record<string, string>>({}),
    [tabs, setTabs] = useState<Awaited<ReturnType<WorkspacePort["tabs"]>>>([]);
  const [bookmarks, setBookmarks] = useState<
    Awaited<ReturnType<WorkspacePort["bookmarks"]>>
  >([]);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<string>("Favorites");
  const [current, setCurrent] = useState<
    Awaited<ReturnType<WorkspacePort["currentTab"]>>
  >({
    id: undefined,
    url: "",
  });
  useEffect(() => {
    if (mode === "popup") void port.currentTab().then(setCurrent).catch(fail);
  }, [mode, port]);
  const playlist =
    mode === "popup" && !prefs.disabled.includes("Media")
      ? playlistTab(current.url)
      : null;
  const palette = mode === "launcher" || initialPalette;
  const browse = mode === "popup" && !palette;
  const input = useRef<HTMLInputElement>(null),
    connection = useRef<MessagePort | null>(null);
  const close = () => {
    if (mode === "launcher") connection.current?.postMessage("close");
    else window.close();
  };
  const fail = (e: unknown) => {
    setError(message(e));
  };
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void port
        .readPreferences()
        .then((p) => {
          if (alive) {
            setPrefs(p);
            setReady(true);
          }
        })
        .catch(fail);
    };
    refresh();
    const unwatch = port.watchPreferences(refresh);
    void port
      .commands()
      .then((c) => {
        setKeys(
          Object.fromEntries(c.map((x) => [x.name ?? "", x.shortcut ?? ""])),
        );
      })
      .catch(fail);
    void port
      .error()
      .then((e) => {
        if (e) setError(`${e.command}: ${commandErrorMessage(e.code)}`);
      })
      .catch(fail);
    const focus = () => {
      void port
        .commands()
        .then((c) => {
          setKeys(
            Object.fromEntries(c.map((x) => [x.name ?? "", x.shortcut ?? ""])),
          );
        })
        .catch(fail);
    };
    window.addEventListener("focus", focus);
    return () => {
      alive = false;
      unwatch();
      window.removeEventListener("focus", focus);
    };
  }, [port]);
  useEffect(() => {
    const listener = (e: MessageEvent<unknown>) => {
      if (
        e.source === window.parent &&
        e.data === "mods.launcher.connect" &&
        e.ports[0]
      ) {
        connection.current = e.ports[0];
        input.current?.focus();
      }
    };
    if (mode === "launcher") {
      window.addEventListener("message", listener);
      window.parent.postMessage("mods.launcher.ready", "*");
    }
    return () => {
      window.removeEventListener("message", listener);
      connection.current?.close();
    };
  }, [mode]);
  useEffect(() => {
    if (ready && palette) input.current?.focus();
  }, [ready, palette]);
  useEffect(() => {
    let alive = true;
    if ((prefs.searchMode === "everything" && query) || scope === "tabs")
      void port
        .tabs()
        .then((t) => {
          if (alive) setTabs(t);
        })
        .catch(fail);
    return () => {
      alive = false;
    };
  }, [port, prefs.searchMode, scope, Boolean(query)]);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      if ((prefs.searchMode === "everything" && query) || scope === "bookmarks")
        void port
          .bookmarks(query)
          .then((b) => {
            if (alive) setBookmarks(b);
          })
          .catch(fail);
    }, 120);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [port, prefs.searchMode, query, scope]);
  useEffect(() => {
    setSelected(0);
  }, [query, scope, section]);
  useEffect(() => {
    document
      .getElementById(`result-${selected}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  async function save<K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) {
    setError("");
    setNotice("Saving…");
    try {
      await port.savePreference(key, value);
      setPrefs((p) => ({ ...p, [key]: value }));
      setNotice("Saved locally. Chrome manages sync delivery.");
    } catch (e) {
      fail(e);
      setNotice("Not saved. Try again.");
    }
  }
  async function openOptions(target: string) {
    const source =
      target === featureRoutes.RDP[1] && current.id !== undefined
        ? `?sourceTab=${current.id}`
        : "";
    await port.open(
      port.url(`options.html${source}#${encodeURIComponent(target)}`),
    );
    close();
  }
  const allActions: Result[] = Object.entries(commands).map(([id, c]) => ({
    id,
    label: shortCommandLabel({ name: id, description: c.description }),
    description: c.description,
    group: actionSection(id),
    setting: featureRoutes[actionSection(id)][1],
    key: keys[id] ?? "",
    stay: ["pin-tab", "toggle-collapse-groups"].includes(id),
    run: () => port.run(id),
  }));
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
  let results: Result[] = enabled
    .filter((r) => !prefs.hidden.includes(r.id))
    .sort(byOrder);
  const finding = !!query || palette || !!scope;
  const categories = workflows.filter(
    (name) =>
      name === "Web tools" ||
      name === "Bookmarks & reading" ||
      results.some((action) => workflow(action) === name),
  );
  const activeSection =
    categories.includes(section as (typeof workflows)[number]) ||
    section === "All actions"
      ? section
      : "Favorites";
  if (finding) {
    if (scope === "tabs") results = [];
    if (scope === "bookmarks") results = [];
    if (!scope && prefs.searchMode !== "commands")
      results.push(
        ...settings.map((s) => ({
          id: `setting-${s.control}`,
          label: s.label,
          group: "Settings",
          run: () => openOptions(s.page + "|" + s.control),
        })),
        {
          id: "find-tabs",
          label: "Find tab",
          group: "Search",
          stay: true,
          run: () => {
            setScope("tabs");
            setQuery("");
            input.current?.focus();
            return Promise.resolve();
          },
        },
        {
          id: "find-bookmarks",
          label: "Find bookmark",
          group: "Search",
          stay: true,
          run: async () => {
            if (await port.requestBookmarks()) {
              setScope("bookmarks");
              setQuery("");
              input.current?.focus();
            } else throw Error("Bookmark access declined.");
          },
        },
      );
    if (
      scope === "tabs" ||
      (!scope && prefs.searchMode === "everything" && query)
    )
      results.push(
        ...tabs.map((t) => ({
          id: `tab-${t.id}`,
          label: t.title,
          group: "Tabs search",
          run: () => port.focus(t.id),
        })),
      );
    if (
      scope === "bookmarks" ||
      (!scope && prefs.searchMode === "everything" && query)
    )
      results.push(
        ...bookmarks.map((b) => ({
          id: `bookmark-${b.id}`,
          label: b.title,
          group: "Bookmarks",
          run: () => port.open(b.url),
        })),
      );
    if (prefs.includeDisabled && !scope && query)
      results.push(
        ...allActions
          .filter((r) => prefs.disabled.includes(r.group))
          .map((r) => ({
            ...r,
            label: `Enable ${r.group} to use: ${r.label}`,
            group: "Disabled",
            run: () => openOptions(r.setting ?? "Features"),
          })),
      );
  } else if (activeSection === "Favorites") {
    results = results
      .filter((r) => prefs.pins.includes(r.id))
      .sort((a, b) => prefs.pins.indexOf(a.id) - prefs.pins.indexOf(b.id));
  } else if (activeSection !== "All actions") {
    results = results.filter((r) => workflow(r) === activeSection);
    if (activeSection === "Bookmarks & reading")
      results.push({
        id: "find-bookmarks",
        label: "Find bookmark",
        group: "Bookmarks & reading",
        stay: true,
        run: async () => {
          if (!(await port.requestBookmarks()))
            throw Error("Bookmark access declined.");
          setScope("bookmarks");
          input.current?.focus();
        },
      });
  }
  const aliases: Record<string, string> = {
    "copy-screenshot": "screenshot capture image clipboard with url",
    "copy-screenshot-plain": "screenshot capture image clipboard plain no url",
    "copy-url": "link address clipboard",
    "pause-all-tabs": "audio video sound media",
  };
  const terms = query.toLocaleLowerCase().trim().split(/\s+/);
  results = results.filter((r) =>
    terms.every((t) =>
      `${r.label} ${r.description ?? ""} ${r.id} ${workflow(r)} ${aliases[r.id] ?? ""}`
        .toLocaleLowerCase()
        .includes(t),
    ),
  );
  results = results.slice(0, 100);
  async function activate(r: Result) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await r.run();
      if (!r.stay) close();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  const groups =
    !finding && activeSection === "All actions"
      ? categories.filter((name) => results.some((r) => workflow(r) === name))
      : [""];
  const keyboardList = !browse || Boolean(query || scope);
  return (
    <div
      className={`workspace ${mode === "options" ? "options" : browse ? "popup-workspace" : "palette-workspace"}`}
    >
      {mode === "options" && (
        <header>
          <h1>Browser Mods</h1>
        </header>
      )}
      {error && (
        <div role="alert" className="error">
          {error}
          <button
            onClick={() => {
              setError("");
            }}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
      {!ready ? (
        <p role="status">Loading your setup…</p>
      ) : mode === "options" && Settings ? (
        <Settings
          port={port}
          prefs={prefs}
          save={save}
          fail={fail}
          notice={notice}
          setNotice={setNotice}
          actions={allActions}
        />
      ) : (
        <>
          <header className="workspace-toolbar">
            {scope && (
              <button
                onClick={() => {
                  setScope("");
                  setQuery("");
                  input.current?.focus();
                }}
              >
                Back
              </button>
            )}
            <Input
              ref={input}
              id="search"
              type="search"
              role="combobox"
              aria-label={scope ? `Search ${scope}` : "Search Browser Mods"}
              aria-expanded={keyboardList}
              aria-controls="results"
              aria-activedescendant={
                keyboardList && results[selected]
                  ? `result-${selected}`
                  : undefined
              }
              placeholder={scope ? `Search ${scope}…` : "Search actions…"}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  if (!keyboardList && results[0]) {
                    e.preventDefault();
                    document.getElementById("result-0")?.focus();
                    return;
                  }
                  e.preventDefault();
                  setSelected((index) =>
                    results.length
                      ? (index +
                          (e.key === "ArrowDown" ? 1 : -1) +
                          results.length) %
                        results.length
                      : 0,
                  );
                }
                if (e.key === "Enter" && keyboardList && results[selected]) {
                  e.preventDefault();
                  void activate(results[selected]);
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  if (query) setQuery("");
                  else if (scope) setScope("");
                  else close();
                }
              }}
            />
            {mode === "popup" && (
              <button
                onClick={() => {
                  void openOptions(pages[0]).catch(fail);
                }}
              >
                Options
              </button>
            )}
          </header>
          <div className={browse ? "popup-layout" : "palette-layout"}>
            {browse && (
              <nav aria-label="Action categories" className="navigation">
                {["Favorites", "All actions", ...categories].map((name) => (
                  <button
                    key={name}
                    aria-current={name === activeSection ? "page" : undefined}
                    onClick={() => {
                      setSection(name);
                      setQuery("");
                      setScope("");
                    }}
                  >
                    {name}
                  </button>
                ))}
              </nav>
            )}
            <main
              className="action-pane"
              key={browse ? activeSection : "palette"}
            >
              {browse && (
                <h1>
                  {scope
                    ? `Find ${scope}`
                    : query
                      ? "Search results"
                      : activeSection}
                </h1>
              )}
              <div
                id="results"
                role={keyboardList ? "listbox" : undefined}
                aria-label="Available actions"
              >
                {groups.map((group) => (
                  <section
                    key={group}
                    role={keyboardList ? "presentation" : undefined}
                  >
                    {group && <h2>{group}</h2>}
                    {results
                      .filter((r) => !group || workflow(r) === group)
                      .map((r) => {
                        const index = results.indexOf(r);
                        return (
                          <div
                            className="action-row"
                            key={r.id}
                            role={keyboardList ? "presentation" : undefined}
                          >
                            <button
                              id={`result-${index}`}
                              role={keyboardList ? "option" : undefined}
                              aria-selected={
                                keyboardList ? selected === index : undefined
                              }
                              disabled={busy}
                              className={`shortcut-item result ${keyboardList && selected === index ? "selected" : ""}`}
                              onClick={() => {
                                void activate(r);
                              }}
                            >
                              <span>{r.label}</span>
                              {r.key && <kbd>{r.key}</kbd>}
                            </button>
                            {!keyboardList && r.setting && RowMenu && (
                              <RowMenu
                                label={r.label}
                                pinned={prefs.pins.includes(r.id)}
                                togglePin={() => {
                                  void save(
                                    "pins",
                                    prefs.pins.includes(r.id)
                                      ? prefs.pins.filter((id) => id !== r.id)
                                      : [...prefs.pins, r.id],
                                  );
                                }}
                                settings={() => {
                                  void openOptions(r.setting ?? pages[0]).catch(
                                    fail,
                                  );
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                  </section>
                ))}
              </div>
              {!results.length &&
                (finding || activeSection === "Favorites") && (
                  <p className="muted">
                    {finding
                      ? "No matching actions."
                      : "No favorites yet. Add actions from All actions."}
                  </p>
                )}
              {browse && !finding && activeSection === "Web tools" && (
                <button
                  className="feature-link"
                  onClick={() => {
                    void openOptions(featureRoutes.RDP[1]).catch(fail);
                  }}
                >
                  RDP download helper settings
                </button>
              )}
              {browse &&
                !finding &&
                activeSection === "Media" &&
                (playlist && current.id !== undefined ? (
                  <PlaylistDurationCard
                    key={`${current.id}:${playlist.page}:${playlist.list}`}
                    target={playlist}
                    tabId={current.id}
                    openPlaylist={port.open}
                  />
                ) : (
                  <p className="muted">
                    Open a YouTube playlist to see its duration here.
                  </p>
                ))}
            </main>
          </div>
        </>
      )}
    </div>
  );
}

export function mountWorkspace({
  mode,
  palette = false,
  Settings,
  RowMenu,
}: {
  mode: "popup" | "options" | "launcher";
  palette?: boolean;
  Settings?: ComponentType<OptionsProps>;
  RowMenu?: typeof ActionMenu;
}) {
  const port = workspaceBrowser();
  const container = document.getElementById("app");
  if (!container) throw Error("Missing app container");
  document.body.classList.add(
    mode === "popup" && palette ? "toolbar-palette" : mode,
  );
  const root = createRoot(container);
  root.render(
    <App
      port={port}
      mode={mode}
      initialPalette={palette}
      Settings={Settings}
      RowMenu={RowMenu}
    />,
  );
  window.addEventListener(
    "pagehide",
    () => {
      root.unmount();
    },
    { once: true },
  );
}
