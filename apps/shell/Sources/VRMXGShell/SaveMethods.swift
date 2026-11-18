import Foundation

/// Save slots (M2 W9): game saves in the app's own folder (Application Support/<bundle id>/Saves, inside the sandbox
/// container), so saving and loading need no panels. `<slot>.vrmxgsave` holds the save file (JSON text), and
/// `<slot>.summary.json` holds what a slot list shows. Slot names are letters, digits, - and _.
/// VRMXG_SHELL_SAVES=<folder> moves the folder (automation and tests; a relative path is under the temporary directory).
///   saves.list → { saves: [{ slot, bytes, summary }] }   saves.read { slot } → { text }
///   saves.write { slot, text, summary? } → { slot, bytes }   saves.remove { slot } → { slot }
@MainActor
public final class SaveMethods {
    let folder: URL
    public init(appName: String, env: [String: String] = ProcessInfo.processInfo.environment) {
        if let v = env["VRMXG_SHELL_SAVES"], !v.isEmpty {
            folder = v.hasPrefix("/") ? URL(fileURLWithPath: v) : URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(v)
        } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            folder = base.appendingPathComponent(Bundle.main.bundleIdentifier ?? appName).appendingPathComponent("Saves")
        }
    }

    public func register(on router: BridgeRouter) {
        router.register("saves.list") { [unowned self] _ in try self.list() }
        router.register("saves.read") { [unowned self] p in try self.read(p) }
        router.register("saves.write") { [unowned self] p in try self.write(p) }
        router.register("saves.remove") { [unowned self] p in try self.remove(p) }
    }

    func slot(_ p: BridgeParams) throws -> String {
        let s = try p.require("slot")
        guard !s.isEmpty, s.count <= 64, s.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }), s.unicodeScalars.allSatisfy({ $0.isASCII }) else {
            throw BridgeError("bad_params", "a slot is letters, digits, - and _ (\"\(s)\")")
        }
        return s
    }
    func file(_ slot: String) -> URL { folder.appendingPathComponent("\(slot).vrmxgsave") }
    func summaryFile(_ slot: String) -> URL { folder.appendingPathComponent("\(slot).summary.json") }

    func list() throws -> Any? {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let names = try FileManager.default.contentsOfDirectory(atPath: folder.path).filter { $0.hasSuffix(".vrmxgsave") }.sorted()
        let saves: [[String: Any]] = names.map { name in
            let slot = String(name.dropLast(".vrmxgsave".count))
            let bytes = (try? FileManager.default.attributesOfItem(atPath: file(slot).path)[.size] as? Int) ?? 0
            let summary = (try? Data(contentsOf: summaryFile(slot))).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
            return ["slot": slot, "bytes": bytes, "summary": summary]
        }
        return ["saves": saves, "folder": folder.path]
    }

    func read(_ p: BridgeParams) throws -> Any? {
        let s = try slot(p)
        guard let data = try? Data(contentsOf: file(s)), let text = String(data: data, encoding: .utf8) else { throw BridgeError("not_found", "no save \"\(s)\"") }
        return ["slot": s, "text": text]
    }

    func write(_ p: BridgeParams) throws -> Any? {
        let s = try slot(p), text = try p.require("text")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let data = Data(text.utf8)
        try data.write(to: file(s), options: .atomic)
        if let summary = p.raw["summary"] as? [String: Any], JSONSerialization.isValidJSONObject(summary) {
            try JSONSerialization.data(withJSONObject: summary, options: [.sortedKeys]).write(to: summaryFile(s), options: .atomic)
        }
        return ["slot": s, "bytes": data.count]
    }

    func remove(_ p: BridgeParams) throws -> Any? {
        let s = try slot(p)
        try? FileManager.default.removeItem(at: file(s))
        try? FileManager.default.removeItem(at: summaryFile(s))
        return ["slot": s]
    }
}
