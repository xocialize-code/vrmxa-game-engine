// What the root overlay binds to (M5 W3): the session (a @vrmxg/game GameFlow) and, through it, whichever world is being
// played. sync() is called once a frame; it returns the overlay's model (HUD, dialogue box, captions) when something
// changed since the last call, else null. It also keeps two things true that the step must see the same way in a live
// run and its replay, which is why they are inputs and settings, never simulation state:
//   - the player's settings are on the world's input service (a load builds a world with the game's own bindings);
//   - while a conversation is going on, the overlay holds the devices (its own claim: input.hold(this)), so the keys
//     and the gamepad answer it and don't also walk the player away. An app's own claim (its menu) is its own: neither
//     lets go of the other's. What is latched is recorded either way.
import { HudBinding } from './hud.js';
import { dialogueModel, captionsModel } from './dialogue-ui.js';

export class OverlayBinding {
  /**
   * @param {any} flow a GameFlow
   * @param {{ settings?: import('./settings.js').GameSettings | null, player?: string | null, hold?: 'conversation' | 'choice' | 'never' }} [o]
   *   hold: when the overlay takes the devices from the game: for the whole conversation (default), only while it asks, never
   */
  constructor(flow, { settings = null, player = null, hold = 'conversation' } = {}) {
    this.flow = flow; this.settings = settings; this.hold = hold;
    this.hud = new HudBinding(flow, { player });
    this._tree = null; this._key = null; this._model = null;
    this._input = null;
    // a load (and a scene change) puts a new input service in place before its first step: settings go on it at once
    this._off = flow.on((e) => { if (e.type === 'loaded' || e.type === 'scene') this._adopt(); });
  }

  get tree() { return this.flow.tree ?? null; }
  get input() { return this.tree?.services.get('input') ?? null; }

  _adopt() {
    const t = this.tree;
    if (t === this._tree) return;
    this._tree = t;
    if (this._input && this._input !== this.input) this._input.release(this); // the world left behind: this claim goes
    this._input = this.input;
    if (this._input) this.settings?.applyTo({ input: this._input });
  }

  /** The overlay's model, read now: { hud, dialogue, captions, holding }. */
  read() {
    this._adopt();
    const t = this.tree, view = t?.services.get('dialogue')?.view?.() ?? null;
    const captions = t?.services.get('voice')?.captions?.(1) ?? [];
    const holding = !!view && (this.hold === 'conversation' || (this.hold === 'choice' && view.phase === 'choice'));
    const input = this.input;
    if (input) { if (holding) input.hold(this); else input.release(this); } // every read: whatever else held or let go meanwhile
    return { hud: this.hud.read(), dialogue: dialogueModel(view, captions), captions: captionsModel(captions, view), holding };
  }

  /** The model when something changed since the last sync, else null. */
  sync() {
    this._adopt();
    const t = this.tree;
    const k = t ? `${this.hud._keyNow()}|${this.hud.notices.list.length}|${this.settings?.version ?? 0}` : 'none';
    if (k === this._key) return null;
    this._key = k;
    return (this._model = this.read());
  }

  /** Let go of the devices and stop listening (the overlay is unmounted). */
  dispose() {
    this._input?.release(this);
    this._off?.(); this._off = null;
    this.hud.dispose();
  }
}
