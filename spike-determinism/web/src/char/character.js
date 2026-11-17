// One VRM character on a fixed 1/60 s step: a scripted shot (idle → walk → walk/run blend → wave →
// idle, while the parent group walks a curved path), optional lookAt target and expressions, the
// observed state vector, and snapshot / restore. No rendering, no Vue: runs in Node and browsers.
//
// Everything that feeds the simulation is a closed-form function of the step index k built from
// +, -, *, /, sqrt and integer hashing, so the inputs are bit-identical in every engine and any
// difference in the output comes from the libraries.
import * as THREE from 'three';
import { createVRMAnimationClip, VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation';

export const DT = 1 / 60;
export const STEPS = 600;

const CLIPS = ['idle', 'walk', 'run', 'wave'];

// ---------------------------------------------------------------- deterministic inputs

/** 0 → 1 → 0 over `period` steps, integer-friendly. */
const tri = (k, period) => { const p = k % period, h = period / 2; return p < h ? p / h : (period - p) / h; };
/** Integer hash of k → [0, 1). Stateless, so a restored run sees the same sequence. */
function hash01(k) {
  let h = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 8) / 16777216;
}
const ramp = (k, a, b) => (k <= a ? 0 : k >= b ? 1 : (k - a) / (b - a));
const wrap = (t, d) => t - Math.floor(t / d) * d;

function speedAt(k) {
  if (k < 120) return 0;
  if (k < 300) return 1.2 * ramp(k, 120, 150);
  if (k < 420) return 1.2 + 0.8 * ramp(k, 300, 330);
  return 2.0 * (1 - ramp(k, 420, 450));
}
const turnAt = (k) => (k >= 200 && k < 300 ? 1 : k >= 340 && k < 400 ? -1 : 0);
const TURN = 0.006; // sin(half-angle) of the per-step yaw; cos from sqrt, no trig
const Q_LEFT = new THREE.Quaternion(0, TURN, 0, Math.sqrt(1 - TURN * TURN));
const Q_RIGHT = new THREE.Quaternion(0, -TURN, 0, Math.sqrt(1 - TURN * TURN));

/** Timeline weights for the stateless driver: same story as the crossfade driver. */
function timelineWeights(k) {
  const a = ramp(k, 120, 150), b = ramp(k, 420, 444), c = ramp(k, 510, 540);
  return {
    idle: k < 510 ? 1 - a : c,
    walk: k < 300 ? a : k < 420 ? 0.65 : 0.65 * (1 - b),
    run: k < 300 ? 0 : k < 420 ? 0.35 : 0.35 * (1 - b),
    wave: k < 420 ? 0 : k < 510 ? b : 1 - c,
  };
}
const START = { idle: 0, walk: 120, run: 300, wave: 420 };
const SCALE = { idle: 1, walk: 1.1, run: 1, wave: 1 };

// ---------------------------------------------------------------- character

export class Character {
  /**
   * @param vrm      a freshly parsed VRM (see load.js)
   * @param anims    { idle, walk, run, wave } VRMAnimation objects
   * @param opts     { driver: 'crossfade'|'timeline', spring, move, look, expr }
   *   spring=false runs only the mixer and vrm.humanoid.update() (question 1);
   *   spring=true runs vrm.update(DT): humanoid, lookAt, expressions, constraints, spring bones.
   */
  constructor(vrm, anims, opts = {}) {
    this.opts = { driver: 'crossfade', spring: true, move: true, look: true, expr: true, ...opts };
    this.vrm = vrm;
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.root.name = 'characterRoot';
    this.root.add(vrm.scene);
    this.scene.add(this.root);
    this.target = new THREE.Object3D();
    this.target.name = 'lookTarget';
    this.scene.add(this.target);
    if (vrm.lookAt) vrm.lookAt.target = this.opts.look ? this.target : null;
    this.k = 0;
    this._fwd = new THREE.Vector3();

    if (vrm.lookAt) {
      const proxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
      proxy.name = 'VRMLookAtQuaternionProxy';
      vrm.scene.add(proxy);
    }
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    this.actions = {};
    for (const name of CLIPS) {
      const clip = createVRMAnimationClip(anims[name], vrm);
      clip.name = name;
      this.actions[name] = this.mixer.clipAction(clip);
    }
    // A face clip with number tracks on expression weights, so the mixer also drives expressions.
    const em = vrm.expressionManager;
    const faceTracks = [];
    for (const [name, values] of [['happy', [0, 1, 0.3, 0.8, 0, 0.5]], ['ou', [0, 0, 0.7, 0.2, 0.9, 0]]]) {
      const trackName = em?.getExpressionTrackName?.(name);
      if (trackName) faceTracks.push(new THREE.NumberKeyframeTrack(trackName, [0, 2, 4, 6, 8, 10], values));
    }
    if (faceTracks.length) this.actions.face = this.mixer.clipAction(new THREE.AnimationClip('face', 10, faceTracks));
    this.actionOrder = Object.keys(this.actions);

    // Stable observation order.
    this.nodes = [];
    this.scene.traverse((o) => this.nodes.push(o));
    this.bones = this.nodes.filter((o) => o.isBone);
    this.meshes = this.nodes.filter((o) => o.isMesh && o.morphTargetInfluences);
    this.joints = vrm.springBoneManager ? [...vrm.springBoneManager.joints] : [];
    this.expressions = em ? em.expressions : [];
    this.normBones = [];
    for (const name of Object.keys(vrm.humanoid.humanBones)) {
      const n = vrm.humanoid.getNormalizedBoneNode(name);
      if (n) this.normBones.push(n);
    }

    if (this.opts.driver === 'timeline') {
      // Every action plays from step 0 and is never stopped, so each PropertyMixer saves its
      // "original" (rest) value exactly once, at load. Weights and times are then set per step.
      for (const name of this.actionOrder) { const a = this.actions[name]; a.play(); a.weight = 0; }
    }
  }

