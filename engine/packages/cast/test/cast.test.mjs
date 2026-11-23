// Casting on the sample's script-built sequence (content/sample/sequences/cafe-order.vrmxs), with cards as plain data.
// M4 done-check 2: a role cast from a picked .vrmxa; recasting swaps the character, keeps the performance and re-bakes
// the lines; one undo step; the same inputs give the same bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { m0Registry } from '@vrmxg/registry/m0';
import { createValidator } from '@vrmxg/scene';
import { EditorSession } from '@vrmxg/editor-core';
import { checkSequence, composeSequence } from '@vrmxg/sequence';
import { bakePlan, applyBake } from '@vrmxg/voice';
import { buildSequence } from '@vrmxg/script';
import { rolesOf, castRole, applyCast, withBake, clipFor, voicesFor, linesToBake, resolveVoice, allowedExpressions, cardOf, dressCast, readCharacter, KOKORO_PRESETS } from '../src/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { SAMPLE, set, prefabs, script, marks, sequence, sampleText, sha, text, track, performance, words, studioHana, studioMira, sampleMira, sampleHana, PRESETS } from './helpers.mjs';

const reg = m0Registry();
const validator = createValidator(reg);
const valid = (doc) => {
  assert.deepEqual(checkSequence(doc.sequence, { nodeIds: new Set([...set.nodes, ...doc.nodes].map((n) => n.id)) }), []);
  const v = validator.check(composeSequence(doc, set), { prefabs });
  assert.deepEqual(v.errors, []);
};
const opts = { set, presets: PRESETS };

test('the roles come from the script: cue, node id, lines and performance tracks', () => {
  const roles = rolesOf(sequence());
  assert.deepEqual(roles.map((r) => [r.id, r.cue, r.lines.length]), [['hana-1', 'HANA', 4], ['mira', 'MIRA', 3]]);
  const hana = roles[0];
  assert.deepEqual(hana.dialogue, ['hana-1-says']);
  assert.deepEqual(hana.performance, ['hana-1-act', 'hana-1-face', 'hana-1-eyes']);
  assert.deepEqual(hana.lines.map((l) => l.beat), ['ln-cd2c6011', 'ln-b97ebbcd', 'ln-177853ab', 'ln-72861ffa'], 'each line keeps its script beat id');
  assert.equal(hana.lines[0].text, 'Good morning! What can I get you?');
  assert.ok(hana.lines.every((l) => !l.baked));
});

test('a role is cast from a picked .vrmxa: the character, her persona\'s voice and expressions, her wardrobe', () => {
  const doc = sequence();
  const r = castRole(doc, 'HANA', studioHana, opts);
  assert.equal(r.changed, true);
  assert.equal(r.label, 'Cast HANA: Hana');
  assert.deepEqual(r.role, {
    cue: 'HANA', asset: 'cast-hana',
    character: { ref: 'characters/studio/hana.vrmxa', sha256: studioHana.sha256, vrmxaId: 'studio-hana', name: 'Hana' },
    voice: { engine: 'kokoro-82m', preset: 'af_heart', from: 'persona', id: 'v-hana', name: 'Hana (Kokoro)' },
    expressions: ['happy', 'sad', 'relaxed', 'surprised', 'neutral'], rest: 'relaxed',
    wardrobe: { outfit: null, worn: ['top-h', 'shoes-h'] },
  });
  assert.deepEqual(r.doc.assets, [{ id: 'cast-hana', type: 'vrmxa', ref: 'characters/studio/hana.vrmxa', sha256: studioHana.sha256 }]);
  assert.deepEqual(r.ops.map((o) => o.op), ['addAsset', 'setDoc']);
  // composing the sequence gives Hana's node the new character; the set's file and everything else stay
  const world = composeSequence(r.doc, set);
  assert.equal(world.nodes.find((n) => n.id === 'hana-1').asset, 'cast-hana');
  assert.equal(world.nodes.find((n) => n.id === 'mira').asset, 'mira');
  assert.equal(world.assets.find((a) => a.id === 'cast-hana').ref, 'characters/studio/hana.vrmxa');
  assert.equal(performance(r.doc, 'hana-1'), performance(doc, 'hana-1'));
  // her four lines are listed to bake in her voice (none was baked yet)
  assert.deepEqual(r.rebake.map((l) => [l.beat, l.voice, l.reason]), [['ln-cd2c6011', 'af_heart', 'unbaked'], ['ln-b97ebbcd', 'af_heart', 'unbaked'], ['ln-177853ab', 'af_heart', 'unbaked'], ['ln-72861ffa', 'af_heart', 'unbaked']]);
  // her performance wears "happy", which she allows: no warning
  assert.deepEqual(r.warnings, []);
  valid(r.doc);
  assert.equal(r.doc.set, 'cafe.vrmxs');
});

