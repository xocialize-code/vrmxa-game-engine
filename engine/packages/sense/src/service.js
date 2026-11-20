// The "sense" service (M3 W5, AB-T-0544): the person in front of the camera, inside the world.
//
// Camera events (detect.js: presence, face, wave, nod, shake, point) come from outside the step. push() stamps each
// with the step it applies on, and the service applies it at the start of that step and logs it. A replay queues the log
// again, so a recorded session replays with the camera off (an input, like recorded keys and the director's log). As in
// the ai service, events queued for later steps are not world state: only applied ones are.
//
// Applied, an event:
//   - updates the viewer: present, where the face is, since when;
//   - is a stimulus for the brains (@vrmxg/ai): kind "viewer", topic the event's type, heard by every brain;
//   - is a signal on the viewer node: appeared, left, waved, nodded, shook, pointed;
//   - is in `events` for this step (the noticeViewer behaviour reacts to it).
// While someone is there, the viewer node (a Marker the scene has, id `viewer` by default) stands at the current
// camera, shifted a little with the face: a character looking at the viewer looks out of the screen at the person.
import { Matrix4, Quaternion, Vector3 } from 'three';

export const TYPES = ['presence', 'face', 'wave', 'nod', 'shake', 'point'];
const SIGNAL = { wave: 'waved', nod: 'nodded', shake: 'shook', point: 'pointed' };
const _m = new Matrix4(), _p = new Vector3(), _q = new Quaternion(), _s = new Vector3(), _r = new Vector3(), _u = new Vector3();

export class SenseService {
  /**
   * @param {any} tree
   * @param {{ viewer?: string, reach?: number[] }} [opts] viewer: the node standing for the person; reach: how far (m) the
   *   viewer moves right and up from the camera when the face is at the image's edge
   */
  constructor(tree, { viewer = 'viewer', reach = [0.3, 0.2] } = {}) {
    this.tree = tree; this.viewerId = viewer; this.reach = reach;
    /** events not applied yet (live: the next step; a replay: their steps) */ this.pending = [];
    /** events applied, in order */ this.log = [];
    /** the person: present, face ({ x, y, w, yaw, pitch }), since (the step they appeared) */ this.viewer = { present: false, face: null, since: null };
    /** events applied this step */ this.events = [];
  }

  /** A camera event from outside the step: it applies on `step` (default the next one) and is logged. */
  push(e) {
    if (!TYPES.includes(e.type)) throw new Error(`unknown camera event "${e.type}" (${TYPES.join(', ')})`);
    const { t, step, ...rest } = e; void t; // the camera's clock stays outside: the step is the time
    this.pending.push(structuredClone({ step: step ?? this.tree.clock.step, ...rest }));
    this.pending.sort((a, b) => a.step - b.step);
  }
  /** Replay a log: every event queued again for its step. */
  replay(log) { for (const e of log) this.push(e); }
  /** The events applied so far. */
  record() { return structuredClone(this.log); }

  physicsProcess() {
    const step = this.tree.clock.step;
    this.events = [];
    if (this.pending.length && this.pending[0].step <= step) {
      const due = this.pending.filter((e) => e.step <= step);
      this.pending = this.pending.filter((e) => e.step > step);
      for (const e of due) { this.apply(e, step); this.log.push(e); this.events.push(e); }
    }
    if (this.viewer.present) this.placeViewer();
  }

  apply(e, step) {
    const v = this.viewer;
    if (e.type === 'presence') { v.present = !!e.present; v.since = v.present ? step : null; if (!v.present) v.face = null; }
    else if (e.type === 'face') v.face = { x: e.x, y: e.y, w: e.w, yaw: e.yaw, pitch: e.pitch };
    if (e.type === 'face') return; // a face update moves the viewer; it isn't news to anyone
    if (v.present) this.placeViewer();
    const node = this.tree.find(this.viewerId), at = node ? node.object3d.getWorldPosition(new Vector3()).toArray() : [0, 0, 0];
    this.tree.services.get('ai')?.stimulus({ kind: 'viewer', topic: e.type === 'presence' ? (e.present ? 'appeared' : 'left') : e.type, source: this.viewerId, position: at, loudness: 1000 });
    if (node) this.tree.emit(node, e.type === 'presence' ? (e.present ? 'appeared' : 'left') : SIGNAL[e.type], e.type === 'point' ? { at: e.at, dir: e.dir } : {});
  }

  /** Stand the viewer node at the current camera, shifted right and up with the face (world space, then local). */
  placeViewer() {
    const node = this.tree.find(this.viewerId), cam = this.tree.services.get('cameras')?.current;
    if (!node || !cam) return;
    cam.object3d.updateWorldMatrix(true, false);
    cam.object3d.matrixWorld.decompose(_p, _q, _s);
    const f = this.viewer.face, x = f ? f.x : 0, y = f ? f.y : 0;
    _r.set(1, 0, 0).applyQuaternion(_q); _u.set(0, 1, 0).applyQuaternion(_q);
    _p.addScaledVector(_r, x * this.reach[0]).addScaledVector(_u, y * this.reach[1]);
    const parent = node.object3d.parent;
    if (parent) { parent.updateWorldMatrix(true, false); _p.applyMatrix4(_m.copy(parent.matrixWorld).invert()); }
    node.object3d.position.copy(_p);
    node.object3d.updateMatrixWorld();
  }

  // Applied events are world state (the viewer, the log, this step's events). Events not applied yet are inputs, like
  // recorded keys: between steps the clock already names the next step, so an event for it (pushed live, or queued by a
  // replay) is not in the state; only one due in a step already run would be (none, once a step has run).
  getState() { const now = this.tree.clock.step; return { viewer: structuredClone(this.viewer), log: structuredClone(this.log), pending: structuredClone(this.pending.filter((e) => e.step < now)), events: structuredClone(this.events) }; }
  setState(s) {
    this.viewer = structuredClone(s.viewer); this.log = structuredClone(s.log); this.events = structuredClone(s.events);
    const later = this.pending.filter((e) => e.step >= this.tree.clock.step); // this tree's own inputs still to come (a replay) stay
    this.pending = [...structuredClone(s.pending), ...later];
  }
}
