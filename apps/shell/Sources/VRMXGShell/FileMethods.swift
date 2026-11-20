import AppKit
import UniformTypeIdentifiers

/// The file and project bridge methods. Files come through the system panels (the sandbox grants what the person
/// picks, for the life of the process); for automation, environment variables stand in for the panels:
///   VRMXG_SHELL_OPEN=<file>   VRMXG_SHELL_SAVE=<file>   VRMXG_SHELL_PROJECT=<folder>
/// (a relative path is under the app's temporary directory, inside its sandbox container).
///
/// Binary files (AB-A-0314, shell 0.6.0): `file.open { types, serve: true }` serves the chosen file at a URL on both
/// origins (`url`: `/opened/<token>/<name>`, fetched by the page, no copy over the bridge); `binary: true` returns its
/// bytes as `base64` instead (up to 64 MB). `remember: "<key>"` keeps a security-scoped bookmark, so on a later launch
/// `file.reopen { key, serve?, binary? }` opens it again with no panel (null when nothing is remembered or the file has
/// gone); `file.forget { key }` drops it. Remembering needs `com.apple.security.files.bookmarks.app-scope`.
@MainActor
public final class FileMethods {
    let roots: WebRoots
    let env: [String: String]
    let defaults: UserDefaults
    /// Files and folders the person granted this session (writing back to them needs no panel).
    var granted: Set<URL> = []
    /// Files reopened from bookmarks, whose security scope stays open for the app's life.
    var scoped: Set<URL> = []
    public init(roots: WebRoots, env: [String: String] = ProcessInfo.processInfo.environment, defaults: UserDefaults = .standard) {
        self.roots = roots; self.env = env; self.defaults = defaults
    }

    func hook(_ key: String) -> URL? {
        guard let v = env[key], !v.isEmpty else { return nil }
        return v.hasPrefix("/") ? URL(fileURLWithPath: v) : URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(v)
    }

    public func register(on router: BridgeRouter) {
        router.register("file.open") { [unowned self] p in try await self.open(p) }
        router.register("file.reopen") { [unowned self] p in try self.reopen(p) }
        router.register("file.forget") { [unowned self] p in self.defaults.removeObject(forKey: Self.bookmarkKey(try p.require("key"))); return ["forgotten": true] }
        router.register("file.save") { [unowned self] p in try await self.save(p) }
        router.register("project.open") { [unowned self] p in try await self.openProject(p) }
        router.register("project.list") { [unowned self] _ in try self.listProject() }
        router.register("project.write") { [unowned self] p in try self.writeProject(p) }
    }

    private func types(_ exts: [String]?) -> [UTType] {
        (exts ?? []).compactMap { UTType(filenameExtension: $0) ?? UTType(exportedAs: "com.xocialize.vrmxg.\($0)", conformingTo: .data) }
    }

    func open(_ p: BridgeParams) async throws -> Any? {
        var url = hook("VRMXG_SHELL_OPEN")
        if url == nil {
            let panel = NSOpenPanel()
            panel.title = p.string("title") ?? "Open"
            panel.canChooseFiles = true; panel.canChooseDirectories = false; panel.allowsMultipleSelection = false
            let t = types(p.strings("types")); if !t.isEmpty { panel.allowedContentTypes = t }
            guard panel.runModal() == .OK, let u = panel.url else { throw BridgeError("cancelled", "nothing was opened") }
            url = u
        }
        let file = url!
        granted.insert(file)
        if let key = p.string("remember") { try remember(file, key: key) }
        return try describe(file, p)
    }

