import CoreGraphics
import Foundation

/// A face's shape from its landmarks (M4 W9, AB-T-0581; the spike's verdict in spike-face/README.md): how shut each eye
/// is, how open the mouth, how wide the smile, how high the brows. Pure geometry on the points Vision's
/// `VNDetectFaceLandmarksRequest` gives, in the image's own space (any unit, as long as x and y share it; y up).
///
/// Everything is measured along the face's own axes (the line through the eyes, and across it), so a tilted head reads
/// the same, and in units of the distance between the eyes, so it reads the same at any distance from the camera. A
/// head turned to the side brings the eyes closer together in the picture, and one tipped up or down shortens every
/// height, so heights are put back by the turn's and the tip's cosines (the spike measured brows reading fully raised on
/// a head turned 50° without it). The
/// values run 0…1 over the range a face can cover, not over one person's: a person's resting face is somewhere in the
/// middle of smile and the brows, and `@vrmxg/takes`' FaceFilter takes that rest out (the median of a take's first
/// second). `geo` carries the measurements themselves, for tuning and for the spike's analysis.
public struct FaceShape: Equatable, Sendable {
    public var blinkL = 0.0, blinkR = 0.0, jaw = 0.0, smile = 0.0, browUp = 0.0, browDown = 0.0
    /// The measurements behind them: each eye's opening over its width, the mouth's opening and width and each brow's
    /// height over its eye, in eye distances.
    public var geo = Geo()

    public struct Geo: Equatable, Sendable {
        public var earL = 0.0, earR = 0.0, mouthOpen = 0.0, mouthWidth = 0.0, browL = 0.0, browR = 0.0
    }

    /// The landmark regions the shape needs. "Left" and "right" are the image's (the eye on the left of the picture).
    public struct Landmarks: Sendable {
        public var leftEye: [CGPoint], rightEye: [CGPoint], leftBrow: [CGPoint], rightBrow: [CGPoint], outerLips: [CGPoint], innerLips: [CGPoint]
        public init(leftEye: [CGPoint], rightEye: [CGPoint], leftBrow: [CGPoint], rightBrow: [CGPoint], outerLips: [CGPoint], innerLips: [CGPoint]) {
            self.leftEye = leftEye; self.rightEye = rightEye; self.leftBrow = leftBrow; self.rightBrow = rightBrow; self.outerLips = outerLips; self.innerLips = innerLips
        }
    }

    /// The ranges the 0…1 values cover (spike-face/results/summary.json has the measurements they come from).
    public enum Range {
        /// an eye's opening over its width: shut at the first, wide open at or above the second. A smile narrows the
        /// eyes by up to a third (the spike: 0.22 → 0.15), which must stay well short of shut, so shut is 0
        public static let ear = (shut: 0.0, open: 0.30)
        /// the inner lips' opening, in eye distances, at which the mouth counts as fully open
        public static let mouthOpen = 0.45
        /// the outer lips' width, in eye distances: no smile at the first, the broadest at the second
        public static let mouthWidth = (narrow: 0.60, wide: 1.10)
        /// a brow's height over its eye, in eye distances: the lowest frown and the highest raise (the spike's four
        /// faces rest at 0.25 to 0.33, frown to 0.14 to 0.20 and raise to 0.36 to 0.41)
        public static let brow = (low: 0.15, high: 0.45)
    }

