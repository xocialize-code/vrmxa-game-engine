// The game-ui test game (M5 W3), the same module in every runtime: Node's tests and the acceptance page in Chromium and
// WKWebView (acceptance/m5/dialogue*). Two scenes beside this file:
//   counter   Hana asks for the order (a Dialogue with three choices). Answering sets the `order` flag, which is a goal;
//             the ball, pushed along +x by move_x, reaching the table is the other. Both done is a win, the 20 s clock
//             running out a loss; half a second after the result the game goes to the ending. A checkpoint is written
//             when the order is taken. A crate is knocked about from its own random stream, so the seed matters.
//   ending    keeps the result; Hana's goodbye depends on what was ordered (it reads the counter's `order` flag).
// The speakers are plain nodes (no models), so a line is its caption, timed from its text, and this runs on CI.
import { SceneTree } from '@vrmxg/core';
import { installPhysics } from '@vrmxg/physics';
import { installInput, VirtualDevice } from '@vrmxg/input';
import { installSave } from '@vrmxg/save';
import { installGame, GameFlow } from '@vrmxg/game';
import { installVoice, installDialogue } from '@vrmxg/voice';
import { worldHashes } from '@vrmxg/snapshot';
import { fixtureRegistry, BEHAVIOURS } from '../../../game/test/fixtures/world.js';
import { OverlayBinding } from '../../src/overlay.js';

export const SCENES = ['counter.vrmxs', 'ending.vrmxs'];

/** The host's world builder, as GameFlow asks for one. @param {any} R Rapier @param {Map<string, any>} scenes */
export function loader(R, scenes, { delay = null } = {}) {
  return async (req) => {
    const doc = scenes.get(req.scene);
    if (!doc) throw new Error(`no scene "${req.scene}"`);
    if (delay) await delay(req);
    const tree = new SceneTree({ registry: fixtureRegistry(), behaviours: BEHAVIOURS, seed: req.seed });
    tree.clock.step = req.step;
    installInput(tree);                                // first: it latches the step's input (and choices)
    installPhysics(tree, R);
    installGame(tree, { scene: req.scene });           // after physics
    installVoice(tree, { resolve: () => { throw new Error('this game has no clips'); }, faces: false });
    installDialogue(tree);                             // after input, voice and game
    installSave(tree, { scene: { ref: req.scene, doc }, app: { name: 'game-ui-fixture' } });
    tree.instantiate(structuredClone(doc));
    return tree;
  };
}
export const unload = (tree) => tree.services.get('physics')?.world?.free?.();

/** A flow on the test game, started. */
export async function startFlow(R, scenes, { seed = 11, store = null, delay = null } = {}) {
  const flow = new GameFlow({ load: loader(R, scenes, { delay }), unload, seed, store, scenes });
  await flow.start('counter.vrmxs');
  return flow;
}

/**
 * Play the test game as a person would, through the overlay's binding: a keyboard holds D (push) all along; the
 * overlay holds the devices while Hana talks, so the ball waits for the conversation; the player answers `wait`
 * steps after the choices appear. The answer goes in as the UI gives it: `answer(binding, model)` (Node: the binding's
 * input; a page: a click on the overlay's button). The session is recorded and every step hashed.
 * @param {any} flow a started flow @param {{ steps: number, pick: string, wait?: number, settings?: any,
 *   answer?: (binding: OverlayBinding, model: any, id: string) => void | Promise<void>, onStep?: (binding: OverlayBinding) => void | Promise<void> }} o
 */
export async function playSession(flow, { steps, pick, wait = 30, settings = null, answer = null, onStep = null }) {
  const binding = new OverlayBinding(flow, { settings });
  const keys = new VirtualDevice().press('KeyD');
  let input = flow.tree.services.get('input');
  input.addDevice(keys);
  input.record();
  let askedAt = null, answered = false;
  const run = [], models = [];
  for (let i = 0; i < steps; i++) {
    const m = binding.read();
    // a new world (a scene change) has a new input service: the keyboard is the app's, so it is added to it again
    if (flow.tree.services.get('input') !== input) { input = flow.tree.services.get('input'); input.addDevice(keys); }
    if (m.dialogue?.asking && !answered) {
      askedAt ??= flow.tree.clock.step;
      if (flow.tree.clock.step - askedAt >= wait) { await (answer ?? ((b, _m, id) => b.input.choose('dialogue.choose', id)))(binding, m, pick); answered = true; }
    }
    await onStep?.(binding);
    models.push({ step: flow.tree.clock.step, hud: m.hud, dialogue: m.dialogue, holding: m.holding });
    while (!flow.step()) await flow.settle();
    run.push({ step: flow.tree.clock.step, scene: flow.scene, h: worldHashes(flow.tree) });
  }
  await flow.settle(); flow.flush();
  const recording = JSON.parse(JSON.stringify(flow.tree.services.get('input').stop()));
  binding.dispose();
  return { run, recording, models, view: flow.view() };
}

/** Replay a recording in a new session, with no UI at all, hashing every step. */
export async function replaySession(flow, recording, steps) {
  flow.tree.services.get('input').replay(recording);
  const run = [];
  for (let i = 0; i < steps; i++) { while (!flow.step()) await flow.settle(); run.push({ step: flow.tree.clock.step, scene: flow.scene, h: worldHashes(flow.tree) }); }
  await flow.settle(); flow.flush();
  return { run, view: flow.view() };
}
