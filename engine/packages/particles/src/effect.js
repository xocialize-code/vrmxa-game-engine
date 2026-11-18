// Effect documents (M2 W4): what a ParticleEmitter shows, as data. A document lists systems; each becomes one
// three.quarks ParticleSystem. Built-in effects (steam, dust, sparks) are documents too, so a project file can copy one
// and change it. Units: metres, seconds, radians for spin, degrees for angles.
//   { "format": "vrmxg-effect", "version": 1, "name": "steam", "systems": [ {
//       "duration": 2, "looping": true, "prewarm": false,
//       "life": [1.6, 2.4], "speed": [0.25, 0.45], "size": [0.08, 0.14], "startAngle": [0, 6.28],   radians
//       "color": [[1, 1, 1, 0.5], [0.9, 0.92, 0.95, 0.4]],            one colour, or two to pick between
//       "rate": 14, "bursts": [{ "time": 0, "count": 30 }],
//       "shape": { "type": "cone", "radius": 0.04, "angle": 12 },     point | sphere | hemisphere | cone | circle
//       "direction": "up",                                            up (default) | forward: where a cone points
//       "gravity": -0.2, "force": [0.05, 0, 0],                       m/s² (gravity pulls down; negative rises)
//       "sizeOverLife": [0.4, 1, 1.6, 2.2], "speedOverLife": [1, 0.7, 0.5, 0.4],   cubic bezier over life
//       "opacityOverLife": [[0, 0], [0.8, 0.2], [0, 1]],              [value, t] pairs
//       "colorOverLife": [[[1, 1, 1], 0], [[0.8, 0.8, 0.85], 1]],
//       "spin": [-0.6, 0.6],
//       "tile": "puff", "blending": "normal", "render": "billboard", "stretch": { "speed": 0.35, "length": 1 },
//       "offset": [0, 0, 0] } ] }
import * as Quarks from 'three.quarks';
import { TILES, ATLAS_COLS, ATLAS_ROWS } from './atlas.js';

const Q = /** @type {any} */ (Quarks); // quarks' typings resolve their own three types, not r187's

export const EFFECT_FORMAT = 'vrmxg-effect';

/** Built-in effects (M2 W4): steam from a cup or the espresso machine, dust kicked up by feet, sparks from a hit. */
export const BUILTIN = {
  steam: { format: EFFECT_FORMAT, version: 1, name: 'steam', systems: [{
    duration: 2, looping: true, prewarm: true, life: [1.6, 2.4], speed: [0.22, 0.4], size: [0.07, 0.12], startAngle: [0, 6.28],
    color: [[1, 1, 1, 0.55], [0.92, 0.94, 0.97, 0.45]], rate: 14, shape: { type: 'cone', radius: 0.035, angle: 10 },
    gravity: -0.15, force: [0.04, 0, 0], sizeOverLife: [0.5, 1.1, 1.8, 2.6], speedOverLife: [1, 0.75, 0.55, 0.45],
    opacityOverLife: [[0, 0], [1, 0.15], [0.6, 0.6], [0, 1]], spin: [-0.5, 0.5], tile: 'puff', blending: 'normal',
  }] },
  dust: { format: EFFECT_FORMAT, version: 1, name: 'dust', systems: [{
    duration: 1, looping: true, life: [0.7, 1.2], speed: [0.2, 0.6], size: [0.06, 0.12], startAngle: [0, 6.28],
    color: [[0.72, 0.64, 0.52, 0.5], [0.62, 0.56, 0.48, 0.4]], rate: 10, shape: { type: 'hemisphere', radius: 0.15 },
    gravity: 0.6, sizeOverLife: [0.6, 1.2, 1.6, 1.9], speedOverLife: [1, 0.4, 0.15, 0.05],
    opacityOverLife: [[0, 0], [1, 0.1], [0, 1]], spin: [-1, 1], tile: 'puff', blending: 'normal',
  }] },
  sparks: { format: EFFECT_FORMAT, version: 1, name: 'sparks', systems: [
    { duration: 1.5, looping: true, life: [0.25, 0.5], speed: [3, 7], size: [0.025, 0.045], color: [[1, 0.95, 0.75, 1]],
      rate: 0, bursts: [{ time: 0, count: 30 }], shape: { type: 'sphere', radius: 0.03 }, gravity: 9.8,
      speedOverLife: [1, 0.6, 0.35, 0.2], colorOverLife: [[[1, 1, 1], 0], [[1, 0.8, 0.3], 0.4], [[1, 0.35, 0.1], 1]],
      opacityOverLife: [[1, 0], [1, 0.7], [0, 1]], tile: 'spark', blending: 'additive', render: 'stretched', stretch: { speed: 0.35, length: 1 } },
    { duration: 1.5, looping: true, life: [0.12, 0.12], speed: [0, 0], size: [0.35, 0.35], startAngle: [0, 0.8], color: [[1, 1, 0.85, 1]],
      rate: 0, bursts: [{ time: 0, count: 1 }], shape: { type: 'point' }, sizeOverLife: [0.6, 1.3, 1.1, 0], tile: 'flash', blending: 'additive' },
  ] },
};

