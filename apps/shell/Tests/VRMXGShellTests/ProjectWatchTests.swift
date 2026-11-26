import Foundation
import Testing
@testable import VRMXGShell

/// The project watch (shell 0.15.0, M6 W2, AB-T-0645): the editor's hot reload hears its behaviours module change.
@Suite @MainActor struct ProjectWatchTests {
    /// Wait for a condition while the main queue runs (FSEvents reports on it), at most `seconds`.
    func eventually(_ seconds: Double = 8, _ done: () -> Bool) async throws -> Bool {
        let until = Date().addingTimeInterval(seconds)
        while !done() && Date() < until { try await Task.sleep(for: .milliseconds(25)) }
        return done()
    }

    @Test func aWatchedFileThatChangesIsReportedAndNothingElseIs() throws {
        let dir = try tempDir(["behaviours.js": "export class a {}", "lib/b.js": "export const b = 1", "level.vrmxs": "{}"])
        var heard: [[String]] = []
        let w = ProjectWatcher(root: dir) { heard.append($0) }
        #expect(try w.watch(["behaviours.js", "lib/b.js"]) == ["behaviours.js", "lib/b.js"])
        defer { w.stop() }
        w.check()
        #expect(heard.isEmpty, "nothing changed yet")
        try Data("{\"nodes\":[]}".utf8).write(to: dir.appendingPathComponent("level.vrmxs"))
        w.check()
        #expect(heard.isEmpty, "a file nobody watches")
        try Data("export const b = 2;".utf8).write(to: dir.appendingPathComponent("lib/b.js"), options: .atomic) // an editor's save: a new file in its place
        w.check()
        #expect(heard == [["lib/b.js"]])
        w.check()
        #expect(heard.count == 1, "once per change")
        try FileManager.default.removeItem(at: dir.appendingPathComponent("behaviours.js"))
        w.check()
        #expect(heard.last == ["behaviours.js"], "a file that went is a change")
        try Data("export class a {}".utf8).write(to: dir.appendingPathComponent("behaviours.js"))
        w.check()
        #expect(heard.last == ["behaviours.js"], "and so is one that came back")
    }

    @Test func onlyPathsInsideTheProjectAreWatched() throws {
        let dir = try tempDir(["p/behaviours.js": "x", "secret.js": "no"])
        let project = dir.appendingPathComponent("p")
        try FileManager.default.createSymbolicLink(at: project.appendingPathComponent("link.js"), withDestinationURL: dir.appendingPathComponent("secret.js"))
        let w = ProjectWatcher(root: project) { _ in }
        for bad in ["../secret.js", "/etc/hosts", "link.js", ""] {
            #expect(throws: BridgeError.self, "\(bad)") { try w.watch(["behaviours.js", bad]) }
        }
        #expect(w.watched.isEmpty && !w.isRunning, "a refused list changes nothing")
        #expect(throws: BridgeError.self) { try w.watch(Array(repeating: "behaviours.js", count: ProjectWatcher.maxPaths + 1)) }
        _ = try w.watch(["behaviours.js"])
        #expect(w.isRunning)
        _ = try w.watch([])
        #expect(!w.isRunning, "an empty list stops")
    }

    @Test func fsEventsReportAnEditorsSaveThroughTheBridge() async throws {
        let dir = try tempDir(["game/behaviours.js": "export class a {}", "behaviours.js": "export class w {}"])
        let roots = WebRoots(app: dir)
        let files = FileMethods(roots: roots, env: ["VRMXG_SHELL_PROJECT": dir.path], defaults: try #require(UserDefaults(suiteName: "vrmxg-watch-\(UUID().uuidString)")))
        var events: [(String, [String: Any])] = []
        let watches = WatchMethods(files: files) { name, payload in events.append((name, payload)) }
        let router = BridgeRouter(); files.register(on: router); watches.register(on: router)
        let refused = await router.handle(body: ["method": "project.watch", "params": ["paths": ["game/behaviours.js"]]])
        #expect(refused.1?.contains("no_project") == true, "no project open yet")
        _ = await router.handle(body: ["method": "project.open"])
        let r = await router.handle(body: ["method": "project.watch", "params": ["paths": ["game/behaviours.js", "behaviours.js"]]])
        #expect((r.0 as? [String: Any])?["watching"] as? [String] == ["behaviours.js", "game/behaviours.js"], "\(r.1 ?? "")")
        try await Task.sleep(for: .milliseconds(300)) // the stream starts after the files were written
        try Data("export class a { x() {} }".utf8).write(to: dir.appendingPathComponent("game/behaviours.js"), options: .atomic)
        #expect(try await eventually { events.contains { $0.0 == "project.changed" } }, "FSEvents reported the save")
        let paths = events.first { $0.0 == "project.changed" }?.1["paths"] as? [String]
        #expect(paths == ["game/behaviours.js"])
        // unwatched: a change says nothing
        _ = await router.handle(body: ["method": "project.unwatch"])
        events.removeAll()
        try Data("export class a {}".utf8).write(to: dir.appendingPathComponent("game/behaviours.js"), options: .atomic)
        try await Task.sleep(for: .milliseconds(500))
        #expect(events.isEmpty)
        // mounting another project lets the watch go
        _ = await router.handle(body: ["method": "project.watch", "params": ["paths": ["behaviours.js"]]])
        #expect(watches.watcher?.isRunning == true)
        _ = try files.mountFolder(try tempDir(["x.js": "x"]))
        #expect(watches.watcher == nil)
    }

    @Test func noAppWatchesUnlessItAsks() {
        #expect(ShellConfiguration(appName: "A game", scheme: "vrmxg-game").watchesProject == false, "a game build's shell has no project.watch")
        let router = BridgeRouter()
        FileMethods(roots: WebRoots(app: FileManager.default.temporaryDirectory)).register(on: router)
        #expect(!router.methods.contains("project.watch"), "the file methods don't bring it: only WatchMethods does, for an app with watchesProject")
    }
}
