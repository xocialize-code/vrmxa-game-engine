// Voicing in the creator (M4 W11, the W5 follow-up on AB-T-0577): the project as @vrmxg/voicing's files (exclusive
// creates, reads that find the takes already there), a TTS that is asked only when a line has no take, and casting that
// re-voices the role's lines in the same undo step (applyCast's rebake through rebakeWith). Plain functions over a
// project, a session and a TTS provider, so Node tests drive them on the sample.
import { applyCast, rolesOf } from '@vrmxg/cast';
import { rebakeWith, voiceLines } from '@vrmxg/voicing';

/** The error a voicing raises when a line needs speaking and there is no TTS here. */
export const NO_TTS = 'no-tts';

/**
 * A TTS that asks `provider()` only when a line has no take in the project: a recast into a voice whose takes exist
 * needs no TTS at all. With no provider, speaking throws an error with `code: 'no-tts'`.
 * @param {() => any} provider the TTS (shellTTS or httpTTS), or a promise of it, or a throw when there is none
 */
export function lazyTTS(provider) {
  let tts = null;
  const get = async () => {
    if (tts) return tts;
    let t;
    try { t = await provider(); } catch (e) { throw Object.assign(new Error(e?.message ?? String(e)), { code: NO_TTS }); }
    if (!t?.speak) throw Object.assign(new Error('no TTS voice here'), { code: NO_TTS });
    return (tts = t);
  };
  return {
    get name() { return tts?.name ?? 'tts'; },
    get offsetApplied() { return tts?.offsetApplied ?? 0; }, // read after speaking, when tts is known
    speak: async (o) => (await get()).speak(o),
  };
}

/**
 * The project as @vrmxg/voicing writes it: `write` is an exclusive create (a name the project holds is refused), `read`
 * gives a file's bytes or null, `remove` takes back what a failed voicing wrote where the project can (in memory).
 * @param {{ has: (ref: string) => boolean, bytes: (ref: string) => Promise<Uint8Array>, put: (ref: string, bytes: Uint8Array) => any, overlay?: Map<string, Uint8Array>, files: string[] }} project
 * @param {any} tts
 */
export function projectIO(project, tts) {
  return {
    tts,
    async write(ref, bytes) {
      if (project.has(ref)) throw new Error(`${ref} is already in the project: a take is never written over`);
      await project.put(ref, typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes);
    },
    async read(ref) { return project.has(ref) ? project.bytes(ref) : null; },
    // only what this session holds in memory can go (the shell writes to disk and has no delete): a take left on disk
    // is a whole take under its own name, which the next voicing of that line reuses
    async remove(ref) { if (project.overlay?.delete(ref)) project.files = project.files.filter((f) => f !== ref); },
  };
}

/**
 * Each role's voice as its lines were last baked (the clip's `voice`): the voices a short already speaks in, for roles
 * nobody has cast yet. A role whose lines disagree, or that has none baked, is left out.
 * @param {any} doc @param {{ set?: any }} [o] @returns {Record<string, string>}
 */
export function voicesFromBakes(doc, { set = null } = {}) {
  const out = {};
  for (const r of rolesOf(doc, { set })) {
    const vs = new Set(r.lines.filter((l) => l.baked && l.voice).map((l) => l.voice));
    if (vs.size === 1) out[r.id] = [...vs][0];
  }
  return out;
}

/**
 * Cast a card into a role and re-voice the role's lines in the new voice, as one undo step. With no TTS, the takes
 * already in the project still serve; if a line needs speaking and nothing can speak, the role is cast without the
 * re-bake and the lines are listed as left to voice.
 * @param {any} session @param {string} role @param {any} card
 * @param {{ io: ReturnType<typeof projectIO>, voice?: string, outfit?: string | null }} o
 */
export async function castAndVoice(session, role, card, { io, ...opts }) {
  opts.presets ??= voicesFromBakes(session.doc, { set: session.setDoc ?? null }); // the voices the other roles speak in
  try {
    return { ...(await applyCast(session, role, card, { ...opts, rebake: rebakeWith(io) })), voiced: true };
  } catch (e) {
    if (e?.code !== NO_TTS) throw e;
    const r = await applyCast(session, role, card, opts);
    const left = r.rebake?.length ?? 0;
    return { ...r, voiced: false, warnings: [...(r.warnings ?? []), ...(left ? [`${left} line${left > 1 ? 's' : ''} left to voice: ${e.message}`] : [])] };
  }
}

/**
 * Re-voice lines (one line, one role's, or all), new words for one line, another voice or a new take: one undo step,
 * none when nothing changes (@vrmxg/voicing voiceLines). Roles nobody cast speak in the voice of their last bake.
 * @param {any} session @param {any} select @param {{ io: ReturnType<typeof projectIO>, voice?: string, newTake?: boolean, set?: any }} o
 */
export function revoice(session, select, { io, voice, newTake = false, set = null }) {
  return voiceLines(session, select, { ...io, presets: voicesFromBakes(session.doc, { set: set ?? session.setDoc ?? null }), ...(voice ? { voice } : {}), newTake });
}
