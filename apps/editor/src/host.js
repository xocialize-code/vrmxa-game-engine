// The editor's engine side, outside Vue (a reactive proxy around three.js objects costs every access and breaks
// identity): the editing session, the edit view (a SceneTree of the document, built but never stepped), the render
// host with the editor's own camera, orbit / fly controls, the transform gizmo, picking, asset drops, and play in
// place. The UI calls plain methods and copies plain data out of `snapshot()` when `onChange` fires.
import { Box3, BoxHelper, Euler, Matrix4, Plane, PerspectiveCamera, Quaternion, Raycaster, Sphere, Spherical, Vector2, Vector3, Vector4 } from 'three';
import CameraControls from 'camera-controls';
import { FlyControls } from 'three/addons/controls/FlyControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { KeyboardDevice, MouseDevice, GamepadDevice } from '@vrmxg/input';
import { RenderHost } from '@vrmxg/render';
import { PostStack, lutFromCube, renderViews, gridLayout } from '@vrmxg/post';
import { composeSequence, isSequence, SequencePlayer } from '@vrmxg/sequence';
import { ShellStore, IndexedDBStore } from '@vrmxg/save';
import { m0Registry } from '@vrmxg/registry/m0';
import { parse, describeType } from '@vrmxg/scene';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { EditorSession, assetList, newSequenceDoc, rowsOf } from '@vrmxg/editor-core';
import { AudioOutput } from '@vrmxg/audio';
import { exportTake, shellSink, hashSink, captureStill, encodePNG, toBase64, SIZES, RATES, CODECS, framesFor, secondsOf } from '@vrmxg/export';
import { inShell, call } from '../../shell/js/shell.js';
import * as vrmxaMain from '@vrmxa-core/index.js';
import * as vrmxaAnim from '@vrmxa-core/anim/index.js';
import * as closet from '@vrmxa-core/closet/index.js';
import { buildWorld } from '../../playground/src/world.js';
import '../../playground/src/sqljs.js'; // vrmxa-core's sql.js for bundles with a database (Mira's)

installPortableMath(); // before anything parses a VRM or steps a world
CameraControls.install({ THREE: { Vector2, Vector3, Vector4, Quaternion, Matrix4, Spherical, Box3, Sphere, Raycaster } });
const vrmxaCore = { ...vrmxaMain, ...vrmxaAnim };
const registry = m0Registry();
const SNAP = { translate: 0.25, rotate: 15, scale: 0.1 };
/** Node types the Add menu offers (no asset needed). */
export const ADDABLE = ['Node3D', 'DirectionalLight', 'PointLight', 'SpotLight', 'Environment', 'Camera', 'VirtualCamera', 'CameraBrain', 'Path3D', 'ParticleEmitter', 'Collider', 'RigidBody', 'Area', 'Marker'].filter((t) => registry.get(t) && !registry.get(t).abstract && !registry.get(t).asset?.required);

/** A short digest of a list of frame hashes: two exports with the same digest have the same frames. */
function digest(list) { return hashValue(list.join(',')); }

