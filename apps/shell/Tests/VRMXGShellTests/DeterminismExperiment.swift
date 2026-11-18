import AVFoundation
import Foundation
import Testing
import VideoToolbox
@testable import VRMXGShell

// An env-gated probe, not a test (M1 W8, 2026-11-18): does VideoToolbox, through AVAssetWriter, decode the same frames
// on every encode of the same pixels? Measured on the M5 Max, macOS 27.3, 640×360 synthetic frames, 60 per run:
//   H.264 ABR, frames appended with random gaps: 11/12 and 29/12 identical runs; every miss was frames 5–13 changing
//     GOP shape (B-frames placed differently). Frames always ready: 80/80.
//   HEVC ABR, random gaps: 30/30; frames always ready: 1/80. Quality mode (no bit rate) is no better: 28/30.
//   ProRes 4444 (intra only), frames always ready: 80/80.
// VideoToolbox's rate control and GOP decisions answer the timing of appends (AB-L-0013, AB-L-0049), so the export's
// contract is the rendered frames, hashed as they arrive; decoded identity is guaranteed only for ProRes.
//   VRMXG_DET=1 swift test --filter EncoderDeterminismExperiment      VRMXG_STARVE=h264|hevc|prores4444 swift test --filter EncoderStarvation
@Suite(.serialized) struct EncoderDeterminismExperiment {
    func decoded(_ url: URL) async throws -> [Data] {
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
    func run(_ s: ExportSettings) async throws -> [Data] {
        let out = FileManager.default.temporaryDirectory.appendingPathComponent("det-\(UUID().uuidString).\(ExportSettings.fileExtension(s.codec))")
        let session = try ExportSession(id: UUID().uuidString, settings: s, output: out)
        for n in stride(from: 0, to: s.frames, by: 2) {
            if Bool.random() { usleep(UInt32.random(in: 0...12000)) }
            await withTaskGroup(of: Void.self) { g in
                for k in [n + 1, n] where k < s.frames { g.addTask { await withCheckedContinuation { c in session.submit(k, syntheticFrame(k, s.width, s.height)) { _ in c.resume() } } } }
            }
        }
        _ = try await session.finish()
        defer { try? FileManager.default.removeItem(at: out) }
        return try await decoded(out)
    }
    @Test(arguments: ["abr", "quality", "noreorder"]) func variant(_ v: String) async throws {
        guard ProcessInfo.processInfo.environment["VRMXG_DET"] != nil else { return }
        for codec in ["h264", "hevc"] {
            var s = ExportSettings(width: 640, height: 360, fpsNum: 30, frames: 60, codec: codec)
            switch v {
            case "quality": s.extra = ["noBitrate": 1, AVVideoQualityKey: 0.7]
            case "noreorder": s.extra = [AVVideoAllowFrameReorderingKey: 0]
            default: break
            }
            let ref = try await run(s)
            var same = 0
            for _ in 0..<12 { let x = try await run(s); if x == ref { same += 1 } }
            print("DET \(v) \(codec): \(same)/12 identical runs, \(ref.count) frames")
        }
    }
}

@Suite(.serialized) struct EncoderStarvation {
    @Test func noStarvation() async throws {
        guard let codec = ProcessInfo.processInfo.environment["VRMXG_STARVE"] else { return }
        let s = ExportSettings(width: 640, height: 360, fpsNum: 30, frames: 60, codec: codec)
        let frames = (0..<s.frames).map { syntheticFrame($0, s.width, s.height) }
        let e = EncoderDeterminismExperiment()
        func encode() async throws -> [Data] {
            let out = FileManager.default.temporaryDirectory.appendingPathComponent("starve-\(UUID().uuidString).\(ExportSettings.fileExtension(codec))")
            let w = try VideoWriter(url: out, settings: s)
            for n in 0..<s.frames { try w.append(n, rgbaBottomUp: frames[n]) }
            try await w.finish()
            defer { try? FileManager.default.removeItem(at: out) }
            return try await e.decoded(out)
        }
        let ref = try await encode()
        var same = 0
        for _ in 0..<80 { if try await encode() == ref { same += 1 } }
        print("STARVE \(codec): \(same)/80 identical with frames always ready")
    }
}