  info() {
    const v = this.vrm;
    return {
      metaVersion: v.meta?.metaVersion,
      bones: this.bones.length,
      nodes: this.nodes.length,
      springJoints: this.joints.length,
      colliders: v.springBoneManager ? v.springBoneManager.colliders.length : 0,
      springCentered: this.joints.filter((j) => j.center).length,
      constraints: v.nodeConstraintManager ? v.nodeConstraintManager.constraints.size : 0,
      expressions: this.expressions.length,
      lookAtType: v.lookAt?.applier?.constructor?.type ?? null,
      faceTracks: this.actions.face ? this.actions.face.getClip().tracks.length : 0,
      morphMeshes: this.meshes.length,
    };
  }

  // -------------------------------------------------------------- one fixed step

  step() {
    const k = this.k;
    if (this.opts.driver === 'timeline') this.#driveTimeline(k); else this.#driveCrossfade(k);
    if (this.opts.move) this.#move(k);
    if (this.opts.look) this.#look(k);
    if (this.opts.expr) this.#expressions(k);
    this.mixer.update(this.opts.driver === 'timeline' ? 0 : DT);
    if (this.opts.spring) this.vrm.update(DT);
    else this.vrm.humanoid.update();
    this.k = k + 1;
  }

  #driveCrossfade(k) {
    const A = this.actions;
    if (k === 0) { A.idle.play(); if (this.opts.expr && A.face) A.face.play(); }
    if (k === 120) { A.walk.reset(); A.walk.timeScale = 1.1; A.walk.play(); A.idle.crossFadeTo(A.walk, 0.5, false); }
    if (k === 300) { A.run.reset(); A.run.play(); A.run.setEffectiveWeight(0.35); A.walk.setEffectiveWeight(0.65); }
    if (k === 420) { A.wave.reset(); A.wave.play(); A.run.crossFadeTo(A.wave, 0.4, true); A.walk.fadeOut(0.4); }
    if (k === 510) { A.idle.reset(); A.idle.play(); A.wave.crossFadeTo(A.idle, 0.5, false); }
  }

  #driveTimeline(k) {
    const w = timelineWeights(k);
    for (const name of CLIPS) {
      const a = this.actions[name];
      const d = a.getClip().duration;
      const t = k >= START[name] ? ((k - START[name]) * DT) * SCALE[name] : 0;
      a.time = wrap(name === 'idle' && k >= 510 ? (k - 510) * DT : t, d);
      a.weight = w[name];
    }
    if (this.actions.face) {
      const f = this.actions.face;
      f.time = wrap(k * DT, f.getClip().duration);
      f.weight = this.opts.expr ? 1 : 0;
    }
  }

  #move(k) {
    const r = this.root;
    const turn = turnAt(k);
    if (turn) r.quaternion.multiply(turn > 0 ? Q_LEFT : Q_RIGHT).normalize();
    this._fwd.set(0, 0, 1).applyQuaternion(r.quaternion);
    r.position.addScaledVector(this._fwd, speedAt(k) * DT);
  }

  #look(k) {
    const p = this.root.position;
    this.target.position.set(p.x + 1.6 * (2 * tri(k, 240) - 1), 1.45 + 0.3 * (2 * tri(k, 170) - 1), p.z + 1.5);
  }

  #expressions(k) {
    const em = this.vrm.expressionManager;
    if (!em) return;
    const b = k % 150;
    em.setValue('blink', b < 10 ? 1 - Math.abs(b - 5) / 5 : 0);
    em.setValue('aa', k >= 60 && k < 300 ? 0.8 * hash01(k) : 0);
  }

  // -------------------------------------------------------------- observation

  /**
   * The posed state as plain doubles, in four parts. World matrices are recomputed here into a
   * scratch buffer from each node's local transform, without writing to the scene, so observing
   * never changes the simulation (the render-cadence test changes it on purpose).
   */
  state() {
    const m = this._m ?? (this._m = new Map());
    const tmp = this._tmp ?? (this._tmp = new THREE.Matrix4());
    const out = { norm: [], bones: [], springs: [], expr: [] };
    for (const n of this.normBones) out.norm.push(n.quaternion.x, n.quaternion.y, n.quaternion.z, n.quaternion.w, n.position.x, n.position.y, n.position.z);
    for (const o of this.nodes) {
      let w = m.get(o);
      if (!w) { w = new THREE.Matrix4(); m.set(o, w); }
      const local = o.matrixAutoUpdate ? tmp.compose(o.position, o.quaternion, o.scale) : o.matrix;
      if (o === this.scene) w.copy(local);
      else w.multiplyMatrices(m.get(o.parent), local); // traversal visits parents first
      if (o.isBone) out.bones.push(...w.elements);
    }
    const p = this.root.position, q = this.root.quaternion;
    out.bones.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w);
    for (const j of this.joints) out.springs.push(j._currentTail.x, j._currentTail.y, j._currentTail.z, j._prevTail.x, j._prevTail.y, j._prevTail.z);
    for (const e of this.expressions) out.expr.push(e.weight);
    for (const mesh of this.meshes) out.expr.push(...mesh.morphTargetInfluences);
    if (this.vrm.lookAt) out.expr.push(this.vrm.lookAt.yaw, this.vrm.lookAt.pitch);
    return { norm: Float64Array.from(out.norm), bones: Float64Array.from(out.bones), springs: Float64Array.from(out.springs), expr: Float64Array.from(out.expr) };
  }

  // -------------------------------------------------------------- snapshot / restore

  /**
   * Everything that carries over between steps. Nothing here is public three-vrm API:
   *   - every node's local TRS, matrix and matrixWorld (spring bones run with matrixAutoUpdate off,
   *     and lookAt / spring length read matrixWorld left over from the previous step);
   *   - spring joints' private _currentTail / _prevTail (Verlet state);
   *   - lookAt's private _yaw / _pitch / _needsUpdate, expression weights, morph influences;
   *   - AnimationMixer internals: mixer.time, per action time / weight / loop count / fade and warp
   *     interpolants / active order, and every PropertyMixer buffer (it holds the "original" value
   *     a blend with total weight < 1 mixes towards).
   */
  snapshot() {
    const nodes = new Float64Array(this.nodes.length * 42);
    this.nodes.forEach((o, i) => {
      const b = i * 42;
      o.position.toArray(nodes, b); o.quaternion.toArray(nodes, b + 3); o.scale.toArray(nodes, b + 7);
      nodes.set(o.matrix.elements, b + 10); nodes.set(o.matrixWorld.elements, b + 26);
    });
    const springs = new Float64Array(this.joints.length * 6);
    this.joints.forEach((j, i) => { j._currentTail.toArray(springs, i * 6); j._prevTail.toArray(springs, i * 6 + 3); });
    const morph = this.meshes.map((m) => Float64Array.from(m.morphTargetInfluences));
    const la = this.vrm.lookAt;
    return {
      k: this.k,
      nodes, springs, morph,
      expr: Float64Array.from(this.expressions, (e) => e.weight),
      lookAt: la ? { yaw: la._yaw, pitch: la._pitch, needsUpdate: la._needsUpdate } : null,
      mixer: snapshotMixer(this.mixer, this.actions),
    };
  }

  /**
   * nodes: 'full'  every node's TRS, matrix and matrixWorld (the reference);
   *        'trs'   local TRS only, then matrices recomputed (a 4× smaller snapshot);
   *        'root'  only the character root's transform (spring tails and mixer still restored).
   */
  restore(s, { nodes = 'full' } = {}) {
    if (nodes === 'root') {
      const b = this.nodes.indexOf(this.root) * 42;
      this.root.position.fromArray(s.nodes, b); this.root.quaternion.fromArray(s.nodes, b + 3); this.root.scale.fromArray(s.nodes, b + 7);
    } else {
      this.nodes.forEach((o, i) => {
        const b = i * 42;
        o.position.fromArray(s.nodes, b); o.quaternion.fromArray(s.nodes, b + 3); o.scale.fromArray(s.nodes, b + 7);
        if (nodes === 'full') { o.matrix.fromArray(s.nodes, b + 10); o.matrixWorld.fromArray(s.nodes, b + 26); }
        else if (!o.matrixAutoUpdate) o.updateMatrix();
      });
      if (nodes === 'trs') this.scene.updateMatrixWorld(true);
    }
    this.joints.forEach((j, i) => { j._currentTail.fromArray(s.springs, i * 6); j._prevTail.fromArray(s.springs, i * 6 + 3); });
    this.meshes.forEach((m, i) => { for (let x = 0; x < s.morph[i].length; x++) m.morphTargetInfluences[x] = s.morph[i][x]; });
    this.expressions.forEach((e, i) => { e.weight = s.expr[i]; });
    const la = this.vrm.lookAt;
    if (la && s.lookAt) { la._yaw = s.lookAt.yaw; la._pitch = s.lookAt.pitch; la._needsUpdate = s.lookAt.needsUpdate; }
    restoreMixer(this.mixer, this.actions, s.mixer);
    this.k = s.k;
  }
}

