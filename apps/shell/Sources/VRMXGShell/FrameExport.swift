import Accelerate
import AppKit
import AVFoundation
import UniformTypeIdentifiers
import CoreVideo
import VideoToolbox

/// What an export makes: size, a rational frame rate (30000/1001 for 29.97), how many frames, the codec, and whether
/// a WAV comes with it. Frame n is stamped n · den / num seconds, whatever the wall clock did.
public struct ExportSettings: Sendable, Equatable {
    public var width: Int, height: Int
    public var fpsNum: Int32, fpsDen: Int32
    public var frames: Int
    /// h264 | hevc | hevc-alpha | prores4444
    public var codec: String
    /// Average bit rate in bits per second (H.264 / HEVC); nil picks one from the size and rate.
    public var bitrate: Int?
    public var audio: Bool
    /// A hash of every frame as it arrives, before encoding: the export's determinism contract (decoded H.264 / HEVC
    /// frames can differ between encodes of the same pixels, AB-L-0013; ProRes's don't). It is @vrmxg/export's
    /// hashFrame (FNV-1a, two lanes, 16 hex digits), so a Mac export compares directly with a browser's hash-only export
    /// and with a scrub of the same frame (M2 W12).
    public var hash = false
    /// SRT text to keep beside the file as `<name>.srt` (a sequence's dialogue); nil for none.
    public var subtitles: String?
    /// Keep the evidence beside the file (automation): `<file>.frames.json` with the frame hashes, and the mixed WAV.
    public var sidecars = false
    /// Extra VideoToolbox compression properties (experiments and tests).
    public var extra: [String: Double] = [:]
    /// Frames arrive with row 0 at the top (WebGPU's readback, M4 W2) rather than at the bottom (WebGL's readPixels).
    public var topDown = false

    public init(width: Int, height: Int, fpsNum: Int32, fpsDen: Int32 = 1, frames: Int, codec: String = "h264", bitrate: Int? = nil, audio: Bool = false) {
        self.width = width; self.height = height; self.fpsNum = fpsNum; self.fpsDen = fpsDen; self.frames = frames; self.codec = codec; self.bitrate = bitrate; self.audio = audio
    }

    public static let codecs = ["h264", "hevc", "hevc-alpha", "prores4444"]
    public static func fileExtension(_ codec: String) -> String { codec == "h264" || codec == "hevc" ? "mp4" : "mov" }
    public var fileType: AVFileType { Self.fileExtension(codec) == "mp4" ? .mp4 : .mov }
    public var fps: Double { Double(fpsNum) / Double(fpsDen) }
    public func time(_ n: Int) -> CMTime { CMTime(value: CMTimeValue(n) * CMTimeValue(fpsDen), timescale: fpsNum) }
    public var duration: CMTime { time(frames) }
    /// A movie time scale every frame time lands on exactly: 600 for 24, 25, 30, 50, 60; the rate's own for 29.97 & co.
    public var timeScale: Int32 { fpsDen == 1 && 600 % fpsNum == 0 ? 600 : fpsNum }
    /// 0.13 bits per pixel per frame for H.264 (VMAF ≈ 99.7 on the spike's shot at 1080p30, 8 Mbps); HEVC 60 % of that.
    public var effectiveBitrate: Int? {
        guard codec == "h264" || codec == "hevc" else { return nil }
        if let bitrate { return bitrate }
        let h264 = Double(width * height) * fps * 0.13
        return Int((codec == "hevc" ? h264 * 0.6 : h264).rounded())
    }
}

/// AVAssetWriter for offline frames (spike-frame-export's Exporter, AB-R-0927): VideoToolbox hardware, B-frames for
/// H.264 / HEVC, BT.709 tags, straight alpha for ProRes 4444, premultiplied for HEVC with alpha. Video only: audio is
/// muxed afterwards (`muxAudio`), so the page can mix it after the last frame without the writer's interleaving
/// waiting on it.
final class VideoWriter: @unchecked Sendable { // used from its session's serial queue only
    let url: URL
    let settings: ExportSettings
    private let writer: AVAssetWriter
    private let input: AVAssetWriterInput
    private let adaptor: AVAssetWriterInputPixelBufferAdaptor
    private(set) var lastFrame = -1
    private(set) var waitNs: UInt64 = 0

