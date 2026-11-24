import AppKit

/// Writing a game build to a folder the person picks (M5 W0, AB-T-0615): `build.begin`, `build.write`, `build.end`,
/// `build.abort`. The page (the editor's Export Game, `@vrmxg/bundle`) decides every byte; the shell only owns where
/// they go.
///
///   build.begin { name, title? }              → { id, path, name }   a folder panel (or `VRMXG_SHELL_BUILD`: a folder,
///                                                                    or with a trailing "/" a folder of builds, `<it>/<name>`)
///   build.write { id, path, text | base64, append? } → { path, bytes }  one file, or the next piece of one, at a path
///                                                                    relative to that folder
///   build.end   { id }                        → { path, name, files, bytes }
///   build.abort { id }                        → { aborted }          drops what this export wrote
///
/// **The folder is as it was until `build.end`.** Files are written into a staging folder inside it
/// (`.vrmxg-export-<id>`) and moved into place at the end, after the earlier build's files are taken away. An export
/// that fails, is aborted or loses its page leaves an earlier build whole and the folder free for another try. The
/// `id` is the page's handle on its export: a page that has reloaded has none, and can write nothing.
///
/// **What an export may replace.** The folder may be absent, empty, or hold an earlier build, every file in it one that
/// build's `vrmxg-build.json` lists. It is refused, before anything is removed, when it holds a file the manifest
/// doesn't list, a symbolic link or special file anywhere, or a manifest of a version this shell doesn't read. So an
/// export never deletes what a build didn't write, and never writes or deletes through a link out of the folder. The
/// same rules as Node's `planFolder` and `stageFolder`, so a build is the same folder from either.
@MainActor
final class BuildFolder {
    static let manifest = "vrmxg-build.json"
    static let staging = ".vrmxg-export-"
    /// The manifest version whose file list this shell trusts to say what an earlier build wrote.
    static let version = 1

    let id = UUID().uuidString
    let root: URL
    let stage: URL
    let createdRoot: Bool
    private(set) var written: [String] = []
    private(set) var bytes = 0
    private var moving = false, closed = false

    struct Scan { var files: [String] = [], dirs: [String] = [], foreign: [String] = [], stale: [String] = [] }
    struct Plan { var old: [String], dirs: [String], stale: [String] }

    /// What a folder holds, without following a link: regular files, folders, and everything else (`foreign`: symbolic
    /// links, sockets, devices), as paths relative to it. `.DS_Store` is left out. Top-level folders an interrupted
    /// export left (`.vrmxg-export-*`) are `stale`, and not looked into.
    static func scan(_ root: URL) -> Scan {
        var out = Scan()
        let fm = FileManager.default
        func walk(_ dir: URL, _ rel: String) {
            for name in ((try? fm.contentsOfDirectory(atPath: dir.path)) ?? []).sorted() {
                let r = rel.isEmpty ? name : "\(rel)/\(name)", url = dir.appendingPathComponent(name)
                // attributesOfItem doesn't follow a link at the end of the path: a link is a link here
                switch (try? fm.attributesOfItem(atPath: url.path))?[.type] as? FileAttributeType {
                case .typeDirectory?: if rel.isEmpty && name.hasPrefix(staging) { out.stale.append(r) } else { out.dirs.append(r); walk(url, r) }
                case .typeRegular?: if name != ".DS_Store" { out.files.append(r) }
                default: out.foreign.append(r)
                }
            }
        }
        walk(root, "")
        return out
    }

    /// What is wrong with a build's path, or nil: relative, `/` between segments, none of them empty, `.` or `..`.
    static func pathProblem(_ p: String) -> String? {
        if p.isEmpty { return "is empty" }
        if p.hasPrefix("/") { return "starts with /" }
        if p.unicodeScalars.contains(where: { $0 == "\\" || $0 == ":" || $0.value < 0x20 || $0.value == 0x7f }) { return "has a backslash, a colon or a control character" }
        for s in p.split(separator: "/", omittingEmptySubsequences: false) where s.isEmpty || s == "." || s == ".." { return "has the segment \"\(s)\"" }
        return nil
    }

    static func few(_ list: [String]) -> String { list.prefix(3).joined(separator: ", ") + (list.count > 3 ? ", and \(list.count - 3) more" : "") }

