import AppKit
import Foundation

/// Project folders (shell 0.14.0, M6 W3, AB-T-0646): a new project made in a folder the person names, from files the
/// page lists (a template the app ships in its web content, or text it wrote), and the projects opened lately.
///
///   project.create { title?, name?, files: [{ to, from } | { to, text } | { to, base64 }] }
///     → what project.open answers, plus `created: true`
///   project.recent → { projects: [{ path, name, exists }] }      newest first, at most `recentCap`
///   project.reopen { path } → what project.open answers          a recent project, with no panel (its bookmark)
///   project.forget { path } | { all: true } → { projects }       drop one recent project, or all of them
///
/// `project.create` asks for the new folder with a save panel (`name`: the name it suggests), or takes
/// `VRMXG_SHELL_NEW_PROJECT` (a folder; ending in `/`, a folder to make `name` in; `VRMXG_SHELL_PANEL_DIR`, an absolute
/// path, is only where the panel starts). The folder must not exist yet, or be
/// empty but for hidden files: a project is never made over anything. Each `from` is a file of the app's own web
/// content (`templates/level/level.vrmxs`, the sample's `sets/cafe.glb`), refused when it leads outside it; each `to`
/// is a plain path inside the project (no `..`, no hidden or empty segment, no backslash or colon). Every entry is
/// checked before anything is written, and a copy that fails part way removes what it made, so the folder is either a
/// whole project or as it was. The new folder is mounted at `/project/` as `project.open` mounts one.
///
/// Recent projects are kept as security-scoped bookmarks in the app's defaults (`vrmxg.shell.recentProjects`), so a
/// sandboxed app reopens them on a later launch with no panel; `project.open`, `project.create` and `project.reopen`
/// each put their folder first. An app that sets `recentProjects` has File › Open Recent, built from the same list each
/// time it opens: choosing one sends the page `menu.openRecent { path }`, and Clear Menu forgets them all. Remembering
/// needs `com.apple.security.files.bookmarks.app-scope`.
extension FileMethods {
    static let recentKey = "vrmxg.shell.recentProjects"
    /// The most recent projects kept.
    static var recentCap = 10
    /// The most files `project.create` takes in one call.
    static var createCap = 20_000

    func registerProjectFolders(on router: BridgeRouter) {
        router.register("project.create") { [unowned self] p in try await self.createProject(p) }
        router.register("project.recent") { [unowned self] _ in ["projects": self.recentProjects()] }
        router.register("project.reopen") { [unowned self] p in try self.reopenProject(p) }
        router.register("project.forget") { [unowned self] p in
            if p.bool("all") == true { self.defaults.removeObject(forKey: Self.recentKey) } else { self.forgetRecent(try p.require("path")) }
            return ["projects": self.recentProjects()]
        }
    }

    /// A path inside a project, as `project.create` takes one: relative, `/`-separated, nothing hidden, empty or upward.
    static func plainPath(_ rel: String) -> Bool {
        guard !rel.isEmpty, !rel.hasPrefix("/"), !rel.contains("\\"), !rel.contains(":"), rel.unicodeScalars.allSatisfy({ $0.value >= 0x20 && $0.value != 0x7f }) else { return false }
        return rel.split(separator: "/", omittingEmptySubsequences: false).allSatisfy { !$0.isEmpty && !$0.hasPrefix(".") }
    }

    /// One file to write into a new project: copied from the web content, or bytes the page sent.
    enum NewFile { case copy(URL), bytes(Data) }

    /// The entries of `project.create`, every one checked before anything is touched.
    func newProjectFiles(_ p: BridgeParams) throws -> [(String, NewFile)] {
        guard let list = p.raw["files"] as? [[String: Any]] else { throw BridgeError("bad_params", "project.create needs files: [{ to, from | text | base64 }]") }
        guard list.count <= Self.createCap else { throw BridgeError("bad_params", "at most \(Self.createCap) files a project") }
        var out: [(String, NewFile)] = [], seen = Set<String>()
        let web = roots.app.standardizedFileURL.path + "/"
        for entry in list {
            let e = BridgeParams(entry)
            guard let to = e.string("to"), Self.plainPath(to) else { throw BridgeError("bad_params", "\"to\" is a plain path inside the project (\(entry["to"] ?? "missing"))") }
            guard seen.insert(to.lowercased()).inserted else { throw BridgeError("bad_params", "\(to) is listed twice") }
            if let from = e.string("from") {
                guard Self.plainPath(from) else { throw BridgeError("bad_params", "\"from\" is a file of the app's web content (\(from))") }
                let file = roots.app.appendingPathComponent(from).standardizedFileURL
                var isDir: ObjCBool = false
                guard file.path.hasPrefix(web) else { throw BridgeError("bad_params", "\(from) is outside the app's web content") }
                guard FileManager.default.fileExists(atPath: file.path, isDirectory: &isDir), !isDir.boolValue else { throw BridgeError("bad_params", "the app has no file \(from)") }
                out.append((to, .copy(file)))
            } else if e.string("text") != nil || e.string("base64") != nil {
                out.append((to, .bytes(try Self.payload(e))))
            } else {
                throw BridgeError("bad_params", "\(to) needs from, text or base64")
            }
        }
        return out
    }

