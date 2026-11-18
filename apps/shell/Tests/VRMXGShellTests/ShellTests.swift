import Foundation
import Testing
@testable import VRMXGShell

func tempDir(_ files: [String: String]) throws -> URL {
    let d = FileManager.default.temporaryDirectory.appendingPathComponent("vrmxg-shell-\(UUID().uuidString)")
    for (rel, text) in files {
        let f = d.appendingPathComponent(rel)
        try FileManager.default.createDirectory(at: f.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(text.utf8).write(to: f)
    }
    return d
}

@Suite struct WebRootsTests {
    @Test func servesTheAppAndNothingOutsideIt() throws {
        let app = try tempDir(["index.html": "<p>hi</p>", "assets/a.js": "x", "../secret.txt": "no"])
        let r = WebRoots(app: app)
        #expect(r.read(path: "/").status == 200)
        #expect(String(decoding: r.read(path: "/").data, as: UTF8.self) == "<p>hi</p>")
        #expect(r.read(path: "/assets/a.js").type.hasPrefix("text/javascript"))
        #expect(r.read(path: "/../secret.txt").status == 404, "no path traversal")
        #expect(r.read(path: "/%2e%2e/secret.txt").status == 404, "not even percent-encoded")
        #expect(r.read(path: "/assets").status == 404, "a folder isn't a file")
        #expect(r.read(path: "/missing.js").status == 404)
    }

    @Test func mountsAProjectAtProjectSlash() throws {
        let app = try tempDir(["index.html": "app"]), proj = try tempDir(["cafe.vrmxs": "{}", "characters/mira.vrmxa": "PK"])
        let r = WebRoots(app: app)
        #expect(r.read(path: "/project/cafe.vrmxs").status == 404, "nothing mounted yet")
        r.mountProject(proj)
        #expect(r.read(path: "/project/cafe.vrmxs").status == 200)
        #expect(r.read(path: "/project/cafe.vrmxs").type.hasPrefix("application/json"))
        #expect(r.read(path: "/project/characters/mira.vrmxa").type == "application/zip")
        #expect(r.read(path: "/project/../index.html").status == 404)
        r.mountProject(nil)
        #expect(r.read(path: "/project/cafe.vrmxs").status == 404)
    }
}

@Suite struct LoopbackTests {
    @Test func getHeadAndOtherMethods() throws {
        let r = WebRoots(app: try tempDir(["index.html": "hello"]))
        let s = LoopbackServer(roots: r)
        let get = String(decoding: s.response(forRequestHead: "GET /index.html?x=1 HTTP/1.1\r\nHost: 127.0.0.1"), as: UTF8.self)
        #expect(get.hasPrefix("HTTP/1.1 200 OK"))
        #expect(get.contains("Cross-Origin-Embedder-Policy: require-corp"))
        #expect(get.hasSuffix("\r\n\r\nhello"))
        let head = String(decoding: s.response(forRequestHead: "HEAD / HTTP/1.1"), as: UTF8.self)
        #expect(head.contains("Content-Length: 5") && head.hasSuffix("\r\n\r\n"), "HEAD: headers, no body")
        #expect(String(decoding: s.response(forRequestHead: "POST / HTTP/1.1"), as: UTF8.self).hasPrefix("HTTP/1.1 405"))
        #expect(String(decoding: s.response(forRequestHead: "GET /nope HTTP/1.1"), as: UTF8.self).hasPrefix("HTTP/1.1 404"))
    }
}

@Suite @MainActor struct BridgeTests {
    func errorOf(_ s: String?) -> [String: String] { (try? JSONSerialization.jsonObject(with: Data((s ?? "").utf8))) as? [String: String] ?? [:] }

    @Test func dispatchesAndReturnsValues() async {
        let r = BridgeRouter()
        r.register("echo") { p in ["got": p.string("text") ?? "", "n": p.number("n") ?? -1] }
        let (result, error) = await r.handle(body: ["method": "echo", "params": ["text": "hi", "n": 3]])
        #expect(error == nil)
        let d = result as? [String: Any]
        #expect(d?["got"] as? String == "hi" && d?["n"] as? Double == 3)
    }

    @Test func errorsComeBackAsValues() async {
        let r = BridgeRouter()
        r.register("fail") { _ in throw BridgeError("nope", "it failed") }
        r.register("needs") { p in try p.require("path") }
        #expect(errorOf(await r.handle(body: ["method": "fail"]).1) == ["code": "nope", "message": "it failed"])
        #expect(errorOf(await r.handle(body: ["method": "needs", "params": [:]]).1)["code"] == "bad_params")
        let unknown = errorOf(await r.handle(body: ["method": "what"]).1)
        #expect(unknown["code"] == "unknown_method" && unknown["message"]!.contains("fail, needs"), "names the methods there are")
        #expect(errorOf(await r.handle(body: "not an object").1)["code"] == "bad_request")
        let nilResult = await r.handle(body: ["method": "fail2"])
        #expect(nilResult.0 == nil)
    }
}

@Suite @MainActor struct FileMethodTests {
    @Test func openSaveAndProjectThroughTheAutomationHooks() async throws {
        let dir = try tempDir(["in.vrmxs": "{\"id\":\"cafe\"}", "proj/cafe.vrmxs": "{}", "proj/sets/cafe.glb": "glTF", "proj/.hidden": "x"])
        let roots = WebRoots(app: dir)
        let env = ["VRMXG_SHELL_OPEN": dir.appendingPathComponent("in.vrmxs").path, "VRMXG_SHELL_SAVE": dir.appendingPathComponent("out.vrmxs").path, "VRMXG_SHELL_PROJECT": dir.appendingPathComponent("proj").path]
        let f = FileMethods(roots: roots, env: env)
        let router = BridgeRouter(); f.register(on: router)

        let opened = await router.handle(body: ["method": "file.open", "params": ["types": ["vrmxs"]]])
        #expect((opened.0 as? [String: Any])?["text"] as? String == "{\"id\":\"cafe\"}")

        let saved = await router.handle(body: ["method": "file.save", "params": ["text": "saved", "suggestedName": "x.vrmxs"]])
        #expect((saved.0 as? [String: Any])?["bytes"] as? Int == 5)
        #expect(try String(contentsOf: dir.appendingPathComponent("out.vrmxs"), encoding: .utf8) == "saved")
        // writing back to the opened file needs no panel: it was granted
        _ = await router.handle(body: ["method": "file.save", "params": ["text": "again", "path": dir.appendingPathComponent("in.vrmxs").path]])
        #expect(try String(contentsOf: dir.appendingPathComponent("in.vrmxs"), encoding: .utf8) == "again")

        let proj = await router.handle(body: ["method": "project.open"])
        #expect((proj.0 as? [String: Any])?["files"] as? [String] == ["cafe.vrmxs", "sets/cafe.glb"], "hidden files skipped")
        #expect(roots.read(path: "/project/sets/cafe.glb").status == 200, "mounted for fetch")
        _ = await router.handle(body: ["method": "project.write", "params": ["path": "scenes/new.vrmxs", "text": "{}"]])
        #expect(FileManager.default.fileExists(atPath: dir.appendingPathComponent("proj/scenes/new.vrmxs").path))
        let escape = await router.handle(body: ["method": "project.write", "params": ["path": "../evil.txt", "text": "x"]])
        #expect(escape.1?.contains("outside the project") == true)
    }
}
