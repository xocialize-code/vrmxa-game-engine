import AppKit
import AVFoundation
import WebKit

// VRMXG camera spike, Mac side (M3 W5, AB-T-0544): the cinematics harness (spike-cinematics/mac) with the camera.
//   CameraSpike                                  the page's cases in a fresh sandboxed WKWebView per case, over the custom
//                                                scheme and loopback: SPIKE_CASES ('probe;bench&frames=300'), SPIKE_ORIGINS
//   SPIKE_NATIVE=clip                            Vision on Resources/web/clips/clip.mp4, every frame: timings, CPU, features
//   SPIKE_NATIVE=camera SPIKE_SECONDS=20         Vision on the camera, live: latency, CPU, and the feature log (no frames kept)
// The web view grants camera capture to its own two origins only (WKUIDelegate); macOS asks the person once (TCC).
// Output in <app temp dir>: camera-spike.json; the paths are printed.

setvbuf(stdout, nil, _IONBF, 0)

@MainActor
final class Spike: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    let root = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
    lazy var scheme = SchemeHandler(root: root)
    lazy var server = LoopbackServer(root: root)
    let env = ProcessInfo.processInfo.environment
    var queue: [(origin: String, query: String, url: URL)] = []
    var results: [[String: Any]] = []
    var navError: String?
    var loopbackPort: UInt16 = 0
    var camera: NativeCamera?
    let outDir = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)

    func applicationDidFinishLaunching(_ note: Notification) {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 960, height: 640), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "VRMXG Camera Spike"
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if let native = env["SPIKE_NATIVE"] { runNative(native); return }
        do { try server.start { [weak self] port in self?.serverReady(port) } }
        catch { print("[spike] loopback server failed: \(error)"); serverReady(0) }
    }

    // ---------------------------------------------------------------- the native path

    func runNative(_ mode: String) {
        if mode == "clip" {
            let url = root.appendingPathComponent("clips/clip.mp4")
            do {
                let r = try NativeVision().runFile(url, limit: Int(env["SPIKE_FRAMES"] ?? "") ?? 300)
                write(["native": r, "mode": "clip"])
            } catch { write(["native": ["error": error.localizedDescription], "mode": "clip"]) }
            NSApp.terminate(nil)
            return
        }
        // the camera: ask (TCC), then run for SPIKE_SECONDS, keeping the features and latencies only
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async { MainActor.assumeIsolated { self.liveCamera(granted: granted) } }
        }
    }

    func liveCamera(granted: Bool) {
        guard granted else { write(["mode": "camera", "native": ["error": "camera access not granted"]]); NSApp.terminate(nil); return }
        let cam = NativeCamera()
        nonisolated(unsafe) var features: [[String: Any]] = []
        nonisolated(unsafe) var latency: [Double] = []
        let lock = NSLock()
        cam.onFrame = { f, l in lock.lock(); features.append(f); latency.append(l); lock.unlock() }
        let cpu0 = NativeVision.cpuSeconds()
        do { try cam.run() } catch { write(["mode": "camera", "native": ["error": error.localizedDescription]]); NSApp.terminate(nil); return }
        camera = cam
        let seconds = Double(env["SPIKE_SECONDS"] ?? "") ?? 20
        print("[spike] camera on for \(seconds) s")
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) {
            MainActor.assumeIsolated {
                cam.stop()
                let cpu = NativeVision.cpuSeconds() - cpu0
                lock.lock(); let f = features, l = latency; lock.unlock()
                self.write(["mode": "camera", "native": [
                    "frames": f.count, "seconds": seconds, "fps": NativeVision.round4(Double(f.count) / seconds),
                    "latencyMs": NativeVision.stats(l), "ms": ["face": NativeVision.stats(cam.vision.timing.face), "hands": NativeVision.stats(cam.vision.timing.hands)],
                    "cpuSeconds": NativeVision.round4(cpu), "cpuPercent": NativeVision.round4(cpu / seconds * 100),
                    "faceFrames": f.filter { !($0["face"] is NSNull) }.count,
                ], "features": f])
                NSApp.terminate(nil)
            }
        }
    }

    func write(_ obj: [String: Any]) {
        let file = outDir.appendingPathComponent("camera-spike.json")
        if let data = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted, .sortedKeys]) { try? data.write(to: file) }
        print("[spike] wrote \(file.path)")
    }

    // ---------------------------------------------------------------- the page's cases (as spike-cinematics/mac)

    func makeConfig() -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(scheme, forURLScheme: SchemeHandler.scheme)
        config.mediaTypesRequiringUserActionForPlayback = []
        return config
    }

    func serverReady(_ port: UInt16) {
        loopbackPort = port
        print("[spike] loopback server on 127.0.0.1:\(port)")
        let cases = env["SPIKE_CASES"].map { $0.split(separator: ";").map(String.init) } ?? ["probe", "bench&frames=300", "bench&frames=300&delegate=CPU"]
        let want = env["SPIKE_ORIGINS"] ?? "both"
        var origins: [(String, String)] = []
        if want != "loopback" { origins.append(("scheme", "\(SchemeHandler.scheme)://app/index.html")) }
        if want != "scheme", port != 0 { origins.append(("loopback", "http://127.0.0.1:\(port)/index.html")) }
        for (origin, base) in origins { for c in cases { queue.append((origin, c, URL(string: "\(base)?\(c)")!)) } }
        next()
    }

    func next() {
        guard !queue.isEmpty else { write(["mode": "page", "cases": results]); print("[spike] done"); NSApp.terminate(nil); return }
        let item = queue[0]
        webView?.navigationDelegate = nil
        let fresh = WKWebView(frame: NSRect(x: 0, y: 0, width: 960, height: 640), configuration: makeConfig())
        fresh.navigationDelegate = self
        fresh.uiDelegate = self
        fresh.isInspectable = true
        webView = fresh
        window.contentView = fresh
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
                if self.navError != nil || Date().timeIntervalSince(started) > (Double(self.env["SPIKE_TIMEOUT"] ?? "") ?? 300) { self.collect(timedOut: true); return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.poll(started: started) }
            }
        }
    }

    func collect(timedOut: Bool) {
        let item = queue.removeFirst()
        webView.evaluateJavaScript("JSON.stringify({ result: window.__result ?? null, errors: window.__errors ?? [] })") { [weak self] value, error in
            MainActor.assumeIsolated {
                guard let self else { return }
                var row: [String: Any] = ["case": item.query, "origin": item.origin, "timedOut": timedOut]
                if let navError = self.navError { row["navError"] = navError }
                if let error { row["jsError"] = error.localizedDescription }
                if let s = value as? String, let d = s.data(using: .utf8), let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any] { for (k, v) in obj { row[k] = v } }
                print("  → \(String(describing: row["result"]).prefix(300))")
                self.results.append(row)
                self.next()
            }
        }
    }

    /// Camera capture for our own two origins only; anything else is refused.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping @MainActor (WKPermissionDecision) -> Void) {
        let ours = (origin.protocol == SchemeHandler.scheme && origin.host == "app") || (origin.protocol == "http" && origin.host == "127.0.0.1" && origin.port == Int(loopbackPort))
        print("[spike] media capture asked by \(origin.protocol)://\(origin.host):\(origin.port) (\(type == .camera ? "camera" : "other")) → \(ours && type == .camera ? "grant" : "deny")")
        decisionHandler(ours && type == .camera ? .grant : .deny)
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
