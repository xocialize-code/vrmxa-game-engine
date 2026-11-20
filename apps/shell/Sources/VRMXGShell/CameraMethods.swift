import AVFoundation
import CoreVideo
import Foundation
import Vision

/// The camera (M3 W5, AB-T-0544; the spike's verdict in spike-camera/README.md): AVCapture and Apple's Vision on a
/// background queue, and only numbers sent to the page, as `camera.frame` events carrying feature frames
/// (`@vrmxg/sense` detect.js has the format). No image leaves the capture queue, and nothing is kept.
///   camera.status → { available, authorization, running, device }
///   camera.devices → { devices: [{ id, name, model, kind, isDefault }] }   kind: builtIn, external, continuity, deskView
///   camera.start { fps? = 15, device? } → { running, fps, device, deviceId }   (macOS asks the person the first time)
/// `device` is an id from camera.devices; without it, the system's default camera (which may be a capture card).
///   camera.stop → { running: false }
/// An app that uses it needs `com.apple.security.device.camera` in its entitlements and NSCameraUsageDescription in its
/// Info.plist; without the description camera.start refuses instead of the system ending the app.
@MainActor
public final class CameraMethods {
    let emit: @MainActor (String, [String: Any]) -> Void
    var capture: CameraCapture?

    public init(emit: @escaping @MainActor (String, [String: Any]) -> Void) { self.emit = emit }

    public func register(on router: BridgeRouter) {
        router.register("camera.status") { [unowned self] _ in
            ["available": AVCaptureDevice.default(for: .video) != nil, "authorization": Self.authorization(), "running": self.capture != nil, "device": (self.capture?.deviceName).map { $0 as Any } ?? NSNull()]
        }
        router.register("camera.devices") { _ in ["devices": Self.devices()] }
        router.register("camera.start") { [unowned self] p in try await self.start(fps: p.number("fps") ?? 15, device: p.string("device")) }
        router.register("camera.stop") { [unowned self] _ in self.stop(); return ["running": false] }
    }

    static func authorization() -> String {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }

    /// Every video device: built-in and display cameras, external ones (USB cameras and capture cards), Continuity Camera.
    static func devices() -> [[String: Any]] {
        let session = AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInWideAngleCamera, .external, .continuityCamera, .deskViewCamera], mediaType: .video, position: .unspecified)
        let fallback = AVCaptureDevice.default(for: .video)?.uniqueID
        return session.devices.map { d in
            let kind: String = switch d.deviceType { case .builtInWideAngleCamera: "builtIn"; case .external: "external"; case .continuityCamera: "continuity"; case .deskViewCamera: "deskView"; default: "other" }
            return ["id": d.uniqueID, "name": d.localizedName, "model": d.modelID, "kind": kind, "isDefault": d.uniqueID == fallback]
        }
    }

    func start(fps: Double, device: String? = nil) async throws -> Any? {
        guard Bundle.main.object(forInfoDictionaryKey: "NSCameraUsageDescription") != nil else {
            throw BridgeError("unavailable", "this app has no NSCameraUsageDescription: it can't use the camera")
        }
        guard await AVCaptureDevice.requestAccess(for: .video) else {
            throw BridgeError("denied", "camera access is off for this app (System Settings › Privacy & Security › Camera)")
        }
        stop()
        let chosen: AVCaptureDevice
        if let device {
            guard let d = AVCaptureDevice(uniqueID: device) else { throw BridgeError("bad_params", "no camera with id \(device): see camera.devices") }
            chosen = d
        } else {
            guard let d = AVCaptureDevice.default(for: .video) else { throw BridgeError("unavailable", "no camera") }
            chosen = d
        }
        let c = CameraCapture(fps: max(1, min(30, fps)), device: chosen) { [weak self] json in
            Task { @MainActor in
                guard let self, self.capture != nil, let obj = try? JSONSerialization.jsonObject(with: json) as? [String: Any] else { return }
                self.emit("camera.frame", ["frame": obj])
            }
        }
        try c.run()
        capture = c
        return ["running": true, "fps": c.fps, "device": c.deviceName, "deviceId": chosen.uniqueID]
    }

    func stop() { capture?.stop(); capture = nil }
}

