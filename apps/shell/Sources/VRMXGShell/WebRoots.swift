import Foundation

/// What the shell serves: the app's own web build at `/`, an opened project folder at `/project/` (so a page
/// fetches project assets by URL on either origin), and single files the person opened at `/opened/<token>/<name>`.
/// With no project folder mounted, `/project/` is the web build's own `project/` folder (shell 0.11.0, M5 W1): where a
/// game build keeps its project's files, the build being the app's web content (apps/game-mac).
/// Shared by the scheme handler and the loopback server.
public final class WebRoots: @unchecked Sendable { // `project` and `opened` are guarded by `lock`
    public let app: URL
    private var project: URL?
    private var opened: [String: URL] = [:]
    private let lock = NSLock()

    public init(app: URL) { self.app = app.standardizedFileURL }

    public static let projectPrefix = "/project/"

    /// Mount (or with nil, unmount) a project folder at `/project/`.
    public func mountProject(_ url: URL?) { lock.withLock { project = url?.standardizedFileURL } }
    public var projectFolder: URL? { lock.withLock { project } }

    public static let openedPrefix = "/opened/"

    /// Serve one file the person opened, at an unguessable path; returns the path (`/opened/<token>/<name>`).
    public func serveOpened(_ file: URL) -> String {
        let token = UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: "")
        lock.withLock { opened[token] = file.standardizedFileURL }
        let name = file.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? "file"
        return "\(Self.openedPrefix)\(token)/\(name)"
    }

    /// Status, content type and bytes for a request path (query already removed).
    public func read(path rawPath: String) -> (status: Int, type: String, data: Data) {
        var path = rawPath.removingPercentEncoding ?? rawPath
        if path.isEmpty || path == "/" { path = "/index.html" }
        var root = app
        if path.hasPrefix(Self.openedPrefix) {
            let token = String(path.dropFirst(Self.openedPrefix.count).prefix { $0 != "/" })
            guard let file = lock.withLock({ opened[token] }), let data = try? Data(contentsOf: file, options: .mappedIfSafe) else { return Self.notFound(path) }
            return (200, Self.mimeType(file.pathExtension), data)
        }
        if path.hasPrefix(Self.projectPrefix), let p = projectFolder {
            root = p
            path = "/" + path.dropFirst(Self.projectPrefix.count)
        }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        var isDir: ObjCBool = false
        guard file.path.hasPrefix(root.path + "/"), FileManager.default.fileExists(atPath: file.path, isDirectory: &isDir), !isDir.boolValue,
              let data = try? Data(contentsOf: file, options: .mappedIfSafe) else { return Self.notFound(path) }
        return (200, Self.mimeType(file.pathExtension), data)
    }

    static func notFound(_ path: String) -> (Int, String, Data) { (404, "text/plain; charset=utf-8", Data("not found: \(path)".utf8)) }

    public static func headers(type: String, length: Int) -> [String: String] {
        [
            "Content-Type": type,
            "Content-Length": String(length),
            "Cache-Control": "no-cache",
            // Cross-origin isolation: what SharedArrayBuffer (threaded WASM) needs; loopback gets it, the scheme doesn't (AB-L-0346).
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
            "Cross-Origin-Resource-Policy": "same-origin",
        ]
    }

    public static func mimeType(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "vrmxs": return "application/json; charset=utf-8"
        case "wasm": return "application/wasm"
        case "vrm", "vrma", "glb": return "model/gltf-binary"
        case "vrmxa", "vrmxw", "vrmxi", "zip": return "application/zip"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "svg": return "image/svg+xml"
        case "wav": return "audio/wav"
        case "mp3": return "audio/mpeg"
        case "m4a": return "audio/mp4"
        case "md", "txt": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }
}
