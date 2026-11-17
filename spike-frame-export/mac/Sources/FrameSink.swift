import Accelerate
import AppKit
import CryptoKit
import CoreVideo
import ImageIO

/// Where frames land, whichever way they crossed: discard ('sink'), encode ('encode') or append raw
/// BGRA to a file ('raw', the quality reference). Optionally SHA-256 of every frame as received.
enum Payload {
    case rgbaBottomUp(Data)   // readPixels bytes
    case base64(String)       // the same, as base64 text
    case png(Data)            // canvas.toBlob
    case image(CGImage)       // takeSnapshot
}

final class FrameSink: @unchecked Sendable { // all state is touched on `queue` only
    let queue = DispatchQueue(label: "vrmxg.sink", qos: .userInitiated)
    let videosDir: URL
    let audioURL: URL

    private var job: [String: Any] = [:]
    private var mode = "sink", width = 0, height = 0, fps = 30, wantHash = false
    private var exporter: Exporter?
    private var raw: FileHandle?
    private var rawURL: URL?
    private var scratch = Data()
    private var hashes: [Int: String] = [:]
    private var frames = 0, bytesIn = 0
    private var t0: UInt64 = 0
    private var decodeNs: UInt64 = 0, hashNs: UInt64 = 0, convertNs: UInt64 = 0, writeNs: UInt64 = 0
    private var pending: [Int: (Payload, @Sendable (Error?) -> Void)] = [:]
    private var nextN = 0
    private var imageSize: [Int] = []
    private var error: String?
    private var alphaRef: Data?
    private var straightProRes = true

    init(videosDir: URL, audioURL: URL) {
        self.videosDir = videosDir
        self.audioURL = audioURL
    }

    private static func ns() -> UInt64 { DispatchTime.now().uptimeNanoseconds }

    func begin(_ job: [String: Any]) async throws {
        let mode = job["mode"] as? String ?? "sink"
        let w = job["width"] as? Int ?? 0, h = job["height"] as? Int ?? 0, fps = job["fps"] as? Int ?? 30
        let frames = job["frames"] as? Int ?? 0
        var exporter: Exporter?
        var name = (job["name"] as? String ?? "job").replacingOccurrences(of: "/", with: "_")
        if mode == "encode" {
            let codec = job["codec"] as? String ?? "h264"
            name += "." + Exporter.fileExtension(codec)
            exporter = try await Exporter(url: videosDir.appendingPathComponent(name), codec: codec, width: w, height: h, fps: fps,
                                          bitrate: job["bitrate"] as? Int, audioURL: (job["audio"] as? Bool ?? false) ? audioURL : nil, frames: frames)
        }
        let ex = exporter
        nonisolated(unsafe) let j = job
        let rawName = name
        queue.sync {
            self.job = j
            self.mode = mode; self.width = w; self.height = h; self.fps = fps
            self.wantHash = j["hash"] as? Bool ?? false
            self.straightProRes = j["straightAlpha"] as? Bool ?? true
            self.exporter = ex
            self.hashes = [:]; self.frames = 0; self.bytesIn = 0; self.pending = [:]; self.nextN = 0
            self.decodeNs = 0; self.hashNs = 0; self.convertNs = 0; self.writeNs = 0; self.imageSize = []; self.error = nil
            self.raw = nil; self.rawURL = nil; self.alphaRef = nil
            if mode == "raw" {
                let url = self.videosDir.appendingPathComponent(rawName)
                FileManager.default.createFile(atPath: url.path, contents: nil)
                self.raw = try? FileHandle(forWritingTo: url)
                self.rawURL = url
            }
            self.scratch = Data(count: w * h * 4)
            self.t0 = Self.ns()
        }
    }

