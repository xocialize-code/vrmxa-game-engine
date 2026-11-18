import Foundation
import WebKit

/// Serves `WebRoots` as `<scheme>://app/…`, the avatar studio's way, with the cross-origin isolation headers, and
/// hands binary POSTs to the `PostRouter` (answered once the body is consumed; CORS preflights answered here).
@MainActor
public final class SchemeHandler: NSObject, WKURLSchemeHandler {
    public let scheme: String
    let roots: WebRoots
    let posts: PostRouter
    private var stopped = Set<ObjectIdentifier>()

    public init(scheme: String, roots: WebRoots, posts: PostRouter = PostRouter()) { self.scheme = scheme; self.roots = roots; self.posts = posts }

    public func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        guard let url = task.request.url else { task.didFailWithError(URLError(.badURL)); return }
        let method = task.request.httpMethod ?? "GET"
        if method == "OPTIONS" {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 204, httpVersion: "HTTP/1.1", headerFields: PostRouter.headers(length: 0))!)
            task.didFinish()
            return
        }
        if method == "POST" {
            var body = task.request.httpBody
            if body == nil, let stream = task.request.httpBodyStream { body = Self.readAll(stream) }
            let id = ObjectIdentifier(task)
            nonisolated(unsafe) let t = task
            posts.handle(PostRequest(path: url.path, query: url.query ?? "", body: body ?? Data())) { status, data in
                DispatchQueue.main.async {
                    MainActor.assumeIsolated {
                        if self.stopped.remove(id) != nil { return } // the page gave up on it
                        t.didReceive(HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: PostRouter.headers(length: data.count))!)
                        t.didReceive(data)
                        t.didFinish()
                    }
                }
            }
            return
        }
        let r = roots.read(path: url.path)
        let response = HTTPURLResponse(url: url, statusCode: r.status, httpVersion: "HTTP/1.1", headerFields: WebRoots.headers(type: r.type, length: r.data.count))!
        task.didReceive(response)
        task.didReceive(r.data)
        task.didFinish()
    }

    public func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) { stopped.insert(ObjectIdentifier(task)) }

    static func readAll(_ stream: InputStream) -> Data {
        var out = Data(), buf = [UInt8](repeating: 0, count: 1 << 20)
        stream.open(); defer { stream.close() }
        while true { let n = stream.read(&buf, maxLength: buf.count); if n <= 0 { break }; out.append(buf, count: n) }
        return out
    }
}
