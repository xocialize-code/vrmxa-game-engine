// A puppet take (M4 W9): the keyboard or a gamepad drives one character while the sequence plays.
//
// The log is the input recording (the puppet's own action map, latched once a step, as @vrmxg/input records it) and the
// camera's ground yaw at each step it changed: "forward" is away from the camera she is seen through, as the player
// controller has it. PuppetState turns one step's latched actions into what she does on that step. The live monitor
// (recorder.js) and the derivation below both run it, so what the person saw while recording is what the log gives again.
//
//   walk       her intent in m/s on the ground (world x, z), and a jump          → a `move` track (@vrmxg/sequence)
//   look       her eyes, as [yaw, pitch] from her own facing, turned at lookRate  → a property track on props.gaze
//   gestures   a press starts an animation slot                                  → clips on an animation track
import { sin, cos } from '@vrmxg/dmath';
import { DT } from '@vrmxg/core';
import { frameOfStep, r4, clamp } from './take.js';
import { reduceKeys } from './reduce.js';

/** The gestures the six gesture buttons play, in order, when the take's setup names none. */
export const PUPPET_GESTURES = ['greet', 'nod', 'shrug', 'point', 'laugh', 'cheer'];

/**
 * The puppet's action map (an @vrmxg/input map of its own, so the set's player bindings don't matter): WASD or the left
 * stick walks, Shift or the right trigger runs, Space or A jumps; the arrow keys or the right stick turn her eyes, R or
 * a click of the right stick gives them back to the film; 1 to 6 (X, Y, B and the d-pad) play gestures.
 */
export const PUPPET_ACTIONS = {
  move_x: { type: 'axis', bindings: [{ key: 'KeyD', value: 1 }, { key: 'KeyA', value: -1 }, { gamepadAxis: 0, deadzone: 0.15 }] },
  move_y: { type: 'axis', bindings: [{ key: 'KeyW', value: 1 }, { key: 'KeyS', value: -1 }, { gamepadAxis: 1, deadzone: 0.15, scale: -1 }] },
  look_x: { type: 'axis', bindings: [{ key: 'ArrowRight', value: 1 }, { key: 'ArrowLeft', value: -1 }, { gamepadAxis: 2, deadzone: 0.15 }] },
  look_y: { type: 'axis', bindings: [{ key: 'ArrowUp', value: 1 }, { key: 'ArrowDown', value: -1 }, { gamepadAxis: 3, deadzone: 0.15, scale: -1 }] },
  run: { type: 'button', bindings: [{ key: 'ShiftLeft' }, { key: 'ShiftRight' }, { gamepadButton: 7 }] },
  jump: { type: 'button', bindings: [{ key: 'Space' }, { gamepadButton: 0 }] },
  look_reset: { type: 'button', bindings: [{ key: 'KeyR' }, { gamepadButton: 11 }] },
  g1: { type: 'button', bindings: [{ key: 'Digit1' }, { gamepadButton: 2 }] },
  g2: { type: 'button', bindings: [{ key: 'Digit2' }, { gamepadButton: 3 }] },
  g3: { type: 'button', bindings: [{ key: 'Digit3' }, { gamepadButton: 1 }] },
  g4: { type: 'button', bindings: [{ key: 'Digit4' }, { gamepadButton: 12 }] },
  g5: { type: 'button', bindings: [{ key: 'Digit5' }, { gamepadButton: 13 }] },
  g6: { type: 'button', bindings: [{ key: 'Digit6' }, { gamepadButton: 14 }] },
};

export const PUPPET_DEFAULTS = {
  /** m/s walking and running */ walkSpeed: 1.4, runSpeed: 4,
  /** rad/s the eyes turn at full deflection */ lookRate: 1.6,
  /** how far the eyes go: [yaw, pitch] in rad */ lookLimit: [1, 0.5],
  /** speed is kept to this step (m/s), so a held stick holds one key */ speedStep: 0.05,
  /** seconds a gesture's clip plays when the take doesn't know the slot's length */ gestureSeconds: 1.6,
  /** tolerance (rad) when the eyes' keys are thinned */ gazeTolerance: 0.01,
};

/** A take's setup over the defaults. */
export const puppetSetup = (setup = {}) => ({ ...PUPPET_DEFAULTS, gestures: PUPPET_GESTURES, slots: {}, ...setup });

/** What the puppet does on each step, from that step's latched actions. Its state is the eyes and the buttons held. */
export class PuppetState {
  constructor(setup = {}) {
    this.o = puppetSetup(setup);
    /** her eyes: [yaw, pitch], or null while the film has them */ this.gaze = null;
    this.held = new Set();
  }

