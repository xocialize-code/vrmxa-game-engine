import AppKit
import WebKit

// VRMXG cinematics spike, WKWebView pass (AB-T-0499): runs the same cases as web/scripts/shots.mjs
// inside a sandboxed WKWebView, through the custom scheme (the shipping origin) and through loopback
// (the 20 µs timer). For each case it waits for window.READY, reads window.__result, captures
// uncaught errors and console.error/warn (the page hooks both), and saves the canvas as PNG.
//
//   CinematicsSpike.app/Contents/MacOS/CinematicsSpike            all default cases, both origins
//   SPIKE_CASES='pipe=pmndrs;pipe=none'                           only these cases (';'-separated)
//   SPIKE_ORIGINS='loopback'                                      scheme, loopback or both (default)
//   SPIKE_TIMEOUT=900                                             seconds a case may take (120)
// Output: <app temp dir>/wkwebview-shots.json and <case>__<origin>.png; the paths are printed.

setvbuf(stdout, nil, _IONBF, 0)

let defaultCases = [
    "pipe=none", "pipe=builtin", "pipe=three", "pipe=pmndrs",
    "pipe=pmndrs&fx=dof,bloom,vig,ca,grain,lut",
    "pipe=pmndrs&mtoonOutline=0.004&fx=dof,bloom,vig,ca,grain,lut",
    "pipe=pmndrs&edges=1&mtoonOutline=0&fx=dof,bloom,vig,ca,grain,lut",
    "pipe=pmndrs&edges=1&mtoonOutline=0.004&fx=dof,bloom,vig,ca,grain,lut",
    "pipe=pmndrs&speed=1&fx=dof",
    "pipe=pmndrs&w=1920&h=1080", "pipe=three&w=1920&h=1080", "pipe=none&w=1920&h=1080",
    "pipe=pmndrs&shadows=0", "pipe=none&shadows=0", "pipe=pmndrs&shadows=0&w=1920&h=1080", "pipe=none&shadows=0&w=1920&h=1080",
    "pipe=pmndrs&frames=200", "pipe=none&frames=200",
]

@MainActor
final class Spike: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    let root = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
    lazy var scheme = SchemeHandler(root: root)
    lazy var server = LoopbackServer(root: root)
    let env = ProcessInfo.processInfo.environment
    var queue: [(name: String, origin: String, query: String, url: URL)] = []
    var results: [[String: Any]] = []
    var navError: String?
    let outDir = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)

    func makeConfig() -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(scheme, forURLScheme: SchemeHandler.scheme)
        return config
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 720), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "VRMXG Cinematics Spike"
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
        var origins: [(String, String)] = []
        if want != "loopback" { origins.append(("scheme", "\(SchemeHandler.scheme)://app/index.html")) }
        if want != "scheme", port != 0 { origins.append(("loopback", "http://127.0.0.1:\(port)/index.html")) }
        for (origin, base) in origins {
            for c in cases {
                let name = c.replacingOccurrences(of: "[=&,.]", with: "_", options: .regularExpression)
                queue.append((name, origin, c, URL(string: "\(base)?\(c)")!))
            }
        }
        next()
    }

    func next() {
        guard !queue.isEmpty else { finish(); return }
        let item = queue[0]
        let comps = URLComponents(string: "x:?" + item.query)?.queryItems ?? []
        let w = Double(comps.first { $0.name == "w" }?.value ?? "1280") ?? 1280
        let h = Double(comps.first { $0.name == "h" }?.value ?? "720") ?? 720
        // A fresh web view (and so a fresh web content process) per case: a WKWebView that has loaded the
        // custom scheme keeps its 1 ms timer after navigating to loopback (measured, 2026-11-17).
        webView?.navigationDelegate = nil
        let fresh = WKWebView(frame: NSRect(x: 0, y: 0, width: w, height: h), configuration: makeConfig())
        fresh.navigationDelegate = self
        fresh.isInspectable = true
        webView = fresh
        window.contentView = fresh
        window.setContentSize(NSSize(width: w, height: h))
        navError = nil
        print("[spike] \(item.origin): \(item.query)")
        webView.load(URLRequest(url: item.url))
        poll(started: Date())
    }

    func poll(started: Date) {
        webView.evaluateJavaScript("window.READY === true") { [weak self] value, _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                if (value as? Bool) == true { self.collect(timedOut: false); return }
                if self.navError != nil || Date().timeIntervalSince(started) > (Double(ProcessInfo.processInfo.environment["SPIKE_TIMEOUT"] ?? "") ?? 120) { self.collect(timedOut: true); return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.poll(started: started) }
            }
        }
    }

    func collect(timedOut: Bool) {
        let item = queue.removeFirst()
        let js = """
        JSON.stringify({ result: window.__result ?? null, errors: window.__errors ?? [], warnings: window.__warnings ?? [],
          png: (document.querySelector('canvas')?.toDataURL('image/png') ?? null), ua: navigator.userAgent,
          isolated: self.crossOriginIsolated, timerRes: (() => { let min = Infinity, last = performance.now(); for (let i = 0; i < 200000 && min > 0.0005; i++) { const t = performance.now(); if (t !== last) { min = Math.min(min, t - last); last = t; } } return +min.toFixed(4); })() })
        """
        webView.evaluateJavaScript(js) { [weak self] value, error in
            MainActor.assumeIsolated {
                guard let self else { return }
                var row: [String: Any] = ["case": item.query, "origin": item.origin, "timedOut": timedOut]
                if let navError = self.navError { row["navError"] = navError }
                if let error { row["jsError"] = error.localizedDescription }
                if let s = value as? String, let d = s.data(using: .utf8), var obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
                    if let png = obj.removeValue(forKey: "png") as? String, let comma = png.firstIndex(of: ","),
                       let bytes = Data(base64Encoded: String(png[png.index(after: comma)...])) {
                        let file = self.outDir.appendingPathComponent("\(item.name)__\(item.origin).png")
                        try? bytes.write(to: file)
                        row["png"] = file.lastPathComponent
                    }
                    for (k, v) in obj { row[k] = v }
                }
                let r = row["result"] as? [String: Any]
                let errs = (row["errors"] as? [Any])?.count ?? -1
                print("  → median \(r?["msMedian"] ?? "-") ms, p90 \(r?["msP90"] ?? "-"), calls \(r?["drawCalls"] ?? "-"), errors \(errs), warnings \((row["warnings"] as? [Any])?.count ?? -1)\(timedOut ? ", TIMED OUT" : "")")
                self.results.append(row)
                self.next()
            }
        }
    }

    func finish() {
        let file = outDir.appendingPathComponent("wkwebview-shots.json")
        if let data = try? JSONSerialization.data(withJSONObject: results, options: [.prettyPrinted, .sortedKeys]) {
            try? data.write(to: file)
        }
        print("[spike] wrote \(file.path)")
        print("[spike] done")
        NSApp.terminate(nil)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { navError = error.localizedDescription }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { navError = error.localizedDescription }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { navError = "web content process terminated" }
}

let app = NSApplication.shared
let delegate = MainActor.assumeIsolated { Spike() }
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
