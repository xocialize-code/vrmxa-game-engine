// The game app's engine host, outside Vue (M5 W1): the build, the play session, the render host, the input devices and
// the frame loop live here, never in reactive state. The UI calls plain methods and re-reads `state` when told to.
//
// The frame loop steps the session (GameSession.advance → GameFlow.step), never a tree directly: a scene change
// replaces the world inside a step, and the render host follows it (onWorld). Presentation blends between the last two
// steps as the render host's own frame() does. While a menu is open nothing steps.
//
// A lost GPU device (M6 W6, AB-T-0639): WebKit kills its GPU process when a Metal command buffer fails. The render host
// says so (onLost) and draws nothing more; this host stops stepping, says "The display stopped…" in a status line, and
// makes a render host in its place on a fresh canvas (RenderHost.replace: WebGPU again, else three's WebGL2 backend),
// with the world being played attached as it is. The simulation isn't touched, so play goes on from the same step with
// the same hashes as an unbroken session (acceptance/m6/device-loss.mjs). The status line goes once a new frame is
// drawn. When no renderer can be made, the game is held paused and the pause menu offers Save.
import { RenderHost } from '@vrmxg/render';
import { loadRapier } from '@vrmxg/physics';
import { KeyboardDevice, MouseDevice, GamepadDevice, InputService } from '@vrmxg/input';
import { AudioOutput } from '@vrmxg/audio';
import { ShellStore, IndexedDBStore } from '@vrmxg/save';
import { disposeWorld } from '../../editor/src/dispose.js';
import { gameScenes, worldLoader } from './world.js';
import { GameSession } from './session.js';
import { HeldGate, PadNavigator, StepGate } from './nav.js';
import { saveName } from './slots.js';

export class GameHost {
  /**
   * @param {object} o
   * @param {HTMLCanvasElement} o.canvas
   * @param {any} o.build an opened build (@vrmxg/bundle openBuild)
   * @param {'auto' | 'webgpu' | 'webgl'} o.backend
   * @param {{ vrmxaCore: any, closet: any }} o.characters vrmxa-core and its closet module
   * @param {{ inShell: boolean, call: (method: string, params?: any) => Promise<any> }} o.shell
   * @param {boolean} [o.trace] keep a hash of the world after every step (a runner reads the session's log)
   * @param {() => void} [o.onChange] the state changed (the UI re-reads it)
   * @param {(command: string) => void} [o.onCommand] a gamepad's menu command, or 'pause' (Start while playing)
   * @param {(event: any) => void} [o.onEvent] the flow's events
   * @param {() => boolean} [o.hold] true while a menu or a question is up: nothing steps then, whatever else happens
   * @param {any} [o.uiSettings] the player's volumes and bindings (@vrmxg/game-ui's GameSettings): put on every world's
   *   input service before its first step, and on the audio output
   * @param {string[] | null} [o.recoverWith] the backends a lost renderer is made again on, in order (null: the render
   *   host's own order, WebGPU again and then WebGL; `?recover=webgl-fallback` asks for the fallback in a check)
   */
  constructor({ canvas, build, backend, characters, shell, trace = false, onChange = () => {}, onCommand = () => {}, onEvent = () => {}, hold = () => false, uiSettings = null, recoverWith = null }) {
    this.canvas = canvas; this.build = build; this.game = build.game; this.shell = shell;
    this.characters = characters; this.onChange = onChange; this.onCommand = onCommand; this.onEvent = onEvent;
    this.render = /** @type {RenderHost | null} */ (null);
    this.state = { backend: '', playing: false, paused: false, loading: '', step: 0, scene: null, held: null, error: null, outcome: null, lastSlot: null, dirty: false, display: '' };
    /** Each lost device and what came of it (M6 W6): { step, scene, lost, backend, tried, ms } or { …, failed }. */
    this.recoveries = [];
    /** What the status line said and when (M6 W6): { text, step }, a new entry each time it changes. */
    this.displays = [];
    this.recoverWith = recoverWith;
    /** Waits (ms) between tries to make a lost renderer again, before giving up (M6 W6). */
    this.retryWaits = [1500, 3000, 6000];
    this._recovering = false; this._awaitFrame = false; this._losses = /** @type {number[]} */ ([]); this._givenUp = /** @type {RenderHost | null} */ (null);
    this.store = shell.inShell ? new ShellStore(shell.call) : new IndexedDBStore(`vrmxg-game-${this.game.id}`);
    /** @type {Map<any, any>} tree → its world, for disposing it */ this.worlds = new Map();
    this.characterCache = { sources: new Map(), clips: new Map() }; // read bundles and parsed clips, kept between worlds
    this.audio = null;
    this.keyboard = new HeldGate(new KeyboardDevice());
    this.mouse = new HeldGate(new MouseDevice());
    this.gamepad = new HeldGate(new GamepadDevice());
    this.pad = new GamepadDevice(); this.nav = new PadNavigator();
    this.hold = hold;
    this.uiSettings = uiSettings;
    /** The input service whose devices a menu reads while no world is played (the title menu's settings): the game's map. */
    this.menuInput = /** @type {InputService | null} */ (null);
    /** The input service the menus hold (input.hold('menu')) while one is open, or null. */
    this._claimed = /** @type {InputService | null} */ (null);
    this.stepping = new StepGate([this.keyboard, this.mouse, this.gamepad]);
    this.trace = trace;
    this.session = /** @type {GameSession | null} */ (null);
    this._last = null; this._running = false;
    this._resized = new ResizeObserver(() => this.resize());
    this._resized.observe(canvas);
    this._onClick = () => this.capturePointer(); // on the canvas (a click asks for mouse look): moved to a fresh one with it
    canvas.addEventListener('click', this._onClick);
  }