function download(bytes, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export { SIZES, RATES, CODECS, secondsOf };

export class EditorHost {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.host = new RenderHost({ canvas, preserveDrawingBuffer: true, post: (r) => this.postStack(r) });
    this.camera = new PerspectiveCamera(50, 16 / 9, 0.05, 500);
    this.camera.position.set(9, 7, 14);
    this.host.camera = this.camera;
    this.cameraMode = 'orbit';
    // camera-controls (yomotsu, MIT; M2 W5): orbit, dolly to the cursor and truck, with smooth transitions
    this.orbit = new CameraControls(this.camera, canvas);
    this.orbit.dollyToCursor = true;
    this.orbit.setLookAt(9, 7, 14, 0, 1, 0, false);
    this.fly = null;
    this.gizmo = new TransformControls(this.camera, canvas);
    this.gizmo.setTranslationSnap(SNAP.translate); this.gizmo.setRotationSnap((SNAP.rotate * Math.PI) / 180); this.gizmo.setScaleSnap(SNAP.scale);
    this.snap = true;
    this.host.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('dragging-changed', (e) => { this.orbit.enabled = !e.value && this.cameraMode === 'orbit'; if (!e.value) this.commitGizmo(); });
    this.box = new BoxHelper(undefined, 0x2f8cff); this.box.visible = false;
    this.host.scene.add(this.box);
    this.ray = new Raycaster();
    this.registry = registry;
    this.project = null; this.sceneRef = null; this.session = null;
    this.edit = null;          // { tree, objects: Map<Object3D, nodeId>, shape }
    this.playWorld = null;
    this.devices = null;
    this.debug = { colliders: false, sensors: false, capsules: false, rays: false };
    this.stats = { frameMs: 0, fps: 0, renderMs: 0, step: 0, buildMs: 0 };
    this.error = '';
    this.onChange = null;
    this.busy = 0;
    this._gen = 0; this._frames = []; this._last = null; this._rebuildTimer = null;
    this._downAt = null;
    this.lastTake = null;      // the last Play: { scene, doc, input, steps }
    this.paused = false;       // play paused (MCP): the frame loop draws but doesn't step; not the clock's own pause, which freezes pausable nodes
    this.exporting = null;     // { n, frames, phase } while an export runs
    this.lastExport = null; this.lastStill = null;
    this.exportHost = null;
    // the timeline (M2 W5): the set a sequence films, the playhead, the play range, the preview world
    this.setScene = null;      // { ref, doc } for a sequence document
    this.view = 'edit';        // 'edit': the document's edit view; 'preview': the sequence played to the playhead
    this.playhead = 0; this.range = null; this.loopRange = true; this.previewPlaying = false;
    this.previewCamera = 'sequence'; this.angles = false; this.preview = null; this.scrubState = null;
    this._scrubWant = null; this._scrubbing = null; this._previewBuilding = null; this._previewTimer = null; this._angleCams = [];
    canvas.addEventListener('pointerdown', (e) => { this._downAt = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', (e) => this.onClick(e));
    this.loop();
  }

  /** The post stack for a renderer (M2 W3): LUTs read from the open project. */
  postStack(renderer) { return new PostStack(renderer, { loadLut: async (file) => lutFromCube(await this.project.text(file)) }); }

  /** Tell the UI: 'stats' for the readouts only (every few frames), anything else for the panels. */
  changed(kind = 'all') { this.onChange?.(kind); }

  // ---------------------------------------------------------------- project and scene

  async openProject(project, sceneRef) {
    this.project = project;
    this.R ??= await loadRapier();
    const scene = sceneRef ?? project.scenes().find((s) => !s.startsWith('prefabs/')) ?? null;
    if (scene) await this.openScene(scene); else await this.newScene();
  }

  async openScene(ref) {
    if (this.session?.mode === 'playing') this.stop();
    this.busy++; this.changed();
    try {
      const text = await this.project.text(ref);
      const doc = parse(text);
      await this.loadSet(doc);
      const prefabs = await this.project.prefabs(this.setScene ? composeSequence(doc, this.setScene.doc) : doc);
      this.session = new EditorSession({ registry, text, prefabs, path: ref });
      this.adoptSession();
      this.sceneRef = ref;
      this.session.on((e) => this.onSession(e));
      this.edit = null;
      await this.rebuild();
      this.frameAll();
    } finally { this.busy--; this.changed(); }
  }

  async newScene(ref = 'untitled.vrmxs') {
    this.setScene = null;
    this.session = EditorSession.empty(registry, ref.replace(/\.vrmxs$/, '').replace(/[^A-Za-z0-9_-]/g, '-'));
    this.session.path = ref; this.sceneRef = ref;
    this.adoptSession();
    this.session.on((e) => this.onSession(e));
    this.edit = null;
    await this.rebuild();
    this.changed();
  }

  /** A sequence document films a set: read it (its nodes are what tracks target). */
  async loadSet(doc) {
    this.setScene = isSequence(doc) ? { ref: doc.set, doc: parse(await this.project.text(doc.set)) } : null;
  }

  /** A new session: the timeline starts over, and a sequence's tracks may target the set's nodes. */
  adoptSession() {
    const set = this.setScene;
    this.session.targetIds = set ? () => new Set(set.doc.nodes.map((n) => n.id)) : null;
    this.session.setDoc = set?.doc ?? null;
    this.preview = null; this.scrubState = null; this.previewPlaying = false; this.playhead = 0; this.range = null; this.view = 'edit';
    this.host.camera = this.camera;
  }

  /**
   * A new sequence filming a set (M2 W5): an empty timeline and a CameraBrain on the set's first Camera, so camera
   * tracks have something to switch. Saved as `ref`.
   */
  async newSequence(ref = 'sequences/untitled.vrmxs', setRef = 'cafe.vrmxs', { fps = 24, duration = 240 } = {}) {
    if (this.session?.mode === 'playing') this.stop();
    this.busy++; this.changed();
    try {
      const id = ref.split('/').pop().replace(/\.vrmxs$/, '').replace(/[^A-Za-z0-9_-]/g, '-');
      const doc = newSequenceDoc({ id, set: setRef, fps, duration });
      await this.loadSet(doc);
      const cam = this.setScene.doc.nodes.find((n) => n.type === 'Camera');
      if (cam) doc.nodes.push({ id: 'brain', type: 'CameraBrain', props: { camera: cam.id } });
      const prefabs = await this.project.prefabs(composeSequence(doc, this.setScene.doc));
      this.session = new EditorSession({ registry, doc, prefabs, path: ref });
      this.session.savedText = '';
      this.sceneRef = ref;
      this.adoptSession();
      this.session.on((e) => this.onSession(e));
      this.edit = null;
      await this.rebuild();
      this.frameAll();
    } finally { this.busy--; this.changed(); }
  }

  /** Save into the project (the scene's own ref, or `ref` for Save As). → { path, bytes, hash } */
  async save(ref = this.sceneRef) {
    const text = this.session.save(ref);
    await this.project.write(ref, text);
    this.sceneRef = ref;
    this.lastSave = { ref, hash: hashValue(text), bytes: new TextEncoder().encode(text).length };
    this.changed();
    return this.lastSave;
  }

  /** Read the saved file back from disk and compare it with what was saved (the byte-for-byte check). */
  async verifySaved() {
    const text = await this.project.text(this.sceneRef);
    const reopened = new EditorSession({ registry, text, prefabs: this.session.prefabs });
    reopened.targetIds = this.session.targetIds; reopened.setDoc = this.session.setDoc;
    const v = reopened.validate();
    this.lastVerify = { ref: this.sceneRef, same: hashValue(text) === this.lastSave?.hash && reopened.text() === text, hash: hashValue(text), valid: v.ok, errors: v.errors };
    this.changed();
    return this.lastVerify;
  }

  // ---------------------------------------------------------------- the edit view

  /** What a rebuild is needed for: everything about the document except node transforms. */
  shapeOf(doc) {
    return JSON.stringify({ a: doc.assets, c: doc.connections, s: doc.settings, q: doc.sequence, n: doc.nodes.map(({ transform, ...rest }) => rest) });
  }

  onSession(e) {
    if (e.kind === 'select') { this.attachGizmo(); this.changed(); return; }
    if (e.kind === 'play' || e.kind === 'stop' || e.kind === 'save') { this.changed(); return; }
    // an edit, undo or redo: transforms only are applied in place; anything else rebuilds the view
    if (this.edit && this.shapeOf(this.session.doc) === this.edit.shape) this.applyTransforms();
    else this.scheduleRebuild();
    if (this.view === 'preview') this.schedulePreview(); // the preview follows the edit (a fresh world, at the playhead)
    this.changed();
  }

  scheduleRebuild() {
    clearTimeout(this._rebuildTimer);
    this._rebuildTimer = setTimeout(() => this.rebuild().catch((err) => { this.error = String(err?.stack ?? err); this.changed(); }), 30);
  }

  /** Build the edit view from the document (characters and items are prepared again: a few hundred ms). */
  async rebuild() {
    const gen = ++this._gen;
    const t0 = performance.now();
    const doc = parse(this.session.text());
    const world = await this.buildFrom(doc);
    if (gen !== this._gen) return; // a newer edit started another build
    if (this.session.mode === 'playing') return;
    this.edit = { tree: world.tree, objects: this.objectMap(world.tree), shape: this.shapeOf(doc) };
    if (this.view === 'edit') { this.host.attach(world.tree); this.host.debug.set(this.debug); }
    this.stats.buildMs = performance.now() - t0;
    this.error = '';
    this.attachGizmo();
    this.changed();
  }

  /**
   * A world from a document. The edit view (play false) is never stepped, so it skips the run-time closet and reuses
   * the project's read bundles and clips between rebuilds; Play builds the full world, as the game does.
   */
  async buildFrom(doc, { play = false, heard = play } = {}) {
    const p = this.project;
    if (this.cacheFor !== p) { this.cacheFor = p; this.characterCache = { sources: new Map(), clips: new Map() }; this.animCache = await p.animations(); }
    if (this.setScene && isSequence(doc)) doc = composeSequence(doc, this.setScene.doc); // a sequence plays in its set
    const sample = { scene: this.sceneRef, doc, prefabs: this.session.prefabs, animations: this.animCache, bytes: (ref) => p.bytes(ref) };
    this.buildTimings = {};
    if (heard && !this.audio) this.audio = new AudioOutput(); // made on the first Play: that click is the gesture that lets it sound
    return buildWorld(this.R, sample, { vrmxaCore, closet: play ? closet : null, behaviours: await p.behaviours(), timings: this.buildTimings, now: () => performance.now(), characterCache: play ? null : this.characterCache, audioOutput: heard ? this.audio : null });
  }

  /** Each scene node's object, for picking: inner nodes of a prefab instance pick the instance. */
  objectMap(tree) {
    const m = new Map();
    for (const n of tree.all()) if (n.object3d && n !== tree.root && n.id) m.set(n.object3d, n.id.split('/')[0]);
    return m;
  }

  applyTransforms() {
    const tree = this.edit.tree;
    for (const n of this.session.doc.nodes) {
      const node = tree.find(n.id);
      if (!node?.object3d) continue;
      const t = n.transform ?? {};
      node.object3d.position.fromArray(t.p ?? [0, 0, 0]);
      node.object3d.quaternion.fromArray(t.q ?? [0, 0, 0, 1]);
      node.object3d.scale.fromArray(t.s ?? [1, 1, 1]);
    }
    tree.root.object3d.updateMatrixWorld(true);
    if (this.box.visible) this.box.update();
  }

  // ---------------------------------------------------------------- selection, gizmo, picking

  selectedObject() {
    const id = this.session?.primary;
    return id && this.edit ? this.edit.tree.find(id)?.object3d ?? null : null;
  }

  attachGizmo() {
    const o = this.session?.mode === 'editing' ? this.selectedObject() : null;
    if (o) { this.gizmo.attach(o); this.box.setFromObject(o); this.box.visible = true; } else { this.gizmo.detach(); this.box.visible = false; }
  }

  setGizmoMode(mode) { this.gizmo.setMode(mode); this.changed(); }
  get gizmoMode() { return this.gizmo.mode; }

  setSnap(on) {
    this.snap = on;
    this.gizmo.setTranslationSnap(on ? SNAP.translate : null); this.gizmo.setRotationSnap(on ? (SNAP.rotate * Math.PI) / 180 : null); this.gizmo.setScaleSnap(on ? SNAP.scale : null);
    this.changed();
  }

  /** The gizmo was released: one undoable Move / Rotate / Scale with the object's new local transform. */
  commitGizmo() {
    const id = this.session.primary, o = this.selectedObject();
    if (!id || !o) return;
    const n = this.session.node(id), t = n.transform ?? {};
    const p = o.position.toArray(), q = o.quaternion.toArray(), s = o.scale.toArray();
    const differs = (a, b, d) => a.some((v, i) => Math.abs(v - (b ?? d)[i]) > 1e-7);
    const change = {};
    if (differs(p, t.p, [0, 0, 0])) change.p = p;
    if (differs(q, t.q, [0, 0, 0, 1])) change.q = q;
    if (differs(s, t.s, [1, 1, 1])) change.s = s;
    if (Object.keys(change).length) this.session.setTransform(id, change);
  }

  ndc(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  /** The scene node under a point of the viewport, or null. */
  pick(clientX, clientY) {
    if (!this.edit) return null;
    this.ray.setFromCamera(this.ndc(clientX, clientY), this.camera);
    for (const hit of this.ray.intersectObject(this.edit.tree.root.object3d, true)) {
      for (let o = hit.object; o; o = o.parent) { const id = this.edit.objects.get(o); if (id && id !== 'root' && this.session.node(id)) return id; }
    }
    return null;
  }

  onClick(e) {
    if (!this._downAt || this.session?.mode !== 'editing' || this.gizmo.dragging) return;
    const moved = Math.hypot(e.clientX - this._downAt[0], e.clientY - this._downAt[1]);
    this._downAt = null;
    if (moved > 4 || e.button !== 0) return; // a camera drag, not a click
    if (this.gizmo.axis) return;              // the press was on the gizmo
    const id = this.pick(e.clientX, e.clientY);
    this.session.select(id ? [id] : [], { add: e.shiftKey });
  }

  /** Where a drop lands: the first surface under the point, else the ground plane (y = 0), else in front of the camera. */
  dropPoint(clientX, clientY) {
    this.ray.setFromCamera(this.ndc(clientX, clientY), this.camera);
    // something to stand on: a mesh face that points up (a floor, a table top), not a wall
    const up = (h) => h.object.isMesh && h.face && h.face.normal.clone().transformDirection(h.object.matrixWorld).y > 0.7;
    const hit = this.edit ? this.ray.intersectObject(this.edit.tree.root.object3d, true).find(up) : null;
    if (hit) return hit.point.toArray();
    const g = new Vector3();
    if (this.ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), g)) return g.toArray();
    return this.camera.position.clone().add(this.camera.getWorldDirection(new Vector3()).multiplyScalar(4)).setY(0).toArray();
  }

  /** Place an asset: dropped at a point of the viewport, or (from the list's Add button) where the view looks. */
  addAsset(ref, clientX, clientY) {
    // the first thing in an empty scene goes at the origin (a set); later ones where the view looks
    const empty = this.session.doc.nodes.every((n) => n.parent === undefined);
    const at = clientX !== undefined ? this.dropPoint(clientX, clientY) : empty ? [0, 0, 0] : this.lookPoint();
    const snapped = this.snap ? at.map((v) => Math.round(v / SNAP.translate) * SNAP.translate) : at;
    return this.session.addFromAsset(ref, { at: snapped });
  }

  /** The point of the ground the view centres on. */
  lookPoint() { const t = this.cameraMode === 'orbit' ? this.orbit.getTarget(new Vector3()) : this.camera.position.clone().add(this.camera.getWorldDirection(new Vector3()).multiplyScalar(4)); return [t.x, 0, t.z]; }

  // ---------------------------------------------------------------- camera

  setCameraMode(mode) {
    if (mode === this.cameraMode) return;
    this.cameraMode = mode;
    if (mode === 'fly') {
      this.orbit.enabled = false;
      this.fly = new FlyControls(this.camera, this.canvas);
      this.fly.movementSpeed = 4; this.fly.rollSpeed = 0.6; this.fly.dragToLook = true;
    } else {
      this.fly?.dispose(); this.fly = null;
      const p = this.camera.position, t = p.clone().add(this.camera.getWorldDirection(new Vector3()).multiplyScalar(5));
      this.orbit.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, false);
      this.orbit.enabled = true;
    }
    this.changed();
  }

  /** Fit the view to the selection, or the whole scene. */
  frameAll(only = false) {
    const o = only ? this.selectedObject() : this.edit?.tree.root.object3d;
    if (!o) return;
    const box = new Box3().setFromObject(o);
    if (box.isEmpty()) return;
    const c = box.getCenter(new Vector3()), r = Math.max(1, box.getSize(new Vector3()).length() / 2);
    const dir = this.camera.position.clone().sub(this.orbit.getTarget(new Vector3())).normalize();
    const to = c.clone().addScaledVector(dir.lengthSq() ? dir : new Vector3(0.5, 0.4, 0.8).normalize(), Math.max(3, r * 2.2));
    this.orbit.setLookAt(to.x, to.y, to.z, c.x, c.y, c.z, false);
  }

  // ---------------------------------------------------------------- inspector data

  /** The primary selection as the inspector shows it (plain data). */
  inspect() {
    const n = this.session?.primary ? this.session.node(this.session.primary) : null;
    if (!n) return null;
    const d = describeType(registry, n.type);
    const props = Object.entries(d.schema.properties.props.properties).map(([key, schema]) => {
      const meta = d.propMeta[key] ?? {};
      const widget = meta.nodeRef ? 'node' : meta.widget ?? (schema.enum ? 'enum' : schema.type === 'boolean' ? 'boolean' : schema.type === 'number' || schema.type === 'integer' ? 'number' : schema.type === 'string' ? 'string' : schema.type === 'array' ? 'json' : 'json');
      return { key, widget, value: structuredClone(n.props?.[key]), default: structuredClone(schema.default), enum: schema.enum ?? null, min: schema.minimum, max: schema.maximum, unit: meta.unit ?? null, description: schema.description ?? '', set: n.props?.[key] !== undefined };
    });
    const t = n.transform ?? {};
    const e = new Euler().setFromQuaternion(new Quaternion().fromArray(t.q ?? [0, 0, 0, 1]), 'YXZ');
    const deg = (r) => Math.round((r * 180) / Math.PI * 1000) / 1000;
    const asset = n.asset ? this.session.doc.assets.find((a) => a.id === n.asset) : null;
    return {
      id: n.id, type: n.type, name: n.name ?? '', parent: n.parent ?? null, description: d.description, asset: asset ? `${asset.ref} (${asset.type})` : null,
      p: t.p ?? [0, 0, 0], r: [deg(e.x), deg(e.y), deg(e.z)], s: t.s ?? [1, 1, 1], props,
      behaviours: (n.behaviours ?? []).map((b) => b.use), nodes: this.session.doc.nodes.map((x) => x.id),
    };
  }

  /** Set the primary selection's rotation from Euler degrees (Y, then X, then Z: yaw, pitch, roll). */
  setRotationDeg(id, r) {
    const q = new Quaternion().setFromEuler(new Euler((r[0] * Math.PI) / 180, (r[1] * Math.PI) / 180, (r[2] * Math.PI) / 180, 'YXZ'));
    this.session.setTransform(id, { q: q.toArray() });
  }

  assets() { return this.project ? assetList(registry, this.project.files) : []; }

  // ---------------------------------------------------------------- play in place

  async play() {
    if (!this.session || this.session.mode !== 'editing') return;
    this.editView();
    this.gizmo.detach(); this.box.visible = false;
    this.editHash = this.edit ? hashValue(worldHashes(this.edit.tree)) : null;
    this.busy++; this.changed();
    try {
      this.audio?.ctx.resume?.();
      let playDoc = null;
      const world = await this.session.startPlay((doc) => { playDoc = structuredClone(doc); return this.buildFrom(doc, { play: true }); });
      this.audio?.ctx.resume?.();
      world.input.record(); // every Play is a take: its input, replayable from step 0 (Export)
      this.playDoc = playDoc;
      if (!this.devices) {
        this.devices = { keyboard: new KeyboardDevice(), mouse: new MouseDevice(), gamepad: new GamepadDevice() };
        this.devices.keyboard.attach(window); this.devices.mouse.attach(this.canvas);
      }
      for (const d of Object.values(this.devices)) world.input.addDevice(d);
      this.playWorld = world;
      this.paused = false;
      this.host.camera = null; // the scene's camera
      this.orbit.enabled = false;
      this.host.attach(world.tree);
      this.host.debug.set(this.debug);
      const r = this.canvas.getBoundingClientRect(); this.host.resize(r.width, r.height);
      this._last = null;
      this.canvas.focus();
    } catch (err) { this.error = String(err?.stack ?? err); this.attachGizmo(); }
    finally { this.busy--; this.changed(); }
  }

  stop() {
    if (this.session?.mode !== 'playing') return null;
    this.paused = false;
    const world = this.playWorld;
    const steps = world?.tree.clock.step ?? 0;
    if (world?.input.recording && steps > 0) this.lastTake = { scene: this.sceneRef, doc: this.playDoc, input: structuredClone(world.input.recording), steps };
    const r = this.session.stopPlay(() => {
      world.audio?.dispose(); // silence what the play world was playing
      for (const d of Object.values(this.devices ?? {})) world.input.removeDevice?.(d);
      this.host.detach();
    });
    this.playWorld = null;
    this.host.camera = this.camera;
    this.orbit.enabled = this.cameraMode === 'orbit';
    if (this.edit) { this.host.attach(this.edit.tree); this.host.debug.set(this.debug); }
    const after = this.edit ? hashValue(worldHashes(this.edit.tree)) : null;
    this.lastStop = { ...r, viewSame: after === this.editHash };
    this.attachGizmo();
    this.changed();
    return this.lastStop;
  }

  // ---------------------------------------------------------------- save games in play (M2 W9)

  /** Where play-mode saves go: the Mac shell's saves folder, or IndexedDB in a browser. */
  saveStore() { return (this._saveStore ??= inShell ? new ShellStore(call) : new IndexedDBStore('vrmxg-editor')); }
  async saveSlots() { return this.saveStore().list(); }
  /** Save the play world now into a slot. */
  async saveGame(slot) {
    if (!this.playWorld) throw new Error('Save Game works while playing');
    const tree = this.playWorld.tree, doc = this.playWorld.save.save({ name: `${this.sceneRef} at ${(tree.clock.step / 60).toFixed(1)} s`, savedAt: new Date().toISOString() });
    const r = await this.saveStore().write(slot, doc);
    this.lastGameSave = { slot, step: tree.clock.step, bytes: r.bytes, hash: hashValue(worldHashes(tree, { physicsBytes: true })) };
    this.changed();
    return this.lastGameSave;
  }
  /** Load a slot into a fresh play world of the scene as it is (refused, with the reason, when the scene changed since). */
  async loadGame(slot) {
    const doc = await this.saveStore().read(slot);
    if (this.session?.mode === 'playing') this.stop();
    await this.play();
    if (!this.playWorld) throw new Error(this.error || 'play did not start');
    try { await this.playWorld.save.load(doc); } catch (e) { this.stop(); throw e; }
    this.paused = true; // the loaded moment, held until Play goes on
    this.host.render(1, false);
    const tree = this.playWorld.tree;
    this.lastGameLoad = { slot, step: tree.clock.step, hash: hashValue(worldHashes(tree, { physicsBytes: true })) };
    this.changed();
    return this.lastGameLoad;
  }

  // ---------------------------------------------------------------- export, stills, thumbnails

  /** The takes there are to export: the last Play, then the project's recorded input. */
  takes() {
    const out = [];
    if (this.lastTake) out.push({ id: 'play', label: `Last play (${(this.lastTake.steps / 60).toFixed(1)} s)`, seconds: this.lastTake.steps / 60 });
    for (const f of this.project?.takes() ?? []) out.push({ id: f, label: f, seconds: null });
    return out;
  }

  /** A take as a world at step 0 with its input replaying: { world, seconds }. Sound is recorded, not heard. */
  async takeWorld(id) {
    let doc, input;
    if (id === 'play') {
      if (!this.lastTake) throw new Error('nothing has been played yet');
      ({ doc, input } = this.lastTake);
    } else {
      doc = structuredClone(this.session.doc);
      input = JSON.parse(await this.project.text(id));
    }
    const world = await this.buildFrom(structuredClone(doc), { play: true, heard: false });
    world.input.replay(structuredClone(input));
    return { world, seconds: (input.frames?.length ?? 0) / 60 };
  }

  /**
   * Export a take to a video file through the shell (a hash of every frame without it, or with `hashOnly`).
   * @param {{ take: string, seconds?: number, size: string, fps: string, codec: string, audio: boolean, name?: string, hash?: boolean, hashOnly?: boolean }} o
   */
  async exportVideo({ take, seconds, size, fps, codec, audio, name, hash = true, hashOnly = !inShell }) {
    if (this.exporting) throw new Error('an export is already running');
    if (this.session?.mode !== 'editing') throw new Error('stop playing before exporting');
    const [width, height] = SIZES[size], rate = RATES[fps];
    this.exporting = { n: 0, frames: 0, phase: 'building' }; this.error = ''; this.changed();
    let world = null;
    try {
      const built = await this.takeWorld(take);
      world = built.world;
      const frames = framesFor(seconds ?? built.seconds, rate);
      this.exporting.frames = frames;
      this.exportHost ??= new RenderHost({ canvas: document.createElement('canvas'), dprCap: 1, post: (r) => this.postStack(r) });
      const ext = CODECS[codec].ext;
      const base = (name || `${(this.sceneRef ?? 'scene').replace(/\.vrmxs$/, '').replace(/[^A-Za-z0-9_-]/g, '-')}-${size}${fps.replace('.', '')}`).replace(/\.(mp4|mov)$/, '');
      const sink = hashOnly ? hashSink() : shellSink({ call });
      const r = await exportTake({
        tree: world.tree, host: this.exportHost, fps: rate, frames, width, height, sink, audio,
        job: { codec, suggestedName: `${base}.${ext}`, hash, title: 'Export Video' },
        onProgress: (p) => { this.exporting = { ...p }; this.changed('export'); }, now: () => performance.now(),
      });
      const { frameHashes, ...rest } = r;
      this.lastExport = { ...rest, take, size, fpsLabel: fps, codec, frameHashes, hashOnly, hashesDigest: frameHashes ? digest(frameHashes) : null };
      return this.lastExport;
    } catch (err) { this.error = String(err?.message ?? err); throw err; }
    finally {
      // a fresh renderer per export: the take's world goes, and its GPU resources with it
      if (this.exportHost) { this.exportHost.dispose(); this.exportHost.renderer.forceContextLoss?.(); this.exportHost = null; }
      world?.audio?.dispose();
      this.exporting = null; this.changed();
    }
  }

  /** The view as it is now (edit camera or the play camera) at a size, as a PNG. */
  async stillPNG(width, height) {
    if (!this.host.tree) throw new Error('nothing to draw');
    const still = captureStill(this.host, { width, height, alpha: this.host.last.alpha ?? 1 });
    if (this._w) this.host.resize(this._w, this._h); // the viewport's own size, exactly
    return encodePNG(still);
  }

  /** Save a still of the view: a save panel in the shell, a download in a browser. */
  async saveStill(size = '1080p') {
    const [w, h] = SIZES[size];
    const png = await this.stillPNG(w, h);
    const name = `${(this.sceneRef ?? 'scene').replace(/\.vrmxs$/, '')}-still.png`;
    if (inShell) this.lastStill = await call('file.save', { base64: toBase64(png), suggestedName: name, types: ['png'], title: 'Save Still' });
    else { download(png, name, 'image/png'); this.lastStill = { name, bytes: png.length }; }
    this.changed();
    return this.lastStill;
  }

  /** A 480×270 thumbnail of the view, into the project as thumbnails/<scene>.png. */
  async makeThumbnail() {
    const png = await this.stillPNG(480, 270);
    const ref = `thumbnails/${(this.sceneRef ?? 'scene').replace(/\.vrmxs$/, '').replace(/^.*\//, '')}.png`;
    if (this.project?.writable && inShell) this.lastStill = { ...(await this.project.writeBase64(ref, toBase64(png))), thumbnail: true };
    else { download(png, ref.replace('thumbnails/', ''), 'image/png'); this.lastStill = { path: ref, bytes: png.length, thumbnail: true }; }
    this.changed();
    return this.lastStill;
  }

  /** What the player can do now in the play world ("Take Short sword"), or null. */
  prompt() {
    const w = this.playWorld; if (!w?.interact) return null;
    const player = w.tree.all().find((n) => n.type === 'Character' && n.behaviours.some((b) => b.name === 'player'));
    const f = player && w.interact.prompts().find((p) => p.actor === player.id);
    if (!f) return null;
    const item = w.tree.find(f.item);
    return { key: 'E', text: `${f.prompt ?? f.verb} ${item?.name ?? f.item}` };
  }

  /** What is being said in the play world: the voice service's captions at this frame's blend. */
  captions() { return this.playWorld?.tree.services.get('voice')?.captions(this.host.last.alpha ?? 1) ?? []; }

  setDebug(kinds) { this.debug = { ...kinds }; this.host.debug.set(this.debug); }

  // ---------------------------------------------------------------- the timeline (M2 W5)

  /** What the timeline shows (plain data). */
  timeline() {
    const s = this.session;
    if (!s?.isSequence) return null;
    const seq = structuredClone(s.doc.sequence), set = this.setScene?.doc;
    const all = [...(set?.nodes ?? []), ...s.doc.nodes];
    return {
      seq, rows: rowsOf(seq), fps: seq.fps, duration: seq.duration, set: s.doc.set,
      cameras: all.filter((n) => n.type === 'VirtualCamera').map((n) => n.id),
      characters: all.filter((n) => n.type === 'Character').map((n) => n.id),
      nodes: all.map((n) => n.id),
      playhead: this.playhead, range: this.range ? [...this.range] : null, loop: this.loopRange, playing: this.previewPlaying,
      view: this.view, previewCamera: this.previewCamera, angles: this.angles, scrub: this.scrubState ? { ...this.scrubState } : null,
      building: !!this._previewBuilding, angleNames: this.angles ? this._angleCams.map((c) => c.name) : [],
    };
  }

  /** The preview world: the sequence as the runtimes play it, rebuilt when the document changes. */
  async previewWorld() {
    const hash = this.session.hash();
    if (this.preview?.hash === hash) return this.preview;
    if (this._previewBuilding?.hash === hash) return this._previewBuilding.promise;
    const promise = (async () => {
      this.changed('timeline');
      const t0 = performance.now();
      const world = await this.buildFrom(parse(this.session.text()), { play: true, heard: false });
      const old = this.preview; this.preview = { hash, world, player: new SequencePlayer(world.tree, { every: 120 }), buildMs: performance.now() - t0 };
      if (old && this.host.tree === old.world.tree) this.host.detach();
      return this.preview;
    })();
    this._previewBuilding = { hash, promise };
    try { return await promise; } finally { if (this._previewBuilding?.promise === promise) this._previewBuilding = null; this.changed('timeline'); }
  }

  /**
   * Show a frame of the sequence exactly as an export renders it: the preview world put on the frame's step from its
   * snapshots (SequencePlayer), then the render host's frameAt, which steps the last step and draws the blend at α.
   * Scrubs queue: while one runs, the latest asked-for frame waits and the ones in between are skipped.
   */
  scrubTo(frame) {
    const s = this.session;
    if (!s?.isSequence || s.mode !== 'editing') return Promise.resolve(null);
    this.playhead = Math.max(0, Math.min(s.doc.sequence.duration, frame));
    this._scrubWant = this.playhead;
    this._scrubbing ??= (async () => {
      try {
        while (this._scrubWant !== null) {
          const f = this._scrubWant; this._scrubWant = null;
          const p = await this.previewWorld();
          const { step, alpha } = p.world.sequence.stepOf(Math.floor(f));
          const t0 = performance.now();
          const r = await p.player.seekStep(Math.max(0, step - 1));
          if (this.host.tree !== p.world.tree) { this.host.attach(p.world.tree); this.host.debug.set(this.debug); }
          this.gizmo.detach(); this.box.visible = false;
          this.view = 'preview';
          this.host.camera = this.previewCamera === 'sequence' ? null : this.camera;
          await this.host.frameAt(step, alpha);
          this.scrubState = { frame: Math.floor(f), step, alpha: +alpha.toFixed(3), restored: r.restored, stepped: r.stepped + (step > r.step ? step - r.step : 0), ms: +(performance.now() - t0).toFixed(1), hash: hashValue(worldHashes(p.world.tree, { physicsBytes: true })) };
          this.drawAngles();
          this.changed('timeline');
        }
      } catch (err) { this.error = String(err?.stack ?? err); this.changed(); }
      finally { this._scrubbing = null; }
    })();
    return this._scrubbing;
  }

  schedulePreview() {
    clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => this.scrubTo(this.playhead), 150);
  }

  /**
   * A VirtualCamera where the editor's view is, looking the same way with the same field of view (fixed body, no aim):
   * frame a shot by flying the view there, then press. One undo step. → its id
   */
  cameraFromView() {
    const s = this.session, ids = new Set([...s.doc.nodes.map((n) => n.id), ...(this.setScene?.doc.nodes.map((n) => n.id) ?? [])]);
    let id = 'shot-cam'; for (let i = 2; ids.has(id); i++) id = `shot-cam-${i}`;
    const r = (v) => Math.round(v * 1e4) / 1e4, c = this.camera;
    const focalLength = r(12 / Math.tan((c.fov * Math.PI) / 360));
    const node = { id, type: 'VirtualCamera', name: 'Camera from view', transform: { p: c.position.toArray().map(r), q: c.quaternion.toArray().map(r) }, props: { body: { type: 'fixed' }, aim: { type: 'none' }, lens: { focalLength } } };
    s.run(`Add ${id} from the view`, [{ op: 'add', node }]);
    s.select(id);
    return id;
  }

  /** Back to the edit view (the gizmo, the editor's camera). */
  editView() {
    this.previewPlaying = false;
    if (this.view === 'edit') return;
    this.view = 'edit';
    this.host.camera = this.camera;
    if (this.edit) { this.host.attach(this.edit.tree); this.host.debug.set(this.debug); }
    this.attachGizmo();
    this.changed();
  }

  /** Play the preview from the playhead in real time, through the range (looping if set). */
  playPreview(on = !this.previewPlaying) {
    if (on) {
      const [a, b] = this.range ?? [0, this.session.doc.sequence.duration];
      if (this.playhead >= b - 1 || this.playhead < a) this.playhead = a;
    }
    this._playClock = null;
    this.previewPlaying = on;
    if (on) this.scrubTo(this.playhead);
    this.changed('timeline');
  }

  /** Real-time preview play: the playhead follows the wall clock from where play began; frames the scrub can't keep up with are skipped. */
  advancePreview() {
    const seq = this.session?.doc.sequence;
    if (!seq) { this.previewPlaying = false; return; }
    const [a, b] = this.range ?? [0, seq.duration], now = performance.now();
    this._playClock ??= { t: now, f: this.playhead };
    let f = this._playClock.f + ((now - this._playClock.t) / 1000) * seq.fps;
    if (f >= b) {
      if (this.loopRange) { f = a; this._playClock = { t: now, f: a }; } else { f = b - 1; this.previewPlaying = false; this._playClock = null; }
    }
    if (this._scrubbing) { this._scrubWant = Math.floor(f); this.playhead = f; return; } // the running scrub takes the newest frame
    if (Math.floor(f) !== Math.floor(this.playhead) || !this.scrubState) this.scrubTo(f); else this.playhead = f;
  }

  setRange(which) {
    const seq = this.session?.doc.sequence; if (!seq) return;
    const r = this.range ?? [0, seq.duration], f = Math.round(this.playhead);
    if (which === 'in') this.range = [Math.min(f, r[1] - 1), r[1]];
    else if (which === 'out') this.range = [r[0], Math.max(f + 1, r[0] + 1)];
    else this.range = null;
    this.changed('timeline');
  }

  setPreviewCamera(mode) {
    this.previewCamera = mode;
    if (this.view === 'preview') { this.host.camera = mode === 'sequence' ? null : this.camera; this.host.render(this.host.last.alpha ?? 1, false); this.drawAngles(); }
    this.changed('timeline');
  }

  setAngles(on) { this.angles = on; if (this.view === 'preview') { this.host.render(this.host.last.alpha ?? 1, false); this.drawAngles(); } this.changed('timeline'); }

  /** Multi-angle view (W3 viewports): the shot being shown, then every VirtualCamera of the sequence, in a grid. */
  drawAngles() {
    if (!this.angles || this.view !== 'preview' || !this.preview) return;
    const tree = this.preview.world.tree, cams = tree.services.get('cameras');
    const vcams = cams?.virtual ?? [];
    while (this._angleCams.length < vcams.length) this._angleCams.push(new PerspectiveCamera(40, 16 / 9, 0.05, 200));
    const views = [{ camera: this.host.camera ?? cams?.current?.camera ?? this.camera }];
    vcams.forEach((v, i) => {
      const c = this._angleCams[i], pose = v.pose;
      if (!pose) return;
      c.position.copy(pose.p); c.quaternion.copy(pose.q);
      c.fov = (2 * Math.atan(12 / (pose.focalLength || 35)) * 180) / Math.PI; c.updateProjectionMatrix(); c.updateMatrixWorld();
      c.name = v.id;
      views.push({ camera: c });
    });
    this._angleCams.length = Math.max(0, views.length - 1);
    const layout = gridLayout(views.length);
    this.host.renderer.setScissorTest(false); this.host.renderer.clear(); // cells the grid leaves empty show nothing
    renderViews(this.host.renderer, this.host.scene, views.map((v, i) => ({ ...v, ...layout[i] })));
  }

  // ---------------------------------------------------------------- the frame loop

  loop() {
    const tick = (t) => {
      requestAnimationFrame(tick);
      const tree = this.host.tree;
      if (!tree) return;
      const dt = this._last === null ? 0 : Math.min(0.25, (t - this._last) / 1000);
      if (this._last !== null) this._frames.push(t - this._last);
      this._last = t;
      const r = this.canvas.getBoundingClientRect();
      if (r.width && (this._w !== r.width || this._h !== r.height)) { this._w = r.width; this._h = r.height; this.host.resize(r.width, r.height); }
      try {
        if (this.session?.mode === 'playing' && this.playWorld && this.paused) { this.host.render(1, false); this.stats.step = tree.clock.step; }
        else if (this.session?.mode === 'playing' && this.playWorld) {
          this.host.frame(dt); this.stats.step = tree.clock.step;
          if (tree.services.get('voice')?.lines.size && this._frames.length % 6 === 0) this.changed('captions'); // word by word
          const pr = this.prompt(), key = pr?.text ?? null;
          if (key !== this._promptKey) { this._promptKey = key; this.changed('captions'); }
        }
        else if (this.view === 'preview') {
          if (this.fly) this.fly.update(dt); else this.orbit.update(dt);
          if (this.previewPlaying) this.advancePreview();
          else if (!this._scrubbing && this.host.tree === this.preview?.world.tree) { this.host.render(this.host.last.alpha ?? 1, false); this.drawAngles(); }
        }
        else { if (this.fly) this.fly.update(dt); else this.orbit.update(dt); if (this.box.visible) this.box.update(); this.host.render(1, false); }
        this.stats.renderMs = this.host.last.renderMs;
      } catch (err) { this.error = String(err?.stack ?? err); if (this.session?.mode === 'playing') this.stop(); console.error(err); }
      if (this._frames.length >= 20) {
        this.stats.frameMs = this._frames.reduce((a, b) => a + b, 0) / this._frames.length; this.stats.fps = 1000 / this.stats.frameMs;
        this._frames = [];
        this.changed('stats');
      }
    };
    requestAnimationFrame(tick);
  }
}