    /// The paths a manifest lists, when it is a build's manifest of the version this shell reads.
    static func listed(_ file: URL) throws -> [String] {
        guard let data = try? Data(contentsOf: file), let doc = try? JSONSerialization.jsonObject(with: data) as? [String: Any], doc["format"] as? String == "vrmxg-build" else {
            throw BridgeError("not_empty", "has a \(manifest) that isn't a build's")
        }
        guard (doc["version"] as? NSNumber)?.doubleValue == Double(version) else {
            throw BridgeError("not_empty", "has a \(manifest) of version \(doc["version"].map { "\($0)" } ?? "none"), and this app reads version \(version)")
        }
        guard let rows = doc["files"] as? [[String: Any]] else { throw BridgeError("not_empty", "has a \(manifest) with no list of files") }
        return try rows.map { row in
            guard let p = row["path"] as? String, pathProblem(p) == nil else { throw BridgeError("not_empty", "has a \(manifest) that lists a path no build has (\(row["path"] ?? "none"))") }
            return p
        }
    }

    /// Decide whether the folder can take a build, changing nothing: what an earlier build wrote there (`old`), or a
    /// refusal that says what is in the way.
    static func plan(_ root: URL) throws -> Plan {
        let name = root.lastPathComponent
        func refuse(_ why: String) -> BridgeError { BridgeError("not_empty", "\(name) \(why): export into an empty folder") }
        let s = scan(root)
        if !s.foreign.isEmpty { throw refuse("holds a link or a special file (\(few(s.foreign)))") }
        // what a build wrote here: the files its manifest lists, and the ones an export that was cut short had moved in
        var known: Set<String> = [manifest]
        let manifests = ([root.appendingPathComponent(manifest)] + s.stale.map { root.appendingPathComponent($0).appendingPathComponent(manifest) })
            .filter { ((try? FileManager.default.attributesOfItem(atPath: $0.path))?[.type] as? FileAttributeType) == .typeRegular }
        for m in manifests {
            do { known.formUnion(try listed(m)) } catch let e as BridgeError { throw refuse(e.message) }
        }
        let stray = s.files.filter { !known.contains($0) }
        if !stray.isEmpty { throw refuse(manifests.isEmpty ? "holds files that aren't a build's (\(few(stray)))" : "holds files its build doesn't list (\(few(stray)))") }
        return Plan(old: s.files, dirs: s.dirs, stale: s.stale)
    }

    /// Open a folder for a build: refused if it can't take one (nothing is removed either way), else a staging folder
    /// is made inside it.
    init(at url: URL) throws {
        let fm = FileManager.default
        let type = (try? fm.attributesOfItem(atPath: url.path))?[.type] as? FileAttributeType
        if type == nil {
            try fm.createDirectory(at: url, withIntermediateDirectories: true)
            createdRoot = true
        } else {
            createdRoot = false
        }
        let resolved = url.resolvingSymlinksInPath().standardizedFileURL // the folder the person named, wherever a link to it led
        var isDir: ObjCBool = false
        guard fm.fileExists(atPath: resolved.path, isDirectory: &isDir), isDir.boolValue else {
            throw BridgeError("not_empty", "\(url.lastPathComponent) is not a folder: export into an empty folder")
        }
        root = resolved
        _ = try Self.plan(resolved)
        stage = resolved.appendingPathComponent(Self.staging + id)
        try fm.createDirectory(at: stage, withIntermediateDirectories: false)
    }

    /// The folders from `base` down to `rel`'s own, each made if missing; a link or a file in the way is refused.
    private func folders(_ base: URL, _ rel: String) throws {
        let fm = FileManager.default
        var d = base
        for seg in rel.split(separator: "/").dropLast() {
            d = d.appendingPathComponent(String(seg))
            let type = (try? fm.attributesOfItem(atPath: d.path))?[.type] as? FileAttributeType
            if type == nil { try fm.createDirectory(at: d, withIntermediateDirectories: false) }
            else if type != .typeDirectory { throw BridgeError("bad_params", "\(rel): \(seg) is not a folder of the build's") }
        }
    }