/// One capture session: frames at up to `fps` through Vision (face rectangles with yaw, pitch and roll; hand poses),
/// each feature frame handed on as JSON. Runs on its own serial queue.
final class CameraCapture: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
    let fps: Double
    let device: AVCaptureDevice
    let onFrame: @Sendable (Data) -> Void
    let session = AVCaptureSession()
    let queue = DispatchQueue(label: "vrmxg.shell.camera")
    let face = VNDetectFaceRectanglesRequest()
    let hands = VNDetectHumanHandPoseRequest()
    var deviceName = ""
    var first: CMTime?
    var last: CMTime?

    init(fps: Double, device: AVCaptureDevice, onFrame: @escaping @Sendable (Data) -> Void) {
        self.fps = fps; self.device = device; self.onFrame = onFrame
        face.revision = VNDetectFaceRectanglesRequestRevision3
        hands.maximumHandCount = 2
    }

    func run() throws {
        deviceName = device.localizedName
        let input = try AVCaptureDeviceInput(device: device)
        guard session.canAddInput(input) else { throw BridgeError("failed", "can't read \(deviceName)") }
        session.addInput(input)
        // 640×480 is plenty for faces and hands; a device that doesn't offer it (a capture card) gets the nearest preset
        for preset: AVCaptureSession.Preset in [.vga640x480, .hd1280x720, .medium, .high] where session.canSetSessionPreset(preset) { session.sessionPreset = preset; break }
        let output = AVCaptureVideoDataOutput()
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: queue)
        session.addOutput(output)
        queue.async { self.session.startRunning() }
    }

    func stop() { queue.async { self.session.stopRunning() } }

    func captureOutput(_ output: AVCaptureOutput, didOutput sample: CMSampleBuffer, from connection: AVCaptureConnection) {
        let pts = CMSampleBufferGetPresentationTimeStamp(sample)
        if let last, CMTimeGetSeconds(CMTimeSubtract(pts, last)) < 0.95 / fps { return } // at most fps frames a second
        guard let buffer = CMSampleBufferGetImageBuffer(sample) else { return }
        last = pts
        if first == nil { first = pts }
        let t0 = DispatchTime.now().uptimeNanoseconds
        var frame = features(buffer)
        frame["t"] = (CMTimeGetSeconds(CMTimeSubtract(pts, first!)) * 10000).rounded() / 10 // ms on the camera's clock
        frame["ms"] = (Double(DispatchTime.now().uptimeNanoseconds - t0) / 1e5).rounded() / 10 // Vision's time for it
        frame["latency"] = (CMTimeGetSeconds(CMTimeSubtract(CMClockGetTime(CMClockGetHostTimeClock()), pts)) * 10000).rounded() / 10
        if let json = try? JSONSerialization.data(withJSONObject: frame) { onFrame(json) }
    }

    /// Mirrored as a selfie preview (the person's right is +x), y up, x −1…1 across the image and y in the same unit.
    func features(_ buffer: CVPixelBuffer) -> [String: Any] {
        let aspect = Double(CVPixelBufferGetHeight(buffer)) / Double(max(1, CVPixelBufferGetWidth(buffer)))
        let r4 = { (v: Double) in (v * 10000).rounded() / 10000 }
        let mirror = { (p: CGPoint) -> [Double] in [r4(1 - 2 * Double(p.x)), r4((2 * Double(p.y) - 1) * aspect)] }
        try? VNImageRequestHandler(cvPixelBuffer: buffer, orientation: .up, options: [:]).perform([face, hands])
        var out: [String: Any] = ["face": NSNull(), "hands": [[String: Any]]()]
        if let f = face.results?.first {
            let b = f.boundingBox, c = mirror(CGPoint(x: b.midX, y: b.midY))
            out["face"] = ["x": c[0], "y": c[1], "w": r4(2 * Double(b.width)), "yaw": r4(f.yaw?.doubleValue ?? 0), "pitch": r4(f.pitch?.doubleValue ?? 0), "roll": r4(f.roll?.doubleValue ?? 0)]
        }
        let tips: [VNHumanHandPoseObservation.JointName] = [.thumbTip, .indexTip, .middleTip, .ringTip, .littleTip]
        let pips: [VNHumanHandPoseObservation.JointName] = [.thumbIP, .indexPIP, .middlePIP, .ringPIP, .littlePIP]
        var list: [[String: Any]] = []
        for h in hands.results ?? [] {
            guard let pts = try? h.recognizedPoints(.all), let wrist = pts[.wrist], wrist.confidence > 0.3 else { continue }
            let p = { (j: VNHumanHandPoseObservation.JointName) -> [Double] in pts[j].map { mirror($0.location) } ?? mirror(wrist.location) }
            let side: Any = h.chirality == .left ? "left" as Any : h.chirality == .right ? "right" as Any : NSNull() as Any
            list.append(["side": side, "wrist": mirror(wrist.location), "tips": tips.map(p), "pips": pips.map(p)])
        }
        out["hands"] = list
        return out
    }
}
