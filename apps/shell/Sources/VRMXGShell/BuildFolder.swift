import AppKit
import CryptoKit

/// Writing a game build to a folder the person picks (M5 W0, AB-T-0615): `build.begin`, `build.write`, `build.end`,
/// `build.abort`. The page (the editor's Export Game, `@vrmxg/bundle`) decides every byte; the shell only owns where
/// they go, and checks at the end that what arrived is what the page's manifest lists.
///
///   build.begin { name, title? }              → { id, path, name }   a folder panel (or `VRMXG_SHELL_BUILD`: a folder,
///                                                                    or with a trailing "/" a folder of builds, `<it>/<name>`)
///   build.write { id, path, text | base64, offset? } → { path, bytes }  one file, or the piece of one that begins at
///                                                                    `offset`, at a path relative to that folder
///   build.end   { id }                        → { path, name, files, bytes }
///   build.abort { id }                        → { aborted }          drops what this export wrote
///
/// **The folder is as it was until `build.end`.** Files are written into a staging folder inside it
/// (`.vrmxg-export-<id>`) and moved into place at the end. An export that fails, is aborted or loses its page leaves an
/// earlier build whole and the folder free for another try. The `id` is the page's handle on its export: a page that
/// has reloaded has none, and can write nothing. A piece names its offset, so one sent twice or out of turn is refused.
///
/// **`build.end` leaves the earlier build or the new one, never neither.** Every staged file is first checked against
/// the staged manifest (size and SHA-256), and the folder is decided on again. Then the earlier build's files are held
/// aside (not deleted), its folders pruned, the new manifest put over the old in one step and the new files moved in.
/// If a step fails, what moved in is taken out and the earlier build is put back.
///
/// **What an export may replace.** The folder may be absent, empty, or hold an earlier build, every file in it one that
/// build's `vrmxg-build.json` lists. It is refused, before anything is touched, when it holds a file the manifest
/// doesn't list, a symbolic link or special file anywhere, or a manifest of a version this shell doesn't read. Only the
/// folder's own manifest says what a build wrote: nothing in a staging folder is licence to delete or overwrite
/// anything outside it, and no build path may begin with the staging prefix. The same rules as Node's `planFolder` and
/// `stageFolder`, so a build is the same folder from either.
@MainActor
final class BuildFolder {
    static let manifest = "vrmxg-build.json"
    /// No path of a build may have a segment that starts with this.
    static let reserved = ".vrmxg-export"
    static let staging = ".vrmxg-export-"
    static let held = ".held"
    /// The manifest version whose file list this shell trusts to say what an earlier build wrote.
    static let version = 1

    let id = UUID().uuidString
    let root: URL
    let stage: URL
    let createdRoot: Bool
    /// What this export has written, in order, and how many bytes of each.
    private(set) var written: [String] = []
    private var sizes: [String: Int] = [:]
    private var closed = false

    struct Scan { var files: [String] = [], dirs: [String] = [], foreign: [String] = [], stale: [String] = [], junk: [String] = [] }
    struct Row { let path: String, bytes: Int, sha256: String }
    struct Plan { var old: [String], dirs: [String], junk: [String], stale: [String], hasManifest: Bool }

    static func type(_ url: URL) -> FileAttributeType? { (try? FileManager.default.attributesOfItem(atPath: url.path))?[.type] as? FileAttributeType }

    /// What a folder holds, without following a link: regular files, folders, and everything else (`foreign`: symbolic
    /// links, sockets, devices), as paths relative to it. `.DS_Store` files are apart, as `junk`. Top-level folders an
    /// export left (`.vrmxg-export-*`) are `stale`, and not looked into.
    static func scan(_ root: URL) -> Scan {
        var out = Scan()
        let fm = FileManager.default
        func walk(_ dir: URL, _ rel: String) {
            for name in ((try? fm.contentsOfDirectory(atPath: dir.path)) ?? []).sorted() {
                let r = rel.isEmpty ? name : "\(rel)/\(name)", url = dir.appendingPathComponent(name)
                // attributesOfItem doesn't follow a link at the end of the path: a link is a link here
                switch type(url) {
                case .typeDirectory?: if rel.isEmpty && name.hasPrefix(reserved) { out.stale.append(r) } else { out.dirs.append(r); walk(url, r) }
                case .typeRegular?: if name == ".DS_Store" { out.junk.append(r) } else { out.files.append(r) }
                default: out.foreign.append(r)
                }
            }
        }
        walk(root, "")
        return out
    }

