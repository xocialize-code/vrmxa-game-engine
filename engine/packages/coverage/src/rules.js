// Coverage by rule (M4 W8, AB-T-0580): a camera for every shot of a script's build, chosen from the script and the
// marks. It is @vrmxg/script's coverage hook: buildSequence(text, { coverage: coverByRule() }).
//
// The rules, in order (the first that applies picks the shot's camera):
//   1. establishing  a scene heading's shot: a wide of everyone on their marks, from further back and higher than the
//                    two-shot (one per scene: vc-est, vc-est-2 …);
//   2. two-shot      overlapping lines (dual dialogue, ^): the speakers together (vc-two-<a>-<b>);
//   3. close-up      a beat: a (beat) or (pause) in the line, or an expression the line or an action gives someone
//                    (a parenthetical such as (smiling), a tag such as [[happy]] or [[HANA happy]]). A clean single on
//                    that person, from the side of the line the scene is shot from (vc-cu-<id>);
//   4. shot/reverse  a line spoken to someone on a mark: over the listener's shoulder onto the speaker, both setups on
//                    one side of the line between them, so the reverse is a true reverse (vc-ots-<speaker>-<listener>);
//   5. master        anything else (action, voice-over): the two-shot of the whole cast (vc-two). A lone speaker with
//                    nobody to play to gets her close-up.
// The scene is shot from one side of its line, the line between its first two people at the scene's first shot. That
// side is `side` (+1: the side the line's normal [dz, −dx] points to), or the side that faces `room` (default the set's
// origin, the middle of most sets). Every other line (another pair, or the same pair after a move) takes the side its
// master camera is on, so cutting between any two of these cameras never crosses a line (lint.js checks it).
//
// Each camera is a VirtualCamera on one of M2's rig presets (twoShot, shotReverse, closeUp), its own props overriding
// what the shot needs: a fixed body placed on the floor plan, an aim at the people. People who move between marks get
// cameras placed for where they stand then (vc-ots-mira-hana-1-2 for the second placement of the same setup).
//
// Deterministic: plain arithmetic and square roots, positions rounded to the millimetre, ids by first use in script
// order. The same script and marks give the same cameras, byte for byte.
import { shotReverse } from '@vrmxg/camera/rigs';
import { PAREN_WORDS } from '@vrmxg/script';
import { EYE, mm, facing, sideOf, groupPlace, singlePlace } from './geometry.js';

export const RULES = ['establishing', 'twoShot', 'closeUp', 'shotReverse', 'master'];
/** A close-up aims at the eyes: the head bone it targets sits about 7 cm below them, at the jaw (the sample's VRMs). */
const EYES = 0.07;

/**
 * @typedef {{ side?: 1 | -1, room?: number[], estSize?: number, otsScreen?: number }} CoverageOptions
 *   side: which side of each scene's line to shoot from (default: the side facing `room`); room: [x, y, z] (default the
 *   origin); estSize: the establishing wide's share of the frame height (0.4); otsScreen: how far off centre a shot /
 *   reverse frames the speaker (0.2 of the half-width, away from the listener's shoulder)
 */

/**
 * The coverage hook for buildSequence: `coverage: coverByRule({ side: -1 })`.
 * @param {CoverageOptions} [options]
 */
export function coverByRule(options = {}) {
  return (ctx) => planCoverage(ctx, options);
}

/**
 * Coverage for a laid-out script. `ctx` is what @vrmxg/script's build hands its coverage hook.
 * @param {{ plan: any, shots: { beat: string, start: number, end: number }[], cast: string[], marks: Map<string, any>, markTf?: Map<string, any>, parsed?: any, numbers?: Map<string, string> }} ctx
 * @param {CoverageOptions} [options]
 * @returns {{ nodes: any[], cuts: Map<string, { camera: string }>, rules: Map<string, { rule: string, subjects: string[], camera: string, why: string }> }}
 */
