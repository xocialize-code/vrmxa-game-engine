import Foundation
import WebKit

/// Serves `WebRoots` as `<scheme>://app/…`, the avatar studio's way, with the cross-origin isolation headers.
public final class SchemeHandler: NSObject, WKURLSchemeHandler {
    public let scheme: String
    let roots: WebRoots

    public init(scheme: String, roots: WebRoots) { self.scheme = scheme; self.roots = roots }

    public func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        guard let url = task.request.url else { task.didFailWithError(URLError(.badURL)); return }
        let r = roots.read(path: url.path)
        let response = HTTPURLResponse(url: url, statusCode: r.status, httpVersion: "HTTP/1.1", headerFields: WebRoots.headers(type: r.type, length: r.data.count))!
        task.didReceive(response)
        task.didReceive(r.data)
        task.didFinish()
    }

    public func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
}
