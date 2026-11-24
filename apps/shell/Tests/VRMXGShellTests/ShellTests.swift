import AppKit
import WebKit
import AVFoundation
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
        #expect(LoopbackServer.contentLength("POST /x HTTP/1.1\r\nHost: a\r\ncontent-length: 1234") == 1234)
        #expect(LoopbackServer.requestLine("POST /__export/frame?id=a&n=3 HTTP/1.1").query == "id=a&n=3")
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
        _ = await router.handle(body: ["method": "project.write", "params": ["path": "thumbnails/cafe.png", "base64": Data([0x89, 0x50, 0x4e, 0x47]).base64EncodedString()]])
        #expect(try Data(contentsOf: dir.appendingPathComponent("proj/thumbnails/cafe.png")) == Data([0x89, 0x50, 0x4e, 0x47]), "binary through base64")
        #expect(FileManager.default.fileExists(atPath: dir.appendingPathComponent("proj/scenes/new.vrmxs").path))
        let escape = await router.handle(body: ["method": "project.write", "params": ["path": "../evil.txt", "text": "x"]])
        #expect(escape.1?.contains("outside the project") == true)
    }
}

/// A binary file the person picks (AB-A-0314): served at a URL or returned as base64, remembered across launches.
@Suite @MainActor struct BinaryOpenTests {
    @Test func serveBase64RememberReopenAndForget() async throws {
        let dir = try tempDir(["web/index.html": "<p>", "Mira Chan.vrmxa": "PK\u{3}\u{4}zip"])
        let bytes = try Data(contentsOf: dir.appendingPathComponent("Mira Chan.vrmxa"))
        let roots = WebRoots(app: dir.appendingPathComponent("web"))
        let suite = "vrmxg-shell-test-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let env = ["VRMXG_SHELL_OPEN": dir.appendingPathComponent("Mira Chan.vrmxa").path]
        let first = FileMethods(roots: roots, env: env, defaults: defaults) // held: its handlers capture it unowned (AB-L-0363)
        let router = BridgeRouter(); first.register(on: router)

        let served = try #require(await router.handle(body: ["method": "file.open", "params": ["types": ["vrmxa"], "serve": true, "remember": "character"]]).0 as? [String: Any])
        let url = try #require(served["url"] as? String)
        #expect(url.hasPrefix("/opened/") && url.hasSuffix("/Mira%20Chan.vrmxa") && served["text"] == nil && served["size"] as? Int == bytes.count)
        let got = roots.read(path: url)
        #expect(got.status == 200 && got.data == bytes && got.type == "application/zip", "fetched by URL, no copy over the bridge")
        #expect(roots.read(path: "/opened/0000/Mira%20Chan.vrmxa").status == 404, "only the issued token serves")

        let b64 = try #require(await router.handle(body: ["method": "file.open", "params": ["binary": true]]).0 as? [String: Any])
        #expect(Data(base64Encoded: b64["base64"] as? String ?? "") == bytes)

        // the next launch: a new FileMethods, no panel hook, the same defaults
        let second = FileMethods(roots: roots, env: [:], defaults: defaults)
        let next = BridgeRouter(); second.register(on: next)
        let again = try #require(await next.handle(body: ["method": "file.reopen", "params": ["key": "character", "serve": true]]).0 as? [String: Any])
        #expect(roots.read(path: again["url"] as? String ?? "").data == bytes)
        #expect(await next.handle(body: ["method": "file.reopen", "params": ["key": "other"]]).0 is NSNull, "nothing remembered: null")
        _ = await next.handle(body: ["method": "file.forget", "params": ["key": "character"]])
        #expect(await next.handle(body: ["method": "file.reopen", "params": ["key": "character"]]).0 is NSNull)
        withExtendedLifetime((first, second)) {}
    }
}

@Suite @MainActor struct SaveMethodTests {
    @Test func writeListReadAndRemoveSlots() async throws {
        let dir = try tempDir([:])
        let saves = SaveMethods(appName: "Test", env: ["VRMXG_SHELL_SAVES": dir.appendingPathComponent("Saves").path])
        let router = BridgeRouter(); saves.register(on: router)
        let w = await router.handle(body: ["method": "saves.write", "params": ["slot": "slot-1", "text": "{\"format\":\"vrmxg-save\"}", "summary": ["step": 720, "name": "After the sword"]]])
        #expect((w.0 as? [String: Any])?["bytes"] as? Int == 23)
        _ = await router.handle(body: ["method": "saves.write", "params": ["slot": "slot-2", "text": "{}"]])
        let l = await router.handle(body: ["method": "saves.list"])
        let list = (l.0 as? [String: Any])?["saves"] as? [[String: Any]] ?? []
        #expect(list.map { $0["slot"] as? String } == ["slot-1", "slot-2"])
        #expect((list.first?["summary"] as? [String: Any])?["step"] as? Int == 720)
        let r = await router.handle(body: ["method": "saves.read", "params": ["slot": "slot-1"]])
        #expect((r.0 as? [String: Any])?["text"] as? String == "{\"format\":\"vrmxg-save\"}")
        _ = await router.handle(body: ["method": "saves.remove", "params": ["slot": "slot-2"]])
        let after = await router.handle(body: ["method": "saves.list"])
        #expect(((after.0 as? [String: Any])?["saves"] as? [[String: Any]])?.count == 1)
        let bad = await router.handle(body: ["method": "saves.write", "params": ["slot": "../evil", "text": "x"]])
        #expect(bad.1?.contains("a slot is") == true)
        let missing = await router.handle(body: ["method": "saves.read", "params": ["slot": "nope"]])
        #expect(missing.1?.contains("no save") == true)
    }
}

