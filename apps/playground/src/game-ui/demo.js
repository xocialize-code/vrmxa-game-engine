// The demo's engine side, outside Vue (as the playground keeps it): the session (a GameFlow on game-ui's test game: Hana
// takes the order in a conversation with three choices, a ball to push to the table, a 20 s clock, an ending), a WebGL
// render host that follows the world being played, speech bubbles and name tags through @vrmxg/text, the keyboard and a
// gamepad, and the player's settings in this browser's localStorage (the store is the app's choice, not the package's).
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { parse } from '@vrmxg/scene';
import { MemoryStore } from '@vrmxg/save';
import { KeyboardDevice, GamepadDevice } from '@vrmxg/input';
import { RenderHost } from '@vrmxg/render';
import { TextLayer } from '@vrmxg/text';
import { GameSettings } from '@vrmxg/game-ui';
import { startFlow } from '../../../../engine/packages/game-ui/test/fixtures/world.js';
import counter from '../../../../engine/packages/game-ui/test/fixtures/counter.vrmxs?raw';
import ending from '../../../../engine/packages/game-ui/test/fixtures/ending.vrmxs?raw';

/** The app's own settings store: this browser's localStorage, under one key. */
export function localSettingsStore(key = 'vrmxg-game-ui-demo-settings') {
  return {
    read: () => { try { const t = localStorage.getItem(key); return t ? JSON.parse(t) : null; } catch { return null; } },
    write: (s) => { try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* private window: settings last this session */ } },
  };
}

export class Demo {
  /** @param {HTMLCanvasElement} canvas */
  async start(canvas) {
    installPortableMath();
    const R = await loadRapier();
    this.scenes = new Map([['counter.vrmxs', parse(counter)], ['ending.vrmxs', parse(ending)]]);
    this.R = R;
    this.settings = await new GameSettings({ store: localSettingsStore() }).load();
    this.keyboard = new KeyboardDevice().attach(window);
    this.gamepad = new GamepadDevice();
    this.host = new RenderHost({ canvas });
    this.host.interpolate = false;
    this.host.debug.set({ colliders: true, sensors: true });
    this.host.fallbackCamera.position.set(0.8, 3.2, 6.5);
    this.host.fallbackCamera.lookAt(0.8, 0, 0.6);
    this.text = new TextLayer({ font: 'fonts/NotoSansJP-Regular.ttf', bold: 'fonts/NotoSansJP-Bold.ttf', unicodeFontsURL: 'fonts/', nameTags: true }).attach(this.host);
    await this.newGame();
    let last = 0;
    const tick = (t) => { this.raf = requestAnimationFrame(tick); if (last) this.frame((t - last) / 1000); last = t; };
    this.raf = requestAnimationFrame(tick);
    return this;
  }

  /** A new session: the counter again (the overlay is re-mounted on it by the page). */
  async newGame() {
    this.flow?.dispose();
    this.flow = await startFlow(this.R, this.scenes, { store: new MemoryStore() });
    this.adopt();
    this.flow.on((e) => { if (e.type === 'scene' || e.type === 'loaded') this.adopt(); });
    return this.flow;
  }

  // the world being played changed: the renderer follows it, and the app's devices go on its input service
  adopt() {
    const tree = this.flow.tree, input = tree.services.get('input');
    if (!input.devices.includes(this.keyboard)) { input.addDevice(this.keyboard); input.addDevice(this.gamepad); }
    this.host.attach(tree);
    this.host.resize(this.host.renderer.domElement.clientWidth || 960, this.host.renderer.domElement.clientHeight || 540);
  }

  frame(elapsed) {
    if (this.paused) { this.host.render(1, false); return; }
    const alpha = this.flow.frame(Math.min(elapsed, 0.25));
    this.host.render(alpha, true);
  }

  resize(w, h) { this.host?.resize(w, h); }
  get input() { return this.flow?.tree?.services.get('input') ?? null; }
  dispose() { cancelAnimationFrame(this.raf); this.flow?.dispose(); this.keyboard?.detach(); this.text?.dispose(); }
}
