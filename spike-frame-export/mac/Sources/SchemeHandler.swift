import Foundation
import WebKit

/// Serves `Resources/web` as `vrmxg-export://app/…` (GET), and takes binary POSTs from the page:
///   POST __frame?n=      raw RGBA (readPixels) → the frame sink
///   POST __framepng?n=   a PNG (canvas.toBlob) → the frame sink
///   POST __save?name=    a finished file (the WebCodecs MP4) → videos/
/// The response is sent only once Swift has consumed the body: that is the page's backpressure.
@MainActor
final class SchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "vrmxg-export"
    let root: URL
    let posts: PostRouter
    private var stopped = Set<ObjectIdentifier>()
    var bodyKinds: [String: Int] = [:] // how WebKit handed us POST bodies: httpBody vs httpBodyStream

    init(root: URL, posts: PostRouter) {
        self.root = root.standardizedFileURL
        self.posts = posts
    }

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        guard let url = task.request.url else { task.didFailWithError(URLError(.badURL)); return }
        let id = ObjectIdentifier(task)
        if task.request.httpMethod == "POST" {
            var body = task.request.httpBody
            if body != nil { bodyKinds["httpBody", default: 0] += 1 }
            if body == nil, let stream = task.request.httpBodyStream {
                bodyKinds["httpBodyStream", default: 0] += 1
                body = PostRouter.readAll(stream)
            }
            nonisolated(unsafe) let t = task
            posts.handle(path: url.path, query: url.query ?? "", body: body ?? Data()) { status, json in
                DispatchQueue.main.async {
                    MainActor.assumeIsolated {
                        guard !self.stopped.contains(id) else { self.stopped.remove(id); return }
                        let data = Data(json.utf8)
                        let headers = ["Content-Type": "application/json", "Content-Length": String(data.count), "Cache-Control": "no-store"]
                        t.didReceive(HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!)
                        t.didReceive(data)
                        t.didFinish()
                    }
                }
            }
            return
        }
        let (status, type, data) = WebFiles.read(root: root, path: url.path)
        let headers = WebFiles.headers(type: type, length: data.count)
        task.didReceive(HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) { stopped.insert(ObjectIdentifier(task)) }
}

/// Shared by the scheme handler and the loopback server: what a POST does.
final class PostRouter: @unchecked Sendable {
    let sink: FrameSink
    let videosDir: URL
    init(sink: FrameSink, videosDir: URL) { self.sink = sink; self.videosDir = videosDir }

    static func readAll(_ stream: InputStream) -> Data {
        var out = Data()
        stream.open()
        defer { stream.close() }
        let size = 1 << 20
        let buf = UnsafeMutablePointer<UInt8>.allocate(capacity: size)
        defer { buf.deallocate() }
        while true {
            let n = stream.read(buf, maxLength: size)
            if n <= 0 { break }
            out.append(buf, count: n)
        }
        return out
    }

    static func param(_ query: String, _ key: String) -> String? {
        for pair in query.split(separator: "&") {
            let kv = pair.split(separator: "=", maxSplits: 1)
            if kv.count == 2, kv[0] == key { return String(kv[1]).removingPercentEncoding }
        }
        return nil
    }

    func handle(path: String, query: String, body: Data, reply: @escaping @Sendable (Int, String) -> Void) {
        let name = String(path.split(separator: "/").last ?? "")
        switch name {
        case "__frame", "__framepng":
            let n = Int(Self.param(query, "n") ?? "") ?? -1
            sink.submit(n, name == "__frame" ? .rgbaBottomUp(body) : .png(body)) { err in
                if let err { reply(500, "{\"error\":\"\(err.localizedDescription)\"}") } else { reply(200, "{\"n\":\(n),\"bytes\":\(body.count)}") }
            }
        case "__save":
            let file = (Self.param(query, "name") ?? "upload.bin").replacingOccurrences(of: "/", with: "_")
            let url = videosDir.appendingPathComponent(file)
            do { try body.write(to: url); reply(200, "{\"file\":\"\(url.path)\",\"bytes\":\(body.count)}") }
            catch { reply(500, "{\"error\":\"\(error.localizedDescription)\"}") }
        default:
            reply(404, "{\"error\":\"no route \(path)\"}")
        }
    }
}

/// Static files for both origins.
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
        ["Content-Type": type, "Content-Length": String(length), "Cache-Control": "no-cache"]
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
        case "wav": return "audio/wav"
        default: return "application/octet-stream"
        }
    }
}
