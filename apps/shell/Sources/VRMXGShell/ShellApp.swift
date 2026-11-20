import AppKit
import WebKit

public let vrmxgShellVersion = "0.6.0"

/// One app's shell: its name, URL scheme, window and any bridge methods of its own.
public struct ShellConfiguration {
    public var appName: String
    /// The custom scheme's name (`<scheme>://app/`), unique per app.
    public var scheme: String
    public var size: NSSize
    /// The web build's folder inside the bundle's Resources.
    public var webFolder: String
    /// App-specific bridge methods, registered after the shell's own.
    public var methods: [(String, BridgeHandler)]
    /// Edit › Undo and Redo go to the page as `menu.undo` / `menu.redo` events (an editor with its own history; the page
    /// hands them on to a focused text field itself) instead of WebKit's undo manager.
    public var pageUndo: Bool
    /// A menu bar item (AB-A-0317; WindowModes.swift). nil: none, as before.
    public var statusItem: StatusItemConfiguration?
    /// Closing the window hides it and the app keeps running (reopen from the status item, the Dock or `window.show`).
    public var closeKeepsRunning: Bool
    /// false: no Dock icon or app menu (an accessory app, like LSUIElement); pair it with a status item.
    public var dockIcon: Bool
    public init(appName: String, scheme: String, size: NSSize = NSSize(width: 1440, height: 900), webFolder: String = "web", methods: [(String, BridgeHandler)] = [], pageUndo: Bool = false,
                statusItem: StatusItemConfiguration? = nil, closeKeepsRunning: Bool = false, dockIcon: Bool = true) {
        self.appName = appName; self.scheme = scheme; self.size = size; self.webFolder = webFolder; self.methods = methods; self.pageUndo = pageUndo
        self.statusItem = statusItem; self.closeKeepsRunning = closeKeepsRunning; self.dockIcon = dockIcon
    }
}