/** Bytes as raw doubles: `full` keeps 42 per node (TRS + matrix + matrixWorld), `trs` 10. */
export function snapshotBytes(s) {
  const mixerBytes = s.mixer.bindings.reduce((a, b) => a + b.buffer.byteLength, 0) + s.mixer.actions.length * 15 * 8;
  const rest = s.springs.byteLength + s.morph.reduce((a, m) => a + m.byteLength, 0) + s.expr.byteLength + mixerBytes;
  return { full: s.nodes.byteLength + rest, trs: (s.nodes.byteLength / 42) * 10 + rest, springs: s.springs.byteLength, mixer: mixerBytes };
}

// ---------------------------------------------------------------- AnimationMixer internals

const interp = (i) => (i ? { pp: Array.from(i.parameterPositions), sv: Array.from(i.sampleValues) } : null);

function snapshotMixer(mixer, actions) {
  const nameOf = new Map(Object.entries(actions).map(([n, a]) => [a, n]));
  const active = mixer._actions.slice(0, mixer._nActiveActions).map((a) => nameOf.get(a));
  return {
    time: mixer.time,
    accuIndex: mixer._accuIndex,
    active,
    actions: Object.entries(actions).map(([name, a]) => ({
      name, time: a.time, timeScale: a.timeScale, weight: a.weight, enabled: a.enabled, paused: a.paused,
      loopCount: a._loopCount, startTime: a._startTime, effectiveWeight: a._effectiveWeight,
      effectiveTimeScale: a._effectiveTimeScale, restoreTimeScale: a._restoreTimeScale,
      weightInterpolant: interp(a._weightInterpolant), timeScaleInterpolant: interp(a._timeScaleInterpolant),
    })),
    bindings: mixer._bindings.map((b) => ({ path: b.binding.path, buffer: Float64Array.from(b.buffer), useCount: b.useCount })),
  };
}

