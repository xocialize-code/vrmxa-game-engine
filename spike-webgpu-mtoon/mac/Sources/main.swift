import AppKit
import WebKit

// VRMXG WebGPU MToon spike, WKWebView pass (AB-T-0553). The wrapper is spike-physics/mac (scheme handler,
// loopback server, sandbox); this driver follows spike-cinematics: one case per fresh WKWebView, through the
// custom scheme (the shipping origin) and through loopback. For each case it waits for window.READY, then
// saves window.__result, the page's errors and warnings, and window.__png (the canvas, captured by the page
// in the same task as its last render: a WebGPU canvas can't be read back later).
//
//   WebGPUMToonSpike.app/Contents/MacOS/WebGPUMToonSpike           all default cases, both origins
//   SPIKE_CASES='renderer=webgpu&model=mira;renderer=webgl&model=mira'   only these (';'-separated)
//   SPIKE_ORIGINS='loopback'                                       scheme, loopback or both (default)
//   SPIKE_TIMEOUT=300                                              seconds a case may take (120)
// Output: <app temp dir>/wkwebview.json and <name>__<origin>.png; mac/scripts/run.sh copies them out.

setvbuf(stdout, nil, _IONBF, 0)

let defaultCases: [String] = {
    var c: [String] = []
    for r in ["webgl", "webgpu", "webgpu-gl", "webgpu&lib=loadonly"] { c.append("renderer=\(r)&model=spheres&features=none&w=768&h=512") }
    for r in ["webgl", "webgpu"] { c.append("renderer=\(r)&model=spheres2&features=none&w=768&h=400"); c.append("renderer=\(r)&model=threealpha&features=none&w=400&h=400") }
    for model in ["mira", "hana"] {
        for view in ["body", "face", "back"] {
            for features in ["all", "none"] {
                for r in ["webgl", "webgpu"] { c.append("renderer=\(r)&model=\(model)&view=\(view)&features=\(features)") }
            }
        }
    }
    for r in ["webgl", "webgpu", "webgpu&lib=loadonly"] { c.append("renderer=\(r)&model=vroid10&view=body&features=all") }
    c.append("renderer=webgpu&model=mira&view=face&features=all&lib=loadonly")
    c.append("renderer=webgpu&lib=stock&model=mira&view=body&features=all")
    return c
}()

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
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 512, height: 768), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "VRMXG WebGPU MToon Spike"
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
                let name = c.replacingOccurrences(of: "renderer=|model=|view=|lib=", with: "", options: .regularExpression)
                    .replacingOccurrences(of: "features=", with: "f")
                    .replacingOccurrences(of: "[=&,./]", with: "_", options: .regularExpression)
                queue.append((name, origin, c, URL(string: "\(base)?\(c)")!))
            }
        }
        next()
    }

    func next() {
        guard !queue.isEmpty else { finish(); return }
        let item = queue[0]
        let comps = URLComponents(string: "x:?" + item.query)?.queryItems ?? []
        let w = Double(comps.first { $0.name == "w" }?.value ?? "512") ?? 512
        let h = Double(comps.first { $0.name == "h" }?.value ?? "768") ?? 768
        // A fresh web view (and web content process) per case: one that has loaded the custom scheme keeps
        // its 1 ms timer after navigating to loopback (AB-L-0346).
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
                if self.navError != nil || Date().timeIntervalSince(started) > (Double(self.env["SPIKE_TIMEOUT"] ?? "") ?? 120) { self.collect(timedOut: true); return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.poll(started: started) }
            }
        }
    }

    func collect(timedOut: Bool) {
        let item = queue.removeFirst()
        let js = """
        JSON.stringify({ result: window.__result ?? null, png: window.__png ?? null, ua: navigator.userAgent,
          hasGpu: !!navigator.gpu, secure: self.isSecureContext })
        """
        webView.evaluateJavaScript(js) { [weak self] value, error in
            MainActor.assumeIsolated {
                guard let self else { return }
                var row: [String: Any] = ["name": item.name, "case": item.query, "origin": item.origin, "timedOut": timedOut]
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
                print("  → \(r?["stage"] ?? "-") \(r?["backend"] ?? "-") r\(r?["revision"] ?? "?") calls \(r?["drawCalls"] ?? "-") errors \(r?["errorCount"] ?? "-") warnings \(r?["warningCount"] ?? "-")\(r?["importError"].map { " — \($0)" } ?? "")\(timedOut ? ", TIMED OUT" : "")")
                self.results.append(row)
                self.next()
            }
        }
    }

    func finish() {
        let file = outDir.appendingPathComponent("wkwebview.json")
        let doc: [String: Any] = ["date": ISO8601DateFormatter().string(from: Date()), "os": ProcessInfo.processInfo.operatingSystemVersionString, "rows": results]
        if let data = try? JSONSerialization.data(withJSONObject: doc, options: [.prettyPrinted, .sortedKeys]) {
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