    /// Frame n arrives (possibly out of order when several are in flight); `done` fires once it is consumed.
    func submit(_ n: Int, _ payload: Payload, done: @escaping @Sendable (Error?) -> Void) {
        queue.async {
            if self.mode == "sink" { done(self.process(n, payload)); return }
            self.pending[n] = (payload, done)
            while let (p, d) = self.pending.removeValue(forKey: self.nextN) {
                d(self.process(self.nextN, p))
                self.nextN += 1
            }
        }
    }

    private func process(_ n: Int, _ payload: Payload) -> Error? {
        do {
            var t = Self.ns()
            // 1. Get raw bytes: RGBA bottom-up (readPixels) or BGRA top-down (images).
            var rgba: Data?
            var bgra: Data?
            switch payload {
            case .rgbaBottomUp(let d): rgba = d
            case .base64(let s):
                guard let d = Data(base64Encoded: s) else { throw NSError(domain: "Sink", code: 1, userInfo: [NSLocalizedDescriptionKey: "bad base64 at \(n)"]) }
                rgba = d
            case .png(let d):
                guard let src = CGImageSourceCreateWithData(d as CFData, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
                    throw NSError(domain: "Sink", code: 2, userInfo: [NSLocalizedDescriptionKey: "bad png at \(n) (\(d.count) bytes)"])
                }
                bgra = Self.drawBGRA(img, width: width, height: height)
                if imageSize.isEmpty { imageSize = [img.width, img.height] }
            case .image(let img):
                bgra = Self.drawBGRA(img, width: width, height: height)
                if imageSize.isEmpty { imageSize = [img.width, img.height] }
            }
            decodeNs += Self.ns() - t
            let bytes = rgba ?? bgra!
            bytesIn += bytes.count
            frames += 1
            if wantHash {
                t = Self.ns()
                hashes[n] = SHA256.hash(data: bytes).prefix(12).map { String(format: "%02x", $0) }.joined()
                hashNs += Self.ns() - t
            }
            let w = width, h = height
            // 2. Encode or store.
            if let exporter {
                try exporter.append(n) { pb in
                    let t1 = Self.ns()
                    let dst = CVPixelBufferGetBaseAddress(pb)!, dpr = CVPixelBufferGetBytesPerRow(pb)
                    if let rgba { Self.rgbaBottomUpToBGRA(rgba, dst: dst, dstRowBytes: dpr, width: w, height: h) }
                    else if let bgra { Self.copyRows(bgra, dst: dst, dstRowBytes: dpr, width: w, height: h) }
                    if n == 0, exporter.codec == "hevc-alpha" || exporter.codec == "prores4444" { // keep frame 0 (premultiplied, as rendered) as the alpha reference
                        var ref = Data(count: w * h * 4)
                        ref.withUnsafeMutableBytes { r in for y in 0..<h { memcpy(r.baseAddress! + y * w * 4, dst + y * dpr, w * 4) } }
                        self.alphaRef = ref
                    }
                    // (alpha-last, so the RGBA8888 variant serves BGRA.) ProRes carries no "premultiplied" flag and compositors read it as straight alpha: un-premultiply.
                    if exporter.codec == "prores4444", self.straightProRes {
                        var b = vImage_Buffer(data: dst, height: vImagePixelCount(h), width: vImagePixelCount(w), rowBytes: dpr)
                        vImageUnpremultiplyData_RGBA8888(&b, &b, vImage_Flags(kvImageNoFlags))
                    }
                    self.convertNs += Self.ns() - t1
                }
            } else if let raw {
                t = Self.ns()
                if let rgba {
                    scratch.withUnsafeMutableBytes { Self.rgbaBottomUpToBGRA(rgba, dst: $0.baseAddress!, dstRowBytes: w * 4, width: w, height: h) }
                    convertNs += Self.ns() - t
                    t = Self.ns()
                    raw.write(scratch)
                } else if let bgra { raw.write(bgra) }
                writeNs += Self.ns() - t
            }
            return nil
        } catch {
            self.error = "\(error)"
            return error
        }
    }

