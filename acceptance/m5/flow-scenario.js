// M5 W2 (AB-T-0617), M5 checks 3 and 6 in every runtime: the test game of engine/packages/game/test/fixtures (a title,
// a level, an ending; physics, recorded input, random streams) played for 600 steps through seven scene changes, two of
// them resets. Node, Chromium and WKWebView (scheme and loopback) each run this module and must agree on every step.
//
//   unbroken    600 steps from the title, hashed after every step (@vrmxg/game recordFlow)
//   save        a save taken at step 60, in the level, before its change to the ending (148): loaded into a new
//               session and played to 600, it must give the unbroken run's hashes from 61 on, across five changes
//   checkpoint  the checkpoint the game writes by itself when the ball passes the first gate (the boundary after step
//               66): loaded from the store into a new session and played to 600, the same
//
// `delay` is how long each world takes to load (ms, by request number): a runtime may load slowly or fast, the steps a
// change lands on may not move.
import { hashValue, packRun, compareRuns } from '@vrmxg/snapshot';
import { MemoryStore } from '@vrmxg/save';
import { GameFlow, recordFlow, CHECKPOINT_PREFIX } from '@vrmxg/game';
import { fixtureFlow, fixtureLoader, fixtureRecording, unloadWorld } from '../../engine/packages/game/test/fixtures/world.js';

export const STEPS = 600, SAVE_AT = 60, SEED = 7;
export const DELAYS = { none: [], steady: [4], varied: [9, 0, 12, 3, 7, 1] };

/**
 * @param {any} R Rapier @param {Map<string, any>} scenes the fixture's parsed scenes by ref
 * @param {{ delays?: number[], sleep?: (ms: number) => Promise<void> }} [o]
 */
export async function runFlowScenario(R, scenes, { delays = [], sleep = null } = {}) {
  let n = 0, held = 0;
  const delay = delays.length && sleep ? () => sleep(delays[n++ % delays.length]) : null;
  const words = (run) => run.map((r) => hashValue(r.h));

  // ---- the unbroken run
  const store = new MemoryStore(), recording = fixtureRecording(STEPS), built = [];
  const flow = await fixtureFlow(R, scenes, { seed: SEED, store, recording, delay, built });
  const events = [];
  flow.on((e) => events.push(e));
  let save = null, checkpoint = null;
  const run = [];
  for (let i = 0; i < STEPS; i++) {
    flow.flush();
    if (flow.tree.clock.step === SAVE_AT) save = JSON.parse(JSON.stringify(flow.save({ name: 'before the ending' })));
    const part = await recordFlow(flow, 1, { onStep: () => { if (flow.held) held++; } });
    run.push(part[0]);
    if (!checkpoint && flow.checkpoints.has('checkpoint')) { await flow.settle(); checkpoint = await store.read(`${CHECKPOINT_PREFIX}checkpoint`); }
  }
  await flow.settle(); flow.flush();
  const final = flow.view();
  flow.dispose();

  // ---- a saved game, loaded into a new session and played on
  const resume = async (file) => {
    const f = new GameFlow({ load: fixtureLoader(R, scenes, { delay }), unload: unloadWorld, seed: 1 });
    const from = await f.load(file);
    f.tree.services.get('input').replay(recording);
    const rest = await recordFlow(f, STEPS - from);
    f.dispose();
    const tail = run.filter((r) => r.step > from), d = compareRuns(tail, rest);
    return { from, scene: file.requires.scene.ref, bytes: JSON.stringify(file).length, file: hashValue(file), steps: rest.length, same: d === null, diverges: d ? { step: d.step, component: d.component, components: d.components.slice(0, 8) } : null, final: hashValue(rest.at(-1).h) };
  };

  const scene = (e) => [e.step, e.to, e.reset];
  return {
    steps: STEPS, seed: SEED,
    final: hashValue(run.at(-1).h), all: hashValue(words(run)), words: words(run),
    run: packRun(run),
    changes: events.filter((e) => e.type === 'scene').map(scene),
    worlds: built.map((b) => [b.step, b.scene, b.seed]),
    outcomes: events.filter((e) => e.type === 'outcome').map((e) => [e.step, e.result]),
    checkpoints: events.filter((e) => e.type === 'checkpointWritten').map((e) => [e.step, e.slot, e.id]),
    view: final,
    save: await resume(save),
    checkpoint: await resume(checkpoint),
    loading: { delays, heldBoundaries: held },
  };
}
