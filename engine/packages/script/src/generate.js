// What a laid-out script generates: shots, markers, the cast's placement, cameras and tracks. Every generated item
// says where it came from: clips, shots, markers and cast entries carry src "<beat id>#<role>" (a role is "say",
// "talk", "g:nod", "look", "cam", "shot" …), and keyed channels are generated in groups with the same kind of key. The
// re-script merge (merge.js) uses those to tell what a person changed.

/**
 * Shot numbers that survive edits: kept once given; new shots go between (035, 032) or take letters after the shot
 * before, in reading order (030A, 030B; 030AA between 030A and 030B). Between 030 and 030A nothing fits: the new shot
 * is numbered after 030A's letters and `warn` says so (renumber: true numbers every shot again).
 * @param {{ id: string }[]} shotBeats @param {Map<string, string>} [previous]
 * @param {{ renumber?: boolean, warn?: (message: string) => void }} [o]
 */
export function numberShots(shotBeats, previous = new Map(), { renumber = false, warn = (message) => void message } = {}) {
  const out = new Map();
  const parse = (s) => { const m = /^(\d+)([A-Z]*)$/.exec(s ?? ''); return m ? { n: Number(m[1]), x: m[2] } : null; };
  const fmt = (n, x = '') => `${String(n).padStart(3, '0')}${x}`;
  const known = shotBeats.map((b) => (renumber ? null : parse(previous.get(b.id))));
  const taken = new Set(known.filter(Boolean).map((k) => fmt(k.n, k.x)));
  for (let i = 0; i < shotBeats.length;) {
    if (known[i]) { out.set(shotBeats[i].id, fmt(known[i].n, known[i].x)); i++; continue; }
    let j = i; while (j < shotBeats.length && !known[j]) j++;
    const lo = i > 0 ? parse(out.get(shotBeats[i - 1].id)) : { n: 0, x: '' }, hi = j < shotBeats.length ? known[j] : null;
    const run = j - i;
    let prev = lo.x;
    for (let k = 0; k < run; k++) {
      let name;
      if (!hi && !lo.x) name = fmt(lo.n - (lo.n % 10) + 10 * (k + 1));
      else if (hi && !lo.x && hi.n - lo.n - 1 >= run) name = fmt(lo.n + Math.floor(((k + 1) * (hi.n - lo.n)) / (run + 1)));
      else if (!hi || hi.n > lo.n + 1 || (hi.n > lo.n && !lo.x)) {
        // room above the shot before: the next integer when free of letters, else letters after it
        name = fmt(lo.n, suffixAfter(prev, null, taken, lo.n));
      } else {
        const upper = hi.n === lo.n ? hi.x : null;
        let x = suffixAfter(prev, upper, taken, lo.n);
        if (x === null) { x = suffixAfter(upper ?? prev, null, taken, lo.n); warn(`no shot number fits between ${fmt(lo.n, lo.x)} and ${fmt(hi.n, hi.x)}: the new shot is ${fmt(lo.n, x)}, out of reading order (renumber to tidy)`); }
        name = fmt(lo.n, x);
      }
      taken.add(name);
      prev = parse(name).n === lo.n ? parse(name).x : prev;
      out.set(shotBeats[i + k].id, name);
    }
    i = j;
  }
  return out;
}
/** Letter suffixes in reading order: the shortest after `a` and before `b` (null: unbounded) not yet taken, or null. */
function suffixAfter(a, b, taken, n) {
  const fmt = (x) => `${String(n).padStart(3, '0')}${x}`;
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const len of [1, 2, 3]) {
    let best = null;
    const walk = (p) => {
      if (p.length === len) { if (p > a && (b === null || p < b) && !taken.has(fmt(p)) && (best === null || p < best)) best = p; return; }
      for (const c of A) walk(p + c);
    };
    if (len < 3) walk(''); else for (const c of A) for (const d of A) for (const e of A) { const p = c + d + e; if (p > a && (b === null || p < b) && !taken.has(fmt(p)) && (best === null || p < best)) best = p; }
    if (best !== null) return best;
  }
  return null;
}

/**
 * The default coverage until W8's rules: an establishing wide for a scene heading and for action (a group framing of
 * the cast, placed off the line between the first two marks), and a close-up on the speaker for a line (M2's closeUp
 * rig). Dual dialogue and voice-over play in the wide. A coverage function takes the same arguments and returns the
 * same shape.
 * @param {{ plan: any, shots: any[], cast: string[], marks: Map<string, any> }} ctx
 * @returns {{ nodes: any[], cuts: Map<string, { camera: string }> }}
 */
