// M4 W9 (AB-T-0581), M4 check 5: a take replays exactly from its log. The sample's three take logs
// (content/sample/performances/the-regular/: a puppet take, a director take and a face take, made by
// tools/make-takes.mjs) become tracks by @vrmxg/takes' pure function, the film "The Regular" plays with them kept, and
// the world is hashed on every step. Node runs this directly (acceptance/m4/takes.mjs), browsers through the playground's
// ?mode=takes; the runner compares the hashes. No device, model or camera is involved: the logs are the only input.
// What it checks besides the hashes:
//   - the same log gives the same tracks (each take's tracks hashed, and the film's canonical text with all three kept);
//   - the takes do what was performed: Mira walks from her mark and hops, her eyes turn, Hana says the directed lines
//     on their frames and walks over to her, Mira's face blinks, smiles and turns;
//   - the film without the takes is a different world, and with them it is the same world twice;
//   - a snapshot taken inside a take restores into a fresh world that plays on to the same end.
import { captureWorld, restoreWorld, worldHashes, hashValue, packRun, compareRuns } from '@vrmxg/snapshot';
import { parse, serialize } from '@vrmxg/scene';
import { composeSequence } from '@vrmxg/sequence';
import { takeTracks, withTake, takeRef, frameOfStep } from '@vrmxg/takes';
import { buildWorld, loadSample } from './world.js';

export const TAKES_SHORT = 'sequences/the-regular.vrmxs';
export const TAKE_REFS = ['take-1', 'take-2', 'take-3'].map((id) => takeRef('the-regular', id));
const text = (b) => new TextDecoder().decode(b);

/** @param {{ R: any, bytes: (ref: string) => Promise<Uint8Array>, opts: any }} o */
export async function takesCheck({ R, bytes, opts }) {
  const short = parse(text(await bytes(TAKES_SHORT))), set = parse(text(await bytes(short.set)));
  const takes = [];
  for (const ref of TAKE_REFS) takes.push(JSON.parse(text(await bytes(ref))));

  // the log → the tracks: pure, so hashed here and compared across runtimes
  let film = short;
  const derived = takes.map((take) => {
    const { tracks, cast } = takeTracks(take);
    film = withTake(film, take);
    return { id: take.id, kind: take.kind, target: take.target, start: take.start, end: take.end, log: hashValue(take), tracks: tracks.map((t) => `${t.id}:${t.type}`), tracksHash: hashValue(tracks), cast: cast ? Object.keys(cast) : [] };
  });
  const filmText = serialize(film), filmHash = hashValue(filmText);

  const world = async (doc) => { const S = await loadSample(bytes, short.set); S.doc = composeSequence(doc, set); return buildWorld(R, S, opts); };
  const end = Math.max(...takes.map((t) => t.end)) + 120;
  const [puppet, director, face] = takes;
  const snapAt = puppet.start + 150; // Mira mid-walk

  const play = async (W, { from = 0, snap = false, watch = false } = {}) => {
    const tree = W.tree, run = from === 0 ? [{ step: 0, h: worldHashes(tree) }] : [], said = [], seen = { blink: 0, happy: 0, aa: 0, head: 0, gaze: 0, air: 0 };
    let snapshot = null;
    const mira = /** @type {any} */ (tree.find('mira')), hana = /** @type {any} */ (tree.find('hana-1'));
    if (watch) tree.listen(hana, 'spoke', (p) => said.push({ step: tree.clock.step, text: p.text }));
    const at = (n) => n.object3d.position.toArray().map((v) => Math.round(v * 1e4) / 1e4), marks = {};
    if (watch) marks.miraStart = at(mira);
    for (let k = from + 1; k <= end; k++) {
      while (!tree.step()) await tree.settle();
      run.push({ step: k, h: worldHashes(tree, { physicsBytes: k % 60 === 0 }) });
      if (snap && k === snapAt) snapshot = captureWorld(tree);
      if (!watch) continue;
      if (k === puppet.end) marks.miraAfterWalk = at(mira);
      if (k === director.start) marks.hanaBefore = at(hana);
      if (k === director.end + 100) marks.hanaAfter = at(hana);
      if (k >= puppet.start && k < puppet.end) { seen.gaze = Math.max(seen.gaze, Math.abs(mira.props.gaze?.[0] ?? 0)); seen.air = Math.max(seen.air, mira.object3d.position.y); }
      if (k >= face.start && k < face.end) {
        const em = mira.vrm?.expressionManager;
        for (const n of ['blink', 'happy', 'aa']) seen[n] = Math.max(seen[n], em?.getValue(n) ?? 0);
        seen.head = Math.max(seen.head, Math.abs(mira.props.head?.[0] ?? 0));
      }
    }
    return { run, final: hashValue(run.at(-1).h), snapshot, said, marks, seen };
  };

  const A = await world(film), a = await play(A, { snap: true, watch: true });
  // restored inside the puppet take into a fresh world: the rest plays the same
  const B = await world(film);
  restoreWorld(B.tree, a.snapshot);
  const b = await play(B, { from: snapAt });
  const restored = { at: snapAt, final: b.final, same: b.final === a.final && compareRuns(a.run.slice(snapAt + 1), b.run) === null };
  // the same film again, and the film without the takes
  const again = await play(await world(film));
  const bare = await play(await world(short));

  const fps = short.sequence.fps, dist = (p, q) => Math.sqrt((p[0] - q[0]) * (p[0] - q[0]) + (p[2] - q[2]) * (p[2] - q[2]));
  const lines = film.sequence.tracks.find((t) => t.id === 'hana-1-says-take-2').clips.map((c) => ({ text: c.text, frame: c.start, spokeAt: a.said.find((s) => s.text === c.text)?.step ?? null }));
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  return {
    sequence: TAKES_SHORT, takes: derived, filmHash, filmBytes: filmText.length, steps: end, final: a.final, components: Object.keys(a.run[0].h).length, run: packRun(a.run),
    twice: again.final === a.final && JSON.stringify(packRun(again.run)) === JSON.stringify(packRun(a.run)),
    takesChangeTheFilm: bare.final !== a.final, restored,
    performed: {
      miraWalked: r4(dist(a.marks.miraStart, a.marks.miraAfterWalk)), miraJumped: r4(a.seen.air), miraLooked: r4(a.seen.gaze),
      hanaWalked: r4(dist(a.marks.hanaBefore, a.marks.hanaAfter)), hanaToMira: r4(dist(a.marks.hanaAfter, a.marks.miraAfterWalk)),
      // a line is said on the step that crosses its clip's first frame
      lines, linesOnTheirFrames: lines.every((l) => l.spokeAt !== null && frameOfStep(l.spokeAt, fps) >= l.frame && frameOfStep(l.spokeAt - 1, fps) < l.frame),
      blink: r4(a.seen.blink), smile: r4(a.seen.happy), mouth: r4(a.seen.aa), headTurn: r4(a.seen.head),
    },
  };
}

/** What a run must show beyond its hashes: every take did what was performed. */
export function takesPerformed(r) {
  const p = r.performed;
  return r.twice && r.takesChangeTheFilm && r.restored.same && p.miraWalked > 1 && p.miraJumped > 0.05 && p.miraLooked > 0.5 && p.linesOnTheirFrames && p.hanaWalked > 0.5 && p.blink > 0.6 && p.smile > 0.3 && p.mouth > 0.2 && p.headTurn > 0.15;
}
