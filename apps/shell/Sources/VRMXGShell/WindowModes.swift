import AppKit
import WebKit

/// A menu bar item for an app that lives there (AB-A-0317, shell 0.6.0): an icon with Show / Hide Window, the app's own
/// items (sent to the page as `menu.<event>` events, like the File menu) and Quit.
public struct StatusItemConfiguration {
    /// An SF Symbol name for the menu bar icon; when it doesn't resolve, `title` shows instead.
    public var symbol: String
    public var title: String
    /// The app's own items: (title, event), sent to the page as `menu.<event>`.
    public var items: [(String, String)]
    public init(symbol: String = "person.crop.circle", title: String = "", items: [(String, String)] = []) {
        self.symbol = symbol; self.title = title; self.items = items
    }
}

/// Window methods and modes, on every app (AB-A-0317, shell 0.6.0):
///   window.show → { visible, mode }        window.hide → { visible, mode }
///   window.setMode { mode: "normal" | "floating", size?: [w, h], borderless? } → { visible, mode }
///   window.state → { visible, mode, key }
/// "floating" keeps the window above other apps' windows on every Space, at its own saved frame (360 × 480 the first
/// time, or `size`); `borderless` drops the title bar and the background so only the page draws (move it by dragging
/// its background). "normal" restores the app's usual window and frame. The page gets `window.state` events whenever
/// the window is shown, hidden, minimised, covered or uncovered, so it can drop its frame rate while not visible.
extension ShellAppDelegate: NSWindowDelegate {
    func registerWindowMethods() {
        router.register("window.show") { [unowned self] _ in self.showWindow(); return self.windowState() }
        router.register("window.hide") { [unowned self] _ in self.hideWindow(); return self.windowState() }
        router.register("window.state") { [unowned self] _ in self.windowState() }
        router.register("window.setMode") { [unowned self] p in
            let mode = try p.require("mode")
            guard mode == "normal" || mode == "floating" else { throw BridgeError("bad_params", "mode is \"normal\" or \"floating\"") }
            var size: NSSize?
            if let s = p.raw["size"] as? [NSNumber], s.count == 2 { size = NSSize(width: s[0].doubleValue, height: s[1].doubleValue) }
            self.setMode(mode, size: size, borderless: p.bool("borderless") ?? false)
            return self.windowState()
        }
        window.delegate = self
        let nc = NotificationCenter.default
        for name in [NSWindow.didChangeOcclusionStateNotification, NSWindow.didMiniaturizeNotification, NSWindow.didDeminiaturizeNotification] {
            nc.addObserver(forName: name, object: window, queue: .main) { [weak self] _ in MainActor.assumeIsolated { self?.emitWindowState() } }
        }
        if let item = config.statusItem { installStatusItem(item) }
    }

    var windowVisible: Bool { window.isVisible && !window.isMiniaturized && window.occlusionState.contains(.visible) }

    func windowState() -> [String: Any] { ["visible": windowVisible, "mode": windowMode, "key": window.isKeyWindow] }
    func emitWindowState() { emit("window.state", windowState()) }

    func showWindow() {
        if window.isMiniaturized { window.deminiaturize(nil) }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        emitWindowState()
    }

    func hideWindow() { window.orderOut(nil); emitWindowState() }

    func setMode(_ mode: String, size: NSSize?, borderless: Bool) {
        let normalName = "\(config.scheme)-main", floatingName = "\(config.scheme)-floating"
        window.saveFrame(usingName: windowMode == "floating" ? floatingName : normalName)
        windowMode = mode
        let floating = mode == "floating"
        window.styleMask = floating && borderless ? [.borderless, .resizable] : [.titled, .closable, .resizable, .miniaturizable]
        window.level = floating ? .floating : .normal
        window.collectionBehavior = floating ? [.canJoinAllSpaces, .fullScreenAuxiliary] : []
        let clear = floating && borderless
        window.isOpaque = !clear
        window.backgroundColor = clear ? .clear : .windowBackgroundColor
        window.hasShadow = !clear
        window.isMovableByWindowBackground = clear
        webView.setValue(!clear, forKey: "drawsBackground") // the page's own transparent background shows through
        window.title = config.appName
        let name = floating ? floatingName : normalName
        if let size {
            window.setContentSize(size)
        } else if !window.setFrameUsingName(name) {
            window.setContentSize(floating ? NSSize(width: 360, height: 480) : config.size)
            window.center()
        }
        window.setFrameAutosaveName(name)
        showWindow()
    }

    func installStatusItem(_ c: StatusItemConfiguration) {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let image = NSImage(systemSymbolName: c.symbol, accessibilityDescription: config.appName) { image.isTemplate = true; item.button?.image = image }
        else { item.button?.title = c.title.isEmpty ? config.appName : c.title }
        item.button?.setAccessibilityIdentifier("statusItem")
        let menu = NSMenu()
        let toggle = NSMenuItem(title: "Show Window", action: #selector(statusToggleWindow), keyEquivalent: ""); toggle.target = self
        menu.addItem(toggle)
        if !c.items.isEmpty {
            menu.addItem(.separator())
            for (title, event) in c.items {
                let i = NSMenuItem(title: title, action: #selector(statusAppItem(_:)), keyEquivalent: ""); i.target = self; i.representedObject = event
                menu.addItem(i)
            }
        }
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit \(config.appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        menu.delegate = self
        item.menu = menu
        statusItem = item
    }

    @objc func statusToggleWindow() { windowVisible ? hideWindow() : showWindow() }
    @objc func statusAppItem(_ sender: NSMenuItem) { if let e = sender.representedObject as? String { emit("menu.\(e)") } }

    // closeKeepsRunning: closing hides the window, the app stays (in the menu bar)
    public func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard config.closeKeepsRunning else { return true }
        hideWindow()
        return false
    }

    public func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { showWindow() }
        return true
    }
}

extension ShellAppDelegate: NSMenuDelegate {
    public func menuNeedsUpdate(_ menu: NSMenu) { menu.items.first?.title = windowVisible ? "Hide Window" : "Show Window" }
}
