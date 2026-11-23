// Voicing (M4 W7, AB-T-0579): a sequence's dialogue spoken in each character's voice and baked into the dialogue
// track, as one undoable edit per regeneration. M3's line bake (content/sample/tools/bake-lines.mjs, bakePlan and
// applyBake around make-voice.py) made into the creator's layer:
//
//   voicingPlan(doc, select)   which lines: one line, every line of one role, every line, or (by default) the lines
//                              not yet baked in their role's voice. Each line names the clip to write, by line, voice
//                              and words (@vrmxg/cast clipFor), so a regeneration never writes over a file that undo can
//                              bring back
//   bakeLines(lines, { tts })  speaks each line (the shell's tts.speak, or the loopback stand-in: live.js's providers),
//                              writes its WAV and timings file, and answers its bake fields: the clip, the timings file,
//                              the voice, the words (offset applied), the visemes and the audio's length
//   applyVoicing(doc, …)       the pure edit: the bake fields into the dialogue clips, one setDoc op
//   voiceLines(session, …)     the editor op: all three, then one session.run, so one undo takes the whole regeneration
//                              back (one line or one character's lines) and redo puts it back
//   rebakeWith({ tts, write }) @vrmxg/cast applyCast's hook: a recast and its re-bake in one undo step
//
// What the bake writes is what a replay plays: @vrmxg/sequence hands a dialogue clip's words, visemes and audio length
// to the voice service, which samples the mouth from the baked visemes and ends the line at the baked length. Neither
// the WAV's decoder nor the lip-sync rules run at play time, so the same track gives the same hashes everywhere, and a
// change to the lip-sync rules changes only lines baked after it. The WAV is presentation: it is heard on the voice bus.
//
// The bake fields are @vrmxg/script's BAKE_FIELDS (clip, timings, visemes, words, voice, audio): the script's merge
// keeps them while a line's words are unchanged, and doesn't take a bake for a hand edit. A bake never moves a clip's
// start or end (those would be hand edits); a line longer than its clip still plays to its end, and its subtitle runs
// to the end of its audio (@vrmxg/sequence subtitles).
import { BAKE_FIELDS } from '@vrmxg/script';
import { rolesOf, voicesFor, clipFor } from '@vrmxg/cast';
import { buildTrack, estimateWords } from './lipsync.js';
import { decodeWav } from './listen.js';

/**
 * Seconds to add to every word a TTS engine times, by engine. Kokoro's predicted durations run about 30 ms early against
 * a forced aligner (AB-R-0888). MLXEngine's tts.speak doesn't correct them; the loopback stand-ins do, and say so
 * (a provider's `offsetApplied`, live.js), so a bake adds only what its provider hasn't.
 */
export const TIMING_OFFSETS = { 'kokoro-82m': 0.03 };

const r4 = (x) => Math.round(x * 10000) / 10000;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
const short = (s) => (s.length > 32 ? `${s.slice(0, 31)}…` : s);

/**
 * The lines to voice, each with its voice and the clip to write.
 * @param {any} doc a sequence document
 * @param {{ line?: string | { track: string, index: number }, role?: string, all?: boolean }} [select] line: one line,
 *   by its id (`<sequence>-<track>-<n>`, bakePlan's and the cast's) or its track and index; role: every line of a role
 *   (its node id or its cue); all: every line. With none of them: the lines not yet baked in their role's voice
 * @param {{ presets?: Record<string, string>, voice?: string | null, dir?: string, set?: any }} [o] presets: role id →
 *   voice, for roles not cast (the cast's own voice wins); voice: a voice picked by hand for the lines selected; dir:
 *   where clips go; set: the set document (only Character nodes are roles)
 * @returns {VoiceLine[]}
 *
 * @typedef {{ id: string, where: string, track: string, index: number, speaker: string, cue: string, text: string,
 *   voice: string, engine: string, clip: string, start: number, end: number, beat: string | null, src: string | null,
 *   reason: 'unbaked' | 'voice' | 'regenerate' }} VoiceLine
 */