    init(url: URL, settings s: ExportSettings) throws {
        self.url = url; self.settings = s
        try? FileManager.default.removeItem(at: url)
        writer = try AVAssetWriter(outputURL: url, fileType: s.fileType)
        var props: [String: Any] = [:]
        let type: AVVideoCodecType
        switch s.codec {
        case "h264": type = .h264; props[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel
        case "hevc": type = .hevc; props[AVVideoProfileLevelKey] = kVTProfileLevel_HEVC_Main_AutoLevel as String
        case "hevc-alpha":
            type = .hevcWithAlpha
            props[kVTCompressionPropertyKey_AlphaChannelMode as String] = kVTAlphaChannelMode_PremultipliedAlpha as String
            props[kVTCompressionPropertyKey_TargetQualityForAlpha as String] = 0.8
        case "prores4444": type = .proRes4444
        default: throw BridgeError("bad_params", "unknown codec \"\(s.codec)\" (there are: \(ExportSettings.codecs.joined(separator: ", ")))")
        }
        if s.codec != "prores4444" {
            props[AVVideoExpectedSourceFrameRateKey] = Int(s.fps.rounded())
            props[AVVideoMaxKeyFrameIntervalKey] = Int(s.fps.rounded()) * 2
            props[AVVideoAllowFrameReorderingKey] = true
            if let b = s.effectiveBitrate { props[AVVideoAverageBitRateKey] = b }
        }
        for (k, v) in s.extra { if k == "noBitrate" { props.removeValue(forKey: AVVideoAverageBitRateKey) } else { props[k] = v } }
        let out: [String: Any] = [
            AVVideoCodecKey: type, AVVideoWidthKey: s.width, AVVideoHeightKey: s.height,
            AVVideoColorPropertiesKey: [AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                                        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                                        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2],
            AVVideoCompressionPropertiesKey: props,
        ]
        guard writer.canApply(outputSettings: out, forMediaType: .video) else { throw BridgeError("bad_params", "the writer refuses \(s.codec) at \(s.width)×\(s.height)") }
        input = AVAssetWriterInput(mediaType: .video, outputSettings: out)
        input.expectsMediaDataInRealTime = false
        adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: s.width, kCVPixelBufferHeightKey as String: s.height,
            kCVPixelBufferIOSurfacePropertiesKey as String: [:],
        ])
        input.mediaTimeScale = s.timeScale
        writer.movieTimeScale = s.timeScale
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? BridgeError("failed", "the writer did not start") }
        writer.startSession(atSourceTime: .zero)
    }

    /// Frame n as RGBA: from WebGL's readPixels (row 0 at the bottom), or from WebGPU's readback (row 0 at the top) when
    /// the settings say `topDown`. Blocks until the encoder takes more: the page feels that as its POST not answering yet.
    func append(_ n: Int, rgbaBottomUp data: Data) throws {
        let s = settings
        guard data.count == s.width * s.height * 4 else { throw BridgeError("bad_params", "frame \(n) is \(data.count) bytes; \(s.width)×\(s.height) RGBA is \(s.width * s.height * 4)") }
        let t = DispatchTime.now().uptimeNanoseconds
        while !input.isReadyForMoreMediaData {
            if writer.status == .failed { throw writer.error ?? BridgeError("failed", "the writer failed") }
            usleep(200)
        }
        waitNs += DispatchTime.now().uptimeNanoseconds - t
        guard let pool = adaptor.pixelBufferPool else { throw writer.error ?? BridgeError("failed", "no pixel buffer pool") }
        var pb: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb)
        guard let pb else { throw BridgeError("failed", "no pixel buffer") }
        CVPixelBufferLockBaseAddress(pb, [])
        let dst = CVPixelBufferGetBaseAddress(pb)!, rowBytes = CVPixelBufferGetBytesPerRow(pb)
        Self.rgbaBottomUpToBGRA(data, dst: dst, dstRowBytes: rowBytes, width: s.width, height: s.height, topDown: s.topDown)
        if s.codec == "prores4444" { // ProRes has no "premultiplied" flag and compositors read it as straight alpha
            var b = vImage_Buffer(data: dst, height: vImagePixelCount(s.height), width: vImagePixelCount(s.width), rowBytes: rowBytes)
            vImageUnpremultiplyData_RGBA8888(&b, &b, vImage_Flags(kvImageNoFlags))
        }
        CVPixelBufferUnlockBaseAddress(pb, [])
        guard adaptor.append(pb, withPresentationTime: s.time(n)) else { throw writer.error ?? BridgeError("failed", "append failed at frame \(n)") }
        lastFrame = n
    }

    func finish() async throws {
        input.markAsFinished()
        writer.endSession(atSourceTime: settings.time(lastFrame + 1))
        await writer.finishWriting()
        if writer.status != .completed { throw writer.error ?? BridgeError("failed", "the writer did not complete") }
    }

    func cancel() { writer.cancelWriting(); try? FileManager.default.removeItem(at: url) }

    /// readPixels gives RGBA with row 0 at the bottom; AVFoundation wants BGRA, row 0 at the top. One pass, in bands.
    /// `topDown`: the source rows are already top-first (WebGPU), so only the channels move.
    static func rgbaBottomUpToBGRA(_ src: Data, dst: UnsafeMutableRawPointer, dstRowBytes: Int, width: Int, height: Int, topDown: Bool = false) {
        src.withUnsafeBytes { s in
            nonisolated(unsafe) let sp = UnsafeMutableRawPointer(mutating: s.baseAddress!)
            nonisolated(unsafe) let d = dst
            let bands = 8
            DispatchQueue.concurrentPerform(iterations: bands) { b in
                var map: [UInt8] = [2, 1, 0, 3]
                for y in (height * b / bands)..<(height * (b + 1) / bands) {
                    var sb = vImage_Buffer(data: sp + (topDown ? y : height - 1 - y) * width * 4, height: 1, width: vImagePixelCount(width), rowBytes: width * 4)
                    var db = vImage_Buffer(data: d + y * dstRowBytes, height: 1, width: vImagePixelCount(width), rowBytes: dstRowBytes)
                    vImagePermuteChannels_ARGB8888(&sb, &db, &map, vImage_Flags(kvImageDoNotTile))
                }
            }
        }
    }
}