test('casting the file the set already uses reuses its asset; the role names it and adds none', () => {
  const r = castRole(sequence(), 'hana-1', sampleHana, opts);
  assert.equal(r.role.asset, 'hana');
  assert.deepEqual(r.doc.assets, []);
  assert.deepEqual(r.ops.map((o) => o.op), ['setDoc']);
  assert.equal(r.role.voice.preset, 'af_heart', 'no persona: the sample\'s map');
  assert.equal(r.role.voice.from, 'map');
  assert.equal(r.role.expressions, null, 'no persona: every expression allowed');
  valid(r.doc);
});

test('recasting swaps the character, keeps the role\'s performance byte for byte, and lists her lines for re-bake in the new voice', () => {
  const doc = sequence();
  const a = castRole(doc, 'hana-1', studioHana, opts);
  // bake Hana's lines (as W7 will: the clip, and the voice it was baked in)
  const baked = structuredClone(a.doc);
  for (const c of track(baked, 'hana-1-says').clips) Object.assign(c, { clip: `voice/${c.src.split('#')[0]}-af_heart.wav`, voice: 'af_heart' });
  const b = castRole(baked, 'hana-1', studioMira, opts);
  assert.equal(b.label, 'Recast HANA: Hana → Mira');
  assert.equal(b.role.character.ref, 'characters/studio/mira.vrmxa');
  assert.equal(b.role.voice.preset, 'af_bella');
  assert.equal(composeSequence(b.doc, set).nodes.find((n) => n.id === 'hana-1').asset, 'cast-mira');
  assert.deepEqual(b.doc.assets.map((x) => x.id), ['cast-mira'], 'the old cast asset, now unused, goes');
  assert.deepEqual(b.ops.map((o) => o.op), ['addAsset', 'setDoc', 'removeAsset']);

  // the performance: every track aimed at her, byte for byte; the dialogue's words and times too
  assert.equal(performance(b.doc, 'hana-1'), performance(doc, 'hana-1'));
  assert.equal(words(b.doc, 'hana-1'), words(doc, 'hana-1'));
  assert.ok(performance(doc, 'hana-1').length > 1000);
  // the other role and the rest of the film are untouched
  for (const t of doc.sequence.tracks.filter((x) => x.target !== 'hana-1')) assert.equal(JSON.stringify(track(b.doc, t.id)), JSON.stringify(t), t.id);
  for (const k of ['shots', 'markers', 'cast', 'script', 'duration', 'fps']) assert.equal(JSON.stringify(b.doc.sequence[k]), JSON.stringify(doc.sequence[k]), k);

  // her lines: the old bake goes, and each is listed for re-bake in the new voice, under a new file name
  assert.ok(track(b.doc, 'hana-1-says').clips.every((c) => c.clip === undefined && c.voice === undefined));
  assert.deepEqual(b.rebake.map((l) => [l.text, l.voice, l.reason]), track(doc, 'hana-1-says').clips.map((c) => [c.text, 'af_bella', 'recast']));
  assert.deepEqual(b.rebake.map((l) => l.clip), ['voice/cafe-order-hana-1-says-1-af-bella-61ddca1a.wav', 'voice/cafe-order-hana-1-says-2-af-bella-27256c04.wav', 'voice/cafe-order-hana-1-says-3-af-bella-ff7f9b59.wav', 'voice/cafe-order-hana-1-says-4-af-bella-e6a54a56.wav']);
  assert.deepEqual(b.rebake.map((l) => l.clip), b.rebake.map((l) => clipFor('voice', l.id, 'af_bella', l.text)));
  // the same lines @vrmxg/voice's bakePlan finds with the cast's voices; but its file is voice/<line>.wav, the same
  // name in every voice, which a re-bake would write over while undo still points at it: W7 bakes a cast role from
  // this list (the hook), never from bakePlan's names
  const plan = bakePlan(b.doc, { voices: voicesFor(b.doc, { presets: PRESETS }) }).filter((p) => p.speaker === 'hana-1');
  assert.deepEqual(plan.map((p) => [p.id, p.where, p.text, p.voice]), b.rebake.map((l) => [l.id, l.where, l.text, l.voice]));
  assert.deepEqual(plan.map((p) => p.clip), b.rebake.map((l) => `voice/${l.id}.wav`));
  assert.deepEqual(linesToBake(b.doc, { presets: PRESETS, role: 'hana-1' }).map((l) => l.clip), b.rebake.map((l) => l.clip));
  // Mira allows the "happy" Hana's performance wears; the role now shares Mira's voice, which is said
  assert.deepEqual(b.warnings, ['HANA speaks in af_bella, as MIRA does: pick another voice if they shouldn\'t sound alike']);
  valid(b.doc);
});

