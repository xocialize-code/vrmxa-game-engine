// Coverage by rule (M4 W8, AB-T-0580): a camera for every shot of a script's build, chosen from the script and the
// marks. It is @vrmxg/script's coverage hook: buildSequence(text, { coverage: coverByRule() }).
//
// The rules, in order (the first that applies picks the shot's camera):
//   1. establishing  a scene heading's shot: a wide of everyone on their marks, from further back and higher than the
//                    two-shot (one per scene: vc-est-<heading>);
//   2. two-shot      overlapping lines (dual dialogue, ^): the speakers together (vc-two-<a>-<b>);
//   3. close-up      a beat: a (beat) or (pause) in the line, or an expression the line or an action gives someone
//                    (a parenthetical such as (smiling), a tag such as [[happy]] or [[HANA happy]]). A clean single on
//                    that person, from the side of the line the scene is shot from (vc-cu-<id>-to-<other>);
//   4. shot/reverse  a line spoken to someone on a mark: over the listener's shoulder onto the speaker, both setups on
//                    one side of the line between them, so the reverse is a true reverse (vc-ots-<speaker>-<listener>);
//   5. master        anything else (action, voice-over): the two-shot of the whole cast (vc-two). A lone speaker with
//                    nobody to play to gets her close-up.
// The scene is shot from one side of its line, the line between its first two people at the scene's first shot. That
// side is `side` (+1: the side the line's normal [dz, −dx] points to), or the side that faces `room` (default the set's
// origin, the middle of most sets). From then on each pair keeps the side the last camera on it stood on, judged against
// the line as it ran before the cut, so a move that swings the line keeps screen direction: cutting between any two of
// these cameras never crosses a line (lint.js checks it).
//
// Each camera is a VirtualCamera on one of M2's rig presets (twoShot, shotReverse, closeUp), its own props overriding
// what the shot needs: a fixed body placed on the floor plan, an aim at the people. A move (a step key) that lands
// inside a shot cuts it in pieces (the hook's splits), each placed for where people stand then; ids name the marks
// people stand on when they aren't their first (vc-ots-mira-hana-1-mira-at-window-table).
//
// Deterministic: plain arithmetic and square roots, positions rounded to the millimetre, ids from what each camera
// films. The same script and marks give the same cameras, byte for byte.
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
 * @returns {{ nodes: any[], cuts: Map<string, { camera: string, splits?: { frame: number, camera: string }[] }>, rules: Map<string, { rule: string, subjects: string[], camera: string, splits?: { frame: number, camera: string }[], why: string }> }}
 */
