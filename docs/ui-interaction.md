# Browser Mods interaction design

One extension with Redact 0.3.1, shared GitHub Dark Default tokens, and a locally styled shadcn Input adaptation. New feature implementations remain in the feature roadmap.

## Everyday interaction

Direct Chrome commands execute existing actions without rendering UI. The unassigned `open-palette` action opens search independently of the toolbar home. Configure its key through Chrome’s shortcut editor. The four suggested defaults still apply.

Chrome displays command descriptions in its shortcut editor but sorts and stores bindings by manifest command ID. The build prefixes native IDs with the catalog category so related commands appear together. Chrome treats the move to these prefixed IDs as new commands, so existing assignments may need to be set again. Internal IDs continue to identify actions in preferences, history and backups. Keep published native IDs stable, including their category prefixes. Editing descriptions or adding commands preserves existing bindings.

The toolbar opens a single-column, 800 × 600 popup with user-selected items in saved order. New and upgraded installs start with an empty list and a **Customize popup** button. Add, remove, and reorder items in **Appearance & controls → Toolbar popup**. Command picks are independent of Chrome's key assignments and the palette's visibility filter. Disabled features are omitted. Picked playlist duration and RDP setup appear only on matching tabs. RDP setup receives the original browser tab and validates window and privacy ownership before using it.

Popup picks have their own versioned sync key. Older backups import with an empty popup list. Legacy pins, layout, and section order round-trip through sync and backups. Command visibility, ordering, search mode and placement control the separate command palette. Concurrent edits to separate controls merge independently. Chrome resolves edits to the same key.

Palette placement is toolbar (default) or an on-demand centered launcher. The latter uses a modal native dialog and isolated extension iframe, with a short-lived session authorization bound to the source tab, a private MessageChannel, explicit readiness handshake, and focus restoration. Unauthorized embedded launchers do not render; privileged requests revalidate the session and active tab. Unsupported pages or denied injection use the toolbar fallback. No launcher listeners, polling, or page scripts run before invocation.

Search modes are actions/scoped searches (default), everything grouped by result type, or commands only. Disabled actions may appear in search if explicitly enabled in Appearance & controls. Roadmap items stay in project documentation. Search matches descriptions, command IDs, categories and aliases. Tab metadata is fetched when entering its search mode, not for every character; bookmark search is optional-permission, debounced, and stale results are discarded. Search renders at most 100 results; refine the query for others. Extension/profile search becomes available with the actual extension manager, rather than returning fictional entries.

Arrow keys navigate results, Enter runs, and Escape clears a query, returns from scoped search, then dismisses. One-shot actions close; toggles stay open. Errors are actionable; routine success notifications are omitted. Future persisted jobs must expose progress/cancellation without depending on popup lifetime; no new long-running job module is implemented here.

## Options and maintenance

Options opens on Tab switching. Its expandable sidebar keeps the selected leaf and detail pane together. Search results, older settings links, and browser history select the leaf and expand its parent. The same navigation stacks above the details on narrow screens. Feature switches still gate commands across surfaces.

Tab switching uses the existing synced settings and shows its controls directly. Keyboard shortcuts shows actual assignments and links to Chrome's shortcut editor. Assignment history and Shortcut backup are separate sidebar destinations that display the existing maintenance controls immediately. Assignment history records actual and desired keys with device revisions. Choosing to adopt this device's assignment creates a newer revision. Chrome owns actual assignment.

Interface backups use a versioned, strictly validated JSON envelope, a 64 KiB input limit, one sync write, and a local pre-import recovery snapshot. Import does not assign browser keys or grant permissions. Shortcut backups retain their existing separate format and safeguards. Optional site grants can be revoked from options.

## Engineering and verification

Workspace feature adapters own browser access, pure preference policy owns normalization/validation, and feature UI owns search and presentation. Options UI is a separate entrypoint dependency and is absent from popup/launcher bundles. Privileged actions use existing typed worker dispatch; the renderer stays out of worker/offscreen output. TSX participates in strict typing, typed lint, dependency/context checks, Knip and negative fixtures. React-facing imports resolve to pinned Redact; production metadata rejects actual React/ReactDOM and test instrumentation.

The workspace uses local components and CSS. The in-page preview fixture covers a selection control, bookmark folder picker, and duplicate review using sample data. The fixture is excluded from the extension package.

Packaged tests cover popup curation, live sync, contextual items, expandable Options navigation, keyboard focus, deep links, browser history, maintenance views, and malformed imports. A separate centered-launcher fixture adds localhost host access only in its disposable manifest so injection can be tested without changing production grants; it checks the handshake, Escape, focus restoration and repeat-invocation cleanup. Existing native maintenance, media, clipboard, and tab operation suites remain regression coverage.
