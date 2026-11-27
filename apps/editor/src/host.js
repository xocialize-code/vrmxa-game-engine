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
import { RenderHost, backendFromQuery } from '@vrmxg/render';
import { particleRenderers } from '@vrmxg/particles';
import { renderViews, gridLayout } from '@vrmxg/post';
import { composeSequence, isSequence, SequencePlayer, subtitles } from '@vrmxg/sequence';
import { ShellStore, IndexedDBStore } from '@vrmxg/save';
import { m0Registry } from '@vrmxg/registry/m0';
import { declareProjectBehaviours } from '@vrmxg/registry';
import { parse, describeType, serialize, overridesText, prefabNodes } from '@vrmxg/scene';
import { makeTake, isTake, takeToSequence, installDirector, demoModel, httpModel } from '@vrmxg/director';
import { shellTTS, httpTTS } from '@vrmxg/voice';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { EditorSession, newSequenceDoc, rowsOf, referencesElsewhere } from '@vrmxg/editor-core';
import { inspectorFields, sharedFields, sharedAxes, assetEntries, layerField, wiringView, nodeAfter } from '@vrmxg/editor-ui';
import { AudioOutput } from '@vrmxg/audio';
import { exportTake, shellSink, hashSink, hashFrame, readbackFor, captureStill, encodePNG, toBase64, SIZES, RATES, CODECS, framesFor, secondsOf } from '@vrmxg/export';
import { inShell, call, on as onShell } from '../../shell/js/shell.js';
import * as vrmxaMain from '@vrmxa-core/index.js';
import * as vrmxaAnim from '@vrmxa-core/anim/index.js';
import * as closet from '@vrmxa-core/closet/index.js';
import { buildWorld } from '../../playground/src/world.js';
import { disposeWorld, disposed } from './dispose.js';
import { saveScene } from './saving.js';
import { RetiredWorlds } from './worlds.js';
import { exportGame } from './export-game.js';
import { HotReload, freshBehaviours, moduleSources, sameSources, reloadedTake, assertReplayable } from './reload.js';
import { ViewportAids } from './viewport/viewport.js';
import { ThumbnailQueue } from './thumbs.js';
import { drawThumbnail } from './thumbs-draw.js';
import { unknownLayers, gameLayers, layersUsed } from '@vrmxg/bundle';
import '../../playground/src/sqljs.js'; // vrmxa-core's sql.js for bundles with a database (Mira's)

installPortableMath(); // before anything parses a VRM or steps a world
CameraControls.install({ THREE: { Vector2, Vector3, Vector4, Quaternion, Matrix4, Spherical, Box3, Sphere, Raycaster } });
const vrmxaCore = { ...vrmxaMain, ...vrmxaAnim };
const registry = m0Registry();
const SNAP = { translate: 0.25, rotate: 15, scale: 0.1 };
/** Node types the Add menu offers (no asset needed). */
// M5 W4: the game nodes too, whose lists and conditions the inspector now edits
export const ADDABLE = ['Node3D', 'DirectionalLight', 'PointLight', 'SpotLight', 'Environment', 'Camera', 'VirtualCamera', 'CameraBrain', 'Path3D', 'ParticleEmitter', 'Collider', 'RigidBody', 'Area', 'Marker', 'AnimationPlayer', 'GameRules', 'GameCounter', 'GameTimer', 'GameGoal', 'Checkpoint', 'Dialogue'].filter((t) => registry.get(t) && !registry.get(t).abstract && !registry.get(t).asset?.required);

/** A short digest of a list of frame hashes: two exports with the same digest have the same frames. */
function digest(list) { return hashValue(list.join(',')); }
/** A rotation in Euler degrees (Y, then X, then Z) as a quaternion's [x, y, z, w]. */
const quatFromDeg = (r) => new Quaternion().setFromEuler(new Euler((r[0] * Math.PI) / 180, (r[1] * Math.PI) / 180, (r[2] * Math.PI) / 180, 'YXZ')).toArray();

