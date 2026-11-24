// The playground's engine host, outside Vue: the SceneTree, the render host and the frame loop live here,
// never in reactive state (a reactive proxy around three.js objects costs every access and breaks identity).
// The UI talks to it through plain methods and reads a small stats object a few times a second.
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { KeyboardDevice, MouseDevice, GamepadDevice } from '@vrmxg/input';
import { PRESETS } from '@vrmxg/camera';
import { RenderHost, backendFromQuery } from '@vrmxg/render';
import { renderViews, gridLayout, PRESETS as POST_PRESETS } from '@vrmxg/post';
import { captureStill, hashFrame, readbackFor } from '@vrmxg/export';
import { loadSample, buildWorld } from './world.js';
import { serialize } from '@vrmxg/scene';
import { runSimulation, runDevices, runAudio, runItems, runCinematic, runSequence, runParticles, runBrains, runSave, runFilm, runConversation, runRagdoll, runVehicle, runSplit, STEPS } from './acceptance.js';
import { AudioOutput } from '@vrmxg/audio';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import { ShellStore, IndexedDBStore } from '@vrmxg/save';
import { inShell, call, on as shellOn } from '../../shell/js/shell.js';
import { httpTTS, shellTTS } from '@vrmxg/voice';
import { installDirector, httpModel, shellModel, isTake, demoModel } from '@vrmxg/director';
import { Listening, measureVoiceTurns } from './voice.js';
import { Vector3 } from 'three';
import { TextLayer } from '@vrmxg/text';
import { withStairs, knockDownStairs } from './stairs.js';
import { withCart } from './vehicle.js';
import { withTwoPlayers, playerLayout } from './split.js';
import { withCamera, shellCamera, recordedFrames, connectCamera } from '@vrmxg/sense';
import { framesCheck } from './frames.js';
import { coverageCheck } from './coverage-check.js';
import { voicingCheck } from './voicing-check.js';
import { takesCheck } from './takes-check.js';
import { withCrowd } from './budget.js';
import * as core from '@vrmxa-core/index.js';
import * as anim from '@vrmxa-core/anim/index.js';
import * as closet from '@vrmxa-core/closet/index.js';
import * as projectBehaviours from '@content/behaviours.js';
import './sqljs.js';

