// M4 W7 (AB-T-0579): voicing a sequence. The sample's script-built sequence (cafe-order), its lines planned, spoken by a
// stand-in TTS (a tone per word, with word timings: deterministic and offline, as CI needs), written, and folded into
// the dialogue track; one undo step per regeneration, exact bytes on undo and redo, no file written over; a recast and
// its re-bake as one step through applyCast's hook; the bake kept across a re-script; the baked words and visemes are
// what plays; music and sound effects on their buses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { m0Registry } from '@vrmxg/registry/m0';
import { createValidator, serialize } from '@vrmxg/scene';
import { EditorSession } from '@vrmxg/editor-core';
import { checkSequence, subtitles } from '@vrmxg/sequence';
import { buildSequence, BAKE_FIELDS } from '@vrmxg/script';
import { applyCast, castRole, withBake, clipFor, cardOf } from '@vrmxg/cast';
import { voicingPlan, bakeLines, applyVoicing, voiceLines, rebakeWith, placeSound, addSound, soundProblems, busFor, encodeWav, decodeWav, buildTrack, TIMING_OFFSETS, VoiceService } from '../src/index.js';

const SAMPLE = path.resolve(import.meta.dirname, '../../../../content/sample');
const read = (f) => fs.readFileSync(path.join(SAMPLE, f), 'utf8');
const set = JSON.parse(read('cafe.vrmxs'));
const prefabs = new Map(fs.readdirSync(path.join(SAMPLE, 'prefabs')).map((f) => [`prefabs/${f}`, JSON.parse(read(`prefabs/${f}`))]));
const reg = m0Registry();
reg.validate = createValidator(reg, { prefabs }); // (unused by the session; kept as the cast tests set it up)
const script = read('scripts/cafe-order.fountain');
const marks = JSON.parse(read('scripts/cafe-marks.json')).marks;
/** The sample sequence as the script builds it, unbaked (the committed file may carry a bake). */
const unbaked = () => {
  const d = JSON.parse(read('sequences/cafe-order.vrmxs'));
  for (const t of d.sequence.tracks) if (t.type === 'dialogue') for (const c of t.clips) for (const f of BAKE_FIELDS) delete c[f];
  return d;
};
const PRESETS = { 'hana-1': 'af_heart', mira: 'af_bella' };
const track = (doc, id) => doc.sequence.tracks.find((t) => t.id === id);
const dialogue = (doc) => doc.sequence.tracks.filter((t) => t.type === 'dialogue');

