import AVFoundation
import CoreVideo
import Foundation
import Vision

// The native path (M3 W5, AB-T-0544): Apple's Vision on each frame, from a video file or the camera, emitting the same
// feature frames as the page's MediaPipe path (web/src/main.js):
//   { t, face: { x, y, w, yaw, pitch, roll } | null, hands: [{ side, wrist, tips ×5, pips ×5 }] }
// mirrored coordinates, y up: x −1…1 across the image, y in the same unit (pixels / half the width). Vision's coordinates are 0…1 with the origin at the bottom left, unmirrored.
// Frames never leave this object: only the numbers do.

struct Timing { var face: [Double] = []; var hands: [Double] = []; var body: [Double] = [] }

final class NativeVision: @unchecked Sendable {
    let faceRequest = VNDetectFaceRectanglesRequest()
    let handRequest = VNDetectHumanHandPoseRequest()
    let bodyRequest = VNDetectHumanBodyPoseRequest()
    var withBody: Bool
    var timing = Timing()

    init(withBody: Bool = true) {
        self.withBody = withBody
        faceRequest.revision = VNDetectFaceRectanglesRequestRevision3 // yaw, pitch and roll
        handRequest.maximumHandCount = 2
    }

    /// height / width of the frames being read: y is in the same unit as x (pixels / half the width)
    var aspect = 1.0
    func mirror(_ p: CGPoint) -> [Double] { [NativeVision.round4(1 - 2 * Double(p.x)), NativeVision.round4((2 * Double(p.y) - 1) * aspect)] }
    static func round4(_ v: Double) -> Double { (v * 10000).rounded() / 10000 }

    /// One frame → one feature frame (a JSON-ready dictionary), timing each request.
    func features(_ buffer: CVPixelBuffer, t: Double) -> [String: Any] {
        aspect = Double(CVPixelBufferGetHeight(buffer)) / Double(max(1, CVPixelBufferGetWidth(buffer)))
        let handler = VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .up, options: [:])
        func timed(_ r: VNRequest) -> Double { let a = DispatchTime.now().uptimeNanoseconds; try? handler.perform([r]); return Double(DispatchTime.now().uptimeNanoseconds - a) / 1e6 }
        timing.face.append(timed(faceRequest))
        timing.hands.append(timed(handRequest))
        if withBody { timing.body.append(timed(bodyRequest)) }
        var frame: [String: Any] = ["t": (t * 10).rounded() / 10, "face": NSNull(), "hands": [[String: Any]]()]
        if let f = faceRequest.results?.first {
            let b = f.boundingBox
            let c = mirror(CGPoint(x: b.midX, y: b.midY))
            frame["face"] = ["x": c[0], "y": c[1], "w": NativeVision.round4(2 * Double(b.width)),
                             "yaw": NativeVision.round4(f.yaw?.doubleValue ?? 0), "pitch": NativeVision.round4(f.pitch?.doubleValue ?? 0), "roll": NativeVision.round4(f.roll?.doubleValue ?? 0)]
        }
        var hands: [[String: Any]] = []
        let tips: [VNHumanHandPoseObservation.JointName] = [.thumbTip, .indexTip, .middleTip, .ringTip, .littleTip]
        let pips: [VNHumanHandPoseObservation.JointName] = [.thumbIP, .indexPIP, .middlePIP, .ringPIP, .littlePIP]
        for h in handRequest.results ?? [] {
            guard let pts = try? h.recognizedPoints(.all), let wrist = pts[.wrist], wrist.confidence > 0.3 else { continue }
            let p = { (j: VNHumanHandPoseObservation.JointName) -> [Double] in pts[j].map { self.mirror($0.location) } ?? self.mirror(wrist.location) }
            let side: Any = h.chirality == .left ? "left" as Any : h.chirality == .right ? "right" as Any : NSNull() as Any
            hands.append(["side": side, "wrist": mirror(wrist.location), "tips": tips.map(p), "pips": pips.map(p)])
        }
        frame["hands"] = hands
        return frame
    }

    /// CPU time (user + system) this process has used, in seconds.
    static func cpuSeconds() -> Double {
        var u = rusage(); getrusage(RUSAGE_SELF, &u)
        return Double(u.ru_utime.tv_sec + u.ru_stime.tv_sec) + Double(u.ru_utime.tv_usec + u.ru_stime.tv_usec) / 1e6
    }

    static func stats(_ a: [Double]) -> [String: Double] {
        guard !a.isEmpty else { return [:] }
        let s = a.sorted()
        return ["median": round4(s[s.count / 2]), "p90": round4(s[Int(Double(s.count) * 0.9)]), "mean": round4(s.reduce(0, +) / Double(s.count))]
    }

    /// Every frame of a video file (up to `limit`), as fast as Vision goes: timings, CPU and the features.
    func runFile(_ url: URL, limit: Int) throws -> [String: Any] {
        let asset = AVURLAsset(url: url)
        let semaphore = DispatchSemaphore(value: 0)
        nonisolated(unsafe) var track: AVAssetTrack?
        nonisolated(unsafe) var fps: Float = 25
        Task { track = try? await asset.loadTracks(withMediaType: .video).first; if let t = track { fps = (try? await t.load(.nominalFrameRate)) ?? 25 }; semaphore.signal() }
        semaphore.wait()
        guard let track else { throw NSError(domain: "spike", code: 1, userInfo: [NSLocalizedDescriptionKey: "no video track in \(url.lastPathComponent)"]) }
        let reader = try AVAssetReader(asset: asset)
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange])
        reader.add(output); reader.startReading()
        var frames: [[String: Any]] = [], n = 0, size = [0, 0]
        let cpu0 = NativeVision.cpuSeconds(), wall0 = DispatchTime.now().uptimeNanoseconds
        while n < limit, let sample = output.copyNextSampleBuffer(), let buffer = CMSampleBufferGetImageBuffer(sample) {
            size = [CVPixelBufferGetWidth(buffer), CVPixelBufferGetHeight(buffer)]
            frames.append(features(buffer, t: Double(n) * 1000 / Double(fps)))
            n += 1
        }
        let wall = Double(DispatchTime.now().uptimeNanoseconds - wall0) / 1e9, cpu = NativeVision.cpuSeconds() - cpu0
        let warm = { (a: [Double]) in Array(a.dropFirst(5)) }
        return [
            "clip": url.lastPathComponent, "size": size, "frames": n, "fps": fps,
            "ms": ["face": NativeVision.stats(warm(timing.face)), "hands": NativeVision.stats(warm(timing.hands)), "body": NativeVision.stats(warm(timing.body))],
            "wallSeconds": NativeVision.round4(wall), "cpuSeconds": NativeVision.round4(cpu), "cpuMsPerFrame": NativeVision.round4(cpu * 1000 / Double(max(1, n))),
            "faceFrames": frames.filter { !($0["face"] is NSNull) }.count, "handsSeen": frames.reduce(0) { $0 + (($1["hands"] as? [Any])?.count ?? 0) },
            "sample": Array(frames.prefix(3)),
        ]
    }
}