function download(bytes, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export { SIZES, RATES, CODECS, secondsOf };

export class EditorHost {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ backend?: 'webgpu' | 'webgl' | 'auto' }} [o] the renderer (M4 W3): by default `?renderer=webgpu|webgl|auto`,
   *   else auto (WebGPU where the page has it, else WebGL)
   */
  constructor(canvas, { backend = backendFromQuery(location.search) } = {}) {
    this.canvas = canvas;
    /** The render host, made asynchronously (a WebGPURenderer needs `await init()`); openProject waits for it. */
    this.host = null;
    this.camera = new PerspectiveCamera(50, 16 / 9, 0.05, 500);
    this.camera.position.set(9, 7, 14);
    this.cameraMode = 'orbit';
    // camera-controls (yomotsu, MIT; M2 W5): orbit, dolly to the cursor and truck, with smooth transitions
    this.orbit = new CameraControls(this.camera, canvas);
    this.orbit.dollyToCursor = true;
    this.orbit.setLookAt(9, 7, 14, 0, 1, 0, false);
    this.fly = null;
    this.gizmo = new TransformControls(this.camera, canvas);
    this.gizmo.setTranslationSnap(SNAP.translate); this.gizmo.setRotationSnap((SNAP.rotate * Math.PI) / 180); this.gizmo.setScaleSnap(SNAP.scale);
    this.snap = true;
    this.gizmo.addEventListener('dragging-changed', (e) => { this.orbit.enabled = !e.value && this.cameraMode === 'orbit'; if (!e.value) this.commitGizmo(); });
    this.box = new BoxHelper(undefined, 0x2f8cff); this.box.visible = false;
    this.box.material.depthTest = false; // drawn over the frame with the other aids
    // the edit view's aids (M5 W5, viewport/): outline, shape handles, camera preview, view cube, rectangle select; the gizmo
    // and the selection box are drawn in its overlay scene too, after the frame, never in the host's scene
    this.aids = new ViewportAids(this);
    this.aids.scene.add(this.gizmo.getHelper(), this.box);
    /** The last nodes copied (a clip, @vrmxg/editor-core): it outlives the scene, so nodes paste into another. */ this.clipboard = null;
    this.ray = new Raycaster();
    this.registry = registry;
    this.project = null; this.sceneRef = null; this.session = null;
    this.edit = null;          // { tree, objects: Map<Object3D, nodeId>, shape }
    this.editWorld = null;     // the world this.edit was made from, kept until its replacement is shown, then retired
    this.playWorld = null;
    this.worlds = new RetiredWorlds({ showing: () => this.host?.tree ?? null }); // worlds let go of (AB-T-0592, worlds.js)
    this.devices = null;
    this.debug = { colliders: false, sensors: false, capsules: false, rays: false };
    this.stats = { frameMs: 0, fps: 0, renderMs: 0, step: 0, buildMs: 0, backend: '', display: '' };
    /** The error a frame left while the view's device was lost (M6 W6): cleared when the view is back, if still shown. */
    this._lossError = /** @type {string | null} */ (null);
    this._built = 0;           // worlds built (AB-T-0592): the status shows how many are still alive
    this.error = '';
    this.behaviourProblems = []; // what the open project's behaviours module got wrong (M6 W0): shown, never fatal
    /**
     * The project's behaviours, when they are wrong (M6 W0, W2; AB-T-0654 item 5): a declaration refused when the project
     * opened, or a hot reload that threw (the old code still running). A field of its own, shown until a load or reload
     * takes: a build finishing or another error never clears it.
     */
    this.behaviourError = '';
    /** Hot reload while playing (M6 W2, reload.js): { watching, n, last, failed, off } or null; `hot` is the watcher. */
    this.reloadState = null; this.hot = null;
    /** The text of the behaviours module graph the editor's classes came from (M6 W2: compared before Play, watched in it). */
    this.behaviourSources = null;
    this.onChange = null;
    this.busy = 0;
    this._gen = 0; this._frames = []; this._last = null; this._rebuildTimer = null;
    this._downAt = null;
    this.lastTake = null;      // the last Play: { scene, doc, input, steps }
    this.paused = false;       // play paused (MCP): the frame loop draws but doesn't step; not the clock's own pause, which freezes pausable nodes
    this.exporting = null;     // { n, frames, phase } while an export runs
    this.lastExport = null; this.lastStill = null;
    this.gameExporting = null; // { n, total, phase } while Export Game runs (M5 W0)
    this._gameExport = null;   // its AbortController and a promise of its end, while it runs
    this.lastGameExport = null;
    this.exportHost = null;
    // the timeline (M2 W5): the set a sequence films, the playhead, the play range, the preview world
    this.setScene = null;      // { ref, doc } for a sequence document
    this.view = 'edit';        // 'edit': the document's edit view; 'preview': the sequence played to the playhead
    this.playhead = 0; this.range = null; this.loopRange = true; this.previewPlaying = false;
    this.previewCamera = 'sequence'; this.angles = false; this.preview = null; this.scrubState = null;
    /** A world the frame loop plays in real time while set: { world, tick } (the creator's takes; null otherwise). */ this.live = null;
    // the assets panel's thumbnails (M5 W6, AB-T-0606): drawn on an offline host of their own, one at a time, cached in the
    // shell's cache folder by path, size and modification time (only for a project folder, whose files have those)
    this.vrmxaCore = vrmxaCore;
    this._assetThumbHost = null; this._assetThumbCache = false;
    this.assetThumbs = new ThumbnailQueue({
      size: 96, toBase64, draw: (e, size) => drawThumbnail(this, e, size), onChange: () => this.changed('assetThumbs'),
      onRelease: () => this.dropAssetThumbHost(),
      store: { get: (key) => (this._assetThumbCache ? call('cache.read', { key }).then((r) => r?.base64 ?? null) : Promise.resolve(null)), put: (key, base64) => (this._assetThumbCache ? call('cache.write', { key, base64 }) : Promise.resolve()) },
    });
    this._scrubWant = null; this._scrubbing = null; this._previewBuilding = null; this._previewTimer = null; this._angleCams = [];
    canvas.addEventListener('pointerdown', (e) => { this._downAt = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', (e) => this.onClick(e));
    this.ready = this._makeHost(backend);
    this.loop();
  }

  /** The view's render host on the chosen backend, with the edit camera (the gizmo and the selection box are the aids' overlay's). */
  async _makeHost(backend) {
    const host = await RenderHost.create({ canvas: this.canvas, backend, preserveDrawingBuffer: true, post: this.postOptions() });
    // worlds come from buildWorld, which installs particles: the renderer is in before any world attaches (AB-A-0335),
    // so attaching never holds steps and a preview's first frame after a restore draws its steam
    await host.loadParticleRenderer(particleRenderers);
    host.camera = this.camera;
    this._adoptHost(host);
    host.onLost = (lost) => this._hostLost(lost);
    return host;
  }

  /** Draw through this host (the view's first, or one made in place of a lost one, which keeps its camera: the scene's in Play). */
  _adoptHost(host) {
    host.debug.set(this.debug);
    this.host = host;
    this.stats.backend = host.backend; this.stats.display = '';
    this._w = this._h = null; // sized again on the next frame
    this.changed();
    return host;
  }

  /**
   * The view's GPU device was lost (M6 W6, AB-T-0639; WebKit kills its GPU process when a Metal command buffer fails).
   * Nothing draws or steps meanwhile (the frame loop skips a lost host), and a host is made in its place on the same
   * canvas (the orbit and fly controls, the gizmos and the aids listen on it) and backend, with whatever world it showed:
   * Play goes on from the step it was on. A WebGPU canvas can't take WebGL, so when WebGPU can't be had again the
   * editor says to save and reopen the window (the game app moves to a fresh canvas and WebGL instead). A lost WebGL
   * context comes back on the same canvas only once the browser restores it (`webglcontextrestored`, waited for up to
   * 15 s): until then the context stays lost and nothing can draw on that canvas. An error the lost frame left (the aids
   * drawing on the dead renderer) is cleared once the view is back. The new host's onLost is set after it is adopted:
   * set on a host already lost meanwhile, it is called at once, so a loss during recovery recovers again. An export or a
   * thumbnail drawing on its own offline host when the GPU goes fails with its own error.
   */
  async _hostLost(lost) {
    const old = this.host;
    if (this._replacingHost || !old) return;
    this._replacingHost = true;
    this.stats.display = 'restarting (the GPU was lost)'; this.changed();
    console.warn(`[editor] the view's device was lost (${lost.api}: ${lost.reason ?? 'no reason'}: ${lost.message}); restarting it`);
    let host = null;
    try {
      if (old.backend === 'webgl') await this._contextRestored(15000);
      host = this._adoptHost(await RenderHost.replace(old, { canvas: this.canvas, backends: [old.backend === 'webgl' ? 'webgl' : 'webgpu'] }));
      if (this._lossError !== null && this.error === this._lossError) this.error = ''; // only what a lost frame threw, nothing else
      this._lossError = null;
    } catch (e) {
      this.stats.display = 'lost';
      this.error = `The GPU was lost and the view couldn't be restarted (${e?.message ?? e}). Save, then close the window and open it again.`;
      console.error(e);
    } finally {
      this._replacingHost = false;
      this.changed();
    }
    if (host && this.host === host) host.onLost = (l) => this._hostLost(l); // after: a loss meanwhile is said now
  }

  /** Resolves when the view's canvas has its WebGL context back (the browser restores a lost one, or a check does). */
  _contextRestored(ms) {
    const gl = this.canvas.getContext('webgl2') ?? this.canvas.getContext('webgl');
    if (gl && !gl.isContextLost()) return Promise.resolve();
    return new Promise((ok, fail) => {
      const done = () => { clearTimeout(t); this.canvas.removeEventListener('webglcontextrestored', done); ok(); };
      const t = setTimeout(() => { this.canvas.removeEventListener('webglcontextrestored', done); fail(new Error(`the WebGL context wasn't restored in ${ms / 1000} s`)); }, ms);
      this.canvas.addEventListener('webglcontextrestored', done);
    });
  }

  /** The post stack's options (M2 W3, M4 W1): the backend's own stack, LUTs read from the open project. */
  postOptions() { return { loadCube: (file) => this.project.text(file) }; }

  /** An offline host on the view's backend, or the one named (exports, checks): its own canvas, pixel ratio 1. */
  async offlineHost(backend = null) {
    const host = await RenderHost.create({ canvas: document.createElement('canvas'), backend: backend ?? this.host.backend, dprCap: 1, post: this.postOptions() });
    await host.loadParticleRenderer(particleRenderers); // before any world attaches, as the view's host (AB-A-0335)
    return host;
  }

  /** Tell the UI: 'stats' for the readouts only (every few frames), anything else for the panels. */
  changed(kind = 'all') { this.onChange?.(kind); }

  /**
   * Let a world go (AB-T-0592, worlds.js): disposed at once, or, while the view still shows it or a scrub is working
   * on it, by the frame loop as soon as it is free. Whatever builds a world owes it this.
   */
  retire(world) { this.worlds.retire(world); }

  /** Dispose the retired worlds nothing uses any more. */
  sweep() { this.worlds.sweep(); }

  /** The timeline's preview world goes (a new session, a new document for it). */
  dropPreview() { const p = this.preview; this.preview = null; if (p) this.retire(p.world); }

  // ---------------------------------------------------------------- project and scene

  async openProject(project, sceneRef) {
    await this.ready;
    // the project's own behaviours declare themselves beside the engine's (M6 W0), before a session validates with them.
    // A module that won't load or declarations the registry refuses don't keep the project closed: they are shown as a
    // problem, the project's scenes open without them (a scene using one validates with a warning), and an earlier
    // project's declarations go
    await this.declareBehaviours(project);
    this.project = project;
    try { this.gameLayers = gameLayers(await project.gameSetup?.() ?? null); } catch { this.gameLayers = ['default']; } // the inspector's layer menus (M6 W1)
    this.R ??= await loadRapier();
    const scene = sceneRef ?? project.scenes().find((s) => !s.startsWith('prefabs/')) ?? null;
    if (scene) await this.openScene(scene); else await this.newScene();
  }

  /** Declare a project's behaviours module into the editor's registry, keeping what went wrong as a problem (openProject). */
  async declareBehaviours(project) {
    this.behaviourProblems = []; this.behaviourError = '';
    try { declareProjectBehaviours(registry, await project.behaviours()); } catch (err) {
      registry.project(new Map());
      this.behaviourProblems = [String(err?.message ?? err)];
      this.behaviourError = `The project's behaviours: ${this.behaviourProblems[0]}`;
    }
    this.behaviourSources = project.behavioursModule?.sources ?? null; // the text those classes came from (M6 W2: what hot reload compares with)
  }

  /**
   * game.json's behaviours module changed (Project Settings › Behaviours, MCP's game op=settings; M6 W9): forget the
   * module read when the project opened and read the one game.json names now, so the inspector, Play and Export Game
   * all use the module the build will. A module added to the folder since the project opened isn't in its file list
   * until the project is opened again (AB-T-0670). → { module, declared, problems? }
   */
  async reloadBehaviours() {
    const p = this.project;
    if (!p) return null;
    p.forgetBehaviours();
    await this.declareBehaviours(p);
    this.changed();
    const declared = [...registry.behaviours.values()].filter((b) => b.source === 'project').map((b) => b.name);
    return { module: p.behavioursModule?.ref ?? null, declared, ...(this.behaviourProblems.length ? { problems: [...this.behaviourProblems] } : {}) };
  }

  /**
   * The project's behaviours as a world is built with them. When their declarations were refused (openProject), each
   * class is handed over as a bare subclass, which has no describe of its own: the world declares none of them, as
   * the editor's registry doesn't, and runs them as code only instead of refusing to build. A module that wouldn't load
   * gives none.
   */
  async worldBehaviours(p) {
    if (!this.behaviourProblems.length) return p.behaviours();
    let map;
    try { map = await p.behaviours(); } catch { return new Map(); }
    if (this._bareFor?.map !== map) this._bareFor = { map, bare: new Map([...map].map(([n, C]) => [n, class extends C {}])) };
    return this._bareFor.bare;
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

  /**
   * A new scene that starts as a copy of `from` (M6 W8: MCP's `game op=open` with `from`, a new level from an old one):
   * `from` as it is saved, with its id made the new file's, open as `ref` and unsaved until Save writes it.
   */
  async copyScene(from, ref) {
    if (this.session?.mode === 'playing') this.stop();
    this.busy++; this.changed();
    try {
      const doc = { ...parse(await this.project.text(from)), id: ref.replace(/\.vrmxs$/, '').replace(/[^A-Za-z0-9_-]/g, '-') }; // as newScene names one
      await this.loadSet(doc);
      const prefabs = await this.project.prefabs(this.setScene ? composeSequence(doc, this.setScene.doc) : doc);
      this.session = new EditorSession({ registry, doc, prefabs, path: ref });
      this.session.savedText = ''; // not on disk yet
      this.adoptSession();
      this.sceneRef = ref;
      this.session.on((e) => this.onSession(e));
      this.edit = null;
      await this.rebuild();
      this.frameAll();
    } finally { this.busy--; this.changed(); }
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
    this.dropPreview(); this.scrubState = null; this.previewPlaying = false; this.playhead = 0; this.range = null; this.view = 'edit';
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
    const { text } = await saveScene(this.session, this.project, ref); // saved only once it is written (saving.js)
    if (this._assetThumbsWanted) this.startAssetThumbs().catch(() => {}); // a saved prefab (an Apply) draws again: its mtime moved
    return this.sceneSaved(ref, text);
  }

  /** The scene's text is on disk as `ref` (the session already marked saved): what the status shows. → { ref, hash, bytes } */
  sceneSaved(ref, text) {
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
    // pv: an Apply (or its undo) changed a prefab document, which every instance of it shows (M5 W6)
    return JSON.stringify({ a: doc.assets, c: doc.connections, s: doc.settings, q: doc.sequence, n: doc.nodes.map(({ transform, ...rest }) => rest), pv: this.session?.prefabVersion ?? 0 });
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
    // a newer edit started another build, or Play began meanwhile: this world is never shown
    if (gen !== this._gen || this.session.mode === 'playing') { this.retire(world); return; }
    const old = this.editWorld;
    this.editWorld = world;
    this.edit = { tree: world.tree, objects: this.objectMap(world.tree), shape: this.shapeOf(doc), personas: world.personas ?? null };
    if (this.view === 'edit') { this.host.attach(world.tree); this.host.debug.set(this.debug); }
    this.retire(old); // the edit view it replaces (still shown until here, so the view never goes blank)
    this.stats.buildMs = performance.now() - t0;
    this.error = '';
    this.attachGizmo();
    this.changed();
  }

  /**
   * A world from a document. The edit view (play false) is never stepped, so it skips the run-time closet and reuses
   * the project's read bundles and clips between rebuilds; Play builds the full world, as the game does. `cache: true`
   * lets a play world share those read bundles and clips too (they are never written to: the creator's thumbnails).
   * `mtoonMaterial`: the MToon class of the host that will draw the world (M4 W10: a WebGL export from a WebGPU view
   * needs WebGL's MToon; WebGL can't draw MToonNodeMaterial); the view's by default.
   */
  async buildFrom(doc, { play = false, heard = play, cache = !play, mtoonMaterial = this.host.mtoonMaterial, prefabs = this.session?.prefabs ?? new Map(), timed = true } = {}) {
    const p = this.project;
    if (this.cacheFor !== p) {
      // filled once per project; every build waits for the same fill (M5 W6: thumbnails build beside the edit view, and a
      // second build must not go on with the last project's caches while the first is still reading this one's)
      this.cacheFor = p; this.characterCache = { sources: new Map(), clips: new Map() };
      this._cacheFill = (async () => {
        const anim = await p.animations();
        // the project's app personas (M3 W1), when it has them: who each character is, for brains and directors
        const personas = p.files?.includes('personas.json') ? JSON.parse(await p.text('personas.json')) : null;
        if (this.cacheFor === p) { this.animCache = anim; this.personasCache = personas; }
      })().catch((e) => { if (this.cacheFor === p) this.cacheFor = null; throw e; }); // a failed read is tried again by the next build
    }
    await this._cacheFill;
    if (this.cacheFor !== p) throw new Error('the project changed while a world was being built');
    if (this.setScene && isSequence(doc)) doc = composeSequence(doc, this.setScene.doc); // a sequence plays in its set
    const sample = { scene: this.sceneRef, doc, prefabs, animations: this.animCache, bytes: (ref) => p.bytes(ref), personas: this.personasCache ?? null };
    const timings = {}; // a thumbnail's build (timed: false) leaves the status line's timings alone
    if (timed) this.buildTimings = timings;
    if (heard && !this.audio) this.audio = new AudioOutput(); // made on the first Play: that click is the gesture that lets it sound
    // the game's controls (Play only) and collision layers (every build: a collider's layer must be one of them), as its
    // game.json has them now (M6 W3: the project settings write it); none, the engine's defaults
    const setup = await p.gameSetup?.() ?? { actions: null, physics: null };
    // a node on a layer the game doesn't have (a typo in a collider's layer, a layer since removed) would stop the
    // world being built: Play refuses with a message naming it; the edit view still builds, with that layer added for
    // itself only, so the scene can be opened and fixed, and says what is wrong (review of PR #52)
    let physics = setup.physics;
    const stray = unknownLayers({ physics }, [[this.sceneRef ?? 'this scene', doc], ...prefabs]);
    const layerProblem = stray.length ? `${stray.slice(0, 3).map((u) => `${u.ref}: "${u.node}" is on layer "${u.layer}"`).join('; ')}${stray.length > 3 ? ` and ${stray.length - 3} more` : ''}, which the game doesn't have (${gameLayers({ physics }).join(', ')}): add the layer in Project Settings or change the node's layer` : '';
    if (timed) this.layerProblem = layerProblem; // the view's build, not a thumbnail's
    if (stray.length && play) throw new Error(`can't play: ${layerProblem}`);
    if (stray.length) {
      // room for every layer this scene names, the stray ones included, before the game's others: at most 15 (the 16th
      // group is ragdolls'), the game's first kept first (where a node with no layer is)
      const game = gameLayers({ physics }), named = layersUsed(doc).map((u) => u.layer);
      for (const [, pf] of prefabs) named.push(...layersUsed(pf).map((u) => u.layer));
      const layers = [...new Set([game[0], ...named, ...stray.map((u) => u.layer), ...game])].slice(0, 15);
      const collides = Object.fromEntries(Object.entries(physics?.collides ?? {}).filter(([k]) => layers.includes(k)).map(([k, v]) => [k, v.filter((x) => layers.includes(x))]));
      physics = { layers, ...(Object.keys(collides).length ? { collides } : {}) };
    }
    const world = await buildWorld(this.R, sample, { vrmxaCore, closet: play ? closet : null, behaviours: await this.worldBehaviours(p), timings, now: () => performance.now(), characterCache: cache ? this.characterCache : null, audioOutput: heard ? this.audio : null, mtoonMaterial, actions: play ? setup.actions : null, physics });
    this._built++;
    return world;
  }

  /**
   * What the app holds (AB-T-0592): the worlds alive (built and not yet disposed: the edit view, the preview, a play
   * or export world, and one being replaced) and the view renderer's geometries and textures. A count that keeps
   * climbing while the document is only edited is a leak.
   */
  memory() {
    const m = this.host?.renderer.info?.memory ?? {};
    return { worlds: this._built - disposed.worlds, built: this._built, geometries: m.geometries ?? 0, textures: m.textures ?? 0 };
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

  /** Turn one of the viewport's aids on or off: 'outline', 'handles' or 'preview' (M5 W5). */
  setAid(kind, on) { if (kind in this.aids.show) this.aids.show[kind] = !!on; this.changed(); }
  /** Box select on or off: a plain drag on the viewport draws the selection rectangle (⌘-drag always does). */
  setBoxSelect(on) { this.aids.boxSelect = !!on; this.changed(); }

  // ---------------------------------------------------------------- duplicate, copy, paste (M5 W5)

  /** Copy the selection (with subtrees): kept as the editor's clipboard and returned, for the system clipboard. → clip or null */
  copy() { const clip = this.session?.copy() ?? null; if (clip) { this.clipboard = clip; this.changed(); } return clip; }
  /** Paste a clip (the editor's clipboard by default): fresh ids, one undo step. → the new roots' ids */
  paste(clip = this.clipboard) { if (!clip) throw new Error('nothing to paste: copy nodes first'); return this.session.paste(clip); }
  /** Duplicate the selection in place: fresh ids, one undo step. → the copies' ids */
  duplicate() { return this.session.duplicate(); }
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
    const inner = this.session.node(id) ? null : this.session.innerNode(id); // a prefab instance's inner node: its override (M5 W6)
    const n = inner ? inner.node : this.session.node(id), t = n.transform ?? {};
    const p = o.position.toArray(), q = o.quaternion.toArray(), s = o.scale.toArray();
    const differs = (a, b, d) => a.some((v, i) => Math.abs(v - (b ?? d)[i]) > 1e-7);
    const change = {};
    if (differs(p, t.p, [0, 0, 0])) change.p = p;
    if (differs(q, t.q, [0, 0, 0, 1])) change.q = q;
    if (differs(s, t.s, [1, 1, 1])) change.s = s;
    if (!Object.keys(change).length) return;
    if (inner) this.setInnerTransform(id, change);
    else this.session.setTransform(id, change);
  }

  /** Transform parts of an inner node (a gizmo drag), as its instance's overrides: one undo step. */
  setInnerTransform(id, change) {
    const r = (v) => v.map((x) => Math.round(x * 1e6) / 1e6);
    this.session.setOverrides(id, Object.fromEntries(Object.entries(change).map(([k, v]) => [`transform.${k}`, r(v)])), `${Object.keys(change).length > 1 ? 'Transform' : { p: 'Move', q: 'Rotate', s: 'Scale' }[Object.keys(change)[0]]} ${id}`);
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
  async addAsset(ref, clientX, clientY) {
    // the first thing in an empty scene goes at the origin (a set); later ones where the view looks
    const empty = this.session.doc.nodes.every((n) => n.parent === undefined);
    const at = clientX !== undefined ? this.dropPoint(clientX, clientY) : empty ? [0, 0, 0] : this.lookPoint();
    const snapped = this.snap ? at.map((v) => Math.round(v / SNAP.translate) * SNAP.translate) : at;
    await this.loadPrefab(ref);
    return this.session.addFromAsset(ref, { at: snapped });
  }

  /**
   * A prefab the scene doesn't use yet, read into the session's prefabs (and the prefabs it places) before an instance of
   * it is made (M5 W6): the session refuses one it hasn't loaded, as the edit view couldn't build it.
   */
  async loadPrefab(ref) {
    if (!ref.endsWith('.vrmxs') || this.session.prefabs.has(ref) || !this.project?.has(ref)) return;
    await this.project.prefabs({ assets: [{ type: 'vrmxs', ref }] }, this.session.prefabs);
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

  /**
   * The selection as the inspector shows it (plain data). One node: its fields (M5 W4: generated from the registry by
   * @vrmxg/editor-ui's inspectorFields, with their conditions). Several (AB-T-0601): the props their types share, mixed
   * where they differ, and each transform axis its common value or null.
   */
  inspect() {
    const s = this.session;
    const inner = s?.primary ? s.innerNode(s.primary) : null;
    if (inner) return this.inspectInner(inner); // an inner node of a prefab instance: alone, its fields as overrides (M5 W6)
    const nodes = (s?.selection ?? []).map((id) => s.node(id)).filter(Boolean);
    if (!nodes.length) return null;
    const n = nodes.at(-1); // the primary
    const d = describeType(registry, n.type);
    const props = sharedFields([n, ...nodes.filter((x) => x !== n)].map((x) => inspectorFields(x === n ? d : describeType(registry, x.type), x))) // the primary's order, ranges and value first
      .map((f) => layerField(f, this.gameLayers ?? ['default'])); // a collision layer: the game's layers (M6 W1)
    const drag = this.session.gesture && this._dragEuler?.gesture === this.session.gesture ? this._dragEuler.by : null;
    const tr = nodes.map((x) => { const t = this.transformOf(x); return drag?.has(x.id) ? { ...t, r: drag.get(x.id) } : t; }); // a rotation drag shows its own angles
    const asset = n.asset ? s.doc.assets.find((a) => a.id === n.asset) : null;
    const types = [...new Set(nodes.map((x) => x.type))];
    return {
      id: n.id, ids: nodes.map((x) => x.id), multi: nodes.length > 1, type: n.type, types,
      name: n.name ?? '', parent: n.parent ?? null, description: types.length === 1 ? d.description : '', asset: asset && nodes.length === 1 ? `${asset.ref} (${asset.type})` : null,
      p: sharedAxes(tr.map((t) => t.p)), r: sharedAxes(tr.map((t) => t.r)), s: sharedAxes(tr.map((t) => t.s)), props,
      behaviours: nodes.length === 1 ? (n.behaviours ?? []).map((b) => b.use) : [], nodes: s.doc.nodes.map((x) => x.id),
      // M6 W1 (AB-T-0638): one node's behaviours and connections, and the node it comes before in the document's order
      wiring: nodes.length === 1 ? wiringView(registry, s.doc, n.id, { nodeOf: (r) => s.endNode(r) }) : null, before: nodes.length === 1 ? nodeAfter(s.doc, n.id) : '',
      sameType: types.length === 1 ? s.doc.nodes.filter((x) => x.type === n.type).map((x) => x.id) : [],
      inner: null, ov: null, overrides: nodes.length === 1 && n.type === 'Instance' ? this.overridesView(n.id) : null,
      // the node's asset slot (M5 W6, AB-T-0606): what it names and the kinds of file it takes, for a drop from the assets panel
      assetSlot: nodes.length === 1 && registry.get(n.type)?.asset ? { ref: asset?.ref ?? null, types: [...registry.get(n.type).asset.types] } : null,
    };
  }

  /**
   * An inner node of a prefab instance as the inspector shows it (M5 W6, AB-T-0603): its values with the instance's
   * overrides applied, and on each field the instance overrides, the prefab's value (`ov`), for the mark and its Revert.
   */
  inspectInner(i) {
    const s = this.session, n = i.node, d = describeType(registry, n.type);
    const view = this.overridesView(i.instance);
    const mine = new Map(view.entries.filter((e) => e.target === i.target).map((e) => [e.field, e]));
    const props = sharedFields([inspectorFields(d, n)]).map((f) => ({ ...layerField(f, this.gameLayers ?? ['default']), ov: mine.get(`props.${f.key}`) ?? null }));
    const t = this.transformOf(n), b = this.transformOf(i.base);
    // a node reference inside a prefab names a node of that prefab: the options (and a paste's check) are its ids, not the scene's
    const at = i.target.includes('/') ? `${i.target.slice(0, i.target.lastIndexOf('/'))}/` : '';
    let local = [];
    try { local = [...prefabNodes(s.prefabOf(s.node(i.instance)), s.prefabs).keys()].filter((k) => k.startsWith(at) && !k.slice(at.length).includes('/')).map((k) => k.slice(at.length)); } catch { local = []; }
    const part = (field, v) => (mine.has(field) ? { ...mine.get(field), base: v.map((x) => +x.toFixed(3)).join(', ') } : null);
    return {
      id: i.id, ids: [i.id], multi: false, type: n.type, types: [n.type], name: n.name ?? '', parent: null, description: d.description, asset: null,
      p: t.p, r: t.r, s: t.s, props, behaviours: (n.behaviours ?? []).map((x) => x.use), nodes: local, sameType: [],
      inner: { instance: i.instance, target: i.target, ref: i.ref }, assetSlot: null,
      ov: { name: mine.get('name') ?? null, p: part('transform.p', b.p), r: part('transform.q', b.r), s: part('transform.s', b.s) },
      overrides: view,
    };
  }

  /**
   * An instance's overrides as the inspector's Overrides list (the diff view): each field's prefab value and the
   * instance's, as short text, and how many instances of the prefab this scene has.
   */
  overridesView(instanceId) {
    const o = this.session.overridesOf(instanceId);
    if (!o) return null;
    const show = (v) => { if (v === undefined) return '(none)'; const t = JSON.stringify(v); return t.length > 48 ? `${t.slice(0, 47)}…` : t; };
    const label = (f) => f.replace(/^props\./, '').replace(/^transform\.p$/, 'position').replace(/^transform\.q$/, 'rotation').replace(/^transform\.s$/, 'scale').replace(/^behaviours\./, 'behaviour ');
    return {
      id: instanceId, ref: o.ref, loaded: o.loaded, users: o.users.length, text: overridesText(o.entries, { instance: instanceId, ref: o.ref }),
      entries: o.entries.map((e) => ({ key: `${e.target} ${e.field}`, target: e.target, field: e.field, label: label(e.field), change: e.change, base: show(e.base), value: show(e.value), missing: e.missing, same: e.same })),
    };
  }

  /**
   * The project's other scenes that use prefab `ref` (directly, or through another prefab): what an Apply changes beyond
   * this scene. Reads the scenes' saved files. → their refs
   */
  async prefabScenes(ref) {
    const p = this.project, out = [];
    if (!p) return out;
    const uses = new Map(); // prefab ref → the prefabs it uses, read once
    const usesOf = async (r, depth = 0) => {
      if (uses.has(r) || depth > 16) return uses.get(r) ?? [];
      uses.set(r, []);
      try { const d = parse(await p.text(r)); uses.set(r, (d.assets ?? []).filter((a) => a.type === 'vrmxs').map((a) => a.ref)); } catch { /* unreadable: none */ }
      return uses.get(r);
    };
    const reaches = async (r, seen = new Set()) => {
      if (r === ref) return true;
      if (seen.has(r)) return false;
      seen.add(r);
      for (const x of await usesOf(r)) if (await reaches(x, seen)) return true;
      return false;
    };
    for (const sc of p.scenes()) {
      if (sc === this.sceneRef || sc === ref || sc.startsWith('prefabs/')) continue; // scenes, not other prefabs (they're reached through scenes)
      for (const x of await usesOf(sc)) if (await reaches(x)) { out.push(sc); break; }
    }
    return out;
  }

  /** Set a prop on the selection: on an inner node of an instance, as the instance's override. One undo step. */
  setPropOn(ids, key, value) {
    if (ids.length === 1 && this.session.innerNode(ids[0])) return this.session.setOverride(ids[0], `props.${key}`, value);
    return this.session.setPropOn(ids, key, value);
  }

  /**
   * Change a node's id (M6 W1): the session rewrites this scene's references, and refuses when another of the project's
   * files names the node (a sequence filming this scene, a scene placing it as a prefab), which it can't rewrite. The
   * project's scenes are read for that here, when an id is changed. One undo step. The project's file list is the one
   * the shell gave at open (and files the editor wrote since): a scene another process adds later isn't seen until the
   * project is opened again (the shell has no call that lists a project's files again).
   */
  async setNodeId(id, to) {
    const s = this.session, p = this.project, ref = this.sceneRef;
    const docs = new Map();
    if (p && ref) for (const f of p.files.filter((x) => x.endsWith('.vrmxs') && x !== ref)) { try { docs.set(f, parse(await p.text(f))); } catch { /* a file that doesn't parse names nothing */ } }
    s.elsewhere = referencesElsewhere(registry, ref ?? '', docs);
    try { return s.setNodeId(id, to); } finally { s.elsewhere = null; }
  }

  /** Rename a node; an inner node's name is an override. */
  renameNode(id, name) {
    if (this.session.innerNode(id)) return this.session.setOverride(id, 'name', name || undefined);
    return this.session.rename(id, name);
  }

  /**
   * Paste a transform (per-field paste, M5 W6, AB-T-0607): any of position, rotation in degrees and scale onto the
   * selection, one undo step; an inner node's as its instance's override.
   * @param {string[]} ids @param {{ p?: number[], r?: number[], s?: number[] }} t
   */
  pasteTransform(ids, t) {
    const part = (x) => ({ ...(x.p ? { p: [...x.p] } : {}), ...(x.r ? { q: quatFromDeg(x.r) } : {}), ...(x.s ? { s: [...x.s] } : {}) });
    if (ids.length === 1 && this.session.innerNode(ids[0])) return this.setInnerTransform(ids[0], part(t));
    this.session.setTransforms(ids.map((id) => ({ id, t: part(t) })), `Paste ${Object.keys(t).length === 3 ? 'transform' : { p: 'position', r: 'rotation', s: 'scale' }[Object.keys(t)[0]]} on ${ids.length === 1 ? ids[0] : `${ids.length} nodes`}`);
  }

  /** A file from the assets panel into the primary node's asset slot: one undo step (refused for the wrong kind). */
  async setNodeAsset(id, ref) { await this.loadPrefab(ref); return this.session.setNodeAsset(id, ref); }

  /** A node of the document, or an inner node of an instance as the instance has it. */
  nodeOf(id) { return this.session.node(id) ?? this.session.innerNode(id)?.node ?? null; }

  /** Set one axis of a vector prop (a collider's size) on several nodes, each keeping its other axes: one undo step. */
  setPropAxisOn(ids, key, axis, value) {
    if (ids.length === 1 && this.session.innerNode(ids[0])) { // an inner node: its override
      const n = this.nodeOf(ids[0]), p = registry.get(n.type)?.props[key];
      const v = [...(n.props?.[key] ?? p?.schema.default ?? new Array(p?.schema.minItems ?? 3).fill(0))];
      v[axis] = value;
      return this.session.setOverride(ids[0], `props.${key}`, v);
    }
    this.session.setPropEach(key, ids.map((id) => {
      const n = this.nodeOf(id), p = registry.get(n.type)?.props[key];
      const v = [...(n.props?.[key] ?? p?.schema.default ?? new Array(p?.schema.minItems ?? 3).fill(0))];
      v[axis] = value;
      return { id, value: v };
    }));
  }

  /** A node's transform as the inspector edits it: position, rotation in Euler degrees (YXZ), scale. */
  transformOf(n) {
    const t = n.transform ?? {};
    const e = new Euler().setFromQuaternion(new Quaternion().fromArray(t.q ?? [0, 0, 0, 1]), 'YXZ');
    const deg = (r) => Math.round((r * 180) / Math.PI * 1000) / 1000;
    return { p: t.p ?? [0, 0, 0], r: [deg(e.x), deg(e.y), deg(e.z)], s: t.s ?? [1, 1, 1] };
  }

  /** Set the primary selection's rotation from Euler degrees (Y, then X, then Z: yaw, pitch, roll). */
  setRotationDeg(id, r) {
    this.session.setTransform(id, { q: quatFromDeg(r) });
  }

  /**
   * Set one axis of a transform part ('p', 'r' in degrees, 's') on several nodes, each keeping its other axes: one undo
   * step ("Move 2 nodes"; one node: "Move mira", as before).
   */
  setAxisOn(ids, part, axis, value) {
    // During a drag, a rotation keeps the Euler angles the drag started from: read back from the quaternion each move,
    // they jump past 90° of X (30, 0 → -150, 180) and the node would flip.
    const g = this.session.gesture;
    if (g && this._dragEuler?.gesture !== g) this._dragEuler = { gesture: g, by: new Map() };
    const entries = ids.map((id) => {
      const t = this.transformOf(this.nodeOf(id));
      let v = [...t[part]];
      if (part === 'r' && g) { const by = this._dragEuler.by; if (!by.has(id)) by.set(id, v); v = [...by.get(id)]; v[axis] = value; by.set(id, v); }
      v[axis] = value;
      return { id, t: part === 'r' ? { q: quatFromDeg(v) } : { [part]: v } };
    });
    if (entries.length === 1 && this.session.innerNode(entries[0].id)) return this.setInnerTransform(entries[0].id, entries[0].t); // M5 W6
    this.session.setTransforms(entries);
  }

  /** The assets panel's entries (M5 W6: @vrmxg/editor-ui's assetEntries: category, folder, the node type a drop makes). */
  assets() { return this.project ? assetEntries(registry, this.project.files) : []; }

  /**
   * Draw the assets panel's thumbnails for the open project, in the background (the editor's window starts it; the
   * creator, which extends this host, doesn't). Files with something to show: models, characters, items, prefabs, sounds.
   */
  async startAssetThumbs() {
    const p = this.project;
    if (!p) return;
    this._assetThumbsWanted = true; // the editor's window wants them: after an export or a save they start again
    if (this.exporting) return; // an export has the GPU: it starts them again when it ends
    const gen = this.assetThumbs.gen; // a release (an export starting) or a newer start while the files are read: this one stops
    const entries = this.assets().filter((e) => e.nodeType || e.kind === 'vrmxa');
    let stats = {};
    this._assetThumbCache = false;
    if (inShell && p.writable) { // a project folder: its files' size and modification time key the cache
      try { stats = (await call('project.stat', { paths: entries.map((e) => e.ref) })).stats ?? {}; this._assetThumbCache = true; } catch { stats = {}; }
    }
    if (p !== this.project || gen !== this.assetThumbs.gen || this.exporting) return;
    return this.assetThumbs.load(entries, stats, p.path ?? p.name); // cached per project, not only per path
  }

  /** The thumbnails' offline host (made on the first draw, let go by releaseAssetThumbs). */
  async assetThumbHost() { return (this._assetThumbHost ??= await this.offlineHost()); }
  dropAssetThumbHost() { const h = this._assetThumbHost; this._assetThumbHost = null; if (h) { h.dispose(); h.renderer.forceContextLoss?.(); } }
  /** Let the thumbnails' host go once its draw is done (before an export: a render doesn't share the GPU with it). */
  async releaseAssetThumbs() { await this.assetThumbs.release(); }

  // ---------------------------------------------------------------- play in place

  async play() {
    if (!this.session || this.session.mode !== 'editing') return;
    this.editView();
    this.gizmo.detach(); this.box.visible = false;
    this.editHash = this.edit ? hashValue(worldHashes(this.edit.tree)) : null;
    this.busy++; this.changed();
    try {
      this.audio?.ctx.resume?.();
      await this.freshenBehaviours(); // the behaviours module as it is now, if it changed since it was read (M6 W2)
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
      // a director in play (M3 W10): ?director=demo (scripted) or a chat URL (the loopback stand-in, &model=omni4); MCP's
      // brain op=talk / op=director reach it, and the frame loop pumps it
      this.playDirector = null;
      const dp = new URLSearchParams(globalThis.location?.search ?? '').get('director');
      if (dp) {
        const player = world.tree.all().find((n) => n.type === 'Character' && n.behaviourEntries?.some((b) => b.use === 'player'));
        const model = dp === 'demo' ? demoModel() : httpModel(dp, { model: new URLSearchParams(globalThis.location.search).get('model') ?? 'omni4', temperature: 0 });
        this.playDirector = installDirector(world.tree, { model, user: player?.id ?? null, userName: player?.name ?? null, persona: (id) => world.personas?.forDirector(id), memory: (id) => world.personas?.memoryOf(id) });
      }
      this.paused = false;
      this.host.camera = null; // the scene's camera
      this.orbit.enabled = false;
      this.host.attach(world.tree);
      this.host.debug.set(this.debug);
      const r = this.canvas.getBoundingClientRect(); this.host.resize(r.width, r.height);
      this._last = null;
      this.canvas.focus();
      this.startHotReload(world).catch((e) => console.warn('hot reload', e)); // M6 W2: the Mac app only
    } catch (err) { this.error = String(err?.stack ?? err); this.attachGizmo(); }
    finally { this.busy--; this.changed(); }
  }

  stop() {
    if (this.session?.mode !== 'playing') return null;
    this.paused = false;
    const world = this.playWorld;
    const steps = world?.tree.clock.step ?? 0;
    // a take is what was played: its input and (M3 W4) the ai log, everything injected (a director's requests and
    // decisions, MCP's), so it replays, exports and bakes with no model
    // (a take recorded across a hot reload carries its input's `reloaded`, M6 W2: it isn't replayed, exported or baked)
    if (world?.input.recording && steps > 0) {
      this.lastTake = { scene: this.sceneRef, doc: this.playDoc, input: structuredClone(world.input.recording), ai: world.ai?.record() ?? [], steps };
      // a recording started again during the play (MCP's input record) may not carry the mark: what this play reloaded does
      if (this.reloadState?.n && !reloadedTake(this.lastTake)) this.lastTake.input.reloaded = [{ ...this.reloadState.last }];
    }
    this.stopHotReload();
    const r = this.session.stopPlay(() => {
      world.audio?.dispose(); // silence what the play world was playing
      for (const d of Object.values(this.devices ?? {})) world.input.removeDevice?.(d);
      this.host.detach();
    });
    this.playWorld = null;
    this.host.camera = this.camera;
    this.orbit.enabled = this.cameraMode === 'orbit';
    if (this.edit) { this.host.attach(this.edit.tree); this.host.debug.set(this.debug); }
    this.retire(world); // the play world: its take is kept as input, not as a world
    const after = this.edit ? hashValue(worldHashes(this.edit.tree)) : null;
    this.lastStop = { ...r, viewSame: after === this.editHash };
    this.attachGizmo();
    this.changed();
    return this.lastStop;
  }

  // ---------------------------------------------------------------- hot reload (M6 W2, reload.js)

  /**
   * Before Play: when the behaviours module graph's text changed since the editor's classes were read (an edit made
   * while not playing), import it fresh, so the world is built with what is on disk. Declarations the registry refuses
   * keep the classes the editor had, and say why (behaviourError).
   */
  async freshenBehaviours() {
    const p = this.project, ref = p?.behavioursModule?.ref;
    // nothing known to compare with: only a module that failed when the project opened is tried again
    if (!ref || (!this.behaviourSources && !this.behaviourProblems.length)) return;
    const now = await moduleSources(p, ref);
    if (!now) return;
    if (sameSources(this.behaviourSources, now)) { // what runs is what is on disk (a failed edit put back)
      if (this._freshenFailed) { this._freshenFailed = false; this.behaviourError = ''; }
      return;
    }
    try {
      const { classes, sources } = await freshBehaviours(p)(ref);
      declareProjectBehaviours(registry, classes);
      p.reloadedBehaviours(classes, sources);
      this.behaviourSources = sources; this.behaviourProblems = []; this.behaviourError = ''; this._freshenFailed = false;
    } catch (e) {
      // behaviourSources stays the text of the code that runs: the next Play tries again, or clears this when it's put back
      this._freshenFailed = true;
      this.behaviourError = `The behaviours as they are now didn't load, so Play runs the ones read before: ${e?.message ?? e}`;
    }
  }

  /** While playing in the Mac app: watch the behaviours module and what it imports (project.watch), swap changes in. */
  async startHotReload(world) {
    this.reloadState = null;
    const ref = this.project?.behavioursModule?.ref;
    if (!inShell || !ref || this.playWorld !== world) return;
    const hot = new HotReload({
      ref, classes: this.project.behavioursModule.classes, sources: this.behaviourSources,
      load: freshBehaviours(this.project), read: () => moduleSources(this.project, ref),
      watch: (paths) => call('project.watch', { paths }), unwatch: () => call('project.unwatch'),
      onChanged: (fn) => onShell('project.changed', ({ paths }) => fn(Array.isArray(paths) ? paths : [])),
      target: () => (this.playWorld === world ? { tree: world.tree, world, registries: [world.tree.registry, registry] } : null),
      report: (r) => this.hotReloaded(r, hot),
    });
    this.hot = hot;
    this.reloadState = { watching: [], n: 0, last: null, failed: 0, off: '' }; // before start: a reload it begins reports into it
    try {
      const watching = await hot.start();
      if (this.hot === hot) this.reloadState = { ...this.reloadState, watching: this.reloadState.n ? this.reloadState.watching : watching };
    } catch (e) {
      // a shell without project.watch (older, or an app that didn't ask for it): Play goes on without hot reload
      hot.stop();
      if (this.hot === hot) { this.hot = null; this.reloadState = { watching: [], n: 0, last: null, failed: 0, off: `not watching (${e?.message ?? e})` }; }
    }
    this.changed();
  }

  stopHotReload() { const h = this.hot; this.hot = null; h?.stop(); }

  /** A hot reload's result: the new classes for the project's later worlds, or the error (the old code still runs). */
  hotReloaded(r, hot) {
    if (this.hot !== hot || !this.reloadState) return;
    if (r.ok && r.unchanged) { this.behaviourError = ''; this.changed(); return; } // the failed edit was put back: the running code is what is on disk again
    if (r.ok) {
      this.project.reloadedBehaviours(r.classes, hot.sources);
      this.behaviourSources = hot.sources; this.behaviourProblems = []; this.behaviourError = '';
      const { classes, plan, ...last } = r;
      this.reloadState = { ...this.reloadState, n: r.n, last, watching: [...hot.sources.keys()] };
    } else {
      this.behaviourError = `The behaviours didn't reload at step ${r.step ?? '?'}, so the code from before is still running: ${r.error}`;
      this.reloadState = { ...this.reloadState, failed: this.reloadState.failed + 1 };
    }
    this.changed();
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

  /** The takes there are to export: the open sequence, the last Play, then the project's recorded input. */
  takes() {
    const out = [];
    const seq = this.session?.isSequence ? this.session.doc.sequence : null;
    if (seq) out.push({ id: 'sequence', label: `The sequence (${(seq.duration / seq.fps).toFixed(1)} s at ${seq.fps} fps)`, seconds: seq.duration / seq.fps, fps: seq.fps });
    if (this.lastTake) out.push({ id: 'play', label: `Last play (${(this.lastTake.steps / 60).toFixed(1)} s${reloadedTake(this.lastTake) ? ', reloaded: can\'t be replayed' : ''})`, seconds: this.lastTake.steps / 60, reloaded: reloadedTake(this.lastTake) });
    for (const f of this.project?.takes() ?? []) out.push({ id: f, label: f, seconds: null });
    return out;
  }

  /** A take as a world at step 0 with its input replaying: { world, seconds }. Sound is recorded, not heard. */
  async takeWorld(id, seqDoc = null, { mtoonMaterial = this.host.mtoonMaterial } = {}) {
    let doc, input;
    if (id === 'sequence') {
      // the sequence as the runtimes play it from its first frame, exactly as the timeline's preview builds it; seqDoc:
      // a snapshot of it taken earlier (the creator's render queue renders a short as it was queued, M4 W5)
      const src = seqDoc ?? parse(this.session.text());
      const seq = src.sequence;
      const world = await this.buildFrom(src, { play: true, heard: false, mtoonMaterial });
      return { world, seconds: seq.duration / seq.fps };
    }
    let ai = [], steps = null;
    if (id === 'play') {
      if (!this.lastTake) throw new Error('nothing has been played yet');
      ({ doc, input } = this.lastTake); ai = this.lastTake.ai ?? []; steps = this.lastTake.steps;
    } else {
      doc = structuredClone(this.session.doc);
      const file = JSON.parse(await this.project.text(id));
      if (isTake(file)) { // a take file (M3 W4): its cast over the open scene, its input and its ai log
        doc = { ...doc, nodes: doc.nodes.map((n) => (file.cast?.[n.id] ? { ...n, ...file.cast[n.id] } : n)) };
        input = file.input; ai = file.ai ?? []; steps = file.steps;
      } else input = file; // a bare input recording (M1)
    }
    assertReplayable({ input }, id); // a take recorded across a hot reload (M6 W2): before a world is built for it
    const world = await this.buildFrom(structuredClone(doc), { play: true, heard: false, mtoonMaterial });
    if (input) world.input.replay(structuredClone(input));
    if (ai.length) world.ai?.replay(ai);
    return { world, seconds: (steps ?? input?.frames?.length ?? 0) / 60 };
  }

  /**
   * Bake a take (the last play, or a take file) into a sequence document in the project (M3 W4, takeToSequence): her
   * lines as dialogue clips, the person's on their character, the decisions and the input as tracks. → its ref
   */
  async bakeTake(id = 'play', name = null) {
    let take;
    if (id === 'play') {
      if (!this.lastTake) throw new Error('nothing has been played yet');
      const t = this.lastTake;
      take = makeTake({ scene: t.scene, input: t.input, ai: t.ai ?? [], steps: t.steps });
    } else {
      const file = JSON.parse(await this.project.text(id));
      take = isTake(file) ? file : makeTake({ scene: this.sceneRef, input: file, steps: file.frames?.length ?? 0 });
    }
    assertReplayable(take, id); // the last play or a take file recorded across a hot reload (M6 W2)
    if (isSequence(parse(await this.project.text(take.scene)))) throw new Error(`${take.scene} is a sequence: bake takes played in a set`);
    const base = (name || `${take.scene.replace(/^.*\//, '').replace(/\.vrmxs$/, '')}-take`).replace(/\.vrmxs$/, '');
    let ref = `sequences/${base}.vrmxs`;
    for (let n = 2; this.project.files.includes(ref); n++) ref = `sequences/${base}-${n}.vrmxs`;
    const seq = takeToSequence(take, { id: ref.replace(/^sequences\//, '').replace(/\.vrmxs$/, ''), user: this.playerId?.() ?? 'mira' });
    await this.project.write(ref, serialize(seq));
    this.lastBake = { ref, tracks: seq.sequence.tracks.map((t) => t.id), frames: seq.sequence.duration };
    this.changed();
    return ref;
  }

  /** The TTS voice for regenerating lines: the Mac shell's tts.speak, or a loopback server (?tts=…/speak). */
  ttsProvider() {
    const url = new URLSearchParams(globalThis.location?.search ?? '').get('tts');
    if (url) return (this._tts ??= httpTTS(url));
    if (inShell) return (this._tts ??= shellTTS({ call }));
    throw new Error('no TTS voice: open the editor with ?tts=http://127.0.0.1:5190/speak (tools/tts-server.py), or in the Mac app once the shell speaks');
  }

  /** Regenerate one dialogue line of the open sequence (M3 W4): new audio and timings, one undo step. */
  async regenerateLine(trackId, index, text, { voice = null } = {}) {
    if (!this.session?.isSequence) throw new Error('open a sequence to regenerate its lines');
    const tts = this.ttsProvider();
    const track = this.session.doc.sequence.tracks.find((t) => t.id === trackId);
    const v = voice ?? this.voiceOf?.(track?.target) ?? 'af_heart';
    const write = async (ref, bytes) => (typeof bytes === 'string' ? this.project.write(ref, bytes) : this.project.writeBase64(ref, toBase64(bytes)));
    const ref = await this.session.seq.regenerateLine(trackId, index, text, { speak: (o) => tts.speak({ ...o, voice: v }), write });
    this.changed();
    return ref;
  }

  /**
   * Export a take to a video file through the shell (a hash of every frame without it, or with `hashOnly`).
   * doc: for the sequence take, a snapshot of the sequence document to render instead of the open one (M4 W5);
   * subtitles: false leaves the .srt out; signal: an AbortSignal that stops the export between frames (the shell's writer
   * removes the partial file).
   * M4 W10 (delivery): backend draws on that backend instead of the view's (WebGL export from a WebGPU view); check:
   * 'redraw' draws each frame twice and compares; onBytes sees each frame's read-back bytes (stills); projectPath writes
   * the movie into the open project (a delivery's folder) instead of asking where.
   * @param {{ take: string, seconds?: number, size: string, fps: string, codec: string, audio: boolean, name?: string, hash?: boolean, hashOnly?: boolean, sink?: any, doc?: any, subtitles?: boolean, signal?: AbortSignal,
   *   backend?: string | null, check?: 'redraw' | null, onBytes?: (n: number, bytes: Uint8Array, topDown: boolean) => void, projectPath?: string | null }} o
   */
  async exportVideo({ take, seconds, size, fps, codec, audio, name, hash = true, hashOnly = !inShell, sink: sinkIn = null, doc = null, subtitles: withSubs = true, signal = undefined, backend = null, check = null, onBytes = undefined, projectPath = null }) {
    if (this.exporting) throw new Error('an export is already running');
    if (this.session?.mode !== 'editing') throw new Error('stop playing before exporting');
    const [width, height] = SIZES[size], rate = RATES[fps];
    this.exporting = { n: 0, frames: 0, phase: 'building' }; this.error = ''; this.changed();
    let world = null;
    try {
      await this.releaseAssetThumbs(); // the thumbnails' host goes first (M5 W6), inside the try: a throw still ends the export
      const seqDoc = take === 'sequence' ? (doc ?? parse(this.session.text())) : null;
      // the export's host first: its world is built with that host's MToon (another backend's, when the job says)
      this.exportHost ??= await this.offlineHost(backend);
      const built = await this.takeWorld(take, seqDoc, { mtoonMaterial: this.exportHost.mtoonMaterial });
      world = built.world;
      const frames = framesFor(seconds ?? built.seconds, rate);
      this.exporting.frames = frames;
      const ext = CODECS[codec].ext;
      const topDown = !!this.exportHost.renderer.isWebGPURenderer;
      const base = (name || `${(this.sceneRef ?? 'scene').replace(/\.vrmxs$/, '').replace(/[^A-Za-z0-9_-]/g, '-')}-${size}${fps.replace('.', '')}`).replace(/\.(mp4|mov)$/, '');
      const sink = sinkIn ?? (hashOnly ? hashSink() : shellSink({ call })); // a sink passed in: checks, other transports
      // a sequence's dialogue goes beside the movie as <name>.srt (the shell writes it; hash-only keeps the text)
      const srt = take === 'sequence' && withSubs ? subtitles(seqDoc.sequence, this.names()) : null;
      // a sequence's world hash at every frame, for the scrub check: the same world drawn differently, or another world
      const worldAt = take === 'sequence' ? [] : null;
      const r = await exportTake({
        tree: world.tree, host: this.exportHost, fps: rate, frames, width, height, sink, audio,
        onFrame: worldAt ? (n) => { worldAt[n] = hashValue(worldHashes(world.tree, { physicsBytes: true })); } : undefined,
        job: { codec, suggestedName: `${base}.${ext}`, hash, title: 'Export Video', ...(srt ? { subtitles: srt } : {}), ...(projectPath ? { projectPath } : {}) },
        onProgress: (p) => { this.exporting = { ...p }; this.changed('export'); }, now: () => performance.now(), signal,
        check, onBytes: onBytes ? (n, bytes) => onBytes(n, bytes, topDown) : undefined,
      });
      const { frameHashes, ...rest } = r;
      const subs = srt ? { lines: srt ? srt.split('\n\n').filter(Boolean).length : 0, bytes: srt.length, path: rest.subtitles ?? null, error: rest.subtitlesError ?? null, text: hashOnly ? srt : undefined } : null;
      this.lastExport = { ...rest, take, size, fpsLabel: fps, codec, frameHashes, hashOnly, hashesDigest: frameHashes ? digest(frameHashes) : null, subs, worldAt, scrubCheck: null };
      return this.lastExport;
    } catch (err) { this.error = String(err?.message ?? err); throw err; }
    finally {
      // a fresh renderer per export: the take's world goes, and its GPU resources with it
      if (this.exportHost) { this.exportHost.dispose(); this.exportHost.renderer.forceContextLoss?.(); this.exportHost = null; }
      disposeWorld(world); // its sound and its physics too (AB-T-0592)
      this.exporting = null; this.changed();
      if (this._assetThumbsWanted) this.startAssetThumbs().catch(() => {}); // the thumbnails not drawn yet (M5 W6)
    }
  }

  /** Character id → name, for captions and subtitles (the set's and the sequence's nodes). */
  names() {
    const all = [...(this.setScene?.doc.nodes ?? []), ...(this.session?.doc.nodes ?? [])];
    return Object.fromEntries(all.filter((n) => n.type === 'Character').map((n) => [n.id, n.name ?? n.id]));
  }

  /**
   * Check the last export of the sequence against scrubbing (M2 check 2 and 5): a fresh world jumps to each frame from
   * its snapshots (SequencePlayer, backwards first, so every jump restores one) and is drawn at the export's size and
   * post, and each frame's hash is compared with the hash the export took of the same frame as it played through.
   * @param {{ frames?: number[] }} [o] export frames to check (default: each shot's first, middle and last frame, and
   *   the frame each line, event and key starts on)
   */
  async checkExportAgainstScrub({ frames } = {}) {
    const x = this.lastExport;
    if (!x || x.take !== 'sequence' || !x.frameHashes?.length) throw new Error('export the sequence (with frame hashes) first');
    const seq = this.session.doc.sequence;
    if (RATES[x.fpsLabel].num !== seq.fps || RATES[x.fpsLabel].den !== 1) throw new Error(`export at the sequence's ${seq.fps} fps to compare frame for frame`);
    const n = x.frameHashes.length;
    const want = frames ?? [...new Set([
      ...(seq.shots ?? []).flatMap((sh) => [sh.start, Math.floor((sh.start + sh.end) / 2), sh.end - 1]),
      // clip starts and keys may sit between frames (a baked take's decisions land on exact steps, M3 W4): the frame
      // each falls in is the one the export drew
      ...(seq.tracks ?? []).flatMap((t) => [...(t.clips ?? []).map((c) => c.start), ...(Array.isArray(t.keys) ? t.keys.map((k) => k[0]) : [])]).map((f) => Math.floor(f)),
    ])];
    const order = want.filter((f) => f >= 0 && f < n).sort((a, b) => b - a); // backwards: each jump is a restore
    const [width, height] = SIZES[x.size];
    this.exporting = { n: 0, frames: order.length, phase: 'checking' }; this.changed();
    let world = null, host = null, rb = null;
    try {
      await this.releaseAssetThumbs(); // M5 W6: as before an export
      ({ world } = await this.takeWorld('sequence'));
      const player = new SequencePlayer(world.tree, { every: 120 });
      host = await this.offlineHost();
      host.attach(world.tree); host.resize(width, height);
      // the export's readback on either backend (M4 W3): WebGL's pixel pack, WebGPU's output target and map buffers
      rb = readbackFor(host, width, height);
      const buf = new Uint8Array(width * height * 4);
      // the first jump plays the sequence through once (the snapshots); the others restore
      await player.seekStep(world.sequence.stepOf(n - 1).step);
      // one throwaway frame first (AB-T-0590): a fresh WebGPU host's first frame through the post stack can differ under
      // GPU load (frame 1079, the scrub's first row, failed in 7 of 8 loads with the operator's browsers loading the GPU,
      // and in 0 of 8 after this draw). The check compares restored worlds with the export, not a cold host's first
      // frame; the editor's own scrub always draws on its warm view host
      { const { step: ws, alpha: wa } = world.sequence.stepOf(n - 1); await rb.draw(() => host.frameAt(ws, wa)); await rb.readNow(buf); }
      const rows = [];
      for (const f of order) {
        const { step, alpha } = world.sequence.stepOf(f);
        const t0 = performance.now();
        const r = await player.seekStep(Math.max(0, step - 1));
        await rb.draw(() => host.frameAt(step, alpha));
        await rb.readNow(buf); // WebGL: synchronous (a pixel-pack read taken back at once can come back stale in WebKit)
        const hash = hashFrame(buf), wh = hashValue(worldHashes(world.tree, { physicsBytes: true }));
        rows.push({ frame: f, step, alpha: +alpha.toFixed(3), restored: r.restored, ms: +(performance.now() - t0).toFixed(1), scrub: hash, exported: x.frameHashes[f], same: hash === x.frameHashes[f], world: wh, worldSame: x.worldAt ? wh === x.worldAt[f] : null });
        this.exporting = { n: rows.length, frames: order.length, phase: 'checking' }; this.changed('export');
      }
      rows.sort((a, b) => a.frame - b.frame);
      x.scrubCheck = { frames: rows.length, same: rows.filter((r) => r.same).length, rows };
      return x.scrubCheck;
    } catch (err) { this.error = String(err?.message ?? err); throw err; }
    finally {
      rb?.release(); // the readback's map buffers (WebGPU), as exportTake releases its own
      if (host) { host.dispose(); host.renderer.forceContextLoss?.(); }
      disposeWorld(world);
      this.exporting = null; this.changed();
      if (this._assetThumbsWanted) this.startAssetThumbs().catch(() => {});
    }
  }

  /** The view as it is now (edit camera or the play camera) at a size, as a PNG. */
  async stillPNG(width, height) { return (await this.still(width, height)).png; }

  /** The view drawn at a size: { png, still } (still: its RGBA, for checks like a blank frame). */
  async still(width, height) {
    if (!this.host.tree) throw new Error('nothing to draw');
    const still = await captureStill(this.host, { width, height, alpha: this.host.last.alpha ?? 1 });
    if (this._w) this.host.resize(this._w, this._h); // the viewport's own size, exactly
    return { png: await encodePNG(still), still };
  }

  /**
   * Export Game (M5 W0): the open project as a game build (export-game.js; @vrmxg/bundle). In the Mac app it is written
   * to a folder the person picks; in a browser it is checked and hashed only.
   * @param {{ name?: string }} [o] name: the build folder's name (the game's id)
   */
  async exportGame({ name = '' } = {}) {
    if (this.gameExporting || this.exporting) throw new Error('an export is already running');
    if (this.session?.mode !== 'editing') throw new Error('stop playing before exporting');
    this.gameExporting = { n: 0, total: 0, phase: 'checking' }; this.error = ''; this.changed('export');
    const abort = new AbortController(), unsaved = !!this.session?.dirty; // the build is made from the project's saved files
    let settle = () => {};
    this._gameExport = { abort, done: new Promise((r) => { settle = r; }) };
    try {
      // the behaviours module is imported fresh for the export (export-game.js), not taken from the declarations made
      // when the project was opened: what is on disk now is what ships, and what the save fingerprint counts
      const r = await exportGame(this.project, { scene: this.sceneRef, name, signal: abort.signal, onProgress: (n, total) => { this.gameExporting = { n, total, phase: 'writing' }; if (n % 8 === 0 || n === total) this.changed('export'); } });
      this.lastGameExport = { ...r, unsaved };
      return this.lastGameExport;
    } catch (e) {
      // the folder panel was cancelled, or the window is closing (cancelGameExport): nothing was exported, nothing is wrong
      if (e?.code === 'cancelled' || e?.code === 'aborted') return null;
      // a refusal is the export's answer, shown where its result is: which file, and why (the exporter's, or the shell's
      // for a folder that holds something that isn't a build)
      // (and the editor's own: a root behaviours.js game.json doesn't name, which Play would run and a build wouldn't, M6 W9)
      if (e?.name !== 'BuildError' && e?.code !== 'not_empty' && e?.code !== 'unnamed_behaviours') throw e;
      this.lastGameExport = { refused: e.code, message: e.message, files: e.files };
      return this.lastGameExport;
    } finally { this.gameExporting = null; this._gameExport = null; settle(); this.changed(); }
  }

  /** Stop a game export between two writes (the window is closing); resolves once it has let go of its folder. */
  async cancelGameExport() {
    const run = this._gameExport;
    if (!run) return;
    run.abort.abort();
    await run.done;
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
      if (old) this.retire(old.world); // the preview of the document as it was (AB-T-0592)
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
          if (p !== this.preview) continue; // another scene was opened while it was built: nothing to show of this one
          const release = this.worlds.use(p.world); // a world being stepped and drawn isn't disposed under the scrub
          try {
            const { step, alpha } = p.world.sequence.stepOf(Math.floor(f));
            const t0 = performance.now();
            const r = await p.player.seekStep(Math.max(0, step - 1));
            if (p !== this.preview) continue; // another scene was opened meanwhile: this world isn't shown
            if (this.host.tree !== p.world.tree) { this.host.attach(p.world.tree); this.host.debug.set(this.debug); }
            this.gizmo.detach(); this.box.visible = false;
            this.view = 'preview';
            this.host.camera = this.previewCamera === 'sequence' ? null : this.camera;
            await this.host.frameAt(step, alpha);
            this.scrubState = { frame: Math.floor(f), step, alpha: +alpha.toFixed(3), restored: r.restored, stepped: r.stepped + (step > r.step ? step - r.step : 0), ms: +(performance.now() - t0).toFixed(1), hash: hashValue(worldHashes(p.world.tree, { physicsBytes: true })) };
            this.drawAngles();
            this.changed('timeline');
          } finally { release(); }
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
    if (this.host.lost) return; // the draw before lost the device (M6 W6): nothing more on that renderer; every caller
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
      this.sweep(); // retired worlds the view has stopped showing (AB-T-0592)
      const tree = this.host?.tree;
      if (!tree || this.host.lost) { this._last = null; return; } // a lost device: nothing steps or draws until its replacement (M6 W6)
      const dt = this._last === null ? 0 : Math.min(0.25, (t - this._last) / 1000);
      if (this._last !== null) this._frames.push(t - this._last);
      this._last = t;
      const r = this.canvas.getBoundingClientRect();
      if (r.width && (this._w !== r.width || this._h !== r.height)) { this._w = r.width; this._h = r.height; this.host.resize(r.width, r.height); }
      try {
        if (this.session?.mode === 'playing' && this.playWorld && this.paused) { this.host.render(1, false); this.stats.step = tree.clock.step; }
        else if (this.session?.mode === 'playing' && this.playWorld) {
          this.host.frame(dt); this.playDirector?.pump(); this.stats.step = tree.clock.step;
          if (tree.services.get('voice')?.lines.size && this._frames.length % 6 === 0) this.changed('captions'); // word by word
          const pr = this.prompt(), key = pr?.text ?? null;
          if (key !== this._promptKey) { this._promptKey = key; this.changed('captions'); }
        }
        else if (this.live) { // a world played on in real time outside Play (the creator's takes, M4 W9): stepped, drawn, then its tick
          if (this.fly) this.fly.update(dt); else this.orbit.update(dt);
          this.host.frame(dt); this.stats.step = tree.clock.step; this.live.tick?.();
        }
        else if (this.view === 'preview') {
          if (this.fly) this.fly.update(dt); else this.orbit.update(dt);
          if (this.previewPlaying) this.advancePreview();
          else if (!this._scrubbing && this.host.tree === this.preview?.world.tree) { const drawing = this.host; drawing.render(drawing.last.alpha ?? 1, false); if (!drawing.lost && this.host === drawing) this.drawAngles(); }
        }
        else {
          if (this.fly) this.fly.update(dt); else this.orbit.update(dt); if (this.box.visible) this.box.update();
          this.aids.beginFrame(); // WebGPU: the frame and the aids reach the canvas together (viewport/composite.js)
          const drawing = this.host;
          try { drawing.render(1, false); } catch (err) { this.aids.abortFrame(); throw err; }
          // the device went in that draw (M6 W6): the aids would draw on a dead renderer (WebKit throws), so not this frame
          if (drawing.lost || this.host !== drawing) this.aids.abortFrame(); else this.aids.draw();
        }
        if (this.view !== 'edit' || this.session?.mode === 'playing' || this.live) this.aids.setPageShown(false);
        this.stats.renderMs = this.host.last.renderMs;
      } catch (err) {
        this.error = String(err?.stack ?? err); console.error(err);
        // a frame that failed because the device went (M6 W6): its error is cleared once the view is back, and Play goes on
        if (this.host?.lost || this._replacingHost) this._lossError = this.error;
        else if (this.session?.mode === 'playing') this.stop();
      }
      if (this._frames.length >= 20) {
        this.stats.frameMs = this._frames.reduce((a, b) => a + b, 0) / this._frames.length; this.stats.fps = 1000 / this.stats.frameMs;
        this._frames = [];
        this.changed('stats');
      }
    };
    requestAnimationFrame(tick);
  }
}