    /// What is wrong with a build's path, or nil: relative, `/` between segments, none of them empty, `.`, `..` or a
    /// name an export keeps for its staging folder.
    static func pathProblem(_ p: String) -> String? {
        if p.isEmpty { return "is empty" }
        if p.hasPrefix("/") { return "starts with /" }
        if p.unicodeScalars.contains(where: { $0 == "\\" || $0 == ":" || $0.value < 0x20 || $0.value == 0x7f }) { return "has a backslash, a colon or a control character" }
        for s in p.split(separator: "/", omittingEmptySubsequences: false) {
            if s.isEmpty || s == "." || s == ".." { return "has the segment \"\(s)\"" }
            if s.hasPrefix(reserved) { return "has the segment \"\(s)\", a name an export keeps for its own staging folder" }
        }
        return nil
    }

    static func few(_ list: [String]) -> String { list.prefix(3).joined(separator: ", ") + (list.count > 3 ? ", and \(list.count - 3) more" : "") }

    /// A whole number in a manifest: a JSON number, never `true` (which bridges to an NSNumber of 1).
    static func integer(_ v: Any?) -> Int? {
        guard let n = v as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue == n.doubleValue.rounded() else { return nil }
        return n.intValue
    }

    /// The rows of a manifest, when it is a build's manifest of the version this shell reads.
    static func rows(_ file: URL) throws -> [Row] {
        guard let data = try? Data(contentsOf: file), let doc = try? JSONSerialization.jsonObject(with: data) as? [String: Any], doc["format"] as? String == "vrmxg-build" else {
            throw BridgeError("not_empty", "has a \(manifest) that isn't a build's")
        }
        guard integer(doc["version"]) == version else {
            throw BridgeError("not_empty", "has a \(manifest) of version \(doc["version"].map { "\($0)" } ?? "none"), and this app reads version \(version)")
        }
        guard let list = doc["files"] as? [[String: Any]] else { throw BridgeError("not_empty", "has a \(manifest) with no list of files") }
        return try list.map { row in
            guard let p = row["path"] as? String, pathProblem(p) == nil else { throw BridgeError("not_empty", "has a \(manifest) that lists a path no build has (\(row["path"] ?? "none"))") }
            return Row(path: p, bytes: integer(row["bytes"]) ?? -1, sha256: row["sha256"] as? String ?? "")
        }
    }

