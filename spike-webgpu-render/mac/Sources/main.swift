import AppKit
import WebKit

// VRMXG WebGPU render spike (AB-T-0554): the thin sandboxed wrapper from spike-physics (scheme handler, loopback
// server), running the page's cases one after another, each in a FRESH WKWebView (a web view that has loaded the
// custom scheme keeps its 1 ms timer after navigating to loopback, AB-L-0346). For each case it waits for
// window.READY, reads window.__result and window.__shots, and writes <case>__<origin>.json and the shots as PNG.
// Nothing is configured for WebGPU: the WKWebViewConfiguration is the default one, as in apps/shell.
//
//   WebGPUSpike.app/Contents/MacOS/WebGPUSpike                           the default cases (below)
//   SPIKE_CASES='mode=probe;mode=bench&renderer=webgpu'                   these cases (';'-separated)
//   SPIKE_ORIGINS='loopback'                                              scheme, loopback or both (a case may pin
//                                                                         its own with origin=scheme|loopback)
//   SPIKE_TIMEOUT=900                                                     seconds a case may take (600)
// Output: the app's temporary directory (the sandbox container's tmp); the paths are printed.

setvbuf(stdout, nil, _IONBF, 0)

let defaultCases = [
    "mode=probe&origin=scheme", "mode=probe&origin=loopback",
    "mode=view&renderer=webgpu&post=anime&origin=scheme",
    "mode=view&renderer=webgpu&post=anime&origin=loopback",
    "mode=bench&renderer=webgl&origin=loopback", "mode=bench&renderer=webgpu&origin=loopback",
    "mode=export&renderer=webgl&origin=loopback", "mode=export&renderer=webgpu&origin=loopback",
    "mode=export&renderer=webgpu&origin=scheme",
    "mode=particles&renderer=webgl&origin=loopback", "mode=particles&renderer=webgpu&origin=loopback",
    "mode=particles&renderer=webgpu&b=fresh&dummy=host&origin=loopback",
]

@MainActor
final class Spike: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView?
    let root = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
    lazy var scheme = SchemeHandler(root: root)
    lazy var server = LoopbackServer(root: root)
    let env = ProcessInfo.processInfo.environment
    var queue: [(name: String, origin: String, url: URL)] = []
    var navError: String?
    let outDir = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true).appendingPathComponent("webgpu-spike", isDirectory: true)
    var summary: [[String: Any]] = []

    func makeConfig() -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(scheme, forURLScheme: SchemeHandler.scheme)
        return config
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 720), styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "VRMXG WebGPU Render Spike"
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        do { try server.start { [weak self] port in self?.serverReady(port) } }
        catch { print("[spike] loopback server failed: \(error)"); serverReady(0) }
    }

    func serverReady(_ port: UInt16) {
        print("[spike] loopback server on 127.0.0.1:\(port)")
        let cases = env["SPIKE_CASES"].map { $0.split(separator: ";").map(String.init) } ?? defaultCases
        let want = env["SPIKE_ORIGINS"] ?? "both"
        for c in cases {
            let pinned = URLComponents(string: "x:?" + c)?.queryItems?.first { $0.name == "origin" }?.value
            var origins: [String] = []
            if let pinned { origins = [pinned] } else {
                if want != "loopback" { origins.append("scheme") }
                if want != "scheme" { origins.append("loopback") }
            }
            for origin in origins {
                if origin == "loopback" && port == 0 { continue }
                let base = origin == "scheme" ? "\(SchemeHandler.scheme)://app/index.html" : "http://127.0.0.1:\(port)/index.html"
                let name = c.replacingOccurrences(of: "&origin=\\w+", with: "", options: .regularExpression)
                    .replacingOccurrences(of: "[=&,.;]", with: "_", options: .regularExpression)
                queue.append((name, origin, URL(string: "\(base)?\(c)")!))
            }
        }
        next()
    }

    func next() {
        guard !queue.isEmpty else { finish(); return }
        let item = queue[0]
        // a fresh web view (and web content process) per case
        webView?.navigationDelegate = nil
        webView?.removeFromSuperview()
        let fresh = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 720), configuration: makeConfig())
        fresh.navigationDelegate = self
        fresh.isInspectable = true
        webView = fresh
        window.contentView = fresh
        navError = nil
        print("[spike] \(item.origin): \(item.url.query ?? "")")
        fresh.load(URLRequest(url: item.url))
        poll(started: Date())
    }

    func poll(started: Date) {
        webView?.evaluateJavaScript("window.READY === true") { [weak self] value, _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                if (value as? Bool) == true { self.collect(timedOut: false, started: started); return }
                let limit = Double(self.env["SPIKE_TIMEOUT"] ?? "") ?? 600
                if self.navError != nil || Date().timeIntervalSince(started) > limit { self.collect(timedOut: true, started: started); return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.poll(started: started) }
            }
        }
    }

    func collect(timedOut: Bool, started: Date) {
        let item = queue.removeFirst()
        let js = "JSON.stringify({ result: window.__result ?? null, shots: window.__shots ?? [], errors: window.__errors ?? [], gpu: !!navigator.gpu })"
        webView?.evaluateJavaScript(js) { [weak self] value, error in
            MainActor.assumeIsolated {
                guard let self else { return }
                var row: [String: Any] = ["case": item.url.query ?? "", "origin": item.origin, "timedOut": timedOut, "seconds": Int(Date().timeIntervalSince(started))]
                if let navError = self.navError { row["navError"] = navError }
                if let error { row["jsError"] = error.localizedDescription }
                var result: [String: Any] = [:]
                if let s = value as? String, let d = s.data(using: .utf8), let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
                    result = obj["result"] as? [String: Any] ?? ["errors": obj["errors"] ?? [], "navigatorGpu": obj["gpu"] ?? false]
                    for shot in obj["shots"] as? [[String: Any]] ?? [] {
                        guard let name = shot["name"] as? String, let url = shot["dataUrl"] as? String, let comma = url.firstIndex(of: ","),
                              let bytes = Data(base64Encoded: String(url[url.index(after: comma)...])) else { continue }
                        let file = self.outDir.appendingPathComponent("wkwebview-\(item.origin)-\(name).png")
                        try? bytes.write(to: file)
                    }
                }
                result["runtime"] = "wkwebview"
                result["wrapper"] = row
                let file = self.outDir.appendingPathComponent("wkwebview-\(item.origin)-\(item.name).json")
                if let data = try? JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: file) }
                let errs = (result["errors"] as? [Any])?.count ?? -1
                let failed = (result["failed"] as? String).map { " FAILED: \($0.prefix(300))" } ?? ""
                print("  → \(file.lastPathComponent): errors \(errs), \(row["seconds"]!) s\(timedOut ? ", TIMED OUT" : "")\(failed)")
                self.summary.append(row)
                self.next()
            }
        }
    }

    func finish() {
        print("[spike] wrote \(outDir.path)")
        print("[spike] done")
        NSApp.terminate(nil)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { navError = error.localizedDescription }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { navError = error.localizedDescription }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { navError = "web content process terminated" }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = MainActor.assumeIsolated { Spike() }
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