/// Video file + WAV → the final file: the video passed through untouched, the WAV encoded to AAC (LPCM in a .mov with
/// alpha codecs would also do; AAC keeps every container the same), trimmed to the video's length. Both inputs are fed
/// on their own queues so the writer interleaves them; blocking reads stay off the cooperative pool (AB-L-0320).
func muxAudio(video: URL, wav: URL, into out: URL, settings s: ExportSettings) async throws {
    try? FileManager.default.removeItem(at: out)
    let vAsset = AVURLAsset(url: video), aAsset = AVURLAsset(url: wav)
    guard let vTrack = try await vAsset.loadTracks(withMediaType: .video).first else { throw BridgeError("failed", "no video track in \(video.lastPathComponent)") }
    guard let aTrack = try await aAsset.loadTracks(withMediaType: .audio).first else { throw BridgeError("bad_params", "the audio is not a readable WAV") }
    let hint = try await vTrack.load(.formatDescriptions).first
    let writer = try AVAssetWriter(outputURL: out, fileType: s.fileType)
    let vIn = AVAssetWriterInput(mediaType: .video, outputSettings: nil, sourceFormatHint: hint)
    vIn.expectsMediaDataInRealTime = false
    let aIn = AVAssetWriterInput(mediaType: .audio, outputSettings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 48000, AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: 256_000])
    aIn.expectsMediaDataInRealTime = false
    vIn.mediaTimeScale = s.timeScale
    writer.movieTimeScale = s.timeScale
    writer.add(vIn); writer.add(aIn)

    let vReader = try AVAssetReader(asset: vAsset)
    let vOut = AVAssetReaderTrackOutput(track: vTrack, outputSettings: nil)
    vReader.add(vOut)
    let aReader = try AVAssetReader(asset: aAsset)
    aReader.timeRange = CMTimeRange(start: .zero, duration: s.duration)
    let aOut = AVAssetReaderTrackOutput(track: aTrack, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true,
                                                                       AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false])
    aReader.add(aOut)
    guard vReader.startReading(), aReader.startReading() else { throw vReader.error ?? aReader.error ?? BridgeError("failed", "could not read the parts") }
    guard writer.startWriting() else { throw writer.error ?? BridgeError("failed", "the mux writer did not start") }
    writer.startSession(atSourceTime: .zero)

    let group = DispatchGroup()
    func pump(_ input: AVAssetWriterInput, _ output: AVAssetReaderTrackOutput, _ label: String) {
        group.enter()
        nonisolated(unsafe) let i = input, o = output
        i.requestMediaDataWhenReady(on: DispatchQueue(label: "vrmxg-shell.mux.\(label)")) {
            while i.isReadyForMoreMediaData {
                if let sb = o.copyNextSampleBuffer() { if !i.append(sb) { i.markAsFinished(); group.leave(); return } }
                else { i.markAsFinished(); group.leave(); return }
            }
        }
    }
    pump(vIn, vOut, "video"); pump(aIn, aOut, "audio")
    await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in group.notify(queue: .global()) { c.resume() } }
    writer.endSession(atSourceTime: s.duration)
    await writer.finishWriting()
    if writer.status != .completed { throw writer.error ?? BridgeError("failed", "the mux did not complete") }
}