@Suite struct PostRouterTests {
    @Test func routesByPrefixAndParsesTheQuery() async {
        let r = PostRouter()
        r.register("/__export/frame") { req, reply in reply(200, PostRouter.json(["n": req.int("n") ?? -1, "bytes": req.body.count])) }
        let got: (Int, Data) = await withCheckedContinuation { c in r.handle(PostRequest(path: "/__export/frame", query: "id=x&n=7", body: Data(count: 12))) { c.resume(returning: ($0, $1)) } }
        #expect(got.0 == 200)
        #expect((try? JSONSerialization.jsonObject(with: got.1)) as? [String: Int] == ["n": 7, "bytes": 12])
        let missing: Int = await withCheckedContinuation { c in r.handle(PostRequest(path: "/nope", query: "", body: Data())) { s, _ in c.resume(returning: s) } }
        #expect(missing == 404)
        #expect(PostRouter.headers(length: 0)["Access-Control-Allow-Origin"] == "*", "a loopback page may POST to the scheme")
    }
}

/// A frame of WebGL readback (RGBA, row 0 at the bottom): grey level from n, a white top row so the flip shows.
func syntheticFrame(_ n: Int, _ w: Int, _ h: Int) -> Data {
    var d = Data(count: w * h * 4)
    d.withUnsafeMutableBytes { p in
        let b = p.bindMemory(to: UInt8.self)
        for y in 0..<h { for x in 0..<w {
            let i = (y * w + x) * 4, v: UInt8 = y == h - 1 ? 255 : UInt8((n * 8) % 200)
            b[i] = v; b[i + 1] = v; b[i + 2] = x < w / 2 ? v : 0; b[i + 3] = 255
        } }
    }
    return d
}

func sineWAV(seconds: Double, rate: Int = 48000) -> Data {
    let n = Int(seconds * Double(rate)), ch = 2
    var d = Data()
    func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
    func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
    d.append(contentsOf: Array("RIFF".utf8)); u32(UInt32(36 + n * ch * 2)); d.append(contentsOf: Array("WAVEfmt ".utf8))
    u32(16); u16(1); u16(UInt16(ch)); u32(UInt32(rate)); u32(UInt32(rate * ch * 2)); u16(UInt16(ch * 2)); u16(16)
    d.append(contentsOf: Array("data".utf8)); u32(UInt32(n * ch * 2))
    for i in 0..<n { let s = Int16(sin(Double(i) * 2 * .pi * 440 / Double(rate)) * 12000); u16(UInt16(bitPattern: s)); u16(UInt16(bitPattern: s)) }
    return d
}