const SHAPES = ['point', 'sphere', 'hemisphere', 'cone', 'circle'];
const RENDER = { billboard: Q.RenderMode.BillBoard, stretched: Q.RenderMode.StretchedBillBoard, vertical: Q.RenderMode.VerticalBillBoard, horizontal: Q.RenderMode.HorizontalBillBoard };

/** Problems with an effect document, as messages. */
export function checkEffect(doc) {
  const out = [];
  if (doc?.format !== EFFECT_FORMAT) out.push(`not an effect document (format "${doc?.format}", want "${EFFECT_FORMAT}")`);
  if (!Array.isArray(doc?.systems) || !doc.systems.length) out.push('an effect needs at least one system');
  for (const [i, s] of (doc?.systems ?? []).entries()) {
    const at = `system ${i}`;
    if (s.shape && !SHAPES.includes(s.shape.type)) out.push(`${at}: shape "${s.shape.type}" (${SHAPES.join(', ')})`);
    if (s.tile && !(s.tile in TILES)) out.push(`${at}: tile "${s.tile}" (${Object.keys(TILES).join(', ')})`);
    if (s.render && !(s.render in RENDER)) out.push(`${at}: render "${s.render}" (${Object.keys(RENDER).join(', ')})`);
    if (s.blending && !['normal', 'additive'].includes(s.blending)) out.push(`${at}: blending is normal or additive`);
    if (!(s.rate > 0) && !(s.bursts ?? []).length) out.push(`${at}: emits nothing (no rate, no bursts)`);
    for (const b of s.bursts ?? []) if (!Number.isInteger(b.count) || b.count < 1) out.push(`${at}: a burst count is a positive integer`);
  }
  return out;
}

const V3 = (a) => new Q.Vector3(a[0], a[1], a[2]);
const V4 = (a) => new Q.Vector4(a[0], a[1], a[2], a[3]);
const range = (v, d) => { const x = v ?? d; return Array.isArray(x) ? (x[0] === x[1] ? new Q.ConstantValue(x[0]) : new Q.IntervalValue(x[0], x[1])) : new Q.ConstantValue(x); };
const bezier = (b) => new Q.PiecewiseBezier([[new Q.Bezier(b[0], b[1], b[2], b[3]), 0]]);

