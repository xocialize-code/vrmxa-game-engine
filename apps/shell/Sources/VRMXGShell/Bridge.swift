import Foundation
import WebKit

/// An error a bridge method returns to the page: the page's promise rejects with `{ code, message }`.
public struct BridgeError: Error, Sendable {
    public let code: String
    public let message: String
    public init(_ code: String, _ message: String) { self.code = code; self.message = message }
}

/// A request's parameters, read with types.
public struct BridgeParams: @unchecked Sendable { // holds plist-like values from WebKit
    public let raw: [String: Any]
    public init(_ raw: [String: Any]) { self.raw = raw }
    public func string(_ key: String) -> String? { raw[key] as? String }
    public func strings(_ key: String) -> [String]? { raw[key] as? [String] }
    public func bool(_ key: String) -> Bool? { raw[key] as? Bool }
    public func number(_ key: String) -> Double? { (raw[key] as? NSNumber)?.doubleValue }
    public func require(_ key: String) throws -> String {
        guard let v = string(key) else { throw BridgeError("bad_params", "missing string parameter \"\(key)\"") }
        return v
    }
}

/// A bridge method: parameters in, a JSON-like value out (dictionaries, arrays, strings, numbers, booleans, nil).
public typealias BridgeHandler = @MainActor (BridgeParams) async throws -> Any?

/// Dispatches `{ method, params }` messages from the page to registered handlers. Separate from WebKit so it can
/// be tested; `ShellBridge` adapts it to `WKScriptMessageHandlerWithReply`.
@MainActor
public final class BridgeRouter {
    private var handlers: [String: BridgeHandler] = [:]
    public init() {}

    public func register(_ method: String, _ handler: @escaping BridgeHandler) { handlers[method] = handler }
    public var methods: [String] { handlers.keys.sorted() }

    /// The reply for one message body: (result, nil) or (nil, error JSON).
    public func handle(body: Any) async -> (Any?, String?) {
        guard let msg = body as? [String: Any], let method = msg["method"] as? String else {
            return (nil, Self.errorJSON(BridgeError("bad_request", "a message is { method, params }")))
        }
        guard let handler = handlers[method] else {
            return (nil, Self.errorJSON(BridgeError("unknown_method", "no bridge method \"\(method)\"; there are: \(methods.joined(separator: ", "))")))
        }
        do {
            let result = try await handler(BridgeParams(msg["params"] as? [String: Any] ?? [:]))
            return (result ?? NSNull(), nil)
        } catch let e as BridgeError {
            return (nil, Self.errorJSON(e))
        } catch {
            return (nil, Self.errorJSON(BridgeError("failed", error.localizedDescription)))
        }
    }

    static func errorJSON(_ e: BridgeError) -> String {
        let obj: [String: String] = ["code": e.code, "message": e.message]
        return String(decoding: (try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])) ?? Data(), as: UTF8.self)
    }
}

/// The page's `window.webkit.messageHandlers.vrmxg.postMessage({ method, params })`, answered with a promise.
@MainActor
public final class ShellBridge: NSObject, WKScriptMessageHandlerWithReply {
    public static let name = "vrmxg"
    public let router: BridgeRouter
    public init(router: BridgeRouter) { self.router = router }

    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) async -> (Any?, String?) {
        await router.handle(body: message.body)
    }

    /// Send an event to the page: `addEventListener('vrmxg-shell', e => e.detail.name …)`.
    public static func emit(_ webView: WKWebView, _ name: String, _ payload: [String: Any] = [:]) {
        let detail: [String: Any] = ["name": name, "payload": payload]
        guard let data = try? JSONSerialization.data(withJSONObject: detail), let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('vrmxg-shell', { detail: \(json) }))")
    }
}
