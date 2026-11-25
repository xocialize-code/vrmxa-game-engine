// Shape handles' maths (M5 W5, AB-T-0605), plain functions tested in Node: what shape a selected node has (a collider's
// or sensor's box, sphere, capsule or cylinder; a point light's range; a spot light's range and cone), where its handles
// sit, what a drag of one does to the props the inspector edits, and the wireframe the viewport draws. All in the node's
// own frame without scale, as physics places shapes (physics ignores scale): x right, y up, a spot light along -z.
//
// A face drag moves that face and keeps the opposite one where it is, so the node's position moves by half the change
// (`shift`, in the node's frame); `symmetric` grows both sides instead. Snapping rounds the size the drag gives, not the
// distance dragged, so the face that stays never moves.

/** Snapping steps while the toolbar's Snap is on. */
export const SNAP = { length: 0.05, angle: 1 };
/** The smallest size, radius or range a drag leaves. */
export const MIN = { length: 0.01, angle: 1, maxAngle: 89 };
/** Physics' own defaults for a collider's unset props (engine/packages/physics/src/world.js shapeDesc). */
export const COLLIDER_DEFAULTS = { size: [1, 1, 1], sphere: 0.5, capsule: { radius: 0.3, height: 1.8 }, cylinder: { radius: 0.5, height: 1 } };

const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const NAMES = ['x', 'y', 'z'];

/** The default of a type's prop in the registry, or `fallback`. */
function defaultOf(reg, type, key, fallback) { return reg?.get(type)?.props?.[key]?.schema?.default ?? fallback; }

/**
 * The shape a node has for handles, or null: { kind: 'box', size } | { kind: 'sphere', radius } | { kind: 'capsule' |
 * 'cylinder', radius, height } | { kind: 'point', range } | { kind: 'spot', range, angle } (degrees, the half-angle).
 * @param {{ type: string, props?: any }} node a document node @param {any} reg the registry
 */
export function shapeOf(node, reg) {
  const p = node?.props ?? {};
  const isA = (t) => (reg?.isA ? reg.isA(node.type, t) : node.type === t);
  if (isA('Collider')) {
    const shape = p.shape ?? 'box';
    if (shape === 'box') return { kind: 'box', size: [...(p.size ?? COLLIDER_DEFAULTS.size)] };
    if (shape === 'sphere') return { kind: 'sphere', radius: p.radius ?? COLLIDER_DEFAULTS.sphere };
    if (shape === 'capsule' || shape === 'cylinder') { const d = COLLIDER_DEFAULTS[shape]; return { kind: shape, radius: p.radius ?? d.radius, height: p.height ?? d.height }; }
    return null; // convex and trimesh come from geometry
  }
  if (isA('PointLight')) return { kind: 'point', range: p.range ?? defaultOf(reg, node.type, 'range', 10) };
  if (isA('SpotLight')) return { kind: 'spot', range: p.range ?? defaultOf(reg, node.type, 'range', 10), angle: p.angle ?? defaultOf(reg, node.type, 'angle', 30) };
  return null;
}

const scale = (v, s) => v.map((x) => x * s);

/**
 * A shape's handles: [{ id, at: [x, y, z], axis: [x, y, z] }], `at` where it is drawn and `axis` the way it drags
 * (outward), both in the node's frame.
 */
export function handlesOf(shape) {
  if (!shape) return [];
  const out = [];
  const six = (r, prefix) => AXES.forEach((a, k) => { for (const s of [1, -1]) out.push({ id: `${prefix}${NAMES[k]}${s > 0 ? '+' : '-'}`, at: scale(a, r * s), axis: scale(a, s) }); });
  switch (shape.kind) {
    case 'box': AXES.forEach((a, k) => { for (const s of [1, -1]) out.push({ id: `${NAMES[k]}${s > 0 ? '+' : '-'}`, at: scale(a, (shape.size[k] / 2) * s), axis: scale(a, s) }); }); break;
    case 'sphere': six(shape.radius, 'r'); break;
    case 'capsule': case 'cylinder':
      out.push({ id: 'y+', at: [0, shape.height / 2, 0], axis: [0, 1, 0] }, { id: 'y-', at: [0, -shape.height / 2, 0], axis: [0, -1, 0] });
      for (const [a, n] of [[[1, 0, 0], 'rx+'], [[-1, 0, 0], 'rx-'], [[0, 0, 1], 'rz+'], [[0, 0, -1], 'rz-']]) out.push({ id: n, at: scale(a, shape.radius), axis: a });
      break;
    case 'point': six(shape.range, 'r'); break;
    case 'spot': {
      const r = shape.range * Math.tan((shape.angle * Math.PI) / 180);
      out.push({ id: 'range', at: [0, 0, -shape.range], axis: [0, 0, -1] }, { id: 'angle', at: [r, 0, -shape.range], axis: [1, 0, 0] });
      break;
    }
  }
  return out;
}

const snapTo = (v, step) => Math.round(v / step) * step;
const clean = (v) => Math.round(v * 1e6) / 1e6;

/**
 * What dragging a handle `d` metres along its axis does. → { shape, props, shift } (props: what to set on the node, as
 * the inspector names them; shift: how far the node moves in its own frame, [0, 0, 0] when it stays)
 * @param {any} shape @param {string} id the handle's id @param {number} d
 * @param {{ snap?: boolean, symmetric?: boolean }} [o]
 */
