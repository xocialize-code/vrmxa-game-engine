import CryptoKit
import Foundation

/// A cache the page can write in the sandbox (shell 0.13.0, M5 W6, AB-T-0606: the editor's asset thumbnails): small
/// binary entries by key, in Caches/<bundle id>/<app>/ inside the app's container. The page's own storage can't keep them
/// in a Mac app (the loopback origin's port changes every launch), and the project folder isn't the place for them.
/// An entry's file is named by the SHA-256 of its key, so any key is safe; the system may empty Caches at any time, so a
/// miss is always an answer, never an error.
/// VRMXG_SHELL_CACHE=<folder> moves it (automation and tests; a relative path is under the temporary directory).
///   cache.read { key } → { base64 } (base64 null on a miss)
///   cache.write { key, base64 } → { bytes }   (atomic; at most 4 MiB an entry)
@MainActor
public final class CacheMethods {
    let folder: URL
    /// The largest entry the cache keeps: a thumbnail is a few kilobytes.
    static let maxBytes = 4 << 20

    public init(appName: String, env: [String: String] = ProcessInfo.processInfo.environment) {
        if let v = env["VRMXG_SHELL_CACHE"], !v.isEmpty {
            folder = v.hasPrefix("/") ? URL(fileURLWithPath: v) : URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(v)
        } else {
            let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            folder = base.appendingPathComponent(Bundle.main.bundleIdentifier ?? appName).appendingPathComponent("vrmxg-cache")
        }
    }

    public func register(on router: BridgeRouter) {
        router.register("cache.read") { [unowned self] p in try self.read(p) }
        router.register("cache.write") { [unowned self] p in try self.write(p) }
    }

    func file(_ key: String) -> URL {
        let name = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        return folder.appendingPathComponent(name)
    }

    func read(_ p: BridgeParams) throws -> Any? {
        let key = try p.require("key")
        guard let data = try? Data(contentsOf: file(key)) else { return ["base64": NSNull()] }
        return ["base64": data.base64EncodedString()]
    }

    func write(_ p: BridgeParams) throws -> Any? {
        let key = try p.require("key")
        guard let b64 = p.string("base64"), let data = Data(base64Encoded: b64) else { throw BridgeError("bad_params", "cache.write needs base64") }
        guard data.count <= Self.maxBytes else { throw BridgeError("bad_params", "a cache entry is at most \(Self.maxBytes) bytes (\(data.count))") }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try data.write(to: file(key), options: .atomic)
        return ["bytes": data.count]
    }
}
