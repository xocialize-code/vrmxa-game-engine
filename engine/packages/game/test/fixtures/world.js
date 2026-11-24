// The test game's host, the same module in every runtime (Node's tests, and the acceptance page in Chromium and
// WKWebView: acceptance/m5): a title, a level and an ending (title.vrmxs, level.vrmxs, ending.vrmxs beside this file).
//
//   title    a crate falls; the `jump` action starts the game (onAction → rules.changeScene)
//   level    the ball is pushed along +x by the move_x axis (push) through two gates. The first counts an order
//            (a counter, a goal, 10 points) and takes a checkpoint; the second closes the till (a flag, the second goal,
//            25 points). Both goals done is a win; the six-second clock running out is a loss. Two crates are knocked
//            about from their own random streams (jitter), so the world's seed matters. Half a second after the
//            result the game goes to the ending.
//   ending   keeps the outcome and the score, lingers a second, and goes back to the title as a new game (reset).
//
// With the recording below a 600-step run goes title → level → ending → title → level → ending: five scene changes,
// one of them a reset.
import { m0Registry } from '@vrmxg/registry/m0';
import { P } from '@vrmxg/registry';
import { SceneTree, Behaviour } from '@vrmxg/core';
import { installPhysics } from '@vrmxg/physics';
import { installInput } from '@vrmxg/input';
import { installSave } from '@vrmxg/save';
import { installGame, GameFlow } from '../../src/index.js';

export const SCENES = ['title.vrmxs', 'level.vrmxs', 'ending.vrmxs'];

/** Emits `pressed` on the step an action's button goes down (a menu's Start, as a recorded input). */
class OnAction extends Behaviour {
  physicsProcess() { if (this.tree.services.get('input')?.pressed(this.params.action)) this.emit('pressed', {}); }
}
/** Pushes its body along the move axes. */
class Push extends Behaviour {
  physicsProcess() {
    const input = this.tree.services.get('input'), f = this.params.force ?? 0.05;
    const x = input?.axis('move_x') ?? 0, y = input?.axis('move_y') ?? 0;
    if (x !== 0 || y !== 0) this.node.applyImpulse({ impulse: [x * f, 0, -y * f] });
  }
}
/** Knocks its body about every 20 steps, from the behaviour's own random stream. */
class Jitter extends Behaviour {
  physicsProcess() {
    if (this.tree.clock.step % 20 !== 0) return;
    const s = this.params.strength ?? 0.3, r = this.rng;
    this.node.applyImpulse({ impulse: [r.range(-s, s), r.range(0, s), r.range(-s, s)] });
  }
}
export const BEHAVIOURS = new Map([['onAction', OnAction], ['push', Push], ['jitter', Jitter]]);

/** The registry with the test game's behaviours (a project's own). */
export function fixtureRegistry() {
  const r = m0Registry();
  r.behaviour('onAction', { description: 'Emits pressed when an action\'s button goes down.', params: { action: P.string({ default: 'jump' }) }, signals: { pressed: {} } });
  r.behaviour('push', { description: 'Pushes its body along the move axes.', on: ['RigidBody'], params: { force: P.number({ default: 0.05 }) } });
  r.behaviour('jitter', { description: 'Knocks its body about from its own random stream.', on: ['RigidBody'], params: { strength: P.number({ default: 0.3 }) } });
  return r;
}

/**
 * The host's world builder, as GameFlow asks for one.
 * @param {any} R Rapier @param {Map<string, any>} scenes parsed scenes by ref
 * @param {{ delay?: (req: any) => Promise<void> | void, built?: any[] }} [o] delay: loading time (a test makes it vary);
 *   built: every request, in order
 */
export function fixtureLoader(R, scenes, { delay = null, built = null } = {}) {
  return async (req) => {
    const doc = scenes.get(req.scene);
    if (!doc) throw new Error(`no scene "${req.scene}"`);
    built?.push({ ...req });
    if (delay) await delay(req);
    const tree = new SceneTree({ registry: fixtureRegistry(), behaviours: BEHAVIOURS, seed: req.seed });
    tree.clock.step = req.step; // the session's clock, before anything is instantiated
    installInput(tree);         // first: it latches the step's input before any other service
    installPhysics(tree, R);
    installGame(tree, { scene: req.scene }); // after physics: the rules read the step's sensor events
    installSave(tree, { scene: { ref: req.scene, doc }, app: { name: 'game-fixture' } });
    tree.instantiate(structuredClone(doc));
    return tree;
  };
}

/** Free a world's Rapier memory. */
export function unloadWorld(tree) { tree.services.get('physics')?.world?.free?.(); }

/**
 * A recorded play session for the fixture: move_x held at 1 throughout, `jump` pressed for one step at 10 and then
 * every 64 steps (each title screen gets its Start).
 * @param {number} steps @param {{ push?: boolean }} [o] push false: nobody plays (the level's clock runs out)
 */
export function fixtureRecording(steps, { push = true } = {}) {
  const frames = [];
  for (let i = 0; i < steps; i++) frames.push([[push ? 1 : 0, 0, 0, 0, 0], i % 64 === 10 ? 1 : 0]);
  return { version: 1, start: 0, axes: ['move_x', 'move_y', 'look_x', 'look_y', 'zoom'], buttons: ['jump', 'run', 'interact', 'camera_next'], frames };
}

/**
 * A started flow on the fixture, replaying a recording.
 * @param {any} R @param {Map<string, any>} scenes
 * @param {{ seed?: number, store?: any, recording?: any, delay?: any, built?: any[], onWorld?: any }} [o]
 */
export async function fixtureFlow(R, scenes, { seed = 7, store = null, recording = null, delay = null, built = null, onWorld = null } = {}) {
  const flow = new GameFlow({ load: fixtureLoader(R, scenes, { delay, built }), unload: unloadWorld, store, seed, onWorld });
  await flow.start('title.vrmxs');
  if (recording) flow.tree.services.get('input').replay(recording);
  return flow;
}
