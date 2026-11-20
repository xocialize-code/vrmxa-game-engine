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
| Methods | `shell.info` (with the `scheme` base); `file.open`, `file.save` (system panels; writing back to a file the person opened or saved needs no panel; `text`, or `base64` for binary); for a binary file the person picks (a `.vrmxa`, AB-A-0314, shell 0.6.0), `file.open { types, serve: true }` serves it at `url` (`/opened/<token>/<name>`, on both origins, no copy over the bridge) and `binary: true` returns `base64` instead (≤ 64 MB); `remember: "<key>"` keeps a security-scoped bookmark, so `file.reopen { key, serve? }` opens it on a later launch with no panel (null when nothing is remembered or the file has gone) and `file.forget { key }` drops it (the app needs `com.apple.security.files.bookmarks.app-scope`); `project.open`, `project.list`, `project.write` (`text` or `base64`); `saves.list`, `saves.read`, `saves.write`, `saves.remove` (save slots in the app's own folder, Application Support/<bundle id>/Saves, no panels; `VRMXG_SHELL_SAVES` moves it; shell 0.3.0, M2 W9; the delegate keeps the `SaveMethods` for the app's life, since its handlers capture it unowned: a temporary crashed the first call, 0.4.0); `export.begin`, `export.end`, `export.cancel` (frame export, below); `camera.status`, `camera.start { fps }`, `camera.stop` (M3 W5, shell 0.5.0: AVCapture and Vision on a background queue, feature frames to the page as `camera.frame` events, never an image; the app needs `com.apple.security.device.camera` and NSCameraUsageDescription, or camera.start refuses; spike-camera/README.md has the verdict); `microphone.status`, `microphone.request` (M3 W3, shell 0.6.0: the permission the page's getUserMedia and a native capture path share; the app needs `com.apple.security.device.audio-input` and NSMicrophoneUsageDescription, or microphone.request refuses; the web view's getUserMedia is granted for the app's own origins only and only for the devices the app declares); `window.show`, `window.hide`, `window.state`, `window.setMode { mode: "normal" | "floating", size?, borderless? }` (AB-A-0317, shell 0.6.0: floating stays above other apps on every Space at its own saved frame, 360 × 480 the first time; borderless drops the title bar and background so only the page draws; `window.state` events `{ visible, mode, key }` on show, hide, minimise and occlusion, so the page can drop its frame rate); plus each app's own |
| Binary POSTs | `PostRouter`, on both origins: the page `fetch`es an `ArrayBuffer` or typed-array body (a `Blob` body arrives empty; typed arrays don't cross `postMessage`, spike-frame-export); the reply comes once the body is consumed, which is the backpressure. Responses carry CORS headers, so a loopback page can POST to the scheme (the faster transport) |
| Frame export (M1 W8) | `export.begin { width, height, fps: [num, den], frames, codec, audio, hash, suggestedName }` opens the file (save panel, a granted `path`, or `VRMXG_SHELL_EXPORT`: a file, or a folder ending in `/`); `POST __export/frame?id=&n=` raw RGBA from `readPixels`, flipped and swizzled with vImage and appended to AVAssetWriter (H.264 / HEVC with B-frames and BT.709 tags, HEVC with alpha, ProRes 4444 un-premultiplied), frame n stamped n · den / num; `POST __export/audio?id=` the mixed WAV, muxed as AAC after the last frame (passthrough video, so the writer's interleaving never waits on sound); `export.end` returns the file and timings. With `hash: true` it also returns each frame's hash as it arrived, using the page's own `hashFrame` (FNV-1a in two lanes, so a shell hash and a page hash of the same pixels are equal; shell 0.4.0, M2 W12). With `subtitles` (SRT text) on `export.begin`, it writes `<name>.srt` beside the movie. It writes directly where it can; in the sandbox it writes as a related item, through an `NSFilePresenter` and the app's `NSIsRelatedItemType` document type for srt. Automated exports keep `<file>.frames.json` and the WAV beside the file |
| Menu bar apps (AB-A-0317) | Opt-in through `ShellConfiguration`, so other apps don't change: `statusItem: StatusItemConfiguration(symbol:, items: [(title, event)])` puts an icon in the menu bar with Show / Hide Window, the app's items (as `menu.<event>` events) and Quit; `closeKeepsRunning: true` makes closing hide the window and keeps the app running; `dockIcon: false` runs it as an accessory app (no Dock icon, like LSUIElement) |
| Menus | App, File (Open…, Open Project…, Save, Save As…: sent to the page as `menu.*` events), Edit (undo / redo and the clipboard through the responder chain; with `pageUndo`, undo and redo go to the page as `menu.undo` / `menu.redo`), View (Reload), Window |
| Sandbox | `app-sandbox`, `network.client`, `network.server` (loopback), `files.user-selected.read-write` (panels) |
| Permissions (camera, microphone) | macOS judges a request by the app's *responsible process*. Launched by LaunchServices (Finder, the Dock, `open`), that's the app, and macOS asks the person once. Started as another process's child (AppProbe's `launch`, a terminal running the binary), it's the parent: the app silently gets the parent's answer, refused with no prompt if the parent was never granted (AB-L-0370), or "authorized" if the parent was. To check a permission, launch with `open -n --env VRMXG_SHELL_MIC=request --stdout <log> <app>`: the shell prints the microphone status before and after asking. Measured 2026-11-19 on the playground: a child of a granted parent shows `authorized` with no prompt; through `open`, `notDetermined` → the prompt → `authorized` |
| Automation | `VRMXG_SHELL_OPEN`, `VRMXG_SHELL_SAVE`, `VRMXG_SHELL_PROJECT`, `VRMXG_SHELL_EXPORT` stand in for the panels (relative paths are under the app's temporary folder, inside its sandbox), so AppProbe scenarios open and save without the panel |

Tests: `swift test` in `apps/shell` (file serving and project mounts with path traversal refused, loopback GET / HEAD /
405 and POST parsing, POST routing, bridge dispatch and errors as values, open / save / project through the automation
hooks with binary writes; export: H.264 with sound frame-exact with the flip and swizzle checked on decoded pixels,
29.97 fps landing exactly, ProRes decoding identically across encodes with matching frame hashes, missing frames
refused). `DeterminismExperiment.swift` is an env-gated probe of VideoToolbox's decoded-frame determinism (see there).
Bridge replies must hold plain values only: WebKit refuses a reply with a Swift Optional inside ("the result value passed
back … was unsupported"). The playground's AppProbe scenario (`apps/playground-mac/docs/hand-test`) checks the round trip
and Open / Save in the running app; the editor's export scenario (`apps/editor-mac/docs/hand-test`) checks export.
