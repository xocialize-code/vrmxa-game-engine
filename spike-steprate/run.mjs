#!/usr/bin/env node
// VRMXG step-rate spike (PRD §9 Q7): what do spring bones do at 120 Hz instead of 60 Hz, and what
// would 60 Hz + interpolation cost at 24 fps? Node only (V8): this is about dynamics, not engines.
//
//   node run.mjs [--models vroid10,seed,vroid0x,spec] [--out results/steprate.json]
//
// Variants, all driven by the same motion, defined as closed-form functions of time:
//   ref60      one vrm.update(1/60) per 1/60 s: what UniVRM and VRoid authors see (the reference)
//   raw120     vrm.update(1/120) twice per 1/60 s, parameters untouched
//   comp120    the same, with drag and forces rescaled so two half steps act like one 60 Hz step
//   raw240 / comp240   the same at 240 Hz (convergence check)
// Measured: per spring joint, the angle between each variant's bone world orientation and ref60's,
// sampled every 1/60 s; and, for interpolation, how far a pose interpolated between two ref60 steps
// lands from the real pose in between.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const det = path.resolve(here, '../spike-determinism/web');
const THREE = await import(path.join(det, 'node_modules/three/build/three.module.js'));
const { createVRMAnimationClip } = await import(path.join(det, 'node_modules/@pixiv/three-vrm-animation/lib/three-vrm-animation.module.js'));
const { parseVRM, parseVRMA } = await import(path.join(det, 'src/char/load.js'));
const D = await import(path.resolve(here, '../engine/packages/dmath/src/index.js'));
D.installPortableMath(); // repeatable everywhere; not essential for a Node-only comparison

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MODELS = opt('--models', 'vroid10,seed,vroid0x,spec').split(',');
const FILES = { spec: 'spec.vrm', vroid10: 'vroid10.vrm', vroid0x: 'vroid0x.vrm', seed: 'seed-san.vrm' };
const read = (f) => { const b = fs.readFileSync(path.join(det, 'public/models', f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

const SECONDS = 10, SAMPLE_HZ = 60, SAMPLES = SECONDS * SAMPLE_HZ;

// ---------------------------------------------------------------- the motion, as functions of t
// 0–1 s idle; 1–2 s accelerate to 1.6 m/s; walk; 4.0–4.2 s hard stop; 6.0–6.4 s spin 180°;
// 8.0–8.3 s a hop (root up 0.12 m and down); idle to 10 s. Distances are integrated in closed form.
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const smoothInt = (x) => (x <= 0 ? 0 : x >= 1 ? x - 0.5 : x * x * x - 0.5 * x * x * x * x); // ∫ smooth
const V = 1.6;
function distance(t) { // ∫ speed dt, speed = V·smooth(t-1) until 4.0, then V·(1-smooth((t-4)/0.2))
  if (t <= 1) return 0;
  if (t <= 4) return V * smoothInt(t - 1);
  const at4 = V * smoothInt(3);
  const u = Math.min((t - 4) / 0.2, 1);
  return at4 + V * 0.2 * (u - smoothInt(u));
}
const yaw = (t) => Math.PI * smooth((t - 6) / 0.4);
const hop = (t) => { const u = (t - 8) / 0.3; return u <= 0 || u >= 1 ? 0 : 0.12 * 4 * u * (1 - u); };
const walkWeight = (t) => smooth((t - 1) / 0.5) * (1 - smooth((t - 4) / 0.4));

// ---------------------------------------------------------------- a character
async function makeChar(model, clips) {
  const vrm = await parseVRM(read(FILES[model]));
  const root = new THREE.Group();
  root.add(vrm.scene);
  const scene = new THREE.Scene();
  scene.add(root);
  const mixer = new THREE.AnimationMixer(vrm.scene);
  const idle = mixer.clipAction(createVRMAnimationClip(clips.idle, vrm));
  const walk = mixer.clipAction(createVRMAnimationClip(clips.walk, vrm));
  idle.play(); walk.play();
  const joints = [...vrm.springBoneManager.joints];
  // Stable order: by bone name, then by index for duplicates.
  joints.sort((a, b) => (a.bone.name < b.bone.name ? -1 : a.bone.name > b.bone.name ? 1 : 0));
  return { vrm, root, scene, mixer, idle, walk, joints, q: new THREE.Quaternion(), axis: new THREE.Vector3(0, 1, 0) };
}

function pose(ch, t) { // drive everything that is a function of time, then evaluate the clips
  ch.root.position.set(ch.nudge || 0, hop(t), distance(t));
  ch.root.quaternion.setFromAxisAngle(ch.axis, yaw(t));
  const w = walkWeight(t);
  ch.walk.weight = w; ch.idle.weight = 1 - w;
  ch.walk.time = (t * 1.0) % ch.walk.getClip().duration;
  ch.idle.time = t % ch.idle.getClip().duration;
  ch.mixer.update(0);
}

function compensate(ch, sub) { // make `sub` substeps of 1/(60·sub) act like one 1/60 step (linear part)
  const seen = new Set();
  for (const j of ch.joints) {
    const s = j.settings;
    if (seen.has(s)) continue;
    seen.add(s);
    const d = s.dragForce;
    const dp = 1 - Math.pow(1 - d, 1 / sub);      // (1-d')^sub = 1-d
    let geo = 0; for (let i = 0; i < sub; i++) geo += Math.pow(1 - dp, i); // Σ (1-d')^i
    // In velocity units (displacement per step / step length) the code's force term is the bare
    // parameter, applied once per step: one 60 Hz step adds F, `sub` substeps add F'·Σ(1-d')^i.
    const f = 1 / geo;                               // F'·Σ = F
    s.dragForce = dp; s.stiffness *= f; s.gravityPower *= f;
  }
}

const worldQuats = (ch) => {
  ch.scene.updateMatrixWorld(true);
  const out = new Float64Array(ch.joints.length * 4);
  ch.joints.forEach((j, i) => { j.bone.getWorldQuaternion(ch.q); out.set([ch.q.x, ch.q.y, ch.q.z, ch.q.w], i * 4); });
  return out;
};
const localQuats = (ch) => {
  const out = new Float64Array(ch.joints.length * 4);
  ch.joints.forEach((j, i) => { const q = j.bone.quaternion; out.set([q.x, q.y, q.z, q.w], i * 4); });
  return out;
};
const angleDeg = (a, i, b, k) => { // angle between two unit quaternions, degrees
  const dot = Math.abs(a[i] * b[k] + a[i + 1] * b[k + 1] + a[i + 2] * b[k + 2] + a[i + 3] * b[k + 3]);
  return 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI;
};

// Runs one variant; returns world quaternions of every spring joint at each 1/60 s sample, and the
// local quaternions at the 24 fps frame times (for the interpolation comparison).
async function run(model, clips, sub, comp, nudge = 0) {
  const ch = await makeChar(model, clips);
  if (comp) compensate(ch, sub);
  ch.nudge = nudge;
  const h = 1 / (SAMPLE_HZ * sub);
  pose(ch, 0); ch.vrm.update(0); // settle the rest state the same way for every variant
  const samples = [], locals = [], t0 = performance.now();
  let n = 0;
  for (let s = 1; s <= SAMPLES; s++) {
    for (let i = 0; i < sub; i++) { n++; pose(ch, n * h); ch.vrm.update(h); }
    samples.push(worldQuats(ch));
    locals.push(localQuats(ch));
  }
  return { samples, locals, joints: ch.joints.length, ms: performance.now() - t0, vrm: ch.vrm, ch };
}

function stats(xs) {
  const s = Float64Array.from(xs).sort();
  const at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { max: +s[s.length - 1].toFixed(3), p99: +at(0.99).toFixed(3), p95: +at(0.95).toFixed(3), median: +at(0.5).toFixed(3) };
}

const clipBufs = { idle: await parseVRMA(read('idle.vrma')), walk: await parseVRMA(read('walk.vrma')) };
const report = { when: new Date().toISOString(), node: process.version, seconds: SECONDS, motion: 'idle → accelerate to 1.6 m/s → walk → hard stop at 4.0 s → spin 180° at 6.0 s → hop at 8.0 s', models: {} };
const PHASES = { 'walk 1–4 s': [60, 240], 'stop 4–6 s': [240, 360], 'spin 6–8 s': [360, 480], 'hop 8–10 s': [480, 600] };

for (const model of MODELS) {
  const ref = await run(model, clipBufs, 1, false);
  const out = { springJoints: ref.joints, variants: {} };
  // nudge60 is the chaos control: ref60 with the root moved sideways by 1e-9 m. Whatever error it
  // shows is how much any change at all grows into, so pose-by-pose errors above it are meaningful.
  for (const [name, sub, comp, nudge] of [['nudge60', 1, false, 1e-9], ['raw120', 2, false], ['comp120', 2, true], ['raw240', 4, false], ['comp240', 4, true]]) {
    const r = await run(model, clipBufs, sub, comp, nudge);
    const all = [], perPhase = Object.fromEntries(Object.keys(PHASES).map((k) => [k, []]));
    for (let s = 0; s < SAMPLES; s++) {
      for (let j = 0; j < ref.joints; j++) {
        const a = angleDeg(r.samples[s], j * 4, ref.samples[s], j * 4);
        all.push(a);
        for (const [k, [lo, hi]] of Object.entries(PHASES)) if (s >= lo && s < hi) perPhase[k].push(a);
      }
    }
    out.variants[name] = { all: stats(all), phases: Object.fromEntries(Object.entries(perPhase).map(([k, v]) => [k, stats(v)])), simMs: +r.ms.toFixed(1) };
  }
  out.variants.ref60 = { simMs: +ref.ms.toFixed(1) };

  // Interpolation bound: predict ref60's pose at step s from steps s-1 and s+1 (slerp at 0.5, i.e.
  // interpolating across a 30 Hz gap) and compare with the real pose. Interpolating across a 60 Hz
  // gap, as 24 fps frames on half steps would, has roughly a quarter of this error (it is quadratic).
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(), qm = new THREE.Quaternion();
  const interp = [];
  for (let s = 1; s < SAMPLES - 1; s++) {
    const A = ref.samples[s - 1], B = ref.samples[s + 1], M = ref.samples[s];
    for (let j = 0; j < ref.joints; j++) {
      q0.fromArray(A, j * 4); q1.fromArray(B, j * 4); qm.copy(q0).slerp(q1, 0.5);
      interp.push(angleDeg([qm.x, qm.y, qm.z, qm.w], 0, M, j * 4));
    }
  }
  out.interpolationAcross30HzGap = stats(interp);
  // The same across a 15 Hz gap (steps s-2 and s+2): if the error grows about 4x, it is quadratic in
  // the gap, and a 60 Hz gap (24 fps frames on half steps) has about a quarter of the 30 Hz figure.
  const interp15 = [];
  for (let s = 2; s < SAMPLES - 2; s++) {
    const A = ref.samples[s - 2], B = ref.samples[s + 2], M = ref.samples[s];
    for (let j = 0; j < ref.joints; j++) {
      q0.fromArray(A, j * 4); q1.fromArray(B, j * 4); qm.copy(q0).slerp(q1, 0.5);
      interp15.push(angleDeg([qm.x, qm.y, qm.z, qm.w], 0, M, j * 4));
    }
  }
  out.interpolationAcross15HzGap = stats(interp15);
  // Typical motion per 1/60 s step, for scale.
  const perStep = [];
  for (let s = 1; s < SAMPLES; s++) for (let j = 0; j < ref.joints; j++) perStep.push(angleDeg(ref.samples[s], j * 4, ref.samples[s - 1], j * 4));
  out.motionPerStep = stats(perStep);
  report.models[model] = out;
  console.error(model, JSON.stringify({ joints: out.springJoints, nudge60: out.variants.nudge60.all, raw120: out.variants.raw120.all, comp120: out.variants.comp120.all, comp240: out.variants.comp240.all, interp: out.interpolationAcross30HzGap, perStep: out.motionPerStep }));
}

const outFile = path.resolve(here, opt('--out', 'results/steprate.json'));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
console.error('wrote', outFile);
