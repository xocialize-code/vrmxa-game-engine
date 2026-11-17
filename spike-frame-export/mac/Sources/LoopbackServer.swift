import Foundation
import Network

/// A tiny HTTP/1.1 server on 127.0.0.1: GET serves the web folder, POST goes to the same PostRouter as
/// the custom scheme. Keep-alive, Content-Length bodies only. Enough for a spike; not a production server.
final class LoopbackServer: @unchecked Sendable { // state is only touched on `queue`
    let root: URL
    let posts: PostRouter
    private var listener: NWListener?
    private(set) var port: UInt16 = 0
    private let queue = DispatchQueue(label: "vrmxg.loopback")

    init(root: URL, posts: PostRouter) { self.root = root.standardizedFileURL; self.posts = posts }

    func start(ready: @escaping @Sendable @MainActor (UInt16) -> Void) throws {
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: .any)
        let listener = try NWListener(using: params)
        listener.stateUpdateHandler = { [weak self] state in
            if case .ready = state, let p = listener.port?.rawValue {
                self?.port = p
                DispatchQueue.main.async { MainActor.assumeIsolated { ready(p) } }
            }
        }
        listener.newConnectionHandler = { [weak self] conn in
            guard let self else { return }
            conn.start(queue: self.queue)
            self.receive(conn, Pending())
        }
        listener.start(queue: queue)
        self.listener = listener
    }

    /// Per-connection buffer as a reference, so appending never copies what is already there.
    final class Pending: @unchecked Sendable { var buf = Data(); var bodyStart = -1; var length = 0; var head = "" }

    private func receive(_ conn: NWConnection, _ st: Pending) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 8 << 20) { [weak self] data, _, done, error in
            guard let self else { return }
            if let data { st.buf.append(data) }
            if st.bodyStart < 0, let end = st.buf.range(of: Data("\r\n\r\n".utf8)) {
                let head = String(decoding: st.buf[..<end.lowerBound], as: UTF8.self)
                let lines = head.split(separator: "\r\n")
                st.head = String(lines.first ?? "")
                for l in lines.dropFirst() {
                    let kv = l.split(separator: ":", maxSplits: 1)
                    if kv.count == 2, kv[0].lowercased() == "content-length" { st.length = Int(kv[1].trimmingCharacters(in: .whitespaces)) ?? 0 }
                }
                st.bodyStart = end.upperBound
                st.buf.reserveCapacity(st.bodyStart + st.length)
            }
            if st.bodyStart >= 0, st.buf.count - st.bodyStart >= st.length {
                let body = st.buf.subdata(in: st.bodyStart..<(st.bodyStart + st.length))
                let next = Pending()
                next.buf = st.buf.subdata(in: (st.bodyStart + st.length)..<st.buf.count)
                self.respond(conn, head: st.head, body: body, next: next)
                return
            }
            if done || error != nil { conn.cancel(); return }
            self.receive(conn, st)
        }
    }

    private func respond(_ conn: NWConnection, head first: String, body: Data, next: Pending) {
        let parts = first.split(separator: " ")
        let method = parts.first.map(String.init) ?? "GET"
        let target = parts.count > 1 ? String(parts[1]) : "/"
        let split = target.split(separator: "?", maxSplits: 1)
        let path = String(split.first ?? "/")
        let query = split.count > 1 ? String(split[1]) : ""
        if method == "POST" {
            posts.handle(path: path, query: query, body: body) { [weak self] status, json in
                let data = Data(json.utf8)
                var out = Data("HTTP/1.1 \(status) OK\r\nContent-Type: application/json\r\nContent-Length: \(data.count)\r\nConnection: keep-alive\r\n\r\n".utf8)
                out.append(data)
                conn.send(content: out, completion: .contentProcessed { _ in self?.queue.async { self?.receive(conn, next) } })
            }
            return
        }
        let (status, type, file) = WebFiles.read(root: root, path: path)
        var head = "HTTP/1.1 \(status) \(status == 200 ? "OK" : "Not Found")\r\n"
        for (k, v) in WebFiles.headers(type: type, length: file.count) { head += "\(k): \(v)\r\n" }
        head += "Connection: close\r\n\r\n"
        var out = Data(head.utf8)
        out.append(file)
        conn.send(content: out, completion: .contentProcessed { _ in conn.cancel() })
    }
}
