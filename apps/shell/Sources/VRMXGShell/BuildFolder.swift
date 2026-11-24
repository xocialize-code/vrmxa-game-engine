import AppKit

/// Writing a game build to a folder the person picks (M5 W0, AB-T-0615): `build.begin`, `build.write`, `build.end`.
/// The page (the editor's Export Game, `@vrmxg/bundle`) decides every byte; the shell only owns where they go.
///
///   build.begin { name, title? }      → { path, name }   a folder panel (or `VRMXG_SHELL_BUILD`: a folder, or with a
///                                                        trailing "/" a folder of builds, `<it>/<name>`)
///   build.write { path, text | base64 } → { path, bytes } one file, at a path relative to that folder
///   build.end   {}                    → { path, files, bytes }
///
/// The folder may be absent, empty, or hold an earlier build, whose files (the ones its `vrmxg-build.json` lists, and
/// nothing else) are removed first. A folder holding anything else is refused: an export never deletes what it didn't
/// write. The same rule as Node's `prepareFolder`, so a build is the same folder from either.
@MainActor
final class BuildFolder {
    static let manifest = "vrmxg-build.json"
    let root: URL
    var files = 0, bytes = 0
    init(root: URL) { self.root = root.standardizedFileURL }

    /// Every regular file under a folder as paths relative to it, `.DS_Store` aside.
    static func list(_ root: URL) -> [String] {
        var out: [String] = []
        let base = root.standardizedFileURL.path + "/"
        let e = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey], options: [])
        while let u = e?.nextObject() as? URL {
            guard (try? u.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == true, u.lastPathComponent != ".DS_Store" else { continue }
            out.append(String(u.standardizedFileURL.path.dropFirst(base.count)))
        }
        return out.sorted()
    }

    /// Make the folder ready: create it, or clear an earlier build out of it; refuse it when anything else is there.
    func prepare() throws {
        let fm = FileManager.default
        var isDir: ObjCBool = false
        if !fm.fileExists(atPath: root.path, isDirectory: &isDir) {
            try fm.createDirectory(at: root, withIntermediateDirectories: true)
            return
        }
        guard isDir.boolValue else { throw BridgeError("not_empty", "\(root.lastPathComponent) is a file, not a folder") }
        let old = root.appendingPathComponent(Self.manifest)
        if let data = try? Data(contentsOf: old) {
            guard let doc = try? JSONSerialization.jsonObject(with: data) as? [String: Any], doc["format"] as? String == "vrmxg-build", let listed = doc["files"] as? [[String: Any]] else {
                throw BridgeError("not_empty", "\(root.lastPathComponent) has a \(Self.manifest) that isn't a build's: export into an empty folder")
            }
            for row in listed {
                guard let rel = row["path"] as? String, let file = try? inside(rel) else { continue }
                try? fm.removeItem(at: file)
            }
            try fm.removeItem(at: old)
            // folders the build left empty, deepest first
            var dirs: [URL] = []
            let e = fm.enumerator(at: root, includingPropertiesForKeys: [.isDirectoryKey], options: [])
            while let u = e?.nextObject() as? URL { if (try? u.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true { dirs.append(u) } }
            for d in dirs.sorted(by: { $0.path.count > $1.path.count }) where Self.list(d).isEmpty { try? fm.removeItem(at: d) }
        }
        let left = Self.list(root)
        if !left.isEmpty {
            let more = left.count > 3 ? ", and \(left.count - 3) more" : ""
            throw BridgeError("not_empty", "\(root.lastPathComponent) holds files that aren't a build's (\(left.prefix(3).joined(separator: ", "))\(more)): export into an empty folder")
        }
    }

    /// A path inside the folder (relative to it), refused if it leads outside.
    func inside(_ rel: String) throws -> URL {
        let file = root.appendingPathComponent(rel).standardizedFileURL
        guard !rel.isEmpty, !rel.hasPrefix("/"), file.path.hasPrefix(root.path + "/") else { throw BridgeError("bad_params", "\(rel) is outside the build's folder") }
        return file
    }

    func write(_ rel: String, _ data: Data) throws {
        let file = try inside(rel)
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: file, options: .atomic)
        files += 1; bytes += data.count
    }
}

extension FileMethods {
    func registerBuild(on router: BridgeRouter) {
        router.register("build.begin") { [unowned self] p in try await self.beginBuild(p) }
        router.register("build.write") { [unowned self] p in try self.writeBuild(p) }
        router.register("build.end") { [unowned self] _ in try self.endBuild() }
    }

    func beginBuild(_ p: BridgeParams) async throws -> Any? {
        let name = p.string("name") ?? "game"
        guard !name.isEmpty, !name.contains("/"), !name.hasPrefix(".") else { throw BridgeError("bad_params", "a build's name is a folder name (\"\(name)\")") }
        var url: URL?
        if let hook = hook("VRMXG_SHELL_BUILD") {
            url = env["VRMXG_SHELL_BUILD"]!.hasSuffix("/") ? hook.appendingPathComponent(name) : hook
        } else {
            let panel = NSOpenPanel()
            panel.title = p.string("title") ?? "Export Game"
            panel.message = "Choose an empty folder for the game's build, or an earlier build to replace."
            panel.prompt = "Export"
            panel.canChooseFiles = false; panel.canChooseDirectories = true; panel.canCreateDirectories = true; panel.allowsMultipleSelection = false
            guard panel.runModal() == .OK, let u = panel.url else { throw BridgeError("cancelled", "nothing was exported") }
            url = u
        }
        let folder = BuildFolder(root: url!)
        try folder.prepare()
        granted.insert(folder.root)
        build = folder
        return ["path": folder.root.path, "name": folder.root.lastPathComponent]
    }

    func writeBuild(_ p: BridgeParams) throws -> Any? {
        guard let folder = build else { throw BridgeError("no_build", "no build is being written: call build.begin first") }
        let rel = try p.require("path"), data = try Self.payload(p)
        try folder.write(rel, data)
        return ["path": rel, "bytes": data.count]
    }

    func endBuild() throws -> Any? {
        guard let folder = build else { throw BridgeError("no_build", "no build is being written") }
        build = nil
        return ["path": folder.root.path, "name": folder.root.lastPathComponent, "files": folder.files, "bytes": folder.bytes]
    }
}
