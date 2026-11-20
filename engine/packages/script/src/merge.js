// Re-scripting: a new build merged into the sequence as it is now, keeping what a person changed (the hand-edit rules).
//
// The sequence keeps a record of its last build (sequence.script): the beat table (id, kind, speaker, content hash,
// frames, shot number) and a fingerprint of every item it generated, by "<collection>|<src>". On a re-script:
//
//  1. A generated item that still matches its fingerprint is the script's: it is replaced by the new build's item for
//     the same src, or dropped when the new build has none (its beat was cut). A dialogue line keeps its baked voice
//     (clip, timings …) while its words are unchanged.
//  2. A generated item that no longer matches was edited by hand: it is kept, marked "hand": true, and the new build
//     generates nothing for its src from then on. A hand-edited dialogue clip still takes its words from the script
//     (the words are the script's; when and how long are the person's), and its length becomes the line's length.
//  3. A generated item that is gone was deleted by hand: its src is remembered (script.removed) and not generated again.
//     A generated track that is gone stays gone (script.dropped).
//  4. Keyed channels (expressions, moves) can't carry a mark per key: a group of keys a beat generated that is no longer
//     all there as generated is the person's from then on (script.hand lists it), and every key not generated is kept.
//  5. Items a person made (no src) are kept as they are.
//  6. Everything kept moves with the script: a kept item made by a beat shifts as that beat does; any other item shifts
//     with the beat it fell in (or the last beat before it), so a hand-made key on a line stays on that line when lines
//     are added above it.
// Shots and camera clips may not overlap: generated ones give way to kept ones.
// release (beat ids) gives a beat back to the script: its hand-edited items, deletions and hand keys are dropped and it
// is generated afresh.
import { fingerprint } from './hash.js';

export const BAKE_FIELDS = ['clip', 'timings', 'visemes', 'words', 'voice', 'audio'];
const fpItem = (c, type) => fingerprint(c, type === 'dialogue' ? ['hand', ...BAKE_FIELDS] : ['hand']);
const fpKeys = (keys) => keys.map((k) => fingerprint(k)).join(' ');
// a clip-like item's record: "<fingerprint> <start> <end>" ("<fingerprint> <frame>" for a marker); "-" for the
// fingerprint once the item is the person's, so the times the script would give it are still known
const timesOf = (c) => (c.frame !== undefined ? [c.frame] : c.start !== undefined ? [c.start, c.end] : []);
const record = (fp, c) => [fp, ...timesOf(c)].join(' ');
const fpOf = (r) => (typeof r === 'string' ? r.split(' ')[0] : null);
const sameTimes = (r, c) => typeof r === 'string' && r.split(' ').slice(1).join(' ') === timesOf(c).join(' ') && timesOf(c).length > 0;
export const beatOf = (src) => String(src).split('#')[0];
const channelOf = (role) => /#x:([^#:]+)$/.exec(role)?.[1] ?? null;
const clone = (v) => structuredClone(v);
// by start; at one frame, talk goes first so a gesture starting with a line plays over it (later clips blend in on top)
const byStart = (a, b) => (a.start ?? a.frame) - (b.start ?? b.frame) || Number(b.slot === 'talk') - Number(a.slot === 'talk') || cmp(a.src ?? '', b.src ?? '') || cmp(JSON.stringify(a), JSON.stringify(b));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * @param {any} prev the sequence document as it is now (null for a first build)
 * @param {any} G generate()'s output
 * @param {{ oldRows: any[], beats: any[], live: Set<string>, duration: number, release?: Set<string> }} o
 *   beats: the new layout's beats; live: the new beat ids
 */