/// One export in progress: frames arrive by POST (possibly out of order with several in flight) and are appended in
/// order on a serial queue; the WAV arrives by POST; `finish` closes the video and muxes the audio.
public final class ExportSession: @unchecked Sendable { // mutable state is touched on `queue` only
    public let id: String
    public let settings: ExportSettings
    public let output: URL
    let videoURL: URL
    let wavURL: URL
    private let queue = DispatchQueue(label: "vrmxg-shell.export", qos: .userInitiated)
    private var writer: VideoWriter?
    private var pending: [Int: (Data, @Sendable (Error?) -> Void)] = [:]
    private var nextN = 0, received = 0, bytesIn = 0
    private var convertNs: UInt64 = 0
    private var hasAudio = false
    private var failure: Error?
    private let t0 = DispatchTime.now().uptimeNanoseconds
    private var hashes: [String?]
    private let hashLock = NSLock(), hashGroup = DispatchGroup()

    public init(id: String, settings: ExportSettings, output: URL) throws {
        self.id = id; self.settings = settings; self.output = output
        let tmp = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("vrmxg-export", isDirectory: true)
        try FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
        videoURL = settings.audio ? tmp.appendingPathComponent("\(id)-video.\(ExportSettings.fileExtension(settings.codec))") : output
        wavURL = tmp.appendingPathComponent("\(id).wav")
        hashes = Array(repeating: nil, count: settings.hash ? settings.frames : 0)
        writer = try VideoWriter(url: videoURL, settings: settings)
    }

    /// Frame n's bytes; `done` runs once it is encoded (or failed).
    public func submit(_ n: Int, _ data: Data, done: @escaping @Sendable (Error?) -> Void) {
        queue.async {
            if let f = self.failure { done(f); return }
            guard self.writer != nil else { done(BridgeError("cancelled", "the export was cancelled or has finished")); return }
            guard n >= self.nextN, n < self.settings.frames, self.pending[n] == nil else { done(BridgeError("bad_params", "frame \(n) is out of range or a repeat")); return }
            self.pending[n] = (data, done)
            if self.settings.hash { // off the encoding queue (spike-frame-export gotcha 15)
                DispatchQueue.global(qos: .userInitiated).async(group: self.hashGroup) {
                    let h = hashFrame(data)
                    self.hashLock.withLock { self.hashes[n] = h }
                }
            }
            while let (d, cb) = self.pending.removeValue(forKey: self.nextN) {
                let t = DispatchTime.now().uptimeNanoseconds
                do { try self.writer?.append(self.nextN, rgbaBottomUp: d); self.received += 1; self.bytesIn += d.count; cb(nil) }
                catch { self.failure = error; cb(error) }
                self.convertNs += DispatchTime.now().uptimeNanoseconds - t
                self.nextN += 1
            }
        }
    }

    public func setAudio(_ wav: Data) throws {
        guard settings.audio else { throw BridgeError("bad_params", "this export was begun without audio") }
        try wav.write(to: wavURL)
        queue.sync { hasAudio = true }
    }

    /// Close the video, mux the audio, and report.
    /// What the page measured (its frame loop's timings), kept in the evidence beside an automated export.
    public var pageTimings: [String: Any] = [:]

