import Foundation
import Testing
@testable import VRMXGShell

/// A game build written through the bridge (M5 W0): the folder it goes into, what an export may replace, and what a
/// failed one leaves behind.
@Suite(.serialized) @MainActor struct BuildFolderTests {
    func manifest(_ paths: [String], version: Any = 1) -> String {
        let rows = paths.map { "{\"path\":\"\($0)\"}" }.joined(separator: ",")
        return "{\"format\":\"vrmxg-build\",\"version\":\(version),\"files\":[\(rows)]}"
    }
    func shell(_ dir: URL, build: String) -> (FileMethods, BridgeRouter) {
        let f = FileMethods(roots: WebRoots(app: dir.appendingPathComponent("web")), env: ["VRMXG_SHELL_BUILD": build])
        let router = BridgeRouter(); f.register(on: router)
        return (f, router)
    }
    /// Every file under a folder with its text, links as "-> target": what an export that was refused must not change.
    func snapshot(_ dir: URL) -> [String: String] {
        var out: [String: String] = [:]
        let s = BuildFolder.scan(dir)
        for f in s.files { out[f] = (try? String(contentsOf: dir.appendingPathComponent(f), encoding: .utf8)) ?? "?" }
        for f in s.foreign { out[f] = "-> " + ((try? FileManager.default.destinationOfSymbolicLink(atPath: dir.appendingPathComponent(f).path)) ?? "?") }
        for f in s.stale { out[f] = "(staging)" }
        return out
    }
    func text(_ url: URL) -> String? { try? String(contentsOf: url, encoding: .utf8) }

