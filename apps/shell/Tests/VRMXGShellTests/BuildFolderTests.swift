import CryptoKit
import Foundation
import Testing
@testable import VRMXGShell

/// A game build written through the bridge (M5 W0): the folder it goes into, what an export may replace, and what a
/// failed one leaves behind.
@Suite(.serialized) @MainActor struct BuildFolderTests {
    /// A manifest's text for files given as path → text: each row with its size and SHA-256, as the exporter writes them.
    func manifest(_ files: [String: String], version: Any = 1) -> String {
        let rows = files.keys.sorted().map { p -> String in
            let data = Data(files[p]!.utf8), hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
            return "{\"path\":\"\(p)\",\"bytes\":\(data.count),\"sha256\":\"\(hash)\"}"
        }
        return "{\"format\":\"vrmxg-build\",\"version\":\(version),\"files\":[\(rows.joined(separator: ","))]}"
    }
    /// An earlier build's manifest that lists paths only: what `plan` reads to know which files a build wrote.
    func lists(_ paths: [String], version: Any = 1) -> String {
        "{\"format\":\"vrmxg-build\",\"version\":\(version),\"files\":[\(paths.map { "{\"path\":\"\($0)\"}" }.joined(separator: ","))]}"
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
    func id(_ r: (Any?, String?)) -> String? { (r.0 as? [String: Any])?["id"] as? String }
    /// Begin a build, write the files and their manifest, and end it: the answer of `build.end`.
    func export(_ router: BridgeRouter, _ files: [String: String], name: String = "game") async throws -> (Any?, String?) {
        let b = try #require(id(await router.handle(body: ["method": "build.begin", "params": ["name": name]])))
        for (p, t) in files.sorted(by: { $0.key < $1.key }) { _ = await router.handle(body: ["method": "build.write", "params": ["id": b, "path": p, "text": t]]) }
        _ = await router.handle(body: ["method": "build.write", "params": ["id": b, "path": "vrmxg-build.json", "text": manifest(files)]])
        return await router.handle(body: ["method": "build.end", "params": ["id": b]])
    }

    @Test func aBuildIsStagedPieceByPieceAndMovedInAtTheEnd() async throws {
        let dir = try tempDir(["web/index.html": "<p>"])
        let (f, router) = shell(dir, build: dir.appendingPathComponent("builds").path + "/")
        _ = f
        for m in ["build.begin", "build.write", "build.end", "build.abort"] { #expect(router.methods.contains(m)) }

        let early = await router.handle(body: ["method": "build.write", "params": ["path": "index.html", "text": "x"]])
        #expect(early.1?.contains("build.begin first") == true, "nothing is written before a build is begun")

        let begun = await router.handle(body: ["method": "build.begin", "params": ["name": "cafe"]])
        let out = dir.appendingPathComponent("builds/cafe").resolvingSymlinksInPath()
        let a = try #require(id(begun))
        #expect((begun.0 as? [String: Any])?["name"] as? String == "cafe")
        #expect(((begun.0 as? [String: Any])?["path"] as? String).map { URL(fileURLWithPath: $0).resolvingSymlinksInPath() } == out, "a trailing / makes the hook a folder of builds")

        let noId = await router.handle(body: ["method": "build.write", "params": ["path": "index.html", "text": "x"]])
        let wrongId = await router.handle(body: ["method": "build.write", "params": ["id": "someone-else", "path": "index.html", "text": "x"]])
        #expect(noId.1?.contains("under that id") == true && wrongId.1?.contains("under that id") == true, "a page with no handle on the export writes nothing")

        // a file in pieces: each says where it begins
        func piece(_ bytes: [UInt8], at offset: Any?) async -> (Any?, String?) {
            var p: [String: Any] = ["id": a, "path": "project/sets/cafe.glb", "base64": Data(bytes).base64EncodedString()]
            if let offset { p["offset"] = offset }
            return await router.handle(body: ["method": "build.write", "params": p])
        }
        #expect((await piece([0x67, 0x6c], at: nil)).1 == nil)
        #expect((await piece([0x54, 0x46], at: 2)).1 == nil)
        #expect((await piece([0x54, 0x46], at: 2)).1?.contains("a piece at 2, and the file has 4 bytes") == true, "the same piece sent twice is refused, not appended twice")
        #expect((await piece([0x00], at: 9)).1?.contains("a piece at 9") == true, "a gap")
        #expect((await piece([0x00], at: 0)).1?.contains("written twice") == true)
        #expect((await piece([0x00], at: true)).1?.contains("offset") == true, "an offset is a whole number, not true")
        #expect((await piece([0x00], at: -1)).1?.contains("offset") == true)
        let unbegun = await router.handle(body: ["method": "build.write", "params": ["id": a, "path": "other.bin", "text": "x", "offset": 4]])
        #expect(unbegun.1?.contains("not begun") == true)
        for bad in ["../../evil.txt", "/tmp/evil.txt", "a/../../evil.txt", "a\\b", ".vrmxg-export-zz/vrmxg-build.json", "project/.vrmxg-export-x/y", ".vrmxg-export/x"] {
            let escape = await router.handle(body: ["method": "build.write", "params": ["id": a, "path": bad, "text": "x"]])
            #expect(escape.1?.contains("outside the build's folder") == true, "\(bad)")
        }
        #expect(BuildFolder.scan(out).files.isEmpty && BuildFolder.scan(out).stale.count == 1, "until the end the folder holds only the staging folder")

        let noManifest = await router.handle(body: ["method": "build.end", "params": ["id": a]])
        #expect(noManifest.1?.contains("wrote no vrmxg-build.json") == true, "a build with no manifest is not moved in")
        #expect(!FileManager.default.fileExists(atPath: out.path), "and the folder made for it is taken away again")

        // the whole of it
        let ended = try await export(router, ["index.html": "<!doctype html>", "project/sets/cafe.glb": "glTF"], name: "cafe")
        #expect((ended.0 as? [String: Any])?["files"] as? Int == 2 && (ended.0 as? [String: Any])?["bytes"] as? Int == 19)
        #expect(text(out.appendingPathComponent("project/sets/cafe.glb")) == "glTF" && text(out.appendingPathComponent("index.html")) == "<!doctype html>")
        #expect(BuildFolder.scan(out).files == ["index.html", "project/sets/cafe.glb", "vrmxg-build.json"] && BuildFolder.scan(out).stale.isEmpty, "moved in, and the staging folder is gone")
        #expect(!FileManager.default.fileExists(atPath: dir.appendingPathComponent("evil.txt").path))
    }

    @Test func atTheEndTheStagedFilesAreCheckedAgainstTheManifestBeforeAnythingMoves() async throws {
        let dir = try tempDir(["web/index.html": "<p>"])
        let game = dir.appendingPathComponent("game")
        let (f, router) = shell(dir, build: game.path)
        _ = f
        #expect((try await export(router, ["index.html": "the earlier build", "a.js": "1"])).1 == nil)
        let before = snapshot(game)
        func attempt(_ staged: [String: String], listing: [String: String]) async throws -> String? {
            let b = try #require(id(await router.handle(body: ["method": "build.begin", "params": ["name": "game"]])))
            for (p, t) in staged { _ = await router.handle(body: ["method": "build.write", "params": ["id": b, "path": p, "text": t]]) }
            _ = await router.handle(body: ["method": "build.write", "params": ["id": b, "path": "vrmxg-build.json", "text": manifest(listing)]])
            return (await router.handle(body: ["method": "build.end", "params": ["id": b]])).1
        }
        let fifteen = Dictionary(uniqueKeysWithValues: (1...15).map { ("file-\($0).js", "\($0)") })
        // one file staged where the manifest lists fifteen
        #expect(try await attempt(["file-1.js": "1"], listing: fifteen)?.contains("14 missing") == true)
        #expect(snapshot(game) == before, "nothing moved, the earlier build is whole, and no staging folder is left")
        // a file that isn't the one listed (a piece lost)
        #expect(try await attempt(["index.html": "half"], listing: ["index.html": "half of it is missing"])?.contains("index.html was not written whole") == true)
        #expect(snapshot(game) == before)
        // a file the manifest doesn't list
        #expect(try await attempt(["index.html": "x", "extra.js": "y"], listing: ["index.html": "x"])?.contains("1 not listed: extra.js") == true)
        #expect(snapshot(game) == before)
        // a manifest that isn't one this shell reads
        let b = try #require(id(await router.handle(body: ["method": "build.begin", "params": ["name": "game"]])))
        _ = await router.handle(body: ["method": "build.write", "params": ["id": b, "path": "vrmxg-build.json", "text": manifest(["index.html": "x"], version: 2)]])
        #expect((await router.handle(body: ["method": "build.end", "params": ["id": b]])).1?.contains("version 2") == true)
        #expect(snapshot(game) == before)
    }

    @Test func anEarlierBuildIsReplacedOnlyAtTheEndAndNothingElseIsEverTouched() async throws {
        let dir = try tempDir([
            "web/index.html": "<p>",
            "old/vrmxg-build.json": lists(["index.html", "project/a/b/old.glb", "thing/inner.txt", "other.txt", "Extras/readme.txt"]), "old/index.html": "old", "old/project/a/b/old.glb": "old",
            "old/thing/inner.txt": "old", "old/other.txt": "old", "old/Extras/readme.txt": "old",
            "mine/thesis.txt": "years of work",
            "mixed/vrmxg-build.json": lists(["index.html", "project/x.glb"]), "mixed/index.html": "old", "mixed/project/x.glb": "old", "mixed/notes.txt": "mine",
            "odd/vrmxg-build.json": "{\"format\":\"something else\"}", "odd/index.html": "old",
            "v2/vrmxg-build.json": lists(["index.html"], version: 2), "v2/index.html": "old",
            "vtrue/vrmxg-build.json": lists(["index.html"], version: "true"), "vtrue/index.html": "old",
            "climbs/vrmxg-build.json": lists(["index.html", "../outside.txt"]), "climbs/index.html": "old",
            "outside.txt": "not the build's",
            "dirrow/vrmxg-build.json": lists(["index.html", "keep"]), "dirrow/index.html": "old", "dirrow/keep/mine.txt": "mine",
            "elsewhere/level.vrmxs": "not the build's",
            "linkonly/.keep": "",
            "linked/vrmxg-build.json": lists(["index.html", "project/level.vrmxs"]), "linked/index.html": "old",
            // a staging folder someone planted, whose manifest lists the folder's own files
            "planted/index.html": "my own page", "planted/thesis.txt": "years of work",
            "planted/.vrmxg-export-old/vrmxg-build.json": lists(["index.html", "thesis.txt"]),
        ])
        let fm = FileManager.default
        try fm.removeItem(at: dir.appendingPathComponent("linkonly/.keep"))
        try fm.createSymbolicLink(at: dir.appendingPathComponent("linkonly/project"), withDestinationURL: dir.appendingPathComponent("elsewhere"))
        try fm.createSymbolicLink(at: dir.appendingPathComponent("linked/project"), withDestinationURL: dir.appendingPathComponent("elsewhere"))
        /// A folder the export must refuse, and leave exactly as it was.
        func refused(_ folder: String, _ why: String) async {
            let before = snapshot(dir.appendingPathComponent(folder))
            let (f, router) = shell(dir, build: dir.appendingPathComponent(folder).path)
            _ = f
            let r = await router.handle(body: ["method": "build.begin", "params": ["name": "cafe"]])
            #expect(id(r) == nil && r.1?.contains(why) == true, "\(folder): \(r.1 ?? "it began")")
            #expect(r.1?.contains("export into an empty folder") == true, "\(folder)")
            #expect(snapshot(dir.appendingPathComponent(folder)) == before, "\(folder) is as it was")
        }

        // an earlier build: still whole while the next is written, replaced at the end. The new one has a file where a
        // folder was, a folder where a file was, and a folder whose name differs only by case
        let old = dir.appendingPathComponent("old")
        let (keep, router) = shell(dir, build: old.path)
        _ = keep
        let next = ["index.html": "new", "thing": "a file now", "other.txt/inner.txt": "a folder now", "extras/readme.txt": "new"]
        let b = try #require(id(await router.handle(body: ["method": "build.begin", "params": ["name": "cafe"]])))
        #expect(text(old.appendingPathComponent("project/a/b/old.glb")) == "old", "nothing is removed when an export begins")
        for (p, t) in next { _ = await router.handle(body: ["method": "build.write", "params": ["id": b, "path": p, "text": t]]) }
        _ = await router.handle(body: ["method": "build.write", "params": ["id": b, "path": "vrmxg-build.json", "text": manifest(next)]])
        #expect(text(old.appendingPathComponent("index.html")) == "old", "nor while it is written")
        #expect((await router.handle(body: ["method": "build.end", "params": ["id": b]])).1 == nil)
        var want = next; want["vrmxg-build.json"] = manifest(next)
        #expect(snapshot(old) == want, "file for folder, folder for file")
        #expect(try fm.contentsOfDirectory(atPath: old.path).sorted() == ["extras", "index.html", "other.txt", "thing", "vrmxg-build.json"], "the folder is under its new name, and emptied folders are gone")

        await refused("mine", "thesis.txt")                           // someone's own folder
        await refused("mixed", "holds files its build doesn't list (notes.txt)") // an earlier build with a stray file: the build is NOT deleted first
        await refused("odd", "isn't a build's")                       // a manifest that isn't a build's is not licence to clear the folder
        await refused("v2", "of version 2, and this app reads version 1") // nor one of a version this shell doesn't read
        await refused("vtrue", "and this app reads version 1")        // `true` is not version 1
        await refused("climbs", "lists a path no build has")          // nor one whose rows climb out of the folder
        #expect(text(dir.appendingPathComponent("outside.txt")) == "not the build's")
        await refused("dirrow", "mine.txt")                           // a row that names a folder deletes nothing in it
        await refused("linkonly", "holds a link or a special file (project)") // a folder holding only a link is not empty
        await refused("linked", "holds a link or a special file (project)")   // and a build's folder swapped for a link is never deleted through
        #expect(text(dir.appendingPathComponent("elsewhere/level.vrmxs")) == "not the build's")
        #expect(try fm.contentsOfDirectory(atPath: dir.appendingPathComponent("elsewhere").path) == ["level.vrmxs"])
        await refused("planted", "holds files that aren't a build's (index.html, thesis.txt)") // a staging folder's manifest licenses nothing outside it

        // a new folder is made
        let (f2, r2) = shell(dir, build: dir.appendingPathComponent("fresh/deep").path)
        _ = f2
        #expect(id(await r2.handle(body: ["method": "build.begin", "params": ["name": "cafe"]])) != nil && fm.fileExists(atPath: dir.appendingPathComponent("fresh/deep").path))
    }

    @Test func aCommitThatFailsPutsTheEarlierBuildBack() async throws {
        let earlier = ["index.html": "the earlier build", "project/a/b/old.glb": "old", "zz.txt": "old"]
        let dir = try tempDir(["web/index.html": "<p>"])
        let game = dir.appendingPathComponent("game"), fm = FileManager.default
        let (f, router) = shell(dir, build: game.path)
        _ = f
        #expect((try await export(router, earlier)).1 == nil)
        let before = snapshot(game)
        // a folder of the earlier build that can't be written to. Read-only `b`: its file can't be moved out, so the
        // commit fails while the earlier build's files are being held aside. Read-only `a`: the files move out, and the
        // commit fails when `a/b` can't be cleared, with every earlier file already held
        for locked in ["project/a/b", "project/a"] {
            try fm.setAttributes([.posixPermissions: 0o555], ofItemAtPath: game.appendingPathComponent(locked).path)
            let r = try await export(router, ["index.html": "the next build", "new.js": "1"])
            try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: game.appendingPathComponent(locked).path)
            #expect(r.1 != nil, "\(locked) read-only: the commit fails")
            #expect(snapshot(game) == before, "\(locked) read-only: the earlier build is back, byte for byte, with nothing of the new one and no staging folder")
        }
        // and with nothing in the way the same export goes through
        #expect((try await export(router, ["index.html": "the next build", "new.js": "1"])).1 == nil)
        #expect(snapshot(game) == ["index.html": "the next build", "new.js": "1", "vrmxg-build.json": manifest(["index.html": "the next build", "new.js": "1"])])
    }

    @Test func aFailedOrAbandonedExportLeavesTheFolderAsItWas() async throws {
        let dir = try tempDir(["web/index.html": "<p>"])
        let game = dir.appendingPathComponent("game")
        let (f, router) = shell(dir, build: game.path)
        _ = f
        #expect((try await export(router, ["index.html": "the earlier build"])).1 == nil)
        let before = snapshot(game)
        func begin() async throws -> String { try #require(id(await router.handle(body: ["method": "build.begin", "params": ["name": "game"]]))) }

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
        _ = await router.handle(body: ["method": "build.abort", "params": ["id": c]])
        #expect(snapshot(game) == before)

        // staging folders don't pile up: after three failed ends there is none
        for _ in 0..<3 {
            let d = try await begin()
            _ = await router.handle(body: ["method": "build.write", "params": ["id": d, "path": "index.html", "text": "no manifest follows"]])
            #expect((await router.handle(body: ["method": "build.end", "params": ["id": d]])).1 != nil)
        }
        #expect(snapshot(game) == before)
    }

    @Test func whatACutShortExportLeftIsClearedAndOnlyWhatTheManifestVouchesForIsMovedIn() async throws {
        let build = ["index.html": "whole", "project/level.vrmxs": "{}", "vrmxg-core.js": "core"]
        var want = build; want["vrmxg-build.json"] = manifest(build)
        // killed while the new build's files were moving in: its manifest is in place, some files still staged
        let dir = try tempDir([
            "web/index.html": "<p>",
            "in/vrmxg-build.json": manifest(build), "in/vrmxg-core.js": "core",
            "in/.vrmxg-export-killed/index.html": "whole", "in/.vrmxg-export-killed/project/level.vrmxs": "{}",
            "in/.vrmxg-export-killed/vrmxg-core.js": "not the file the manifest lists", "in/.vrmxg-export-killed/thesis.txt": "planted",
            // killed while the earlier build's files were on their way out: its manifest still in place, its files held
            "out/vrmxg-build.json": manifest(build),
            "out/.vrmxg-export-killed/.held/index.html": "whole", "out/.vrmxg-export-killed/.held/project/level.vrmxs": "{}", "out/.vrmxg-export-killed/.held/vrmxg-core.js": "core",
            "out/.vrmxg-export-killed/index.html": "the next build, never finished",
        ])
        for folder in ["in", "out"] {
            let at = dir.appendingPathComponent(folder)
            BuildFolder.recover(at.resolvingSymlinksInPath())
            #expect(snapshot(at) == want, "\(folder): the build its own manifest describes is whole again, and the staging folder is gone")
        }
        #expect(!FileManager.default.fileExists(atPath: dir.appendingPathComponent("in/thesis.txt").path), "a staged file the manifest doesn't list is not moved in")
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