    /// The shape of a face from its landmarks, or nil when the eyes are missing or on top of each other. `yaw` and
    /// `pitch` are the head's turn and tip in radians (either sign), from the face rectangle.
    public static func measure(_ m: Landmarks, yaw: Double = 0, pitch: Double = 0) -> FaceShape? {
        guard m.leftEye.count >= 3, m.rightEye.count >= 3 else { return nil }
        let cl = centroid(m.leftEye), cr = centroid(m.rightEye)
        let dx = Double(cr.x - cl.x), dy = Double(cr.y - cl.y), iod = (dx * dx + dy * dy).squareRoot()
        guard iod > 1e-6 else { return nil }
        // the face's axes: u along the eyes (image left to right), v across them (up)
        let ux = dx / iod, uy = dy / iod, vx = -uy, vy = ux
        let u = { (p: CGPoint) in Double(p.x) * ux + Double(p.y) * uy }, v = { (p: CGPoint) in Double(p.x) * vx + Double(p.y) * vy }
        let width = { (pts: [CGPoint]) -> Double in let us = pts.map(u); return (us.max() ?? 0) - (us.min() ?? 0) }
        /// a closed outline's mean opening across its width: its area over its width
        let opening = { (pts: [CGPoint]) -> Double in let w = width(pts); return w > 1e-9 ? area(pts.map { CGPoint(x: u($0), y: v($0)) }) / w : 0 }
        var s = FaceShape()
        // heights in eye distances as a face seen straight on would have them (no more than twice what was measured)
        let tall = max(0.5, cos(yaw)) / max(0.5, cos(pitch))
        let wl = width(m.leftEye), wr = width(m.rightEye)
        s.geo.earL = wl > 1e-9 ? opening(m.leftEye) / wl : 0
        s.geo.earR = wr > 1e-9 ? opening(m.rightEye) / wr : 0
        s.geo.mouthOpen = m.innerLips.count >= 3 ? opening(m.innerLips) / iod * tall : 0
        s.geo.mouthWidth = m.outerLips.count >= 2 ? width(m.outerLips) / iod : 0
        s.geo.browL = m.leftBrow.isEmpty ? 0 : (v(centroid(m.leftBrow)) - v(cl)) / iod * tall
        s.geo.browR = m.rightBrow.isEmpty ? 0 : (v(centroid(m.rightBrow)) - v(cr)) / iod * tall
        let unit = { (x: Double, lo: Double, hi: Double) in max(0, min(1, (x - lo) / (hi - lo))) }
        s.blinkL = 1 - unit(s.geo.earL, Range.ear.shut, Range.ear.open)
        s.blinkR = 1 - unit(s.geo.earR, Range.ear.shut, Range.ear.open)
        s.jaw = unit(s.geo.mouthOpen, 0, Range.mouthOpen)
        s.smile = unit(s.geo.mouthWidth, Range.mouthWidth.narrow, Range.mouthWidth.wide)
        let brow = m.leftBrow.isEmpty || m.rightBrow.isEmpty ? max(s.geo.browL, s.geo.browR) : (s.geo.browL + s.geo.browR) / 2
        s.browUp = unit(brow, Range.brow.low, Range.brow.high)
        s.browDown = 1 - s.browUp
        return s
    }

    /// The shape as the page's feature frame carries it (`face.shape`): four decimals. The eyes are named for the person
    /// (a camera sees a person's left eye on the right of the picture), and `geo` keeps the picture's sides.
    public var json: [String: Any] {
        let r4 = { (x: Double) in (x * 10000).rounded() / 10000 }
        return ["blinkL": r4(blinkR), "blinkR": r4(blinkL), "jaw": r4(jaw), "smile": r4(smile), "browUp": r4(browUp), "browDown": r4(browDown),
                "geo": ["earL": r4(geo.earL), "earR": r4(geo.earR), "mouthOpen": r4(geo.mouthOpen), "mouthWidth": r4(geo.mouthWidth), "browL": r4(geo.browL), "browR": r4(geo.browR)]]
    }

    static func centroid(_ pts: [CGPoint]) -> CGPoint {
        guard !pts.isEmpty else { return .zero }
        var x = 0.0, y = 0.0
        for p in pts { x += Double(p.x); y += Double(p.y) }
        return CGPoint(x: x / Double(pts.count), y: y / Double(pts.count))
    }

    /// A closed outline's area (the shoelace formula), whichever way round its points go.
    static func area(_ pts: [CGPoint]) -> Double {
        guard pts.count >= 3 else { return 0 }
        var a = 0.0
        for i in 0..<pts.count { let p = pts[i], q = pts[(i + 1) % pts.count]; a += Double(p.x) * Double(q.y) - Double(q.x) * Double(p.y) }
        return abs(a) / 2
    }
}