  /** The render host on the backend asked for, the build's behaviours and scenes, Rapier: ready to start a game. */
  async open(backend) {
    const build = this.build;
    this.render = await RenderHost.create({ canvas: this.canvas, backend, post: { loadCube: (file) => build.text(file) } });
    this.render.onLost = (lost) => this._lost(lost);
    this._mtoon = this.render.mtoonMaterial; // worlds built while a lost renderer is being replaced take the same kind
    this.state.backend = this.render.backend;
    this.resize();
    const behaviours = await build.behaviours((path) => import(/* @vite-ignore */ new URL(path, location.href).href));
    const scenes = gameScenes(build.bytes, this.game);
    const { scenes: docs, prefabs } = await scenes.documents();
    const R = await loadRapier();
    this.audio = new AudioOutput(); this.audio.unlockOn(window);
    this.keyboard.device.attach(window); this.mouse.device.attach(this.canvas);
    const actions = await build.actions();
    // the menus' input while no world is played: the game's map with the app's devices, never stepped (a stand-in tree)
    this.menuInput = new InputService(/** @type {any} */ ({ clock: { step: 0 } }), actions ? { actions } : {});
    for (const d of [this.keyboard, this.mouse, this.gamepad]) this.menuInput.addDevice(d);
    this.uiSettings?.applyTo({ input: this.menuInput, audio: this.audio });
    const load = worldLoader({
      R, scenes, behaviours, actions, physics: this.game.physics ?? null, ...this.characters, // the game's collision layers (M6 W3)
      options: () => ({ mtoonMaterial: this.render?.mtoonMaterial ?? this._mtoon, audioOutput: this.audio, characterCache: this.characterCache }), // a lost renderer being replaced: the same kind
      onBuilt: (world) => {
        this.worlds.set(world.tree, world);
        for (const d of [this.keyboard, this.mouse, this.gamepad]) world.input.addDevice(d);
        this.uiSettings?.applyTo({ input: world.input }); // the player's bindings, before the world's first step
      },
    });
    this.session = new GameSession({
      game: this.game, digest: build.manifest.digest, compat: build.manifest.compat ?? null, load, unload: (tree) => this._dispose(tree), store: this.store,
      stamp: () => new Date().toISOString(), seed: 1, scenes: docs, prefabs, hashes: this.trace,
      onWorld: (tree) => { this.render?.attach(tree); this.resize(); this._changed(); }, // while a renderer is being replaced, it takes the world
      onEvent: (e) => { this.onEvent(e); this._changed(); },
    });
    this._loop();
    this._changed();
    return this;
  }