installPortableMath(); // before anything parses a VRM or steps a world
const vrmxaCore = { ...core, ...anim };
const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
/** ?camera's close shot of the character you talk to (Hana at her spot by the counter, facing the room). */
const CAMERA_SHOT = { p: [-1.5, 1.5, -0.9], q: [-0.0238, 0, 0, 0.9997] };
const bytes = async (ref) => { const r = await fetch(ref); if (!r.ok) throw new Error(`${ref}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); };
const json = async (ref) => JSON.parse(new TextDecoder().decode(await bytes(ref)));

export { vrmxaCore, behaviours, bytes };

export { PRESETS, POST_PRESETS };

/** The sample's voices for live lines, by speaker (the baked lines name theirs in content/sample/voice/lines.json). */
const VOICES = { 'hana-1': 'af_heart', mira: 'af_bella', 'customer-1': 'am_adam' };

export class Playground {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ preserveDrawingBuffer?: boolean, backend?: 'webgpu' | 'webgl' | 'auto' }} [opts] backend: the renderer
   *   (M4 W0); by default the `?renderer=webgpu|webgl|auto` switch, else auto: WebGPU where the page has it (M4 W3)
   */
  constructor(canvas, { preserveDrawingBuffer = false, backend = backendFromQuery(location.search) } = {}) {
    this.canvas = canvas;
    this.host = null; this.text = null;
    /** The render host, made asynchronously (a WebGPURenderer needs `await init()`); load() waits for it. */
    this.ready = this._makeHost({ preserveDrawingBuffer, backend });
    this.ready.catch((e) => { this.error = String(e?.message ?? e); }); // load() awaits it and reports the failure
    this.tree = null; this.input = null;
    this.playing = false;
    this.stats = { frameMs: 0, fps: 0, simMs: 0, renderMs: 0, step: 0, alpha: 0, steps: 0, backend: '' };
    this._frames = []; this._sim = []; this._render = [];
    this._last = null;
    this.devices = null;
    this.onChange = null;
    this.error = null;
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  /**
   * The render host on the chosen backend. WebGL is the M3 playground exactly: the pmndrs post stack and troika's
   * speech bubbles. WebGPU (M4 W0) draws the scene and its characters (the patched MToonNodeMaterial) through the TSL
   * post stack (M4 W1), without bubbles (troika's shaders are WebGL's; the captions still show every line).
   */
  async _makeHost({ preserveDrawingBuffer, backend }) {
    // the backend is known only once the host exists (auto falls back to WebGL if WebGPU fails inside init()): the host
    // makes that backend's post stack (pmndrs on WebGL, TSL on WebGPU), and the bubbles go on a WebGL host only
    this.host = await RenderHost.create({
      canvas: this.canvas, backend, preserveDrawingBuffer,
      post: { loadCube: async (file) => new TextDecoder().decode(await bytes(file)) },
    });
    const webgl = this.host.backend === 'webgl';
    // speech bubbles in the canvas (M3 W6, troika: the text spike's verdict), the sample's static Noto Sans JP; no CDN
    if (webgl) this.text = new TextLayer({ font: 'fonts/NotoSansJP-Regular.ttf', bold: 'fonts/NotoSansJP-Bold.ttf', unicodeFontsURL: 'fonts/' }).attach(this.host);
    this.stats.backend = this.host.backend;
    this.resize();
    return this.host;
  }

  resize() { if (this.offline) return; const r = this.canvas.getBoundingClientRect(); if (r.width && r.height) this.host?.resize(r.width, r.height); }

  /**
   * Offline checks own the canvas (M4 W1): no frame loop draws while paused and the canvas keeps the size the check
   * gives it (the paused loop's draws and the resize observer's would land between the check's frames).
   */
  set offline(on) { this._offline = !!on; if (!on) this.resize(); }
  get offline() { return !!this._offline; }

  /**
   * Load a scene of the sample project (a path under the site root). `text`: the scene's own JSON instead of the
   * file at that path (a scene opened through the Mac shell); its asset refs still resolve against the site.
   */
  /**
   * @param {string} [scene] @param {{ text?: string, crowd?: number }} [o] text: the scene's own text in place of its
   *   file; crowd: that many more wandering characters (M4 W3's budget; also `?crowd=N`)
   */
  async load(scene = 'cafe.vrmxs', { text, crowd } = {}) {
    await this.ready;
    this.pause();
    const R = await loadRapier();
    const read = text === undefined ? bytes : async (ref) => (ref === scene ? new TextEncoder().encode(text) : bytes(ref));
    this.sample = await loadSample(read, scene);
    // M3 W6: ?director=<chat url>&model=omni4 (the loopback stand-in), or ?director=demo (a scripted model), puts a
    // director on the character you talk to (?talkTo=hana-1, recast with ?preset=host); ?take=takes/….json replays a
    // recorded conversation (its cast, input and ai log) with no model
    const params = new URLSearchParams(location.search);
    this.talkTo = params.get('talkTo') ?? 'hana-1';
    const takeRef = params.get('take'), directorUrl = params.get('director');
    const take = takeRef ? JSON.parse(new TextDecoder().decode(await read(takeRef))) : null;
    if (take && !isTake(take)) throw new Error(`${takeRef} is not a take (vrmxg-take)`);
    const cast = take?.cast ?? (directorUrl ? { [this.talkTo]: { behaviours: [{ use: 'brain', preset: params.get('preset') ?? 'host' }] } } : null);
    if (cast) this.sample = { ...this.sample, doc: { ...this.sample.doc, nodes: this.sample.doc.nodes.map((n) => (cast[n.id] ? { ...n, ...cast[n.id] } : n)) } };
    // M3 W7: ?fall puts a flight of stairs outside the cafe with Mira and Hana on its landing (knockDown() shoves them)
    // M3 W8: ?cart puts a cart on the pavement with Mira beside its driver's door (E gets in and out, WASD drives)
    if (params.has('cart')) this.sample = { ...this.sample, doc: withCart(this.sample.doc) };
    // M4 W3: ?crowd=N (or load's crowd) adds N wandering characters, Mira's and Hana's models in turn (the budget's 20)
    const crowdN = crowd ?? (params.has('crowd') ? +(params.get('crowd') || 18) : 0);
    if (crowdN > 0) this.sample = { ...this.sample, doc: withCrowd(this.sample.doc, crowdN) };
    // M3 W9: ?split, two players side by side (Mira on WASD and the mouse, Hana on the arrows or a gamepad)
    if (params.has('split')) this.sample = { ...this.sample, doc: withTwoPlayers(this.sample.doc) };
    // a scene with player cameras (cafe-split.vrmxs, or ?split) plays in split screen: their layout, two players' map
    this.layout = playerLayout(this.sample.doc);
    this.split = !!this.layout;
    this.fall = params.has('fall');
    if (this.fall) this.sample = { ...this.sample, doc: withStairs(this.sample.doc, { camera: true }) };
    // M3 W5: ?camera puts the person at the camera into the world (the sense service and its viewer node); the character
    // you talk to notices you, looks at you and answers a wave and a nod. Without a director or a take, she stands for a
    // close shot with nothing else to do. A take that carries camera events replays them with the camera off.
    this.cameraMode = params.has('camera') || !!take?.sense;
    if (this.cameraMode) {
      let doc = withCamera(this.sample.doc, { notice: [this.talkTo], params: { say: { wave: 'Oh, hi there!' } } });
      if (!take && !directorUrl) doc = { ...doc, nodes: doc.nodes.map((n) => (n.id === this.talkTo ? { ...n, behaviours: n.behaviours.filter((b) => b.use === 'noticeViewer') } : n.id === 'cam' ? { ...n, transform: { ...n.transform, ...CAMERA_SHOT }, props: { ...n.props, preset: 'fixed', target: this.talkTo } } : n)) };
      this.sample = { ...this.sample, doc };
    }
    if (!this.audio) { this.audio = new AudioOutput(); this.audio.unlockOn(window); } // one output for every load; heard after the first gesture
    this.tree?.services.get('audio')?.dispose();
    await this.camera?.stop();
    this.camera = null;
    const world = await buildWorld(R, this.sample, { vrmxaCore, closet, behaviours, audioOutput: this.audio, sense: this.cameraMode, players: this.split ? 2 : 1, mtoonMaterial: this.host.mtoonMaterial });
    this.host.layout = this.layout;
    const { tree, input, models } = world;
    this.world = world;
    if (take) { input.replay(structuredClone(take.input)); world.ai.replay(take.ai); if (take.sense) world.sense.replay(take.sense); }
    this.director = null;
    if (directorUrl && !take) {
      const player = tree.all().find((n) => n.type === 'Character' && n.behaviourEntries?.some((b) => b.use === 'player'));
      // ?director=shell: the Mac shell's llm.respond (MLXEngine in the shell's voice product, M3 W3)
      const model = directorUrl === 'demo' ? demoModel() : directorUrl === 'shell' ? shellModel({ call }) : httpModel(directorUrl, { model: params.get('model') ?? 'omni4', temperature: 0 });
      this.director = installDirector(tree, { model, user: player?.id ?? null, userName: player?.name ?? null, persona: (id) => world.personas.forDirector(id), memory: (id) => world.personas.memoryOf(id) });
    }
    if (!this.devices) {
      this.devices = { keyboard: new KeyboardDevice(), mouse: new MouseDevice(), gamepad: new GamepadDevice() };
      this.devices.keyboard.attach(window); this.devices.mouse.attach(this.canvas);
    }
    for (const d of Object.values(this.devices)) input.addDevice(d);
    this.tree = tree; this.input = input; this.scene = scene;
    // live lines (M2 W10): ?tts=<loopback url> (content/sample/tools/tts-server.py) or ?tts=shell (the shell's tts.speak,
    // once MLXEngine has the endpoint: AB-A-0308). Presentation only: text-only lines are heard, the simulation is unchanged
    const tts = new URLSearchParams(location.search).get('tts');
    if (tts) tree.services.get('voice')?.useLive(tts === 'shell' ? shellTTS({ call }) : httpTTS(tts), { voices: VOICES, now: () => performance.now() });
    // the prompt and what the player wears change on signals: refresh the controls then, not on the next stats tick
    for (const n of tree.all()) if (n.type === 'Character') { n.on('focusChanged', () => this._changed()); n.on('dressed', () => this._changed()); }
    // M3 W3: your voice into the conversation (voice.js): ?listen=page|shell; ?measure=voice runs the measured turns
    await this.listening?.stop();
    this.listening = this.director ? new Listening(this, { inShell, call, on: shellOn, params: new URLSearchParams(location.search) }) : null;
    this.host.attach(tree);
    this.resize();
    this.host.render(1);
    this._loop();
    if (this.director && new URLSearchParams(location.search).get('measure') === 'voice') {
      measureVoiceTurns(this, { call }).catch((e) => { console.error(`[voice-measure] ${e?.stack ?? e}`); window.__voiceMeasure = { error: String(e?.message ?? e) }; });
    }
    this._changed();
    return { nodes: tree.all().length, skipped: models.skipped };
  }

  /**
   * M0's exit checks in this browser (?mode=acceptance): the runtime-neutral ones (acceptance.js), then the
   * playground itself: the recorded walk rendered frame by frame, every camera preset, debug draw.
   */
  async acceptance() {
    const R = await loadRapier(), now = () => performance.now();
    const sample = await loadSample(bytes);
    const opts = { vrmxaCore, closet, behaviours };
    const simulation = await runSimulation(R, sample, opts, { now });
    const devices = await runDevices(R, sample, opts);
    const items = await runItems(R, sample, opts);
    const cinematic = await runCinematic(R, sample, opts);
    const sequence = await runSequence(R, sample, opts, { now });
    const particles = await runParticles(R, sample, opts, { now });
    const brains = await runBrains(R, sample, opts, { now });
    const save = await runSave(R, sample, opts, { now });
    const film = await runFilm(R, sample, opts, { now });
    const conversation = await runConversation(R, sample, opts, { now });
    const ragdoll = await runRagdoll(R, sample, opts, { now });
    const vehicle = await runVehicle(R, sample, opts, { now });
    const split = await runSplit(R, sample, opts, { now });
    const audio = await runAudio(R, sample, opts, { silentFinal: items.final, take: 'input/play-items.json', steps: items.steps });
    const rendered = await this._renderedChecks(simulation);
    rendered.post = await this._postChecks();
    return { simulation, devices, items, cinematic, sequence, particles, brains, save, film, conversation, ragdoll, vehicle, split, audio, rendered };
  }

  async _renderedChecks(simulation) {
    await this.load();
    this.pause();
    const tree = this.tree, host = this.host;
    const types = {}; for (const n of tree.all()) types[n.type] = (types[n.type] ?? 0) + 1;
    let setMeshes = 0; tree.find('set')?.object3d.traverse((o) => { if (o.isMesh) setMeshes++; });
    const scene = {
      types, setMeshes,
      player: tree.find('mira')?.behaviours.map((b) => b.name), npc: tree.find('hana-1')?.behaviours.map((b) => b.name),
      doors: tree.all().filter((n) => n.type === 'Item' && n.manifest?.type === 'door').map((n) => n.id), lights: tree.all().filter((n) => /Light$/.test(n.type)).map((n) => `${n.id}:${n.type}`),
      prop: !!tree.find('espresso')?.model,
    };
    // the recorded walk, rendered: one step per frame at 60 Hz until the 600th step
    const signals = [];
    const emit = tree.emit.bind(tree);
    tree.emit = (node, signal, payload) => { signals.push({ step: tree.clock.step, node: node.id, signal, to: payload?.to }); return emit(node, signal, payload); };
    const rec = await (await fetch('input/walk-in.json')).json();
    this.input.replay({ ...rec, start: tree.clock.step });
    const renderMs = []; let frames = 0;
    while (tree.clock.step < STEPS) { host.frame(1 / 60); renderMs.push(host.last.renderMs); frames++; }
    const h600 = hashValue(worldHashes(tree, { physicsBytes: true }));
    const headless600 = simulation.final; // the headless run's hash after step 600, same components
    // every camera preset, switched at run time
    const cam = /** @type {any} */ (tree.services.get('cameras').current), presets = {};
    for (const p of PRESETS) {
      cam.call('setPreset', { preset: p });
      for (let i = 0; i < 30; i++) host.frame(1 / 60);
      const w = cam.object3d.getWorldPosition(cam.object3d.position.clone());
      presets[p] = { preset: cam.preset, at: w.toArray().map((v) => +v.toFixed(2)) };
    }
    cam.call('setPreset', { preset: 'follow' }); // the follow camera's spring arm casts a ray every step
    // debug draw, everything on
    host.debug.set(true);
    for (let i = 0; i < 30; i++) host.frame(1 / 60);
    const physics = tree.services.get('physics');
    const wires = [...host.debug.wires.values()];
    const debug = { ...host.debug.counts(), physicsColliders: physics.colliders.size, sensors: wires.filter((w) => w.kind === 'sensor').map((w) => w.line.userData.node).sort(), capsules: wires.filter((w) => w.kind === 'capsule').map((w) => w.line.userData.node).sort() };
    const sorted = [...renderMs].sort((a, b) => a - b);
    return {
      scene, frames, renderMs: { mean: +(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(3), p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(3) },
      sameAsHeadless: h600 === headless600, h600, headless600,
      doorSignals: signals.filter((s) => s.signal === 'stateChanged').map(({ step, node, to }) => ({ step, node, to })),
      // WebGPU's info.render.calls counts render calls since the start; its drawCalls is WebGL's calls (this frame's draws)
      presets, debug, calls: host.renderer.isWebGPURenderer ? host.renderer.info.render.drawCalls : host.renderer.info.render.calls, triangles: host.renderer.info.render.triangles,
    };
  }

  /**
   * M2 W3: the anime post stack on the cafe: no errors; its cost at 1080p and 4K against no post; a 4K frame scaled to
   * 1080p against the 1080p frame (SSIM, with and without grain: grain is per pixel by design); four viewports.
   */
  async _postChecks() {
    const host = this.host, tree = this.tree, env = tree.find('env'), post = host.post;
    const now = () => performance.now();
    const debug = { ...host.debug.show }; host.debug.set(false); // debug wireframes are 1 px at any size: not the look
    // GPU work included on either backend (host.finish: gl.finish on WebGL, onSubmittedWorkDone on WebGPU, M4 W3)
    const time = async (n) => { const ms = []; for (let i = 0; i < n; i++) { const t0 = now(); host.advanceNodeFrame(); host.render(1, false); await host.finish(); ms.push(now() - t0); } ms.sort((a, b) => a - b); return +ms[n >> 1].toFixed(3); };
    const at = async (w, h, fn) => { const r = host.renderer, pr = r.getPixelRatio(), buf = host.drawingBufferSize(), cw = buf.width / pr, ch = buf.height / pr; r.setPixelRatio(1); host.resize(w, h); const out = await fn(); r.setPixelRatio(pr); host.resize(cw, ch); return out; };
    const cost = async (label) => ({ [label + '1080p']: await at(1920, 1080, () => time(30)), [label + '4k']: await at(3840, 2160, () => time(20)) });
    env.props.post = null; host.views.update(tree);
    const none = await cost('none');
    env.props.post = 'anime'; host.views.update(tree);
    host.render(1, false);
    const anime = await cost('anime');
    const ssim = async (grain) => {
      post.setParams({ 'grain.amount': grain ? 0.18 : 0 });
      const a = await captureStill(host, { width: 1920, height: 1080 }), b = await captureStill(host, { width: 3840, height: 2160 });
      return +ssimDown(a.rgba, b.rgba, 1920, 1080).toFixed(4);
    };
    const ssimNoGrain = await ssim(false), ssimGrain = await ssim(true);
    // four views: the current camera and three more around Hana, scissored, no post on them
    const cam = tree.services.get('cameras').current.camera;
    const cams = [cam, ...[0, 1, 2].map((i) => { const c = cam.clone(); const a = (i / 3) * Math.PI * 2; c.position.set(-1.5 + Math.sin(a) * 4, 1.6, -3 + Math.cos(a) * 4); c.lookAt(-1.5, 1.2, -3); c.updateMatrixWorld(); return c; })];
    const views = gridLayout(4).map((v, i) => ({ camera: cams[i], ...v }));
    const viewMs = await at(1920, 1080, async () => { const ms = []; for (let i = 0; i < 20; i++) { const t0 = now(); host.advanceNodeFrame(); renderViews(host.renderer, host.scene, views); await host.finish(); ms.push(now() - t0); } ms.sort((x, y) => x - y); return +ms[10].toFixed(3); });
    env.props.post = null; host.views.update(tree);
    host.debug.set(debug);
    return { passes: post.passes ? [...post.passes] : null, costMs: { ...none, ...anime }, ssim: { noGrain: ssimNoGrain, grain: ssimGrain }, views4Ms: viewMs };
  }

  /** The running scene as a .vrmxs document (canonical JSON), for saving. */
  sceneText() { return serialize(this.tree.toDocument()); }

  play() { this.playing = true; this._last = null; this.audio?.ctx.resume?.(); this._changed(); }
  pause() { this.playing = false; if (this.audio?.running) this.audio.ctx.suspend?.(); this._changed(); }

  /** The mixer: a bus's volume (0..1) and mute ('master', 'music', 'sfx', 'voice', 'ambience'). */
  setBus(name, opts) { this.audio?.setBus(name, opts); this._changed(); }
  busSettings() { return this.audio?.settings() ?? null; }
  toggle() { return this.playing ? this.pause() : this.play(); }

  /** One simulation step while paused. */
  step() {
    if (!this.tree) return;
    this.pause();
    const t0 = performance.now(); this.tree.step(); this.stats.simMs = performance.now() - t0;
    this.host.render(1);
    this.stats.step = this.tree.clock.step;
    this._changed();
  }

  setTimeScale(s) { if (this.tree) this.tree.clock.timeScale = s; }

  // ---------------------------------------------------------------- save slots (M2 W9)

  /** Where saves go: the Mac shell's saves folder, or IndexedDB in a browser. */
  store() { return (this._store ??= inShell ? new ShellStore(call) : new IndexedDBStore('vrmxg-playground')); }
  async slots() { return this.store().list(); }
  /** Save the world now into a slot. → the slot's entry */
  async saveSlot(slot) {
    const svc = this.tree.services.get('save');
    const doc = svc.save({ name: `${this.scene} at ${(this.tree.clock.step / 60).toFixed(1)} s`, savedAt: new Date().toISOString() });
    const r = await this.store().write(slot, doc);
    this.lastSave = { slot, step: this.tree.clock.step, bytes: r.bytes, hash: hashValue(worldHashes(this.tree, { physicsBytes: true })) };
    this._changed();
    return this.lastSave;
  }
  /** Load a slot: a fresh world of its scene, the save restored into it, paused on the saved step. */
  async loadSlot(slot) {
    const doc = await this.store().read(slot);
    await this.load(doc.summary?.scene ?? this.scene);
    const step = await this.tree.services.get('save').load(doc);
    this.host.render(1);
    this.stats.step = step;
    this.lastLoad = { slot, step, hash: hashValue(worldHashes(this.tree, { physicsBytes: true })) };
    this._changed();
    return this.lastLoad;
  }

  /** Replay a recorded input file from now on (a path under the site root). */
  async replay(path = 'input/walk-in.json') {
    if (!this.input) return;
    const rec = await json(path);
    this.input.replay({ ...rec, start: this.tree.clock.step });
    this.play();
  }

  cameras() { return this.tree?.services.get('cameras')?.cameras.map((c) => c.id) ?? []; }
  /** What the player can do now ("Take Short sword"), from the interaction service's prompts, or null. */
  prompt() {
    const player = this.tree?.all().find((n) => n.type === 'Character' && n.behaviourEntries?.some((b) => b.use === 'player'));
    const f = player && this.tree.services.get('interact')?.focus.get(player.id);
    if (!f) return null;
    const item = this.tree.find(f.item);
    return { key: 'E', text: `${f.prompt ?? f.verb} ${item?.name ?? f.item}` };
  }

  /** What is being said now: [{ name, text, word, words }] (the voice service's captions, at the frame's blend). */
  captions() {
    // the line's own words, punctuation kept, when they pair one to one with the timed words (M3 W6)
    return (this.tree?.services.get('voice')?.captions(this.host.last.alpha ?? 1) ?? []).map((c) => {
      const tokens = String(c.text ?? '').trim().split(/\s+/);
      return tokens.length === c.words?.length ? { ...c, words: tokens } : c;
    });
  }

  // ---------------------------------------------------------------- dialogue (M3 W6): presentation, never the world

  /**
   * Speech bubbles: each line being said, over its speaker's head in screen pixels, and a "…" for a character whose
   * director is waiting on the model. Read from the world, written nowhere: the step is the same with them or without.
   * → [{ actor, name, kind: 'line' | 'thinking', words?, word?, spoken?, x, y }]
   */
  bubbles() {
    const tree = this.tree;
    if (!tree) return [];
    const out = this.captions().map((c) => ({ ...c, kind: 'line', ...this.screenOf(c.actor) }));
    for (const b of tree.services.get('ai')?.brains ?? []) if (b.bb.director?.pending && !out.some((o) => o.actor === b.node.id)) out.push({ actor: b.node.id, name: b.node.name ?? b.node.id, kind: 'thinking', ...this.screenOf(b.node.id) });
    return out.filter((o) => o.visible);
  }

  /**
   * Where a character's bubble goes, in the canvas's CSS pixels: above its head, kept inside the view. A speaker out of
   * frame gets its bubble pinned to the nearest edge (`edge`, drawn without a tail); one behind the camera gets none
   * (the caption still says it).
   */
  screenOf(id) {
    const n = /** @type {any} */ (this.tree?.find(id)), cam = this.host.camera ?? this.tree?.services.get('cameras')?.current?.camera;
    if (!n || !cam) return { visible: false };
    const head = n.vrm?.humanoid?.getNormalizedBoneNode?.('head');
    const p = head ? head.getWorldPosition(new Vector3()) : n.object3d.getWorldPosition(new Vector3()).add(new Vector3(0, 1.6, 0));
    p.y += 0.32;
    const v = p.project(cam), w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!(v.z < 1)) return { visible: false };
    const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
    const cx = Math.min(w - 150, Math.max(150, x)), cy = Math.min(h - 140, Math.max(60, y));
    return { x: Math.round(cx), y: Math.round(cy), visible: true, edge: Math.abs(cx - x) > 12 || Math.abs(cy - y) > 12 }; // a small nudge keeps the tail
  }

  /**
   * The post look (M4 W1's toggle; presentation only, the world is the same either way): 'scene' (what the scene's
   * Environment authors), 'none', or a preset ('anime', 'clean'), on either backend.
   * @param {string} choice
   */
  setPost(choice) {
    const env = this.tree?.all().find((n) => n.type === 'Environment');
    if (!env || !this.host?.post) return;
    if (this._authoredPost === undefined || this._postTree !== this.tree) { this._authoredPost = env.props.post ?? null; this._postTree = this.tree; }
    env.props.post = choice === 'scene' ? this._authoredPost : choice === 'none' ? null : choice;
    this.postChoice = choice;
    this.host.views.update(this.tree);
    if (!this.playing) this.host.render(1, false);
    this._changed();
  }

  /** The post look the toggle shows ('scene' after every load). */
  postLook() { return this._postTree === this.tree ? this.postChoice : 'scene'; }

  /** Speech bubbles in the canvas on or off (presentation: the world is the same either way). */
  setBubbles(on) { if (!this.text) return; this.text.bubbles = !!on; if (this.tree && !this.playing) this.host.render(1, false); }
  /** Name tags over the characters on or off. */
  setNameTags(on) { if (!this.text) return; this.text.nameTags = !!on; if (!on) { for (const t of this.text.tags.values()) { this.text.group.remove(t.text); t.dispose(); } this.text.tags.clear(); } if (this.tree && !this.playing) this.host.render(1, false); }

  /**
   * The drawn frame's hash (FNV-1a of the RGBA read-back, as exports hash theirs). WebGL reads the drawing buffer as the
   * last render left it (call right after one); WebGPU can't read its canvas, so the frame is drawn again into the
   * readback's output target (M4 W2) and read from there. WebGPU's rows are top-down, so the two backends' hashes of
   * the same picture differ (they differ anyway: the backends' pixels aren't the same).
   */
  async frameHash() {
    const host = this.host, { width: w, height: h } = host.drawingBufferSize(), buf = new Uint8Array(w * h * 4);
    if (host.backend === 'webgl') { const gl = host.renderer.getContext(); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf); return hashFrame(buf); }
    const rb = readbackFor(host, w, h);
    host.advanceNodeFrame(); // a frame of its own: passes and shadow maps redraw (AB-T-0554 gotcha 1), as captureStill does
    await rb.draw(() => host.render(host.last.alpha ?? 1, false));
    await rb.readNow(buf);
    rb.release();
    return hashFrame(buf);
  }

  /**
   * M4 W2 (?mode=frames&renderer=webgpu|webgl): particles and readback on this page's backend (frames.js): check 13
   * drawn and restored mid-effect, the morning film exported twice, captureStill against the canvas, the readback's cost.
   * @param {{ parts?: string[], film?: object }} [o]
   */
  async framesCheck(o = {}) {
    await this.load(this.scene ?? 'cafe.vrmxs');
    this.pause();
    this.setBubbles(false);
    const R = await loadRapier(), sample = await loadSample(bytes);
    // export hosts get the view's post: each backend's own stack (pmndrs on WebGL, TSL on WebGPU since M4 W1)
    const post = { loadCube: async (file) => new TextDecoder().decode(await bytes(file)) };
    return framesCheck({ R, sample, opts: { vrmxaCore, closet, behaviours }, backend: this.host.backend, post, view: this.host, canvas: this.canvas, ...o });
  }

  /**
   * M4 W8 (?mode=coverage&renderer=webgpu|webgl): the sample script's coverage by rule and a thumbnail per shot,
   * rendered from snapshots on this page's backend (coverage-check.js).
   */
  async coverageCheck(o = {}) {
    await this.ready;
    const R = await loadRapier();
    const post = { loadCube: async (file) => new TextDecoder().decode(await bytes(file)) };
    return coverageCheck({ R, bytes, opts: { vrmxaCore, closet, behaviours }, backend: this.host.backend, post, ...o });
  }

  /**
   * M4 W7 (?mode=voicing): the voiced sample sequence replayed from its baked track, no renderer involved
   * (voicing-check.js); acceptance/m4/voicing.mjs compares it with Node's.
   */
  async voicingCheck(o = {}) {
    await this.ready;
    return voicingCheck({ R: await loadRapier(), bytes, opts: { vrmxaCore, closet, behaviours }, ...o });
  }

  /**
   * M4 W9 (?mode=takes): the sample's three take logs made into tracks and the film played with them, no renderer
   * involved (takes-check.js); acceptance/m4/takes.mjs compares it with Node's.
   */
  async takesCheck() {
    await this.ready;
    return takesCheck({ R: await loadRapier(), bytes, opts: { vrmxaCore, closet, behaviours } });
  }

  /**
   * M4 W0 (?mode=backends): the cafe on this page's backend, drawn the way an export draws. The recorded walk replays
   * from a fresh load; five consecutive offline frames (host.frameAt, no yield to rAF between them: AB-T-0554 gotcha 1)
   * and a still are read with toDataURL right after each draw, then decoded and hashed. In WKWebView, drawImage of a
   * WebGPU canvas gives the last *presented* frame even right after render(), so every offline frame looked the same;
   * toDataURL in the drawing task gives the frame just drawn (Chromium gives it either way). On WebGL each draw is also
   * read through gl.readPixels and hashed as exports hash theirs (`glFrames`, `glStill`). Speech bubbles are off
   * (troika's are WebGL-only for now). `compareWith`: another backend's still as a PNG data URL, compared pixel by pixel.
   * The check owns the canvas (AB-T-0587) at `width`×`height`, pixel ratio 1: no paused-loop draws, and no resize from
   * the page's layout. Before, it drew at whatever size the canvas had, and in WKWebView the layout's ResizeObserver
   * sometimes arrived only after the frames (1280×561 instead of 1280×485): the other image set, d60fac47.
   * @param {{ steps?: number[], still?: number, compareWith?: string | null, width?: number, height?: number }} [o]
   */
  async backendCheck({ steps = [300, 301, 302, 303, 304], still = 420, compareWith = null, width = 1280, height = 720 } = {}) {
    await this.ready;
    const ratio = this.host.renderer.getPixelRatio(), buf = this.host.drawingBufferSize();
    const cssW = buf.width / ratio, cssH = buf.height / ratio; // as at() in _postChecks: restored even if the canvas has no box
    this.offline = true;
    try { return await this._backendCheck({ steps, still, compareWith, width, height }); }
    finally {
      this.host.renderer.setPixelRatio(ratio);
      if (cssW && cssH) this.host.resize(cssW, cssH);
      this.offline = false; // back to the page's layout, when the canvas has one (a hidden page keeps the size above)
    }
  }

  /** @param {{ steps: number[], still: number, compareWith: string | null, width: number, height: number }} o */
  async _backendCheck({ steps, still, compareWith, width, height }) {
    await this.load(this.scene ?? 'cafe.vrmxs');
    this.pause();
    this.setBubbles(false);
    const host = this.host;
    host.renderer.setPixelRatio(1); host.resize(width, height);
    this.input.replay({ ...(await json('input/walk-in.json')), start: this.tree.clock.step });
    /** A PNG data URL's pixels and their FNV-1a hash. */
    const pixels = async (url) => {
      const img = new Image(); img.src = url; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let h = 0x811c9dc5; for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 0x01000193) >>> 0;
      return { hash: h.toString(16).padStart(8, '0'), data: d };
    };
    const gl = host.backend === 'webgl' ? host.renderer.getContext() : null;
    let last = null, lastGL = null;
    const sizes = new Set();
    const draw = host.render.bind(host);
    host.render = (alpha, stepped) => { // read in the drawing task
      draw(alpha, stepped);
      last = this.canvas.toDataURL('image/png');
      const { width: w, height: h } = host.drawingBufferSize();
      sizes.add(`${w}x${h}`);
      if (gl) { const b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); lastGL = hashFrame(b); }
    };
    const urls = [], glFrames = [];
    let ms = 0, glStill = null;
    try {
      for (const s of steps) { await host.frameAt(s, 0.5); urls.push(last); glFrames.push(lastGL); }
      const t0 = performance.now();
      await host.frameAt(still, 0.5);
      ms = performance.now() - t0; // the frame and its reads
      glStill = lastGL;
    } finally { host.render = draw; }
    if (sizes.size !== 1 || !sizes.has(`${width}x${height}`)) throw new Error(`backendCheck: the drawing buffer was ${[...sizes].join(', ')}, not ${width}x${height} throughout`);
    const png = last, shot = await pixels(png);
    const frames = []; for (const u of urls) frames.push((await pixels(u)).hash);
    let diff = null;
    if (compareWith) {
      const o = (await pixels(compareWith)).data, d = shot.data;
      let sum = 0, over8 = 0, max = 0;
      for (let i = 0; i < d.length; i += 4) {
        const m = Math.max(Math.abs(d[i] - o[i]), Math.abs(d[i + 1] - o[i + 1]), Math.abs(d[i + 2] - o[i + 2]));
        sum += m; if (m > 8) over8++; if (m > max) max = m;
      }
      diff = { meanMaxChannel: +(sum / (d.length / 4)).toFixed(3), over8: +(over8 / (d.length / 4)).toFixed(5), max };
    }
    const materials = new Set(); this.tree.find('mira')?.object3d.traverse((o) => { for (const m of [o.material ?? []].flat()) materials.add(m.type); });
    return {
      backend: host.backend, isWebGPUBackend: !!host.renderer.backend?.isWebGPUBackend, size: [this.canvas.width, this.canvas.height],
      steps, frames, distinct: new Set(frames).size, still, stillHash: shot.hash, stillMsWithRead: +ms.toFixed(1), png, diff,
      ...(gl ? { glFrames, glStill } : {}),
      materials: [...materials], environment: !!host.scene.environment,
    };
  }

  /** The world's hash now (the presentation checks compare it with the dialogue UI on and off). */
  worldHash() { return this.tree ? hashValue(worldHashes(this.tree, { physicsBytes: true })) : null; }

  // ---------------------------------------------------------------- the camera (M3 W5, ?camera)

  /**
   * Turn the camera on: the Mac shell's (native capture, AB-T-0544's verdict), or outside it the recorded frames
   * ?frames=<file> names. Each detected event applies on the next step and is logged.
   */
  async cameraOn() {
    if (!this.world?.sense) throw new Error('open the playground with ?camera');
    if (this.camera?.on) return this.camera;
    const framesRef = new URLSearchParams(location.search).get('frames');
    let source;
    if (inShell) source = shellCamera({ call, on: shellOn });
    else if (framesRef) source = recordedFrames(JSON.parse(new TextDecoder().decode(await bytes(framesRef))).frames, { now: () => performance.now() });
    else throw new Error('the camera runs in the Mac app (apps/playground-mac); in a browser, replay recorded frames with ?frames=<file>');
    this.cameraEvents = [];
    this.camera = connectCamera(this.world.sense, source, { keep: true, onEvent: (e) => { this.cameraEvents.push({ ...e, step: this.tree.clock.step }); this._changed(); } });
    this.cameraInfo = await this.camera.start({ fps: 15, device: inShell ? this.cameraDevice : null });
    this._changed();
    return this.camera;
  }
  async cameraOff() { await this.camera?.stop(); this._changed(); }
  /** The cameras the Mac shell sees (built-in, display, USB, capture cards), for a picker; [] outside the shell. */
  async cameraDevices() { return inShell ? shellCamera({ call, on: shellOn }).devices() : []; }
  /** The camera to use (an id from cameraDevices; null: the system's default). Remembered in this browser profile. */
  get cameraDevice() { try { return localStorage.getItem('vrmxg.camera.device') || null; } catch { return null; } }
  set cameraDevice(id) { try { if (id) localStorage.setItem('vrmxg.camera.device', id); else localStorage.removeItem('vrmxg.camera.device'); } catch { /* storage off */ } }
  /** The camera's state for the UI: on, someone there, the last event. */
  cameraStatus() {
    if (!this.world?.sense) return null;
    const v = this.world.sense.viewer, last = this.cameraEvents?.filter((e) => e.type !== 'face').at(-1);
    return { on: !!this.camera?.on, present: v.present, last: last ? (last.type === 'presence' ? (last.present ? 'appeared' : 'left') : last.type) : null, events: this.world.sense.log.filter((e) => e.type !== 'face').length };
  }
  /** What a session kept (no images): the feature frames, the events as logged by step, and the step it reached. */
  cameraSession() { return { format: 'vrmxg-camera-session', version: 1, scene: this.scene, step: this.tree.clock.step, device: this.cameraInfo?.device ?? null, frames: this.camera?.frames ?? [], log: this.world?.sense?.record() ?? [] }; }

  /** ?fall (M3 W7): knock Mira and Hana down the stairs. */
  knockDown(impulse) {
    if (!this.fall) throw new Error('open the playground with ?fall for the stairs');
    knockDownStairs(this.tree, impulse);
    this._changed();
  }

  /** Say something to the character you talk to (typed chat, a choice): its director takes it from here. */
  talk(text) {
    if (!this.director) throw new Error('no director: open the playground with ?director=demo, or ?director=http://127.0.0.1:5191/v1/chat/completions');
    const t = String(text ?? '').trim();
    if (!t) return null;
    const id = this.director.talk(this.talkTo, t);
    this._changed();
    return id;
  }

  /** Listen to the person's voice, or stop (voice.js). */
  async toggleListening() {
    if (!this.listening?.available) throw new Error('no microphone path: the Mac app, or ?stt=<loopback url> in a browser');
    if (this.listening.active) await this.listening.stop(); else { await this.listening.start(); if (!this.playing) this.play(); }
    this._changed();
  }

  /** Replies the person can pick (the character's app persona `replies`, else a few general ones). */
  choices() {
    if (!this.director) return [];
    return this.world?.personas?.appOf(this.talkTo)?.replies ?? ['Hello!', 'How are you today?', 'See you later!'];
  }

  /** What the player wears (the closet at run time), for a status line. */
  wearing() {
    const closet = this.tree?.services.get('closet');
    const player = this.tree?.all().find((n) => n.type === 'Character' && n.behaviourEntries?.some((b) => b.use === 'player'));
    if (!closet || !player) return '';
    const c = closet.closetOf(player.id);
    return closet.wornBy(player.id).map((w) => `${c.items.find((x) => x.id === w.id)?.name ?? w.id}${w.state ? ` (${w.state})` : ''}`).join(', ');
  }

  currentCamera() { const c = this.tree?.services.get('cameras')?.current; return c ? { id: c.id, preset: c.preset } : null; }
  setCamera(id) { this.tree?.find(id)?.call('makeCurrent'); this._changed(); }
  setPreset(preset) { const c = this.tree?.services.get('cameras')?.current; if (c) c.call('setPreset', { preset }); this._changed(); }
  setDebug(kinds) { if (!this.host) return; this.host.debug.set(kinds); if (this.tree && !this.playing) this.host.render(1, false); }
  setInterpolation(on) { if (this.host) this.host.interpolate = on; }

  _changed() { this.onChange?.(); }

  _loop() {
    if (this._running) return;
    this._running = true;
    const tick = (t) => {
      requestAnimationFrame(tick);
      if (!this.tree || this.offline) return;
      const dt = this._last === null ? 0 : Math.min(0.25, (t - this._last) / 1000);
      if (this._last !== null) this._frames.push(t - this._last);
      this._last = t;
      try {
        if (this.playing) {
          const t0 = performance.now();
          const { steps } = this.host.frame(dt);
          this.director?.pump();
          const total = performance.now() - t0;
          this._render.push(this.host.last.renderMs); this._sim.push(Math.max(0, total - this.host.last.renderMs) / Math.max(1, steps));
          this.stats.steps = steps; this.stats.alpha = this.host.last.alpha;
        } else this.host.render(1, false);
      } catch (e) { this.error = String(e?.stack ?? e); this.pause(); console.error(e); }
      this.stats.step = this.tree.clock.step;
      // captions word by word, and bubbles following their speakers (M3 W6): the controls refresh while anyone speaks or thinks
      const talking = this.tree.services.get('voice')?.lines.size || this.tree.services.get('ai')?.brains.some((b) => b.bb.director?.pending);
      if (this.playing && talking && this._frames.length % 2 === 0) this._changed();
      if (this._frames.length >= 15) {
        const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
        this.stats.frameMs = avg(this._frames); this.stats.fps = 1000 / this.stats.frameMs;
        if (this._sim.length) this.stats.simMs = avg(this._sim);
        if (this._render.length) this.stats.renderMs = avg(this._render);
        this._frames = []; this._sim = []; this._render = [];
        this._changed();
      }
    };
    requestAnimationFrame(tick);
  }
}

/** Mean SSIM (luminance, 8×8 windows) of a 1080p frame against a 4K one box-filtered down to it. */
function ssimDown(a, b4, w, h) {
  const lum = (r, g, bl) => 0.299 * r + 0.587 * g + 0.114 * bl;
  const A = new Float32Array(w * h), B = new Float32Array(w * h), W4 = w * 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; A[y * w + x] = lum(a[i], a[i + 1], a[i + 2]);
    let s = 0; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const j = ((y * 2 + dy) * W4 + x * 2 + dx) * 4; s += lum(b4[j], b4[j + 1], b4[j + 2]); }
    B[y * w + x] = s / 4;
  }
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  let total = 0, n = 0;
  for (let y = 0; y + 8 <= h; y += 4) for (let x = 0; x + 8 <= w; x += 4) {
    let ma = 0, mb = 0; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { ma += A[(y + j) * w + x + i]; mb += B[(y + j) * w + x + i]; }
    ma /= 64; mb /= 64;
    let va = 0, vb = 0, cov = 0; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const da = A[(y + j) * w + x + i] - ma, db = B[(y + j) * w + x + i] - mb; va += da * da; vb += db * db; cov += da * db; }
    va /= 63; vb /= 63; cov /= 63;
    total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); n++;
  }
  return total / n;
}
