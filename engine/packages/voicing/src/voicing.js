// Voicing (M4 W7, AB-T-0579): a sequence's dialogue spoken in each character's voice and baked into the dialogue
// track, as one undoable edit per regeneration. M3's line bake (content/sample/tools/bake-lines.mjs, bakePlan and
// applyBake around make-voice.py) made into the creator's layer:
//
//   voicingPlan(doc, select)   which lines: one line, every line of one role, every line, or (by default) the lines
//                              not yet baked in their role's voice. Each line names the clip to write, by line, engine,
//                              voice and words (@vrmxg/cast clipFor)
//   bakeLines(lines, io)       speaks each line (the shell's tts.speak, or the loopback stand-in: @vrmxg/voice's
//                              providers), writes its WAV and timings file, and answers its bake fields: the clip, the
//                              timings file, the voice, the words (offset applied), the visemes and the audio's length
//   applyVoicing(doc, …)       the pure edit: the bake fields into the dialogue clips, one setDoc op
//   voiceLines(session, …)     the editor op: all three, then one session.run, so one undo takes the whole regeneration
//                              back (one line or one character's lines) and redo puts it back; no step when nothing
//                              changes
//   rebakeWith(io)             @vrmxg/cast applyCast's hook: a recast and its re-bake in one undo step
//   speechOverlaps(doc)        lines whose speech runs into the next line; fitToSpeech / fitLines lengthen the clips to
//                              their speech (and, given a re-script, move the beats after them) as one edit
//
// Files are never written over. A clip's name is its line, engine, voice and words, so the file under a name is that
// line's take: it is reused, not spoken again (Kokoro's audio differs a little from run to run while its words and
// lengths don't, so speaking again would put other bytes under a name an undo step points at). A deliberate new take
// (`newTake`) gets a name of its own (`…-take2.wav`). Writes are exclusive creates (the writer must refuse a name that
// exists), two voicings of one clip in this page take turns, and the files a failed or refused voicing created are
// removed again (never a take that was there before).
//
// What the bake writes is what a replay plays: @vrmxg/sequence hands a dialogue clip's words, visemes and audio length
// to the voice service, which samples the mouth from the baked visemes and ends the line at the baked length. Neither
// the WAV's decoder nor the lip-sync rules run at play time, so the same track gives the same hashes everywhere. The WAV
// is presentation: it is heard on the voice bus.
//
// The bake fields are @vrmxg/script's BAKE_FIELDS (clip, timings, visemes, words, voice, audio): the script's merge
// keeps them while a line's words are unchanged, and doesn't take a bake for a hand edit. A bake never moves a clip's
// start or end (those would be hand edits): speechOverlaps reports a line whose speech outlasts its clip into the next
// line, and fitToSpeech is the deliberate edit that fixes it.
import { BAKE_FIELDS } from '@vrmxg/script';
import { rolesOf, voicesFor, clipFor, lineId } from '@vrmxg/cast';
import { buildTrack, estimateWords, decodeWav } from '@vrmxg/voice';

/**
 * Seconds to add to every word a TTS engine times, by engine. Kokoro's predicted durations run about 30 ms early against
 * a forced aligner (AB-R-0888). MLXEngine's tts.speak doesn't correct them; the loopback stand-ins do, and say so
 * (a provider's `offsetApplied`, @vrmxg/voice live.js), so a bake adds only what its provider hasn't.
 */
export const TIMING_OFFSETS = { 'kokoro-82m': 0.03 };

const r4 = (x) => Math.round(x * 10000) / 10000;
const short = (s) => (s.length > 32 ? `${s.slice(0, 31)}…` : s);
/** Seconds → whole frames, rounding up, after rounding away float noise (1.1 s × 30 is 33.000000000000004). */
const framesUp = (seconds, fps) => Math.ceil(Math.round(seconds * fps * 1000) / 1000);

/**
 * The lines to voice, each with its voice and the clip to write.
 * @param {any} doc a sequence document
 * @param {{ line?: string | { track: string, index: number }, role?: string, all?: boolean }} [select] line: one line,
 *   by its id (`<sequence>-<track>-<n>`, @vrmxg/cast lineId) or its track and index; role: every line of a role (its node
 *   id or its cue); all: every line. With none of them: the lines not yet baked in their role's voice
 * @param {{ presets?: Record<string, string>, voice?: string | null, fallback?: string | null, dir?: string, set?: any }} [o]
 *   presets: role id → voice, for roles not cast (the cast's own voice wins); voice: a voice picked by hand for the
 *   lines selected; fallback: the voice for a role with none (its lines are marked `fallback`; without one, such a role
 *   is an error); dir: where clips go; set: the set document (only Character nodes are roles)
 * @returns {VoiceLine[]}
 *
 * @typedef {{ id: string, where: string, track: string, index: number, speaker: string, cue: string, text: string,
 *   voice: string, engine: string, clip: string, start: number, end: number, beat: string | null, src: string | null,
 *   reason: 'unbaked' | 'voice' | 'regenerate', fallback?: true }} VoiceLine
 */