    @Test func aBuildIsStagedPieceByPieceAndMovedInAtTheEnd() async throws {
        let dir = try tempDir(["web/index.html": "<p>"])
        let (f, router) = shell(dir, build: dir.appendingPathComponent("builds").path + "/")
        _ = f
        for m in ["build.begin", "build.write", "build.end", "build.abort"] { #expect(router.methods.contains(m)) }

        let early = await router.handle(body: ["method": "build.write", "params": ["path": "index.html", "text": "x"]])
        #expect(early.1?.contains("build.begin first") == true, "nothing is written before a build is begun")

        let begun = await router.handle(body: ["method": "build.begin", "params": ["name": "cafe"]])
        let out = dir.appendingPathComponent("builds/cafe").resolvingSymlinksInPath()
        let id = try #require((begun.0 as? [String: Any])?["id"] as? String)
        #expect((begun.0 as? [String: Any])?["name"] as? String == "cafe")
        #expect(((begun.0 as? [String: Any])?["path"] as? String).map { URL(fileURLWithPath: $0).resolvingSymlinksInPath() } == out, "a trailing / makes the hook a folder of builds")

        let noId = await router.handle(body: ["method": "build.write", "params": ["path": "index.html", "text": "x"]])
        let wrongId = await router.handle(body: ["method": "build.write", "params": ["id": "someone-else", "path": "index.html", "text": "x"]])
        #expect(noId.1?.contains("under that id") == true && wrongId.1?.contains("under that id") == true, "a page with no handle on the export writes nothing")

        _ = await router.handle(body: ["method": "build.write", "params": ["id": id, "path": "index.html", "text": "<!doctype html>"]])
        // a file in pieces: the first begins it, the rest are added to it
        _ = await router.handle(body: ["method": "build.write", "params": ["id": id, "path": "project/sets/cafe.glb", "base64": Data([0x67, 0x6c]).base64EncodedString()]])
        _ = await router.handle(body: ["method": "build.write", "params": ["id": id, "path": "project/sets/cafe.glb", "base64": Data([0x54, 0x46]).base64EncodedString(), "append": true]])
        let twice = await router.handle(body: ["method": "build.write", "params": ["id": id, "path": "index.html", "text": "again"]])
        #expect(twice.1?.contains("written twice") == true)
        let unbegun = await router.handle(body: ["method": "build.write", "params": ["id": id, "path": "other.bin", "text": "x", "append": true]])
        #expect(unbegun.1?.contains("before it is begun") == true)
        for bad in ["../../evil.txt", "/tmp/evil.txt", "a/../../evil.txt", "a\\b"] {
            let escape = await router.handle(body: ["method": "build.write", "params": ["id": id, "path": bad, "text": "x"]])
            #expect(escape.1?.contains("outside the build's folder") == true, "\(bad)")
        }
        #expect(BuildFolder.scan(out).files.isEmpty && BuildFolder.scan(out).stale.count == 1, "until the end the folder holds only the staging folder")

        let noManifest = await router.handle(body: ["method": "build.end", "params": ["id": id]])
        #expect(noManifest.1?.contains("wrote no vrmxg-build.json") == true, "a build with no manifest is not moved in")
        #expect(!FileManager.default.fileExists(atPath: out.path), "and the folder made for it is taken away again")

        // the whole of it
        let again = await router.handle(body: ["method": "build.begin", "params": ["name": "cafe"]])
        let id2 = try #require((again.0 as? [String: Any])?["id"] as? String)
        _ = await router.handle(body: ["method": "build.write", "params": ["id": id2, "path": "vrmxg-build.json", "text": manifest(["index.html", "project/sets/cafe.glb"])]])
        _ = await router.handle(body: ["method": "build.write", "params": ["id": id2, "path": "index.html", "text": "<!doctype html>"]])
        _ = await router.handle(body: ["method": "build.write", "params": ["id": id2, "path": "project/sets/cafe.glb", "base64": Data([0x67, 0x6c]).base64EncodedString()]])
        _ = await router.handle(body: ["method": "build.write", "params": ["id": id2, "path": "project/sets/cafe.glb", "base64": Data([0x54, 0x46]).base64EncodedString(), "append": true]])
        let ended = await router.handle(body: ["method": "build.end", "params": ["id": id2]])
        #expect((ended.0 as? [String: Any])?["files"] as? Int == 2)
        #expect(try Data(contentsOf: out.appendingPathComponent("project/sets/cafe.glb")) == Data([0x67, 0x6c, 0x54, 0x46]), "the pieces in order, byte for byte")
        #expect(text(out.appendingPathComponent("index.html")) == "<!doctype html>")
        #expect(BuildFolder.scan(out).files == ["index.html", "project/sets/cafe.glb", "vrmxg-build.json"] && BuildFolder.scan(out).stale.isEmpty, "moved in, and the staging folder is gone")
        #expect(!FileManager.default.fileExists(atPath: dir.appendingPathComponent("evil.txt").path))
        let after = await router.handle(body: ["method": "build.write", "params": ["id": id2, "path": "late.txt", "text": "x"]])
        #expect(after.1?.contains("build.begin first") == true, "and nothing after it has ended")
    }

    @Test func anEarlierBuildIsReplacedOnlyAtTheEndAndNothingElseIsEverTouched() async throws {
        let dir = try tempDir([
            "web/index.html": "<p>",
            "old/vrmxg-build.json": manifest(["index.html", "project/a/b/old.glb"]), "old/index.html": "old", "old/project/a/b/old.glb": "old",
            "mine/thesis.txt": "years of work",
            "mixed/vrmxg-build.json": manifest(["index.html", "project/x.glb"]), "mixed/index.html": "old", "mixed/project/x.glb": "old", "mixed/notes.txt": "mine",
            "odd/vrmxg-build.json": "{\"format\":\"something else\"}", "odd/index.html": "old",
            "v2/vrmxg-build.json": manifest(["index.html"], version: 2), "v2/index.html": "old",
            "climbs/vrmxg-build.json": manifest(["index.html", "../outside.txt"]), "climbs/index.html": "old",
            "outside.txt": "not the build's",
            "dirrow/vrmxg-build.json": manifest(["index.html", "keep"]), "dirrow/index.html": "old", "dirrow/keep/mine.txt": "mine",
            "elsewhere/level.vrmxs": "not the build's",
            "linkonly/.keep": "",
            "linked/vrmxg-build.json": manifest(["index.html", "project/level.vrmxs"]), "linked/index.html": "old",
        ])
        let fm = FileManager.default
        try fm.removeItem(at: dir.appendingPathComponent("linkonly/.keep"))
        try fm.createSymbolicLink(at: dir.appendingPathComponent("linkonly/project"), withDestinationURL: dir.appendingPathComponent("elsewhere"))
        try fm.createSymbolicLink(at: dir.appendingPathComponent("linked/project"), withDestinationURL: dir.appendingPathComponent("elsewhere"))
        func begin(_ folder: String) async -> (BridgeRouter, FileMethods, String?, String?) {
            let (f, router) = shell(dir, build: dir.appendingPathComponent(folder).path)
            let r = await router.handle(body: ["method": "build.begin", "params": ["name": "cafe"]])
            return (router, f, (r.0 as? [String: Any])?["id"] as? String, r.1)
        }
        /// A folder the export must refuse, and leave exactly as it was.
        func refused(_ folder: String, _ why: String) async {
            let before = snapshot(dir.appendingPathComponent(folder))
            let (_, f, id, error) = await begin(folder)
            _ = f
            #expect(id == nil && error?.contains(why) == true, "\(folder): \(error ?? "it began")")
            #expect(error?.contains("export into an empty folder") == true, "\(folder)")
            #expect(snapshot(dir.appendingPathComponent(folder)) == before, "\(folder) is as it was")
        }

        // an earlier build: still whole after begin, replaced at the end, and the folders it leaves empty pruned
        let old = dir.appendingPathComponent("old")
        let (router, keep, id, error) = await begin("old")
        _ = keep
        #expect(error == nil)
        #expect(text(old.appendingPathComponent("project/a/b/old.glb")) == "old", "nothing is removed when an export begins")
        _ = await router.handle(body: ["method": "build.write", "params": ["id": id!, "path": "index.html", "text": "new"]])
        _ = await router.handle(body: ["method": "build.write", "params": ["id": id!, "path": "vrmxg-build.json", "text": manifest(["index.html"])]])
        #expect(text(old.appendingPathComponent("index.html")) == "old", "nor while it is written")
        let ended = await router.handle(body: ["method": "build.end", "params": ["id": id!]])
        #expect(ended.1 == nil)
        #expect(snapshot(old) == ["index.html": "new", "vrmxg-build.json": manifest(["index.html"])])
        #expect(!fm.fileExists(atPath: old.appendingPathComponent("project").path), "emptied folders are pruned")

        await refused("mine", "thesis.txt")                           // someone's own folder
        await refused("mixed", "holds files its build doesn't list (notes.txt)") // an earlier build with a stray file: the build is NOT deleted first
        await refused("odd", "isn't a build's")                       // a manifest that isn't a build's is not licence to clear the folder
        await refused("v2", "of version 2, and this app reads version 1") // nor one of a version this shell doesn't read
        await refused("climbs", "lists a path no build has")          // nor one whose rows climb out of the folder
        #expect(text(dir.appendingPathComponent("outside.txt")) == "not the build's")
        await refused("dirrow", "mine.txt")                           // a row that names a folder deletes nothing in it
        await refused("linkonly", "holds a link or a special file (project)") // a folder holding only a link is not empty
        await refused("linked", "holds a link or a special file (project)")   // and a build's folder swapped for a link is never deleted through
        #expect(text(dir.appendingPathComponent("elsewhere/level.vrmxs")) == "not the build's")
        #expect(try fm.contentsOfDirectory(atPath: dir.appendingPathComponent("elsewhere").path) == ["level.vrmxs"])

        // a new folder is made
        let (_, f2, fresh, _) = await begin("fresh/deep")
        _ = f2
        #expect(fresh != nil && fm.fileExists(atPath: dir.appendingPathComponent("fresh/deep").path))
    }

    @Test func aFailedOrAbandonedExportLeavesTheFolderAsItWas() async throws {
        let dir = try tempDir(["web/index.html": "<p>", "game/vrmxg-build.json": manifest(["index.html"]), "game/index.html": "the earlier build"])
        let game = dir.appendingPathComponent("game"), before = snapshot(game)
        let (f, router) = shell(dir, build: game.path)
        _ = f
        func begin() async throws -> String { try #require(((await router.handle(body: ["method": "build.begin", "params": ["name": "game"]])).0 as? [String: Any])?["id"] as? String) }

        // aborted half way: what it wrote is gone, the earlier build is whole
        let a = try await begin()
        _ = await router.handle(body: ["method": "build.write", "params": ["id": a, "path": "index.html", "text": "half a build"]])
        let aborted = await router.handle(body: ["method": "build.abort", "params": ["id": a]])
        #expect((aborted.0 as? [String: Any])?["aborted"] as? Bool == true)
        #expect(snapshot(game) == before)
        let late = await router.handle(body: ["method": "build.write", "params": ["id": a, "path": "late.txt", "text": "x"]])
        #expect(late.1?.contains("under that id") == true, "an aborted export writes nothing more")

        // abandoned (the page reloaded and lost its id): the next export begins cleanly in the same folder, and the old id is dead
        let b = try await begin()
        _ = await router.handle(body: ["method": "build.write", "params": ["id": b, "path": "index.html", "text": "abandoned"]])
        let c = try await begin()
        #expect(BuildFolder.scan(game).stale.count == 1, "the abandoned export's staging folder is gone; only the new one's is there")
        let stale = await router.handle(body: ["method": "build.write", "params": ["id": b, "path": "x.txt", "text": "x"]])
        #expect(stale.1?.contains("under that id") == true)
        _ = await router.handle(body: ["method": "build.write", "params": ["id": c, "path": "index.html", "text": "the next build"]])
        _ = await router.handle(body: ["method": "build.write", "params": ["id": c, "path": "vrmxg-build.json", "text": manifest(["index.html"])]])
        #expect((await router.handle(body: ["method": "build.end", "params": ["id": c]])).1 == nil)
        #expect(snapshot(game) == ["index.html": "the next build", "vrmxg-build.json": manifest(["index.html"])])

        // an export cut short while moving in (the app quit): its staging folder holds the manifest, and the next export finishes the job
        let cut = dir.appendingPathComponent("cut")
        try FileManager.default.createDirectory(at: cut.appendingPathComponent(".vrmxg-export-crashed"), withIntermediateDirectories: true)
        try Data("moved in".utf8).write(to: cut.appendingPathComponent("index.html"))
        try Data(manifest(["index.html", "late.js"]).utf8).write(to: cut.appendingPathComponent(".vrmxg-export-crashed/vrmxg-build.json"))
        try Data("still staged".utf8).write(to: cut.appendingPathComponent(".vrmxg-export-crashed/late.js"))
        let (f3, r3) = shell(dir, build: cut.path)
        _ = f3
        let d = try #require(((await r3.handle(body: ["method": "build.begin", "params": ["name": "cut"]])).0 as? [String: Any])?["id"] as? String)
        _ = await r3.handle(body: ["method": "build.write", "params": ["id": d, "path": "index.html", "text": "whole"]])
        _ = await r3.handle(body: ["method": "build.write", "params": ["id": d, "path": "vrmxg-build.json", "text": manifest(["index.html"])]])
        #expect((await r3.handle(body: ["method": "build.end", "params": ["id": d]])).1 == nil)
        #expect(snapshot(cut) == ["index.html": "whole", "vrmxg-build.json": manifest(["index.html"])])
    }

    @Test func aProjectListingCutShortSaysSo() async throws {
        let dir = try tempDir(["web/index.html": "<p>", "proj/a.vrmxs": "{}", "proj/b.vrmxs": "{}", "proj/c.vrmxs": "{}"])
        let f = FileMethods(roots: WebRoots(app: dir.appendingPathComponent("web")), env: ["VRMXG_SHELL_PROJECT": dir.appendingPathComponent("proj").path])
        let router = BridgeRouter(); f.register(on: router)
        let whole = (await router.handle(body: ["method": "project.open"])).0 as? [String: Any]
        #expect(whole?["truncated"] as? Bool == false && (whole?["files"] as? [String])?.count == 3)
        let cap = FileMethods.projectFileCap
        FileMethods.projectFileCap = 2
        defer { FileMethods.projectFileCap = cap }
        let cut = (await router.handle(body: ["method": "project.open"])).0 as? [String: Any]
        #expect(cut?["truncated"] as? Bool == true && (cut?["files"] as? [String])?.count == 2, "a listing that doesn't hold every file says so")
    }
}
