import AppKit
import WebKit

// The VRMXG playground's Mac wrapper (M0 W8): the playground's web build in a sandboxed WKWebView, served from
// the app bundle over loopback (http://127.0.0.1, the origin with a fine timer: AB-L-0346) or the custom scheme.
//
//   VRMXGPlayground.app/Contents/MacOS/VRMXGPlayground                  loopback (default)
//   PLAYGROUND_ORIGIN=scheme …                                         vrmxg-playground://app/
//   PLAYGROUND_QUERY='scene=cafe.vrmxs' …                              extra query for the page

setvbuf(stdout, nil, _IONBF, 0)

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    let root = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
    lazy var scheme = SchemeHandler(root: root)
    lazy var server = LoopbackServer(root: root)
    let env = ProcessInfo.processInfo.environment

    func applicationDidFinishLaunching(_ note: Notification) {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(scheme, forURLScheme: SchemeHandler.scheme)
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900), configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isInspectable = true
        webView.setAccessibilityIdentifier("playground-web")

        window = NSWindow(contentRect: webView.frame, styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "VRMXG Playground"
        window.contentView = webView
        window.setFrameAutosaveName("VRMXGPlaygroundWindow")
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        buildMenu()

        if env["PLAYGROUND_ORIGIN"] == "scheme" { load(port: 0); return }
        do { try server.start { [weak self] port in self?.load(port: port) } }
        catch { print("[playground] loopback server failed: \(error); using the scheme"); load(port: 0) }
    }

    func load(port: UInt16) {
        let base = port != 0 ? "http://127.0.0.1:\(port)/index.html" : "\(SchemeHandler.scheme)://app/index.html"
        let q = env["PLAYGROUND_QUERY"].map { "?\($0)" } ?? ""
        print("[playground] \(base)\(q)")
        webView.load(URLRequest(url: URL(string: base + q)!))
    }

    func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Quit VRMXG Playground", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        let viewItem = NSMenuItem(); main.addItem(viewItem)
        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r")
        viewItem.submenu = viewMenu
        NSApp.mainMenu = main
    }

    @objc func reload() { webView.reload() }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { print("[playground] navigation failed: \(error)") }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { print("[playground] load failed: \(error)") }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { print("[playground] web content process ended; reloading"); webView.reload() }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