export function planCoverage(ctx, options = {}) {
  const { plan, shots, cast, marks, markTf = new Map(), parsed = null } = ctx;
  const room = options.room ?? [0, 0, 0], estSize = options.estSize ?? 0.4, otsScreen = options.otsScreen ?? 0.2;
  const beatOf = new Map(plan.beats.map((b) => [b.id, b]));
  const parsedOf = new Map((parsed?.beats ?? []).map((b) => [b.id, b]));
  const order = new Map(cast.map((c, i) => [c, i]));
  const byOrder = (a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9) || (a < b ? -1 : a > b ? 1 : 0);
  const moves = plan.events.filter((e) => e.type === 'mark' && markTf.has(e.mark)).sort((a, b) => a.frame - b.frame);

  /** The mark someone stands on at a frame when it isn't her first (null on her first mark). */
  const markAt = (id, frame) => {
    let m = null;
    for (const e of moves) if (e.char === id && e.frame <= frame) m = e.mark;
    return m !== null && JSON.stringify(markTf.get(m)) === JSON.stringify(marks.get(id) ?? null) ? null : m;
  };
  /** Where someone stands at a frame: her first mark, then the last move at or before it. */
  const tfAt = (id, frame) => { const m = markAt(id, frame); return m !== null ? markTf.get(m) : marks.get(id) ?? (moves.some((e) => e.char === id && e.frame <= frame) ? markTf.get(moves.filter((e) => e.char === id && e.frame <= frame).at(-1).mark) : null); };
  const posAt = (id, frame) => { const tf = tfAt(id, frame); return tf ? [tf.p?.[0] ?? 0, 0, tf.p?.[2] ?? 0] : null; };

  // ---------------------------------------------------------------- cameras, by setup: ids from what the setup is
  // A setup's id says what it films (its kind, its people, whom a close-up plays to) and where they stand when that isn't
  // their first mark (-mira-at-east), so the same id means the same camera from build to build: a camera a person put on
  // a shot by hand stays the one they chose after a re-script. Only two different cameras with the same description in
  // one build (the same people on the same marks, shot from both sides) take -2, -3 by first use.
  const nodes = [], cuts = new Map(), rules = new Map();
  const made = new Map(); // id → node key
  const camera = (base, people, frame, node) => {
    const at = [...people].sort(byOrder).map((c) => { const m = markAt(c, frame); return m !== null ? `-${c}-at-${slug(String(m).replace(/^mark-/, ""))}` : ''; }).join('');
    const want = `${base}${at}`, key = JSON.stringify(node);
    for (let n = 1; ; n++) {
      const id = n === 1 ? want : `${want}-${n}`;
      if (!made.has(id)) { made.set(id, key); nodes.push({ id, type: 'VirtualCamera', ...node }); return id; }
      if (made.get(id) === key) return id;
    }
  };

  // ---------------------------------------------------------------- the line: each pair's side, kept from camera to camera
  // refs: for each pair of people, where the last camera that played to both stood. A new camera on that pair stands on
  // the side of the line the last one was on, judged against the line as it ran just before the cut, so a move that
  // swings the line (on a cut, or at a cut inside a shot) keeps what the audience saw: who was screen-left stays so.
  let scene = null, refs = new Map();
  const pairKey = (x, y) => [x, y].sort(byOrder).join('|');
  const sceneStart = (frame, heading) => {
    const here = cast.filter((c) => posAt(c, frame)), ps = here.map((c) => posAt(c, frame));
    const side = ps.length >= 2 ? options.side ?? (sideOf(ps[0], ps[1], room) || 1) : 1;
    scene = { heading, side, first: here.slice(0, 2) };
    refs = new Map();
  };
  /** The side of the line x → y a camera on the pair takes for a cut at `frame`. */
  const sideFor = (x, y, frame) => {
    const f = Math.max(0, frame - 1), a = posAt(x, f) ?? posAt(x, frame), b = posAt(y, f) ?? posAt(y, frame);
    const ref = refs.get(pairKey(x, y));
    if (ref) { const s = sideOf(a, b, ref, 0); if (s) return s; }
    if (scene.first.length === 2 && pairKey(x, y) === pairKey(scene.first[0], scene.first[1])) return x === scene.first[0] ? scene.side : -scene.side;
    return options.side ?? (sideOf(a, b, room, 0) || 1);
  };
  /** After a camera is placed: it is the reference for every pair it plays to. */
  const seen = (id, people) => {
    const p = nodes.find((n) => n.id === id)?.transform?.p;
    if (!p) return;
    const ps = [...new Set(people)].filter((c) => order.has(c));
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) refs.set(pairKey(ps[i], ps[j]), p);
  };

  const group = (kind, ids, frame, prev) => {
    let here = ids.filter((c) => posAt(c, frame)).sort(byOrder);
    // the line the group shot is placed by: a pair the camera before it played to, when it shares one, so the cut keeps it
    const shared = prev ? here.filter((c) => prev.includes(c)) : [];
    if (shared.length >= 2) here = [...shared.slice(0, 2), ...here.filter((c) => !shared.slice(0, 2).includes(c))];
    const ps = here.map((c) => posAt(c, frame));
    const est = kind === 'establishing';
    let p;
    if (ps.length >= 2) p = groupPlace(ps, sideFor(here[0], here[1], frame), kind);
    else if (ps.length === 1) p = [mm(ps[0][0]), est ? 2.2 : EYE, mm(ps[0][2] + (est ? 4.5 : 3))];
    else p = [0, est ? 2.2 : EYE, est ? 6 : 4];
    const targets = (here.length ? [...here].sort(byOrder) : [...ids].sort(byOrder));
    const all = targets.length === cast.length && targets.every((c, i) => c === [...cast].sort(byOrder)[i]);
    const id = est
      ? camera(`vc-est-${slug(scene.heading)}`, targets, frame, { name: `Establishing: ${scene.heading}`, transform: { p }, props: { rig: 'twoShot', aim: { targets, size: estSize } } })
      : camera(all ? 'vc-two' : `vc-two-${targets.join('-')}`, targets, frame, { name: `Two-shot: ${targets.join(', ')}`, transform: { p }, props: { rig: 'twoShot', aim: { targets } } });
    seen(id, targets);
    return { id, people: targets };
  };
  const single = (who, to, frame) => {
    const p = posAt(who, frame);
    if (!p) return { id: camera(`vc-cu-${who}`, [], frame, { name: `${who}, close`, props: { rig: 'closeUp', aim: { target: who }, body: { target: who } } }), people: [who] }; // M2's follow close-up
    const q = to ? posAt(to, frame) : null;
    const at = singlePlace(p, q, q ? sideFor(who, to, frame) : 1, facing(tfAt(who, frame)));
    const id = camera(`vc-cu-${who}${q ? `-to-${to}` : ''}`, q ? [who, to] : [who], frame, { name: `${who}, close${q ? ` (to ${to})` : ''}`, transform: { p: at }, props: { rig: 'closeUp', body: { type: 'fixed' }, aim: { target: who, offset: [0, EYES, 0] } } });
    if (q) seen(id, [who, to]);
    return { id, people: q ? [who, to] : [who] };
  };
  const overShoulder = (speaker, listener, frame) => {
    const [a, b] = [speaker, listener].sort(byOrder);
    const pa = posAt(a, frame), pb = posAt(b, frame), s = sideFor(a, b, frame);
    // the rig's shotReverse(a, b) is over a's shoulder onto b, on its `side` of the line a → b (the opposite sign to ours)
    const reverse = speaker === a;
    const r = shotReverse(pa, pb, { side: -s, reverse, height: EYE });
    const sx = reverse ? s * otsScreen : -s * otsScreen; // the speaker away from the listener's shoulder
    const id = camera(`vc-ots-${speaker}-${listener}`, [speaker, listener], frame, { name: `${speaker} over ${listener}`, transform: { p: r.p.map(mm) }, props: { rig: 'shotReverse', aim: { target: speaker, screen: [mm(sx), 0.15] } } });
    seen(id, [speaker, listener]);
    return { id, people: [speaker, listener] };
  };

  let prev = null; // the people the last camera played to
  for (const s of shots) {
    const b = beatOf.get(s.beat);
    if (b.kind === 'scene' || !scene) { sceneStart(s.start, b.heading ?? 'the scene'); prev = null; }
    // a move inside the shot is a cut (the script's moves are step keys): the shot is filmed in pieces, each placed for
    // where people stand in it
    const at = [s.start, ...new Set(moves.filter((e) => e.frame > s.start && e.frame < s.end).map((e) => e.frame))];
    const lookOf = (id, beat) => plan.events.find((e) => e.type === 'look' && e.char === id && e.beat === beat && order.has(e.at))?.at ?? null;
    const lastLook = (id, frame) => { let to = null; for (const e of plan.events) if (e.type === 'look' && e.char === id && e.start <= frame && order.has(e.at)) to = e.at; return to; };
    const expressed = plan.events.filter((e) => e.type === 'expression' && e.beat === b.id).sort((x, y) => x.start - y.start || byOrder(x.char, y.char));

    // the rule, once per shot: what it films; `shoot(frame)` places it for a piece starting at `frame`
    let rule, subjects, why, shoot;
    if (b.kind === 'scene') {
      rule = 'establishing'; why = 'scene heading'; subjects = (f) => cast.filter((c) => posAt(c, f)); shoot = (f) => group('establishing', cast, f, prev);
    } else if (b.kind === 'line' && b.overlap) {
      const k = plan.beats.indexOf(b), ids = [b.speaker];
      for (let j = k + 1; j < plan.beats.length && plan.beats[j].kind === 'line' && plan.beats[j].dual; j++) ids.push(plan.beats[j].speaker);
      const two = [...new Set(ids.filter(Boolean))];
      rule = 'twoShot'; why = 'overlapping lines'; subjects = () => two; shoot = (f) => group('two', two, f, prev);
    } else if (b.kind === 'line' && b.speaker) {
      const who = b.speaker, to = lookOf(who, b.id);
      const pb = parsedOf.get(b.id);
      const pause = (pb?.parts ?? []).some((p) => p.kind === 'paren' && p.text.toLowerCase().split(/[^a-z]+/).some((w) => Object.hasOwn(PAREN_WORDS.pause, w)));
      const feels = expressed.find((e) => e.char === who);
      if ((pause || feels) && b.ext !== 'V.O.') { rule = 'closeUp'; why = pause ? 'a beat in the line' : `${feels.name} on the line`; subjects = () => [who]; shoot = (f) => single(who, to ?? lastLook(who, f), f); }
      else if (b.ext === 'V.O.') { rule = 'master'; why = 'voice-over'; subjects = (f) => cast.filter((c) => posAt(c, f)); shoot = (f) => group('two', cast, f, prev); }
      else if (to && posAt(who, s.start) && posAt(to, s.start)) { rule = 'shotReverse'; why = `spoken to ${to}`; subjects = () => [who, to]; shoot = (f) => overShoulder(who, to, f); }
      else { rule = 'closeUp'; why = 'nobody on a mark to play to'; subjects = () => [who]; shoot = (f) => single(who, null, f); }
    } else if (b.kind === 'action' && expressed.length) {
      const who = expressed[0].char;
      rule = 'closeUp'; why = `${expressed[0].name} in the action`; subjects = () => [who];
      shoot = (f) => single(who, lookOf(who, b.id) ?? lastLook(who, f) ?? cast.find((c) => c !== who && posAt(c, f)) ?? null, f);
    } else {
      rule = 'master'; why = b.kind === 'action' ? 'action' : 'no rule applies'; subjects = (f) => cast.filter((c) => posAt(c, f)); shoot = (f) => group('two', cast, f, prev);
    }

    const pieces = [];
    for (const f of at) {
      const { id, people } = shoot(f);
      if (pieces.at(-1)?.camera !== id) pieces.push({ frame: f, camera: id });
      prev = people;
    }
    const [first, ...rest] = pieces;
    cuts.set(s.beat, { camera: first.camera, ...(rest.length ? { splits: rest } : {}) });
    rules.set(s.beat, { rule, subjects: subjects(s.start), camera: first.camera, ...(rest.length ? { splits: rest } : {}), why: rest.length ? `${why}; cut at the move${rest.length > 1 ? 's' : ''}` : why });
  }
  return { nodes, cuts, rules };
}

/** A mark's or a heading's name as part of a node id. */
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
