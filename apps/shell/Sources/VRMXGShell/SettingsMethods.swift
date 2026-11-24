import AppKit
import Foundation

/// An app's settings (shell 0.11.0, M5 W1, AB-D-0286): one small text document (the game app keeps JSON there) in the
/// app's own folder, Application Support/<bundle id>/settings.json, inside the sandbox container. The page's own storage
/// can't hold settings in a Mac app: its default origin is loopback on a new port every launch, so localStorage would
/// belong to another origin next time.
/// VRMXG_SHELL_SETTINGS=<file> moves it (automation and tests; a relative path is under the temporary directory).
///   settings.read → { text, path }   (text null when nothing is saved yet)
///   settings.write { text } → { bytes, path }   (atomic: the file holds the old text or the new, never part of one)
@MainActor
public final class SettingsMethods {
    let file: URL
    /// The largest settings document the shell keeps: settings are small, and a page that sends more has a bug.
    static let maxBytes = 256 * 1024

    public init(appName: String, env: [String: String] = ProcessInfo.processInfo.environment) {
        if let v = env["VRMXG_SHELL_SETTINGS"], !v.isEmpty {
            file = v.hasPrefix("/") ? URL(fileURLWithPath: v) : URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(v)
        } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            file = base.appendingPathComponent(Bundle.main.bundleIdentifier ?? appName).appendingPathComponent("settings.json")
        }
    }

    public func register(on router: BridgeRouter) {
        router.register("settings.read") { [unowned self] _ in try self.read() }
        router.register("settings.write") { [unowned self] p in try self.write(p) }
    }

    func read() throws -> Any? {
        guard FileManager.default.fileExists(atPath: file.path) else { return ["text": NSNull(), "path": file.path] }
        guard let data = try? Data(contentsOf: file), let text = String(data: data, encoding: .utf8) else {
            throw BridgeError("failed", "the settings file can't be read (\(file.lastPathComponent))")
        }
        return ["text": text, "path": file.path]
    }

    func write(_ p: BridgeParams) throws -> Any? {
        let text = try p.require("text")
        let data = Data(text.utf8)
        guard data.count <= Self.maxBytes else { throw BridgeError("bad_params", "settings are at most \(Self.maxBytes) bytes (\(data.count))") }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: file, options: .atomic)
        return ["bytes": data.count, "path": file.path]
    }
}
