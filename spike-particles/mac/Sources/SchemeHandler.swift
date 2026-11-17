import Foundation
import WebKit

/// Serves `Resources/web` as `vrmxg-spike://app/…`, the way the avatar studio's AppSchemeHandler
/// does, plus the cross-origin isolation headers (COOP/COEP/CORP) so the page can report whether
/// WebKit grants `crossOriginIsolated` to a custom-scheme origin.
final class SchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "vrmxg-particles"
    let root: URL

    init(root: URL) { self.root = root.standardizedFileURL }

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        guard let url = task.request.url else { task.didFailWithError(URLError(.badURL)); return }
        let (status, type, data) = WebFiles.read(root: root, path: url.path)
        let headers = WebFiles.headers(type: type, length: data.count)
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
}

/// Shared by the scheme handler and the loopback server.
enum WebFiles {
    static func read(root: URL, path rawPath: String) -> (Int, String, Data) {
        var path = rawPath.removingPercentEncoding ?? rawPath
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file, options: .mappedIfSafe) else {
            return (404, "text/plain; charset=utf-8", Data("not found: \(path)".utf8))
        }
        return (200, mimeType(file.pathExtension), data)
    }

    static func headers(type: String, length: Int) -> [String: String] {
        [
            "Content-Type": type,
            "Content-Length": String(length),
            "Cache-Control": "no-cache",
            // Cross-origin isolation: what SharedArrayBuffer (threaded WASM) needs.
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
            "Cross-Origin-Resource-Policy": "same-origin",
        ]
    }

    static func mimeType(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "wasm": return "application/wasm"
        case "vrm", "vrma", "glb": return "model/gltf-binary"
        case "png": return "image/png"
        case "svg": return "image/svg+xml"
        default: return "application/octet-stream"
        }
    }
}
