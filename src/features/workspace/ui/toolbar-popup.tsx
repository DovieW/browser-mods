import { useEffect, useState } from "react";
import { commands, type CommandId } from "../../../core/actions/catalog";
import { shortCommandLabel } from "../../../ui/shortcut-labels";
import {
  PlaylistDurationCard,
  playlistTab,
} from "../../playlist-duration/public-ui";
import { hasRdpToolbarTool } from "../../rdp-download/public-ui";
import type { WorkspacePort } from "../adapters/browser";
import { actionSection, type Preferences } from "../domain/preferences";
import { defaultOptionsPage, optionsHash } from "./model";

type SourceTab = Awaited<ReturnType<WorkspacePort["currentTab"]>>;

export function ToolbarPopup({ port }: { port: WorkspacePort }) {
  const [prefs, setPrefs] = useState<Preferences>();
  const [context, setContext] = useState<{ tab: SourceTab; rdp: boolean }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const help = (error: unknown) => {
    setError(
      error instanceof Error
        ? error.message
        : "Could not complete this action.",
    );
  };

  useEffect(() => {
    let active = true;
    const load = () =>
      void port
        .readPreferences()
        .then((value) => {
          if (active) setPrefs(value);
        })
        .catch((error: unknown) => {
          if (active) help(error);
        });
    load();
    const unwatch = port.watchPreferences(load);
    return () => {
      active = false;
      unwatch();
    };
  }, [port]);

  const showPlaylist =
    prefs?.popupItems.includes("playlist-duration") === true &&
    !prefs.disabled.includes("Media");
  const showRdp = prefs?.popupItems.includes("rdp-tools") === true;
  useEffect(() => {
    if (!showPlaylist && !showRdp) return;
    let active = true;
    setContext(undefined);
    void port
      .currentTab()
      .then(async (tab) => ({
        tab,
        rdp: showRdp && (await hasRdpToolbarTool(tab).catch(() => false)),
      }))
      .then((value) => {
        if (active) setContext(value);
      })
      .catch((error: unknown) => {
        if (active) {
          setContext({ tab: { id: undefined, url: "" }, rdp: false });
          help(error);
        }
      });
    return () => {
      active = false;
    };
  }, [port, showPlaylist, showRdp]);

  const tabId = context?.tab.id;
  const playlist =
    showPlaylist && context ? playlistTab(context.tab.url) : null;
  const ready = prefs && (!(showPlaylist || showRdp) || context);
  const items =
    prefs?.popupItems.filter((id) => {
      if (id === "playlist-duration") return playlist && tabId !== undefined;
      if (id === "rdp-tools") return showRdp && context?.rdp;
      return !prefs.disabled.includes(actionSection(id));
    }) ?? [];
  async function openOptions(page: string) {
    const source = context?.tab ?? (await port.currentTab());
    const query = source.id === undefined ? "" : `?sourceTab=${source.id}`;
    await port.open(port.url(`options.html${query}${optionsHash(page)}`));
    window.close();
  }
  async function activate(id: CommandId) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await port.run(id);
      if (id !== "pin-tab" && id !== "toggle-collapse-groups") window.close();
    } catch (error) {
      help(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="popup-workspace">
      {ready && (
        <header className="workspace-toolbar popup-toolbar">
          <button
            onClick={() =>
              void openOptions(
                items.length ? defaultOptionsPage : "Toolbar popup",
              ).catch(help)
            }
          >
            {items.length ? "Options" : "Customize popup"}
          </button>
        </header>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {ready && (
        <main
          className="action-pane curated-popup"
          aria-label="Toolbar popup items"
        >
          {items.map((id) => {
            if (id === "playlist-duration")
              return (
                playlist &&
                tabId !== undefined && (
                  <PlaylistDurationCard
                    key={id}
                    target={playlist}
                    tabId={tabId}
                    openPlaylist={port.open}
                  />
                )
              );
            if (id === "rdp-tools")
              return (
                <button
                  className="feature-link"
                  key={id}
                  onClick={() =>
                    void openOptions("RDP download helper").catch(help)
                  }
                >
                  RDP download helper settings
                </button>
              );
            const command = id as CommandId;
            return (
              <button
                className="shortcut-item result"
                key={id}
                disabled={busy}
                onClick={() => void activate(command)}
              >
                {shortCommandLabel({
                  name: id,
                  description: commands[command].description,
                })}
              </button>
            );
          })}
        </main>
      )}
    </div>
  );
}