    /// The folder `project.create` makes the project in: the automation hook, or a save panel.
    func newProjectFolder(_ p: BridgeParams) throws -> URL {
        let name = p.string("name") ?? "New Game"
        guard Self.plainPath(name), !name.contains("/") else { throw BridgeError("bad_params", "a project's name is a folder name (\"\(name)\")") }
        guard name.utf8.count <= 255 else { throw BridgeError("bad_params", "a folder's name is at most 255 bytes (\(name.utf8.count))") }
        if let hook = hook("VRMXG_SHELL_NEW_PROJECT") {
            return env["VRMXG_SHELL_NEW_PROJECT"]!.hasSuffix("/") ? hook.appendingPathComponent(name) : hook
        }
        let panel = NSSavePanel()
        // where the panel starts (a hand test's folder outside the container; the person still presses Create)
        if let start = env["VRMXG_SHELL_PANEL_DIR"], start.hasPrefix("/") { panel.directoryURL = URL(fileURLWithPath: start, isDirectory: true) }
        panel.title = p.string("title") ?? "New Project"
        panel.message = "Name the new project's folder and choose where it goes."
        panel.prompt = "Create"
        panel.nameFieldLabel = "Project:"
        panel.nameFieldStringValue = name
        panel.canCreateDirectories = true
        guard panel.runModal() == .OK, let u = panel.url else { throw BridgeError("cancelled", "no project was made") }
        return u
    }

