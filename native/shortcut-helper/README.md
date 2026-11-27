# Browser Mods desktop helper

The helper supports Google Chrome on **Kubuntu x64** and **Windows x64**. It checks for an existing Remote Desktop session and sends **Ctrl+Shift+P** to Bitwarden when enabled in Browser Mods. It runs on demand through Chrome Native Messaging.

## Install a release

Download the archive for your computer from the [Browser Mods releases](https://github.com/DovieW/browser-mods/releases) and extract it. Get the Browser Mods extension ID from `chrome://extensions` with Developer mode enabled.

On Kubuntu:

```sh
./browser-mods-helper install YOUR_EXTENSION_ID
```

The helper uses `/usr/bin/ydotool`. Install the `ydotool` package if needed and use the distribution's keyboard input service. Run `ydotoold` as your session user with access to `/dev/uinput` and a user-owned mode-0600 socket at `$XDG_RUNTIME_DIR/.ydotool_socket`. If that service is already running, keep using it. The helper installer does not change device permissions or start a daemon.

On Windows, from PowerShell in the extracted folder:

```powershell
.\browser-mods-helper.exe install YOUR_EXTENSION_ID
```

The installer registers the Chrome host for the current user. In the RDP download helper settings, choose **Allow desktop session checks** if Chrome has yet to grant desktop helper access. Enabling **Use the desktop helper for Bitwarden autofill** also grants that access. For autofill, set Bitwarden's shortcut to **Ctrl+Shift+P** in `chrome://extensions/shortcuts`.

With desktop helper 0.2.0 or newer, Browser Mods checks the focused portal tab before downloading and again when you return to that tab. An established TCP connection owned by Remmina on Kubuntu or Remote Desktop Connection (`mstsc.exe`) on Windows counts as active. The check uses standard RDP (3389) and RD Gateway (443) ports. It suits a single desktop workflow and does not identify the destination. The check reports only whether a connection is active. An unavailable or older helper leaves the existing download and duplicate protection behavior in effect.

The RDP helper runs the shortcut only in a tracked work sign-in tab that is active in the focused Chrome window. If Bitwarden is locked, focus is elsewhere, or the form differs, take over manually. MFA always uses the user's chosen method. The native helper receives no usernames, passwords or URLs.

## Build and release

Run `cargo test --locked` and `cargo build --release --locked` in this directory. A `helper-v*` tag matching `Cargo.toml` builds both platform archives and publishes their SHA-256 checksums. The extension keeps its own version and release tags.