/// The camera, live: AVCapture at 640×480 → Vision on a serial queue → `onFrame` with each feature frame (and its
/// latency from capture to features). The session stops when this object is stopped; nothing is stored.
final class NativeCamera: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
    let session = AVCaptureSession()
    let vision = NativeVision(withBody: false)
    let queue = DispatchQueue(label: "vrmxg.camera.vision")
    var onFrame: (([String: Any], Double) -> Void)?
    var start = DispatchTime.now().uptimeNanoseconds

    func run() throws {
        session.sessionPreset = .vga640x480
        guard let device = AVCaptureDevice.default(for: .video) else { throw NSError(domain: "spike", code: 2, userInfo: [NSLocalizedDescriptionKey: "no camera"]) }
        let input = try AVCaptureDeviceInput(device: device)
        session.addInput(input)
        let output = AVCaptureVideoDataOutput()
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: queue)
        session.addOutput(output)
        start = DispatchTime.now().uptimeNanoseconds
        session.startRunning()
    }
    func stop() { session.stopRunning() }

    func captureOutput(_ output: AVCaptureOutput, didOutput sample: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let buffer = CMSampleBufferGetImageBuffer(sample) else { return }
        let pts = CMSampleBufferGetPresentationTimeStamp(sample)
        let now = CMClockGetTime(CMClockGetHostTimeClock())
        let t = Double(DispatchTime.now().uptimeNanoseconds - start) / 1e6
        let f = vision.features(buffer, t: t)
        let latency = CMTimeGetSeconds(CMTimeSubtract(CMClockGetTime(CMClockGetHostTimeClock()), pts)) * 1000
        _ = now
        onFrame?(f, latency)
    }
}
