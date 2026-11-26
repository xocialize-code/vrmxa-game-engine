import AppKit

/// Help › Third-Party Notices (shell 0.15.0, M6 W7, AB-T-0624): every VRMXG app's web build carries
/// `THIRD-PARTY-LICENCES.txt` (the licence texts and notices of the packages its bundle includes; `@vrmxg/bundle/notices`),
/// and the shell shows it in a window of its own, read-only, drawn natively so it opens even when the page doesn't. The
/// item is there whenever the app's web folder holds the file (`ShellConfiguration.noticesFile`), in the app's Help
/// menu or in one made for it.
extension ShellAppDelegate {
    /// The notices file in the app's web content, if it is there.
    var noticesURL: URL? {
        if let noticesOverride { return FileManager.default.fileExists(atPath: noticesOverride.path) ? noticesOverride : nil }
        guard let name = config.noticesFile else { return nil }
        let url = roots.app.appendingPathComponent(name)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    static let noticesTitle = "Third-Party Notices"

    @objc func menuNotices() { showNotices() }

    /// Open (or bring forward) the notices window. Returns false when there is no notices file to show.
    @discardableResult
    public func showNotices() -> Bool {
        if let w = noticesWindow { w.makeKeyAndOrderFront(nil); return true }
        guard let url = noticesURL, let text = try? String(contentsOf: url, encoding: .utf8) else { return false }
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 720, height: 640), styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
        w.title = "\(config.appName): \(Self.noticesTitle)"
        w.isReleasedWhenClosed = false
        w.setAccessibilityIdentifier("shell-notices")
        let scroll = NSTextView.scrollableTextView()
        scroll.hasVerticalScroller = true
        let view = scroll.documentView as! NSTextView
        view.isEditable = false
        view.isSelectable = true
        view.isRichText = false
        view.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        view.textContainerInset = NSSize(width: 12, height: 12)
        view.string = text
        view.setAccessibilityIdentifier("shell-notices-text")
        view.setAccessibilityLabel(Self.noticesTitle)
        w.contentView = scroll
        w.center()
        noticesWindow = w
        w.makeKeyAndOrderFront(nil)
        return true
    }
}