    static func sha256(_ file: URL) -> String? {
        guard let h = try? FileHandle(forReadingFrom: file) else { return nil }
        defer { try? h.close() }
        var hasher = SHA256()
        while let piece = try? h.read(upToCount: 1 << 20), !piece.isEmpty { hasher.update(data: piece) }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
    static func size(_ file: URL) -> Int { ((try? FileManager.default.attributesOfItem(atPath: file.path))?[.size] as? NSNumber)?.intValue ?? -1 }

    /// Decide whether the folder can take a build, changing nothing: what an earlier build wrote there (`old`), or a
    /// refusal that says what is in the way. Only the folder's own manifest is read.
    static func plan(_ root: URL) throws -> Plan {
        let name = root.lastPathComponent
        func refuse(_ why: String) -> BridgeError { BridgeError("not_empty", "\(name) \(why): export into an empty folder") }
        let s = scan(root)
        if !s.foreign.isEmpty { throw refuse("holds a link or a special file (\(few(s.foreign)))") }
        var known: Set<String> = [manifest]
        let has = s.files.contains(manifest)
        if has {
            do { known.formUnion(try rows(root.appendingPathComponent(manifest)).map(\.path)) } catch let e as BridgeError { throw refuse(e.message) }
        }
        let stray = s.files.filter { !known.contains($0) }
        if !stray.isEmpty { throw refuse(has ? "holds files its build doesn't list (\(few(stray)))" : "holds files that aren't a build's (\(few(stray)))") }
        return Plan(old: s.files, dirs: s.dirs, junk: s.junk, stale: s.stale, hasManifest: has)
    }

    /// The folders from `base` down to `rel`'s own, each made if missing (and noted in `made`); a link or a file in the
    /// way is refused.
    static func folders(_ base: URL, _ rel: String, made: inout [URL]) throws {
        var d = base
        for seg in rel.split(separator: "/").dropLast() {
            d = d.appendingPathComponent(String(seg))
            let t = type(d)
            if t == nil { try FileManager.default.createDirectory(at: d, withIntermediateDirectories: false); made.append(d) }
            else if t != .typeDirectory { throw BridgeError("bad_params", "\(rel): \(seg) is in the way, and is not a folder") }
        }
    }

    /// Clear away the staging folders earlier exports left (one that was killed, or lost its page). Nothing in them is
    /// licence to delete or overwrite anything outside them. The one thing taken from them: a file the folder's own
    /// manifest lists, with the size and SHA-256 it lists, that is missing from the folder, is moved in. That finishes
    /// a build whose files were on their way in, or puts back an earlier one whose files were on their way out,
    /// whichever the committed manifest describes. Then each staging folder is removed.
    static func recover(_ root: URL) {
        let s = scan(root)
        guard !s.stale.isEmpty else { return }
        let fm = FileManager.default
        let listed = Dictionary(((try? rows(root.appendingPathComponent(manifest))) ?? []).map { ($0.path, $0) }, uniquingKeysWith: { a, _ in a })
        for dir in s.stale {
            let stale = root.appendingPathComponent(dir)
            for f in scan(stale).files {
                let rel = f.hasPrefix(held + "/") ? String(f.dropFirst(held.count + 1)) : f, from = stale.appendingPathComponent(f), to = root.appendingPathComponent(rel)
                guard rel != manifest, let row = listed[rel], type(to) == nil, size(from) == row.bytes, sha256(from) == row.sha256 else { continue }
                var made: [URL] = []
                if (try? folders(root, rel, made: &made)) != nil { try? fm.moveItem(at: from, to: to) }
            }
            try? fm.removeItem(at: stale) // links in it are unlinked, never followed
        }
    }

    /// Open a folder for a build: refused if it can't take one (nothing of it is removed either way), else a staging
    /// folder is made inside it.
    init(at url: URL) throws {
        let fm = FileManager.default
        if Self.type(url) == nil {
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
        _ = try Self.plan(resolved)   // refused as it stands: nothing a cut-short export left is touched either
        Self.recover(resolved)
        _ = try Self.plan(resolved)
        stage = resolved.appendingPathComponent(Self.staging + id)
        try fm.createDirectory(at: stage, withIntermediateDirectories: false)
    }

    /// One file of the build into the staging folder, or the piece of one that begins at `offset` (0: its first). A
    /// piece that leaves a gap, or lands on bytes already written, is refused.
    func write(_ rel: String, _ data: Data, offset: Int) throws {
        guard !closed else { throw BridgeError("no_build", "this export has ended") }
        if let problem = Self.pathProblem(rel) { throw BridgeError("bad_params", "\(rel) \(problem): it is outside the build's folder") }
        let have = sizes[rel]
        if offset == 0, have != nil { throw BridgeError("bad_params", "\(rel) is written twice") }
        if offset != 0, offset != have { throw BridgeError("bad_params", "\(rel): a piece at \(offset), and \(have.map { "the file has \($0) bytes" } ?? "the file is not begun")") }
        var made: [URL] = []
        try Self.folders(stage, rel, made: &made)
        let file = stage.appendingPathComponent(rel)
        if offset == 0 {
            try data.write(to: file, options: .withoutOverwriting)
            written.append(rel)
        } else {
            let h = try FileHandle(forWritingTo: file)
            defer { try? h.close() }
            try h.seekToEnd(); try h.write(contentsOf: data)
        }
        sizes[rel] = (have ?? 0) + data.count
    }

    private func drop() {
        closed = true
        try? FileManager.default.removeItem(at: stage)
    }
    private func dropRoot() {
        if createdRoot, ((try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? ["x"]).isEmpty { try? FileManager.default.removeItem(at: root) }
    }

    /// Check the staged files against the manifest they came with, then replace the earlier build with them.
    func commit() throws -> [String: Any] {
        guard !closed else { throw BridgeError("no_build", "this export has ended") }
        let fm = FileManager.default
        let now: Plan
        var total = 0
        do {
            // 1: what was staged is what its manifest lists, file for file, size for size, hash for hash
            guard written.contains(Self.manifest) else { throw BridgeError("failed", "the export wrote no \(Self.manifest)") }
            let want: [Row]
            do { want = try Self.rows(stage.appendingPathComponent(Self.manifest)) } catch let e as BridgeError { throw BridgeError("failed", "the export \(e.message)") }
            let listed = Set(want.map(\.path)), staged = Set(written.filter { $0 != Self.manifest })
            let missing = listed.subtracting(staged).sorted(), extra = staged.subtracting(listed).sorted()
            guard missing.isEmpty, extra.isEmpty else {
                throw BridgeError("failed", "the export's files are not the ones its manifest lists (\(missing.count) missing\(missing.isEmpty ? "" : ": " + Self.few(missing)); \(extra.count) not listed\(extra.isEmpty ? "" : ": " + Self.few(extra)))")
            }
            for row in want {
                let file = stage.appendingPathComponent(row.path)
                guard Self.size(file) == row.bytes, Self.sha256(file) == row.sha256 else { throw BridgeError("failed", "\(row.path) was not written whole: it is not the file the manifest lists") }
                total += row.bytes
            }
            // 2: the folder as it is now, decided again before anything of it is touched
            now = try Self.plan(root)
        } catch { drop(); dropRoot(); throw error }

        let held = stage.appendingPathComponent(Self.held), manifestURL = root.appendingPathComponent(Self.manifest)
        var away: [String] = [], made: [URL] = [], arrived: [String] = [], replaced = false
        do {
            // 3: the earlier build's files out of the way (its manifest stays: it still says what the folder holds),
            //    then its folders, so a path that was a folder can be a file now and a folder's name can change its case
            try fm.createDirectory(at: held, withIntermediateDirectories: false)
            for f in now.old {
                var ignored: [URL] = []
                try Self.folders(held, f, made: &ignored)
                if f == Self.manifest { try fm.copyItem(at: manifestURL, to: held.appendingPathComponent(f)); continue }
                try fm.moveItem(at: root.appendingPathComponent(f), to: held.appendingPathComponent(f)); away.append(f)
            }
            for f in now.junk where f.contains("/") { try fm.removeItem(at: root.appendingPathComponent(f)) } // a .DS_Store in a folder of the build's
            for d in now.dirs.sorted(by: { $0.count > $1.count }) {
                guard rmdir(root.appendingPathComponent(d).path) == 0 else { throw BridgeError("failed", "\(d) could not be cleared: something else is in it") }
            }
            // 4: the new manifest over the old in one step, then the files it lists. From here the folder's manifest is
            //    the new build's, and every file in the folder is one it lists
            guard rename(stage.appendingPathComponent(Self.manifest).path, manifestURL.path) == 0 else { throw BridgeError("failed", "the manifest could not be put in place") }
            replaced = true
            for rel in written where rel != Self.manifest {
                try Self.folders(root, rel, made: &made)
                let to = root.appendingPathComponent(rel)
                guard Self.type(to) == nil else { throw BridgeError("failed", "\(rel) is in the way in \(root.lastPathComponent)") }
                try fm.moveItem(at: stage.appendingPathComponent(rel), to: to); arrived.append(rel)
            }
        } catch {
            // put the earlier build back as it was
            for rel in arrived { try? fm.removeItem(at: root.appendingPathComponent(rel)) }
            for d in made.reversed() { _ = rmdir(d.path) }
            if replaced {
                if now.hasManifest { _ = rename(held.appendingPathComponent(Self.manifest).path, manifestURL.path) } else { try? fm.removeItem(at: manifestURL) }
            }
            for f in away {
                var ignored: [URL] = []
                if (try? Self.folders(root, f, made: &ignored)) != nil { try? fm.moveItem(at: held.appendingPathComponent(f), to: root.appendingPathComponent(f)) }
            }
            drop()
            throw error
        }
        drop()
        return ["path": root.path, "name": root.lastPathComponent, "files": written.count - 1, "bytes": total]
    }

    /// Drop what this export wrote: the folder is as it was.
    func abort() {
        guard !closed else { return }
        drop(); dropRoot()
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
        guard let offset = p.raw["offset"] == nil ? 0 : BuildFolder.integer(p.raw["offset"]), offset >= 0 else { throw BridgeError("bad_params", "\"offset\" is where the piece begins, a whole number") }
        try folder.write(rel, data, offset: offset)
        return ["path": rel, "bytes": data.count]
    }

    func endBuild(_ p: BridgeParams) throws -> Any? {
        let folder = try openBuild(p)
        defer { build = nil }
        return try folder.commit() // on any failure it has put the folder back as it was and dropped its staging
    }

    func abortBuild(_ p: BridgeParams) throws -> Any? {
        let folder = try openBuild(p)
        folder.abort(); build = nil
        return ["aborted": true]
    }
}