    func createProject(_ p: BridgeParams) async throws -> Any? {
        let files = try newProjectFiles(p)
        guard !files.isEmpty else { throw BridgeError("bad_params", "a project needs at least one file") }
        let folder = try newProjectFolder(p).standardizedFileURL
        let fm = FileManager.default
        var isDir: ObjCBool = false
        let existed = fm.fileExists(atPath: folder.path, isDirectory: &isDir)
        if existed {
            guard isDir.boolValue else { throw BridgeError("exists", "\(folder.lastPathComponent) is a file: a project is a folder") }
            let inside = (try? fm.contentsOfDirectory(atPath: folder.path)) ?? []
            guard inside.allSatisfy({ $0.hasPrefix(".") }) else { throw BridgeError("exists", "\(folder.lastPathComponent) isn't empty: a new project goes in a new or empty folder") }
        }
        var made: [URL] = [] // what this call made, removed again if it fails part way
        do {
            if !existed { try fm.createDirectory(at: folder, withIntermediateDirectories: true); made.append(folder) }
            for (rel, source) in files {
                let dest = folder.appendingPathComponent(rel).standardizedFileURL
                guard dest.path.hasPrefix(folder.path + "/") else { throw BridgeError("bad_params", "\(rel) is outside the project") }
                var dir = dest.deletingLastPathComponent(), missing: [URL] = []
                while dir.path.count > folder.path.count, !fm.fileExists(atPath: dir.path) { missing.insert(dir, at: 0); dir = dir.deletingLastPathComponent() }
                if let first = missing.first { try fm.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true); if existed { made.append(first) } }
                switch source {
                case .copy(let from): try fm.copyItem(at: from, to: dest)
                case .bytes(let data): try data.write(to: dest, options: .withoutOverwriting)
                }
                if existed && missing.isEmpty { made.append(dest) }
            }
        } catch {
            for u in made.reversed() { try? fm.removeItem(at: u) }
            if let e = error as? BridgeError { throw e }
            throw BridgeError("failed", "the project couldn't be made in \(folder.lastPathComponent): \(error.localizedDescription)")
        }
        var out = try mountFolder(folder)
        out["created"] = true
        return out
    }

    /// Mount a folder at /project/, grant it, put it first among the recent projects; → what project.open answers.
    func mountFolder(_ folder: URL) throws -> [String: Any] {
        granted.insert(folder)
        roots.mountProject(folder)
        noteRecent(folder)
        let listing = try projectListing()
        return ["path": folder.path, "name": folder.lastPathComponent, "base": WebRoots.projectPrefix, "files": listing.files, "truncated": listing.truncated]
    }

    // ---------------------------------------------------------------- recent projects

    private func recentEntries() -> [[String: Any]] { defaults.array(forKey: Self.recentKey) as? [[String: Any]] ?? [] }

    /// Put a folder first among the recent projects (a bookmark, security-scoped where there is a sandbox).
    func noteRecent(_ folder: URL) {
        let path = folder.standardizedFileURL.path
        var data = try? folder.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil)
        if data == nil {
            // no sandbox (tests), or no app-scope bookmarks entitlement: a plain bookmark, which a sandboxed app can't
            // use after a relaunch for a folder outside its container; said, so a hand test can tell
            data = try? folder.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
            if data != nil, ProcessInfo.processInfo.environment["APP_SANDBOX_CONTAINER_ID"] != nil { print("[shell] recent project kept without a security scope: \(folder.lastPathComponent)") }
        }
        guard let data else { return }
        let rest = recentEntries().filter { ($0["path"] as? String) != path }
        defaults.set(Array(([["path": path, "bookmark": data]] + rest).prefix(Self.recentCap)), forKey: Self.recentKey)
    }

    func forgetRecent(_ path: String) {
        let p = URL(fileURLWithPath: path).standardizedFileURL.path
        defaults.set(recentEntries().filter { ($0["path"] as? String) != p }, forKey: Self.recentKey)
    }

    /// Where a recent project's bookmark leads now, and whether a folder is there. The check runs inside the
    /// bookmark's security scope (started and stopped here unless the app already holds it): under the App Sandbox a
    /// folder outside the container can't even be seen after a relaunch without it (review of PR #52). A folder in a
    /// Trash counts as gone, though its bookmark still finds it.
    func locate(_ entry: [String: Any]) -> (url: URL?, exists: Bool) {
        guard let data = entry["bookmark"] as? Data else { return (nil, false) }
        var stale = false
        let resolved = (try? URL(resolvingBookmarkData: data, options: .withSecurityScope, relativeTo: nil, bookmarkDataIsStale: &stale))
            ?? (try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale))
        guard let folder = resolved?.standardizedFileURL else { return (nil, false) }
        let started = !scoped.contains(folder) && folder.startAccessingSecurityScopedResource()
        defer { if started { folder.stopAccessingSecurityScopedResource() } }
        var isDir: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: folder.path, isDirectory: &isDir) && isDir.boolValue && !folder.pathComponents.contains(".Trash")
        return (folder, exists)
    }

    /// The recent projects, newest first: `path` is the one the list keeps (what `project.reopen` takes); `name` and
    /// `location` are where the folder is now, followed through its bookmark when it has moved; `exists` is false for one
    /// that has gone (the menu shows it disabled).
    func recentProjects() -> [[String: Any]] {
        recentEntries().compactMap { e in
            guard let path = e["path"] as? String else { return nil }
            let at = locate(e)
            let now = at.url?.path ?? path
            return ["path": path, "name": URL(fileURLWithPath: now).lastPathComponent, "location": now, "exists": at.exists]
        }
    }

    func reopenProject(_ p: BridgeParams) throws -> Any? {
        let path = URL(fileURLWithPath: try p.require("path")).standardizedFileURL.path
        guard let entry = recentEntries().first(where: { ($0["path"] as? String) == path }) else {
            throw BridgeError("not_recent", "\(path) isn't a recent project: open it with Open Project…")
        }
        let at = locate(entry)
        guard let folder = at.url, at.exists else { throw BridgeError("gone", "\(URL(fileURLWithPath: path).lastPathComponent) can't be found any more") }
        if !scoped.contains(folder), folder.startAccessingSecurityScopedResource() { scoped.insert(folder) }
        if folder.path != path { forgetRecent(path) } // moved: the bookmark followed it, the list follows the bookmark
        return try mountFolder(folder)
    }
}

/// File › Open Recent (an app with `recentProjects`): rebuilt from the list each time the menu opens (the delegate's
/// menuNeedsUpdate, in WindowModes.swift, hands it here).
extension ShellAppDelegate {
    static let recentMenuTitle = "Open Recent"

    func updateRecentMenu(_ menu: NSMenu) {
        menu.removeAllItems()
        let recent = files.recentProjects()
        for r in recent {
            let i = NSMenuItem(title: r["name"] as? String ?? "", action: (r["exists"] as? Bool ?? false) ? #selector(menuOpenRecent(_:)) : nil, keyEquivalent: "")
            i.target = self; i.representedObject = r["path"]; i.toolTip = r["location"] as? String
            menu.addItem(i)
        }
        if !recent.isEmpty { menu.addItem(.separator()) }
        let clear = NSMenuItem(title: "Clear Menu", action: recent.isEmpty ? nil : #selector(menuClearRecent(_:)), keyEquivalent: "")
        clear.target = self
        menu.addItem(clear)
    }

    @objc func menuOpenRecent(_ sender: NSMenuItem) { if let path = sender.representedObject as? String { emit("menu.openRecent", ["path": path]) } }
    @objc func menuClearRecent(_ sender: NSMenuItem) { files.defaults.removeObject(forKey: FileMethods.recentKey) }

    /// The Open Recent item for the File menu.
    func recentMenuItem() -> NSMenuItem {
        let sub = NSMenu(title: Self.recentMenuTitle)
        sub.delegate = self
        sub.autoenablesItems = false
        let item = NSMenuItem(title: Self.recentMenuTitle, action: nil, keyEquivalent: "")
        item.submenu = sub
        return item
    }
}