function setInterp(mixer, action, key, s) {
  const cur = action[key];
  if (!s) { if (cur) { mixer._takeBackControlInterpolant(cur); action[key] = null; } return; }
  const i = cur ?? mixer._lendControlInterpolant();
  i.parameterPositions[0] = s.pp[0]; i.parameterPositions[1] = s.pp[1];
  i.sampleValues[0] = s.sv[0]; i.sampleValues[1] = s.sv[1];
  action[key] = i;
}

function restoreMixer(mixer, actions, s) {
  // Recreate the active set in the same order: PropertyMixer accumulates actions in that order, and
  // a different summation order changes the low bits.
  for (const a of Object.values(actions)) a.stop();
  for (const name of s.active) actions[name].play();
  for (const sa of s.actions) {
    const a = actions[sa.name];
    a.time = sa.time; a.timeScale = sa.timeScale; a.weight = sa.weight; a.enabled = sa.enabled; a.paused = sa.paused;
    a._loopCount = sa.loopCount; a._startTime = sa.startTime; a._effectiveWeight = sa.effectiveWeight;
    a._effectiveTimeScale = sa.effectiveTimeScale; a._restoreTimeScale = sa.restoreTimeScale;
    setInterp(mixer, a, '_weightInterpolant', sa.weightInterpolant);
    setInterp(mixer, a, '_timeScaleInterpolant', sa.timeScaleInterpolant);
  }
  mixer.time = s.time;
  mixer._accuIndex = s.accuIndex;
  const byPath = new Map(mixer._bindings.map((b) => [b.binding.path, b]));
  for (const sb of s.bindings) { const b = byPath.get(sb.path); if (b) b.buffer.set(sb.buffer); }
}