    public func finish() async throws -> [String: Any] {
        let (writer, received, bytesIn, convertNs, hasAudio, failure, pendingCount) = queue.sync { (self.writer, self.received, self.bytesIn, self.convertNs, self.hasAudio, self.failure, self.pending.count) }
        if let failure { cancel(); throw failure }
        guard let writer else { throw BridgeError("failed", "this export was cancelled") }
        guard received == settings.frames, pendingCount == 0 else { cancel(); throw BridgeError("bad_params", "\(received) of \(settings.frames) frames arrived") }
        let t1 = DispatchTime.now().uptimeNanoseconds
        try await writer.finish()
        let t2 = DispatchTime.now().uptimeNanoseconds
        if settings.audio {
            guard hasAudio else { throw BridgeError("bad_params", "the export was begun with audio but no WAV arrived") }
            try await muxAudio(video: videoURL, wav: wavURL, into: output, settings: settings)
            try? FileManager.default.removeItem(at: videoURL)
            if settings.sidecars {
                let keep = output.deletingPathExtension().appendingPathExtension("wav")
                try? FileManager.default.removeItem(at: keep)
                try? FileManager.default.moveItem(at: wavURL, to: keep)
            } else { try? FileManager.default.removeItem(at: wavURL) }
        }
        let t3 = DispatchTime.now().uptimeNanoseconds
        let ms = { (a: UInt64, b: UInt64) in (Double(b - a) / 1e5).rounded() / 10 }
        let size = (try? FileManager.default.attributesOfItem(atPath: output.path)[.size] as? Int) ?? 0
        queue.sync { self.writer = nil }
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in hashGroup.notify(queue: .global()) { c.resume() } }
        let frameHashes = hashLock.withLock { hashes.map { $0 ?? "" } }
        var out: [String: Any] = ["path": output.path, "name": output.lastPathComponent, "bytes": size, "frames": received, "bytesIn": bytesIn,
                "codec": settings.codec, "audio": settings.audio,
                "width": settings.width, "height": settings.height, "fps": [Int(settings.fpsNum), Int(settings.fpsDen)],
                "seconds": CMTimeGetSeconds(settings.duration),
                "encodeMsPerFrame": (Double(convertNs) / 1e6 / Double(max(received, 1)) * 100).rounded() / 100,
                "waitMsPerFrame": (Double(writer.waitNs) / 1e6 / Double(max(received, 1)) * 100).rounded() / 100,
                "finishMs": ms(t1, t2), "muxMs": settings.audio ? ms(t2, t3) : 0, "swiftWallMs": ms(t0, t3)]
        // only plain values: WebKit refuses a reply holding a Swift Optional ("the result value … was unsupported")
        if let b = settings.effectiveBitrate { out["bitrate"] = b }
        if settings.hash { out["frameHashes"] = frameHashes }
        if let srt = settings.subtitles {
            let url = output.deletingPathExtension().appendingPathExtension("srt")
            do { try writeSidecar(Data(srt.utf8), to: url, beside: output); out["subtitles"] = url.path }
            catch { out["subtitlesError"] = ExportMethods.message(error) }
        }
        if settings.sidecars, settings.hash, let data = try? JSONSerialization.data(withJSONObject: ["frames": frameHashes, "page": pageTimings, "shell": out.filter { $0.key != "frameHashes" }, "settings": ["width": settings.width, "height": settings.height, "fps": [Int(settings.fpsNum), Int(settings.fpsDen)], "codec": settings.codec, "audio": settings.audio]], options: [.sortedKeys]) {
            try? data.write(to: URL(fileURLWithPath: output.path + ".frames.json"))
        }
        return out
    }

    public func cancel() {
        queue.sync {
            writer?.cancel(); writer = nil
            for (_, (_, cb)) in pending { cb(BridgeError("cancelled", "the export was cancelled")) }
            pending.removeAll()
        }
        try? FileManager.default.removeItem(at: wavURL)
        if settings.audio { try? FileManager.default.removeItem(at: videoURL) }
    }
}

