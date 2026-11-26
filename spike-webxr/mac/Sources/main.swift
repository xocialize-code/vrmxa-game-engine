import AppKit
import WebKit

// VRMXG WebXR spike (AB-T-0623): spike-physics' thin wrapper (its SchemeHandler and LoopbackServer, copied) with the
// cinematics harness's loop: every case in a fresh WKWebViewConfiguration and WKWebView, through the custom scheme and
// through loopback, waiting for window.READY and reading window.__result.
//
// What this wrapper adds is WebKit's feature flags. `SPIKE_FLAGS=default,xr` runs every case twice: with the
// configuration as it ships, and with every WebKit feature whose key mentions XR turned on through the preferences'
// private feature SPI (+[WKPreferences _features], -[WKPreferences _setEnabled:forFeature:]). There is no public API
// or entitlement for WebXR in WKWebView; this is how to find out what the engine underneath has.
//
//   WebXRSpike.app/Contents/MacOS/WebXRSpike
//   SPIKE_CASES='index.html;stereo.html?w=640'   pages and queries (';'-separated; default the probe)
//   SPIKE_ORIGINS=scheme|loopback|both           (default both)
//   SPIKE_FLAGS=default,xr                       (default both)
//   SPIKE_TIMEOUT=300                            seconds a case may take (120)
//   SPIKE_LABEL=probe                            names the output file
// Output, in the app's temporary directory (its sandbox container): wkwebview-<label>.json (one row per case),
// webkit-features.json (every feature with its default), and <case>__<origin>__<flags>__<name>.png for each data
// URL a page leaves in window.__pngs.

setvbuf(stdout, nil, _IONBF, 0)

/// WebKit's feature list through the preferences SPI: nil where this WebKit doesn't have it.
enum Features {
    static func all() -> [NSObject]? {
        let sel = NSSelectorFromString("_features")
        guard (WKPreferences.self as AnyObject).responds(to: sel),
              let arr = (WKPreferences.self as AnyObject).perform(sel)?.takeUnretainedValue() as? [NSObject] else { return nil }
        return arr
    }

    static func describe(_ f: NSObject, prefs: WKPreferences?) -> [String: Any] {
        var d: [String: Any] = [:]
        for k in ["key", "name", "details", "category", "status", "defaultValue", "hidden"] {
            if f.responds(to: NSSelectorFromString(k)), let v = f.value(forKey: k) { d[k] = v is NSNumber || v is String ? v : "\(v)" }
        }
        if let prefs { d["enabled"] = isEnabled(f, prefs) }
        return d
    }

    static func isEnabled(_ f: NSObject, _ prefs: WKPreferences) -> Bool? {
        let sel = NSSelectorFromString("_isEnabledForFeature:")
        guard prefs.responds(to: sel) else { return nil }
        typealias Fn = @convention(c) (AnyObject, Selector, AnyObject) -> Bool
        return unsafeBitCast(prefs.method(for: sel), to: Fn.self)(prefs, sel, f)
    }

    static func setEnabled(_ on: Bool, _ f: NSObject, _ prefs: WKPreferences) -> Bool {
        let sel = NSSelectorFromString("_setEnabled:forFeature:")
        guard prefs.responds(to: sel) else { return false }
        typealias Fn = @convention(c) (AnyObject, Selector, Bool, AnyObject) -> Void
        unsafeBitCast(prefs.method(for: sel), to: Fn.self)(prefs, sel, on, f)
        return true
    }

    static func isXR(_ f: NSObject) -> Bool {
        let key = (f.value(forKey: "key") as? String) ?? ""
        return key.range(of: "XR", options: .caseInsensitive) != nil
    }
}

