# VRMXG shell

M1 W0 (AB-T-0512). The shared Mac shell every VRMXG app runs in (AB-D-0253): a sandboxed `WKWebView` around the app's
web build, a typed native bridge, file and project panels, and standard menus. A Swift package; apps are small
executable packages on top of it, built with SwiftPM (no Xcode project).

```swift
import VRMXGShell
ShellApp.run(ShellConfiguration(appName: "VRMXG Playground", scheme: "vrmxg-playground",
                                methods: [("app.hello", { p in ["hello": p.string("name") ?? "world"] })]))
```

```js
import { inShell, call, on } from '../../shell/js/shell.js';
if (inShell) {
  const info = await call('shell.info');                       // { shell, app, appVersion, origin, url, methods }
  const f = await call('file.open', { types: ['vrmxs'] });      // { path, name, size, text }
  await call('file.save', { text, suggestedName: 'cafe.vrmxs' }); // { path, name, bytes }
  on('menu.save', save);                                        // File menu commands arrive as events
}
```

| Piece | What |
|---|---|
| Origins | The web build (`Resources/web`) over a loopback HTTP server, the default (a 20 µs timer and SharedArrayBuffer, AB-L-0346), or the custom scheme `<scheme>://app/` (`VRMXG_ORIGIN=scheme`). `VRMXG_QUERY` adds a query string. Both send the cross-origin isolation headers |
| Project mount | `project.open` mounts a folder at `/project/` on both origins, so the page fetches project assets by URL |
| Bridge | `window.webkit.messageHandlers.vrmxg.postMessage({ method, params })` returns a promise (`WKScriptMessageHandlerWithReply`); errors come back as `{ code, message }` (`bad_request`, `unknown_method`, `bad_params`, `cancelled`, `no_project`, `failed`). Native → page: `vrmxg-shell` events |
| Methods | `shell.info`; `file.open`, `file.save` (system panels; writing back to a file the person opened or saved needs no panel); `project.open`, `project.list`, `project.write`; plus each app's own |
| Menus | App, File (Open…, Open Project…, Save, Save As…: sent to the page as `menu.*` events), Edit (undo / redo and the clipboard through the responder chain; with `pageUndo`, undo and redo go to the page as `menu.undo` / `menu.redo`), View (Reload), Window |
| Sandbox | `app-sandbox`, `network.client`, `network.server` (loopback), `files.user-selected.read-write` (panels) |
| Automation | `VRMXG_SHELL_OPEN`, `VRMXG_SHELL_SAVE`, `VRMXG_SHELL_PROJECT` stand in for the panels (relative paths are under the app's temporary folder, inside its sandbox), so AppProbe scenarios open and save without the panel |

Tests: `swift test` in `apps/shell` (file serving and project mounts with path traversal refused, loopback GET / HEAD /
405, bridge dispatch and errors as values, open / save / project through the automation hooks). The playground's
AppProbe scenario (`apps/playground-mac/docs/hand-test`) checks the round trip and Open / Save in the running app.
Frame export (AVAssetWriter behind a bridge endpoint) is M1 W8.