test('a recast in the same voice keeps the bake; a voice picked by hand re-bakes', () => {
  const a = castRole(sequence(), 'hana-1', studioHana, opts);
  const baked = applyBake(a.doc, bakePlan(a.doc, { voices: voicesFor(a.doc) }));
  assert.ok(track(baked, 'hana-1-says').clips.every((c) => c.voice === 'af_heart'), 'applyBake records the voice');
  const other = cardOf({ ...studioMira, ref: 'characters/studio/hana-2.vrmxa', voices: [{ id: 'v-mira', name: 'x', origin: 'preset', engines: { 'kokoro-82m': { preset: 'af_heart' } } }] });
  const same = castRole(baked, 'hana-1', other, opts);
  assert.equal(same.rebake.length, 0);
  assert.equal(JSON.stringify(track(same.doc, 'hana-1-says')), JSON.stringify(track(baked, 'hana-1-says')));
  const picked = castRole(baked, 'hana-1', studioHana, { ...opts, voice: 'af_sky' });
  assert.equal(picked.label, 'Recast HANA\'s voice: af_heart → af_sky');
  assert.deepEqual(picked.role.voice, { engine: 'kokoro-82m', preset: 'af_sky', from: 'pick' });
  assert.equal(picked.rebake.length, 4);
  assert.equal(performance(picked.doc, 'hana-1'), performance(baked, 'hana-1'));
  // casting her exactly as she is changes nothing
  const again = castRole(a.doc, 'hana-1', studioHana, opts);
  assert.equal(again.changed, false);
  assert.deepEqual(again.ops, []);
});

test('a bake made before casting: the clip\'s recorded voice decides; a voice nobody recorded is kept with a warning, or re-baked', () => {
  const doc = sequence();
  // baked with the sample's map: Mira's lines are af_bella, her persona's voice, so they stay
  const mapped = applyBake(doc, bakePlan(doc, { voices: PRESETS }));
  const kept = castRole(mapped, 'mira', studioMira, opts);
  assert.deepEqual([kept.rebake.length, kept.warnings], [0, []]);
  // baked in the default voice (af_heart): not Mira's, so the bake goes, whatever the map says
  const plain = applyBake(doc, bakePlan(doc, {}));
  const r = castRole(plain, 'mira', studioMira, opts);
  assert.deepEqual(r.rebake.map((l) => [l.voice, l.reason]), [['af_bella', 'recast'], ['af_bella', 'recast'], ['af_bella', 'recast']]);
  // an older bake that never recorded its voice: kept, with a warning, unless asked to re-bake
  const unknown = structuredClone(plain);
  for (const t of unknown.sequence.tracks) for (const c of t.clips ?? []) delete c.voice;
  const u = castRole(unknown, 'mira', studioMira, opts);
  assert.equal(u.rebake.length, 0);
  assert.equal(u.warnings.length, 3);
  assert.match(u.warnings[0], /in a voice nobody recorded; it is kept/);
  const re = castRole(unknown, 'mira', studioMira, { ...opts, unknown: 'rebake' });
  assert.deepEqual(re.rebake.map((l) => l.reason), ['unknown', 'unknown', 'unknown']);
  assert.ok(track(re.doc, 'mira-says').clips.every((c) => c.clip === undefined));
});