    /// What `file.open` and `file.reopen` answer: `url` with `serve`, `base64` with `binary`, else `text` (UTF-8 up to 32 MB).
    func describe(_ file: URL, _ p: BridgeParams) throws -> [String: Any] {
        let size = (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        var out: [String: Any] = ["path": file.path, "name": file.lastPathComponent, "size": size]
        if p.bool("serve") == true {
            out["url"] = roots.serveOpened(file)
        } else if p.bool("binary") == true {
            guard size <= 64 << 20 else { throw BridgeError("too_large", "\(file.lastPathComponent) is over 64 MB: open it with serve: true") }
            out["base64"] = try Data(contentsOf: file).base64EncodedString()
        } else {
            let data = try Data(contentsOf: file)
            if data.count <= 32 << 20, let text = String(data: data, encoding: .utf8) { out["text"] = text }
        }
        return out
    }

    static func bookmarkKey(_ key: String) -> String { "vrmxg.shell.remembered.\(key)" }

    /// A security-scoped bookmark in the sandbox (a plain one where there's no sandbox, as in tests).
    func remember(_ file: URL, key: String) throws {
        let data: Data
        if let scoped = try? file.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil) { data = scoped }
        else { data = try file.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) }
        defaults.set(data, forKey: Self.bookmarkKey(key))
    }

    func reopen(_ p: BridgeParams) throws -> Any? {
        let key = try p.require("key")
        guard let data = defaults.data(forKey: Self.bookmarkKey(key)) else { return nil }
        var stale = false
        let resolved = (try? URL(resolvingBookmarkData: data, options: .withSecurityScope, relativeTo: nil, bookmarkDataIsStale: &stale))
            ?? (try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale))
        guard let file = resolved else { return nil }
        if !scoped.contains(file), file.startAccessingSecurityScopedResource() { scoped.insert(file) }
        guard FileManager.default.isReadableFile(atPath: file.path) else { return nil }
        granted.insert(file)
        if stale { try? remember(file, key: key) }
        return try describe(file, p)
    }

    /// The bytes to write: `text`, or `base64` for binary files (a still, a thumbnail).
    static func payload(_ p: BridgeParams) throws -> Data {
        if let b = p.string("base64") {
            guard let d = Data(base64Encoded: b) else { throw BridgeError("bad_params", "base64 does not decode") }
            return d
        }
        return Data(try p.require("text").utf8)
    }

    func save(_ p: BridgeParams) async throws -> Any? {
        let data = try Self.payload(p)
        var url: URL?
        if let path = p.string("path"), granted.contains(URL(fileURLWithPath: path)) { url = URL(fileURLWithPath: path) }
        if url == nil { url = hook("VRMXG_SHELL_SAVE") }
        if url == nil {
            let panel = NSSavePanel()
            panel.title = p.string("title") ?? "Save"
            panel.nameFieldStringValue = p.string("suggestedName") ?? "untitled.vrmxs"
            let t = types(p.strings("types")); if !t.isEmpty { panel.allowedContentTypes = t }
            guard panel.runModal() == .OK, let u = panel.url else { throw BridgeError("cancelled", "nothing was saved") }
            url = u
        }
        let file = url!
        try data.write(to: file, options: .atomic)
        granted.insert(file)
        return ["path": file.path, "name": file.lastPathComponent, "bytes": data.count]
    }

    func openProject(_ p: BridgeParams) async throws -> Any? {
        var url = hook("VRMXG_SHELL_PROJECT")
        if url == nil {
            let panel = NSOpenPanel()
            panel.title = p.string("title") ?? "Open Project"
            panel.canChooseFiles = false; panel.canChooseDirectories = true; panel.allowsMultipleSelection = false
            guard panel.runModal() == .OK, let u = panel.url else { throw BridgeError("cancelled", "no project was opened") }
            url = u
        }
        let folder = url!
        granted.insert(folder)
        roots.mountProject(folder)
        return ["path": folder.path, "name": folder.lastPathComponent, "base": WebRoots.projectPrefix, "files": try listProject()]
    }

    /// Every file of the mounted project, as paths relative to it (hidden files skipped, at most 20,000).
    func listProject() throws -> [String] {
        guard let root = roots.projectFolder else { throw BridgeError("no_project", "no project is open") }
        var out: [String] = []
        let base = root.standardizedFileURL.path + "/"
        let e = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles])
        while let u = e?.nextObject() as? URL, out.count < 20_000 {
            if (try? u.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == true { out.append(String(u.standardizedFileURL.path.dropFirst(base.count))) }
        }
        return out.sorted()
    }

    /// Write a file inside the mounted project (a path relative to it): `text`, or `base64` for binary.
    func writeProject(_ p: BridgeParams) throws -> Any? {
        guard let root = roots.projectFolder else { throw BridgeError("no_project", "no project is open") }
        let rel = try p.require("path"), data = try Self.payload(p)
        let file = root.appendingPathComponent(rel).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path + "/") else { throw BridgeError("bad_params", "\(rel) is outside the project") }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: file, options: .atomic)
        return ["path": rel, "bytes": data.count]
    }
}
