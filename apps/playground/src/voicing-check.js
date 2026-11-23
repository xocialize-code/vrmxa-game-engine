// M4 W7 (AB-T-0579), M4 check 3: replay from the baked track is exact. The sample script's sequence, voiced
// (sequences/cafe-order.vrmxs: every line baked by tools/bake-lines.mjs into its dialogue track), plays in the cafe with
// no renderer: every step's world hashes, each speaker's mouth hashed every step, the line each character started and
// when, and a snapshot taken mid-line restored into a fresh world that plays on to the same end. Node runs it directly
// (acceptance/m4/voicing.mjs), browsers through the playground's ?mode=voicing; the runner compares the hashes.
// What it checks the track for: every line baked, in its role's voice, playing from its baked words and visemes (the
// voice service's timings for the clip carry the track's visemes), lasting its baked length, and nobody talking over
// anybody (@vrmxg/voicing speechOverlaps).
import { captureWorld, restoreWorld, worldHashes, hashValue, packRun } from '@vrmxg/snapshot';
import { parse } from '@vrmxg/scene';
import { VOWELS } from '@vrmxg/voice';
import { voicingPlan, speechOverlaps } from '@vrmxg/voicing';
import { buildWorld, loadSample } from './world.js';

export const VOICED = 'sequences/cafe-order.vrmxs';
/** The sample's role → voice map (tools/bake-lines.mjs's default): the voices the lines must be in. */
export const SAMPLE_VOICES = { 'hana-1': 'af_heart', mira: 'af_bella' };

/**
 * @param {{ R: any, bytes: (ref: string) => Promise<Uint8Array>, opts: any, snapshotLine?: number }} o snapshotLine: the
 *   line (0-based, in order of start) a third of the way into which the snapshot is taken
 */
export async function voicingCheck({ R, bytes, opts, snapshotLine = 4 }) {
  const raw = parse(new TextDecoder().decode(await bytes(VOICED)));
  const dialogue = raw.sequence.tracks.filter((t) => t.type === 'dialogue');
  const lines = dialogue.flatMap((t) => t.clips.map((c, i) => ({ track: t.id, index: i, speaker: t.target, text: c.text, start: c.start, voice: c.voice ?? null, clip: c.clip ?? null, baked: !!(c.clip && c.words && c.visemes && c.audio), audio: c.audio?.duration ?? null })));
  lines.sort((a, b) => a.start - b.start);
  const left = voicingPlan(raw, {}, { presets: SAMPLE_VOICES }); // nothing still to voice, in the voices the roles have
  const inVoice = lines.every((l) => l.voice === (raw.sequence.roles?.[l.speaker]?.voice?.preset ?? SAMPLE_VOICES[l.speaker]));

  const S = await loadSample(bytes, VOICED);
  const A = await buildWorld(R, S, opts);
  const svc = A.sequence, end = svc.stepOf(svc.duration).step + 1;
  const speakers = [...new Set(lines.map((l) => l.speaker))];
  const fromTrack = lines.every((l) => { const t = A.voice.timings.get(l.clip); return t && !t.estimated && Array.isArray(t.visemes) && t.visemes.length > 0; });
  const spoke = [], ended = [];
  for (const id of speakers) {
    A.tree.listen(A.tree.find(id), 'spoke', (p) => spoke.push({ who: id, step: A.tree.clock.step, text: p.text }));
    A.tree.listen(A.tree.find(id), 'lineEnded', (p) => ended.push({ who: id, step: A.tree.clock.step, text: p.text }));
  }
  const mouthOf = (tree) => speakers.map((id) => { const em = tree.find(id)?.vrm?.expressionManager; return VOWELS.map((v) => em?.getValue(v) ?? 0); });
  const snapAt = svc.stepOf(lines[snapshotLine].start).step + 40; // a line under way
  let snap = null, open = 0;
  const run = [{ step: 0, h: worldHashes(A.tree) }], mouths = [];
  for (let k = 1; k <= end; k++) {
    while (!A.tree.step()) await A.tree.settle();
    const m = mouthOf(A.tree);
    open = Math.max(open, ...m.map((w) => w.reduce((a, b) => a + b, 0)));
    mouths.push(hashValue(m));
    run.push({ step: k, h: worldHashes(A.tree, { physicsBytes: k % 60 === 0 }) });
    if (k === snapAt) snap = captureWorld(A.tree);
  }
  const final = hashValue(run.at(-1).h), mouthHash = hashValue(mouths);

  // restored mid-line into a fresh world: the rest plays the same, mouth and all
  const B = await buildWorld(R, S, opts);
  restoreWorld(B.tree, snap);
  const tail = [];
  for (let k = snapAt + 1; k <= end; k++) { while (!B.tree.step()) await B.tree.settle(); tail.push(hashValue(mouthOf(B.tree))); }
  const restored = { at: snapAt, line: lines[snapshotLine].text, final: hashValue(worldHashes(B.tree, { physicsBytes: true })), same: false, mouthsSame: hashValue(tail) === hashValue(mouths.slice(snapAt)) };
  restored.same = restored.final === hashValue(worldHashes(A.tree, { physicsBytes: true }));

  return {
    sequence: VOICED, steps: end, final, mouthHash, components: Object.keys(run[0].h).length, run: packRun(run),
    lines: lines.map((l) => ({ ...l, spokeAt: spoke.find((s) => s.who === l.speaker && s.text === l.text)?.step ?? null, endedAt: ended.find((s) => s.who === l.speaker && s.text === l.text)?.step ?? null })),
    everyLineBaked: lines.every((l) => l.baked), inTheirVoices: inVoice, leftToVoice: left.length, playsFromTrack: fromTrack, overlaps: speechOverlaps(raw).map((x) => x.message),
    everyLineSpoken: lines.every((l) => spoke.some((s) => s.who === l.speaker && s.text === l.text)), mouthOpens: +open.toFixed(3), restored,
  };
}
