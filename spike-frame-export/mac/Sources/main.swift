import AppKit
import CryptoKit
import WebKit

// VRMXG frame-export spike: a thin sandboxed WKWebView wrapper that takes frames out of the page by
// several routes and encodes them with AVAssetWriter.
//
//   FrameExportSpike.app/Contents/MacOS/FrameExportSpike                  preview (scheme origin)
//   SPIKE_PLANS='probe,transfer,transferLoopback@loopback' …              runs each plan in a fresh page load,
//       writes results/<plan>-<origin>.json and videos/ under the sandbox container's tmp folder, quits.
//   A plan may carry a label to run twice: 'determinism#2'.

setvbuf(stdout, nil, _IONBF, 0)

@MainActor
final class Spike: NSObject, NSApplicationDelegate, WKScriptMessageHandlerWithReply, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    let root = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
    let outDir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("vrmxg-frame-export", isDirectory: true)
    lazy var resultsDir = outDir.appendingPathComponent("results", isDirectory: true)
    lazy var videosDir = outDir.appendingPathComponent("videos", isDirectory: true)
    lazy var sink = FrameSink(videosDir: videosDir, audioURL: root.appendingPathComponent("audio/dialogue.wav"))
    lazy var posts = PostRouter(sink: sink, videosDir: videosDir)
    lazy var scheme = SchemeHandler(root: root, posts: posts)
    lazy var server = LoopbackServer(root: root, posts: posts)
    let env = ProcessInfo.processInfo.environment
    var queue: [(plan: String, label: String, origin: String)] = []
    var current: (plan: String, label: String, origin: String)?
    var port: UInt16 = 0

    func applicationDidFinishLaunching(_ note: Notification) {
        try? FileManager.default.createDirectory(at: resultsDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: videosDir, withIntermediateDirectories: true)
        print("[spike] output folder \(outDir.path)")
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(scheme, forURLScheme: SchemeHandler.scheme)
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "native")
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 720), configuration: config)
        webView.navigationDelegate = self
        webView.isInspectable = true

        window = NSWindow(contentRect: webView.frame, styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "VRMXG Frame Export Spike"
        window.contentView = webView
        window.setFrameOrigin(NSPoint(x: 40, y: 40))
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        do { try server.start { [weak self] port in self?.serverReady(port) } }
        catch { print("[spike] loopback server failed: \(error)"); serverReady(0) }
    }

    func url(origin: String, query: String) -> URL {
        let base = origin == "loopback" ? "http://127.0.0.1:\(port)/index.html" : "\(SchemeHandler.scheme)://app/index.html"
        return URL(string: query.isEmpty ? base : "\(base)?\(query)")!
    }

    func serverReady(_ port: UInt16) {
        self.port = port
        print("[spike] loopback server on 127.0.0.1:\(port)")
        if let plans = env["SPIKE_PLANS"] {
            for item in plans.split(separator: ",") {
                let o = item.split(separator: "@")
                let origin = o.count > 1 ? String(o[1]) : "scheme"
                let pl = o[0].split(separator: "#")
                queue.append((String(pl[0]), pl.count > 1 ? String(pl[1]) : "", origin))
            }
            next()
        } else {
            webView.load(URLRequest(url: url(origin: env["SPIKE_ORIGIN"] ?? "scheme", query: env["SPIKE_QUERY"] ?? "")))
        }
    }

    func next() {
        guard !queue.isEmpty else { print("[spike] done"); NSApp.terminate(nil); return }
        current = queue.removeFirst()
        let c = current!
        let extra = env["SPIKE_QUERY"].map { "&\($0)" } ?? ""
        let u = url(origin: c.origin, query: "plan=\(c.plan)\(extra)")
        print("[spike] plan \(c.plan)\(c.label.isEmpty ? "" : "#\(c.label)") @ \(c.origin) → \(u.absoluteString)")
        webView.load(URLRequest(url: u))
    }

    // MARK: the page's control channel (postMessage → Promise of the reply)

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) async -> (Any?, String?) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return (nil, "bad message") }
        do {
            switch cmd {
            case "log":
                print("[page] \(body["text"] ?? "")")
                return (true, nil)
            case "probeTypes":
                var types: [String: String] = [:]
                for (k, v) in body where k != "cmd" {
                    types["postMessage." + k] = "\(type(of: v))"
                    if let d = v as? [String: Any] { types["postMessage." + k + ".value"] = d.keys.sorted().map { "\($0):\(d[$0]!)" }.joined(separator: ",") }
                }
                for (k, js) in [("u8", "return new Uint8Array([1,2,3])"), ("ab", "return new Uint8Array([1,2]).buffer"), ("str", "return 'x'")] {
                    let r = try await webView.callAsyncJavaScript(js, contentWorld: .page)
                    types["callAsyncJavaScript." + k] = r.map { "\(type(of: $0))" } ?? "nil"
                }
                return (["types": types, "encoders": Exporter.encoderList(), "os": ProcessInfo.processInfo.operatingSystemVersionString,
                         "schemeBodyKinds": scheme.bodyKinds], nil)
            case "window":
                let w = body["width"] as? Double ?? 1280, h = body["height"] as? Double ?? 720
                window.setContentSize(NSSize(width: w, height: h))
                window.setFrameOrigin(NSPoint(x: 40, y: 0))
                return (["content": [webView.frame.width, webView.frame.height]], nil)
            case "begin":
                let dpr = body["dpr"] as? Double ?? 1
                lastJob = (Double(body["width"] as? Int ?? 1920) / dpr, Double(body["height"] as? Int ?? 1080) / dpr)
                try await sink.begin(body)
                return (true, nil)
            case "frameB64":
                guard let n = body["n"] as? Int, let s = body["data"] as? String else { return (nil, "frameB64: no data") }
                try await submit(n, .base64(s))
                return (true, nil)
            case "frameBin":
                guard let n = body["n"] as? Int else { return (nil, "frameBin: no n") }
                guard let d = body["data"] as? Data else { return (nil, "frameBin: postMessage delivered \(type(of: body["data"] ?? NSNull())), not Data") }
                try await submit(n, .rgbaBottomUp(d))
                return (true, nil)
            case "snapshot":
                guard let n = body["n"] as? Int else { return (nil, "snapshot: no n") }
                let job = sinkJob
                let cfg = WKSnapshotConfiguration()
                cfg.rect = CGRect(x: 0, y: 0, width: job.w, height: job.h)
                cfg.snapshotWidth = NSNumber(value: job.w)
                cfg.afterScreenUpdates = true
                let image = try await webView.takeSnapshot(configuration: cfg)
                guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return (nil, "snapshot: no CGImage") }
                try await submit(n, .image(cg))
                return (true, nil)
            case "pull":
                let count = body["count"] as? Int ?? 0
                for n in 0..<count {
                    let r = try await webView.callAsyncJavaScript("return window.__vrmxgPull(n)", arguments: ["n": n], contentWorld: .page)
                    if let s = r as? String { try await submit(n, .base64(s)) }
                    else if let d = r as? Data { try await submit(n, .rgbaBottomUp(d)) }
                    else { return (nil, "pull: callAsyncJavaScript returned \(r.map { "\(type(of: $0))" } ?? "nil")") }
                }
                return (true, nil)
            case "end":
                var stats = await sink.end()
                stats["schemeBodyKinds"] = scheme.bodyKinds
                return (stats, nil)
            case "results":
                saveResults(body["data"] ?? NSNull())
                DispatchQueue.main.async { self.next() }
                return (true, nil)
            default:
                return (nil, "unknown command \(cmd)")
            }
        } catch {
            print("[spike] \(cmd) failed: \(error)")
            return (nil, "\(cmd): \(error.localizedDescription)")
        }
    }

    /// The snapshot rect in points (the page sized the canvas to width/dpr × height/dpr CSS px).
    var lastJob: (w: Double, h: Double) = (1920, 1080)
    var sinkJob: (w: Double, h: Double) { lastJob }

    func submit(_ n: Int, _ p: Payload) async throws {
        nonisolated(unsafe) let payload = p
        let err: (any Error)? = await withCheckedContinuation { c in sink.submit(n, payload) { e in c.resume(returning: e) } }
        if let err { throw err }
    }

    func saveResults(_ data: Any) {
        guard let c = current else { return }
        let name = "\(c.plan)\(c.label.isEmpty ? "" : "-\(c.label)")-\(c.origin)"
        if let d = try? JSONSerialization.data(withJSONObject: data, options: [.prettyPrinted, .sortedKeys]) {
            let file = resultsDir.appendingPathComponent("\(name).json")
            try? d.write(to: file)
            print("[spike] wrote \(file.path)")
        } else {
            print("[spike] results for \(name) are not JSON-serialisable")
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("[spike] provisional navigation failed: \(error.localizedDescription)")
        if current != nil { saveResults(["error": error.localizedDescription]); next() }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        print("[spike] web content process terminated")
        if current != nil { saveResults(["error": "web content process terminated"]); next() }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = MainActor.assumeIsolated { Spike() }
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
