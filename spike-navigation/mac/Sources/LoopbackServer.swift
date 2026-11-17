import Foundation
import Network

/// A tiny HTTP/1.1 server on 127.0.0.1 serving the same folder with the same headers: the
/// alternative origin for when a custom scheme isn't treated as isolatable. GET only, one
/// request per connection (Connection: close). Enough for a spike; not a production server.
final class LoopbackServer: @unchecked Sendable { // state is only touched on `queue`
    let root: URL
    private var listener: NWListener?
    private(set) var port: UInt16 = 0
    private let queue = DispatchQueue(label: "vrmxg-nav.loopback")

    init(root: URL) { self.root = root.standardizedFileURL }

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
        listener.newConnectionHandler = { [weak self] conn in self?.handle(conn) }
        listener.start(queue: queue)
        self.listener = listener
    }

    private func handle(_ conn: NWConnection) {
        conn.start(queue: queue)
        receive(conn, buffer: Data())
    }

    private func receive(_ conn: NWConnection, buffer: Data) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, done, error in
            guard let self else { return }
            var buf = buffer
            if let data { buf.append(data) }
            if let end = buf.range(of: Data("\r\n\r\n".utf8)) {
                let head = String(decoding: buf[..<end.lowerBound], as: UTF8.self)
                self.respond(conn, requestHead: head)
            } else if done || error != nil {
                conn.cancel()
            } else {
                self.receive(conn, buffer: buf)
            }
        }
    }

    private func respond(_ conn: NWConnection, requestHead: String) {
        let first = requestHead.split(separator: "\r\n").first.map(String.init) ?? ""
        let parts = first.split(separator: " ")
        let target = parts.count > 1 ? String(parts[1]) : "/"
        let path = String(target.split(separator: "?", maxSplits: 1).first ?? "/")
        let (status, type, body) = WebFiles.read(root: root, path: path)
        var head = "HTTP/1.1 \(status) \(status == 200 ? "OK" : "Not Found")\r\n"
        for (k, v) in WebFiles.headers(type: type, length: body.count) { head += "\(k): \(v)\r\n" }
        head += "Connection: close\r\n\r\n"
        var out = Data(head.utf8)
        out.append(body)
        conn.send(content: out, completion: .contentProcessed { _ in conn.cancel() })
    }
}