export function planCoverage(ctx, options = {}) {
  const { plan, shots, cast, marks, markTf = new Map(), parsed = null } = ctx;
  const room = options.room ?? [0, 0, 0], estSize = options.estSize ?? 0.4, otsScreen = options.otsScreen ?? 0.2;
  const beatOf = new Map(plan.beats.map((b) => [b.id, b]));
  const parsedOf = new Map((parsed?.beats ?? []).map((b) => [b.id, b]));
  const order = new Map(cast.map((c, i) => [c, i]));
  const byOrder = (a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9) || (a < b ? -1 : a > b ? 1 : 0);
  const moves = plan.events.filter((e) => e.type === 'mark').sort((a, b) => a.frame - b.frame);

  /** Where someone stands at a frame: her first mark, then the last move at or before it. */
  const tfAt = (id, frame) => {
    let tf = marks.get(id) ?? null;
    for (const e of moves) if (e.char === id && e.frame <= frame && markTf.has(e.mark)) tf = markTf.get(e.mark);
    return tf;
  };
  const posAt = (id, frame) => { const tf = tfAt(id, frame); return tf ? [tf.p?.[0] ?? 0, 0, tf.p?.[2] ?? 0] : null; };

  // ---------------------------------------------------------------- cameras, by setup: the same setup reuses its id
  const nodes = [], cuts = new Map(), rules = new Map();
  const setups = new Map(); // base id → [{ key, id }]
  const camera = (base, node) => {
    const key = JSON.stringify(node);
    const list = setups.get(base) ?? [];
    const had = list.find((x) => x.key === key);
    if (had) return had.id;
    const id = list.length ? `${base}-${list.length + 1}` : base;
    list.push({ key, id }); setups.set(base, list);
    nodes.push({ id, type: 'VirtualCamera', ...node });
    return id;
  };

  let scene = null; // { beat, master, side } for the scene being shot
  let scenes = 0;
  const sceneStart = (frame, heading) => {
    scenes++;
    const here = cast.filter((c) => posAt(c, frame));
    const ps = here.map((c) => posAt(c, frame));
    let side = 1;
    if (ps.length >= 2) side = options.side ?? (sideOf(ps[0], ps[1], room) || 1);
    const master = ps.length >= 2 ? groupPlace(ps, side, 'two') : null;
    scene = { n: scenes, heading, side, master };
  };
  /** The side of the line from x to y (positions) the scene is shot from: where its master camera stands. */
  const sideFor = (x, y) => (scene?.master ? sideOf(x, y, scene.master, 0) || sideOf(x, y, room, 0) || 1 : 1);
  const place = (here, frame) => here.map((c) => posAt(c, frame));
  const label = (ids) => ids.join(', ');

  const group = (kind, ids, frame) => {
    const here = ids.filter((c) => posAt(c, frame)).sort(byOrder);
    const ps = place(here, frame);
    const est = kind === 'establishing';
    let p;
    if (ps.length >= 2) p = groupPlace(ps, sideFor(ps[0], ps[1]), kind);
    else if (ps.length === 1) p = [mm(ps[0][0]), est ? 2.2 : EYE, mm(ps[0][2] + (est ? 4.5 : 3))];
    else p = [0, est ? 2.2 : EYE, est ? 6 : 4];
    const targets = (here.length ? here : [...ids].sort(byOrder));
    const all = targets.length === cast.length && targets.every((c, i) => c === [...cast].sort(byOrder)[i]);
    if (est) return camera(scene.n === 1 ? 'vc-est' : `vc-est-${scene.n}`, { name: `Establishing: ${scene.heading}`, transform: { p }, props: { rig: 'twoShot', aim: { targets, size: estSize } } });
    return camera(all ? 'vc-two' : `vc-two-${targets.join('-')}`, { name: `Two-shot: ${label(targets)}`, transform: { p }, props: { rig: 'twoShot', aim: { targets } } });
  };
  const single = (id, to, frame) => {
    const p = posAt(id, frame);
    if (!p) return camera(`vc-cu-${id}`, { name: `${id}, close`, props: { rig: 'closeUp', aim: { target: id }, body: { target: id } } }); // M2's follow close-up
    const q = to ? posAt(to, frame) : null;
    const at = singlePlace(p, q, q ? sideFor(p, q) : 1, facing(tfAt(id, frame)));
    return camera(`vc-cu-${id}`, { name: `${id}, close`, transform: { p: at }, props: { rig: 'closeUp', body: { type: 'fixed' }, aim: { target: id, offset: [0, EYES, 0] } } });
  };
  const overShoulder = (speaker, listener, frame) => {
    const [a, b] = [speaker, listener].sort(byOrder);
    const pa = posAt(a, frame), pb = posAt(b, frame), s = sideFor(pa, pb);
    // the rig's shotReverse(a, b) is over a's shoulder onto b, on its `side` of the line a → b (the opposite sign to ours)
    const reverse = speaker === a;
    const r = shotReverse(pa, pb, { side: -s, reverse, height: EYE });
    const sx = reverse ? s * otsScreen : -s * otsScreen; // the speaker away from the listener's shoulder
    return camera(`vc-ots-${speaker}-${listener}`, { name: `${speaker} over ${listener}`, transform: { p: r.p.map(mm) }, props: { rig: 'shotReverse', aim: { target: speaker, screen: [mm(sx), 0.15] } } });
  };

  for (const s of shots) {
    const b = beatOf.get(s.beat);
    const frame = s.start + Math.floor((s.end - s.start) / 2); // the shot's middle: where its thumbnail is taken
    if (b.kind === 'scene' || !scene) sceneStart(s.start, b.heading ?? 'the scene');
    const pick = (rule, subjects, cam, why) => { cuts.set(s.beat, { camera: cam }); rules.set(s.beat, { rule, subjects, camera: cam, why }); };
    const lookOf = (id, beat) => plan.events.find((e) => e.type === 'look' && e.char === id && e.beat === beat && order.has(e.at))?.at ?? null;
    const lastLook = (id) => { let at = null; for (const e of plan.events) if (e.type === 'look' && e.char === id && e.start <= frame && order.has(e.at)) at = e.at; return at; };
    const expressed = plan.events.filter((e) => e.type === 'expression' && e.beat === b.id).sort((x, y) => x.start - y.start || byOrder(x.char, y.char));

    if (b.kind === 'scene') { pick('establishing', cast.filter((c) => posAt(c, frame)), group('establishing', cast, frame), 'scene heading'); continue; }
    if (b.kind === 'line' && b.overlap) {
      const k = plan.beats.indexOf(b), ids = [b.speaker];
      for (let j = k + 1; j < plan.beats.length && plan.beats[j].kind === 'line' && plan.beats[j].dual; j++) ids.push(plan.beats[j].speaker);
      const two = [...new Set(ids.filter(Boolean))];
      pick('twoShot', two, group('two', two, frame), 'overlapping lines');
      continue;
    }
    if (b.kind === 'line' && b.speaker) {
      const who = b.speaker, to = lookOf(who, b.id);
      const pb = parsedOf.get(b.id);
      const pause = (pb?.parts ?? []).some((p) => p.kind === 'paren' && p.text.toLowerCase().split(/[^a-z]+/).some((w) => PAREN_WORDS.pause[w]));
      const feels = expressed.find((e) => e.char === who);
      if ((pause || feels) && b.ext !== 'V.O.') { pick('closeUp', [who], single(who, to ?? lastLook(who), frame), pause ? 'a beat in the line' : `${feels.name} on the line`); continue; }
      if (b.ext === 'V.O.') { pick('master', cast.filter((c) => posAt(c, frame)), group('two', cast, frame), 'voice-over'); continue; }
      if (to && posAt(who, frame) && posAt(to, frame)) { pick('shotReverse', [who, to], overShoulder(who, to, frame), `spoken to ${to}`); continue; }
      pick('closeUp', [who], single(who, null, frame), 'nobody on a mark to play to');
      continue;
    }
    if (b.kind === 'action' && expressed.length) {
      const who = expressed[0].char;
      pick('closeUp', [who], single(who, lookOf(who, b.id) ?? lastLook(who) ?? cast.find((c) => c !== who && posAt(c, frame)) ?? null, frame), `${expressed[0].name} in the action`);
      continue;
    }
    pick('master', cast.filter((c) => posAt(c, frame)), group('two', cast, frame), b.kind === 'action' ? 'action' : 'no rule applies');
  }
  return { nodes, cuts, rules };
}