/** A stand-in TTS: each word a short tone, 24 kHz, its timings answered (as Kokoro's are, without the offset). */
function fakeTTS() {
  const calls = [];
  return {
    name: 'fake', calls,
    async speak({ text, voice }) {
      calls.push({ text, voice });
      const words = [], rate = 24000, pitch = 180 + (voice.length * 13) % 120;
      let t = 0.25;
      for (const w of text.split(/\s+/).filter(Boolean)) { const d = 0.08 + w.replace(/\W/g, '').length * 0.045; words.push({ text: w.replace(/[^\p{L}\p{N}']/gu, ''), start: +t.toFixed(4), duration: +d.toFixed(4) }); t += d + 0.06; }
      const n = Math.ceil((t + 0.2) * rate), s = new Float32Array(n);
      for (const w of words) for (let i = Math.floor(w.start * rate); i < Math.floor((w.start + w.duration) * rate); i++) s[i] = 0.3 * (((i * pitch * 2) / rate) % 2 < 1 ? 1 : -1); // a square wave: no transcendental maths
      return { wav: encodeWav(s, rate), words, sampleRate: rate };
    },
  };
}
/** A project's files: write() refuses to put different bytes under a name it already holds (undo could bring it back). */
function project() {
  const files = new Map();
  return {
    files,
    read: (ref) => files.get(ref) ?? null,
    write(ref, bytes) {
      const b = typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes);
      if (files.has(ref) && !files.get(ref).equals(b)) throw new Error(`${ref} was written over with other bytes`);
      files.set(ref, b);
    },
  };
}
const session = (doc = unbaked()) => { const s = new EditorSession({ registry: reg, text: serialize(doc) }); s.setDoc = set; return s; };

test('the plan: every line still to bake with its role\'s voice and a clip named by line, voice and words; one line; one role', () => {
  const doc = unbaked();
  const all = voicingPlan(doc, {}, { presets: PRESETS });
  assert.equal(all.length, 7, 'the sample\'s seven lines');
  assert.deepEqual(all.map((l) => [l.speaker, l.voice, l.reason]), [
    ['hana-1', 'af_heart', 'unbaked'], ['hana-1', 'af_heart', 'unbaked'], ['hana-1', 'af_heart', 'unbaked'], ['hana-1', 'af_heart', 'unbaked'],
    ['mira', 'af_bella', 'unbaked'], ['mira', 'af_bella', 'unbaked'], ['mira', 'af_bella', 'unbaked'],
  ]);
  for (const l of all) assert.equal(l.clip, clipFor('voice', l.id, l.voice, l.text));
  assert.equal(all[0].id, 'cafe-order-hana-1-says-1');
  assert.equal(all[0].text, 'Good morning! What can I get you?');
  assert.deepEqual(voicingPlan(doc, { role: 'MIRA' }, { presets: PRESETS }).map((l) => l.index), [0, 1, 2], 'a role by its cue');
  assert.deepEqual(voicingPlan(doc, { role: 'hana-1' }, { presets: PRESETS }).map((l) => l.index), [0, 1, 2, 3], 'or its node id');
  const one = voicingPlan(doc, { line: 'cafe-order-mira-says-2' }, { presets: PRESETS });
  assert.deepEqual(one.map((l) => [l.track, l.index, l.text]), [['mira-says', 1, 'Is it always this quiet in the morning?']]);
  assert.deepEqual(voicingPlan(doc, { line: { track: 'mira-says', index: 1 } }, { presets: PRESETS }), one);
  assert.equal(voicingPlan(doc, { line: one[0].id }, { presets: PRESETS, voice: 'af_sky' })[0].voice, 'af_sky', 'a voice picked by hand');
  assert.throws(() => voicingPlan(doc, { role: 'BOB' }, { presets: PRESETS }), /no role "BOB".*HANA = hana-1, MIRA = mira/);
  assert.throws(() => voicingPlan(doc, { line: 'cafe-order-mira-says-9' }, { presets: PRESETS }), /no line "cafe-order-mira-says-9"/);
  assert.throws(() => voicingPlan(doc, {}, { presets: { 'hana-1': 'af_heart' } }), /MIRA has no voice/);
});

test('the bake: the WAV and its timings written, and the bake fields: words with the engine\'s offset, visemes from them, the audio\'s length', async () => {
  const tts = fakeTTS(), p = project();
  const lines = voicingPlan(unbaked(), { line: 'cafe-order-hana-1-says-2' }, { presets: PRESETS });
  const [b] = await bakeLines(lines, { tts, write: p.write });
  const said = await fakeTTS().speak({ text: lines[0].text, voice: 'af_heart' });
  assert.deepEqual(Object.keys(b).sort(), ['audio', 'clip', 'timings', 'visemes', 'voice', 'words']);
  assert.ok(Object.keys(b).every((f) => BAKE_FIELDS.includes(f)), 'only the script\'s bake fields');
  assert.equal(b.clip, lines[0].clip);
  assert.equal(b.timings, lines[0].clip.replace(/\.wav$/, '.timings.json'));
  assert.ok(p.files.get(b.clip).equals(Buffer.from(said.wav)), 'the WAV as the TTS made it');
  const tf = JSON.parse(p.files.get(b.timings).toString());
  assert.deepEqual([tf.format, tf.text, tf.offset, tf.sampleRate, tf.words], ['vrmxg-word-timings', 'Coming right up!', TIMING_OFFSETS['kokoro-82m'], 24000, said.words]);
  assert.deepEqual(b.words.map((w) => w.start), said.words.map((w) => Math.round((w.start + 0.03) * 1e4) / 1e4), 'Kokoro\'s +30 ms on every word');
  const { samples, rate } = decodeWav(said.wav);
  assert.equal(b.audio.duration, Math.round((samples.length / rate) * 1e4) / 1e4);
  assert.equal(b.audio.sampleRate, 24000);
  assert.deepEqual(b.visemes, buildTrack(b.words).map((k) => [k.viseme, ...[k.t0, k.t1, k.t2, k.level].map((x) => Math.round(x * 1e4) / 1e4)]));
  assert.ok(b.visemes.length > 5);
  // a provider that corrects its own timings (the loopback stand-ins: httpTTS's offsetApplied 0.03): nothing added twice
  const [c] = await bakeLines(lines, { tts: { ...tts, speak: tts.speak, offsetApplied: 0.03 }, write: project().write });
  assert.deepEqual(c.words.map((w) => w.start), said.words.map((w) => w.start));
  // no timings from the engine: estimated words, marked so
  const quiet = { speak: async (o) => ({ ...(await tts.speak(o)), words: null }) };
  const [e] = await bakeLines(lines, { tts: quiet, write: project().write });
  assert.equal(e.audio.estimated, true);
  assert.equal(e.words[0].text, 'Coming');
  await assert.rejects(bakeLines(lines, { tts: null, write: p.write }), /TTS provider/);
});

/** Kokoro's audio differs a little from run to run (its words and lengths don't): a stand-in that does the same. */
function noisyTTS() {
  const base = fakeTTS();
  let n = 0;
  return { name: 'noisy', calls: base.calls, async speak(o) { const r = await base.speak(o); const wav = r.wav.slice(); wav[wav.length - 1] = ++n; return { ...r, wav }; } };
}

test('in the editor: voicing every line is one undo step; regenerating one line, then one character, is one undo step each; exact bytes on undo and redo; no file written over', async () => {
  const s = session(), tts = noisyTTS(), p = project(), o = { tts, write: p.write, read: p.read, presets: PRESETS };
  const original = s.text();
  const a = await voiceLines(s, {}, o);
  assert.deepEqual([a.changed, a.baked, a.label], [true, 7, 'Voice 7 lines of cafe-order']);
  assert.equal(s.history().undo, 'Voice 7 lines of cafe-order');
  assert.equal(s.history().undoDepth, 1);
  assert.deepEqual(checkSequence(s.doc.sequence), []);
  for (const t of dialogue(s.doc)) for (const c of t.clips) {
    assert.equal(c.voice, PRESETS[t.target], 'every line in its character\'s voice');
    assert.ok(c.clip && c.words.length && c.visemes.length && c.audio.duration > 0 && p.files.has(c.clip) && p.files.has(c.timings));
  }
  const voiced = s.text();
  assert.equal((await voiceLines(s, {}, o)).changed, false, 'every line voiced: nothing more to do');
  assert.equal(s.history().undoDepth, 1, 'and no step');

  // one line, in another voice
  const r1 = await voiceLines(s, { line: 'cafe-order-mira-says-2' }, { ...o, voice: 'af_sky' });
  assert.equal(r1.label, 'Voice line "Is it always this quiet in the …"');
  assert.equal(s.history().undoDepth, 2, 'one step');
  assert.equal(track(s.doc, 'mira-says').clips[1].voice, 'af_sky');
  assert.ok(track(s.doc, 'mira-says').clips[1].clip.includes('-af-sky-'));
  const one = s.text();
  assert.deepEqual(diffLines(voiced, one), ['mira-says.1'], 'only that line changed');

  // one character, in another voice
  const r2 = await voiceLines(s, { role: 'HANA' }, { ...o, voice: 'af_nicole' });
  assert.deepEqual([r2.label, r2.baked], ['Voice HANA\'s lines (4, af_nicole)', 4]);
  assert.equal(s.history().undoDepth, 3, 'one step for all four lines');
  assert.ok(track(s.doc, 'hana-1-says').clips.every((c) => c.voice === 'af_nicole'));
  const hana = s.text();
  assert.deepEqual(diffLines(one, hana), ['hana-1-says.0', 'hana-1-says.1', 'hana-1-says.2', 'hana-1-says.3']);

  s.undo(); assert.equal(s.text(), one, 'one undo takes back the character\'s four lines, back to clips never written over');
  s.undo(); assert.equal(s.text(), voiced, 'one more the line');
  s.undo(); assert.equal(s.text(), original, 'and one more the first voicing');
  s.redo(); s.redo(); s.redo(); assert.equal(s.text(), hana, 'redo puts all three back');
  for (const t of dialogue(s.doc)) for (const c of t.clips) assert.ok(p.files.has(c.clip), 'every file the history names is still there');
  // the same line in its first voice again: the take already there, baked from its files, not spoken over them
  const calls = tts.calls.length;
  await voiceLines(s, { line: 'cafe-order-mira-says-2' }, { ...o, voice: 'af_bella' });
  assert.equal(tts.calls.length, calls, 'no TTS call');
  const before = JSON.parse(voiced).sequence.tracks.find((t) => t.id === 'mira-says').clips[1];
  assert.deepEqual(track(s.doc, 'mira-says').clips[1], before, 'the same bake as the first time, byte for byte');
  // without read, the noisy TTS would write other bytes under a name an undo step points at
  await assert.rejects(voiceLines(s, { line: 'cafe-order-mira-says-1' }, { ...o, read: undefined }), /written over with other bytes/);
});

test('the editor op and the pure path agree byte for byte; new words for one line are part of its one step', async () => {
  const s = session(), p = project(), o = { tts: fakeTTS(), write: p.write, presets: PRESETS };
  await voiceLines(s, { role: 'mira' }, o);
  const doc = unbaked(), lines = voicingPlan(doc, { role: 'mira' }, { presets: PRESETS });
  const pure = applyVoicing(doc, lines, await bakeLines(lines, { tts: fakeTTS(), write: project().write }));
  assert.equal(s.text(), serialize(pure.doc));
  const depth = s.history().undoDepth;
  await voiceLines(s, { line: 'cafe-order-mira-says-3', text: 'Thank you so much!' }, o);
  assert.equal(s.history().undoDepth, depth + 1);
  const c = track(s.doc, 'mira-says').clips[2];
  assert.deepEqual([c.text, c.words.map((w) => w.text)], ['Thank you so much!', ['Thank', 'you', 'so', 'much']]);
  assert.equal(c.clip, clipFor('voice', 'cafe-order-mira-says-3', 'af_bella', 'Thank you so much!'));
  await assert.rejects(voiceLines(s, { role: 'mira', text: 'x' }, o), /one line/);
  assert.throws(() => applyVoicing(doc, lines, [{ clip: 'x.wav', end: 3 }, null, null]), /only clip, timings/);
});

test('a failing voice applies nothing; an edit while the lines speak refuses the voicing', async () => {
  const s = session(), p = project();
  const original = s.text();
  const failing = { speak: async ({ text }) => { if (text.startsWith('Coming')) throw new Error('Kokoro fell over'); return fakeTTS().speak({ text, voice: 'af_heart' }); } };
  await assert.rejects(voiceLines(s, { role: 'HANA' }, { tts: failing, write: p.write, presets: PRESETS }), /Kokoro fell over/);
  assert.deepEqual([s.text(), s.history().undoDepth], [original, 0]);
  const meddling = { speak: async (o) => { if (s.history().undoDepth === 0) s.seq.setTrack('mira-face', { muted: true }); return fakeTTS().speak(o); } };
  await assert.rejects(voiceLines(s, { role: 'HANA' }, { tts: meddling, write: p.write, presets: PRESETS }), /changed while its lines were voicing/);
  assert.equal(s.history().undoDepth, 1, 'only the edit made meanwhile');
});

test('a recast with the voicing hook: the role\'s lines re-baked in the new voice, recast and re-bake one undo step', async () => {
  const s = session(), p = project(), tts = fakeTTS();
  await voiceLines(s, {}, { tts, write: p.write, presets: PRESETS });
  const voiced = s.text();
  const studioMira = cardOf({ ref: 'characters/studio/mira.vrmxa', vrmxaId: 'studio-mira', title: 'Mira', persona: { name: 'Mira', voice_id: 'v-mira', allowed_expressions: ['happy'], rest_expression: 'neutral' }, voices: [{ id: 'v-mira', name: 'Mira (Kokoro)', origin: 'preset', engines: { 'kokoro-82m': { preset: 'af_sarah' } } }], defaultVoice: 'v-mira' });
  const r = await applyCast(s, 'HANA', studioMira, { presets: PRESETS, rebake: rebakeWith({ tts, write: p.write }) });
  assert.deepEqual([r.label, r.baked, r.rebake.length], ['Cast HANA: Mira', 4, 0]);
  assert.equal(s.history().undoDepth, 2, 'the recast and its re-bake: one step');
  for (const c of track(s.doc, 'hana-1-says').clips) assert.ok(c.voice === 'af_sarah' && c.visemes.length && c.clip.includes('-af-sarah-'));
  const bakes = track(s.doc, 'hana-1-says').clips.map((c) => Object.fromEntries(BAKE_FIELDS.filter((f) => c[f] !== undefined).map((f) => [f, c[f]])));
  assert.equal(s.text(), serialize(withBake(castRole(JSON.parse(voiced), 'HANA', studioMira, { presets: PRESETS, set }), bakes).doc), 'the pure cast with the same bakes');
  s.undo(); assert.equal(s.text(), voiced, 'one undo: the old casting and the af_heart clips');
  assert.equal(voicingPlan(s.doc, {}, { presets: PRESETS }).length, 0);
});

test('a re-script keeps the bake of every line whose words are unchanged, and drops only the changed line\'s', async () => {
  const s = session(), p = project();
  await voiceLines(s, {}, { tts: fakeTTS(), write: p.write, presets: PRESETS });
  const same = buildSequence(script, { set, marks, previous: s.doc });
  assert.deepEqual(dialogue(same.doc).map((t) => t.clips.map((c) => c.clip)), dialogue(s.doc).map((t) => t.clips.map((c) => c.clip)), 'the same script keeps every bake');
  const edited = buildSequence(script.replace('Coming right up!', 'Coming right up, Mira!'), { set, marks, previous: s.doc });
  const left = voicingPlan(edited.doc, {}, { presets: PRESETS });
  assert.deepEqual(left.map((l) => [l.text, l.reason]), [['Coming right up, Mira!', 'unbaked']], 'only the changed line is left to voice');
});

test('what plays is the track: the voice service takes a baked line\'s words, visemes and length, not the WAV\'s or the rules\'', async () => {
  const lines = voicingPlan(unbaked(), { line: 'cafe-order-hana-1-says-1' }, { presets: PRESETS });
  const [b] = await bakeLines(lines, { tts: fakeTTS(), write: project().write });
  const tree = { services: new Map(), clock: { step: 0 }, find: () => null, all: () => [] };
  const voice = new VoiceService(tree, { resolve: () => { throw new Error('a baked line reads no timings file'); }, faces: false });
  const tampered = { ...b, visemes: b.visemes.map(([v, t0, t1, t2]) => [v, t0, t1, t2, 0.25]), audio: { ...b.audio, duration: 9 } };
  const t = await voice.preload(b.clip, { words: tampered.words, visemes: tampered.visemes, audio: tampered.audio, text: lines[0].text });
  assert.equal(t.duration, 9, 'the line lasts as long as the track says');
  const keys = voice.trackOf({ clip: b.clip });
  assert.ok(keys.length === b.visemes.length && keys.every((k) => k.level === 0.25), 'the mouth is sampled from the baked visemes');
  // subtitles run to the end of a baked line's audio
  const seq = { fps: 24, tracks: [{ id: 'd', type: 'dialogue', target: 'hana-1', clips: [{ start: 0, end: 24, text: 'Hi', audio: { duration: 2.01 } }, { start: 100, end: 200, text: 'Bye', audio: { duration: 1 } }] }] };
  assert.equal(subtitles(seq), '1\n00:00:00,000 --> 00:00:02,042\nhana-1: Hi\n\n2\n00:00:04,167 --> 00:00:08,333\nhana-1: Bye\n');
});

test('music and sound effects go on their buses: an audio track per bus, one undo step each; lines never on an audio track', () => {
  const s = session();
  assert.deepEqual([busFor('sounds/music.wav'), busFor('sounds/cafe-ambience.wav'), busFor('sounds/door-open.wav'), busFor('music/theme-a.wav')], ['music', 'ambience', 'sfx', 'music']);
  const m = addSound(s, { ref: 'sounds/music.wav', start: 0, end: 720 });
  const f = addSound(s, { ref: 'sounds/switch.wav', start: 370, end: 400, gain: 0.8 });
  const a = addSound(s, { ref: 'sounds/cafe-ambience.wav', start: 0, end: 720, gain: 0.5 });
  assert.deepEqual([m, f, a].map((x) => [x.track, x.bus]), [['music', 'music'], ['sfx', 'sfx'], ['ambience', 'ambience']]);
  assert.equal(s.history().undoDepth, 3);
  assert.equal(s.history().undo, 'Add ambience cafe-ambience.wav @0');
  const audio = s.doc.sequence.tracks.filter((t) => t.type === 'audio');
  assert.deepEqual(audio.map((t) => [t.id, t.bus, t.clips.map((c) => c.asset)]), [['music', 'music', ['sounds/music.wav']], ['sfx', 'sfx', ['sounds/switch.wav']], ['ambience', 'ambience', ['sounds/cafe-ambience.wav']]]);
  assert.deepEqual(checkSequence(s.doc.sequence), []);
  assert.deepEqual(soundProblems(s.doc), []);
  addSound(s, { ref: 'sounds/door-open.wav', start: 10, end: 40 });
  assert.equal(s.doc.sequence.tracks.filter((t) => t.type === 'audio').length, 3, 'a second effect joins the sfx track');
  s.undo(); s.undo();
  assert.deepEqual(s.doc.sequence.tracks.filter((t) => t.type === 'audio').map((t) => t.id), ['music', 'sfx']);
  assert.throws(() => placeSound(s.doc, { ref: 'voice/x.wav', start: 0, end: 10, bus: 'voice' }), /dialogue track/);
  assert.throws(() => placeSound(s.doc, { ref: 'sounds/x.wav', start: 10, end: 5 }), /frames/);
  const bad = structuredClone(s.doc);
  bad.sequence.tracks.push({ id: 'oops', type: 'audio', bus: 'voice', clips: [{ start: 0, end: 5, asset: 'voice/x.wav' }] }, { id: 'odd', type: 'audio', clips: [{ start: 0, end: 5, asset: 'a.wav', bus: 'radio' }] });
  assert.equal(soundProblems(bad).length, 2);
});

/** Which dialogue clips differ between two texts: ["<track>.<index>"]. */
function diffLines(a, b) {
  const A = JSON.parse(a), B = JSON.parse(b), out = [];
  for (const t of dialogue(A)) t.clips.forEach((c, i) => { if (JSON.stringify(c) !== JSON.stringify(track(B, t.id).clips[i])) out.push(`${t.id}.${i}`); });
  const rest = (d) => JSON.stringify({ ...d, sequence: { ...d.sequence, tracks: d.sequence.tracks.filter((t) => t.type !== 'dialogue') } });
  assert.equal(rest(A), rest(B), 'nothing but dialogue changed');
  return out;
}
