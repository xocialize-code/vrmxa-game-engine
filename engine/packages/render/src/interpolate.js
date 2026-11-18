// Presentation at the clock's α (AB-D-0245): the simulation steps at 60 Hz and every rendered frame shows
// the world between the last two steps. Before the last step of a frame the interpolator copies every
// transform under the tree (nodes, VRM bones, cameras) and every morph weight; after it, copies them
// again; at render time it writes the blend into the objects, the renderer draws, and the simulated
// values go straight back, before any simulation code can see them.
//
// Rules that keep it out of the simulation:
//   - quaternions are written through their private fields, so no change callback runs: three's Euler
//     resync stays untouched, and VRM's look-at proxy (whose quaternion setter writes the look-at yaw
//     and pitch, simulated state) never fires;
//   - objects with manual matrices (spring-bone joints) get updateMatrix() on the way in and out;
//   - the host re-derives world matrices from the restored values after drawing.
// Slerp goes through three's slerpFlat, which uses Math.sqrt / atan2 / sin: portable once @vrmxg/dmath is
// installed, so exported frames are bit-identical across engines too.
import { Quaternion } from 'three';

const S = 10; // p xyz, q xyzw, s xyz

export class Interpolator {
  /** @param {{ snapDistance?: number }} [opts] a node moving further than this in one step snaps (teleports) */
  constructor({ snapDistance = 1 } = {}) {
    this.snap2 = snapDistance * snapDistance;
    /** @type {any[]} */ this.objects = [];
    /** @type {any[]} */ this.meshes = [];
    this.prev = new Float64Array(0); this.curr = new Float64Array(0); this.saved = new Float64Array(0);
    this.mPrev = new Float64Array(0); this.mCurr = new Float64Array(0); this.mSaved = new Float64Array(0);
    /** @type {number[]} */ this.mOffset = [];
    /** @type {number[]} */ this.touched = [];
    /** @type {number[]} */ this.touchedMeshes = [];
    this.version = -1;
    this.root = null;
    this.blend = new Float64Array(4);
  }

  /** Re-collect the objects when the tree's structure changed. Returns true if it did. */
  sync(tree) {
    if (tree.structureVersion === this.version && tree.root.object3d === this.root) return false;
    this.version = tree.structureVersion; this.root = tree.root.object3d;
    const objects = [], meshes = [];
    const walk = (o) => {
      if (o.userData.presentation) return; // the host's own views: lights, ground, debug
      objects.push(o);
      if (o.morphTargetInfluences?.length) meshes.push(o);
      for (const c of o.children) walk(c);
    };
    walk(this.root);
    this.objects = objects; this.meshes = meshes;
    const n = objects.length * S;
    this.prev = new Float64Array(n); this.curr = new Float64Array(n); this.saved = new Float64Array(n);
    let m = 0; this.mOffset = meshes.map((o) => { const at = m; m += o.morphTargetInfluences.length; return at; });
    this.mPrev = new Float64Array(m); this.mCurr = new Float64Array(m); this.mSaved = new Float64Array(m);
    this.capture(this.curr, this.mCurr);
    this.prev.set(this.curr); this.mPrev.set(this.mCurr);
    return true;
  }

  capture(buf, mbuf) {
    const objs = this.objects;
    for (let i = 0, k = 0; i < objs.length; i++, k += S) {
      const o = objs[i], p = o.position, q = o.quaternion, s = o.scale;
      buf[k] = p.x; buf[k + 1] = p.y; buf[k + 2] = p.z;
      buf[k + 3] = q._x; buf[k + 4] = q._y; buf[k + 5] = q._z; buf[k + 6] = q._w;
      buf[k + 7] = s.x; buf[k + 8] = s.y; buf[k + 9] = s.z;
    }
    for (let j = 0; j < this.meshes.length; j++) mbuf.set(this.meshes[j].morphTargetInfluences, this.mOffset[j]);
  }

