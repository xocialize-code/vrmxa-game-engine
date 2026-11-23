// Floor-plan geometry for coverage: where people stand, which side of the 180° line a camera is on, and where each
// kind of shot puts its camera. Plain arithmetic and square roots only (both exact in IEEE 754), rounded to the
// millimetre, so the same marks place the same cameras in every engine, byte for byte. Characters face +Z in their own
// space (VRM 1.0); a mark's q turns them.
import { cos, sin } from '@vrmxg/dmath';

export const EYE = 1.5;
/** Round to the millimetre (and never write -0). */
export const mm = (v) => { const r = Math.round(v * 1000) / 1000; return r === 0 ? 0 : r; };

/** A 3-vector rotated by a unit quaternion [x, y, z, w]: v + 2w(q × v) + 2q × (q × v). */
export function rotate(q, v) {
  if (!q) return [v[0], v[1], v[2]];
  const [x, y, z, w] = q;
  const cx = y * v[2] - z * v[1], cy = z * v[0] - x * v[2], cz = x * v[1] - y * v[0];
  const dx = y * cz - z * cy, dy = z * cx - x * cz, dz = x * cy - y * cx;
  return [v[0] + 2 * (w * cx + dx), v[1] + 2 * (w * cy + dy), v[2] + 2 * (w * cz + dz)];
}

/** Where a transform faces on the floor: its +Z turned by q, as a unit [x, z] (+Z when it has no q). */
export function facing(tf) {
  const f = rotate(tf?.q ?? null, [0, 0, 1]);
  const len = Math.sqrt(f[0] * f[0] + f[2] * f[2]);
  return len < 1e-9 ? [0, 1] : [f[0] / len, f[2] / len];
}

/**
 * Which side of the line from a to b the point p is on (the floor plane, x and z): +1 or −1, or 0 within `margin`
 * metres of the line. The sign is the 2-D cross product's: +1 is the side the line's normal [dz, −dx] points to.
 */
export function sideOf(a, b, p, margin = 0.05) {
  const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1e-9) return 0;
  const d = ((p[0] - a[0]) * dz - (p[2] - a[2]) * dx) / len; // the signed distance from the line
  return d > margin ? 1 : d < -margin ? -1 : 0;
}

/** The unit normal of the line a → b on the floor that points to `side` (+1: [dz, −dx]). */
export function normal(a, b, side) {
  const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dz * dz) || 1;
  return [(dz / len) * side, (-dx / len) * side];
}

const centre = (ps) => { let x = 0, z = 0; for (const p of ps) { x += p[0]; z += p[2]; } return [x / ps.length, 0, z / ps.length]; };
const spread = (ps) => { let r = 0; for (const a of ps) for (const b of ps) { const dx = a[0] - b[0], dz = a[2] - b[2]; r = Math.max(r, Math.sqrt(dx * dx + dz * dz)); } return r; };

/**
 * A group shot's camera: off the line through the group's first two people, on `side`, far enough back to hold them.
 * `kind` "establishing" stands further back and higher than a two-shot.
 * @param {number[][]} ps the people, in line order (ps[0] → ps[1] is the line) @param {number} side
 */
export function groupPlace(ps, side, kind = 'two') {
  const c = centre(ps), d = spread(ps);
  const est = kind === 'establishing';
  const off = est ? Math.max(4.2, d * 3) : Math.max(2.5, d * 1.6);
  const n = ps.length >= 2 ? normal(ps[0], ps[1], side) : [0, 1];
  return [mm(c[0] + n[0] * off), est ? 2.2 : EYE, mm(c[2] + n[1] * off)];
}

/**
 * A clean single (a close-up): on `side` of the line from the person to the one she plays to, up to a metre down the
 * line towards them and 1.1 m off it (about 1.5 m from her: head and shoulders on the closeUp rig's 85 mm), so she is
 * seen in three-quarter and they stay behind the camera. With nobody to play to, 1.5 m in front of her (`face`), on
 * the line.
 * @param {number[]} p her position @param {number[] | null} to theirs @param {number} side @param {number[]} face
 */
export function singlePlace(p, to, side, face) {
  if (!to) return [mm(p[0] + face[0] * 1.5), EYE, mm(p[2] + face[1] * 1.5)];
  const dx = to[0] - p[0], dz = to[2] - p[2], len = Math.sqrt(dx * dx + dz * dz) || 1;
  const along = Math.min(1, len * 0.75), n = normal(p, to, side);
  return [mm(p[0] + (dx / len) * along + n[0] * 1.1), EYE, mm(p[2] + (dz / len) * along + n[1] * 1.1)];
}

/**
 * Where a VirtualCamera is on the floor at a moment, from its body and the people's transforms then: fixed (its own
 * transform), follow and thirdPerson (from the target, as virtual.js steps them), orbit, firstPerson and hardLock. A
 * dolly (on a Path3D) or a body without what it needs: null (it can't be checked).
 * @param {any} node the VirtualCamera @param {any} body its settings' body (rig defaults under its props)
 * @param {(id: string) => any} tfOf a node's transform at that moment
 */
export function cameraPoint(node, body, tfOf) {
  const type = body.type ?? 'fixed';
  if (type === 'fixed') return node.transform?.p ?? [0, 0, 0];
  const t = body.target ? tfOf(body.target.split('#')[0]) : null;
  if (!t) return null;
  const p = t.p ?? [0, 0, 0];
  if (type === 'hardLock' || type === 'firstPerson') return [p[0], p[1] + EYE, p[2]];
  if (type === 'follow') {
    const o = body.offset ?? [0, 1.6, -3.2];
    if (body.space === 'world') return [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
    const r = rotate(t.q ?? null, o);
    return [p[0] + r[0], p[1] + r[1], p[2] + r[2]];
  }
  if (type === 'thirdPerson') {
    const [fx, fz] = facing(t), rx = -fz, rz = fx, sh = body.shoulder ?? 0.45, arm = body.arm ?? 2.2;
    const dl = Math.sqrt(fx * fx + 0.0625 + fz * fz), dx = -fx / dl, dy = 0.25 / dl, dz = -fz / dl;
    return [p[0] - rx * sh + dx * arm, p[1] + EYE + dy * arm, p[2] - rz * sh + dz * arm];
  }
  if (type === 'orbit') {
    const DEG = Math.PI / 180, yaw = (body.yaw ?? 0) * DEG, pitch = (body.pitch ?? 15) * DEG, r = body.radius ?? 4;
    return [p[0] + sin(yaw) * cos(pitch) * r, p[1] + EYE + sin(pitch) * r, p[2] + cos(yaw) * cos(pitch) * r];
  }
  return null;
}
