// M5 W3 (AB-T-0618), M5 checks 5 and 7: a conversation with a choice replays as played, in every runtime. The game-ui
// test game (engine/packages/game-ui/test/fixtures: a counter where Hana takes the order through a Dialogue with three
// choices, a ball to deliver, an ending whose goodbye depends on the order) is played for 520 steps through one scene
// change, recorded, and replayed. Node, Chromium and WKWebView (scheme and loopback) each run this module and must agree.
//
//   live     played as a person would: a keyboard holds D; the overlay holds the devices while Hana talks; 30 steps after
//            the choices appear the player picks "latte". In Node the answer goes in through the overlay's binding; in
//            the browsers the page mounts the real GameOverlay and clicks the choice's button. The session is recorded.
//   replay   the recording, in a new session with no UI at all: the same branch, the same hashes on every step
//
// `delay` is how long each world takes to load (ms, by request number): the steps a change lands on may not move.
import { hashValue, packRun, compareRuns } from '@vrmxg/snapshot';
import { MemoryStore } from '@vrmxg/save';
import { startFlow, playSession, replaySession } from '../../engine/packages/game-ui/test/fixtures/world.js';

export const STEPS = 520, SEED = 11, PICK = 'latte';
export const DELAYS = { none: [], steady: [4], varied: [9, 0, 12, 3, 7, 1] };

/**
 * @param {any} R Rapier @param {Map<string, any>} scenes the test game's parsed scenes by ref
 * @param {{ delays?: number[], sleep?: (ms: number) => Promise<void>, mount?: (flow: any) => Promise<{ answer: any, dom?: () => any, unmount?: () => void }> }} [o]
 *   mount: a page mounts the overlay over the session and answers through it
 */
export async function runDialogueScenario(R, scenes, { delays = [], sleep = null, mount = null } = {}) {
  let n = 0;
  const delay = delays.length && sleep ? () => sleep(delays[n++ % delays.length]) : null;
  const words = (run) => run.map((r) => hashValue(r.h));

  const flow = await startFlow(R, scenes, { seed: SEED, store: new MemoryStore(), delay });
  const ui = mount ? await mount(flow) : null;
  const events = [];
  flow.on((e) => events.push(e));
  const live = await playSession(flow, { steps: STEPS, pick: PICK, answer: ui?.answer ?? null });
  const dom = ui?.dom?.() ?? null;
  ui?.unmount?.();
  flow.dispose();

  const again = await startFlow(R, scenes, { seed: SEED, delay });
  const rep = await replaySession(again, live.recording, STEPS);
  again.dispose();
  const d = compareRuns(live.run, rep.run);

  const rec = live.recording;
  return {
    steps: STEPS, seed: SEED, pick: PICK, answeredBy: ui ? 'the overlay\'s button' : 'the overlay\'s binding',
    final: hashValue(live.run.at(-1).h), all: hashValue(words(live.run)),
    run: packRun(live.run),
    recording: { version: rec.version, start: rec.start, frames: rec.frames.length, hash: hashValue(rec), choices: rec.frames.map((f, i) => [rec.start + i, f[2] ?? null]).filter(([, c]) => c) },
    replay: { same: d === null, final: hashValue(rep.run.at(-1).h), diverges: d ? { step: d.step, component: d.component, components: d.components.slice(0, 8) } : null },
    changes: events.filter((e) => e.type === 'scene').map((e) => [e.step, e.to, e.reset]),
    outcomes: events.filter((e) => e.type === 'outcome').map((e) => [e.step, e.result]),
    asked: live.models.filter((m, i, a) => m.dialogue?.asking && !a[i - 1]?.dialogue?.asking).map((m) => [m.step, m.dialogue.choices.map((c) => c.label)]),
    lines: live.models.filter((m, i, a) => m.dialogue && m.dialogue.text !== a[i - 1]?.dialogue?.text).map((m) => [m.step, m.dialogue.name, m.dialogue.text]),
    view: { scene: live.view.scene, score: live.view.score, flags: live.view.flags, outcome: live.view.outcome },
    dom,
    loading: { delays },
  };
}