  /** Call right before the last simulation step of a frame. */
  beforeStep(tree) { this.sync(tree); this.capture(this.prev, this.mPrev); }

  /** Call after the frame's steps (also when there were none: then nothing changes). */
  afterSteps(tree, stepped) {
    if (this.sync(tree)) return;           // the tree changed shape this step: nothing to blend from
    if (stepped) this.capture(this.curr, this.mCurr);
  }

  /** Write the blend at α into the objects (simulated values saved). */
  apply(alpha) {
    const { prev, curr, saved, objects, blend } = this;
    this.touched.length = 0; this.touchedMeshes.length = 0;
    if (alpha >= 1) return;
    const t = alpha;
    for (let i = 0, k = 0; i < objects.length; i++, k += S) {
      let same = true;
      for (let c = 0; c < S; c++) if (prev[k + c] !== curr[k + c]) { same = false; break; }
      if (same) continue;
      const dx = curr[k] - prev[k], dy = curr[k + 1] - prev[k + 1], dz = curr[k + 2] - prev[k + 2];
      if (dx * dx + dy * dy + dz * dz > this.snap2) continue;
      const o = objects[i], p = o.position, q = o.quaternion, s = o.scale;
      saved[k] = p.x; saved[k + 1] = p.y; saved[k + 2] = p.z;
      saved[k + 3] = q._x; saved[k + 4] = q._y; saved[k + 5] = q._z; saved[k + 6] = q._w;
      saved[k + 7] = s.x; saved[k + 8] = s.y; saved[k + 9] = s.z;
      p.x = prev[k] + dx * t; p.y = prev[k + 1] + dy * t; p.z = prev[k + 2] + dz * t;
      Quaternion.slerpFlat(blend, 0, prev, k + 3, curr, k + 3, t);
      q._x = blend[0]; q._y = blend[1]; q._z = blend[2]; q._w = blend[3];
      s.x = prev[k + 7] + (curr[k + 7] - prev[k + 7]) * t; s.y = prev[k + 8] + (curr[k + 8] - prev[k + 8]) * t; s.z = prev[k + 9] + (curr[k + 9] - prev[k + 9]) * t;
      if (!o.matrixAutoUpdate) o.updateMatrix();
      this.touched.push(i);
    }
    const { mPrev, mCurr, mSaved } = this;
    for (let j = 0; j < this.meshes.length; j++) {
      const inf = this.meshes[j].morphTargetInfluences, at = this.mOffset[j];
      let same = true;
      for (let c = 0; c < inf.length; c++) if (mPrev[at + c] !== mCurr[at + c]) { same = false; break; }
      if (same) continue;
      for (let c = 0; c < inf.length; c++) { mSaved[at + c] = inf[c]; inf[c] = mPrev[at + c] + (mCurr[at + c] - mPrev[at + c]) * t; }
      this.touchedMeshes.push(j);
    }
  }

  /** Put the simulated values back exactly. */
  restore() {
    const { saved, objects } = this;
    for (const i of this.touched) {
      const k = i * S, o = objects[i], p = o.position, q = o.quaternion, s = o.scale;
      p.x = saved[k]; p.y = saved[k + 1]; p.z = saved[k + 2];
      q._x = saved[k + 3]; q._y = saved[k + 4]; q._z = saved[k + 5]; q._w = saved[k + 6];
      s.x = saved[k + 7]; s.y = saved[k + 8]; s.z = saved[k + 9];
      if (!o.matrixAutoUpdate) o.updateMatrix();
    }
    for (const j of this.touchedMeshes) {
      const inf = this.meshes[j].morphTargetInfluences, at = this.mOffset[j];
      for (let c = 0; c < inf.length; c++) inf[c] = this.mSaved[at + c];
    }
    const changed = this.touched.length + this.touchedMeshes.length;
    this.touched.length = 0; this.touchedMeshes.length = 0;
    return changed;
  }
}