export function voicingPlan(doc, select = {}, { presets = {}, voice = null, fallback = null, dir = 'voice', set = null } = {}) {
  const seq = doc?.sequence;
  if (!seq) throw new Error('voicing needs a sequence document');
  const roles = rolesOf(doc, { set });
  const voices = voicesFor(doc, { presets, set });
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
      const id = lineId(doc, l.track, l.index);
      if (which === 'line' && !(typeof select.line === 'string' ? select.line === id : select.line.track === l.track && select.line.index === l.index)) continue;
      const v = voice ?? voices[r.id] ?? fallback;
      if (!v) throw new Error(`${r.cue} has no voice: cast the role, or give a preset for "${r.id}" (presets), a voice or a fallback`);
      let reason = /** @type {VoiceLine['reason']} */ ('regenerate');
      if (which === 'stale') {
        if (l.baked && l.voice === v) continue;
        if (l.baked && l.voice === null) continue; // baked in a voice nobody recorded (an older bake): @vrmxg/cast warns of it
        reason = l.baked ? 'voice' : 'unbaked';
      } else if (!l.baked) reason = 'unbaked';
      out.push({ id, where: `tracks.${l.track}.clips[${l.index}]`, track: l.track, index: l.index, speaker: r.id, cue: r.cue, text: l.text, voice: v, engine, clip: clipFor(dir, id, v, l.text, engine), start: l.start, end: l.end, beat: l.beat, src: l.src, reason, ...(!voice && !voices[r.id] ? { fallback: /** @type {true} */ (true) } : {}) });
    }
  }
  if (which === 'line' && !out.length) throw new Error(`no line ${typeof select.line === 'string' ? `"${select.line}"` : `${select.line.track} ${select.line.index}`} with words in ${doc.id ?? 'the sequence'}`);
  return out;
}

/** Clips being voiced in this page: a second voicing of the same clip waits for the first, then reuses its take. */
const busy = new Map();

/**
 * Speak each line and write its audio: `<clip>.wav` and `<clip>.timings.json` (the word timings as the engine's TTS
 * gave them, with the offset to add, as M3's bake wrote them). → each line's bake fields, lined up with `lines`.
 * A take already under a line's name (the same line, engine, voice and words) is baked from its files: no TTS call,
 * nothing written. A new take is written with exclusive creates; if the bake fails, the files it created are removed.
 * @param {(Pick<VoiceLine, 'text' | 'voice' | 'clip'> & { engine?: string })[]} lines
 * @param {{ tts: { name?: string, offsetApplied?: number, speak: (o: { text: string, voice: string }) => Promise<{ wav: Uint8Array, words?: any[] | null, sampleRate?: number | null }> },
 *   write: (ref: string, bytes: Uint8Array | string, o: { exclusive: true }) => any, read: (ref: string) => any,
 *   remove?: (ref: string) => any, offset?: number, created?: string[], onLine?: (line: any, bake: any, k: number) => void }} o
 *   write: an exclusive create (refuse, by throwing, a ref that exists); read: the project's bytes for a ref (a
 *   Uint8Array or a string; null, undefined or a throw when there is none; may be async); remove: deletes a ref (the
 *   files a failed voicing created; without it they stay); offset: seconds added to every word (default: the engine's
 *   TIMING_OFFSETS entry, less what the provider applied, its `offsetApplied`); created: filled with the refs this bake
 *   wrote; onLine: progress, after each line (the bake has `reused: true` when it came from files)
 * @returns {Promise<Bake[]>}
 *
 * @typedef {{ clip: string, timings: string, voice: string, words: { text: string, start: number, duration: number }[],
 *   visemes: [string, number, number, number, number][], audio: { duration: number, sampleRate: number, estimated?: true } }} Bake
 */