function shape(s = { type: 'point' }) {
  const arc = (s.arc ?? 360) * (Math.PI / 180);
  switch (s.type) {
    case 'sphere': return new Q.SphereEmitter({ radius: s.radius ?? 0.1, thickness: s.thickness ?? 1, arc });
    case 'hemisphere': return new Q.HemisphereEmitter({ radius: s.radius ?? 0.1, thickness: s.thickness ?? 1, arc });
    case 'cone': return new Q.ConeEmitter({ radius: s.radius ?? 0.05, angle: (s.angle ?? 15) * (Math.PI / 180), thickness: s.thickness ?? 1, arc });
    case 'circle': return new Q.CircleEmitter({ radius: s.radius ?? 0.1, thickness: s.thickness ?? 1, arc });
    default: return new Q.PointEmitter();
  }
}

/**
 * The three.quarks systems for an effect document (call inside the adapter's seeded run: building draws randomness).
 * @param {any} doc @param {(blending: string) => any} material a shared material per blending (the atlas on it)
 */
export function buildSystems(doc, material) {
  return doc.systems.map((s, i) => {
    const colors = s.color ?? [[1, 1, 1, 1]];
    const ps = new Q.ParticleSystem({
      duration: s.duration ?? 1, looping: s.looping ?? true, prewarm: s.prewarm ?? false, worldSpace: s.worldSpace ?? true,
      startLife: range(s.life, 1), startSpeed: range(s.speed, 1), startSize: range(s.size, 0.1), startRotation: range(s.startAngle, 0),
      startColor: colors.length > 1 ? new Q.RandomColor(V4(colors[0]), V4(colors[1])) : new Q.ConstantColor(V4(colors[0])),
      emissionOverTime: new Q.ConstantValue(s.rate ?? 0),
      emissionBursts: (s.bursts ?? []).map((b) => ({ time: b.time ?? 0, count: new Q.ConstantValue(b.count), cycle: 1, interval: 0.01, probability: 1 })),
      shape: shape(s.shape), material: material(s.blending ?? 'normal'), renderMode: RENDER[s.render ?? 'billboard'],
      ...(s.render === 'stretched' ? { speedFactor: s.stretch?.speed ?? 0.35, lengthFactor: s.stretch?.length ?? 1 } : {}),
      uTileCount: ATLAS_COLS, vTileCount: ATLAS_ROWS, startTileIndex: new Q.ConstantValue(TILES[s.tile ?? 'dot']),
    });
    if (s.sizeOverLife) ps.addBehavior(new Q.SizeOverLife(bezier(s.sizeOverLife)));
    if (s.speedOverLife) ps.addBehavior(new Q.SpeedOverLife(bezier(s.speedOverLife)));
    if (s.colorOverLife || s.opacityOverLife) {
      const c = s.colorOverLife ?? [[[1, 1, 1], 0], [[1, 1, 1], 1]], a = s.opacityOverLife ?? [[1, 0], [1, 1]];
      ps.addBehavior(new Q.ColorOverLife(new Q.Gradient(c.map(([v, t]) => [V3(v), t]), a.map(([v, t]) => [v, t]))));
    }
    if (s.gravity) ps.addBehavior(new Q.ApplyForce(new Q.Vector3(0, -Math.sign(s.gravity), 0), new Q.ConstantValue(Math.abs(s.gravity))));
    if (s.force) { const f = s.force, m = Math.sqrt(f[0] * f[0] + f[1] * f[1] + f[2] * f[2]); if (m > 0) ps.addBehavior(new Q.ApplyForce(new Q.Vector3(f[0] / m, f[1] / m, f[2] / m), new Q.ConstantValue(m))); }
    if (s.spin) ps.addBehavior(new Q.RotationOverLife(range(s.spin, 0)));
    // quarks' cones and hemispheres point along the emitter's +Z: "up" (the default) turns them to +Y
    if ((s.direction ?? 'up') === 'up') ps.emitter.quaternion.setFromAxisAngle(new Q.Vector3(1, 0, 0), -Math.PI / 2);
    if (s.offset) ps.emitter.position.set(s.offset[0], s.offset[1], s.offset[2]);
    ps.emitter.name = `${doc.name ?? 'effect'}:${i}`;
    return ps;
  });
}
