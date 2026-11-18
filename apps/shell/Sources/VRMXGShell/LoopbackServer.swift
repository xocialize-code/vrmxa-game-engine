import Foundation
import Network

/// A small HTTP/1.1 server on 127.0.0.1 serving `WebRoots` with the same headers: the origin with a fine timer and
/// SharedArrayBuffer (AB-L-0346). GET and HEAD, one request per connection (Connection: close). Not a production server.
public final class LoopbackServer: @unchecked Sendable { // state is only touched on `queue`
    let roots: WebRoots
    private var listener: NWListener?
    public private(set) var port: UInt16 = 0
    private let queue = DispatchQueue(label: "vrmxg-shell.loopback")

    public init(roots: WebRoots) { self.roots = roots }

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
        conn.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, done, error in
            guard let self else { return }
            var buf = buffer
            if let data { buf.append(data) }
            if let end = buf.range(of: Data("\r\n\r\n".utf8)) {
                self.respond(conn, requestHead: String(decoding: buf[..<end.lowerBound], as: UTF8.self))
            } else if done || error != nil {
                conn.cancel()
            } else {
                self.receive(conn, buffer: buf)
            }
        }
    }

    /// The response for a request head, as bytes (public for tests).
    public func response(forRequestHead head: String) -> Data {
        let first = head.split(separator: "\r\n").first.map(String.init) ?? ""
        let parts = first.split(separator: " ")
        let method = parts.first.map(String.init) ?? "GET"
        let target = parts.count > 1 ? String(parts[1]) : "/"
        let path = String(target.split(separator: "?", maxSplits: 1).first ?? "/")
        guard method == "GET" || method == "HEAD" else { return Data("HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".utf8) }
        let r = roots.read(path: path)
        var out = "HTTP/1.1 \(r.status) \(r.status == 200 ? "OK" : "Not Found")\r\n"
        for (k, v) in WebRoots.headers(type: r.type, length: r.data.count).sorted(by: { $0.key < $1.key }) { out += "\(k): \(v)\r\n" }
        out += "Connection: close\r\n\r\n"
        var data = Data(out.utf8)
        if method == "GET" { data.append(r.data) }
        return data
    }

    private func respond(_ conn: NWConnection, requestHead: String) {
        conn.send(content: response(forRequestHead: requestHead), completion: .contentProcessed { _ in conn.cancel() })
    }
}
