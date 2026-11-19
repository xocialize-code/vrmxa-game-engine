// Takes of a conversation (M3 W4, AB-T-0543): what was played, as data, and its bake into a sequence.
//
// A take is a world built from step 0 plus its inputs: the scene (and the cast it ran: which brain each character had),
// the player's input recording, and the ai service's log (every request, decision, hearing flag the director injected).
// Replaying the log needs no microphone, STT or model. The output aspect is fixed (16:9, AB-T-0538), so it needs no
// recording.
//
// takeToSequence turns a take into a sequence document that instances the set (M2's .vrmxs sequence, AB-D-0257):
//   - each line she said becomes a dialogue clip (editable text; baked to audio with tools/bake-lines.mjs, or
//     regenerated one at a time in the editor);
//   - each line the person said (as heard) becomes a text line on the character they played;
//   - every other event (requests, faces, gestures, goals, the listen / think flags) goes on a decisions track;
//   - the player's input goes on an input track;
//   - the cast becomes the sequence's cast.
// An event applied on step s is keyed at frame (s + 1) · fps / 60, so the sequence world applies it on the same step:
// the film steps like the take (the person's lines, now said aloud in the world, are heard by the brains, the one
// deliberate difference).

export const TAKE_FORMAT = 'vrmxg-take';

/**
 * A take of what was played.
 * @param {{ scene: string, cast?: Record<string, any>, input?: any, ai?: any[], steps: number, note?: string }} o
 */
export function makeTake({ scene, cast = {}, input = null, ai = [], steps, note = null }) {
  return { format: TAKE_FORMAT, version: 1, scene, cast: structuredClone(cast), input: input && structuredClone(input), ai: structuredClone(ai), steps, ...(note ? { note } : {}) };
}

/** Is this a take document (or a bare input recording, the M1 kind of take)? */
export function isTake(d) { return d?.format === TAKE_FORMAT; }

/** Words → seconds, roughly (a subtitle's length before the line is baked; baking gives the real one). */
const secondsFor = (text) => Math.max(1, Math.min(12, 0.4 + String(text).split(/\s+/).length * 0.32));

/**
 * A take → a sequence document (see above).
 * @param {any} take
 * @param {{ id?: string, fps?: number, user?: string | null, tail?: number }} [o] user: the character the person played
 *   (their heard lines go there); tail: seconds after the last step
 */
export function takeToSequence(take, { id = 'conversation', fps = 24, user = 'mira', tail = 2 } = {}) {
  if (!isTake(take)) throw new Error('takeToSequence needs a vrmxg-take document');
  const at = (step) => ((step + 1) * fps) / 60;
  const byAgent = new Map(), lines = new Map(), heardLines = [];
  for (const e of take.ai ?? []) {
    const { step, agent, ...rest } = structuredClone(e);
    const said = (rest.actions ?? []).filter((a) => a.do === 'say');
    if (said.length) {
      rest.actions = rest.actions.filter((a) => a.do !== 'say');
      if (!rest.actions.length) delete rest.actions;
      for (const a of said) (lines.get(agent) ?? lines.set(agent, []).get(agent)).push({ start: at(step), text: a.args.text });
    }
    if (rest.action?.do === 'say') { (lines.get(agent) ?? lines.set(agent, []).get(agent)).push({ start: at(step), text: rest.action.args.text }); delete rest.action; }
    if (e.kind === 'request' && rest.meta?.heard?.from === 'user' && user) heardLines.push({ step, text: rest.meta.heard.text });
    if (rest.goal || rest.action || rest.actions?.length || rest.bb) (byAgent.get(agent) ?? byAgent.set(agent, []).get(agent)).push([at(step), rest]);
  }
  // the person's line ends where her request starts: it began when they started speaking (the hearing flag), if logged
  const hearingOn = (take.ai ?? []).filter((e) => e.kind === 'hearing' && e.bb?.hearing).map((e) => e.step);
  const userClips = heardLines.map(({ step, text }) => {
    const began = hearingOn.filter((s) => s <= step && step - s <= 900).at(-1);
    const start = began !== undefined ? at(began) : Math.max(0, at(step) - secondsFor(text) * fps);
    return { start, end: Math.max(start + 1, at(step)), text };
  });
  const clip = ({ start, text }) => ({ start, end: start + secondsFor(text) * fps, text });
  const duration = Math.ceil(at(take.steps) + tail * fps);
  const tracks = [
    ...[...lines].map(([agent, ls]) => ({ id: `${agent}-says`, type: 'dialogue', target: agent, clips: ls.map(clip) })),
    ...(userClips.length ? [{ id: `${user}-says`, type: 'dialogue', target: user, clips: userClips }] : []),
    ...[...byAgent].map(([agent, keys]) => ({ id: `${agent}-decisions`, type: 'decisions', target: agent, keys })),
    ...(take.input ? [{ id: 'input', type: 'input', recording: structuredClone(take.input) }] : []),
  ];
  const markers = [...lines.values()].flat().sort((a, b) => a.start - b.start).map((l) => ({ frame: Math.round(l.start), name: l.text.slice(0, 40) }));
  return {
    format: 'vrmxs', version: 1, id, set: take.scene, assets: [], nodes: [], connections: [],
    sequence: { fps, duration, shots: [], markers, tracks, ...(take.cast && Object.keys(take.cast).length ? { cast: structuredClone(take.cast) } : {}) },
  };
}
