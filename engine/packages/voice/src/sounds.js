// A sequence's music and sound effects on their buses (M4 W7). Lines are heard on the voice bus through the dialogue
// track (the voice service plays each baked clip from the speaker's head); everything else a short plays goes on an
// audio track per bus: `music`, `sfx` and `ambience`, each track with its `bus` (@vrmxg/tracks plays a clip on its own
// bus, else its track's, else sfx). The mixer's buses (@vrmxg/audio BUSES) then set each one's volume and mute.
//
//   placeSound(doc, { ref, start, end, bus })   the pure edit: the clip on its bus's track (made if there is none)
//   addSound(session, { … })                    the editor op, one undo step
//   soundProblems(doc)                          an audio clip on the voice bus, or on a bus the mixer lacks

/** The buses a sequence's audio tracks use (the mixer's, less voice: lines go through the dialogue track). */
export const SOUND_BUSES = ['music', 'sfx', 'ambience'];
const MIXER = ['music', 'sfx', 'voice', 'ambience']; // @vrmxg/audio BUSES (a presentation package: not imported here)

/**
 * The bus a sound goes on when none is given: music for a file named or kept as music, ambience for a room tone, else
 * a sound effect.
 * @param {string} ref
 */
export function busFor(ref) {
  const name = String(ref).toLowerCase();
  if (/(^|[/_-])(music|score|song|theme)([/_.-]|$)/.test(name)) return 'music';
  if (/(^|[/_-])(ambience|ambient|room-?tone|atmos)([/_.-]|$)/.test(name)) return 'ambience';
  return 'sfx';
}

/**
 * Put a sound on its bus's audio track (made, named after the bus, if the sequence has none).
 * @param {any} doc a sequence document
 * @param {{ ref: string, start: number, end: number, bus?: string, gain?: number, offset?: number }} s ref: the sound
 *   file (an audio clip names its file); start, end: frames; bus: music, sfx or ambience (default: busFor(ref));
 *   offset: seconds into the file
 * @returns {{ doc: any, ops: any[], label: string, track: string, bus: string }}
 */
export function placeSound(doc, { ref, start, end, bus = busFor(ref), gain, offset }) {
  if (!doc?.sequence) throw new Error('a sound goes in a sequence document');
  if (!ref) throw new Error('a sound names its file (ref)');
  if (!SOUND_BUSES.includes(bus)) throw new Error(`a sound goes on ${SOUND_BUSES.join(', ')}${bus === 'voice' ? ' (lines are voiced through the dialogue track)' : ''}, not "${bus}"`);
  if (!(Number.isInteger(start) && Number.isInteger(end) && end > start && start >= 0)) throw new Error(`a sound's start and end are frames, the end after the start (${start}, ${end})`);
  const seq = structuredClone(doc.sequence);
  let t = seq.tracks.find((x) => x.type === 'audio' && (x.bus ?? 'sfx') === bus && !x.target);
  if (!t) {
    const taken = new Set(seq.tracks.map((x) => x.id));
    let id = bus;
    for (let n = 2; taken.has(id); n++) id = `${bus}-${n}`;
    t = { id, type: 'audio', bus, clips: [] };
    seq.tracks.push(t);
  }
  t.clips.push({ start, end, asset: ref, ...(gain !== undefined && gain !== 1 ? { gain } : {}), ...(offset ? { offset } : {}) });
  t.clips.sort((a, b) => a.start - b.start || (a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0));
  if (end > seq.duration) seq.duration = end;
  const ops = [{ op: 'setDoc', path: 'sequence', value: seq }];
  return { doc: { ...doc, sequence: structuredClone(seq) }, ops, label: `Add ${bus === 'sfx' ? 'sound' : bus} ${ref.replace(/^.*\//, '')} @${start}`, track: t.id, bus };
}

/**
 * Add a sound in the editor: one undo step.
 * @param {{ doc: any, isSequence: boolean, run: (label: string, ops: any[]) => void }} session
 * @param {Parameters<typeof placeSound>[1]} s
 */
export function addSound(session, s) {
  if (!session.isSequence) throw new Error('a sound goes in a sequence document');
  const r = placeSound(session.doc, s);
  session.run(r.label, r.ops);
  return { label: r.label, track: r.track, bus: r.bus };
}

/** Audio clips that would be heard on the wrong bus: on voice (lines belong to the dialogue track), or on one the mixer lacks. */
export function soundProblems(doc) {
  const out = [];
  for (const t of doc?.sequence?.tracks ?? []) {
    if (t.type !== 'audio') continue;
    (t.clips ?? []).forEach((c, i) => {
      const bus = c.bus ?? t.bus ?? 'sfx';
      if (bus === 'voice') out.push(`${t.id}.clips[${i}] (${c.asset}) is on the voice bus: lines are voiced through a dialogue track`);
      else if (!MIXER.includes(bus)) out.push(`${t.id}.clips[${i}] (${c.asset}) is on "${bus}", which the mixer lacks (${MIXER.join(', ')})`);
    });
  }
  return out;
}