/// @vrmxg/export's hashFrame: FNV-1a over the frame's 32-bit little-endian words in two lanes, as 16 hex digits.
public func hashFrame(_ data: Data) -> String {
    var a: UInt32 = 0x811c9dc5, b: UInt32 = 0x2545f491
    data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
        let n = raw.count / 4
        for i in 0..<n {
            let u = UInt32(littleEndian: raw.loadUnaligned(fromByteOffset: i * 4, as: UInt32.self))
            a = (a ^ u) &* 0x01000193
            b = ((b ^ u) &* 0x5bd1e995) ^ (b >> 15)
        }
    }
    return String(format: "%08x%08x", a, b)
}

/// A file beside one the person chose (a movie's subtitles). In the sandbox that is a related item: the app declares
/// the extension with NSIsRelatedItemType, and the write is coordinated by a presenter whose primary item is the movie.
final class SidecarPresenter: NSObject, NSFilePresenter {
    let primaryPresentedItemURL: URL?, presentedItemURL: URL?
    let presentedItemOperationQueue = OperationQueue()
    init(primary: URL, sidecar: URL) { primaryPresentedItemURL = primary; presentedItemURL = sidecar }
}

func writeSidecar(_ data: Data, to url: URL, beside primary: URL) throws {
    if (try? data.write(to: url)) != nil { return } // outside the sandbox, or a folder automation made
    let p = SidecarPresenter(primary: primary, sidecar: url)
    NSFileCoordinator.addFilePresenter(p)
    defer { NSFileCoordinator.removeFilePresenter(p) }
    var coordErr: NSError?, writeErr: Error?
    NSFileCoordinator(filePresenter: p).coordinate(writingItemAt: url, options: .forReplacing, error: &coordErr) { u in
        do { try data.write(to: u) } catch { writeErr = error }
    }
    if let e = coordErr ?? writeErr { throw e }
}

/// The export bridge methods and POST routes:
///   export.begin { width, height, fps: [num, den], frames, codec, bitrate?, audio?, hash?, subtitles?, topDown?, suggestedName, path?, projectPath? } → { id, path, … }
///   POST __export/frame?id=&n=   raw RGBA, row 0 at the bottom (WebGL's readPixels) or, with topDown, at the top (WebGPU), answered once encoded
///   POST __export/audio?id=      the mixed WAV
///   export.end { id } → the file and timings;  export.cancel { id }
/// The destination comes from a save panel, a `path` the person already granted, `projectPath` (M4 W10: a path inside
/// the mounted project, such as a delivery's `deliveries/<name>/<name>.mov`, folders made as needed; the project folder
/// was granted when it was opened, so a delivery's many files need no panel each), or `VRMXG_SHELL_EXPORT` (a file, or
/// a folder ending in "/" that takes `suggestedName`; relative paths are under the sandbox's temporary folder).
@MainActor
public final class ExportMethods {
    let files: FileMethods
    private let store = Store()

    final class Store: @unchecked Sendable { // guarded by `lock`
        private var sessions: [String: ExportSession] = [:]
        private let lock = NSLock()
        func get(_ id: String?) -> ExportSession? { id.flatMap { id in lock.withLock { sessions[id] } } }
        func put(_ s: ExportSession) { lock.withLock { sessions[s.id] = s } }
        func remove(_ id: String) -> ExportSession? { lock.withLock { sessions.removeValue(forKey: id) } }
    }

    public init(files: FileMethods) { self.files = files }

    public func register(on router: BridgeRouter, posts: PostRouter) {
        router.register("export.begin") { [unowned self] p in try self.begin(p) }
        router.register("export.end") { [unowned self] p in try await self.end(p) }
        router.register("export.cancel") { [unowned self] p in self.store.remove(try p.require("id"))?.cancel(); return ["cancelled": true] }
        let store = self.store
        posts.register("/__export/frame") { req, reply in
            guard let s = store.get(req.query["id"]), let n = req.int("n") else { reply(404, PostRouter.json(["error": "no such export or frame"])); return }
            s.submit(n, req.body) { err in reply(err == nil ? 200 : 409, PostRouter.json(err.map { ["error": Self.message($0)] } ?? ["n": n])) }
        }
        posts.register("/__export/audio") { req, reply in
            guard let s = store.get(req.query["id"]) else { reply(404, PostRouter.json(["error": "no such export"])); return }
            do { try s.setAudio(req.body); reply(200, PostRouter.json(["bytes": req.body.count])) }
            catch { reply(409, PostRouter.json(["error": Self.message(error)])) }
        }
        posts.register("/__export/ping") { req, reply in reply(200, PostRouter.json(["bytes": req.body.count])) }
    }