export async function bakeLines(lines, { tts, write, read, remove = null, offset, created = [], onLine = () => {} }) {
  if (!tts?.speak) throw new Error('voicing needs a TTS provider (shellTTS or httpTTS from @vrmxg/voice)');
  if (typeof write !== 'function') throw new Error('voicing needs write(ref, bytes) to put the audio in the project');
  if (typeof read !== 'function') throw new Error('voicing needs read(ref) to find the takes already in the project (it never writes over one)');
  const mine = [];
  try {
    const out = [];
    for (let k = 0; k < lines.length; k++) {
      const line = lines[k];
      if (!String(line.text ?? '').trim()) throw new Error(`line ${line.clip} has no words`);
      const bake = await turn(line.clip, () => bakeOne(line, { tts, write, read, offset, mine, created }));
      out.push(bake.fields);
      onLine(line, bake.reused ? { ...bake.fields, reused: true } : bake.fields, k);
    }
    return out;
  } catch (e) {
    await removeAll(mine, remove);
    throw e;
  }
}

async function turn(clip, fn) {
  const before = busy.get(clip);
  let done;
  const now = new Promise((r) => { done = r; });
  busy.set(clip, now);
  try { if (before) await before; return await fn(); }
  finally { done(); if (busy.get(clip) === now) busy.delete(clip); }
}

async function bakeOne(line, { tts, write, read, offset, mine, created }) {
  const timings = line.clip.replace(/\.wav$/i, '.timings.json');
  const engine = line.engine ?? 'kokoro-82m';
  let kept = await take(read, line.clip, timings, line.text);
  let wav, raw, add, timed;
  if (!kept) {
    const r = await tts.speak({ text: line.text, voice: line.voice });
    // another voicing (in another page or process) may have made this take meanwhile: its files win, ours are dropped
    kept = await take(read, line.clip, timings, line.text);
    if (!kept) {
      wav = r.wav instanceof Uint8Array ? r.wav : new Uint8Array(r.wav);
      timed = Array.isArray(r.words) && r.words.length > 0;
      raw = timed ? r.words.map((w) => ({ text: String(w.text), start: +w.start, duration: +w.duration })) : estimateWords(line.text);
      add = timed ? offset ?? Math.max(0, (TIMING_OFFSETS[engine] ?? 0) - (tts.offsetApplied ?? 0)) : 0;
    }
  }
  if (kept) { wav = kept.wav; timed = !kept.timings.estimated && kept.timings.words?.length > 0; raw = kept.timings.words; add = timed ? kept.timings.offset ?? 0 : 0; }
  const { samples, rate } = decodeWav(wav);
  const duration = r4(samples.length / rate);
  if (!kept) {
    await write(line.clip, wav, { exclusive: true });
    mine.push(line.clip); created.push(line.clip);
    await write(timings, `${JSON.stringify({ format: 'vrmxg-word-timings', version: 1, text: line.text, audio: line.clip.replace(/^.*\//, ''), sampleRate: rate, duration, source: `${engine} ${line.voice}${tts.name ? ` (${String(tts.name).split(' ')[0]})` : ''}`, offset: add, ...(timed ? {} : { estimated: true }), words: raw }, null, 1)}\n`, { exclusive: true });
    mine.push(timings); created.push(timings);
  }
  const words = raw.map((w) => ({ text: w.text, start: r4(w.start + add), duration: r4(w.duration) }));
  const visemes = buildTrack(words).map((x) => /** @type {[string, number, number, number, number]} */ ([x.viseme, r4(x.t0), r4(x.t1), r4(x.t2), r4(x.level)]));
  return { reused: !!kept, fields: { clip: line.clip, timings, voice: line.voice, words, visemes, audio: { duration, sampleRate: rate, ...(timed ? {} : { estimated: /** @type {true} */ (true) }) } } };
}

/** A take already in the project: its WAV and timings file, or null. A name holding another line's words is an error. */
async function take(read, clip, timings, text) {
  const get = async (ref) => { try { return (await read(ref)) ?? null; } catch { return null; } };
  const wav = await get(clip), t = wav ? await get(timings) : null;
  if (!wav) return null;
  if (!t) throw new Error(`${clip} is in the project without its timings file: remove it, or put its timings back, to voice the line`);
  const parsed = JSON.parse(typeof t === 'string' ? t : new TextDecoder().decode(t));
  if (parsed.text !== text) throw new Error(`${clip} holds the words "${short(String(parsed.text))}", not "${short(text)}"`);
  return { wav: wav instanceof Uint8Array ? wav : new Uint8Array(wav), timings: parsed };
}