test('in the editor: a cast and a recast, each with the re-bake its hook makes, are one undo step each; undo and redo give exact bytes', async () => {
  const s = new EditorSession({ registry: reg, text: sampleText });
  s.setDoc = set;
  const original = s.text();
  const heard = [], written = new Set();
  // W7's hook: write each line's audio to the file the cast names, answer its bake fields
  const hook = async (lines, ctx) => {
    heard.push([ctx.role, ctx.label, lines.map((l) => l.voice)]);
    return lines.map((l) => { assert.ok(!written.has(l.clip), `${l.clip} is never written twice`); written.add(l.clip); return { clip: l.clip, timings: l.clip.replace(/\.wav$/, '.timings.json') }; });
  };
  const a = await applyCast(s, 'hana-1', studioHana, { ...opts, rebake: hook });
  assert.equal(s.history().undo, 'Cast HANA: Hana');
  assert.deepEqual([a.baked, a.rebake.length], [4, 0]);
  const cast = s.text();
  assert.equal(cast, text(a.doc), 'the editor\'s document is the pure result, byte for byte');
  assert.ok(track(s.doc, 'hana-1-says').clips.every((c) => c.voice === 'af_heart' && c.clip.includes('-af-heart-')), 'each clip records its voice');

  const depth = s.history().undoDepth;
  const b = await applyCast(s, 'hana-1', studioMira, { ...opts, rebake: hook });
  assert.equal(s.history().undo, 'Recast HANA: Hana → Mira');
  assert.equal(s.history().undoDepth, depth + 1, 'the recast and its re-bake are one step');
  assert.equal(b.baked, 4);
  const recast = s.text();
  assert.equal(recast, text(withBake(castRole(a.doc, 'hana-1', studioMira, opts), heardBakes(b)).doc), 'the pure path with the same bakes gives the same bytes');
  assert.equal(performance(s.doc, 'hana-1'), performance(sequence(), 'hana-1'));
  assert.deepEqual(heard, [['hana-1', 'Cast HANA: Hana', ['af_heart', 'af_heart', 'af_heart', 'af_heart']], ['hana-1', 'Recast HANA: Hana → Mira', ['af_bella', 'af_bella', 'af_bella', 'af_bella']]]);

  s.undo(); assert.equal(s.text(), cast, 'one undo takes back the recast and its re-bake: the af_heart clips, never written over');
  s.undo(); assert.equal(s.text(), original, 'and one more the cast');
  s.redo(); s.redo(); assert.equal(s.text(), recast);
  // nothing to change: no undo step, no hook
  const d2 = s.history().undoDepth;
  assert.equal((await applyCast(s, 'hana-1', studioMira, { ...opts, rebake: () => assert.fail('no hook') })).changed, false);
  assert.equal(s.history().undoDepth, d2);
});
/** The bake fields the editor test's hook gave a recast (for comparing with the pure path). */
const heardBakes = (r) => track(r.doc, 'hana-1-says').clips.map((c) => ({ clip: c.clip, timings: c.timings }));

test('the re-bake hook: no answer leaves the lines to speak live; a failing hook casts nothing; an edit while it runs refuses the cast', async () => {
  const s = new EditorSession({ registry: reg, text: sampleText });
  s.setDoc = set;
  const original = s.text();
  const live = await applyCast(s, 'hana-1', studioHana, { ...opts, rebake: () => undefined });
  assert.deepEqual([live.baked, live.rebake.length, s.history().undoDepth], [0, 4, 1]);
  s.undo();
  await assert.rejects(applyCast(s, 'hana-1', studioHana, { ...opts, rebake: async () => { throw new Error('TTS down'); } }), /TTS down/);
  assert.equal(s.text(), original, 'nothing was cast');
  await assert.rejects(applyCast(s, 'hana-1', studioHana, { ...opts, rebake: async () => { s.seq.set({ duration: s.doc.sequence.duration + 1 }); return null; } }), /the document changed while its lines were baking/);
  // a bake answers each line, and sets only bake fields
  const r = castRole(sequence(), 'hana-1', studioHana, opts);
  assert.throws(() => withBake(r, [null]), /4 lines, 1 answers/);
  assert.throws(() => withBake(r, r.rebake.map(() => ({ clip: 'x.wav', text: 'changed' }))), /sets only clip, timings/);
});

