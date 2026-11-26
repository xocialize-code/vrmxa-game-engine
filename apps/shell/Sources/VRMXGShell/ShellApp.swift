import AppKit
import WebKit

public let vrmxgShellVersion = "0.15.0"

/// An app's own menu item (shell 0.7.0, M4 W5): choosing it sends the page `menu.<event>`. A title of "-" is a separator.
public struct ShellMenuItem: Sendable {
    public var title: String
    public var event: String
    public var key: String
    public var modifiers: NSEvent.ModifierFlags
    public init(_ title: String, event: String, key: String = "", modifiers: NSEvent.ModifierFlags = .command) {
        self.title = title; self.event = event; self.key = key; self.modifiers = modifiers
    }
    public static let separator = ShellMenuItem("-", event: "")
}

/// An app's own menu, placed between View and Window.
public struct ShellMenu: Sendable {
    public var title: String
    public var items: [ShellMenuItem]
    public init(_ title: String, _ items: [ShellMenuItem]) { self.title = title; self.items = items }
}

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
    /// Runs once the shell's own methods are registered, before the page loads: an optional product (the voice methods,
    /// apps/shell/Voice) registers its methods on `router` and keeps itself in `keepAlive`.
    public var setUp: (@MainActor (ShellAppDelegate) -> Void)?
    /// Items of the app's own in the File menu, after Open Project… (shell 0.7.0).
    public var fileItems: [ShellMenuItem]
    /// Items of the app's own at the end of the Edit menu, after Select All (shell 0.12.0, M5 W5: the editor's Duplicate).
    public var editItems: [ShellMenuItem]
    /// Menus of the app's own, between View and Window (shell 0.7.0).
    public var menus: [ShellMenu]
    /// Items of the app's own in a Help menu after Window (shell 0.13.0, M5 W6: the editor's Keyboard Shortcuts). Empty
    /// (the default): no Help menu, as before.
    public var helpItems: [ShellMenuItem]
    /// File extensions the app opens from the Finder (Open Documents, shell 0.7.0): each becomes a `file.opened` event.
    /// Empty (the default): the shell doesn't take Open Documents at all, and AppKit answers as it would without it.
    public var openTypes: [String]
    /// The page is asked before the window closes or the app quits (shell 0.9.0, AB-T-0593; CloseQuestion.swift): it
    /// hears `window.closing` and answers `window.closeReply`, so it can show its unsaved-changes sheet. false (the
    /// default): the shell closes and quits without consulting the page, as before.
    public var asksBeforeClosing: Bool
    /// Seconds the page has to answer `window.closing` before the shell closes anyway (a hung page can't block quitting).
    public var closeTimeout: TimeInterval
    /// File › Open Recent after Open Project… (shell 0.14.0, M6 W3; ProjectFolders.swift): the projects opened lately,
    /// each sending the page `menu.openRecent { path }`. false (the default): no such item, as before.
    public var recentProjects: Bool
    /// `project.watch` / `project.unwatch` and the `project.changed` event (shell 0.15.0, M6 W2; ProjectWatcher.swift): the
    /// editor's hot reload of a project's behaviours while it plays. false (the default): the methods don't exist, so no
    /// other app, a game build least of all, can watch anything.
    public var watchesProject: Bool
    public init(appName: String, scheme: String, size: NSSize = NSSize(width: 1440, height: 900), webFolder: String = "web", methods: [(String, BridgeHandler)] = [], pageUndo: Bool = false,
                statusItem: StatusItemConfiguration? = nil, closeKeepsRunning: Bool = false, dockIcon: Bool = true, setUp: (@MainActor (ShellAppDelegate) -> Void)? = nil,
                fileItems: [ShellMenuItem] = [], editItems: [ShellMenuItem] = [], menus: [ShellMenu] = [], openTypes: [String] = [],
                asksBeforeClosing: Bool = false, closeTimeout: TimeInterval = 5, helpItems: [ShellMenuItem] = [], recentProjects: Bool = false,
                watchesProject: Bool = false) {
        self.appName = appName; self.scheme = scheme; self.size = size; self.webFolder = webFolder; self.methods = methods; self.pageUndo = pageUndo
        self.statusItem = statusItem; self.closeKeepsRunning = closeKeepsRunning; self.dockIcon = dockIcon; self.setUp = setUp
        self.fileItems = fileItems; self.editItems = editItems; self.menus = menus; self.openTypes = openTypes.map { $0.lowercased() }
        self.asksBeforeClosing = asksBeforeClosing; self.closeTimeout = closeTimeout; self.helpItems = helpItems
        self.recentProjects = recentProjects; self.watchesProject = watchesProject
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
    /// The app's settings document (shell 0.11.0, M5 W1); held for the app's life like the saves
    lazy var settings = SettingsMethods(appName: config.appName, env: env)
    /// The page's cache in the sandbox (shell 0.13.0, M5 W6: the editor's thumbnails); held for the app's life like the saves
    lazy var cache = CacheMethods(appName: config.appName, env: env)
    /// The project watch (shell 0.15.0, M6 W2), for an app with `watchesProject`; held for the app's life like the saves
    lazy var watches = WatchMethods(files: files, emit: { [unowned self] name, payload in self.emit(name, payload) })
    /// The Help menu buildMenu made, if the app has one (NSApp.helpMenu: the system adds its search field there)
    var helpMenu: NSMenu?
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
    /// Objects an app's setUp registered handlers on, held for the app's life (their handlers capture them unowned, AB-L-0363).
    public var keepAlive: [AnyObject] = []
    /// Files from Open Documents events (the Finder, `open`, AppProbe's open step) waiting for the page to load (shell 0.7.0).
    var pendingOpens: [URL] = []
    var pageLoaded = false
    /// The question to the page before a close or a quit (shell 0.9.0), for an app with `asksBeforeClosing`.
    lazy var closing = makeCloseQuestion()
    /// The page said to go on closing: the quit that follows the last window isn't asked again.
    var closeApproved = false
    /// Answers a quit that waited for the page (`.terminateLater`); a test replaces it.
    var replyToTerminate: (Bool) -> Void = { NSApp.reply(toApplicationShouldTerminate: $0) }
    /// Asks the person in the shell's own alert (CloseQuestion.swift: a page that isn't answering, a question asked
    /// again); a test replaces it.
    lazy var confirmStuck: (CloseQuestion.Stuck, CloseQuestion.Reason, @escaping @MainActor (Bool) -> Void) -> Void = { [unowned self] why, reason, done in
        self.presentStuckAlert(why, reason, done)
    }
    /// The shell's alert while it is up.
    var closeAlert: NSAlert?

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
        settings.register(on: router) // the app's settings (shell 0.11.0, M5 W1)
        cache.register(on: router) // the page's cache (shell 0.13.0, M5 W6)
        if config.watchesProject { watches.register(on: router) } // the project watch (shell 0.15.0, M6 W2): the editor only
        // The page quits the app (shell 0.11.0, M5 W1: a game's title menu has Quit). It is the menu's Quit: an app that
        // asks its page before quitting still asks, so the page answers its own question (it asked to go)
        router.register("app.quit") { [unowned self] _ in
            DispatchQueue.main.async { self.menuQuit(nil) }
            return ["quitting": true]
        }
        camera.register(on: router) // the camera (M3 W5): needs the app's camera entitlement and usage description
        microphone.register(on: router) // the microphone's permission (M3 W3): needs the audio-input entitlement and usage description
        exports.register(on: router, posts: posts)
        for (name, handler) in config.methods { router.register(name, handler) }
        config.setUp?(self)

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
        if let helpMenu { NSApp.helpMenu = helpMenu }
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
                              item("Quit \(config.appName)", #selector(menuQuit(_:)), "q", target: self)])
        func own(_ i: ShellMenuItem) -> NSMenuItem {
            if i.title == "-" { return .separator() }
            let m = item(i.title, #selector(menuOwn(_:)), i.key, i.modifiers, target: self); m.representedObject = i.event; return m
        }
        let fileOwn = config.fileItems.isEmpty ? [] : config.fileItems.map(own) + [.separator()]
        let recent = config.recentProjects ? [recentMenuItem()] : []
        menu("File", [item("Open…", #selector(menuOpen), "o", target: self), item("Open Project…", #selector(menuOpenProject), "o", [.command, .shift], target: self)] + recent + [.separator()] + fileOwn +
                     [item("Save", #selector(menuSave), "s", target: self), item("Save As…", #selector(menuSaveAs), "s", [.command, .shift], target: self), .separator(),
                      item("Close Window", #selector(NSWindow.performClose(_:)), "w")])
        let undo = config.pageUndo ? item("Undo", #selector(menuUndo), "z", target: self) : item("Undo", Selector(("undo:")), "z")
        let redo = config.pageUndo ? item("Redo", #selector(menuRedo), "z", [.command, .shift], target: self) : item("Redo", Selector(("redo:")), "z", [.command, .shift])
        menu("Edit", [undo, redo, .separator(),
                      item("Cut", #selector(NSText.cut(_:)), "x"), item("Copy", #selector(NSText.copy(_:)), "c"), item("Paste", #selector(NSText.paste(_:)), "v"),
                      item("Select All", #selector(NSText.selectAll(_:)), "a")] + (config.editItems.isEmpty ? [] : [.separator()] + config.editItems.map(own)))
        menu("View", [item("Reload", #selector(reload), "r", target: self)])
        for m in config.menus { menu(m.title, m.items.map(own)) }
        menu("Window", [item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m")])
        if !config.helpItems.isEmpty {
            menu("Help", config.helpItems.map(own))
            helpMenu = main.items.last?.submenu
        }
        return main
    }

    @objc func menuOpen() { emit("menu.open") }
    @objc func menuOpenProject() { emit("menu.openProject") }
    @objc func menuSave() { emit("menu.save") }
    @objc func menuSaveAs() { emit("menu.saveAs") }
    @objc func menuUndo() { emit("menu.undo") }
    @objc func menuRedo() { emit("menu.redo") }
    @objc func reload() { webView.reload() }
    /// An app's own menu item: the page hears `menu.<event>`.
    @objc func menuOwn(_ sender: NSMenuItem) { if let e = sender.representedObject as? String { emit("menu.\(e)") } }

    /// Open Documents (shell 0.7.0), for an app that names `openTypes`: each file of those types is served as
    /// `file.open { serve: true }` serves one, and the page hears `file.opened` with `{ path, name, size, url }`. Files
    /// that arrive before the page has loaded (at launch, during a reload) wait for it. Other files are refused, never
    /// granted.
    public func application(_ sender: NSApplication, open urls: [URL]) {
        let accepted = acceptedOpens(urls)
        if accepted.count < urls.count { print("[shell] not opened (not one of \(config.openTypes)): \(urls.filter { !accepted.contains($0) }.map(\.lastPathComponent))") }
        guard pageLoaded else { pendingOpens += accepted; return }
        for u in accepted { emitOpened(u) }
    }

    /// The files of an Open Documents event the app takes, by extension.
    func acceptedOpens(_ urls: [URL]) -> [URL] { urls.filter { config.openTypes.contains($0.pathExtension.lowercased()) } }

    /// An app without `openTypes` doesn't answer Open Documents: AppKit then handles them as for any app without a
    /// document controller (it says it can't open them), and nothing is granted.
    public override func responds(to aSelector: Selector!) -> Bool {
        if aSelector == #selector(NSApplicationDelegate.application(_:open:)) { return !config.openTypes.isEmpty }
        return super.responds(to: aSelector)
    }

    /// A navigation started (a reload, a crash-reload): files opened until it finishes wait for the new page.
    public func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { pageLoaded = false; pageGone() }

    /// The page reloads or its process ended: a close or quit that was waiting for its answer goes on.
    func pageGone() {
        if config.watchesProject { watches.stop() } // a new page watches what it asks for (shell 0.15.0): nothing of the last one's
        guard config.asksBeforeClosing else { return }
        closing.pageGone()
        closing.unsaved = false // a new page has nothing unsaved until it says so
        window?.isDocumentEdited = false
    }

    func emitOpened(_ url: URL) {
        do { emit("file.opened", try files.opened(url)) }
        catch { print("[shell] couldn't open \(url.lastPathComponent): \(error)") }
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageLoaded = true
        let waiting = pendingOpens; pendingOpens = []
        for u in waiting { emitOpened(u) }
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { print("[shell] load failed: \(error)") }
    public func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { print("[shell] web content process ended; reloading"); pageLoaded = false; pageGone(); webView.reload() }

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

    /// Quit (the menu, ⌘Q, the Dock, log out). An app that asks its page (`asksBeforeClosing`) answers later, when the
    /// page has: CloseQuestion.swift. Any other app quits at once, as before.
    public func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard asksPage else { return .terminateNow }
        if !window.isVisible || window.isMiniaturized { showWindow() } // the page's sheet has to be seen
        // With a question open already: asked again (CloseQuestion.swift). A quit that is waiting stays the one quit.
        // Over a close whose question is up in the page (or in the shell's own alert) this quit is dropped: the
        // alert's Close Anyway closes the window, and the app with it.
        let open = closing.pending, alertUp = closing.confirming != nil
        closing.ask(.quit)
        if let open, open.reason == .close, open.waiting || alertUp { return .terminateCancel }
        return .terminateLater
    }
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