  _dispose(tree) {
    const world = this.worlds.get(tree);
    this.worlds.delete(tree);
    if (this.render?.tree === tree) this.render.detach();
    if (world) disposeWorld(world); else tree?.services?.get('physics')?.world?.free?.();
  }

  resize() { const r = this.canvas.getBoundingClientRect(); if (this.render && r.width && r.height) this.render.resize(r.width, r.height); }

  // ---------------------------------------------------------------- a lost GPU device (M6 W6)

  /**
   * The render host lost its device: make one in its place and draw the world being played on it. Nothing steps
   * meanwhile (the frame loop needs a render host showing the session's tree), so the next step is the one that was
   * due. Losses come in bursts when a GPU process dies more than once: after three in a minute, it stops trying.
   */
  async _lost(lost) {
    const old = this.render;
    if (!old || this._recovering) return;
    this.render = null; this._awaitFrame = false;
    const t0 = performance.now();
    this._display('The display stopped. Restarting it…');
    console.warn(`[game] the renderer's device was lost (${lost.api}: ${lost.reason ?? 'no reason'}: ${lost.message}); restarting it`);
    this._losses = [...this._losses.filter((t) => t0 - t < 60000), t0];
    if (this._losses.length > 3) { old.dispose(); this._gaveUp(old, lost, t0, 'it was lost three times in a minute'); return; }
    await this._remake(old, lost, t0);
  }

  /**
   * Make a render host in place of `old` (lost, or one given up on) and draw the session's world on it. The new host's
   * onLost is set only once this is done: set on a host whose device already went meanwhile, it is called at once
   * (RenderHost's onLost), so a loss during recovery recovers again instead of leaving the game undrawn.
   */
  async _remake(old, lost, t0 = performance.now()) {
    this._recovering = true; this._changed();
    const at = { step: this.session?.step ?? null, scene: this.session?.scene ?? null };
    let host = null;
    try {
      // each try draws the world the session plays now (none, or one a Load started while a try failed and waited), never
      // one let go meanwhile (`tree` replaces the old host's, and what a failed try carried)
      // WebKit's GPU process takes a few seconds to come back after it was killed, and until then neither WebGPU nor
      // WebGL can be had (seen in the Mac app): try again after each of these waits before giving up
      for (let i = 0; ; i++) {
        try { host = await RenderHost.replace(old, { canvas: this._freshCanvas(), tree: this.session?.tree ?? null, ...(this.recoverWith ? { backends: this.recoverWith } : {}) }); break; }
        catch (e) {
          if (i >= this.retryWaits.length) throw e;
          console.warn(`[game] the renderer couldn't be made again yet (${e?.message ?? e}); trying again in ${this.retryWaits[i] / 1000} s`);
          await new Promise((ok) => setTimeout(ok, this.retryWaits[i]));
        }
      }
      const tree = this.session?.tree ?? null; // a game started or loaded meanwhile: its world
      if (tree && host.tree !== tree) host.attach(tree); else if (!tree && host.tree) host.detach();
      this.render = host; this._givenUp = null;
      this.state.backend = host.backend;
      this._last = null; // no catching up on the time it took
      this._awaitFrame = true; // the status line goes once the new host has drawn a frame
      this.resize();
      this.recoveries.push({ ...at, lost, backend: host.backend, tried: host.replaced?.tried ?? [], ms: performance.now() - t0 });
    } catch (e) {
      host = null;
      this._gaveUp(old, lost, t0, String(e?.message ?? e), at);
      console.error(e);
    } finally {
      this._recovering = false;
      this._changed();
    }
    if (host && this.render === host) host.onLost = (l) => this._lost(l); // after: a loss meanwhile is said now
  }

