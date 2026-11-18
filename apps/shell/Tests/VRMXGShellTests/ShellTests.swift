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