export function dragShape(shape, id, d, { snap = false, symmetric = false } = {}) {
  const len = (v) => clean(Math.max(snap ? SNAP.length : MIN.length, snap ? snapTo(v, SNAP.length) : v));
  const shift = [0, 0, 0];
  const face = (k, sign, old) => { // a face along axis k moves by d; the far face stays unless symmetric
    const nu = len(symmetric ? old + 2 * d : old + d);
    if (!symmetric) shift[k] = clean((sign * (nu - old)) / 2);
    return nu;
  };
  switch (shape.kind) {
    case 'box': {
      const k = NAMES.indexOf(id[0]), sign = id[1] === '+' ? 1 : -1, size = [...shape.size];
      size[k] = face(k, sign, size[k]);
      return { shape: { ...shape, size }, props: { size }, shift };
    }
    case 'sphere': { const radius = len(shape.radius + d); return { shape: { ...shape, radius }, props: { radius }, shift }; }
    case 'capsule': case 'cylinder': {
      // a capsule's height includes its two caps (physics: half-height max(0, height / 2 − radius)): it never gets
      // shorter than its two caps, nor its radius wider than half its height, so the shape always changes as dragged
      const capsule = shape.kind === 'capsule';
      if (id[0] === 'y') {
        const sign = id[1] === '+' ? 1 : -1, least = capsule ? 2 * shape.radius : 0;
        const height = Math.max(face(1, sign, shape.height), clean(least));
        if (!symmetric) shift[1] = clean((sign * (height - shape.height)) / 2);
        return { shape: { ...shape, height }, props: { height }, shift };
      }
      const radius = capsule ? Math.min(len(shape.radius + d), clean(shape.height / 2)) : len(shape.radius + d);
      return { shape: { ...shape, radius }, props: { radius }, shift };
    }
    case 'point': { const range = len(shape.range + d); return { shape: { ...shape, range }, props: { range }, shift }; }
    case 'spot': {
      if (id === 'range') { const range = len(shape.range + d); return { shape: { ...shape, range }, props: { range }, shift }; }
      const angle = coneAngle(shape.range, shape.range * Math.tan((shape.angle * Math.PI) / 180) + d, { snap });
      return { shape: { ...shape, angle }, props: { angle }, shift };
    }
  }
  throw new Error(`no handles on a ${shape.kind}`);
}

/** A cone's half-angle (degrees, 1–89) with a rim `radius` at `range`. */
export function coneAngle(range, radius, { snap = false } = {}) {
  const a = (Math.atan2(Math.max(0, radius), Math.max(1e-6, range)) * 180) / Math.PI;
  return clean(Math.min(MIN.maxAngle, Math.max(MIN.angle, snap ? snapTo(a, SNAP.angle) : a)));
}

/**
 * Where a ray passes closest to a line: the parameter t along the line (`dir` a unit vector), or null when they are
 * parallel. A handle drags by the change in t.
 * @param {number[]} o ray origin @param {number[]} r ray direction (unit) @param {number[]} p line point @param {number[]} dir line direction (unit)
 */
export function closestOnLine(o, r, p, dir) {
  const w = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const b = dot(dir, r), d = dot(dir, w), e = dot(r, w), denom = 1 - b * b;
  if (Math.abs(denom) < 1e-9) return null;
  return (b * e - d) / denom;
}

/** A circle as line segments: centre c, axes u and v (unit), radius r. */
function circle(out, c, u, v, r, n = 48, from = 0, to = 2 * Math.PI) {
  for (let i = 0; i < n; i++) {
    const a0 = from + ((to - from) * i) / n, a1 = from + ((to - from) * (i + 1)) / n;
    for (const a of [a0, a1]) out.push(c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r);
  }
}

/** A shape's wireframe in its frame: a flat list of segment end points (x, y, z, x, y, z, …). */
export function shapeLines(shape) {
  const out = [];
  if (!shape) return out;
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], O = [0, 0, 0];
  switch (shape.kind) {
    case 'box': {
      const [hx, hy, hz] = shape.size.map((v) => v / 2);
      const c = (i) => [i & 1 ? hx : -hx, i & 2 ? hy : -hy, i & 4 ? hz : -hz];
      for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) if (!(i & bit)) out.push(...c(i), ...c(i | bit));
      break;
    }
    case 'sphere': case 'point': { const r = shape.kind === 'sphere' ? shape.radius : shape.range; circle(out, O, X, Y, r); circle(out, O, X, Z, r); circle(out, O, Y, Z, r); break; }
    case 'cylinder': case 'capsule': {
      const r = shape.radius, h = shape.height / 2, body = shape.kind === 'capsule' ? Math.max(0, h - r) : h;
      for (const y of [body, -body]) circle(out, [0, y, 0], X, Z, r);
      for (const [x, z] of [[r, 0], [-r, 0], [0, r], [0, -r]]) out.push(x, body, z, x, -body, z);
      if (shape.kind === 'capsule') for (const [u, s] of [[X, 1], [Z, 1], [X, -1], [Z, -1]]) circle(out, [0, body * s, 0], u, scale(Y, s), r, 12, 0, Math.PI);
      break;
    }
    case 'spot': {
      const R = shape.range * Math.tan((shape.angle * Math.PI) / 180), c = [0, 0, -shape.range];
      circle(out, c, X, Y, R);
      for (const [x, y] of [[R, 0], [-R, 0], [0, R], [0, -R]]) out.push(0, 0, 0, x, y, -shape.range);
      break;
    }
  }
  return out;
}
