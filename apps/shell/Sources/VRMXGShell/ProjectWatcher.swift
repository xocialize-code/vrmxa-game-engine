import CoreServices
import Foundation

/// Watching files of the open project (shell 0.15.0, M6 W2, AB-T-0645: the editor's hot reload of a project's behaviours
/// while it plays). Only an app whose ShellConfiguration sets `watchesProject` has these methods: in every other app
/// (a game build among them) they don't exist, so nothing there can watch anything.
///
///   project.watch { paths }  → { watching }   the project files to watch (relative to it), replacing what was watched;
///                                             an empty list stops. At most 256, each inside the project folder
///   project.unwatch          → { watching: [] }
///   event project.changed { paths }           the watched files whose size, modification time or identity changed (an
///                                             editor's atomic save replaces the file), or that appeared or went
///
/// FSEvents reports what moved under the project folder; the shell then compares each watched file's signature, so a
/// change elsewhere in the project, or a file written again unchanged in size and time, says nothing. Mounting another
/// project stops the watch.
@MainActor
public final class ProjectWatcher {
    /// What a watched file is compared by: nil when it doesn't exist.
    struct Signature: Equatable { let size: Int; let mtime: Date; let id: UInt64 }

    /// The most paths one watch holds.
    static let maxPaths = 256

    let root: URL
    let onChange: @MainActor ([String]) -> Void
    private(set) var watched: [String: Signature?] = [:]
    private var stream: FSEventStreamRef?
    private var poll: Timer?
    /// How long FSEvents gathers events before it reports them.
    let latency: CFTimeInterval

    init(root: URL, latency: CFTimeInterval = 0.05, onChange: @escaping @MainActor ([String]) -> Void) {
        self.root = root.resolvingSymlinksInPath().standardizedFileURL; self.latency = latency; self.onChange = onChange
    }

    /// A project path as a file URL inside the project, its links resolved (a link leading outside is refused).
    func file(_ rel: String) throws -> URL {
        guard !rel.isEmpty, !rel.hasPrefix("/") else { throw BridgeError("bad_params", "\"\(rel)\" isn't a path inside the project") }
        let f = root.appendingPathComponent(rel).resolvingSymlinksInPath().standardizedFileURL
        guard f.path.hasPrefix(root.path + "/") else { throw BridgeError("bad_params", "\(rel) is outside the project") }
        return f
    }

    static func signature(_ f: URL) -> Signature? {
        guard let a = try? FileManager.default.attributesOfItem(atPath: f.path), (a[.type] as? FileAttributeType) == .typeRegular else { return nil }
        return Signature(size: (a[.size] as? NSNumber)?.intValue ?? 0, mtime: a[.modificationDate] as? Date ?? .distantPast, id: (a[.systemFileNumber] as? NSNumber)?.uint64Value ?? 0)
    }

    /// Watch these paths (replacing what was watched): each checked first, so a refused list changes nothing.
    func watch(_ rels: [String]) throws -> [String] {
        guard rels.count <= Self.maxPaths else { throw BridgeError("bad_params", "at most \(Self.maxPaths) paths a watch") }
        var next: [String: Signature?] = [:]
        for rel in rels { next[rel] = Self.signature(try file(rel)) }
        watched = next
        if watched.isEmpty { stop() } else if stream == nil && poll == nil { start() }
        return watched.keys.sorted()
    }

    /// Compare every watched file with what it was: the changed ones go to `onChange` (sorted), once each.
    func check() {
        var changed: [String] = []
        for (rel, was) in watched {
            let now = (try? file(rel)).flatMap(Self.signature)
            if now != was { watched[rel] = now; changed.append(rel) }
        }
        if !changed.isEmpty { onChange(changed.sorted()) }
    }

    private func start() {
        var context = FSEventStreamContext(version: 0, info: Unmanaged.passUnretained(self).toOpaque(), retain: nil, release: nil, copyDescription: nil)
        let callback: FSEventStreamCallback = { _, info, _, _, _, _ in
            guard let info else { return }
            let watcher = Unmanaged<ProjectWatcher>.fromOpaque(info).takeUnretainedValue()
            MainActor.assumeIsolated { watcher.check() } // the stream's queue is the main queue
        }
        let flags = UInt32(kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagNoDefer)
        if let s = FSEventStreamCreate(nil, callback, &context, [root.path] as CFArray, FSEventStreamEventId(kFSEventStreamEventIdSinceNow), latency, flags) {
            FSEventStreamSetDispatchQueue(s, DispatchQueue.main)
            if FSEventStreamStart(s) { stream = s; return }
            FSEventStreamInvalidate(s); FSEventStreamRelease(s)
        }
        // no FSEvents for this folder (a volume without them): look twice a second instead
        poll = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in MainActor.assumeIsolated { self?.check() } }
    }

    /// Stop watching anything.
    func stop() {
        watched = [:]
        if let s = stream { FSEventStreamStop(s); FSEventStreamInvalidate(s); FSEventStreamRelease(s); stream = nil }
        poll?.invalidate(); poll = nil
    }

    var isRunning: Bool { stream != nil || poll != nil }
}

/// The `project.watch` bridge methods over the mounted project (registered only when the app's configuration has
/// `watchesProject`): a watcher per mounted folder, stopped when another is mounted.
@MainActor
public final class WatchMethods {
    let files: FileMethods
    let emit: @MainActor (String, [String: Any]) -> Void
    var watcher: ProjectWatcher?

    public init(files: FileMethods, emit: @escaping @MainActor (String, [String: Any]) -> Void) {
        self.files = files; self.emit = emit
    }

    public func register(on router: BridgeRouter) {
        router.register("project.watch") { [unowned self] p in try self.watch(p) }
        router.register("project.unwatch") { [unowned self] _ in self.stop(); return ["watching": [String]()] }
        files.mounted.append { [unowned self] in self.stop() } // another project: nothing of the last one is watched
    }

    func watch(_ p: BridgeParams) throws -> Any? {
        guard let paths = p.strings("paths") else { throw BridgeError("bad_params", "project.watch needs paths") }
        guard let root = files.roots.projectFolder else { throw BridgeError("no_project", "no project is open") }
        if watcher?.root != root.resolvingSymlinksInPath().standardizedFileURL {
            watcher?.stop()
            watcher = ProjectWatcher(root: root) { [unowned self] changed in self.emit("project.changed", ["paths": changed]) }
        }
        return ["watching": try watcher!.watch(paths)]
    }

    func stop() { watcher?.stop(); watcher = nil }
}
