import Foundation
import Network

/// A small HTTP/1.1 server on 127.0.0.1 serving `WebRoots` with the same headers: the origin with a fine timer and
/// SharedArrayBuffer (AB-L-0346). GET and HEAD, plus POST with a Content-Length body for the routes a `PostRouter`
/// knows (answered once the body is consumed); one request per connection (Connection: close). Not a production server.
public final class LoopbackServer: @unchecked Sendable { // state is only touched on `queue`
    let roots: WebRoots
    let posts: PostRouter
    private var listener: NWListener?
    public private(set) var port: UInt16 = 0
    private let queue = DispatchQueue(label: "vrmxg-shell.loopback")

    public init(roots: WebRoots, posts: PostRouter = PostRouter()) { self.roots = roots; self.posts = posts }

    /// Start listening on an ephemeral port; `ready` runs on the main actor with the port.
    public func start(ready: @escaping @Sendable @MainActor (UInt16) -> Void) throws {
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: .any)
        let listener = try NWListener(using: params)
        listener.stateUpdateHandler = { [weak self] state in
            if case .ready = state, let p = listener.port?.rawValue {
                self?.port = p
                DispatchQueue.main.async { MainActor.assumeIsolated { ready(p) } }
            }
        }
        listener.newConnectionHandler = { [weak self] conn in self?.handle(conn) }
        listener.start(queue: queue)
        self.listener = listener
    }

    public func stop() { listener?.cancel(); listener = nil }

    private func handle(_ conn: NWConnection) {
        conn.start(queue: queue)
        receive(conn, buffer: Data())
    }

    private func receive(_ conn: NWConnection, buffer: Data) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 4 << 20) { [weak self] data, _, done, error in
            guard let self else { return }
            var buf = buffer
            if let data { buf.append(data) }
            if let end = buf.range(of: Data("\r\n\r\n".utf8)) {
                let head = String(decoding: buf[..<end.lowerBound], as: UTF8.self)
                let length = Self.contentLength(head)
                if length > 0 {
                    var body = Data(buf[end.upperBound...])
                    body.reserveCapacity(length)
                    if body.count >= length { self.respond(conn, head: head, body: body.prefix(length)) }
                    else { self.receiveBody(conn, head: head, body: body, length: length) }
                } else {
                    self.respond(conn, head: head, body: Data())
                }
            } else if done || error != nil {
                conn.cancel()
            } else {
                self.receive(conn, buffer: buf)
            }
        }
    }

    private func receiveBody(_ conn: NWConnection, head: String, body: Data, length: Int) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: max(1, min(length - body.count, 8 << 20))) { [weak self] data, _, done, error in
            guard let self else { return }
            var b = body
            if let data { b.append(data) }
            if b.count >= length { self.respond(conn, head: head, body: b.prefix(length)) }
            else if done || error != nil { conn.cancel() }
            else { self.receiveBody(conn, head: head, body: b, length: length) }
        }
    }

    static func contentLength(_ head: String) -> Int {
        for line in head.split(separator: "\r\n").dropFirst() {
            let kv = line.split(separator: ":", maxSplits: 1)
            if kv.count == 2, kv[0].trimmingCharacters(in: .whitespaces).lowercased() == "content-length" { return Int(kv[1].trimmingCharacters(in: .whitespaces)) ?? 0 }
        }
        return 0
    }

    static func requestLine(_ head: String) -> (method: String, path: String, query: String) {
        let first = head.split(separator: "\r\n").first.map(String.init) ?? ""
        let parts = first.split(separator: " ")
        let method = parts.first.map(String.init) ?? "GET"
        let target = parts.count > 1 ? String(parts[1]) : "/"
        let pq = target.split(separator: "?", maxSplits: 1).map(String.init)
        return (method, pq.first ?? "/", pq.count > 1 ? pq[1] : "")
    }

    /// The response for a request head, as bytes (public for tests). POSTs go through `respond`.
    public func response(forRequestHead head: String) -> Data {
        let (method, path, _) = Self.requestLine(head)
        if method == "OPTIONS" && posts.handles(path) { return Self.raw(204, PostRouter.headers(length: 0), Data()) }
        guard method == "GET" || method == "HEAD" else { return Data("HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".utf8) }
        let r = roots.read(path: path)
        return Self.raw(r.status, WebRoots.headers(type: r.type, length: r.data.count), method == "GET" ? r.data : Data())
    }

    static func raw(_ status: Int, _ headers: [String: String], _ body: Data) -> Data {
        let reason = [200: "OK", 204: "No Content", 400: "Bad Request", 404: "Not Found", 409: "Conflict", 500: "Internal Server Error"][status] ?? "Status"
        var out = "HTTP/1.1 \(status) \(reason)\r\n"
        for (k, v) in headers.sorted(by: { $0.key < $1.key }) { out += "\(k): \(v)\r\n" }
        out += "Connection: close\r\n\r\n"
        var data = Data(out.utf8)
        data.append(body)
        return data
    }

    private func respond(_ conn: NWConnection, head: String, body: Data) {
        let (method, path, query) = Self.requestLine(head)
        if method == "POST" && posts.handles(path) {
            posts.handle(PostRequest(path: path, query: query, body: Data(body))) { status, data in
                conn.send(content: Self.raw(status, PostRouter.headers(length: data.count), data), completion: .contentProcessed { _ in conn.cancel() })
            }
            return
        }
        conn.send(content: response(forRequestHead: head), completion: .contentProcessed { _ in conn.cancel() })
    }
}