export function merge(prev, G, { oldRows, beats, live, duration, release = new Set() }) {
  const seq = prev?.sequence ?? {};
  const S = seq.script ?? {};
  const gen = S.gen ?? {};
  const next = { gen: {}, removed: new Set(), hand: new Set(), dropped: new Set(), tracks: [] };
  const warnings = [];
  const isLive = (src) => { const b = beatOf(src); return b === 'cast' || live.has(b); };
  const released = (src) => release.has(beatOf(src));
  const oldRemoved = new Set((S.removed ?? []).filter((k) => isLive(k.split('|')[1]) && !released(k.split('|')[1])));
  const oldHand = new Set((S.hand ?? []).filter((k) => isLive(k.split('|')[1]) && !released(k.split('|')[1])));
  // a cut beat takes its hand-edited items with it (its words are gone from the script, so its edits have no line)
  const deadHand = (S.hand ?? []).filter((k) => !isLive(k.split('|')[1]));
  const cutDropped = new Map();
  const cutDrop = (src, n = 1) => { const b = beatOf(src); cutDropped.set(b, (cutDropped.get(b) ?? 0) + n); };

  // ---------------------------------------------------------------- time: kept items move with their beats
  const oldBy = new Map(oldRows.map((r) => [r.id, r])), newBy = new Map(beats.map((b) => [b.id, b]));
  const surv = oldRows.filter((r) => newBy.has(r.id)).sort((a, b) => a.start - b.start || a.end - b.end);
  const warp = (f) => {
    let best = null;
    for (const r of surv) if (r.start <= f) best = r;
    if (!best) return f;
    const nb = newBy.get(best.id);
    return f <= best.end ? f + nb.start - best.start : f - best.end + nb.end;
  };
  const shiftFor = (src, f) => {
    const b = src ? beatOf(src) : null;
    if (b && oldBy.has(b) && newBy.has(b)) return newBy.get(b).start - oldBy.get(b).start;
    return warp(f) - f;
  };
  const moveItem = (c, d) => {
    if (!d) return c;
    if (c.start !== undefined) c.start += d;
    if (c.end !== undefined) c.end += d;
    if (c.frame !== undefined) c.frame += d;
    return c;
  };
  const moveKeys = (keys) => keys.map((k) => { const o = clone(k); o[0] = warp(o[0]); return o; });

  // ---------------------------------------------------------------- items that carry a src
  /** @returns {{ items: any[], fresh: Set<any> }} */
  function mergeItems(coll, cur, made, type, { fixed = null } = {}) {
    const roles = new Map(made.map((x) => [x.role, x.item]));
    const out = [], fresh = new Set(), suppressed = new Set(), present = new Set(), handTimes = new Map();
    for (const item of cur ?? []) {
      const src = typeof item.src === 'string' ? item.src : null;
      if (!src) { out.push(moveItem(clone(item), shiftFor(null, item.start ?? item.frame ?? 0))); continue; }
      const key = `${coll}|${src}`;
      present.add(src);
      if ((!item.hand && fpOf(gen[key]) === fpItem(item, type)) || released(src)) {
        const nu = roles.get(src);
        if (nu && type === 'dialogue' && nu.text === item.text) for (const f of BAKE_FIELDS) if (item[f] !== undefined) nu[f] = clone(item[f]);
        continue;
      }
      if (!isLive(src)) { cutDrop(src); continue; } // the person's, but its beat was cut
      // the person's: if they left its times as the script last gave them, it takes the script's new times (a look
      // turned to the camera still spans its line); otherwise it moves with its beat
      const nu = roles.get(src);
      const c = clone(item);
      if (nu && sameTimes(gen[key], item)) { if (c.frame !== undefined) c.frame = nu.frame; else { c.start = nu.start; c.end = nu.end; } }
      else moveItem(c, shiftFor(src, item.start ?? item.frame ?? 0));
      c.hand = true;
      if (nu) handTimes.set(src, nu);
      if (type === 'dialogue' && nu && nu.text !== c.text) {
        warnings.push(`${coll}: the line at frame ${c.start} was edited by hand; its words now follow the script`);
        c.text = nu.text;
        for (const f of BAKE_FIELDS) delete c[f];
      }
      out.push(c);
      suppressed.add(src);
    }
    for (const k of Object.keys(gen)) {
      if (!k.startsWith(`${coll}|`) || channelOf(k)) continue;
      const src = k.slice(coll.length + 1);
      if (!present.has(src) && isLive(src) && !released(src)) next.removed.add(k);
    }
    for (const k of oldRemoved) if (k.startsWith(`${coll}|`)) next.removed.add(k);
    for (const [role, item] of roles) {
      if (suppressed.has(role) || next.removed.has(`${coll}|${role}`)) continue;
      const c = clone(item);
      out.push(c); fresh.add(c);
    }
    if (fixed) fit(out, fresh);
    out.sort(byStart);
    for (const c of fresh) if (out.includes(c)) next.gen[`${coll}|${c.src}`] = record(fpItem(c, type), c);
    for (const [src, nu] of handTimes) next.gen[`${coll}|${src}`] = record('-', nu);
    return { items: out, fresh };
  }
  // generated spans give way to kept ones (shots and cameras don't overlap)
  function fit(items, fresh) {
    const kept = items.filter((c) => !fresh.has(c));
    for (const g of fresh) for (const k of kept) {
      if (k.end <= g.start || k.start >= g.end) continue;
      if (k.start <= g.start) g.start = Math.max(g.start, k.end); else g.end = Math.min(g.end, k.start);
    }
    for (let i = items.length - 1; i >= 0; i--) if (fresh.has(items[i]) && !(items[i].end > items[i].start)) { fresh.delete(items[i]); items.splice(i, 1); }
  }

  // ---------------------------------------------------------------- keyed channels
  function mergeKeyed(coll, cur, groups, channelled) {
    const out = channelled ? {} : [];
    const cutSpans = [];
    const curBy = channelled ? Object.entries(cur ?? {}) : [[null, cur ?? []]];
    const chans = new Set([...curBy.map(([c]) => c), ...groups.map((g) => g.channel)]);
    for (const ch of [...chans].sort((a, b) => cmp(a ?? '', b ?? ''))) {
      const have = (curBy.find(([c]) => c === ch)?.[1] ?? []).map((k) => ({ k, fp: fingerprint(k), taken: false }));
      for (const [key, fps] of Object.entries(gen)) {
        if (!key.startsWith(`${coll}|`)) continue;
        const role = key.slice(coll.length + 1);
        if ((channelOf(role) ?? null) !== ch) continue;
        const want = fps.split(' ');
        const found = [];
        for (const fp of want) { const h = have.find((x) => !x.taken && !found.includes(x) && x.fp === fp); if (h) found.push(h); }
        if (found.length === want.length || released(role)) for (const h of found) h.taken = true; // the script's: replaced below
        else if (isLive(role)) next.hand.add(key);
        else { for (const h of found) h.taken = true; cutSpans.push(role); } // edited, and its beat was cut
      }
      for (const k of oldHand) if (k.startsWith(`${coll}|`) && (channelOf(k.slice(coll.length + 1)) ?? null) === ch) next.hand.add(k);
      for (const k of deadHand) if (k.startsWith(`${coll}|`) && (channelOf(k.slice(coll.length + 1)) ?? null) === ch) cutSpans.push(k.slice(coll.length + 1));
      // a cut beat's hand keys: those in its old span (to the end of an expression's fall)
      for (const role of cutSpans.splice(0)) {
        const r = oldBy.get(beatOf(role)); if (!r) continue;
        let n = 0;
        for (const h of have) if (!h.taken && h.k[0] >= r.start && h.k[0] <= r.end + 24) { h.taken = true; n++; }
        if (n) cutDrop(role, n);
      }
      const keep = moveKeys(have.filter((x) => !x.taken).map((x) => x.k));
      if (release.size) { // a released beat's own hand keys go with it
        for (const b of release) {
          const r = newBy.get(b); if (!r) continue;
          for (let i = keep.length - 1; i >= 0; i--) if (keep[i][0] >= r.start && keep[i][0] <= r.end) keep.splice(i, 1);
        }
      }
      // a kept key wins its frame; a group's record holds the keys it actually put in
      const frames = new Set(keep.map((k) => k[0]));
      const made = [];
      for (const g of groups.filter((x) => x.channel === ch)) {
        const key = `${coll}|${g.role}`;
        if (next.hand.has(key)) continue;
        const ks = clone(g.keys).filter((k) => !frames.has(k[0]));
        for (const k of ks) frames.add(k[0]);
        if (!ks.length) continue;
        made.push(...ks);
        next.gen[key] = fpKeys(ks);
      }
      const all = [...keep, ...made].sort((a, b) => a[0] - b[0]);
      if (channelled) { if (all.length) out[ch] = all; } else out.push(...all);
    }
    return out;
  }

  // ---------------------------------------------------------------- shots, markers, cast
  const shots = mergeItems('shots', seq.shots, G.shots, 'shot', { fixed: true }).items;
  const markers = mergeItems('markers', seq.markers, G.markers, 'marker').items;
  // cast entries: the same rules, by character id (no time)
  const cast = {};
  const castMade = new Map(G.cast.map((x) => [x.id, x.item]));
  for (const [id, e] of Object.entries(seq.cast ?? {})) {
    const src = typeof e.src === 'string' ? e.src : null, key = src && `cast|${src}`;
    if (src && ((!e.hand && fpOf(gen[key]) === fpItem(e, 'cast')) || released(src))) continue; // the script's: rebuilt below
    cast[id] = clone(e);
    if (src) cast[id].hand = true;
    castMade.delete(id); // a person's entry wins
  }
  for (const k of Object.keys(gen)) if (k.startsWith('cast|') && !(seq.cast ?? {})[k.slice('cast|cast#'.length)] && !released(k.slice(5))) next.removed.add(k);
  for (const k of oldRemoved) if (k.startsWith('cast|')) next.removed.add(k);
  for (const [id, item] of castMade) {
    const key = `cast|${item.src}`;
    if (next.removed.has(key)) continue;
    cast[id] = clone(item);
    next.gen[key] = fpItem(cast[id], 'cast');
  }

  // ---------------------------------------------------------------- tracks
  const genTracks = new Set(S.tracks ?? []), oldDropped = new Set(S.dropped ?? []);
  const made = new Map(G.tracks.map((t) => [t.id, t]));
  const tracks = [];
  const fill = (t, g, cur) => {
    if (g?.keyed || t.type === 'expression' || t.type === 'transform') t.keys = mergeKeyed(t.id, cur.keys, g?.items ?? [], t.type === 'expression');
    else t.clips = mergeItems(t.id, cur.clips, g?.items ?? [], t.type, { fixed: t.type === 'camera' }).items;
    return t;
  };
  const empty = (t) => (t.clips ? !t.clips.length : Array.isArray(t.keys) ? !t.keys.length : !Object.keys(t.keys ?? {}).length);
  for (const t of seq.tracks ?? []) {
    const g = made.get(t.id);
    if (!g && !genTracks.has(t.id)) { tracks.push(moveTrack(clone(t), warp)); continue; }
    const nt = fill(clone(t), g, t);
    if (!g && empty(nt)) continue;
    tracks.push(nt);
    next.tracks.push(t.id);
  }
  for (const g of G.tracks) {
    if ((seq.tracks ?? []).some((t) => t.id === g.id)) continue;
    if (genTracks.has(g.id) || oldDropped.has(g.id)) { next.dropped.add(g.id); continue; }
    if (!g.items.length) continue;
    const base = { ...g }; delete base.items; delete base.keyed;
    const nt = fill(base, g, {});
    if (empty(nt)) continue;
    tracks.push(nt);
    next.tracks.push(g.id);
  }

  // the duration: the script's, unless a person set it
  let dur = duration;
  if (S.gen?.duration !== undefined && seq.duration !== undefined && seq.duration !== S.gen.duration) {
    dur = seq.duration;
    if (dur !== duration) warnings.push(`the duration was set by hand (${dur} frames); the script runs ${duration}`);
  }
  for (const [b, n] of cutDropped) {
    const r = oldBy.get(b);
    const what = r ? `${r.kind}${r.cue ? ` (${r.cue}: "${r.words.slice(0, 6).join(' ')}${r.words.length > 6 ? ' …' : ''}")` : ''}` : 'beat';
    warnings.push(`the cut ${what} ${b} took ${n} hand-edited item${n === 1 ? '' : 's'} with it`);
  }
  return { shots, markers, cast, tracks, duration: dur, genDuration: duration, next, warnings };
}

