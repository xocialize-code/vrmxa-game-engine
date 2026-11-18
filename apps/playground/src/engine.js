// The playground's engine host, outside Vue: the SceneTree, the render host and the frame loop live here,
// never in reactive state (a reactive proxy around three.js objects costs every access and breaks identity).
// The UI talks to it through plain methods and reads a small stats object a few times a second.
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { KeyboardDevice, MouseDevice, GamepadDevice } from '@vrmxg/input';
import { PRESETS } from '@vrmxg/camera';
import { RenderHost } from '@vrmxg/render';
import { loadSample, buildWorld } from './world.js';
import { serialize } from '@vrmxg/scene';
import { runSimulation, runDevices, runAudio, STEPS } from './acceptance.js';
import { AudioOutput } from '@vrmxg/audio';
import { worldHashes, hashValue } from '@vrmxg/snapshot';
import * as core from '@vrmxa-core/index.js';
import * as anim from '@vrmxa-core/anim/index.js';
import * as closet from '@vrmxa-core/closet/index.js';
import * as projectBehaviours from '@content/behaviours.js';
import './sqljs.js';

installPortableMath(); // before anything parses a VRM or steps a world
const vrmxaCore = { ...core, ...anim };
const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
const bytes = async (ref) => { const r = await fetch(ref); if (!r.ok) throw new Error(`${ref}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); };
const json = async (ref) => JSON.parse(new TextDecoder().decode(await bytes(ref)));

export { vrmxaCore, behaviours, bytes };

export { PRESETS };

export class Playground {
  /** @param {HTMLCanvasElement} canvas @param {{ preserveDrawingBuffer?: boolean }} [opts] */
  constructor(canvas, { preserveDrawingBuffer = false } = {}) {
    this.canvas = canvas;
    this.host = new RenderHost({ canvas, preserveDrawingBuffer });
    this.tree = null; this.input = null;
    this.playing = false;
    this.stats = { frameMs: 0, fps: 0, simMs: 0, renderMs: 0, step: 0, alpha: 0, steps: 0 };
    this._frames = []; this._sim = []; this._render = [];
    this._last = null;
    this.devices = null;
    this.onChange = null;
    this.error = null;
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  resize() { const r = this.canvas.getBoundingClientRect(); if (r.width && r.height) this.host.resize(r.width, r.height); }

  /**
   * Load a scene of the sample project (a path under the site root). `text`: the scene's own JSON instead of the
   * file at that path (a scene opened through the Mac shell); its asset refs still resolve against the site.
   */
  async load(scene = 'cafe.vrmxs', { text } = {}) {
    this.pause();
    const R = await loadRapier();
    const read = text === undefined ? bytes : async (ref) => (ref === scene ? new TextEncoder().encode(text) : bytes(ref));
    this.sample = await loadSample(read, scene);
    if (!this.audio) { this.audio = new AudioOutput(); this.audio.unlockOn(window); } // one output for every load; heard after the first gesture
    this.tree?.services.get('audio')?.dispose();
    const { tree, input, models } = await buildWorld(R, this.sample, { vrmxaCore, closet, behaviours, audioOutput: this.audio });
    if (!this.devices) {
      this.devices = { keyboard: new KeyboardDevice(), mouse: new MouseDevice(), gamepad: new GamepadDevice() };
      this.devices.keyboard.attach(window); this.devices.mouse.attach(this.canvas);
    }
    for (const d of Object.values(this.devices)) input.addDevice(d);
    this.tree = tree; this.input = input; this.scene = scene;
    // the prompt and what the player wears change on signals: refresh the controls then, not on the next stats tick
    for (const n of tree.all()) if (n.type === 'Character') { n.on('focusChanged', () => this._changed()); n.on('dressed', () => this._changed()); }
    this.host.attach(tree);
    this.resize();
    this.host.render(1);
    this._loop();
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
    const audio = await runAudio(R, sample, opts, { silentFinal: simulation.final });
    const rendered = await this._renderedChecks(simulation);
    return { simulation, devices, audio, rendered };
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
      presets, debug, calls: host.renderer.info.render.calls, triangles: host.renderer.info.render.triangles,
    };
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

  /** Replay a recorded input file from now on (a path under the site root). */
  async replay(path = 'input/walk-in.json') {
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
  captions() { return this.tree?.services.get('voice')?.captions(this.host.last.alpha ?? 1) ?? []; }

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
  setDebug(kinds) { this.host.debug.set(kinds); if (!this.playing) this.host.render(1, false); }
  setInterpolation(on) { this.host.interpolate = on; }

  _changed() { this.onChange?.(); }

  _loop() {
    if (this._running) return;
    this._running = true;
    const tick = (t) => {
      requestAnimationFrame(tick);
      if (!this.tree) return;
      const dt = this._last === null ? 0 : Math.min(0.25, (t - this._last) / 1000);
      if (this._last !== null) this._frames.push(t - this._last);
      this._last = t;
      try {
        if (this.playing) {
          const t0 = performance.now();
          const { steps } = this.host.frame(dt);
          const total = performance.now() - t0;
          this._render.push(this.host.last.renderMs); this._sim.push(Math.max(0, total - this.host.last.renderMs) / Math.max(1, steps));
          this.stats.steps = steps; this.stats.alpha = this.host.last.alpha;
        } else this.host.render(1, false);
      } catch (e) { this.error = String(e?.stack ?? e); this.pause(); console.error(e); }
      this.stats.step = this.tree.clock.step;
      if (this.playing && this.tree.services.get('voice')?.lines.size && this._frames.length % 6 === 0) this._changed(); // captions, word by word
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
