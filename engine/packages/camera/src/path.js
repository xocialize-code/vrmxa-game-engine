// Path3D: a curve through points for dollies, rails and cranes (research/cinematics.md §1.2). Catmull-Rom through the
// node's points (local to the node), sampled by arc length, so u = 0.5 is halfway along. Only + − × ÷ and sqrt
// (three's 'catmullrom' type, not 'centripetal', which calls Math.pow).
import { CatmullRomCurve3, Vector3 } from 'three';
import { Node } from '@vrmxg/core';

export class Path3DNode extends Node {
  constructor(data, def) {
    super(data, def);
    this._key = null; this._curve = null;
  }

  /** The curve in the node's local space (rebuilt when the points change). */
  curve() {
    const pts = this.props.points ?? [[0, 0, 0], [1, 0, 0]];
    const key = JSON.stringify([pts, this.props.closed, this.props.tension]);
    if (key !== this._key) {
      this._key = key;
      this._curve = new CatmullRomCurve3(pts.map((p) => new Vector3(p[0], p[1], p[2])), !!this.props.closed, 'catmullrom', this.props.tension ?? 0.5);
      this._curve.arcLengthDivisions = 400;
    }
    return this._curve;
  }

  /** World point at u in [0, 1] along the path's length. */
  pointAt(u, out = new Vector3()) {
    const t = this.props.closed ? u - Math.floor(u) : Math.max(0, Math.min(1, u));
    this.curve().getPointAt(t, out);
    this.object3d.updateWorldMatrix(true, false);
    return out.applyMatrix4(this.object3d.matrixWorld);
  }

  /** The u of the point on the path closest to a world point (sampled, then refined). */
  closestU(p, samples = 200) {
    const q = new Vector3();
    let best = 0, bestD = Infinity;
    for (let i = 0; i <= samples; i++) { const u = i / samples; const d = this.pointAt(u, q).distanceToSquared(p); if (d < bestD) { bestD = d; best = u; } }
    let lo = Math.max(0, best - 1 / samples), hi = Math.min(1, best + 1 / samples);
    for (let i = 0; i < 20; i++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (this.pointAt(a, q).distanceToSquared(p) < this.pointAt(b, q).distanceToSquared(p)) hi = b; else lo = a; }
    return (lo + hi) / 2;
  }

  /** Length in metres (in the node's space). */
  length() { return this.curve().getLength(); }
}