export function defaultCoverage({ plan, shots, cast, marks }) {
  const nodes = [], cuts = new Map();
  const used = new Set();
  const wide = () => {
    if (!used.has('vc-wide')) {
      used.add('vc-wide');
      const ps = cast.map((c) => marks.get(c)?.p).filter(Boolean);
      let p = [0, 1.5, 4];
      if (ps.length >= 2) {
        const [a, b] = ps, mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2, dx = b[0] - a[0], dz = b[2] - a[2], d = Math.sqrt(dx * dx + dz * dz) || 1;
        const off = Math.max(2.5, d * 1.6);
        p = [round(mx + (dz / d) * off), 1.5, round(mz - (dx / d) * off)];
      } else if (ps.length === 1) p = [round(ps[0][0]), 1.5, round(ps[0][2] + 3)];
      nodes.push({ id: 'vc-wide', type: 'VirtualCamera', name: 'Wide', transform: { p }, props: { aim: { size: 0.75, targets: [...cast] }, rig: 'twoShot' } });
    }
    return 'vc-wide';
  };
  const close = (id) => {
    const cam = `vc-${id}`;
    if (!used.has(cam)) { used.add(cam); nodes.push({ id: cam, type: 'VirtualCamera', name: `${id}, close`, props: { aim: { target: id }, body: { target: id }, rig: 'closeUp' } }); }
    return cam;
  };
  for (const s of shots) {
    const b = plan.beats.find((x) => x.id === s.beat);
    cuts.set(s.beat, { camera: b.kind === 'line' && b.speaker && !b.overlap && b.ext !== 'V.O.' ? close(b.speaker) : wide() });
  }
  return { nodes, cuts };
}
const round = (v) => Math.round(v * 1000) / 1000;

/**
 * Generate from a layout.
 * @param {any} plan layout()'s result
 * @param {{ numbers: Map<string, string>, initial: Map<string, string>, titled: Set<string>, markTf: Map<string, any>, markNodes: any[], setCamera: string | null, coverage?: Function, behaviours?: boolean, parsed?: any }} o
 *   initial: character id → the mark she starts on (titled: placed by the title page, not by her first [[at]] tag);
 *   markTf: mark node id → its transform; markNodes: Marker nodes the build adds; parsed: parseScript's result. The
 *   coverage hook gets { plan, shots, cast, marks } and, since M4 W8, markTf (for moves between marks), parsed (the
 *   beats' parentheticals) and numbers (beat id → shot number)
 */