/** A track a person made, moved with the script: clips by their start, keys by their frames. */
function moveTrack(t, warp) {
  if (Array.isArray(t.clips)) for (const c of t.clips) { const d = warp(c.start) - c.start; c.start += d; c.end += d; }
  const mv = (ks) => ks.map((k) => { const o = [...k]; o[0] = warp(o[0]); return o; });
  if (Array.isArray(t.keys)) t.keys = mv(t.keys);
  else if (t.keys && typeof t.keys === 'object') for (const ch of Object.keys(t.keys)) t.keys[ch] = mv(t.keys[ch]);
  return t;
}

/** Hand-edited dialogue clips' lengths, by beat, in the sequence as it is now (before a re-script lays out). */
export function handLengths(prev) {
  const out = new Map();
  const S = prev?.sequence?.script;
  if (!S) return out;
  for (const t of prev.sequence.tracks ?? []) {
    if (t.type !== 'dialogue') continue;
    for (const c of t.clips ?? []) {
      if (typeof c.src !== 'string' || !c.src.endsWith('#say')) continue;
      const r = S.gen?.[`${t.id}|${c.src}`];
      const edited = c.hand || fpOf(r) !== fpItem(c, 'dialogue');
      if (edited && !sameTimes(r, c)) out.set(beatOf(c.src), c.end - c.start); // retimed by hand, not only reworded
    }
  }
  return out;
}
