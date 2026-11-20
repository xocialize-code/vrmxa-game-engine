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
| Methods | `shell.info` (with the `scheme` base); `file.open`, `file.save` (system panels; writing back to a file the person opened or saved needs no panel; `text`, or `base64` for binary); `project.open`, `project.list`, `project.write` (`text` or `base64`); `saves.list`, `saves.read`, `saves.write`, `saves.remove` (save slots in the app's own folder, Application Support/<bundle id>/Saves, no panels; `VRMXG_SHELL_SAVES` moves it; shell 0.3.0, M2 W9; the delegate keeps the `SaveMethods` for the app's life, since its handlers capture it unowned: a temporary crashed the first call, 0.4.0); `export.begin`, `export.end`, `export.cancel` (frame export, below); `camera.status`, `camera.start { fps }`, `camera.stop` (M3 W5, shell 0.5.0: AVCapture and Vision on a background queue, feature frames to the page as `camera.frame` events, never an image; the app needs `com.apple.security.device.camera` and NSCameraUsageDescription, or camera.start refuses; spike-camera/README.md has the verdict); plus each app's own |
| Binary POSTs | `PostRouter`, on both origins: the page `fetch`es an `ArrayBuffer` or typed-array body (a `Blob` body arrives empty; typed arrays don't cross `postMessage`, spike-frame-export); the reply comes once the body is consumed, which is the backpressure. Responses carry CORS headers, so a loopback page can POST to the scheme (the faster transport) |
| Frame export (M1 W8) | `export.begin { width, height, fps: [num, den], frames, codec, audio, hash, suggestedName }` opens the file (save panel, a granted `path`, or `VRMXG_SHELL_EXPORT`: a file, or a folder ending in `/`); `POST __export/frame?id=&n=` raw RGBA from `readPixels`, flipped and swizzled with vImage and appended to AVAssetWriter (H.264 / HEVC with B-frames and BT.709 tags, HEVC with alpha, ProRes 4444 un-premultiplied), frame n stamped n · den / num; `POST __export/audio?id=` the mixed WAV, muxed as AAC after the last frame (passthrough video, so the writer's interleaving never waits on sound); `export.end` returns the file and timings. With `hash: true` it also returns each frame's hash as it arrived, using the page's own `hashFrame` (FNV-1a in two lanes, so a shell hash and a page hash of the same pixels are equal; shell 0.4.0, M2 W12). With `subtitles` (SRT text) on `export.begin`, it writes `<name>.srt` beside the movie. It writes directly where it can; in the sandbox it writes as a related item, through an `NSFilePresenter` and the app's `NSIsRelatedItemType` document type for srt. Automated exports keep `<file>.frames.json` and the WAV beside the file |
| Menus | App, File (Open…, Open Project…, Save, Save As…: sent to the page as `menu.*` events), Edit (undo / redo and the clipboard through the responder chain; with `pageUndo`, undo and redo go to the page as `menu.undo` / `menu.redo`), View (Reload), Window |
| Sandbox | `app-sandbox`, `network.client`, `network.server` (loopback), `files.user-selected.read-write` (panels) |
| Automation | `VRMXG_SHELL_OPEN`, `VRMXG_SHELL_SAVE`, `VRMXG_SHELL_PROJECT`, `VRMXG_SHELL_EXPORT` stand in for the panels (relative paths are under the app's temporary folder, inside its sandbox), so AppProbe scenarios open and save without the panel |

Tests: `swift test` in `apps/shell` (file serving and project mounts with path traversal refused, loopback GET / HEAD /
405 and POST parsing, POST routing, bridge dispatch and errors as values, open / save / project through the automation
hooks with binary writes; export: H.264 with sound frame-exact with the flip and swizzle checked on decoded pixels,
29.97 fps landing exactly, ProRes decoding identically across encodes with matching frame hashes, missing frames
refused). `DeterminismExperiment.swift` is an env-gated probe of VideoToolbox's decoded-frame determinism (see there).
Bridge replies must hold plain values only: WebKit refuses a reply with a Swift Optional inside ("the result value passed
back … was unsupported"). The playground's AppProbe scenario (`apps/playground-mac/docs/hand-test`) checks the round trip
and Open / Save in the running app; the editor's export scenario (`apps/editor-mac/docs/hand-test`) checks export.