export function voicingPlan(doc, select = {}, { presets = {}, voice = null, dir = 'voice', set = null } = {}) {
  const seq = doc?.sequence;
  if (!seq) throw new Error('voicing needs a sequence document');
  const roles = rolesOf(doc, { set });
  const voices = voicesFor(doc, { presets, set });
  const base = slug(doc.id ?? 'scene');
  const which = select.line != null ? 'line' : select.role != null ? 'role' : select.all ? 'all' : 'stale';
  let role = null;
  if (which === 'role') {
    role = roles.find((r) => r.id === select.role) ?? roles.find((r) => r.cue === select.role);
    if (!role) throw new Error(`no role "${select.role}" in ${doc.id ?? 'the sequence'} (its roles: ${roles.map((r) => `${r.cue} = ${r.id}`).join(', ') || 'none'})`);
  }
  const out = [];
  for (const r of roles) {
    if (role && r.id !== role.id) continue;
    const engine = seq.roles?.[r.id]?.voice?.engine ?? 'kokoro-82m';
    for (const l of r.lines) {
      const id = `${base}-${slug(l.track)}-${l.index + 1}`;
      if (which === 'line' && !(typeof select.line === 'string' ? select.line === id : select.line.track === l.track && select.line.index === l.index)) continue;
      const v = voice ?? voices[r.id];
      if (!v) throw new Error(`${r.cue} has no voice: cast the role, or give a preset for "${r.id}" (presets) or a voice`);
      let reason = /** @type {VoiceLine['reason']} */ ('regenerate');
      if (which === 'stale') {
        if (l.baked && l.voice === v) continue;
        if (l.baked && l.voice === null) continue; // baked in a voice nobody recorded (an older bake): @vrmxg/cast warns of it
        reason = l.baked ? 'voice' : 'unbaked';
      } else if (!l.baked) reason = 'unbaked';
      out.push({ id, where: `tracks.${l.track}.clips[${l.index}]`, track: l.track, index: l.index, speaker: r.id, cue: r.cue, text: l.text, voice: v, engine, clip: clipFor(dir, id, v, l.text), start: l.start, end: l.end, beat: l.beat, src: l.src, reason });
    }
  }
  if (which === 'line' && !out.length) throw new Error(`no line ${typeof select.line === 'string' ? `"${select.line}"` : `${select.line.track} ${select.line.index}`} with words in ${doc.id ?? 'the sequence'}`);
  return out;
}

/**
 * Speak each line and write its audio: `<clip>.wav` and `<clip>.timings.json` (the word timings as the engine's TTS
 * gave them, with the offset to add, as M3's bake wrote them). → each line's bake fields, lined up with `lines`.
 *
 * A clip's name is its line, voice and words, so a file already there under that name is that line's take: with `read`,
 * it is baked from the files (no TTS call, nothing written), never spoken again over them. That matters because Kokoro's
 * audio differs a little from run to run (its words and lengths don't): speaking a line again in the same voice would
 * write over a file an undo step points at with other bytes.
 * @param {(Pick<VoiceLine, 'text' | 'voice' | 'clip'> & { engine?: string })[]} lines
 * @param {{ tts: { name?: string, offsetApplied?: number, speak: (o: { text: string, voice: string }) => Promise<{ wav: Uint8Array, words?: any[] | null, sampleRate?: number | null }> },
 *   write: (ref: string, bytes: Uint8Array | string) => any, read?: (ref: string) => any, offset?: number,
 *   onLine?: (line: any, bake: any, k: number) => void }} o
 *   read: the project's bytes for a ref (a Uint8Array, a string, or null/undefined/a throw when there is none; may be
 *   async); offset: seconds added to every word (default: the engine's TIMING_OFFSETS entry, less what the provider
 *   applied, its `offsetApplied`); onLine: progress, after each line (the bake has `reused: true` when it came from files)
 * @returns {Promise<Bake[]>}
 *
 * @typedef {{ clip: string, timings: string, voice: string, words: { text: string, start: number, duration: number }[],
 *   visemes: [string, number, number, number, number][], audio: { duration: number, sampleRate: number, estimated?: true } }} Bake
 */