    /// One file of the build into the staging folder, or with `append` the next piece of one already begun.
    func write(_ rel: String, _ data: Data, append: Bool) throws {
        guard !closed else { throw BridgeError("no_build", "this export has ended") }
        if let problem = Self.pathProblem(rel) { throw BridgeError("bad_params", "\(rel) \(problem): it is outside the build's folder") }
        let begun = written.contains(rel)
        guard append == begun else { throw BridgeError("bad_params", append ? "\(rel) can't be added to before it is begun" : "\(rel) is written twice") }
        try folders(stage, rel)
        let file = stage.appendingPathComponent(rel)
        if append {
            let h = try FileHandle(forWritingTo: file)
            defer { try? h.close() }
            try h.seekToEnd(); try h.write(contentsOf: data)
        } else {
            try data.write(to: file, options: .withoutOverwriting)
            written.append(rel)
        }
        bytes += data.count
    }

    /// Take the earlier build away and move this one into place, the manifest last.
    func commit() throws -> [String: Any] {
        guard !closed else { throw BridgeError("no_build", "this export has ended") }
        guard written.contains(Self.manifest) else { throw BridgeError("failed", "the export wrote no \(Self.manifest)") }
        let fm = FileManager.default
        let now = try Self.plan(root) // the folder as it is now: decided again before anything is removed
        moving = true
        for f in now.old { try fm.removeItem(at: root.appendingPathComponent(f)) }
        for rel in written.filter({ $0 != Self.manifest }) + [Self.manifest] {
            try folders(root, rel)
            let to = root.appendingPathComponent(rel)
            guard (try? fm.attributesOfItem(atPath: to.path)) == nil else { throw BridgeError("failed", "\(rel) is in the way in \(root.lastPathComponent)") }
            try fm.moveItem(at: stage.appendingPathComponent(rel), to: to)
        }
        for d in now.stale { try? fm.removeItem(at: root.appendingPathComponent(d)) } // this export's staging, and any left by one cut short
        // folders the earlier build left empty, deepest first; one still in use isn't empty and stays
        for d in now.dirs.sorted(by: { $0.count > $1.count }) where ((try? fm.contentsOfDirectory(atPath: root.appendingPathComponent(d).path)) ?? ["x"]).isEmpty {
            try? fm.removeItem(at: root.appendingPathComponent(d))
        }
        closed = true
        return ["path": root.path, "name": root.lastPathComponent, "files": written.count - 1, "bytes": bytes]
    }

    /// Drop what this export wrote. Once `commit` has begun moving files it does nothing: the next export finishes the job.
    func abort() {
        guard !closed, !moving else { return }
        closed = true
        try? FileManager.default.removeItem(at: stage)
        if createdRoot, ((try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? ["x"]).isEmpty { try? FileManager.default.removeItem(at: root) }
    }
}

extension FileMethods {
    func registerBuild(on router: BridgeRouter) {
        router.register("build.begin") { [unowned self] p in try await self.beginBuild(p) }
        router.register("build.write") { [unowned self] p in try self.writeBuild(p) }
        router.register("build.end") { [unowned self] p in try self.endBuild(p) }
        router.register("build.abort") { [unowned self] p in try self.abortBuild(p) }
    }

    /// The build this page began, by the id `build.begin` gave it.
    private func openBuild(_ p: BridgeParams) throws -> BuildFolder {
        guard let folder = build, p.string("id") == folder.id else { throw BridgeError("no_build", "no build is being written under that id: call build.begin first") }
        return folder
    }

    func beginBuild(_ p: BridgeParams) async throws -> Any? {
        let name = p.string("name") ?? "game"
        guard !name.isEmpty, !name.contains("/"), !name.hasPrefix(".") else { throw BridgeError("bad_params", "a build's name is a folder name (\"\(name)\")") }
        build?.abort(); build = nil // an export the page gave up on (a reload): one build at a time
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
        let folder = try BuildFolder(at: url!)
        granted.insert(folder.root)
        build = folder
        return ["id": folder.id, "path": folder.root.path, "name": folder.root.lastPathComponent]
    }

    func writeBuild(_ p: BridgeParams) throws -> Any? {
        let folder = try openBuild(p)
        let rel = try p.require("path"), data = try Self.payload(p)
        try folder.write(rel, data, append: p.bool("append") == true)
        return ["path": rel, "bytes": data.count]
    }

    func endBuild(_ p: BridgeParams) throws -> Any? {
        let folder = try openBuild(p)
        defer { build = nil }
        do { return try folder.commit() } catch { folder.abort(); throw error }
    }

    func abortBuild(_ p: BridgeParams) throws -> Any? {
        let folder = try openBuild(p)
        folder.abort(); build = nil
        return ["aborted": true]
    }
}