export function generate(plan, { numbers, initial, titled, markTf, markNodes, setCamera, coverage = defaultCoverage, behaviours = false, parsed = null }) {
  const marks = new Map([...initial].map(([c, m]) => [c, markTf.get(m)]));
  const T = plan.timing, F = plan.F;
  const shotBeats = plan.beats.filter((b) => b.shot);
  const shots = shotBeats.map((b, i) => ({ beat: b.id, start: b.start, end: i + 1 < shotBeats.length ? shotBeats[i + 1].start : plan.duration }));
  const cov = coverage({ plan, shots, cast: plan.characters, marks, markTf, parsed, numbers });

  const out = { shots: [], markers: [], cast: [], tracks: [], nodes: [] };
  for (const s of shots) {
    const b = plan.beats.find((x) => x.id === s.beat);
    out.shots.push({ role: `${s.beat}#shot`, item: { id: `shot-${s.beat}`, name: numbers.get(s.beat), start: s.start, end: s.end, src: `${s.beat}#shot` } });
    if (b.kind === 'scene') out.markers.push({ role: `${s.beat}#marker`, item: { frame: s.start, name: b.heading, src: `${s.beat}#marker` } });
  }
  // the cast: on their first mark, standing for the camera (no brain, no player input) unless asked to keep them
  for (const id of plan.characters) {
    const entry = { ...(marks.has(id) ? { transform: structuredClone(marks.get(id)) } : {}), ...(behaviours ? {} : { behaviours: [] }) };
    if (Object.keys(entry).length) out.cast.push({ role: `cast#${id}`, id, item: { ...entry, src: `cast#${id}` } });
  }
  // nodes: the brain, the coverage's cameras, the marks the build placed
  if (setCamera) out.nodes.push({ id: 'brain', type: 'CameraBrain', props: { camera: setCamera } });
  out.nodes.push(...cov.nodes, ...markNodes);

  const track = (id, type, extra = {}) => { const t = { id, type, ...extra, items: [] }; out.tracks.push(t); return t; };
  const cams = track('cameras', 'camera');
  for (const s of shots) {
    const b = plan.beats.find((x) => x.id === s.beat), cut = cov.cuts.get(s.beat);
    if (!cut) continue;
    cams.items.push({ role: `${s.beat}#cam`, item: { start: s.start, end: s.end, camera: cut.camera, ...(b.transition === 'dissolve' ? { blend: { frames: T.dissolve, style: 'easeInOut' } } : {}), src: `${s.beat}#cam` } });
  }

  const by = (char, type) => plan.events.filter((e) => e.char === char && e.type === type);
  for (const id of plan.characters) {
    const says = track(`${id}-says`, 'dialogue', { target: id });
    for (const e of by(id, 'say')) says.items.push({ role: `${e.beat}#say`, item: { start: e.start, end: e.end, text: e.text, src: `${e.beat}#say` } });

    // body: talk over each line; gestures over it (a talk clip blends back in after a gesture that ends mid-line)
    const act = track(`${id}-act`, 'animation', { target: id, step: 2 });
    const talks = by(id, 'talk'), gestures = by(id, 'gesture');
    const count = new Map();
    for (const t of talks) act.items.push({ role: `${t.beat}#talk`, item: { slot: 'talk', start: t.start, end: t.end, blendIn: 6, blendOut: 8, src: `${t.beat}#talk` } });
    for (const g of gestures) {
      const k = `${g.beat}#g:${g.name}`, n = (count.get(k) ?? 0) + 1; count.set(k, n);
      const role = n === 1 ? k : `${k}:${n}`, end = g.start + F(T.gesture);
      act.items.push({ role, item: { slot: g.name, start: g.start, end, blendIn: 4, blendOut: 6, src: role } });
      const talk = talks.find((t) => g.start >= t.start && g.start < t.end);
      if (talk && end < talk.end) act.items.push({ role: `${role}>talk`, item: { slot: 'talk', start: end - 6, end: talk.end, blendIn: 6, blendOut: 8, src: `${role}>talk` } });
    }

    // face: an expression rises, holds to the end of its beat and falls; overlapping ones of a name join
    const face = track(`${id}-face`, 'expression', { target: id, step: 2, keyed: true });
    const names = [...new Set(by(id, 'expression').map((e) => e.name))].sort();
    for (const name of names) {
      const es = by(id, 'expression').filter((e) => e.name === name).sort((a, b) => a.start - b.start);
      const runs = [];
      for (const e of es) {
        const last = runs.at(-1), end = Math.max(e.end, e.start + T.rise);
        if (last && e.start <= last.end + T.fall + T.rise) last.end = Math.max(last.end, end);
        else runs.push({ beat: e.beat, start: e.start, end });
      }
      for (const r of runs) face.items.push({ role: `${r.beat}#x:${name}`, channel: name, keys: [[r.start, 0], [r.start + T.rise, T.weight, 'easeOut'], ...(r.end > r.start + T.rise ? [[r.end, T.weight]] : []), [Math.max(r.end, r.start + T.rise) + T.fall, 0, 'easeIn']] });
    }

    const eyes = track(`${id}-eyes`, 'lookAt', { target: id });
    for (const l of by(id, 'look')) eyes.items.push({ role: `${l.beat}#look`, item: { at: l.at, start: l.start, end: l.end, src: `${l.beat}#look` } });

    // moves between marks: cuts (step keys) from the first mark to each later one
    const moves = by(id, 'mark').filter((m, k) => !(k === 0 && initial.get(id) === m.mark && !titled.has(id)));
    if (moves.length && initial.has(id)) {
      const mv = track(`${id}-moves`, 'transform', { target: id, keyed: true });
      mv.items.push({ role: `cast#${id}#at`, channel: null, keys: [[0, structuredClone(markTf.get(initial.get(id)))]] });
      const count2 = new Map();
      for (const m of moves) {
        const k = `${m.beat}#at:${m.mark}`, n = (count2.get(k) ?? 0) + 1; count2.set(k, n);
        mv.items.push({ role: n === 1 ? k : `${k}:${n}`, channel: null, keys: [[m.frame, structuredClone(markTf.get(m.mark)), 'step']] });
      }
    }
  }
  return out;
}