async function removeAll(refs, remove) {
  if (!remove) return;
  for (const ref of [...refs].reverse()) { try { await remove(ref); } catch { /* already gone */ } }
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
 * Undo puts the old bake back, whose files were never written over.
 *
 * Regenerating a line in the voice and words it already has finds its take and changes nothing: `changed: false`, no
 * step. `newTake: true` asks the TTS again and keeps the answer under a name of its own (`<clip>-take2.wav`, the first
 * number free), as one step; undo goes back to the take before.
 *
 * The speaking is async; nothing is applied until it settles, nothing is applied if it fails, and if the document
 * changes meanwhile the voicing is refused (voice again on the new document). Either way the files it created are
 * removed (given `remove`).
 * @param {{ doc: any, setDoc?: any, isSequence: boolean, run: (label: string, ops: any[]) => void }} session
 * @param {Parameters<typeof voicingPlan>[1] & { text?: string }} select text: new words for the one line selected
 * @param {Parameters<typeof voicingPlan>[2] & Omit<Parameters<typeof bakeLines>[1], 'onLine' | 'created'> & { label?: string, newTake?: boolean, onLine?: Parameters<typeof bakeLines>[1]['onLine'] }} o
 * @returns {Promise<{ changed: boolean, label: string | null, lines: VoiceLine[], baked: number, warnings: string[] }>}
 *   warnings: lines voiced in the fallback voice, and lines whose speech runs into the next line (speechOverlaps)
 */
export async function voiceLines(session, select, o) {
  if (!session.isSequence) throw new Error('voicing needs a sequence document (a set it films and a sequence block)');
  const { text, ...which } = select ?? {};
  if (text !== undefined && which.line == null) throw new Error('new words go to one line: select it with { line }');
  if (text !== undefined && !String(text).trim()) throw new Error('a line needs words');
  const { tts, write, read, remove, offset, onLine, label: named, newTake = false, ...plan } = o;
  if (typeof read !== 'function') throw new Error('voicing needs read(ref) to find the takes already in the project (it never writes over one)');
  const before = canonical(session.doc);
  let lines = voicingPlan(session.doc, which, { ...plan, set: plan.set ?? session.setDoc ?? null });
  if (text !== undefined) lines = lines.map((l) => ({ ...l, text, clip: clipFor(plan.dir ?? 'voice', l.id, l.voice, text, l.engine) }));
  if (newTake) for (const l of lines) l.clip = await freeTake(read, l.clip);
  const warnings = lines.filter((l) => l.fallback).map((l) => `${l.cue} has no voice of their own: "${short(l.text)}" is voiced in ${l.voice}`);
  if (!lines.length) return { changed: false, label: null, lines, baked: 0, warnings };
  const created = [];
  const bakes = await bakeLines(lines, { tts, write, read, remove, offset, created, onLine });
  if (canonical(session.doc) !== before) {
    await removeAll(created, remove);
    throw new Error('the document changed while its lines were voicing; voice them again');
  }
  const r = applyVoicing(session.doc, lines, bakes, text !== undefined ? { text } : {});
  if (canonical(r.doc) === before) return { changed: false, label: null, lines, baked: 0, warnings };
  const label = named ?? labelOf(which, lines, session.doc, newTake);
  session.run(label, r.ops);
  const mine = new Set(lines.map((l) => `${l.track}|${l.index}`));
  for (const x of speechOverlaps(r.doc)) if (mine.has(`${x.a.track}|${x.a.index}`) || mine.has(`${x.b.track}|${x.b.index}`)) warnings.push(x.message);
  return { changed: true, label, lines, baked: r.baked, warnings };
}

async function freeTake(read, clip) {
  for (let n = 2; ; n++) {
    const name = clip.replace(/\.wav$/i, `-take${n}.wav`);
    let there = null;
    try { there = (await read(name)) ?? null; } catch { there = null; }
    if (!there) return name;
  }
}

/**
 * @vrmxg/cast applyCast's re-bake hook: the recast role's lines spoken in the new voice, folded into the cast's own edit
 * (one undo step for the recast and its re-bake).
 * @param {Omit<Parameters<typeof bakeLines>[1], 'onLine' | 'created'> & { onLine?: Parameters<typeof bakeLines>[1]['onLine'] }} o
 */
export function rebakeWith(o) {
  if (typeof o?.read !== 'function') throw new Error('rebakeWith needs read(ref): a re-bake never writes over a take an undo step points at');
  return (/** @type {any[]} */ lines) => bakeLines(lines, o);
}

// ---------------------------------------------------------------- speech and the clip's length

/**
 * The frame a line's speech ends on: its start plus its last word's end (a baked line), else its clip's end. The WAV's
 * trailing silence doesn't count.
 * @param {{ start: number, end: number, words?: { start: number, duration: number }[] }} clip @param {number} fps
 */
export function speechEnd(clip, fps) {
  const w = clip.words?.at(-1);
  return w ? clip.start + framesUp(w.start + w.duration, fps) : clip.end;
}

/**
 * Lines whose speech runs into a later line (another character's, or the same one's): each pair once, in order.
 * @param {any} doc a sequence document
 * @returns {{ a: { track: string, index: number, speaker: string, text: string }, b: { track: string, index: number, speaker: string, text: string }, frames: number, message: string }[]}
 */
export function speechOverlaps(doc) {
  const seq = doc.sequence, fps = seq.fps;
  const all = seq.tracks.filter((t) => t.type === 'dialogue').flatMap((t) => (t.clips ?? []).filter((c) => c.text).map((c, i) => ({ track: t.id, index: t.clips.indexOf(c), speaker: t.target, text: c.text, start: c.start, until: speechEnd(c, fps) })));
  all.sort((x, y) => x.start - y.start || (x.track < y.track ? -1 : x.track > y.track ? 1 : x.index - y.index));
  const out = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length && all[j].start < all[i].until; j++) {
    const a = all[i], b = all[j], frames = a.until - b.start;
    const strip = ({ track, index, speaker, text }) => ({ track, index, speaker, text });
    out.push({ a: strip(a), b: strip(b), frames, message: `${a.speaker}'s "${short(a.text)}" is still speaking ${frames} frame${frames === 1 ? '' : 's'} into ${b.speaker}'s "${short(b.text)}" (fitToSpeech lengthens the line; a re-script moves what follows)` });
  }
  return out;
}