export async function bakeLines(lines, { tts, write, read = null, offset, onLine = () => {} }) {
  if (!tts?.speak) throw new Error('voicing needs a TTS provider (shellTTS or httpTTS from @vrmxg/voice)');
  if (typeof write !== 'function') throw new Error('voicing needs write(ref, bytes) to put the audio in the project');
  const out = [];
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    if (!String(line.text ?? '').trim()) throw new Error(`line ${line.clip} has no words`);
    const timings = line.clip.replace(/\.wav$/i, '.timings.json');
    const engine = line.engine ?? 'kokoro-82m';
    // the take already there (same line, voice and words), else a new one
    const kept = read ? await take(read, line.clip, timings) : null;
    let wav, raw, add, timed;
    if (kept && kept.timings.text === line.text) {
      wav = kept.wav; timed = !kept.timings.estimated && kept.timings.words?.length > 0;
      raw = kept.timings.words; add = timed ? kept.timings.offset ?? 0 : 0;
    } else {
      const r = await tts.speak({ text: line.text, voice: line.voice });
      wav = r.wav instanceof Uint8Array ? r.wav : new Uint8Array(r.wav);
      timed = Array.isArray(r.words) && r.words.length > 0;
      raw = timed ? r.words.map((w) => ({ text: String(w.text), start: +w.start, duration: +w.duration })) : estimateWords(line.text);
      add = timed ? offset ?? Math.max(0, (TIMING_OFFSETS[engine] ?? 0) - (tts.offsetApplied ?? 0)) : 0;
    }
    const { samples, rate } = decodeWav(wav);
    const duration = r4(samples.length / rate);
    const words = raw.map((w) => ({ text: w.text, start: r4(w.start + add), duration: r4(w.duration) }));
    const visemes = buildTrack(words).map((x) => /** @type {[string, number, number, number, number]} */ ([x.viseme, r4(x.t0), r4(x.t1), r4(x.t2), r4(x.level)]));
    const reused = !!(kept && kept.timings.text === line.text);
    if (!reused) {
      await write(line.clip, wav);
      await write(timings, `${JSON.stringify({ format: 'vrmxg-word-timings', version: 1, text: line.text, audio: line.clip.replace(/^.*\//, ''), sampleRate: rate, duration, source: `${engine} ${line.voice}${tts.name ? ` (${String(tts.name).split(' ')[0]})` : ''}`, offset: add, ...(timed ? {} : { estimated: true }), words: raw }, null, 1)}\n`);
    }
    const bake = { clip: line.clip, timings, voice: line.voice, words, visemes, audio: { duration, sampleRate: rate, ...(timed ? {} : { estimated: /** @type {true} */ (true) }) } };
    out.push(bake);
    onLine(line, reused ? { ...bake, reused: true } : bake, k);
  }
  return out;
}

/** A take already in the project: its WAV and timings file, or null. */
async function take(read, clip, timings) {
  const get = async (ref) => { try { return (await read(ref)) ?? null; } catch { return null; } };
  const wav = await get(clip), t = wav ? await get(timings) : null;
  if (!wav || !t) return null;
  try {
    const parsed = JSON.parse(typeof t === 'string' ? t : new TextDecoder().decode(t));
    return { wav: wav instanceof Uint8Array ? wav : new Uint8Array(wav), timings: parsed };
  } catch { return null; }
}

/**
 * The bake fields into the dialogue clips, as one setDoc op (the pure form of voiceLines). A clip's old bake goes first,
 * so nothing of a bake in another voice is left behind. `bakes` lines up with `lines`; null leaves a line as it is.
 * @param {any} doc @param {VoiceLine[]} lines @param {(Bake | Record<string, any> | null)[]} bakes
 * @param {{ text?: string }} [o] text: the line's new words (one line only: a hand edit, as regenerating a line with new words was in M3)
 * @returns {{ doc: any, ops: any[], baked: number }}
 */
