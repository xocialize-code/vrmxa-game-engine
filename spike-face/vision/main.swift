// The spike's Vision side (M4 W9): Apple's face landmarks on each picture, measured the way the Mac shell measures a
// camera frame (the same two requests on one handler, the same FaceShape.swift, compiled in from apps/shell).
//   vision-face <pictures dir> <out.json> [--repeat 30] [--jitter 8]
// Per picture, scaled to the camera's 640×480: was a face found, its shape (FaceShape) and head angles; the time for the
// face rectangle alone (what the shell runs today) and with the landmarks, wall and CPU, over `repeat` runs after a
// warm-up; and the same shape on `jitter` copies moved by a pixel or two (how much the numbers move when nothing did).
import CoreGraphics
import Foundation
import ImageIO
import Vision

let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: vision-face <pictures dir> <out.json> [--repeat n] [--jitter n]"); exit(2) }
func opt(_ name: String, _ d: Int) -> Int { if let i = args.firstIndex(of: name), i + 1 < args.count, let v = Int(args[i + 1]) { return v }; return d }
let dir = URL(fileURLWithPath: args[1]), repeats = opt("--repeat", 30), jitters = opt("--jitter", 8)
let W = 640, H = 480

/// The picture at the camera's size, moved by (dx, dy) pixels and scaled by s about its middle.
func frame(_ image: CGImage, dx: Double = 0, dy: Double = 0, s: Double = 1) -> CGImage {
    let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.interpolationQuality = .high
    ctx.setFillColor(CGColor(gray: 0.9, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    let w = Double(W) * s, h = Double(H) * s
    ctx.draw(image, in: CGRect(x: (Double(W) - w) / 2 + dx, y: (Double(H) - h) / 2 + dy, width: w, height: h))
    return ctx.makeImage()!
}

let rect = VNDetectFaceRectanglesRequest(); rect.revision = VNDetectFaceRectanglesRequestRevision3
let lms = VNDetectFaceLandmarksRequest(); lms.revision = VNDetectFaceLandmarksRequestRevision3

struct Seen { var found = false; var box = CGRect.zero; var yaw = 0.0, pitch = 0.0, roll = 0.0; var shape: FaceShape? = nil; var points = 0 }
/// One frame, as the shell's capture does it: the rectangle (with its angles), then the landmarks of that face.
func see(_ image: CGImage, landmarks: Bool = true) -> Seen {
    let handler = VNImageRequestHandler(cgImage: image, orientation: .up, options: [:])
    try? handler.perform([rect])
    guard let f = rect.results?.first else { return Seen() }
    var s = Seen(found: true, box: f.boundingBox, yaw: f.yaw?.doubleValue ?? 0, pitch: f.pitch?.doubleValue ?? 0, roll: f.roll?.doubleValue ?? 0)
    guard landmarks else { return s }
    lms.inputFaceObservations = [f]
    try? handler.perform([lms])
    if let lm = lms.results?.first?.landmarks {
        let size = CGSize(width: W, height: H)
        let pts = { (r: VNFaceLandmarkRegion2D?) -> [CGPoint] in r?.pointsInImage(imageSize: size) ?? [] }
        s.shape = FaceShape.measure(.init(leftEye: pts(lm.leftEye), rightEye: pts(lm.rightEye), leftBrow: pts(lm.leftEyebrow), rightBrow: pts(lm.rightEyebrow), outerLips: pts(lm.outerLips), innerLips: pts(lm.innerLips)), yaw: s.yaw, pitch: s.pitch)
        s.points = lm.allPoints?.pointCount ?? 0
    }
    return s
}
func now() -> Double { Double(DispatchTime.now().uptimeNanoseconds) / 1e6 }
func stats(_ xs: [Double]) -> [String: Double] {
    let a = xs.sorted(), r = { (x: Double) in (x * 1000).rounded() / 1000 }
    return ["median": r(a[a.count / 2]), "p90": r(a[min(a.count - 1, Int(Double(a.count) * 0.9))]), "mean": r(a.reduce(0, +) / Double(a.count))]
}
func cpuMs() -> Double { var u = rusage(); getrusage(RUSAGE_SELF, &u); return (Double(u.ru_utime.tv_sec) + Double(u.ru_stime.tv_sec)) * 1000 + (Double(u.ru_utime.tv_usec) + Double(u.ru_stime.tv_usec)) / 1000 }
func describe(_ s: Seen) -> [String: Any] {
    let r4 = { (x: Double) in (x * 10000).rounded() / 10000 }
    var o: [String: Any] = ["found": s.found]
    guard s.found else { return o }
    o["box"] = [r4(Double(s.box.minX)), r4(Double(s.box.minY)), r4(Double(s.box.width)), r4(Double(s.box.height))]
    o["vision"] = ["yaw": r4(s.yaw), "pitch": r4(s.pitch), "roll": r4(s.roll)] // as Vision gives them
    o["points"] = s.points
    if let sh = s.shape { o["shape"] = sh.json }
    return o
}

var seed: UInt32 = 12345
func rnd() -> Double { seed = seed &* 1664525 &+ 1013904223; return Double(seed) / 4294967296 - 0.5 }
let files = (try FileManager.default.contentsOfDirectory(atPath: dir.path)).filter { $0.hasSuffix(".png") || $0.hasSuffix(".jpg") }.sorted()
var rows: [[String: Any]] = [], allRect: [Double] = [], allBoth: [Double] = [], cpuRect = 0.0, cpuBoth = 0.0, frames = 0
for name in files {
    guard let src = CGImageSourceCreateWithURL(dir.appendingPathComponent(name) as CFURL, nil), let full = CGImageSourceCreateImageAtIndex(src, 0, nil) else { continue }
    let image = frame(full)
    _ = see(image) // warm-up: the first run of a request loads its model
    var tRect: [Double] = [], tBoth: [Double] = []
    var c0 = cpuMs()
    for _ in 0..<repeats { let t = now(); _ = see(image, landmarks: false); tRect.append(now() - t) }
    cpuRect += cpuMs() - c0; c0 = cpuMs()
    var last = Seen()
    for _ in 0..<repeats { let t = now(); last = see(image); tBoth.append(now() - t) }
    cpuBoth += cpuMs() - c0; frames += repeats
    allRect += tRect; allBoth += tBoth
    var row = describe(last)
    row["file"] = name
    row["ms"] = ["rect": stats(tRect), "rectAndLandmarks": stats(tBoth)]
    // the same face nudged: how much each number moves when the face didn't
    var moved: [[String: Any]] = []
    for _ in 0..<jitters { let j = see(frame(full, dx: rnd() * 6, dy: rnd() * 6, s: 1 + rnd() * 0.03)); moved.append(describe(j)) }
    row["jitter"] = moved
    rows.append(row)
    FileHandle.standardError.write(Data("\(name) \(last.found ? "face" : "NO FACE")\n".utf8))
}
let r3 = { (x: Double) in (x * 1000).rounded() / 1000 }
let out: [String: Any] = [
    "detector": "Vision: VNDetectFaceRectanglesRequest rev 3 + VNDetectFaceLandmarksRequest rev 3", "size": [W, H], "repeats": repeats, "frames": frames,
    "os": ProcessInfo.processInfo.operatingSystemVersionString,
    "ms": ["rect": stats(allRect), "rectAndLandmarks": stats(allBoth)],
    "cpuMsPerFrame": ["rect": r3(cpuRect / Double(max(1, frames))), "rectAndLandmarks": r3(cpuBoth / Double(max(1, frames)))],
    "pictures": rows,
]
try JSONSerialization.data(withJSONObject: out, options: [.sortedKeys]).write(to: URL(fileURLWithPath: args[2]))
print("wrote \(args[2]): \(rows.count) pictures")