/**
 * Lengthen each baked line whose speech outlasts its clip to its speech's end: a deliberate hand edit of the lines'
 * lengths. The script's layout takes a hand-retimed line's length as its beat's (@vrmxg/script handLengths), so a
 * re-script then moves every beat after it. `rescript`, when given (the creator's: `(d) => buildSequence(text,
 * { previous: d, set, marks }).doc`), runs in the same edit, so fitting and moving are one undo step.
 * @param {any} doc @param {{ rescript?: (doc: any) => any }} [o]
 * @returns {{ changed: boolean, doc: any, ops: any[], lines: { track: string, index: number, from: number, to: number }[] }}
 */
export function fitToSpeech(doc, { rescript = null } = {}) {
  const seq = structuredClone(doc.sequence), lines = [];
  for (const t of seq.tracks) {
    if (t.type !== 'dialogue') continue;
    (t.clips ?? []).forEach((c, index) => { const to = speechEnd(c, seq.fps); if (c.words && to > c.end) { lines.push({ track: t.id, index, from: c.end, to }); c.end = to; } });
  }
  if (!lines.length) return { changed: false, doc, ops: [], lines };
  seq.duration = Math.max(seq.duration, ...lines.map((l) => l.to)); // a last line may now end past the film (a re-script lays it out again)
  let next = { ...doc, sequence: seq };
  if (rescript) next = rescript(structuredClone(next));
  return { changed: true, doc: next, ops: [{ op: 'setDoc', path: 'sequence', value: structuredClone(next.sequence) }], lines };
}

/**
 * fitToSpeech in the editor: one undo step ("Fit 3 lines to their speech"), or none when every line already fits.
 * @param {{ doc: any, isSequence: boolean, run: (label: string, ops: any[]) => void }} session
 * @param {Parameters<typeof fitToSpeech>[1]} [o]
 */
export function fitLines(session, o = {}) {
  if (!session.isSequence) throw new Error('fitting lines needs a sequence document');
  const r = fitToSpeech(session.doc, o);
  if (!r.changed) return { changed: false, label: null, lines: r.lines };
  const label = `Fit ${r.lines.length} line${r.lines.length === 1 ? '' : 's'} to ${r.lines.length === 1 ? 'its' : 'their'} speech`;
  session.run(label, r.ops);
  return { changed: true, label, lines: r.lines };
}

function labelOf(which, lines, doc, newTake) {
  if (which.line != null) return `${newTake ? 'New take of' : 'Voice'} line "${short(lines[0].text)}"`;
  const n = lines.length, s = n === 1 ? 'line' : 'lines';
  if (which.role != null) return `${newTake ? 'New takes of' : 'Voice'} ${lines[0].cue}'s ${s} (${n}, ${lines[0].voice})`;
  return `${newTake ? 'New takes of' : 'Voice'} ${n} ${s}${doc.id ? ` of ${doc.id}` : ''}`;
}

/** Sorted-key JSON, for comparing documents (as @vrmxg/cast compares them). */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
