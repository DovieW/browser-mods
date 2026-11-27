import { Input } from "./input";
import { shortCommandLabel } from "../../../ui/shortcut-labels";
import { commandErrorMessage } from "../../../core/actions/errors";
import type { OptionsProps } from "./options";
import type { ComponentType } from "react";
import {
  featureRoutes,
  defaultOptionsPage,
  settings,
  workflow,
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
  Settings,
}: {
  port: WorkspacePort;
  mode: "popup" | "options" | "launcher";
  Settings: ComponentType<OptionsProps> | undefined;
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
  const [current, setCurrent] = useState<
    Awaited<ReturnType<WorkspacePort["currentTab"]>>
  >({
    id: undefined,
    url: "",
  });
  useEffect(() => {
    if (mode === "popup") void port.currentTab().then(setCurrent).catch(fail);
  }, [mode, port]);
  const palette = mode !== "options";
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
  }, [query, scope]);
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
    const source = current.id !== undefined ? `?sourceTab=${current.id}` : "";
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
          run: () => openOptions(r.setting ?? defaultOptionsPage),
        })),
    );
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
  return (
    <div
      className={`workspace ${mode === "options" ? "options" : "palette-workspace"}`}
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
              aria-expanded={results.length > 0}
              aria-controls="results"
              aria-activedescendant={
                results[selected] ? `result-${selected}` : undefined
              }
              placeholder={scope ? `Search ${scope}…` : "Search actions…"}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
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
                if (e.key === "Enter" && results[selected]) {
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
                  void openOptions(defaultOptionsPage).catch(fail);
                }}
              >
                Options
              </button>
            )}
          </header>
          <main className="palette-layout">
            <div className="action-pane">
              <div id="results" role="listbox" aria-label="Available actions">
                {results.map((r, index) => (
                  <button
                    key={r.id}
                    id={`result-${index}`}
                    role="option"
                    aria-selected={selected === index}
                    disabled={busy}
                    className={`shortcut-item result ${selected === index ? "selected" : ""}`}
                    onClick={() => {
                      void activate(r);
                    }}
                  >
                    <span>{r.label}</span>
                    {r.key && <kbd>{r.key}</kbd>}
                  </button>
                ))}
              </div>
              {!results.length && <p className="muted">No matching actions.</p>}
            </div>
          </main>
        </>
      )}
    </div>
  );
}

export function mountWorkspace({
  mode,
  Settings,
}: {
  mode: "popup" | "options" | "launcher";
  Settings?: ComponentType<OptionsProps>;
}) {
  const port = workspaceBrowser();
  const container = document.getElementById("app");
  if (!container) throw Error("Missing app container");
  document.body.classList.add(mode === "popup" ? "toolbar-palette" : mode);
  const root = createRoot(container);
  root.render(<App port={port} mode={mode} Settings={Settings} />);
  window.addEventListener(
    "pagehide",
    () => {
      root.unmount();
    },
    { once: true },
  );
}