  /**
   * Nothing could draw (or it was lost too often): hold the game, open the pause menu, say to save. The simulation is
   * intact. Resume tries again (`resume`), with the given-up host's options.
   */
  _gaveUp(old, lost, t0, message, at = { step: this.session?.step ?? null, scene: this.session?.scene ?? null }) {
    this._givenUp = old;
    this.recoveries.push({ ...at, lost, failed: message, ms: performance.now() - t0 });
    this._display(`The display stopped and couldn't be restarted (${message}). Save your game from the pause menu; Resume tries again.`);
    this.onCommand('pause');
    this.pause();
  }

  _display(text) {
    if (this.state.display === text) return;
    this.state.display = text;
    this.displays.push({ text, step: this.session?.step ?? null });
    this._changed();
  }

  /**
   * A check's lost devices (M6 W6, `?lose=<step>:<how>,…`): each one made on the first frame the session is at or past
   * its step. `destroy`: GPUDevice.destroy(); `encoder`: createCommandEncoder throws as WebKit's does once its GPU process
   * has died (the device itself isn't lost); `context`: WEBGL_lose_context's loseContext(). → what was done, as it happens
   * @param {Array<{ at: number, how: string }>} plan
   */
  loseDevices(plan) {
    const done = [];
    const tick = () => {
      const next = plan[done.length];
      if (!next) return;
      requestAnimationFrame(tick);
      const step = this.session?.step ?? -1, render = this.render, r = render?.renderer;
      if (!r || render.lost || step < next.at) return;
      const device = r.backend?.device;
      if (next.how === 'destroy') device.destroy();
      else if (next.how === 'encoder') device.createCommandEncoder = () => { throw new Error('GPUDevice.createCommandEncoder: Unable to make command encoder.'); };
      else if (next.how === 'context') r.getContext().getExtension('WEBGL_lose_context').loseContext();
      else throw new Error(`?lose: no way to lose a device called "${next.how}" (destroy, encoder, context)`);
      done.push({ ...next, step, backend: render.backend });
    };
    requestAnimationFrame(tick);
    return done;
  }

  /**
   * A new canvas in the old one's place (the same id, attributes and styling): a canvas that had a WebGPU context can't
   * give a WebGL one, and a lost device's context is best left alone. The mouse, the resize watch and the click move.
   */
  _freshCanvas() {
    const old = this.canvas, next = /** @type {HTMLCanvasElement} */ (old.cloneNode(false));
    const focused = typeof document !== 'undefined' && document.activeElement === old;
    old.removeEventListener('click', this._onClick);
    old.replaceWith?.(next);
    this._resized.unobserve(old); this._resized.observe(next);
    next.addEventListener('click', this._onClick);
    this.mouse.device.detach(); this.mouse.device.attach(next);
    this.canvas = next;
    if (focused) next.focus?.();
    return next;
  }

  // ---------------------------------------------------------------- what the menus do

  /** New Game: the build's entry scene, from step 0. */
  async newGame() { return this._busy('Starting…', async () => { await this.session.newGame(); this.state.lastSlot = null; this.resume(); }); }

  /**
   * Play a recorded session back (M5 W10, `?replay=`): its log's segments one after another, each world drawn as live
   * play draws it, the input from the recording (the devices are ignored). `onDone(trace)` once every segment is played.
   * `onFail(error)` when it can't go on (a segment that won't start, a step that throws, the game ended or a save loaded
   * from the pause menu), so a caller waiting on it is never left waiting.
   * @param {any} log @param {{ onDone?: (trace: any[]) => void, onFail?: (error: any) => void }} [o]
   */
  async replay(log, { onDone = null, onFail = null } = {}) {
    return this._busy('Replaying…', async () => {
      await this.session.replay(log);
      this._replayDone = onDone; this._replayFail = onFail; this._replayNext = null;
      this.state.lastSlot = null;
      this.resume();
    });
  }

