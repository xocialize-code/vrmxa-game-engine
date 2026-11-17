import AVFoundation
import CoreVideo
import VideoToolbox

/// AVAssetWriter for offline frames: frame n is stamped n/fps, whatever the wall clock did.
/// Optionally muxes a WAV (read with AVAssetReader, encoded to AAC) trimmed to the shot's length.
final class Exporter: @unchecked Sendable { // used from the sink's serial queue only (audio has its own)
    let url: URL
    let writer: AVAssetWriter
    let video: AVAssetWriterInput
    let adaptor: AVAssetWriterInputPixelBufferAdaptor
    let fps: Int32
    let codec: String
    private var audio: AVAssetWriterInput?
    private var audioReader: AVAssetReader?
    private let audioQueue = DispatchQueue(label: "vrmxg.export.audio")
    private let audioDone = DispatchGroup()
    private(set) var lastFrame = -1
    var waitNs: UInt64 = 0

    static func fileExtension(_ codec: String) -> String { codec == "h264" || codec == "hevc" ? "mp4" : "mov" }

    init(url: URL, codec: String, width: Int, height: Int, fps: Int, bitrate: Int?, audioURL: URL?, frames: Int) async throws {
        self.url = url
        self.fps = Int32(fps)
        self.codec = codec
        try? FileManager.default.removeItem(at: url)
        let fileType: AVFileType = Exporter.fileExtension(codec) == "mp4" ? .mp4 : .mov
        writer = try AVAssetWriter(outputURL: url, fileType: fileType)

        var props: [String: Any] = [:]
        let type: AVVideoCodecType
        switch codec {
        case "h264":
            type = .h264
            props[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel
        case "hevc":
            type = .hevc
            props[AVVideoProfileLevelKey] = kVTProfileLevel_HEVC_Main_AutoLevel as String
        case "hevc-alpha":
            type = .hevcWithAlpha
            props[kVTCompressionPropertyKey_AlphaChannelMode as String] = kVTAlphaChannelMode_PremultipliedAlpha as String
            props[kVTCompressionPropertyKey_TargetQualityForAlpha as String] = 0.8
        case "prores4444":
            type = .proRes4444
        default:
            throw NSError(domain: "Exporter", code: 1, userInfo: [NSLocalizedDescriptionKey: "unknown codec \(codec)"])
        }
        if codec != "prores4444" {
            props[AVVideoExpectedSourceFrameRateKey] = fps
            props[AVVideoMaxKeyFrameIntervalKey] = fps * 2
            props[AVVideoAllowFrameReorderingKey] = true // B-frames: the thing Chrome's WebCodecs turns off
            if let bitrate { props[AVVideoAverageBitRateKey] = bitrate }
        }
        var settings: [String: Any] = [
            AVVideoCodecKey: type,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoColorPropertiesKey: [
                AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
            ],
        ]
        if !props.isEmpty { settings[AVVideoCompressionPropertiesKey] = props }
        guard writer.canApply(outputSettings: settings, forMediaType: .video) else {
            throw NSError(domain: "Exporter", code: 2, userInfo: [NSLocalizedDescriptionKey: "writer refuses settings for \(codec)"])
        }
        video = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        video.expectsMediaDataInRealTime = false
        adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
            kCVPixelBufferIOSurfacePropertiesKey as String: [:],
        ])
        writer.add(video)

