import Foundation
import Testing
@testable import VRMXGShell

/// A game build written through the bridge (M5 W0): the folder it goes into, and what an export may replace.
@Suite @MainActor struct BuildFolderTests {
    func manifest(_ paths: [String]) -> String {
        let rows = paths.map { "{\"path\":\"\($0)\"}" }.joined(separator: ",")
        return "{\"format\":\"vrmxg-build\",\"version\":1,\"files\":[\(rows)]}"
    }

    @Test func aBuildIsWrittenIntoANewFolderFileByFile() async throws {
        let dir = try tempDir(["web/index.html": "<p>"])
        let f = FileMethods(roots: WebRoots(app: dir.appendingPathComponent("web")), env: ["VRMXG_SHELL_BUILD": dir.appendingPathComponent("builds").path + "/"])
        let router = BridgeRouter(); f.register(on: router)
        #expect(router.methods.contains("build.begin") && router.methods.contains("build.write") && router.methods.contains("build.end"))

        let early = await router.handle(body: ["method": "build.write", "params": ["path": "index.html", "text": "x"]])
        #expect(early.1?.contains("build.begin first") == true, "nothing is written before a build is begun")

        let begun = await router.handle(body: ["method": "build.begin", "params": ["name": "cafe"]])
        let out = dir.appendingPathComponent("builds/cafe")
        #expect((begun.0 as? [String: Any])?["name"] as? String == "cafe")
        #expect(((begun.0 as? [String: Any])?["path"] as? String).map { URL(fileURLWithPath: $0).standardizedFileURL } == out.standardizedFileURL, "a trailing / makes the hook a folder of builds")
        _ = await router.handle(body: ["method": "build.write", "params": ["path": "index.html", "text": "<!doctype html>"]])
        _ = await router.handle(body: ["method": "build.write", "params": ["path": "project/sets/cafe.glb", "base64": Data([0x67, 0x6c, 0x54, 0x46]).base64EncodedString()]])
        let escape = await router.handle(body: ["method": "build.write", "params": ["path": "../../evil.txt", "text": "x"]])
        #expect(escape.1?.contains("outside the build's folder") == true)
        let ended = await router.handle(body: ["method": "build.end"])
        #expect((ended.0 as? [String: Any])?["files"] as? Int == 2)
        #expect((ended.0 as? [String: Any])?["bytes"] as? Int == 19)
        #expect(try Data(contentsOf: out.appendingPathComponent("project/sets/cafe.glb")) == Data([0x67, 0x6c, 0x54, 0x46]), "binary through base64, byte for byte")
        #expect(try String(contentsOf: out.appendingPathComponent("index.html"), encoding: .utf8) == "<!doctype html>")
        #expect(!FileManager.default.fileExists(atPath: dir.appendingPathComponent("evil.txt").path))
        let after = await router.handle(body: ["method": "build.write", "params": ["path": "late.txt", "text": "x"]])
        #expect(after.1?.contains("build.begin first") == true, "and nothing after it has ended")
    }

    @Test func anEarlierBuildIsReplacedAndNothingElseIsTouched() async throws {
        let dir = try tempDir([
            "web/index.html": "<p>",
            "old/vrmxg-build.json": manifest(["index.html", "project/a/b/old.glb", "../outside.txt"]), "old/index.html": "old", "old/project/a/b/old.glb": "old",
            "outside.txt": "not the build's",
            "mine/thesis.txt": "years of work",
            "mixed/vrmxg-build.json": manifest(["index.html"]), "mixed/index.html": "old", "mixed/notes.txt": "mine",
            "odd/vrmxg-build.json": "{\"format\":\"something else\"}",
        ])
        func begin(_ folder: String) async -> (Any?, String?) {
            let f = FileMethods(roots: WebRoots(app: dir.appendingPathComponent("web")), env: ["VRMXG_SHELL_BUILD": dir.appendingPathComponent(folder).path])
            let router = BridgeRouter(); f.register(on: router)
            return await router.handle(body: ["method": "build.begin", "params": ["name": "cafe"]])
        }
        let fm = FileManager.default
        // an earlier build: its listed files go, and the folders they leave empty; a path that leads outside is ignored
        #expect((await begin("old")).1 == nil)
        #expect(BuildFolder.list(dir.appendingPathComponent("old")).isEmpty)
        #expect(!fm.fileExists(atPath: dir.appendingPathComponent("old/project").path), "emptied folders are pruned")
        #expect(fm.fileExists(atPath: dir.appendingPathComponent("outside.txt").path), "a manifest can't point an export at files outside its folder")
        // someone's own folder
        let mine = await begin("mine")
        #expect(mine.1?.contains("thesis.txt") == true && mine.1?.contains("export into an empty folder") == true)
        #expect(try String(contentsOf: dir.appendingPathComponent("mine/thesis.txt"), encoding: .utf8) == "years of work")
        // an earlier build with a stray file beside it: refused, and the stray file is still there
        let mixed = await begin("mixed")
        #expect(mixed.1?.contains("notes.txt") == true)
        #expect(fm.fileExists(atPath: dir.appendingPathComponent("mixed/notes.txt").path))
        // a manifest that isn't a build's is not licence to clear the folder
        #expect((await begin("odd")).1?.contains("isn't a build's") == true)
        #expect(fm.fileExists(atPath: dir.appendingPathComponent("odd/vrmxg-build.json").path))
        // a new folder is made
        #expect((await begin("fresh/deep")).1 == nil)
        #expect(fm.fileExists(atPath: dir.appendingPathComponent("fresh/deep").path))
    }
}
