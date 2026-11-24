// A director take (M4 W9): the person talks to one character through M3's director (@vrmxg/director), and what she
// answers becomes tracks.
//
// The log is the ai service's log for her over the take: each request (what was said to her) and each decision the
// model's reply became, stamped with its step. The replies are in the log, so the tracks are made, and the film replays,
// without a model. From each decision:
//   her line        → a clip on a dialogue track (its words; voiced later like any line)
//   her expression  → keys on an expression track: up over a third of a second, held for the line, down again
//   her gesture     → a clip on an animation track, over her own
//   who she looks at → a clip on a lookAt track, until she looks elsewhere or the take ends
//   a goal, or going somewhere, using something, waiting → a key on a decisions track (@vrmxg/sequence), which her brain
//                     takes on the same step in the film. Only then does the film need her to have a brain: the `actor`
//                     preset (@vrmxg/ai), which does nothing she isn't directed to.
import { frameOfStep } from './take.js';
import { gestureClip } from './puppet.js';

/** Actions a decisions track keeps for her brain; the rest are tracks of their own (or, like `think`, the wait itself). */
const BRAIN_ACTIONS = new Set(['goTo', 'follow', 'interact', 'wait', 'face']);
/** The brain a film's character needs once a director gave her a goal. */
export const ACTOR = { use: 'brain', preset: 'actor' };

const rate = (fps) => (typeof fps === 'number' ? fps : fps.num / fps.den);
/** Words → seconds, as @vrmxg/director's bake estimates a line before it is voiced. */
const secondsFor = (text) => Math.max(1, Math.min(12, 0.4 + String(text).trim().split(/\s+/).length * 0.32));

/**
 * A director take's tracks (pure), and the cast change the film needs when she was given something to do.
 * @param {any} take @returns {{ tracks: any[], cast: Record<string, any> | null, heard: { frame: number, text: string }[] }}
 */
export function directorTracks(take) {
  const fps = take.fps, n = rate(fps), end = frameOfStep(take.end, fps);
  const mark = { take: take.id, by: 'director' }, id = (what) => `${take.target}-${what}-${take.id}`;
  const lines = [], faces = new Map(), gestures = [], looks = [], decisions = [], heard = [];
  const setup = { slots: {}, ...take.setup };
  for (const e of take.log.ai) {
    if (e.step < take.start || e.step >= take.end) continue;
    const at = frameOfStep(e.step, fps), frame = Math.ceil(at);
    if (e.kind === 'request' && e.meta?.heard?.text) heard.push({ frame, text: e.meta.heard.text });
    const actions = [...(e.action ? [e.action] : []), ...(e.actions ?? [])];
    const said = actions.find((a) => a.do === 'say' && a.args?.text);
    const hold = said ? Math.ceil(secondsFor(said.args.text) * n) : n; // her face lasts her line, or a second
    const kept = [];
    for (const a of actions) {
      if (a.do === 'say') { if (a.args?.text) lines.push({ start: frame, end: frame + hold, text: a.args.text }); }
      else if (a.do === 'emote') { if (a.args?.name) (faces.get(a.args.name) ?? faces.set(a.args.name, []).get(a.args.name)).push([frame, frame + hold]); }
      else if (a.do === 'gesture') { if (a.args?.slot) gestures.push(gestureClip(a.args.slot, frame, fps, setup)); }
      else if (a.do === 'lookAt') looks.push({ frame, at: a.args?.target ?? null });
      else if (BRAIN_ACTIONS.has(a.do)) kept.push({ do: a.do, args: structuredClone(a.args ?? {}) });
    }
    if (e.goal || kept.length) decisions.push([at, { kind: 'decision', ...(e.goal ? { goal: structuredClone(e.goal) } : {}), ...(kept.length ? { actions: kept } : {}) }]);
  }
  const tracks = [];
  if (lines.length) tracks.push({ id: id('says'), type: 'dialogue', target: take.target, ...mark, clips: lines });
  if (faces.size) {
    const up = Math.max(1, Math.round(n / 3)), down = Math.max(1, Math.round((n * 2) / 3)), keys = {};
    for (const name of [...faces.keys()].sort()) {
      // runs of one expression that touch are one run (as the script's default performance joins them)
      const runs = [];
      for (const [a, b] of faces.get(name).sort((x, y) => x[0] - y[0])) { const last = runs[runs.length - 1]; if (last && a <= last[1] + down) last[1] = Math.max(last[1], b); else runs.push([a, b]); }
      keys[name] = runs.flatMap(([a, b]) => [[a, 0], [a + up, 0.7, 'easeOut'], [Math.max(a + up + 1, b), 0.7], [Math.max(a + up + 1, b) + down, 0, 'easeIn']]);
    }
    tracks.push({ id: id('face'), type: 'expression', target: take.target, release: true, ...mark, keys });
  }
  if (gestures.length) tracks.push({ id: id('act'), type: 'animation', target: take.target, release: true, ...mark, clips: gestures });
  if (looks.length) {
    const clips = [];
    looks.forEach((l, i) => { const until = Math.max(l.frame + 1, i + 1 < looks.length ? looks[i + 1].frame : Math.ceil(end)); if (l.at) clips.push({ start: l.frame, end: until, at: l.at }); });
    if (clips.length) tracks.push({ id: id('eyes'), type: 'lookAt', target: take.target, ...mark, clips });
  }
  if (decisions.length) tracks.push({ id: id('decisions'), type: 'decisions', target: take.target, ...mark, keys: decisions });
  return { tracks, cast: decisions.length ? { [take.target]: { behaviours: [structuredClone(ACTOR)] } } : null, heard };
}