@Suite struct ExportTests {
    func encode(_ s: ExportSettings, name: String) async throws -> (URL, [String: Any]) {
        let out = FileManager.default.temporaryDirectory.appendingPathComponent("vrmxg-export-test-\(UUID().uuidString)-\(name)")
        let session = try ExportSession(id: UUID().uuidString, settings: s, output: out)
        // two in flight, out of order: the session appends in frame order
        for n in stride(from: 0, to: s.frames, by: 2) {
            await withTaskGroup(of: Void.self) { g in
                for k in [n + 1, n] where k < s.frames {
                    g.addTask { await withCheckedContinuation { c in session.submit(k, syntheticFrame(k, s.width, s.height)) { e in #expect(e == nil); c.resume() } } }
                }
            }
        }
        if s.audio { try session.setAudio(sineWAV(seconds: Double(s.frames) * Double(s.fpsDen) / Double(s.fpsNum) + 0.5)) }
        return (out, try await session.finish())
    }

    @Test func h264WithAudioIsFrameExact() async throws {
        let s = ExportSettings(width: 320, height: 180, fpsNum: 30, frames: 45, codec: "h264", audio: true)
        let (url, stats) = try await encode(s, name: "a.mp4")
        #expect(stats["frames"] as? Int == 45)
        let asset = AVURLAsset(url: url)
        let v = try #require(try await asset.loadTracks(withMediaType: .video).first)
        let a = try #require(try await asset.loadTracks(withMediaType: .audio).first)
        #expect(try await asset.load(.duration).seconds == 1.5)
        let vr = try await v.load(.timeRange), ar = try await a.load(.timeRange)
        #expect(vr.start.seconds == 0 && abs(vr.duration.seconds - 1.5) < 1e-6, "video: \(vr.duration.seconds)")
        #expect(ar.start.seconds == 0 && abs(ar.duration.seconds - 1.5) < 0.03, "audio trimmed to the video: \(ar.duration.seconds)")
        // decode every frame: 45 of them, at n/30, the flip and swizzle right (white row on top, red half on the left)
        let reader = try AVAssetReader(asset: asset)
        let out = AVAssetReaderTrackOutput(track: v, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
        reader.add(out); reader.startReading()
        var times: [Double] = [], topRow = 0, leftRed = 0, leftBlue = 0
        while let sb = out.copyNextSampleBuffer() {
            times.append(CMSampleBufferGetPresentationTimeStamp(sb).seconds)
            if times.count == 20, let pb = CMSampleBufferGetImageBuffer(sb) {
                CVPixelBufferLockBaseAddress(pb, .readOnly)
                let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self), bpr = CVPixelBufferGetBytesPerRow(pb)
                topRow = Int(base[2]); let mid = 90 * bpr + 40 * 4, right = 90 * bpr + 280 * 4
                leftRed = Int(base[mid + 2]); leftBlue = Int(base[right + 0]) // BGRA: [2] is red; the right half has no blue... in RGBA terms
                CVPixelBufferUnlockBaseAddress(pb, .readOnly)
            }
        }
        #expect(times.count == 45)
        #expect(times.enumerated().allSatisfy { abs($0.element - Double($0.offset) / 30) < 1e-6 }, "frame n at n/30")
        #expect(topRow > 240, "readPixels' last row is the picture's top row")
        #expect(leftRed > 100 && leftBlue < 30, "RGBA swizzled to BGRA (left red \(leftRed), right blue \(leftBlue))")
    }

    func decodedFrames(_ url: URL) async throws -> [Data] {
        let asset = AVURLAsset(url: url)
        let v = try #require(try await asset.loadTracks(withMediaType: .video).first)
        let reader = try AVAssetReader(asset: asset)
        let out = AVAssetReaderTrackOutput(track: v, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
        reader.add(out); reader.startReading()
        var all: [Data] = []
        while let sb = out.copyNextSampleBuffer(), let pb = CMSampleBufferGetImageBuffer(sb) {
            CVPixelBufferLockBaseAddress(pb, .readOnly)
            all.append(Data(bytes: CVPixelBufferGetBaseAddress(pb)!, count: CVPixelBufferGetBytesPerRow(pb) * CVPixelBufferGetHeight(pb)))
            CVPixelBufferUnlockBaseAddress(pb, .readOnly)
        }
        return all
    }

    @Test func ntscRateLandsEveryFrameExactly() async throws {
        let s = ExportSettings(width: 256, height: 144, fpsNum: 30000, fpsDen: 1001, frames: 30, codec: "hevc")
        let (url, _) = try await encode(s, name: "ntsc.mp4")
        #expect(abs(try await AVURLAsset(url: url).load(.duration).seconds - 30 * 1001 / 30000.0) < 1e-9, "30 frames at 30000/1001 is 1.001 s exactly")
        #expect(try await decodedFrames(url).count == 30)
    }

    @Test func proResEncodesDecodeTheSameAndHashesMatch() async throws {
        var s = ExportSettings(width: 256, height: 144, fpsNum: 24, frames: 24, codec: "prores4444")
        s.hash = true
        let (a, sa) = try await encode(s, name: "a.mov"), (b, sb) = try await encode(s, name: "b.mov")
        let fa = try await decodedFrames(a), fb = try await decodedFrames(b)
        #expect(fa.count == 24 && fa == fb, "intra-only: decoded frames identical across encodes")
        let ha = sa["frameHashes"] as? [String], hb = sb["frameHashes"] as? [String]
        #expect(ha?.count == 24 && ha == hb, "the rendered frames' hashes, taken as they arrive")
        #expect(Set(ha ?? []).count == 24, "every frame differs")
    }

    @Test func frameHashIsThePagesHashFrame() {
        // vectors from @vrmxg/export's hashFrame (engine/packages/export/src/sinks.js)
        let b = Data((0..<4096).map { UInt8(truncatingIfNeeded: $0 * 37 + 11) })
        #expect(hashFrame(b) == "4f9a61c5e7aff90c")
        #expect(hashFrame(Data(count: 8)) == "117697cd1138fae6")
    }

    @Test func rowsBottomUpFromWebGLAndTopDownFromWebGPU() {
        // a 3×2 RGBA frame: pixel (x, y from the top) = [x, y, 7, 255]; BGRA rows out, row 0 at the top, either way
        let w = 3, h = 2
        func frame(topDown: Bool) -> Data {
            var d = Data(count: w * h * 4)
            for row in 0..<h { let y = topDown ? row : h - 1 - row; for x in 0..<w { d.replaceSubrange((row * w + x) * 4..<(row * w + x) * 4 + 4, with: [UInt8(x), UInt8(y), 7, 255]) } }
            return d
        }
        for topDown in [false, true] {
            var out = [UInt8](repeating: 0, count: w * h * 4)
            out.withUnsafeMutableBytes { VideoWriter.rgbaBottomUpToBGRA(frame(topDown: topDown), dst: $0.baseAddress!, dstRowBytes: w * 4, width: w, height: h, topDown: topDown) }
            #expect(Array(out[0..<4]) == [7, 0, 0, 255], "top-left first (topDown \(topDown))")
            #expect(Array(out[(w * 4 + 8)..<(w * 4 + 12)]) == [7, 1, 2, 255], "bottom-right last (topDown \(topDown))")
        }
    }

    @Test func subtitlesLandBesideTheFile() async throws {
        var s = ExportSettings(width: 64, height: 64, fpsNum: 24, frames: 2)
        s.subtitles = "1\n00:00:00,000 --> 00:00:01,000\nHana: Hello\n"
        let (url, r) = try await encode(s, name: "subs.mp4")
        let srt = url.deletingPathExtension().appendingPathExtension("srt")
        #expect(r["subtitles"] as? String == srt.path)
        #expect(try String(contentsOf: srt, encoding: .utf8) == s.subtitles)
    }

    @Test func refusesMissingFrames() async throws {
        let s = ExportSettings(width: 64, height: 64, fpsNum: 24, frames: 10)
        let out = FileManager.default.temporaryDirectory.appendingPathComponent("vrmxg-export-short-\(UUID().uuidString).mp4")
        let session = try ExportSession(id: "short", settings: s, output: out)
        await withCheckedContinuation { c in session.submit(0, syntheticFrame(0, 64, 64)) { _ in c.resume() } }
        await #expect(throws: BridgeError.self) { try await session.finish() }
        let bad: Error? = await withCheckedContinuation { c in session.submit(1, Data(count: 10)) { c.resume(returning: $0) } }
        #expect(bad != nil, "a cancelled export takes no more frames")
    }
}

/// A WAV that is silent but for one click at `at` samples (both channels), `seconds` long.
func clickWAV(seconds: Double, at: Int, rate: Int = 48000) -> Data {
    let n = Int(seconds * Double(rate)), ch = 2
    var d = Data()
    func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
    func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
    d.append(contentsOf: Array("RIFF".utf8)); u32(UInt32(36 + n * ch * 2)); d.append(contentsOf: Array("WAVEfmt ".utf8))
    u32(16); u16(1); u16(UInt16(ch)); u32(UInt32(rate)); u32(UInt32(rate * ch * 2)); u16(UInt16(ch * 2)); u16(16)
    d.append(contentsOf: Array("data".utf8)); u32(UInt32(n * ch * 2))
    for i in 0..<n { let v: Int16 = i == at ? 30000 : 0; u16(UInt16(bitPattern: v)); u16(UInt16(bitPattern: v)) }
    return d
}

/// M4 W10 (AB-T-0582): a delivery's files, and its sound against its pictures.
@Suite struct DeliveryTests {
    /// The decoded audio of a movie as mono floats at 48 kHz, from its start.
    func decodedAudio(_ url: URL) async throws -> [Float] {
        let asset = AVURLAsset(url: url)
        let a = try #require(try await asset.loadTracks(withMediaType: .audio).first)
        let reader = try AVAssetReader(asset: asset)
        let out = AVAssetReaderTrackOutput(track: a, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true,
                                                                       AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false, AVSampleRateKey: 48000, AVNumberOfChannelsKey: 2])
        reader.add(out); reader.startReading()
        var all: [Float] = []
        while let sb = out.copyNextSampleBuffer(), let block = CMSampleBufferGetDataBuffer(sb) {
            var len = 0, ptr: UnsafeMutablePointer<CChar>?
            CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &len, dataPointerOut: &ptr)
            ptr!.withMemoryRebound(to: Float.self, capacity: len / 4) { f in for i in stride(from: 0, to: len / 4, by: 2) { all.append(f[i]) } }
        }
        return all
    }

    /// Sound at lag 0: a click put at a frame's time in the page's WAV is heard at that time in the delivered file, for
    /// each delivery codec (AAC in .mp4 for H.264 and HEVC, in .mov for ProRes 4444): the encoder's priming is trimmed.
    @Test(arguments: ["h264", "hevc", "prores4444"]) func soundAtLagZero(codec: String) async throws {
        let s = ExportSettings(width: 128, height: 72, fpsNum: 24, frames: 48, codec: codec, audio: true)
        let out = FileManager.default.temporaryDirectory.appendingPathComponent("vrmxg-lag-\(UUID().uuidString).\(ExportSettings.fileExtension(codec))")
        let session = try ExportSession(id: UUID().uuidString, settings: s, output: out)
        for n in 0..<s.frames { await withCheckedContinuation { c in session.submit(n, syntheticFrame(n, s.width, s.height)) { e in #expect(e == nil); c.resume() } } }
        let click = 36000 // frame 18 at 24 fps: 0.75 s
        try session.setAudio(clickWAV(seconds: 2, at: click))
        _ = try await session.finish()
        let pcm = try await decodedAudio(out)
        #expect(abs(pcm.count - 96000) <= 1024, "two seconds of sound: \(pcm.count) samples")
        let peak = pcm.indices.max { abs(pcm[$0]) < abs(pcm[$1]) }!
        #expect(abs(peak - click) <= 2, "\(codec): the click at sample \(peak), sent at \(click): lag \(peak - click) samples")
    }

    /// A delivery's film goes into the open project (`projectPath`) with no panel, its folder made and its extension the
    /// codec's; a path outside the project, or no project, is refused.
    @Test @MainActor func exportsIntoTheProject() async throws {
        let dir = try tempDir(["proj/cafe.vrmxs": "{}"])
        let roots = WebRoots(app: dir)
        let files = FileMethods(roots: roots, env: [:])
        let router = BridgeRouter(), posts = PostRouter()
        files.register(on: router)
        let exports = ExportMethods(files: files); exports.register(on: router, posts: posts)
        let begin: [String: Any] = ["width": 64, "height": 36, "fps": [24, 1], "frames": 2, "codec": "prores4444", "hash": true,
                                    "projectPath": "deliveries/cafe-4k/cafe-4k.mp4", "subtitles": "1\n00:00:00,000 --> 00:00:00,080\nHana: Hi\n"]
        let refused = await router.handle(body: ["method": "export.begin", "params": begin])
        #expect(refused.1?.contains("no project") == true, "no project open yet")
        files.roots.mountProject(dir.appendingPathComponent("proj"))
        let r = await router.handle(body: ["method": "export.begin", "params": begin])
        let b = try #require(r.0 as? [String: Any])
        let id = try #require(b["id"] as? String)
        let want = dir.appendingPathComponent("proj/deliveries/cafe-4k/cafe-4k.mov").standardizedFileURL.path
        #expect((b["path"] as? String).map { URL(fileURLWithPath: $0).standardizedFileURL.path } == want, "the codec's extension, in the project")
        for n in 0..<2 {
            let st: Int = await withCheckedContinuation { c in posts.handle(PostRequest(path: "/__export/frame", query: "id=\(id)&n=\(n)", body: syntheticFrame(n, 64, 36))) { s, _ in c.resume(returning: s) } }
            #expect(st == 200)
        }
        let end = await router.handle(body: ["method": "export.end", "params": ["id": id]])
        let e = try #require(end.0 as? [String: Any])
        #expect((e["frameHashes"] as? [String])?.count == 2)
        #expect(FileManager.default.fileExists(atPath: want))
        #expect(FileManager.default.fileExists(atPath: want.replacingOccurrences(of: ".mov", with: ".srt")), "the subtitles beside it")
        #expect(!FileManager.default.fileExists(atPath: want + ".frames.json"), "evidence only under automation")
        let escape = await router.handle(body: ["method": "export.begin", "params": begin.merging(["projectPath": "../out.mov"]) { $1 }])
        #expect(escape.1?.contains("outside the project") == true)
    }
}

/// The microphone's permission (M3 W3). The test runner's bundle declares no usage descriptions, which is the case an
/// app without them is in: request refuses, and the web view's getUserMedia is denied even for our own origin.
@Suite @MainActor struct MicrophoneTests {
    @Test func statusAndRequestThroughTheBridge() async throws {
        let router = BridgeRouter()
        MicrophoneMethods().register(on: router)
        #expect(router.methods.contains("microphone.status") && router.methods.contains("microphone.request"))
        let (status, err) = await router.handle(body: ["method": "microphone.status"])
        #expect(err == nil)
        let s = try #require(status as? [String: Any])
        #expect(s["available"] is Bool && s["usageDescription"] as? Bool == false)
        #expect(["authorized", "denied", "restricted", "notDetermined"].contains(s["authorization"] as? String ?? ""))
        let (_, refused) = await router.handle(body: ["method": "microphone.request"])
        #expect(refused?.contains("\"unavailable\"") == true, "no usage description: refuse, don't let the system end the app")
    }

    @Test func mediaCaptureOnlyForOurOwnOriginsAndDeclaredDevices() {
        // Foreign origins are always denied.
        #expect(MicrophoneMethods.mediaDecision(host: "example.com", scheme: "https", appScheme: "vrmxg-playground", type: .microphone) == .deny)
        #expect(MicrophoneMethods.mediaDecision(host: "127.0.0.2", scheme: "http", appScheme: "vrmxg-playground", type: .microphone) == .deny)
        // Our own origins, but no usage descriptions in this bundle: denied too.
        #expect(MicrophoneMethods.mediaDecision(host: "127.0.0.1", scheme: "http", appScheme: "vrmxg-playground", type: .microphone) == .deny)
        #expect(MicrophoneMethods.mediaDecision(host: "app", scheme: "vrmxg-playground", appScheme: "vrmxg-playground", type: .camera) == .deny)
    }
}

/// Window modes and the menu bar item (AB-A-0317), on a real window and web view without launching the app.
@Suite @MainActor struct WindowModeTests {
    func delegate(_ config: ShellConfiguration) -> ShellAppDelegate {
        let d = ShellAppDelegate(config: config)
        d.webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        d.window = NSWindow(contentRect: d.webView.frame, styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: true)
        d.window.contentView = d.webView
        d.registerWindowMethods()
        return d
    }

    @Test func floatingAndBackToNormal() async throws {
        let d = delegate(ShellConfiguration(appName: "Test", scheme: "vrmxg-test-\(UUID().uuidString.prefix(8).lowercased())", size: NSSize(width: 800, height: 600)))
        #expect((await d.router.handle(body: ["method": "window.state"]).0 as? [String: Any])?["mode"] as? String == "normal")
        let f = await d.router.handle(body: ["method": "window.setMode", "params": ["mode": "floating", "borderless": true]])
        #expect((f.0 as? [String: Any])?["mode"] as? String == "floating")
        #expect(d.window.level == .floating && d.window.styleMask.contains(.borderless) && !d.window.isOpaque)
        #expect(d.window.contentLayoutRect.size == NSSize(width: 360, height: 480), "the floating size the first time")
        _ = await d.router.handle(body: ["method": "window.setMode", "params": ["mode": "normal"]])
        #expect(d.window.level == .normal && d.window.styleMask.contains(.titled) && d.window.isOpaque)
        let bad = await d.router.handle(body: ["method": "window.setMode", "params": ["mode": "huge"]])
        #expect(bad.1?.contains("bad_params") == true)
        _ = await d.router.handle(body: ["method": "window.hide"])
        #expect(!d.window.isVisible)
        // the default: closing closes, and the last window ends the app, as before
        #expect(d.windowShouldClose(d.window) && d.applicationShouldTerminateAfterLastWindowClosed(NSApplication.shared))
        d.window.orderOut(nil)
    }

    @Test func closeKeepsRunningWithAStatusItem() async throws {
        let config = ShellConfiguration(appName: "Companion", scheme: "vrmxg-test-\(UUID().uuidString.prefix(8).lowercased())",
                                        statusItem: StatusItemConfiguration(items: [("Talk", "talk")]), closeKeepsRunning: true, dockIcon: false)
        let d = delegate(config)
        d.showWindow()
        #expect(!d.windowShouldClose(d.window) && !d.window.isVisible, "closing hides")
        #expect(!d.applicationShouldTerminateAfterLastWindowClosed(NSApplication.shared))
        let titles = d.statusItem?.menu?.items.map(\.title) ?? []
        #expect(titles == ["Show Window", "", "Talk", "", "Quit Companion"])
        if let s = d.statusItem { NSStatusBar.system.removeStatusItem(s) }
    }
}

@Suite @MainActor struct AppMenuTests {
    @Test func appItemsInFileAndAppMenusSendTheirEvents() throws {
        let config = ShellConfiguration(appName: "Creator", scheme: "vrmxg-test-\(UUID().uuidString.prefix(8).lowercased())", pageUndo: true,
                                        fileItems: [ShellMenuItem("New Short", event: "newShort", key: "n"), .separator, ShellMenuItem("Open Script…", event: "openScript")],
                                        menus: [ShellMenu("Short", [ShellMenuItem("Apply Script", event: "applyScript", key: "\r")])])
        let d = ShellAppDelegate(config: config)
        let main = d.buildMenu()
        #expect(main.items.compactMap { $0.submenu?.title } == ["Creator", "File", "Edit", "View", "Short", "Window"], "the app's menu between View and Window")
        let file = try #require(main.items[1].submenu)
        #expect(file.items.map { $0.isSeparatorItem ? "-" : $0.title } == ["Open…", "Open Project…", "-", "New Short", "-", "Open Script…", "-", "Save", "Save As…", "-", "Close Window"])
        let new = try #require(file.item(withTitle: "New Short"))
        #expect(new.representedObject as? String == "newShort" && new.keyEquivalent == "n" && new.target === d)
        let apply = try #require(main.items[4].submenu?.item(withTitle: "Apply Script"))
        #expect(apply.representedObject as? String == "applyScript" && apply.action == #selector(ShellAppDelegate.menuOwn(_:)))
        // an app with none keeps the shell's menus as they were
        let plain = ShellAppDelegate(config: ShellConfiguration(appName: "Editor", scheme: "vrmxg-test-plain")).buildMenu()
        #expect(plain.items[1].submenu?.items.map { $0.isSeparatorItem ? "-" : $0.title } == ["Open…", "Open Project…", "-", "Save", "Save As…", "-", "Close Window"])
        #expect(plain.items.compactMap { $0.submenu?.title } == ["Editor", "File", "Edit", "View", "Window"])
    }

    @Test func anOpenedDocumentIsServedLikeABinaryOpen() throws {
        let dir = try tempDir(["web/index.html": "<p>", "cafe order.fountain": "INT. CAFE\n\nHi."])
        let roots = WebRoots(app: dir.appendingPathComponent("web"))
        let f = FileMethods(roots: roots, env: [:])
        let out = try f.opened(dir.appendingPathComponent("cafe order.fountain"))
        let url = try #require(out["url"] as? String)
        #expect(out["name"] as? String == "cafe order.fountain" && url.hasSuffix("/cafe%20order.fountain"))
        #expect(String(decoding: roots.read(path: url).data, as: UTF8.self) == "INT. CAFE\n\nHi.")
        #expect(f.granted.contains(dir.appendingPathComponent("cafe order.fountain")), "writing back to it needs no panel")
    }
}

@Suite @MainActor struct OpenDocumentsTests {
    @Test func onlyAnAppThatNamesTypesTakesOpenDocuments() throws {
        let sel = #selector(NSApplicationDelegate.application(_:open:))
        let editor = ShellAppDelegate(config: ShellConfiguration(appName: "Editor", scheme: "vrmxg-test-ed"))
        #expect(!editor.responds(to: sel), "no openTypes: AppKit's own answer, nothing granted")
        #expect(editor.responds(to: #selector(NSApplicationDelegate.applicationDidFinishLaunching(_:))), "other delegate methods unchanged")
        let creator = ShellAppDelegate(config: ShellConfiguration(appName: "Creator", scheme: "vrmxg-test-cr", openTypes: ["fountain", "VRMXA"]))
        #expect(creator.responds(to: sel))
        let urls = ["a.fountain", "b.vrmxa", "c.txt", "d.Fountain"].map { URL(fileURLWithPath: "/tmp/\($0)") }
        #expect(creator.acceptedOpens(urls).map(\.lastPathComponent) == ["a.fountain", "b.vrmxa", "d.Fountain"])
    }

    @Test func filesOpenedDuringAReloadWaitForThePage() throws {
        let d = ShellAppDelegate(config: ShellConfiguration(appName: "Creator", scheme: "vrmxg-test-rl", openTypes: ["fountain"]))
        d.webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 100, height: 100))
        d.pageLoaded = true
        d.webView(d.webView, didStartProvisionalNavigation: nil)   // a reload starts
        d.application(NSApplication.shared, open: [URL(fileURLWithPath: "/tmp/x.fountain"), URL(fileURLWithPath: "/tmp/y.png")])
        #expect(d.pendingOpens.map(\.lastPathComponent) == ["x.fountain"], "held for the new page; the .png refused")
    }
}

/// The face's shape from its landmarks (M4 W9, shell 0.8.0): pure geometry, so tested on drawn faces.
@Suite struct FaceShapeTests {
    /// An eye, a brow or a mouth as an ellipse outline: `w` wide and `h` open, centred on `c`.
    static func oval(_ c: CGPoint, w: Double, h: Double, n: Int = 8) -> [CGPoint] {
        (0..<n).map { i in let a = 2 * Double.pi * Double(i) / Double(n); return CGPoint(x: Double(c.x) + w / 2 * cos(a), y: Double(c.y) + h / 2 * sin(a)) }
    }
    /// A face: eyes 100 apart (the unit), 30 wide; a mouth `mouth` wide and `open` open; brows `brow` above the eyes.
    static func face(leftOpen: Double = 14, rightOpen: Double = 14, mouth: Double = 80, open: Double = 2, brow: Double = 30, turn: Double = 0, scale: Double = 1, at: CGPoint = .zero) -> FaceShape.Landmarks {
        let move = { (p: CGPoint) -> CGPoint in
            let x = Double(p.x) * scale, y = Double(p.y) * scale
            return CGPoint(x: x * cos(turn) - y * sin(turn) + Double(at.x), y: x * sin(turn) + y * cos(turn) + Double(at.y))
        }
        let l = CGPoint(x: -50, y: 0), r = CGPoint(x: 50, y: 0)
        return .init(
            leftEye: oval(l, w: 30, h: leftOpen).map(move), rightEye: oval(r, w: 30, h: rightOpen).map(move),
            leftBrow: [CGPoint(x: -65, y: brow), CGPoint(x: -50, y: brow + 3), CGPoint(x: -35, y: brow)].map(move),
            rightBrow: [CGPoint(x: 35, y: brow), CGPoint(x: 50, y: brow + 3), CGPoint(x: 65, y: brow)].map(move),
            outerLips: oval(CGPoint(x: 0, y: -90), w: mouth, h: 20 + open).map(move), innerLips: oval(CGPoint(x: 0, y: -90), w: mouth * 0.8, h: open).map(move))
    }
    func near(_ a: Double, _ b: Double, _ eps: Double = 1e-9) -> Bool { abs(a - b) < eps }

    @Test func measuresEachPartOnItsOwn() throws {
        let rest = try #require(FaceShape.measure(Self.face()))
        #expect(rest.blinkL < 0.25 && rest.blinkR < 0.25, "open eyes read open (\(rest.blinkL))")
        let narrow = try #require(FaceShape.measure(Self.face(leftOpen: 10, rightOpen: 10)))
        #expect(narrow.blinkL > rest.blinkL && narrow.blinkL < 0.5, "eyes narrowed by a smile are well short of shut (\(narrow.blinkL))")
        #expect(rest.jaw < 0.05)
        let shut = try #require(FaceShape.measure(Self.face(leftOpen: 1, rightOpen: 1)))
        #expect(shut.blinkL > 0.9 && shut.blinkR > 0.9, "a sliver of an eye is shut (\(shut.blinkL))")
        let wink = try #require(FaceShape.measure(Self.face(leftOpen: 1)))
        #expect(wink.blinkL > 0.9 && near(wink.blinkR, rest.blinkR), "one eye shut leaves the other as it was")
        #expect(near(wink.jaw, rest.jaw) && near(wink.smile, rest.smile) && near(wink.browUp, rest.browUp))
        let ah = try #require(FaceShape.measure(Self.face(open: 40)))
        #expect(ah.jaw > 0.6 && near(ah.blinkL, rest.blinkL) && near(ah.browUp, rest.browUp), "a mouth open 0.4 eye distances is most of the way (\(ah.jaw))")
        let grin = try #require(FaceShape.measure(Self.face(mouth: 105)))
        #expect(grin.smile > rest.smile + 0.4 && near(grin.jaw, rest.jaw, 0.01))
        let up = try #require(FaceShape.measure(Self.face(brow: 45))), down = try #require(FaceShape.measure(Self.face(brow: 20)))
        #expect(up.browUp > rest.browUp + 0.3 && down.browDown > rest.browDown + 0.2, "brows up and brows down from the same rest")
        #expect(near(up.browUp + up.browDown, 1))
        #expect(FaceShape.measure(.init(leftEye: [], rightEye: [], leftBrow: [], rightBrow: [], outerLips: [], innerLips: [])) == nil, "no eyes, no shape")
        // a head turned 50°: the eyes are closer together in the picture, and heights are put back by the turn's cosine
        let squeeze = { (p: CGPoint) in CGPoint(x: Double(p.x) * cos(0.87), y: Double(p.y)) }
        let f = Self.face(open: 20, brow: 35)
        let turned = FaceShape.Landmarks(leftEye: f.leftEye.map(squeeze), rightEye: f.rightEye.map(squeeze), leftBrow: f.leftBrow.map(squeeze), rightBrow: f.rightBrow.map(squeeze), outerLips: f.outerLips.map(squeeze), innerLips: f.innerLips.map(squeeze))
        let front = try #require(FaceShape.measure(f)), bare = try #require(FaceShape.measure(turned)), fixed = try #require(FaceShape.measure(turned, yaw: -0.87))
        #expect(bare.browUp > front.browUp + 0.2, "uncorrected, a turned head reads as raised brows")
        #expect(near(fixed.browUp, front.browUp, 1e-6) && near(fixed.jaw, front.jaw, 1e-6), "with the turn, the brows and the mouth read as they do from the front")
    }

    @Test func theSameFaceTiltedMovedOrFartherAwayReadsTheSame() throws {
        let a = try #require(FaceShape.measure(Self.face(leftOpen: 4, mouth: 95, open: 18, brow: 40)))
        for (turn, scale, at) in [(0.5, 1.0, CGPoint.zero), (-0.9, 0.35, CGPoint(x: 400, y: -120)), (0.0, 7.0, CGPoint(x: -3000, y: 80))] {
            let b = try #require(FaceShape.measure(Self.face(leftOpen: 4, mouth: 95, open: 18, brow: 40, turn: turn, scale: scale, at: at)))
            for (x, y) in [(a.blinkL, b.blinkL), (a.blinkR, b.blinkR), (a.jaw, b.jaw), (a.smile, b.smile), (a.browUp, b.browUp), (a.geo.earL, b.geo.earL), (a.geo.mouthWidth, b.geo.mouthWidth)] {
                #expect(near(x, y, 1e-9), "turned \(turn), scaled \(scale): \(x) and \(y)")
            }
        }
    }

    @Test func thePageHearsThePersonsOwnEyes() throws {
        let s = try #require(FaceShape.measure(Self.face(leftOpen: 1))) // the eye on the picture's left is shut
        let j = s.json
        #expect((j["blinkR"] as? Double ?? 0) > 0.9, "the picture's left is the person's right eye")
        #expect((j["blinkL"] as? Double ?? 1) < 0.25)
        #expect(((j["geo"] as? [String: Any])?["earL"] as? Double ?? 1) < 0.1, "geo keeps the picture's sides")
        #expect(vrmxgShellVersion == "0.8.0")
    }
}