    func end() async -> [String: Any] {
        let (exporter, stats) = queue.sync { () -> (Exporter?, [String: Any]) in
            let f = max(frames, 1)
            let ms = { (x: UInt64) in (Double(x) / 1e6 / Double(f) * 100).rounded() / 100 }
            var s: [String: Any] = [
                "frames": frames, "bytesIn": bytesIn,
                "decodeMsPerFrame": ms(decodeNs), "hashMsPerFrame": ms(hashNs), "convertMsPerFrame": ms(convertNs),
                "writeMsPerFrame": ms(writeNs), "appendWaitMsPerFrame": ms(self.exporter?.waitNs ?? 0),
            ]
            if !imageSize.isEmpty { s["receivedImageSize"] = imageSize }
            if let error { s["error"] = error }
            if wantHash { s["hashes"] = hashes.keys.sorted().map { hashes[$0]! } ; s["hashFrames"] = hashes.keys.sorted() }
            try? raw?.close()
            if let rawURL { s["file"] = rawURL.path }
            let e = self.exporter
            self.exporter = nil
            return (e, s)
        }
        var out = stats
        if let exporter {
            let t = Self.ns()
            do { try await exporter.finish() } catch { out["error"] = "finish: \(error)" }
            out["finishMs"] = (Double(Self.ns() - t) / 1e5).rounded() / 10
            out["file"] = exporter.url.path
            out["fileBytes"] = (try? FileManager.default.attributesOfItem(atPath: exporter.url.path)[.size] as? Int) ?? 0
            if exporter.codec == "hevc-alpha" || exporter.codec == "prores4444" { 
                let ref = queue.sync { alphaRef }
                out["alphaCheck"] = await Exporter.alphaCheck(url: exporter.url, ref: ref)
            }
        }
        out["swiftWallMs"] = (Double(Self.ns() - queue.sync { t0 }) / 1e5).rounded() / 10
        return out
    }

    // MARK: pixel shuffles

    /// readPixels gives RGBA with row 0 at the bottom; AVFoundation wants BGRA, row 0 at the top. One pass, in bands.
    static func rgbaBottomUpToBGRA(_ src: Data, dst: UnsafeMutableRawPointer, dstRowBytes: Int, width: Int, height: Int) {
        src.withUnsafeBytes { s in
            let sp = UnsafeMutableRawPointer(mutating: s.baseAddress!)
            let bands = 8
            nonisolated(unsafe) let d = dst
            nonisolated(unsafe) let sp2 = sp
            DispatchQueue.concurrentPerform(iterations: bands) { b in
                let y0 = height * b / bands, y1 = height * (b + 1) / bands
                var map: [UInt8] = [2, 1, 0, 3]
                for y in y0..<y1 {
                    var sb = vImage_Buffer(data: sp2 + (height - 1 - y) * width * 4, height: 1, width: vImagePixelCount(width), rowBytes: width * 4)
                    var db = vImage_Buffer(data: d + y * dstRowBytes, height: 1, width: vImagePixelCount(width), rowBytes: dstRowBytes)
                    vImagePermuteChannels_ARGB8888(&sb, &db, &map, vImage_Flags(kvImageDoNotTile))
                }
            }
        }
    }

    static func copyRows(_ src: Data, dst: UnsafeMutableRawPointer, dstRowBytes: Int, width: Int, height: Int) {
        src.withUnsafeBytes { s in
            for y in 0..<height { memcpy(dst + y * dstRowBytes, s.baseAddress! + y * width * 4, width * 4) }
        }
    }

    /// Draw any CGImage into premultiplied BGRA (what 32BGRA pixel buffers hold), scaling to the job size.
    static func drawBGRA(_ img: CGImage, width: Int, height: Int) -> Data {
        var d = Data(count: width * height * 4)
        d.withUnsafeMutableBytes { p in
            let ctx = CGContext(data: p.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
            ctx.interpolationQuality = .none
            ctx.draw(img, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        return d
    }
}
