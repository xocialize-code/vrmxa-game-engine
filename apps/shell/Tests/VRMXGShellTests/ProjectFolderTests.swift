import AppKit
import Foundation
import Testing
@testable import VRMXGShell

/// Project folders (shell 0.14.0, M6 W3): a project made from a template in the web content, and the recent projects.
@Suite @MainActor struct ProjectFolderTests {
    func defaults() throws -> (UserDefaults, String) {
        let suite = "vrmxg-shell-test-\(UUID().uuidString)"
        return (try #require(UserDefaults(suiteName: suite)), suite)
    }

    @Test func createCopiesATemplateAndMountsIt() async throws {
        let dir = try tempDir(["web/index.html": "<p>", "web/templates/level/level.vrmxs": "{\"id\":\"level\"}", "web/sets/cafe.glb": "glTF", "web/../outside.txt": "no"])
        let roots = WebRoots(app: dir.appendingPathComponent("web"))
        let (d, suite) = try defaults(); defer { d.removePersistentDomain(forName: suite) }
        let f = FileMethods(roots: roots, env: ["VRMXG_SHELL_NEW_PROJECT": dir.appendingPathComponent("Games").path + "/"], defaults: d)
        let router = BridgeRouter(); f.register(on: router)
        let files: [[String: Any]] = [["from": "templates/level/level.vrmxs", "to": "level.vrmxs"], ["from": "sets/cafe.glb", "to": "sets/cafe.glb"],
                                      ["to": "game.json", "text": "{\"id\":\"my-game\"}"], ["to": "thumbs/a.png", "base64": Data([1, 2, 3]).base64EncodedString()]]
        let r = await router.handle(body: ["method": "project.create", "params": ["name": "My Game", "files": files]])
        let out = try #require(r.0 as? [String: Any], "\(r.1 ?? "")")
        let folder = dir.appendingPathComponent("Games/My Game")
        #expect(out["created"] as? Bool == true && out["name"] as? String == "My Game" && out["base"] as? String == "/project/")
        #expect(out["files"] as? [String] == ["game.json", "level.vrmxs", "sets/cafe.glb", "thumbs/a.png"])
        #expect(try String(contentsOf: folder.appendingPathComponent("level.vrmxs"), encoding: .utf8) == "{\"id\":\"level\"}")
        #expect(try Data(contentsOf: folder.appendingPathComponent("thumbs/a.png")) == Data([1, 2, 3]))
        #expect(String(decoding: roots.read(path: "/project/game.json").data, as: UTF8.self) == "{\"id\":\"my-game\"}", "mounted for fetch")
        // project.write goes into the new project, as into an opened one
        _ = await router.handle(body: ["method": "project.write", "params": ["path": "game.json", "text": "{}"]])
        #expect(try String(contentsOf: folder.appendingPathComponent("game.json"), encoding: .utf8) == "{}")
        // it is the first recent project
        let recent = try #require(await router.handle(body: ["method": "project.recent"]).0 as? [String: Any])
        let list = try #require(recent["projects"] as? [[String: Any]])
        #expect(list.first?["path"] as? String == folder.standardizedFileURL.path && list.first?["exists"] as? Bool == true)
    }

    @Test func createRefusesBadEntriesBeforeTouchingAnything() async throws {
        let dir = try tempDir(["web/index.html": "<p>", "web/a.txt": "a", "secret.txt": "no"])
        let roots = WebRoots(app: dir.appendingPathComponent("web"))
        let target = dir.appendingPathComponent("new")
        let f = FileMethods(roots: roots, env: ["VRMXG_SHELL_NEW_PROJECT": target.path])
        let router = BridgeRouter(); f.register(on: router)
        func refusal(_ files: Any) async -> String { await router.handle(body: ["method": "project.create", "params": ["files": files]]).1 ?? "" }
        #expect(await refusal([["from": "../secret.txt", "to": "s.txt"]]).contains("bad_params"), "nothing from outside the web content")
        #expect(await refusal([["from": "a.txt", "to": "../escape.txt"]]).contains("plain path"), "nothing outside the project")
        #expect(await refusal([["from": "a.txt", "to": ".hidden"]]).contains("plain path"))
        #expect(await refusal([["from": "a.txt", "to": "x//y"]]).contains("plain path"))
        #expect(await refusal([["from": "missing.txt", "to": "m.txt"]]).contains("the app has no file"))
        #expect(await refusal([["from": "a.txt", "to": "A.txt"], ["text": "x", "to": "a.txt"]]).contains("listed twice"), "two names a Mac's disk can't both hold")
        #expect(await refusal([["to": "x.txt"]]).contains("needs from, text or base64"))
        #expect(await refusal([] as [Any]).contains("at least one file"))
        let long = String(repeating: "é", count: 130) // 260 bytes
        #expect(await router.handle(body: ["method": "project.create", "params": ["name": long, "files": [["from": "a.txt", "to": "a.txt"]]]]).1?.contains("255 bytes") == true)
        #expect(!FileManager.default.fileExists(atPath: target.path), "every refusal came before the folder was made")
    }

    @Test func createIsRefusedOverAnythingAndLeavesAnEmptyFolderAsItWas() async throws {
        let dir = try tempDir(["web/index.html": "<p>", "web/a.txt": "a", "full/keep.txt": "mine", "empty/.DS_Store": "x"])
        let roots = WebRoots(app: dir.appendingPathComponent("web"))
        let full = FileMethods(roots: roots, env: ["VRMXG_SHELL_NEW_PROJECT": dir.appendingPathComponent("full").path])
        let r1 = BridgeRouter(); full.register(on: r1)
        let refused = await r1.handle(body: ["method": "project.create", "params": ["files": [["from": "a.txt", "to": "a.txt"]]]])
        #expect(refused.1?.contains("exists") == true && refused.1?.contains("isn't empty") == true)
        #expect(try FileManager.default.contentsOfDirectory(atPath: dir.appendingPathComponent("full").path) == ["keep.txt"])

        // an empty folder (hidden files only) takes a project; a copy that fails part way removes only what it made
        let empty = dir.appendingPathComponent("empty")
        let e = FileMethods(roots: roots, env: ["VRMXG_SHELL_NEW_PROJECT": empty.path])
        let r2 = BridgeRouter(); e.register(on: r2)
        // the second entry writes over the first (a file where a folder must go): it fails after the first was copied
        let broken = await r2.handle(body: ["method": "project.create", "params": ["files": [["from": "a.txt", "to": "sub"], ["text": "x", "to": "sub/b.txt"]]]])
        #expect(broken.1?.contains("failed") == true)
        #expect(try FileManager.default.contentsOfDirectory(atPath: empty.path) == [".DS_Store"], "as it was")
        let ok = await r2.handle(body: ["method": "project.create", "params": ["files": [["from": "a.txt", "to": "sub/a.txt"]]]])
        #expect((ok.0 as? [String: Any])?["files"] as? [String] == ["sub/a.txt"])

        // a new folder whose copy fails is removed whole
        let fresh = dir.appendingPathComponent("fresh")
        let n = FileMethods(roots: roots, env: ["VRMXG_SHELL_NEW_PROJECT": fresh.path])
        let r3 = BridgeRouter(); n.register(on: r3)
        _ = await r3.handle(body: ["method": "project.create", "params": ["files": [["from": "a.txt", "to": "sub"], ["text": "x", "to": "sub/b.txt"]]]])
        #expect(!FileManager.default.fileExists(atPath: fresh.path))
    }

    @Test func recentProjectsReopenWithNoPanelAndAreForgotten() async throws {
        let dir = try tempDir(["web/index.html": "<p>", "one/a.vrmxs": "{}", "two/b.vrmxs": "{}"])
        let roots = WebRoots(app: dir.appendingPathComponent("web"))
        let (d, suite) = try defaults(); defer { d.removePersistentDomain(forName: suite) }
        let first = FileMethods(roots: roots, env: ["VRMXG_SHELL_PROJECT": dir.appendingPathComponent("one").path], defaults: d)
        let r1 = BridgeRouter(); first.register(on: r1)
        _ = await r1.handle(body: ["method": "project.open"])
        let second = FileMethods(roots: roots, env: ["VRMXG_SHELL_PROJECT": dir.appendingPathComponent("two").path], defaults: d)
        let r2 = BridgeRouter(); second.register(on: r2)
        _ = await r2.handle(body: ["method": "project.open"])
        let names = { (r: (Any?, String?)) in ((r.0 as? [String: Any])?["projects"] as? [[String: Any]] ?? []).compactMap { $0["name"] as? String } }
        #expect(names(await r2.handle(body: ["method": "project.recent"])) == ["two", "one"], "newest first")

        // a later launch: no panel hook, the same defaults
        let later = FileMethods(roots: roots, env: [:], defaults: d)
        let r3 = BridgeRouter(); later.register(on: r3)
        let reopened = try #require(await r3.handle(body: ["method": "project.reopen", "params": ["path": dir.appendingPathComponent("one").path]]).0 as? [String: Any])
        #expect(reopened["files"] as? [String] == ["a.vrmxs"] && roots.read(path: "/project/a.vrmxs").status == 200)
        #expect(names(await r3.handle(body: ["method": "project.recent"])) == ["one", "two"], "reopening puts it first")
        let notRecent = await r3.handle(body: ["method": "project.reopen", "params": ["path": dir.path]])
        #expect(notRecent.1?.contains("not_recent") == true)

        // a folder that moved is followed through its bookmark: listed under its new name, enabled, and reopened from
        // there; the list then keeps the new place (review of PR #52)
        let moved = dir.appendingPathComponent("one-moved")
        try FileManager.default.moveItem(at: dir.appendingPathComponent("one"), to: moved)
        let afterMove = later.recentProjects().first { ($0["path"] as? String) == dir.appendingPathComponent("one").standardizedFileURL.path }
        #expect(afterMove?["name"] as? String == "one-moved" && afterMove?["exists"] as? Bool == true, "still enabled: the bookmark knows where it went")
        #expect((afterMove?["location"] as? String)?.hasSuffix("/one-moved") == true)
        let back = try #require(await r3.handle(body: ["method": "project.reopen", "params": ["path": dir.appendingPathComponent("one").path]]).0 as? [String: Any])
        #expect((back["path"] as? String)?.hasSuffix("/one-moved") == true && back["files"] as? [String] == ["a.vrmxs"])
        #expect(names(await r3.handle(body: ["method": "project.recent"])) == ["one-moved", "two"])
        #expect(later.recentProjects().first?["path"] as? String == moved.standardizedFileURL.path, "the list follows the bookmark")
        try FileManager.default.moveItem(at: moved, to: dir.appendingPathComponent("one"))
        later.forgetRecent(moved.path)
        later.noteRecent(dir.appendingPathComponent("one"))

        // a folder that has gone is listed as gone, and reopening it says so
        try FileManager.default.removeItem(at: dir.appendingPathComponent("two"))
        let listed = (await r3.handle(body: ["method": "project.recent"]).0 as? [String: Any])?["projects"] as? [[String: Any]] ?? []
        #expect(listed.map { $0["exists"] as? Bool } == [true, false])
        #expect(await r3.handle(body: ["method": "project.reopen", "params": ["path": dir.appendingPathComponent("two").path]]).1?.contains("gone") == true)

        #expect(names(await r3.handle(body: ["method": "project.forget", "params": ["path": dir.appendingPathComponent("one").path]])).allSatisfy { $0 != "one" })
        #expect(names(await r3.handle(body: ["method": "project.forget", "params": ["all": true]])).isEmpty)
        // a folder in a Trash is gone, the home folder's or a volume's (review of PR #52)
        #expect(FileMethods.inTrash(URL(fileURLWithPath: "/Users/someone/.Trash/Cafe Dash")))
        #expect(FileMethods.inTrash(URL(fileURLWithPath: "/Volumes/Projects/.Trashes/501/Cafe Dash")))
        #expect(!FileMethods.inTrash(URL(fileURLWithPath: "/Volumes/Projects/Games/Trash Talk")))
        // at most recentCap are kept
        for i in 0..<(FileMethods.recentCap + 3) { later.noteRecent(try tempDir(["p\(i).vrmxs": "{}"])) }
        #expect(later.recentProjects().count == FileMethods.recentCap)
    }

    @Test func openRecentMenuIsBuiltFromTheListAndSendsItsPath() throws {
        let dir = try tempDir(["web/index.html": "<p>", "Cafe Game/game.json": "{}"])
        let (d, suite) = try defaults(); defer { d.removePersistentDomain(forName: suite) }
        let config = ShellConfiguration(appName: "Editor", scheme: "vrmxg-test-\(UUID().uuidString.prefix(8).lowercased())", pageUndo: true,
                                        fileItems: [ShellMenuItem("New Project…", event: "newProject", key: "n", modifiers: [.command, .shift])], recentProjects: true)
        let delegate = ShellAppDelegate(config: config)
        delegate.files = FileMethods(roots: WebRoots(app: dir.appendingPathComponent("web")), env: [:], defaults: d)
        let file = try #require(delegate.buildMenu().items[1].submenu)
        #expect(file.items.map { $0.isSeparatorItem ? "-" : $0.title } == ["Open…", "Open Project…", "Open Recent", "-", "New Project…", "-", "Save", "Save As…", "-", "Close Window"])
        let recent = try #require(file.item(withTitle: "Open Recent")?.submenu)
        delegate.menuNeedsUpdate(recent)
        #expect(recent.items.map(\.title) == ["Clear Menu"] && recent.items[0].action == nil, "nothing to clear yet")
        delegate.files.noteRecent(dir.appendingPathComponent("Cafe Game"))
        let gone = dir.appendingPathComponent("Gone")
        try FileManager.default.createDirectory(at: gone, withIntermediateDirectories: true)
        delegate.files.noteRecent(gone)
        try FileManager.default.removeItem(at: gone) // since moved to the Bin: listed, disabled
        delegate.menuNeedsUpdate(recent)
        #expect(recent.items.map { $0.isSeparatorItem ? "-" : $0.title } == ["Gone", "Cafe Game", "-", "Clear Menu"])
        #expect(recent.items[0].action == nil && recent.items[1].action == #selector(ShellAppDelegate.menuOpenRecent(_:)))
        #expect(recent.items[1].representedObject as? String == dir.appendingPathComponent("Cafe Game").standardizedFileURL.path)
        try #require(recent.items.count == 4)
        delegate.menuClearRecent(recent.items[3])
        delegate.menuNeedsUpdate(recent)
        #expect(recent.items.map(\.title) == ["Clear Menu"])
        // an app without it keeps its File menu as it was
        let plain = ShellAppDelegate(config: ShellConfiguration(appName: "Editor", scheme: "vrmxg-test-plain")).buildMenu()
        #expect(plain.items[1].submenu?.item(withTitle: "Open Recent") == nil)
    }
}