  /**
   * @param {(name: string) => number} axis this step's axis values @param {(name: string) => boolean} down buttons held
   * @param {number} yaw the camera's ground yaw this step
   * @returns {{ move: [number, number], jump: boolean, gaze: [number, number] | null, gestures: string[] }}
   */
  step(axis, down, yaw) {
    const o = this.o;
    const pressed = (name) => { const d = down(name), was = this.held.has(name); if (d) this.held.add(name); else this.held.delete(name); return d && !was; };
    let x = axis('move_x'), y = axis('move_y');
    const len = Math.sqrt(x * x + y * y);
    if (len > 1) { x /= len; y /= len; }
    const q = (v) => Math.round(v / o.speedStep) * o.speedStep;
    const speed = down('run') ? o.runSpeed : o.walkSpeed;
    const fx = sin(yaw), fz = cos(yaw), rx = -fz, rz = fx; // the camera's forward on the ground, and its right
    const move = /** @type {[number, number]} */ ([r4(q((fx * y + rx * x) * speed)), r4(q((fz * y + rz * x) * speed))]);
    const jump = pressed('jump');
    const lx = axis('look_x'), ly = axis('look_y');
    if (pressed('look_reset')) this.gaze = null;
    else if (lx !== 0 || ly !== 0) {
      const g = this.gaze ?? [0, 0];
      // right on the stick is her right: yaw is positive to her left
      this.gaze = [r4(clamp(g[0] - lx * o.lookRate * DT, -o.lookLimit[0], o.lookLimit[0])), r4(clamp(g[1] + ly * o.lookRate * DT, -o.lookLimit[1], o.lookLimit[1]))];
    }
    const gestures = [];
    for (let i = 0; i < 6; i++) if (pressed(`g${i + 1}`) && o.gestures[i]) gestures.push(o.gestures[i]);
    return { move, jump, gaze: this.gaze ? [this.gaze[0], this.gaze[1]] : null, gestures };
  }
}

/** The camera yaw on a step, from the log's change list [[step, yaw], …]. */
function yawAt(list, step, cursor) {
  while (cursor.i + 1 < list.length && list[cursor.i + 1][0] <= step) cursor.i++;
  return list.length && list[cursor.i][0] <= step ? list[cursor.i][1] : 0;
}

/** Every step of a puppet take, as PuppetState gives it: [{ step, move, jump, gaze, gestures }]. */
export function puppetSamples(take) {
  const rec = take.log.input, state = new PuppetState(take.setup), cursor = { i: 0 }, out = [];
  const ai = new Map(rec.axes.map((n, i) => [n, i])), bi = new Map(rec.buttons.map((n, i) => [n, i]));
  for (let k = 0; k < rec.frames.length; k++) {
    const [axes, bits] = rec.frames[k], step = take.start + k;
    const axis = (n) => { const i = ai.get(n); return i === undefined ? 0 : axes[i]; };
    const down = (n) => { const i = bi.get(n); return i !== undefined && ((bits >>> i) & 1) === 1; };
    out.push({ step, ...state.step(axis, down, yawAt(take.log.yaw, step, cursor)) });
  }
  return out;
}

/** A gesture's clip on the take's animation track: its slot's own length when the take knows it. */
export function gestureClip(slot, frame, fps, setup) {
  const seconds = setup.slots?.[slot] ?? setup.gestureSeconds ?? PUPPET_DEFAULTS.gestureSeconds;
  const n = typeof fps === 'number' ? fps : fps.num / fps.den;
  return { start: frame, end: frame + Math.max(2, Math.round(seconds * n)), slot, loop: false, blendIn: Math.max(1, Math.round(n / 6)), blendOut: Math.max(1, Math.round(n / 4)) };
}

/**
 * A puppet take's tracks (pure): her walk as a `move` track, her eyes as a released property track on props.gaze, her
 * gestures as a released animation track. A part she didn't use gives no track.
 * @param {any} take @returns {any[]} tracks, each marked with the take
 */
export function puppetTracks(take) {
  const o = puppetSetup(take.setup), fps = take.fps, samples = puppetSamples(take), end = frameOfStep(take.end, fps);
  const mark = { take: take.id, by: 'puppet' }, id = (what) => `${take.target}-${what}-${take.id}`;
  const tracks = [];

  // walking: a key where her intent changes (held between keys), and a last key that stops her
  const walk = [];
  let prev = [0, 0];
  for (const s of samples) {
    if (!s.jump && s.move[0] === prev[0] && s.move[1] === prev[1]) continue;
    walk.push([frameOfStep(s.step, fps), s.jump ? [s.move[0], s.move[1], 1] : [s.move[0], s.move[1]]]);
    prev = s.move;
  }
  if (walk.length) {
    if (prev[0] !== 0 || prev[1] !== 0) walk.push([end, [0, 0]]);
    tracks.push({ id: id('walk'), type: 'move', target: take.target, ...mark, keys: walk });
  }

  // eyes: runs of looking, each thinned, each ended by a key that gives them back to the film
  const gaze = [];
  let run = [];
  const flush = (frame) => {
    if (!run.length) return;
    gaze.push(...reduceKeys(run, o.gazeTolerance), [frame, null]);
    run = [];
  };
  for (const s of samples) {
    if (s.gaze) run.push([frameOfStep(s.step, fps), s.gaze]);
    else flush(frameOfStep(s.step, fps));
  }
  flush(end);
  if (gaze.length) tracks.push({ id: id('gaze'), type: 'property', target: take.target, path: 'props.gaze', release: true, ...mark, keys: gaze });

  // gestures: a clip per press, over whatever her own animation track plays
  const clips = samples.flatMap((s) => s.gestures.map((slot) => gestureClip(slot, frameOfStep(s.step, fps), fps, o)));
  if (clips.length) tracks.push({ id: id('act'), type: 'animation', target: take.target, release: true, ...mark, clips });
  return tracks;
}
