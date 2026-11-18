// The playground's engine host, outside Vue: the SceneTree, the render host and the frame loop live here,
// never in reactive state (a reactive proxy around three.js objects costs every access and breaks identity).
// The UI talks to it through plain methods and reads a small stats object a few times a second.
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { parse } from '@vrmxg/scene';
import { SceneTree } from '@vrmxg/core';
import { loadRapier, installPhysics } from '@vrmxg/physics';
import { installCharacters } from '@vrmxg/character';
import { installInput, KeyboardDevice, MouseDevice, GamepadDevice } from '@vrmxg/input';
import { installCameras, PRESETS } from '@vrmxg/camera';
import { installModels } from '@vrmxg/model';
import { RenderHost } from '@vrmxg/render';
import * as core from '@vrmxa-core/index.js';
import * as anim from '@vrmxa-core/anim/index.js';
import * as projectBehaviours from '@content/behaviours.js';
import './sqljs.js';

installPortableMath(); // before anything parses a VRM or steps a world
const vrmxaCore = { ...core, ...anim };
const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
const bytes = async (ref) => { const r = await fetch(ref); if (!r.ok) throw new Error(`${ref}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); };
const json = async (ref) => JSON.parse(new TextDecoder().decode(await bytes(ref)));

export { PRESETS };

export class Playground {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.host = new RenderHost({ canvas });
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

  /** Load a scene of the sample project (a path under the site root). */
  async load(scene = 'cafe.vrmxs') {
    this.pause();
    const R = await loadRapier();
    const doc = parse(new TextDecoder().decode(await bytes(scene)));
    const prefabs = new Map();
    const walk = async (d) => { for (const a of d.assets ?? []) if (a.type === 'vrmxs' && !prefabs.has(a.ref)) { const p = parse(new TextDecoder().decode(await bytes(a.ref))); prefabs.set(a.ref, p); await walk(p); } };
    await walk(doc);
    const animDoc = await json('animations.json');
    const clips = new Map();
    for (const c of animDoc.clips) clips.set(c.sha256, await bytes(c.file));
    const tree = new SceneTree({ registry: m0Registry(), prefabs, behaviours, seed: 1 });
    const input = installInput(tree);
    installPhysics(tree, R);
    const lib = installCharacters(tree, { resolve: bytes, vrmxaCore, prefabs, projectAnimations: { doc: animDoc, clips } });
    installCameras(tree);
    const models = installModels(tree, { resolve: bytes });
    await models.prepare(doc);
    await lib.prepare(doc);
    tree.instantiate(doc);
    if (!this.devices) {
      this.devices = { keyboard: new KeyboardDevice(), mouse: new MouseDevice(), gamepad: new GamepadDevice() };
      this.devices.keyboard.attach(window); this.devices.mouse.attach(this.canvas);
    }
    for (const d of Object.values(this.devices)) input.addDevice(d);
    this.tree = tree; this.input = input; this.scene = scene;
    this.host.attach(tree);
    this.resize();
    this.host.render(1);
    this._loop();
    this._changed();
    return { nodes: tree.all().length, skipped: models.skipped };
  }

  play() { this.playing = true; this._last = null; this._changed(); }
  pause() { this.playing = false; this._changed(); }
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