    nonisolated static func message(_ e: Error) -> String { (e as? BridgeError)?.message ?? e.localizedDescription }

    func settings(_ p: BridgeParams) throws -> ExportSettings {
        let fps = p.raw["fps"] as? [NSNumber] ?? [(p.raw["fps"] as? NSNumber) ?? 30, 1]
        guard let w = p.number("width").map(Int.init), let h = p.number("height").map(Int.init), w > 0, h > 0, w % 2 == 0, h % 2 == 0, w <= 8192, h <= 8192 else {
            throw BridgeError("bad_params", "width and height must be even and at most 8192")
        }
        guard let frames = p.number("frames").map(Int.init), frames > 0 else { throw BridgeError("bad_params", "frames must be positive") }
        guard fps.count == 2, fps[0].int32Value > 0, fps[1].int32Value > 0 else { throw BridgeError("bad_params", "fps is [num, den]") }
        let codec = p.string("codec") ?? "h264"
        guard ExportSettings.codecs.contains(codec) else { throw BridgeError("bad_params", "codec is one of \(ExportSettings.codecs.joined(separator: ", "))") }
        var s = ExportSettings(width: w, height: h, fpsNum: fps[0].int32Value, fpsDen: fps[1].int32Value, frames: frames, codec: codec,
                               bitrate: p.number("bitrate").map(Int.init), audio: p.bool("audio") ?? false)
        s.hash = p.bool("hash") ?? false
        s.subtitles = p.string("subtitles")
        s.topDown = p.bool("topDown") ?? false
        return s
    }

    func begin(_ p: BridgeParams) throws -> Any? {
        let s = try settings(p)
        let ext = ExportSettings.fileExtension(s.codec)
        var name = p.string("suggestedName") ?? "export.\(ext)"
        if (name as NSString).pathExtension.lowercased() != ext { name = (name as NSString).deletingPathExtension + ".\(ext)" }
        var url: URL?, automated = false
        if let path = p.string("path"), files.granted.contains(URL(fileURLWithPath: path)) { url = URL(fileURLWithPath: path) }
        if url == nil, let rel = p.string("projectPath") {
            var file = try files.projectFile(rel)
            if file.pathExtension.lowercased() != ext { file = file.deletingPathExtension().appendingPathExtension(ext) }
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            url = file
            automated = files.hook("VRMXG_SHELL_EXPORT") != nil // automation keeps its evidence beside the file
        }
        if url == nil, let hook = files.hook("VRMXG_SHELL_EXPORT") {
            automated = true
            url = files.env["VRMXG_SHELL_EXPORT"]!.hasSuffix("/") ? hook.appendingPathComponent(name) : hook
            try FileManager.default.createDirectory(at: url!.deletingLastPathComponent(), withIntermediateDirectories: true)
        }
        if url == nil {
            let panel = NSSavePanel()
            panel.title = p.string("title") ?? "Export Video"
            panel.nameFieldStringValue = name
            if let t = UTType(filenameExtension: ext) { panel.allowedContentTypes = [t] }
            guard panel.runModal() == .OK, let u = panel.url else { throw BridgeError("cancelled", "nothing was exported") }
            url = u
        }
        let out = url!
        files.granted.insert(out)
        var settings = s
        settings.sidecars = automated // evidence for the acceptance checks, only where automation put the file
        let session = try ExportSession(id: UUID().uuidString.lowercased(), settings: settings, output: out)
        store.put(session)
        var r: [String: Any] = ["id": session.id, "path": out.path, "name": out.lastPathComponent, "frames": s.frames, "codec": s.codec, "endpoint": "__export/"]
        if let b = s.effectiveBitrate { r["bitrate"] = b }
        return r
    }

    func end(_ p: BridgeParams) async throws -> Any? {
        let id = try p.require("id")
        guard let s = store.get(id) else { throw BridgeError("bad_params", "no export \"\(id)\"") }
        defer { _ = store.remove(id) }
        if let page = p.raw["page"] as? [String: Any] { s.pageTimings = page }
        return try await s.finish()
    }
}