  // a replay whose segment's frames ran out: the next segment, or the end (between frames, never inside one)
  _replayStep() {
    const r = this.session?.replaying;
    if (!r) { if (this._replayDone) this._replayFailed(new Error('the replay was stopped: the game ended or a save was loaded')); return; }
    if (r.left > 0 || this._replayNext) return;
    this._replayNext = this.session.replayNext().then((more) => {
      this._replayNext = null;
      if (!more) { this.state.playing = false; const done = this._replayDone; this._replayDone = this._replayFail = null; done?.(this.session.trace.slice()); }
      this._changed();
    }, (e) => { this._replayNext = null; this.state.error = String(e?.message ?? e); console.error(e); this.pause(); this._replayFailed(e); });
  }

  _replayFailed(e) { const fail = this._replayFail; this._replayDone = this._replayFail = null; fail?.(e); }

  /**
   * Frame times from requestAnimationFrame (M5 W10, `?stats`): presentation only. `frames` drawn while playing, the
   * intervals between them (ms), how many took longer than 1.5 frames at 60 Hz (25 ms), and the worst.
   */
  frameStats() {
    const f = this._frames;
    if (!f) return null;
    const sorted = f.intervals.slice().sort((a, b) => a - b), pct = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null;
    const sum = f.intervals.reduce((a, b) => a + b, 0);
    return { frames: f.intervals.length, seconds: sum / 1000, fps: sum ? (f.intervals.length * 1000) / sum : null, mean: f.intervals.length ? sum / f.intervals.length : null, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: sorted.at(-1) ?? null, over25: f.intervals.filter((x) => x > 25).length, over34: f.intervals.filter((x) => x > 34).length, width: this.canvas.width, height: this.canvas.height };
  }
  keepFrameStats() { this._frames = { intervals: [], last: null }; }

  /** Load a slot (a player's or a checkpoint's) and play on from it. */
  async loadSlot(slot) {
    return this._busy('Loading…', async () => {
      await this.session.loadSlot(slot);
      if (!slot.startsWith('auto-')) this.state.lastSlot = slot;
      this.resume();
    });
  }

  /** Save the game being played into a player's slot. → the store's entry; throws what the store's write throws. */
  async saveSlot(slot) {
    const entry = await this.session.saveSlot(slot, { name: saveName({ title: this.game.title, view: this.session.view() }) });
    if (entry.kept) this.state.lastSlot = slot; // not when another save was loaded, or the game ended, while it was written
    this._changed();
    return entry;
  }

  /** The store's listing. */
  async slots() { return this.store.list(); }

  /** Stop stepping (a menu is open). */
  /** Stop stepping (a menu is open). Not while a game starts or a save loads: play resumes by itself when that ends. */
  pause() {
    if (!this.session?.active || this.state.loading) return false;
    this.state.playing = false; this.state.paused = true;
    this.mouse.device.unlock?.();
    if (this.audio?.running) this.audio.ctx.suspend?.();
    this._changed();
    return true;
  }

  /** Step again. What is held down now (the key or button that closed the menu) doesn't reach the game until let go. */
  resume() {
    if (!this.session?.active) return;
    // a display given up on (M6 W6): Resume tries to make it again, the count of recent losses started afresh
    if (!this.render && this._givenUp && !this._recovering) { const old = this._givenUp; this._givenUp = null; this._losses = []; this._display('Restarting the display…'); this._remake(old, old.lost ?? { api: 'none', reason: null, message: 'retry' }); }
    for (const g of [this.keyboard, this.mouse, this.gamepad]) g.arm();
    this.state.playing = true; this.state.paused = false; this._last = null;
    this.audio?.ctx.resume?.();
    this._changed();
  }

  /** Quit to Title: the session ends and its world is freed. → the session's log */
  quitToTitle() {
    const log = this.session?.end() ?? null;
    if (this._replayDone) this._replayFailed(new Error('the replay was stopped: Quit to Title'));
    this.render?.detach();
    this.state.playing = false; this.state.paused = false; this.state.lastSlot = null;
    this._changed();
    return log;
  }

  /** Ask for the pointer (mouse look) while playing: from a click on the canvas. */
  capturePointer() { if (this.state.playing) this.mouse.device.lock?.(); }

  /** The input service the menus and the settings controls read: the world being played's, else the menus' own. */
  input() { return this.session?.tree?.services.get('input') ?? this.menuInput; }