        if let audioURL {
            let asset = AVURLAsset(url: audioURL)
            guard let track = try await asset.loadTracks(withMediaType: .audio).first else { throw NSError(domain: "Exporter", code: 3) }
            let reader = try AVAssetReader(asset: asset)
            reader.timeRange = CMTimeRange(start: .zero, duration: CMTime(value: CMTimeValue(frames), timescale: Int32(fps)))
            let out = AVAssetReaderTrackOutput(track: track, outputSettings: [
                AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false,
                AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false,
            ])
            reader.add(out)
            let ain = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 48000, AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: 192_000,
            ])
            ain.expectsMediaDataInRealTime = false
            writer.add(ain)
            audio = ain
            audioReader = reader
            guard reader.startReading() else { throw reader.error ?? NSError(domain: "Exporter", code: 4) }
            writer.startWriting()
            writer.startSession(atSourceTime: .zero)
            audioDone.enter()
            let done = audioDone
            nonisolated(unsafe) let o = out
            ain.requestMediaDataWhenReady(on: audioQueue) {
                while ain.isReadyForMoreMediaData {
                    if let sb = o.copyNextSampleBuffer() { ain.append(sb) } else { ain.markAsFinished(); done.leave(); break }
                }
            }
        } else {
            writer.startWriting()
            writer.startSession(atSourceTime: .zero)
        }
        if writer.status == .failed { throw writer.error ?? NSError(domain: "Exporter", code: 5) }
    }

    /// Blocks until the input takes more (that is the backpressure the web page feels), then appends frame n.
    func append(_ n: Int, fill: (CVPixelBuffer) -> Void) throws {
        let t = DispatchTime.now().uptimeNanoseconds
        while !video.isReadyForMoreMediaData {
            if writer.status == .failed { throw writer.error ?? NSError(domain: "Exporter", code: 6) }
            usleep(200)
        }
        waitNs += DispatchTime.now().uptimeNanoseconds - t
        guard let pool = adaptor.pixelBufferPool else { throw writer.error ?? NSError(domain: "Exporter", code: 7, userInfo: [NSLocalizedDescriptionKey: "no pool"]) }
        var pb: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb)
        guard let pb else { throw NSError(domain: "Exporter", code: 8) }
        CVPixelBufferLockBaseAddress(pb, [])
        fill(pb)
        CVPixelBufferUnlockBaseAddress(pb, [])
        if !adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(n), timescale: fps)) {
            throw writer.error ?? NSError(domain: "Exporter", code: 9, userInfo: [NSLocalizedDescriptionKey: "append failed at \(n)"])
        }
        lastFrame = n
    }

    func finish() async throws {
        video.markAsFinished()
        let group = audioDone
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in group.notify(queue: .global()) { c.resume() } }
        writer.endSession(atSourceTime: CMTime(value: CMTimeValue(lastFrame + 1), timescale: fps))
        await writer.finishWriting()
        if writer.status != .completed { throw writer.error ?? NSError(domain: "Exporter", code: 10) }
    }

    /// Reads frames back (BGRA) and counts alpha values: did the transparency survive the codec?
    static func alphaCheck(url: URL, ref: Data?) async -> [String: Any] {
        do {
            let asset = AVURLAsset(url: url)
            guard let track = try await asset.loadTracks(withMediaType: .video).first else { return ["error": "no video track"] }
            let reader = try AVAssetReader(asset: asset)
            let out = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
            reader.add(out)
            reader.startReading()
            nonisolated(unsafe) let o = out
            return await withCheckedContinuation { c in
                DispatchQueue(label: "vrmxg.alphacheck").async { // blocking reads off the cooperative pool (AB-L-0320)
                    guard let sb = o.copyNextSampleBuffer(), let pb = CMSampleBufferGetImageBuffer(sb) else { c.resume(returning: ["error": "no frame"]); return }
                    CVPixelBufferLockBaseAddress(pb, .readOnly)
                    let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), bpr = CVPixelBufferGetBytesPerRow(pb)
                    let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
                    var zero = 0, full = 0, partial = 0, maxA = 0, ge250 = 0
                    for y in 0..<h { for x in 0..<w { let a = base[y * bpr + x * 4 + 3]; if a == 0 { zero += 1 } else if a == 255 { full += 1 } else { partial += 1 }; maxA = max(maxA, Int(a)); if a >= 250 { ge250 += 1 } } }
                    let corner = Int(base[3])
                    // Round trip against the BGRA we fed in (premultiplied): opaque pixels' colour error, and for
                    // edge pixels whether what comes back matches the premultiplied input or its un-premultiplied form.
                    var cmp: [String: Any] = [:]
                    if let ref, ref.count == w * h * 4 {
                        var nOp = 0, eOp = 0.0, nEdge = 0, ePre = 0.0, eStraight = 0.0, eAlpha = 0.0
                        ref.withUnsafeBytes { rb in
                            let r = rb.bindMemory(to: UInt8.self)
                            for y in 0..<h { for x in 0..<w {
                                let i = (y * w + x) * 4, j = y * bpr + x * 4
                                let a = Int(r[i + 3])
                                if a == 255 { nOp += 1; for k in 0..<3 { eOp += abs(Double(base[j + k]) - Double(r[i + k])) } }
                                else if a >= 32 && a <= 223 {
                                    nEdge += 1
                                    eAlpha += abs(Double(base[j + 3]) - Double(a))
                                    for k in 0..<3 {
                                        let pre = Double(r[i + k]), straight = min(255, pre * 255 / Double(a))
                                        ePre += abs(Double(base[j + k]) - pre); eStraight += abs(Double(base[j + k]) - straight)
                                    }
                                }
                            } }
                        }
                        cmp = ["opaqueColourMAE": (eOp / Double(max(nOp * 3, 1)) * 100).rounded() / 100, "edgePixels": nEdge,
                               "edgeAlphaMAE": (eAlpha / Double(max(nEdge, 1)) * 100).rounded() / 100,
                               "edgeMAEvsPremultiplied": (ePre / Double(max(nEdge * 3, 1)) * 100).rounded() / 100,
                               "edgeMAEvsStraight": (eStraight / Double(max(nEdge * 3, 1)) * 100).rounded() / 100]
                    }
                    CVPixelBufferUnlockBaseAddress(pb, .readOnly)
                    reader.cancelReading()
                    let total = Double(w * h)
                    c.resume(returning: ["frame0": ["transparent": zero, "opaque": full, "partial": partial,
                                                    "transparentPct": (Double(zero) / total * 1000).rounded() / 10, "cornerAlpha": corner, "maxAlpha": maxA, "alphaAtLeast250": ge250, "roundTrip": cmp]])
                }
            }
        } catch { return ["error": "\(error)"] }
    }

    /// Which VideoToolbox encoders exist and which are hardware.
    static func encoderList() -> [[String: Any]] {
        var list: CFArray?
        VTCopyVideoEncoderList(nil, &list)
        guard let arr = list as? [[String: Any]] else { return [] }
        return arr.compactMap { e in
            let name = e[kVTVideoEncoderList_EncoderName as String] as? String ?? "?"
            let codec = e[kVTVideoEncoderList_CodecType as String] as? UInt32 ?? 0
            let fourcc = String(bytes: [24, 16, 8, 0].map { UInt8((codec >> $0) & 0xff) }, encoding: .ascii) ?? "?"
            let hw = e[kVTVideoEncoderList_IsHardwareAccelerated as String] as? Bool ?? false
            return ["name": name, "codec": fourcc, "hardware": hw]
        }
    }
}
