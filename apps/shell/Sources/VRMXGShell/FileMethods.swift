import AppKit
import UniformTypeIdentifiers

/// The file and project bridge methods. Files come through the system panels (the sandbox grants what the person
/// picks, for the life of the process); for automation, environment variables stand in for the panels:
///   VRMXG_SHELL_OPEN=<file>   VRMXG_SHELL_SAVE=<file>   VRMXG_SHELL_PROJECT=<folder>
/// (a relative path is under the app's temporary directory, inside its sandbox container).
@MainActor
public final class FileMethods {
    let roots: WebRoots
    let env: [String: String]
    /// Files and folders the person granted this session (writing back to them needs no panel).
    private(set) var granted: Set<URL> = []
    public init(roots: WebRoots, env: [String: String] = ProcessInfo.processInfo.environment) { self.roots = roots; self.env = env }

    func hook(_ key: String) -> URL? {
        guard let v = env[key], !v.isEmpty else { return nil }
        return v.hasPrefix("/") ? URL(fileURLWithPath: v) : URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(v)
    }

    public func register(on router: BridgeRouter) {
        router.register("file.open") { [unowned self] p in try await self.open(p) }
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
        let data = try Data(contentsOf: file)
        var out: [String: Any] = ["path": file.path, "name": file.lastPathComponent, "size": data.count]
        if data.count <= 32 << 20, let text = String(data: data, encoding: .utf8) { out["text"] = text }
        return out
    }

    func save(_ p: BridgeParams) async throws -> Any? {
        let text = try p.require("text")
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
        let data = Data(text.utf8)
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

    /// Write a text file inside the mounted project (a path relative to it).
    func writeProject(_ p: BridgeParams) throws -> Any? {
        guard let root = roots.projectFolder else { throw BridgeError("no_project", "no project is open") }
        let rel = try p.require("path"), text = try p.require("text")
        let file = root.appendingPathComponent(rel).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path + "/") else { throw BridgeError("bad_params", "\(rel) is outside the project") }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(text.utf8).write(to: file, options: .atomic)
        return ["path": rel, "bytes": text.utf8.count]
    }
}