export function applyVoicing(doc, lines, bakes, { text } = {}) {
  if (!Array.isArray(bakes) || bakes.length !== lines.length) throw new Error(`a bake answers each line: ${lines.length} lines, ${Array.isArray(bakes) ? bakes.length : typeof bakes} answers`);
  if (text !== undefined && lines.length !== 1) throw new Error('new words go to one line at a time');
  const seq = structuredClone(doc.sequence);
  let baked = 0;
  lines.forEach((line, k) => {
    const b = bakes[k];
    if (!b) return;
    const odd = Object.keys(b).filter((f) => !BAKE_FIELDS.includes(f));
    if (odd.length) throw new Error(`a bake sets only ${BAKE_FIELDS.join(', ')}; line ${line.id} has ${odd.join(', ')}`);
    const clip = seq.tracks.find((t) => t.id === line.track)?.clips?.[line.index];
    if (!clip) throw new Error(`no clip ${line.where} in ${doc.id ?? 'the sequence'}`);
    for (const f of BAKE_FIELDS) delete clip[f];
    Object.assign(clip, structuredClone(b), { voice: b.voice ?? line.voice });
    if (text !== undefined) clip.text = text;
    baked++;
  });
  const ops = [{ op: 'setDoc', path: 'sequence', value: seq }];
  return { doc: { ...doc, sequence: structuredClone(seq) }, ops, baked };
}

/**
 * Voice lines in the editor (or the creator, or MCP): plan, speak and write, then one undo step. Regenerating one line
 * (`{ line }`) or one character's lines (`{ role }`) is one step, and so is voicing every line still to bake (`{}`).
 * Undo puts the old bake back, whose files were never written over (clips are named by line, voice and words).
 * The speaking is async; nothing is applied until it settles, nothing is applied if it fails, and if the document
 * changes meanwhile the voicing is refused (voice again on the new document).
 * @param {{ doc: any, setDoc?: any, isSequence: boolean, run: (label: string, ops: any[]) => void }} session
 * @param {Parameters<typeof voicingPlan>[1] & { text?: string }} select text: new words for the one line selected
 * @param {Parameters<typeof voicingPlan>[2] & Omit<Parameters<typeof bakeLines>[1], 'onLine'> & { label?: string, onLine?: Parameters<typeof bakeLines>[1]['onLine'] }} o
 * @returns {Promise<{ changed: boolean, label: string | null, lines: VoiceLine[], baked: number }>}
 */
export async function voiceLines(session, select, o) {
  if (!session.isSequence) throw new Error('voicing needs a sequence document (a set it films and a sequence block)');
  const { text, ...which } = select ?? {};
  if (text !== undefined && which.line == null) throw new Error('new words go to one line: select it with { line }');
  if (text !== undefined && !String(text).trim()) throw new Error('a line needs words');
  const { tts, write, read, offset, onLine, label: named, ...plan } = o;
  let lines = voicingPlan(session.doc, which, { ...plan, set: plan.set ?? session.setDoc ?? null });
  if (text !== undefined) lines = lines.map((l) => ({ ...l, text, clip: clipFor(plan.dir ?? 'voice', l.id, l.voice, text) }));
  if (!lines.length) return { changed: false, label: null, lines, baked: 0 };
  const before = JSON.stringify(session.doc.sequence);
  const bakes = await bakeLines(lines, { tts, write, read, offset, onLine });
  if (JSON.stringify(session.doc.sequence) !== before) throw new Error('the document changed while its lines were voicing; voice them again');
  const r = applyVoicing(session.doc, lines, bakes, text !== undefined ? { text } : {});
  const label = named ?? labelOf(which, lines, session.doc);
  session.run(label, r.ops);
  return { changed: true, label, lines, baked: r.baked };
}

/**
 * @vrmxg/cast applyCast's re-bake hook: the recast role's lines spoken in the new voice, folded into the cast's own edit
 * (one undo step for the recast and its re-bake).
 * @param {Omit<Parameters<typeof bakeLines>[1], 'onLine'> & { onLine?: Parameters<typeof bakeLines>[1]['onLine'] }} o
 */
export function rebakeWith(o) {
  return (/** @type {any[]} */ lines) => bakeLines(lines, o);
}

function labelOf(which, lines, doc) {
  if (which.line != null) return `Voice line "${short(lines[0].text)}"`;
  const n = lines.length, s = n === 1 ? 'line' : 'lines';
  if (which.role != null) return `Voice ${lines[0].cue}'s ${s} (${n}, ${lines[0].voice})`;
  return `Voice ${n} ${s}${doc.id ? ` of ${doc.id}` : ''}`;
}