/// The app delegate every VRMXG Mac app runs. Loads the web build over loopback (default: the origin with a fine
/// timer and SharedArrayBuffer, AB-L-0346) or the custom scheme (`VRMXG_ORIGIN=scheme`), with `VRMXG_QUERY` as an
/// extra query; registers the shell's bridge methods; forwards File menu commands to the page as events.
@MainActor
public final class ShellAppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    public let config: ShellConfiguration
    public internal(set) var window: NSWindow!
    public internal(set) var webView: WKWebView!
    public let roots: WebRoots
    public let router = BridgeRouter()
    /// Binary POSTs from the page (frame export), on both origins.
    public let posts = PostRouter()
    lazy var files = FileMethods(roots: roots)
    lazy var exports = ExportMethods(files: files)
    /// Held for the app's life: its bridge handlers capture it unowned (a temporary here crashed the first saves.* call)
    lazy var saves = SaveMethods(appName: config.appName, env: env)
    /// The camera (M3 W5): feature frames to the page as `camera.frame` events
    lazy var camera = CameraMethods(emit: { [unowned self] name, payload in self.emit(name, payload) })
    /// The microphone's permission (M3 W3)
    let microphone = MicrophoneMethods()
    lazy var scheme = SchemeHandler(scheme: config.scheme, roots: roots, posts: posts)
    lazy var server = LoopbackServer(roots: roots, posts: posts)
    let env = ProcessInfo.processInfo.environment
    public private(set) var origin = "loopback"
    /// The window's mode, "normal" or "floating" (WindowModes.swift)
    var windowMode = "normal"
    var statusItem: NSStatusItem?

    public init(config: ShellConfiguration) {
        self.config = config
        self.roots = WebRoots(app: Bundle.main.resourceURL!.appendingPathComponent(config.webFolder, isDirectory: true))
    }

    public func applicationDidFinishLaunching(_ note: Notification) {
        router.register("shell.info") { [unowned self] _ in
            ["shell": vrmxgShellVersion, "app": self.config.appName,
             "appVersion": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "",
             "origin": self.origin, "url": self.webView.url?.absoluteString ?? "", "methods": self.router.methods,
             "scheme": "\(self.config.scheme)://app/"]
        }
        files.register(on: router)
        saves.register(on: router) // save slots (M2 W9)
        camera.register(on: router) // the camera (M3 W5): needs the app's camera entitlement and usage description
        microphone.register(on: router) // the microphone's permission (M3 W3): needs the audio-input entitlement and usage description
        exports.register(on: router, posts: posts)
        for (name, handler) in config.methods { router.register(name, handler) }

        let wk = WKWebViewConfiguration()
        wk.setURLSchemeHandler(scheme, forURLScheme: config.scheme)
        wk.userContentController.addScriptMessageHandler(ShellBridge(router: router), contentWorld: .page, name: ShellBridge.name)
        webView = WKWebView(frame: NSRect(origin: .zero, size: config.size), configuration: wk)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isInspectable = true
        webView.setAccessibilityIdentifier("web")

        window = NSWindow(contentRect: webView.frame, styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
        window.title = config.appName
        window.contentView = webView
        window.setFrameAutosaveName("\(config.scheme)-main")
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.mainMenu = buildMenu()
        NSApp.activate(ignoringOtherApps: true)
        registerWindowMethods() // window.* and, when configured, the status item (AB-A-0317)

        // VRMXG_SHELL_MIC=request asks for the microphone at launch and prints the outcome (the permission check, AB-L-0370)
        if env["VRMXG_SHELL_MIC"] == "request" {
            Task { @MainActor in
                print("[shell] microphone before: \(MicrophoneMethods.status())")
                let r = (try? await MicrophoneMethods.request()) ?? ["error": "no NSMicrophoneUsageDescription"]
                print("[shell] microphone after request: \(r)")
            }
        }

        if env["VRMXG_ORIGIN"] == "scheme" { load(port: 0); return }
        do { try server.start { [weak self] port in self?.load(port: port) } }
        catch { print("[shell] loopback server failed: \(error); using the scheme"); load(port: 0) }
    }

    func load(port: UInt16) {
        origin = port != 0 ? "loopback" : "scheme"
        let base = port != 0 ? "http://127.0.0.1:\(port)/index.html" : "\(config.scheme)://app/index.html"
        let q = env["VRMXG_QUERY"].map { "?\($0)" } ?? ""
        print("[shell] \(config.appName) \(base)\(q)")
        webView.load(URLRequest(url: URL(string: base + q)!))
    }

    /// Send an event to the page.
    public func emit(_ name: String, _ payload: [String: Any] = [:]) { ShellBridge.emit(webView, name, payload) }

    func buildMenu() -> NSMenu {
        let main = NSMenu()
        func menu(_ title: String, _ items: [NSMenuItem]) { let m = NSMenu(title: title); items.forEach(m.addItem); let i = NSMenuItem(); i.submenu = m; main.addItem(i) }
        func item(_ title: String, _ action: Selector?, _ key: String = "", _ mods: NSEvent.ModifierFlags = .command, target: AnyObject? = nil) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key); i.keyEquivalentModifierMask = mods; if let target { i.target = target }; return i
        }
        menu(config.appName, [item("About \(config.appName)", #selector(NSApplication.orderFrontStandardAboutPanel(_:))), .separator(),
                              item("Hide \(config.appName)", #selector(NSApplication.hide(_:)), "h"), .separator(),
                              item("Quit \(config.appName)", #selector(NSApplication.terminate(_:)), "q")])
        menu("File", [item("Open…", #selector(menuOpen), "o", target: self), item("Open Project…", #selector(menuOpenProject), "o", [.command, .shift], target: self), .separator(),
                      item("Save", #selector(menuSave), "s", target: self), item("Save As…", #selector(menuSaveAs), "s", [.command, .shift], target: self), .separator(),
                      item("Close Window", #selector(NSWindow.performClose(_:)), "w")])
        let undo = config.pageUndo ? item("Undo", #selector(menuUndo), "z", target: self) : item("Undo", Selector(("undo:")), "z")
        let redo = config.pageUndo ? item("Redo", #selector(menuRedo), "z", [.command, .shift], target: self) : item("Redo", Selector(("redo:")), "z", [.command, .shift])
        menu("Edit", [undo, redo, .separator(),
                      item("Cut", #selector(NSText.cut(_:)), "x"), item("Copy", #selector(NSText.copy(_:)), "c"), item("Paste", #selector(NSText.paste(_:)), "v"),
                      item("Select All", #selector(NSText.selectAll(_:)), "a")])
        menu("View", [item("Reload", #selector(reload), "r", target: self)])
        menu("Window", [item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m")])
        return main
    }

    @objc func menuOpen() { emit("menu.open") }
    @objc func menuOpenProject() { emit("menu.openProject") }
    @objc func menuSave() { emit("menu.save") }
    @objc func menuSaveAs() { emit("menu.saveAs") }
    @objc func menuUndo() { emit("menu.undo") }
    @objc func menuRedo() { emit("menu.redo") }
    @objc func reload() { webView.reload() }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { print("[shell] load failed: \(error)") }
    public func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { print("[shell] web content process ended; reloading"); webView.reload() }

    // <input type=file> in the page
    public func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        completionHandler(panel.runModal() == .OK ? panel.urls : nil)
    }

    // getUserMedia in the page: our own origins get the devices the app declares (macOS still asks the person once)
    public func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping @MainActor (WKPermissionDecision) -> Void) {
        decisionHandler(MicrophoneMethods.mediaDecision(host: origin.host, scheme: origin.protocol, appScheme: config.scheme, type: type))
    }

    public func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { !config.closeKeepsRunning }
}

public enum ShellApp {
    /// Run an app on the shell (call from `main.swift`; never returns).
    @MainActor public static func run(_ config: ShellConfiguration) -> Never {
        setvbuf(stdout, nil, _IONBF, 0)
        let app = NSApplication.shared
        let delegate = ShellAppDelegate(config: config)
        app.delegate = delegate
        app.setActivationPolicy(config.dockIcon ? .regular : .accessory)
        withExtendedLifetime(delegate) { app.run() }
        exit(0)
    }
}
