import Foundation

/// A binary POST from the page: the path, its query, and the body as it arrived.
public struct PostRequest: Sendable {
    public let path: String
    public let query: [String: String]
    public let body: Data
    public init(path: String, query: String, body: Data) {
        self.path = path
        self.body = body
        var q: [String: String] = [:]
        for part in query.split(separator: "&") {
            let kv = part.split(separator: "=", maxSplits: 1).map { String($0).removingPercentEncoding ?? String($0) }
            if let k = kv.first { q[k] = kv.count > 1 ? kv[1] : "" }
        }
        self.query = q
    }
    public func int(_ key: String) -> Int? { query[key].flatMap(Int.init) }
}

/// Answers a POST: an HTTP status and a JSON body. Call it exactly once, from any thread, when the body has been
/// consumed: the page's `fetch` resolves then, which is the backpressure a frame exporter needs.
public typealias PostReply = @Sendable (Int, Data) -> Void
public typealias PostHandler = @Sendable (PostRequest, @escaping PostReply) -> Void

/// Binary uploads from the page, the way bytes cross the WebKit boundary fastest (spike-frame-export: typed arrays
/// don't cross `postMessage`, a `Blob` body arrives empty, an `ArrayBuffer` / typed-array body arrives whole).
/// Shared by the scheme handler and the loopback server; routes by path prefix.
public final class PostRouter: @unchecked Sendable { // `routes` is guarded by `lock`
    private var routes: [(prefix: String, handler: PostHandler)] = []
    private let lock = NSLock()
    public init() {}

    public func register(_ prefix: String, _ handler: @escaping PostHandler) { lock.withLock { routes.append((prefix, handler)) } }

    public func handles(_ path: String) -> Bool { lock.withLock { routes.contains { path.hasPrefix($0.prefix) } } }

    public func handle(_ request: PostRequest, reply: @escaping PostReply) {
        let route = lock.withLock { routes.first { request.path.hasPrefix($0.prefix) } }
        guard let route else { reply(404, Self.json(["error": "no POST route for \(request.path)"])); return }
        route.handler(request, reply)
    }

    public static func json(_ obj: Any) -> Data {
        (try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])) ?? Data("{}".utf8)
    }

    /// Response headers for a POST: JSON, never cached, and readable cross-origin, so a page served over loopback can
    /// POST to the custom scheme (the faster transport) as well as to its own origin.
    public static func headers(length: Int) -> [String: String] {
        ["Content-Type": "application/json", "Content-Length": String(length), "Cache-Control": "no-store",
         "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type",
         "Cross-Origin-Resource-Policy": "cross-origin"]
    }
}