test('the same inputs give the same sequence bytes', () => {
  const run = () => {
    let d = sequence();
    d = castRole(d, 'hana-1', studioHana, opts).doc;
    d = castRole(d, 'mira', sampleMira, opts).doc;
    d = castRole(d, 'hana-1', studioMira, opts).doc;
    return text(d);
  };
  const one = run(), two = run();
  assert.equal(one, two);
  assert.notEqual(one, sampleText);
  // pinned: a change to the cast's output shows here (regenerate on purpose)
  assert.equal(sha(one), GOLDEN);
});
const GOLDEN = '1d9f2ec2ec14b05c45e558a801521c9f5ae742f0c8e7cf916f52441527393f16';

test('re-scripting after a cast keeps the casting, and the re-bake isn\'t taken for a hand edit', () => {
  const a = castRole(sequence(), 'hana-1', studioMira, opts);
  const edited = script.replace('Coming right up!', 'Coming right up, one latte!');
  const r = buildSequence(edited, { set, marks, previous: a.doc });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.deepEqual(r.doc.sequence.roles, a.doc.sequence.roles);
  assert.deepEqual(r.doc.assets, a.doc.assets);
  assert.equal(r.doc.sequence.script.hand, undefined, 'no hand edits');
  // the changed line is still Hana's, and listed to bake in her cast voice
  const todo = linesToBake(r.doc, { presets: PRESETS, role: 'HANA' });
  assert.ok(todo.some((l) => l.text === 'Coming right up, one latte!' && l.voice === 'af_bella'));
  valid(r.doc);
});

test('voices: the persona\'s Kokoro preset, else the map, else a preset no other role has; a voice the shell can\'t speak is said', () => {
  assert.deepEqual(resolveVoice(studioMira, 'mira').voice, { engine: 'kokoro-82m', preset: 'af_bella', from: 'persona', id: 'v-mira', name: 'Mira (Kokoro)' });
  const tone = resolveVoice(sampleMira, 'mira', { presets: PRESETS });
  assert.deepEqual(tone.voice, { engine: 'kokoro-82m', preset: 'af_bella', from: 'map' });
  assert.match(tone.warnings[0], /names no kokoro-82m preset/);
  assert.deepEqual(resolveVoice(sampleHana, 'barista', { taken: ['af_heart'] }).voice, { engine: 'kokoro-82m', preset: 'af_bella', from: 'default' });
  // two unmapped roles cast in turn don't share a voice
  let d = castRole(sequence(), 'hana-1', sampleHana, { set }).doc;
  d = castRole(d, 'mira', sampleHana, { set }).doc;
  assert.deepEqual(voicesFor(d), { 'hana-1': 'af_heart', mira: 'af_bella' });
  assert.deepEqual(allowedExpressions(sampleHana), null);
  assert.deepEqual(allowedExpressions(studioMira), ['happy', 'angry', 'relaxed', 'surprised', 'neutral']);
});

test('allowed expressions come from the persona; a face the kept performance wears that she doesn\'t allow is reported, not changed', () => {
  const shy = cardOf({ ...studioMira, ref: 'characters/shy.vrmxa', name: 'Shy', persona: { ...studioMira.persona, name: 'Shy', allowed_expressions: ['happy'] } });
  const r = castRole(sequence(), 'mira', shy, opts);
  assert.deepEqual(r.role.expressions, ['happy', 'neutral']);
  assert.deepEqual(r.warnings, ['MIRA\'s performance wears "relaxed", which Shy\'s persona doesn\'t allow (happy, neutral); it is kept']);
  assert.equal(performance(r.doc, 'mira'), performance(sequence(), 'mira'));
});

test('wardrobe: her own closet, or one of her outfits by name; an outfit she lacks is an error; the closet puts it on at play', () => {
  assert.deepEqual(castRole(sequence(), 'mira', sampleMira, opts).role.wardrobe, { outfit: 'adv', worn: ['top', 'sword'] });
  const r = castRole(sequence(), 'mira', studioMira, { ...opts, outfit: 'Apron' });
  assert.deepEqual(r.role.wardrobe, { outfit: 'o-1', worn: ['apron-m'] });
  assert.throws(() => castRole(sequence(), 'mira', studioHana, { ...opts, outfit: 'Apron' }), /Hana has no outfit "Apron" \(her closet has no outfits\)/);
  // dressCast asks the closet service for each role's outfit, in role order
  const asked = [];
  const tree = {
    services: new Map([['closet', { closetOf: () => ({ worn: { outfit: null } }), applyOutfit: (actor, o) => { asked.push([actor.id, o]); return { at: 30 }; } }]]),
    find: (id) => ({ id }),
  };
  assert.deepEqual(dressCast(tree, r.doc), [{ role: 'mira', outfit: 'o-1', at: 30 }]);
  assert.deepEqual(asked, [['mira', 'o-1']]);
});

