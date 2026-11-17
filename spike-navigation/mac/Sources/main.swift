import AppKit
import WebKit

// VRMXG navigation spike: the thinnest Mac wrapper around the web build (copied from spike-physics).
//
//   NavigationSpike.app/Contents/MacOS/NavigationSpike           interactive stage via the custom scheme
//   SPIKE_ORIGIN=loopback …                                       interactive stage via http://127.0.0.1
//   SPIKE_AUTORUN=1 …                                            headless: runs the test suite through the
//       scheme, then through loopback, prints both JSON results to stdout, writes them to
//       SPIKE_OUT (a folder, default the app's temporary directory) and quits.
//   SPIKE_QUERY='backend=navcat&agents=200'                      extra query for the page
//   SPIKE_SHOT=/path/shot.png [SPIKE_SHOT_DELAY=4]               interactive page, snapshot the web view
//       a few seconds after it reports ready, write the PNG and quit

setvbuf(stdout, nil, _IONBF, 0)

@MainActor
final class Spike: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    let root = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
    lazy var scheme = SchemeHandler(root: root)
    lazy var server = LoopbackServer(root: root)
    let env = ProcessInfo.processInfo.environment
    var autorunQueue: [(name: String, url: URL)] = []
    var collected: [String: Any] = [:]

    func applicationDidFinishLaunching(_ note: Notification) {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(scheme, forURLScheme: SchemeHandler.scheme)
        config.userContentController.add(self, name: "spike")
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 800), configuration: config)
        webView.navigationDelegate = self
        webView.isInspectable = true

        window = NSWindow(contentRect: webView.frame, styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "VRMXG Navigation Spike"
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        do {
            try server.start { [weak self] port in self?.serverReady(port) }
        } catch {
            print("[spike] loopback server failed: \(error)")
            serverReady(0)
        }
    }

    func serverReady(_ port: UInt16) {
        print("[spike] loopback server on 127.0.0.1:\(port)")
        let schemeBase = "\(SchemeHandler.scheme)://app/index.html"
        let loopBase = "http://127.0.0.1:\(port)/index.html"
        if env["SPIKE_AUTORUN"] == "1" {
            let extra = env["SPIKE_QUERY"].map { "&\($0)" } ?? ""
            autorunQueue = [("wkwebview-scheme", URL(string: "\(schemeBase)?autorun=1\(extra)")!)]
            if port != 0 { autorunQueue.append(("wkwebview-loopback", URL(string: "\(loopBase)?autorun=1\(extra)")!)) }
            next()
        } else {
            let base = env["SPIKE_ORIGIN"] == "loopback" && port != 0 ? loopBase : schemeBase
            let q = env["SPIKE_QUERY"].map { "?\($0)" } ?? ""
            webView.load(URLRequest(url: URL(string: base + q)!))
        }
    }

    func next() {
        guard !autorunQueue.isEmpty else { finish(); return }
        let item = autorunQueue[0]
        print("[spike] autorun: \(item.name) → \(item.url.absoluteString)")
        webView.load(URLRequest(url: item.url))
    }

    func finish() {
        let outDir = URL(fileURLWithPath: env["SPIKE_OUT"] ?? NSTemporaryDirectory(), isDirectory: true)
        try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
        for (name, value) in collected {
            if let data = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]) {
                let file = outDir.appendingPathComponent("\(name).json")
                try? data.write(to: file)
                print("[spike] wrote \(file.path)")
            }
        }
        print("[spike] done")
        NSApp.terminate(nil)
    }

    nonisolated func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let text = message.body as? String else { return }
        MainActor.assumeIsolated { self.handle(text) }
    }

    func handle(_ text: String) {
        guard let data = text.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = obj["type"] as? String else { return }
        switch type {
        case "log": print("[page] \(obj["payload"] ?? "")")
        case "error": print("[page error] \(obj["payload"] ?? "")")
        case "ready":
            print("[page] ready \(obj["payload"] ?? "")")
            if let shot = env["SPIKE_SHOT"] { snapshot(to: shot) }
        case "results":
            guard !autorunQueue.isEmpty else { return }
            let name = autorunQueue.removeFirst().name
            collected[name] = obj["payload"]
            if let p = obj["payload"], let d = try? JSONSerialization.data(withJSONObject: p, options: [.sortedKeys]) {
                print("[results \(name)] \(String(decoding: d, as: UTF8.self))")
            }
            next()
        default: break
        }
    }

    func snapshot(to path: String) {
        let delay = Double(env["SPIKE_SHOT_DELAY"] ?? "4") ?? 4
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self else { return }
            self.webView.takeSnapshot(with: nil) { image, error in
                MainActor.assumeIsolated {
                    if let image, let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
                       let png = rep.representation(using: .png, properties: [:]) {
                        // The sandbox may refuse the path; fall back to the container's temporary folder.
                        let fallback = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent((path as NSString).lastPathComponent)
                        for url in [URL(fileURLWithPath: path), fallback] {
                            if (try? png.write(to: url)) != nil { print("[spike] snapshot \(url.path)"); break }
                        }
                    } else {
                        print("[spike] snapshot failed: \(error?.localizedDescription ?? "no image")")
                    }
                    NSApp.terminate(nil)
                }
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("[spike] navigation failed: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("[spike] provisional navigation failed: \(error.localizedDescription)")
        if env["SPIKE_AUTORUN"] == "1", !autorunQueue.isEmpty {
            collected[autorunQueue.removeFirst().name] = ["error": error.localizedDescription]
            next()
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        print("[spike] web content process terminated")
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = MainActor.assumeIsolated { Spike() }
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