  async _busy(label, fn) {
    // one session change at a time: a second New Game or Load while one is under way (a double press) is refused
    if (this.state.loading) throw new Error(`${this.state.loading.replace(/…$/, '')} already`);
    this.state.loading = label; this.state.error = null; this._changed();
    try { return await fn(); } catch (e) { this.state.error = String(e?.message ?? e); console.error(e); throw e; } finally { this.state.loading = ''; this._changed(); }
  }

  _changed() {
    const s = this.session;
    Object.assign(this.state, { step: s?.step ?? 0, scene: s?.scene ?? null, held: s?.held ?? null, outcome: s?.view()?.outcome ?? null, dirty: !!s?.dirty });
    this.onChange();
  }

  // ---------------------------------------------------------------- the frame loop

  _loop() {
    if (this._running) return;
    this._running = true;
    let shown = -1;
    const tick = (t) => {
      requestAnimationFrame(tick);
      // the gamepad's menu commands, every frame (Start pauses a game being played)
      const pad = {}; this.pad.read(pad);
      for (const c of this.nav.poll(pad.gamepad ?? null, t / 1000)) this.onCommand(this.state.playing && c === 'start' ? 'pause' : c);
      const tree = this.session?.tree, render = this.render;
      // nothing steps without a render host drawing the session's world: none, another world's, or a lost one (M6 W6)
      if (!tree || !render || render.tree !== tree || render.lost) { this._last = null; this.stepping.update(true); return; }
      // a menu or a question up (one opened while a save loaded, say), or not playing: nothing steps
      const held = !this.state.playing || this.hold();
      const { step, resumed } = this.stepping.update(held);
      this._claim(held);
      if (resumed) this._last = null; // no catching up on the time the menu was open
      const dt = this._last === null ? 0 : Math.min(0.25, (t - this._last) / 1000);
      this._last = t;
      if (this._frames) {
        const f = this._frames;
        if (step && f.last !== null) f.intervals.push(t - f.last);
        f.last = step ? t : null;
      }
      try {
        if (step) { this._frame(tree, dt); this._replayStep(); }
        else render.render(1, false);
        if (this._awaitFrame && !render.lost && this.render === render) { this._awaitFrame = false; this._display(''); } // a new frame: the display is back
      } catch (e) {
        this.state.error = String(e?.message ?? e); console.error(e);
        this.pause();
        if (this._replayDone) this._replayFailed(e);
      }
      if (this.session?.step !== shown || this.session?.held !== this.state.held) { shown = this.session?.step ?? -1; this._changed(); }
    };
    requestAnimationFrame(tick);
  }

  // While a menu or a question is up the menus hold the world's input with their own claim (input.hold('menu')), which
  // the overlay's claim (a conversation) never releases, nor this one the overlay's. A new world (a load behind a menu)
  // takes the claim with it (carryTo); it is released on the world being played when the menus close.
  _claim(held) {
    const input = this.session?.tree?.services.get('input') ?? null;
    if (held && input) {
      if (this._claimed !== input) { this._claimed?.release('menu'); input.hold('menu'); this._claimed = input; }
    } else if (this._claimed) {
      this._claimed.release('menu');
      if (input && input !== this._claimed) input.release('menu');
      this._claimed = null;
    }
  }

  // Live play over the session: as RenderHost.frame, but each step goes through the flow (scene changes, checkpoints).
  // A scene change replaces the tree inside a step: the frame ends there and the next one draws the new world.
  _frame(tree, dt) {
    const render = this.render, interpolate = render.interpolate;
    const { steps, alpha } = tree.clock.advance(dt);
    let stepped = 0;
    for (let i = 0; i < steps; i++) {
      if (i === steps - 1 && interpolate) render.interpolator.beforeStep(tree);
      if (!this.session.advance()) break; // held: the next world or a save is loading
      stepped++;
      if (this.session.tree !== tree) return; // a new world: drawn from the next frame
    }
    if (interpolate) render.interpolator.afterSteps(tree, stepped > 0);
    tree.present(dt, alpha);
    render.render(stepped < steps ? 1 : alpha, stepped > 0);
  }
}