test('a role the script doesn\'t have, and a role cast from an asset nobody has, are errors', () => {
  assert.throws(() => castRole(sequence(), 'BARISTA', studioHana, opts), /no role "BARISTA" in cafe-order \(its roles: HANA = hana-1, MIRA = mira\)/);
  const d = castRole(sequence(), 'hana-1', studioHana, opts).doc;
  d.assets = [];
  assert.throws(() => composeSequence(d, set), /role "hana-1" is cast from asset "cast-hana", which neither the sequence nor the set has/);
});

test('two roles in one voice are said: a persona\'s, a map\'s, a hand-picked one; the free voice skips voices taken', () => {
  // Hana's role recast with Mira while Mira plays mira: both af_bella
  let d = castRole(sequence(), 'mira', studioMira, opts).doc;
  const r = castRole(d, 'hana-1', studioMira, opts);
  assert.deepEqual(r.warnings, ['HANA speaks in af_bella, as MIRA does: pick another voice if they shouldn\'t sound alike']);
  // picked by hand
  d = castRole(sequence(), 'hana-1', studioHana, opts).doc;
  assert.match(castRole(d, 'mira', studioMira, { ...opts, voice: 'af_heart' }).warnings[0], /MIRA speaks in af_heart, as HANA does/);
  // no free preset left: the first, said when a role in the sequence has it
  assert.equal(resolveVoice(sampleHana, 'x', { taken: [...KOKORO_PRESETS] }).voice.preset, 'af_heart');
  const full = castRole(d, 'mira', sampleHana, { set, presets: Object.fromEntries(KOKORO_PRESETS.slice(1).map((p, i) => [`extra-${i}`, p])) });
  assert.deepEqual([full.role.voice, full.warnings], [{ engine: 'kokoro-82m', preset: 'af_heart', from: 'default' }, ['MIRA speaks in af_heart, as HANA does: pick another voice if they shouldn\'t sound alike']]);
});

test('casting a role as she is keeps the voice handed to her, though another role has since taken it', () => {
  let d = castRole(sequence(), 'hana-1', sampleHana, { set }).doc; // no persona, no map: the first free voice
  assert.deepEqual(d.sequence.roles['hana-1'].voice, { engine: 'kokoro-82m', preset: 'af_heart', from: 'default' });
  const m = castRole(d, 'mira', studioHana, { set }); // her persona names af_heart: said
  assert.match(m.warnings[0], /MIRA speaks in af_heart, as HANA does/);
  d = applyBake(m.doc, bakePlan(m.doc, { voices: voicesFor(m.doc) }));
  const again = castRole(d, 'hana-1', sampleHana, { set });
  assert.equal(again.changed, false, 'no new voice, no lost bake, no undo step');
  assert.deepEqual(again.ops, []);
  // a different character with no voice of her own does take a free one
  assert.equal(castRole(d, 'hana-1', cardOf({ ref: 'characters/other.vrmxa' }), { set }).role.voice.preset, 'af_bella');
});

test('a cast file whose bytes changed updates its asset in place, even while a sequence node uses it; the editor agrees', async () => {
  const doc = sequence();
  const parent = doc.nodes[0].parent;
  doc.assets = [{ id: 'extra-hana', type: 'vrmxa', ref: 'characters/studio/hana.vrmxa' }]; // as addFromAsset leaves it: no sha256
  doc.nodes.push({ id: 'extra', type: 'Character', ...(parent !== undefined ? { parent } : {}), asset: 'extra-hana' });
  const r = castRole(doc, 'hana-1', studioHana, opts);
  assert.deepEqual(r.ops.map((o) => o.op), ['setAsset', 'setDoc']);
  assert.deepEqual(r.doc.assets, [{ id: 'extra-hana', type: 'vrmxa', ref: 'characters/studio/hana.vrmxa', sha256: studioHana.sha256 }]);
  assert.equal(r.role.asset, 'extra-hana');
  const s = new EditorSession({ registry: reg, text: text(doc) });
  s.setDoc = set;
  const before = s.text();
  await applyCast(s, 'hana-1', studioHana, opts);
  assert.equal(s.text(), text(r.doc), 'the pure result and the editor\'s agree');
  s.undo();
  assert.equal(s.text(), before);
});

