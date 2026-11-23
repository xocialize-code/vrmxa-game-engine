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
import { rolesOf, castRole, applyCast, voicesFor, linesToBake, resolveVoice, allowedExpressions, cardOf, dressCast } from '../src/index.js';
import { set, prefabs, script, marks, sequence, sampleText, sha, text, track, performance, words, studioHana, studioMira, sampleMira, sampleHana, PRESETS } from './helpers.mjs';

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
  assert.deepEqual(b.rebake.map((l) => l.clip), ['voice/cafe-order-hana-1-says-1-af-bella.wav', 'voice/cafe-order-hana-1-says-2-af-bella.wav', 'voice/cafe-order-hana-1-says-3-af-bella.wav', 'voice/cafe-order-hana-1-says-4-af-bella.wav']);
  // and they are exactly what @vrmxg/voice's bakePlan finds with the cast's voices (W7's bake takes either)
  const plan = bakePlan(b.doc, { voices: voicesFor(b.doc, { presets: PRESETS }) }).filter((p) => p.speaker === 'hana-1');
  assert.deepEqual(plan.map((p) => [p.id, p.where, p.text, p.voice]), b.rebake.map((l) => [l.id, l.where, l.text, l.voice]));
  assert.deepEqual(linesToBake(b.doc, { presets: PRESETS, role: 'hana-1' }).map((l) => l.clip), b.rebake.map((l) => l.clip));
  assert.deepEqual(b.warnings, [], 'Mira allows the "happy" Hana\'s performance wears');
  valid(b.doc);
});

test('a recast in the same voice keeps the bake; a voice picked by hand re-bakes', () => {
  const a = castRole(sequence(), 'hana-1', studioHana, opts);
  const baked = applyBake(a.doc, bakePlan(a.doc, { voices: voicesFor(a.doc) }));
  for (const c of track(baked, 'hana-1-says').clips) c.voice = 'af_heart';
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

test('a bake made before casting, in a voice nobody recorded, is kept with a warning', () => {
  const doc = sequence();
  const baked = applyBake(doc, bakePlan(doc, {}));
  const r = castRole(baked, 'mira', studioMira, { set }); // no map: what the old bake used is unknown
  assert.equal(r.rebake.length, 0);
  assert.equal(r.warnings.length, 3);
  assert.match(r.warnings[0], /in a voice nobody recorded; it is kept/);
  // with the sample's map, the old bake was af_bella, which is Mira's voice: kept, no warning
  assert.deepEqual(castRole(baked, 'mira', studioMira, opts).warnings, []);
});

test('in the editor: a cast and a recast are one undo step each; undo and redo give exact bytes; the re-bake hook gets the lines', () => {
  const s = new EditorSession({ registry: reg, text: sampleText });
  s.setDoc = set;
  const original = s.text();
  const heard = [];
  const hook = (lines, ctx) => { heard.push([ctx.role, ctx.label, lines.map((l) => l.voice)]); return lines.length; };
  const a = applyCast(s, 'hana-1', studioHana, { ...opts, rebake: hook });
  assert.equal(s.history().undo, 'Cast HANA: Hana');
  const cast = s.text();
  assert.equal(cast, text(a.doc), 'the editor\'s document is the pure result, byte for byte');
  const b = applyCast(s, 'hana-1', studioMira, { ...opts, rebake: hook });
  assert.equal(s.history().undo, 'Recast HANA: Hana → Mira');
  assert.equal(b.hooked, 4);
  const recast = s.text();
  assert.equal(recast, text(castRole(a.doc, 'hana-1', studioMira, opts).doc));
  assert.deepEqual(heard, [['hana-1', 'Cast HANA: Hana', ['af_heart', 'af_heart', 'af_heart', 'af_heart']], ['hana-1', 'Recast HANA: Hana → Mira', ['af_bella', 'af_bella', 'af_bella', 'af_bella']]]);

  s.undo(); assert.equal(s.text(), cast, 'one undo takes back the whole recast');
  s.undo(); assert.equal(s.text(), original, 'and one more the cast');
  s.redo(); s.redo(); assert.equal(s.text(), recast);
  // nothing to change: no undo step
  const depth = s.history().undoDepth;
  assert.equal(applyCast(s, 'hana-1', studioMira, opts).changed, false);
  assert.equal(s.history().undoDepth, depth);
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