@MainActor
final class Spike: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView?
    let root = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
    lazy var scheme = SchemeHandler(root: root)
    lazy var server = LoopbackServer(root: root)
    let env = ProcessInfo.processInfo.environment
    var queue: [(name: String, origin: String, flags: String, query: String, url: URL)] = []
    var results: [[String: Any]] = []
    var navError: String?
    let outDir = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)

    func makeConfig(flags: String) -> (WKWebViewConfiguration, [[String: Any]]) {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(scheme, forURLScheme: SchemeHandler.scheme)
        var turnedOn: [[String: Any]] = []
        if flags == "xr", let all = Features.all() {
            for f in all where Features.isXR(f) {
                let ok = Features.setEnabled(true, f, config.preferences)
                var d = Features.describe(f, prefs: config.preferences)
                d["setCallAvailable"] = ok
                turnedOn.append(d)
            }
        }
        return (config, turnedOn)
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 720), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "VRMXG WebXR Spike"
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        writeFeatures()
        do { try server.start { [weak self] port in self?.serverReady(port) } }
        catch { print("[spike] loopback server failed: \(error)"); serverReady(0) }
    }

    /// Every feature this WebKit lists, with its default in a fresh configuration.
    func writeFeatures() {
        let prefs = WKWebViewConfiguration().preferences
        let rows: Any = Features.all().map { $0.map { Features.describe($0, prefs: prefs) } } ?? ["error": "+[WKPreferences _features] is not available"]
        let file = outDir.appendingPathComponent("webkit-features.json")
        if let data = try? JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: file) }
        let xr = (Features.all() ?? []).filter(Features.isXR).map { ($0.value(forKey: "key") as? String) ?? "?" }
        print("[spike] \((Features.all() ?? []).count) WebKit features; XR ones: \(xr)")
    }

    func serverReady(_ port: UInt16) {
        print("[spike] loopback server on 127.0.0.1:\(port)")
        let cases = env["SPIKE_CASES"].map { $0.split(separator: ";").map(String.init) } ?? ["index.html"]
        let want = env["SPIKE_ORIGINS"] ?? "both"
        let flagSets = (env["SPIKE_FLAGS"] ?? "default,xr").split(separator: ",").map(String.init)
        var origins: [(String, String)] = []
        if want != "loopback" { origins.append(("scheme", "\(SchemeHandler.scheme)://app/")) }
        if want != "scheme", port != 0 { origins.append(("loopback", "http://127.0.0.1:\(port)/")) }
        for flags in flagSets {
            for (origin, base) in origins {
                for c in cases {
                    let name = c.replacingOccurrences(of: "[=&,.?/]", with: "_", options: .regularExpression)
                    queue.append((name, origin, flags, c, URL(string: base + c)!))
                }
            }
        }
        next()
    }

    func next() {
        guard !queue.isEmpty else { finish(); return }
        let item = queue[0]
        let comps = URLComponents(string: item.url.absoluteString)?.queryItems ?? []
        let w = Double(comps.first { $0.name == "w" }?.value ?? "1280") ?? 1280
        let h = Double(comps.first { $0.name == "h" }?.value ?? "720") ?? 720
        // A fresh configuration and web view (so a fresh web content process) per case: preferences are per
        // configuration, and a web view that loaded the scheme keeps its 1 ms timer on loopback (AB-L-0346).
        webView?.navigationDelegate = nil
        let (config, turnedOn) = makeConfig(flags: item.flags)
        let fresh = WKWebView(frame: NSRect(x: 0, y: 0, width: w, height: h), configuration: config)
        fresh.navigationDelegate = self
        fresh.isInspectable = true
        webView = fresh
        window.contentView = fresh
        window.setContentSize(NSSize(width: w, height: h))
        navError = nil
        pendingFlags = turnedOn
        print("[spike] \(item.flags) \(item.origin): \(item.query)")
        fresh.load(URLRequest(url: item.url))
        poll(started: Date())
    }
    var pendingFlags: [[String: Any]] = []

    func poll(started: Date) {
        webView?.evaluateJavaScript("window.READY === true") { [weak self] value, _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                if (value as? Bool) == true { self.collect(timedOut: false); return }
                if self.navError != nil || Date().timeIntervalSince(started) > (Double(self.env["SPIKE_TIMEOUT"] ?? "") ?? 120) { self.collect(timedOut: true); return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.poll(started: started) }
            }
        }
    }

    func collect(timedOut: Bool) {
        let item = queue.removeFirst()
        let js = """
        JSON.stringify({ result: window.__result ?? null, errors: window.__errors ?? [], warnings: window.__warnings ?? [],
          pngs: window.__pngs ?? {}, ua: navigator.userAgent, isolated: self.crossOriginIsolated,
          timerRes: (() => { let min = Infinity, last = performance.now(); for (let i = 0; i < 200000 && min > 0.0005; i++) { const t = performance.now(); if (t !== last) { min = Math.min(min, t - last); last = t; } } return +min.toFixed(4); })() })
        """
        webView?.evaluateJavaScript(js) { [weak self] value, error in
            MainActor.assumeIsolated {
                guard let self else { return }
                var row: [String: Any] = ["case": item.query, "origin": item.origin, "flags": item.flags, "timedOut": timedOut]
                if item.flags != "default" { row["featuresTurnedOn"] = self.pendingFlags }
                if let navError = self.navError { row["navError"] = navError }
                if let error { row["jsError"] = error.localizedDescription }
                if let s = value as? String, let d = s.data(using: .utf8), var obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
                    var written: [String] = []
                    if let pngs = obj.removeValue(forKey: "pngs") as? [String: String] {
                        for (k, png) in pngs {
                            guard let comma = png.firstIndex(of: ","), let bytes = Data(base64Encoded: String(png[png.index(after: comma)...])) else { continue }
                            let file = self.outDir.appendingPathComponent("\(item.name)__\(item.origin)__\(item.flags)__\(k).png")
                            try? bytes.write(to: file)
                            written.append(file.lastPathComponent)
                        }
                    }
                    if !written.isEmpty { row["pngs"] = written.sorted() }
                    for (k, v) in obj { row[k] = v }
                }
                let errs = (row["errors"] as? [Any])?.count ?? -1
                print("  → errors \(errs), warnings \((row["warnings"] as? [Any])?.count ?? -1)\(timedOut ? ", TIMED OUT" : "")")
                self.results.append(row)
                self.next()
            }
        }
    }

    func finish() {
        let label = env["SPIKE_LABEL"] ?? "probe"
        let file = outDir.appendingPathComponent("wkwebview-\(label).json")
        if let data = try? JSONSerialization.data(withJSONObject: results, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: file) }
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