test('only characters are roles: a cast entry for the music player isn\'t one, and casting it is refused', () => {
  const morning = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'sequences/cafe-morning.vrmxs'), 'utf8'));
  assert.ok(morning.sequence.cast.music, 'cafe-morning casts its music player');
  assert.deepEqual(rolesOf(morning, { set }).map((r) => r.id), ['hana-1', 'mira']);
  assert.deepEqual(rolesOf(morning).map((r) => r.id), ['hana-1', 'mira'], 'without the set, a cast entry alone makes no role');
  assert.throws(() => castRole(morning, 'music', studioHana, { set }), /"music" is a AudioPlayer, not a Character: only characters are cast/);
  // a silent character the sequence casts is a role
  const quiet = sequence();
  quiet.sequence.cast.mira = { transform: { p: [0, 0, 0] } };
  quiet.sequence.tracks = quiet.sequence.tracks.filter((t) => !(t.type === 'dialogue' && t.target === 'mira'));
  assert.ok(rolesOf(quiet, { set }).some((x) => x.id === 'mira'));
});

test('readCharacter: a card from vrmxa-core\'s readers (a stand-in module here, so it runs in CI)', async () => {
  const bytes = new TextEncoder().encode('a vrmxa');
  const bundle = { manifest: { id: 'id-aiko', title: 'Aiko' } };
  const vrmxa = {
    readBundle: async (b) => { assert.equal(b, bytes); return bundle; },
    sha256: async () => 'ab'.repeat(32),
    personaOf: (b) => (assert.equal(b, bundle), { name: 'Aiko', voice_id: 'v-1', allowed_expressions: ['happy', 'sad'], rest_expression: 'happy', extra: 'dropped' }),
    voicesOf: () => ({ default: 'v-1', voices: [{ id: 'v-1', name: 'Aiko (Kokoro)', origin: 'preset', engines: { 'kokoro-82m': { preset: 'af_sky' } } }] }),
    closetOf: () => ({ worn: { items: ['dress'], states: { hat: 'off' }, outfit: 'o-1' }, outfits: [{ id: 'o-1', name: 'Day', items: ['dress'] }], items: [{ id: 'dress', slot: 'tops', kind: 'worn', name: 'Dress', more: 1 }] }),
  };
  const card = await readCharacter(bytes, { ref: 'characters/aiko.vrmxa', vrmxa });
  assert.deepEqual(card, {
    ref: 'characters/aiko.vrmxa', sha256: 'ab'.repeat(32), vrmxaId: 'id-aiko', title: 'Aiko', name: 'Aiko',
    persona: { name: 'Aiko', voice_id: 'v-1', allowed_expressions: ['happy', 'sad'], rest_expression: 'happy' },
    voices: [{ id: 'v-1', name: 'Aiko (Kokoro)', origin: 'preset', engines: { 'kokoro-82m': { preset: 'af_sky' } } }], defaultVoice: 'v-1',
    wardrobe: { worn: ['dress'], states: { hat: 'off' }, outfit: 'o-1', outfits: [{ id: 'o-1', name: 'Day', items: ['dress'] }], items: [{ id: 'dress', slot: 'tops', kind: 'worn', name: 'Dress' }] },
  });
  assert.equal(castRole(sequence(), 'hana-1', card, opts).role.voice.preset, 'af_sky');
  // no persona, no voices, an empty closet: a card all the same
  const bare = await readCharacter(bytes, { ref: 'characters/x.vrmxa', vrmxa: { ...vrmxa, readBundle: async () => ({ manifest: {} }), personaOf: () => null, voicesOf: () => ({}), closetOf: () => ({}) } });
  assert.deepEqual([bare.name, bare.vrmxaId, bare.persona, bare.voices, bare.wardrobe.worn], ['x', null, null, [], []]);
  await assert.rejects(readCharacter(bytes, { ref: 'characters/x.vrmxa', vrmxa: { ...vrmxa, closetOf: undefined } }), /needs vrmxa-core's closetOf/);
  await assert.rejects(readCharacter(bytes, { vrmxa }), /needs the file's ref/);
});
