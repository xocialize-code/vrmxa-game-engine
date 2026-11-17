import AppKit
import WebKit

// VRMXG determinism spike: the physics spike's thin Mac wrapper, adapted (same scheme handler and
// loopback server; the web build is the determinism suite).
//
//   DeterminismSpike.app/Contents/MacOS/DeterminismSpike        viewer via the custom scheme
//   SPIKE_ORIGIN=loopback …                                       viewer via http://127.0.0.1
//   SPIKE_AUTORUN=1 …                                            runs the suite through the scheme, then
//       through loopback, prints a line per result, writes JSON to SPIKE_OUT (a folder, default the
//       app's temporary directory) and quits.
//   SPIKE_ORIGINS=loopback                                       autorun only these origins (scheme,loopback)
//   SPIKE_QUERY='parts=timing&models=spec'                       extra query for the page

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
    var activity: NSObjectProtocol?

    func applicationDidFinishLaunching(_ note: Notification) {
        // Keep App Nap and timer throttling away from the timing runs.
        activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiated, .latencyCritical], reason: "determinism spike")
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(scheme, forURLScheme: SchemeHandler.scheme)
        config.userContentController.add(self, name: "spike")
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 800), configuration: config)
        webView.navigationDelegate = self
        webView.isInspectable = true

        window = NSWindow(contentRect: webView.frame, styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "VRMXG Determinism Spike"
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
            let origins = (env["SPIKE_ORIGINS"] ?? "scheme,loopback").split(separator: ",").map(String.init)
            let prefix = env["SPIKE_NAME"] ?? "wkwebview"
            autorunQueue = []
            if origins.contains("scheme") { autorunQueue.append(("\(prefix)-scheme", URL(string: "\(schemeBase)?autorun=1\(extra)")!)) }
            if port != 0, origins.contains("loopback") { autorunQueue.append(("\(prefix)-loopback", URL(string: "\(loopBase)?autorun=1\(extra)")!)) }
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
        case "ready": print("[page] ready \(obj["payload"] ?? "")")
        case "results":
            guard !autorunQueue.isEmpty else { return }
            let name = autorunQueue.removeFirst().name
            collected[name] = obj["payload"]
            if let p = obj["payload"], let d = try? JSONSerialization.data(withJSONObject: p, options: [.sortedKeys]) {
                print("[results \(name)] \(d.count) bytes")
            }
            next()
        default: break
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
