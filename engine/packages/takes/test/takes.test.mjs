// M4 W9 (AB-T-0581): takes without a world. The log is the input and the tracks are a pure function of it: key thinning,
// each kind's derivation from a small scripted log, the sample's three logs against their golden hashes, and keeping and
// removing a take in the sample short as one undo step each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { InputService, VirtualDevice } from '@vrmxg/input';
import { parse, serialize } from '@vrmxg/scene';
import { m0Registry } from '@vrmxg/registry/m0';
import { EditorSession } from '@vrmxg/editor-core';
import { checkSequence, composeSequence } from '@vrmxg/sequence';
import { hashValue } from '@vrmxg/snapshot';
import {
  reduceKeys, frameOfStep, stepOfFrame, makeTake, checkTake, PUPPET_ACTIONS, puppetTracks, puppetSamples, directorTracks, faceTracks, faceSamples, FaceFilter,
  syntheticFace, faceFromBlendshapes, faceFromFeatures, takeTracks, withTake, withoutTake, keepTake, removeTake, takesOf, nextTakeId, takeRef,
} from '../src/index.js';

installPortableMath();
const sample = path.resolve(import.meta.dirname, '../../../../content/sample');
const read = (f) => fs.readFileSync(path.join(sample, f), 'utf8');
const golden = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'golden.json'), 'utf8'));
const sampleTakes = ['take-1', 'take-2', 'take-3'].map((id) => JSON.parse(read(takeRef('the-regular', id))));

/** A puppet log from keys pressed on a virtual keyboard: [from, to, code] in steps from `start`, the camera yaw as given. */
function puppetLog({ start = 100, steps = 120, keys = [], yaw = [[100, 0]] }) {
  const tree = { clock: { step: start } }, input = new InputService(/** @type {any} */ (tree), { actions: PUPPET_ACTIONS }), dev = new VirtualDevice();
  input.addDevice(dev); input.record();
  for (let k = 0; k < steps; k++) {
    for (const [a, b, code] of keys) { if (k === a) dev.press(code); if (k === b) dev.release(code); }
    input.physicsProcess();
    tree.clock.step++;
  }
  return makeTake({ id: 'take-1', kind: 'puppet', target: 'mira', fps: 24, start, end: start + steps, setup: { slots: { nod: 1, greet: 2 } }, log: { input: input.stop(), yaw } });
}

test('reduceKeys keeps what the line between kept keys would miss by more than the tolerance', () => {
  const line = Array.from({ length: 50 }, (_, i) => [i, i * 0.5]);
  assert.deepEqual(reduceKeys(line, 0.01), [[0, 0], [49, 24.5]], 'a straight line is its two ends');
  const corner = [...Array.from({ length: 10 }, (_, i) => [i, 0]), ...Array.from({ length: 10 }, (_, i) => [10 + i, i + 1])];
  assert.deepEqual(reduceKeys(corner, 0.01), [[0, 0], [9, 0], [19, 10]], 'a hold then a ramp keeps the corner');
  assert.equal(reduceKeys(corner, 0).length, corner.length, 'tolerance 0 keeps every key');
  const vec = [[0, [0, 0]], [1, [0.5, 0.15]], [2, [1, 0.3]], [3, [1.5, 0.15]], [4, [2, 0]]];
  assert.deepEqual(reduceKeys(vec, 0.1).map((k) => k[0]), [0, 2, 4], 'vectors: the worst component decides');
  assert.deepEqual(reduceKeys(vec, 0.5).map((k) => k[0]), [0, 4]);
});

test('a value applied on a step is keyed at the frame that step arrives at', () => {
  assert.equal(frameOfStep(0, 24), 0.4);
  assert.equal(frameOfStep(239, 24), 96, 'step 239 arrives at frame 96');
  assert.equal(stepOfFrame(96, 24), 239, 'and frame 96 is first reached on step 239');
  for (const f of [0, 1, 7, 96, 300, 1473]) { const s = stepOfFrame(f, 24); assert.ok(frameOfStep(s, 24) >= f && (s === 0 || frameOfStep(s - 1, 24) < f), `frame ${f}`); }
  assert.equal(frameOfStep(1000, { num: 24000, den: 1001 }), (1001 * 24000) / (60 * 1001));
});

test('a puppet take: held keys become a move key where the intent changes, relative to the camera; a stop ends it', () => {
  const take = puppetLog({ keys: [[10, 70, 'KeyW'], [40, 70, 'KeyD'], [90, 94, 'Space']] });
  const tracks = puppetTracks(take), walk = tracks.find((t) => t.type === 'move');
  assert.deepEqual(tracks.map((t) => `${t.id}:${t.type}`), ['mira-walk-take-1:move']);
  assert.deepEqual(walk.keys, [[frameOfStep(110, 24), [0, 1.4]], [frameOfStep(140, 24), [-1, 1]], [frameOfStep(170, 24), [0, 0]], [frameOfStep(190, 24), [0, 0, 1]]],
    'forward (camera yaw 0 looks along +z), then forward and to the camera\'s right, a stop, and a jump on its step');
  assert.equal(walk.take, 'take-1'); assert.equal(walk.by, 'puppet');
  // the camera turned a quarter turn: forward is +x now
  const turned = puppetTracks(puppetLog({ keys: [[10, 70, 'KeyW']], yaw: [[100, Math.PI / 2]] })).find((t) => t.type === 'move');
  assert.deepEqual(turned.keys.map((k) => k[1]), [[1.4, 0], [0, 0]]);
  // still walking when the take stops: a last key stops her
  const cut = puppetTracks(puppetLog({ steps: 60, keys: [[10, 999, 'KeyW']] })).find((t) => t.type === 'move');
  assert.deepEqual(cut.keys.at(-1), [frameOfStep(160, 24), [0, 0]]);
  assert.deepEqual(puppetTracks(puppetLog({ keys: [] })), [], 'a take nobody touched keeps nothing');
});

test('a puppet take: the eyes turn while a look key is held, are thinned, and are given back; gestures are clips as long as their slots', () => {
  const take = puppetLog({ steps: 200, keys: [[10, 70, 'ArrowLeft'], [100, 104, 'KeyR'], [120, 124, 'Digit2'], [140, 144, 'Digit1'], [150, 180, 'ArrowUp']] });
  const tracks = puppetTracks(take), gaze = tracks.find((t) => t.path === 'props.gaze'), act = tracks.find((t) => t.type === 'animation');
  assert.equal(gaze.release, true);
  const samples = puppetSamples(take);
  assert.ok(samples[69].gaze[0] > 0.9 && samples[69].gaze[1] === 0, `left on the keys is her left: yaw up to its limit (${samples[69].gaze})`);
  assert.equal(samples[105].gaze, null, 'R gives her eyes back');
  assert.ok(gaze.keys.length < 12, `a steady turn and a hold are a few keys, not one a step (${gaze.keys.length})`);
  assert.deepEqual(gaze.keys.filter((k) => k[1] === null).map((k) => k[0]), [frameOfStep(200, 24), frameOfStep(300, 24)], 'a null key where she lets go, and at the end of the take');
  assert.deepEqual(act.clips.map((c) => [c.slot, c.start, c.end - c.start]), [['nod', frameOfStep(220, 24), 24], ['greet', frameOfStep(240, 24), 48]], 'the second and first gestures, each its slot\'s length');
  assert.equal(act.release, true);
  assert.equal(serialize({ format: 'vrmxs', version: 1, id: 'x', assets: [], nodes: [], connections: [], t: tracks }), serialize({ format: 'vrmxs', version: 1, id: 'x', assets: [], nodes: [], connections: [], t: puppetTracks(structuredClone(take)) }), 'the same log, the same tracks');
});

test('a director take: her line, face, gesture and look are tracks; a goal is a decisions key and gives her the actor\'s brain', () => {
  const ai = [
    { step: 610, agent: 'hana-1', kind: 'request', bb: { director: { pending: 'hana-1#1' } }, meta: { heard: { from: 'user', text: 'Say hello to Mira.' } } },
    { step: 630, agent: 'hana-1', kind: 'decision', actions: [{ do: 'think', args: { on: false } }, { do: 'emote', args: { name: 'happy' } }, { do: 'say', args: { text: 'Hello, Mira! Good to see you.', topic: 'chat' } }, { do: 'gesture', args: { slot: 'greet' } }, { do: 'lookAt', args: { target: 'mira' } }], bb: {} },
    { step: 800, agent: 'hana-1', kind: 'decision', goal: { name: 'goTo', params: { target: 'mira' } }, actions: [{ do: 'lookAt', args: {} }], bb: {} },
    { step: 2000, agent: 'hana-1', kind: 'decision', actions: [{ do: 'say', args: { text: 'Too late.' } }], bb: {} },
  ];
  const take = makeTake({ id: 'take-2', kind: 'director', target: 'hana-1', fps: 24, start: 600, end: 1200, setup: { slots: { greet: 1.5 } }, log: { ai } });
  const { tracks, cast, heard } = directorTracks(take), by = Object.fromEntries(tracks.map((t) => [t.type, t]));
  assert.deepEqual(tracks.map((t) => `${t.id}:${t.type}`), ['hana-1-says-take-2:dialogue', 'hana-1-face-take-2:expression', 'hana-1-act-take-2:animation', 'hana-1-eyes-take-2:lookAt', 'hana-1-decisions-take-2:decisions']);
  const f = Math.ceil(frameOfStep(630, 24));
  assert.deepEqual(by.dialogue.clips, [{ start: f, end: f + Math.ceil((0.4 + 6 * 0.32) * 24), text: 'Hello, Mira! Good to see you.' }], 'the line after the take ended is not in it');
  assert.deepEqual(by.expression.keys.happy.map((k) => k[0] - f), [0, 8, 56, 72], 'her face rises, holds for the line and falls');
  assert.deepEqual(by.animation.clips.map((c) => [c.slot, c.start, c.end]), [['greet', f, f + 36]]);
  assert.deepEqual(by.lookAt.clips, [{ start: f, end: Math.ceil(frameOfStep(800, 24)), at: 'mira' }], 'she looks at Mira until she is told to look away');
  assert.deepEqual(by.decisions.keys, [[frameOfStep(800, 24), { kind: 'decision', goal: { name: 'goTo', params: { target: 'mira' } } }]], 'the goal lands on its own step');
  assert.deepEqual(cast, { 'hana-1': { behaviours: [{ use: 'brain', preset: 'actor' }] } });
  assert.deepEqual(heard, [{ frame: Math.ceil(frameOfStep(610, 24)), text: 'Say hello to Mira.' }]);
  const talkOnly = directorTracks({ ...take, log: { ai: ai.slice(0, 2) } });
  assert.equal(talkOnly.cast, null, 'a take with no goal needs no brain in the film');
  assert.deepEqual(checkSequence({ fps: 24, duration: 600, tracks }), []);
});

test('a face take: the synthetic session blinks, smiles, lifts her brows, talks, winks and turns her head, from rest and back to it', () => {
  const start = 1200, face = syntheticFace({ start, seconds: 9, fps: 15 });
  const take = makeTake({ id: 'take-3', kind: 'face', target: 'mira', fps: 24, start, end: start + 560, setup: { source: 'synthetic' }, log: { face } });
  const samples = faceSamples(take), peak = (name, a, b) => Math.max(...samples.filter((s) => s.step >= start + a * 60 && s.step <= start + b * 60).map((s) => s.expressions[name]));
  assert.ok(samples[0].step >= start + 55, `her face waits for the resting face: the first second (${samples[0].step - start} steps)`);
  assert.ok(peak('blink', 1.5, 1.9) > 0.8 && peak('blink', 2.2, 3.2) < 0.05, 'a blink shuts her eyes, and they open again');
  assert.ok(peak('happy', 2.4, 3.5) > 0.6 && peak('happy', 4.5, 6) < 0.05, 'the smile is a smile; the resting smile (0.1) is none');
  assert.ok(peak('surprised', 4.4, 5) > 0.3 && peak('angry', 5.6, 6.1) > 0.25, 'brows up, then down');
  assert.ok(peak('aa', 6.3, 7.6) > 0.4, 'she talks');
  assert.ok(peak('blinkRight', 7.9, 8.4) > 0.6 && peak('blinkLeft', 7.9, 8.4) < 0.15, 'the person\'s left wink is her right eye, as in a mirror');
  assert.ok(Math.max(...samples.map((s) => Math.abs(s.head[0]))) > 0.3, 'her head turns');
  const tracks = faceTracks(take), ex = tracks.find((t) => t.type === 'expression'), head = tracks.find((t) => t.path === 'props.head');
  assert.deepEqual(tracks.map((t) => [t.id, t.release]), [['mira-face-take-3', true], ['mira-head-take-3', true]]);
  for (const [name, keys] of Object.entries(ex.keys)) { assert.equal(keys[0][1], 0, `${name} starts at rest`); assert.equal(keys.at(-1)[1], 0, `${name} ends at rest`); assert.ok(keys.length < samples.length / 2, `${name} is thinned (${keys.length} of ${samples.length})`); }
  assert.deepEqual(head.keys[0][1], [0, 0, 0]); assert.deepEqual(head.keys.at(-1)[1], [0, 0, 0]);
  assert.ok(head.keys.at(-1)[0] > frameOfStep(samples.at(-1).step, 24), 'back at rest a moment after the last sample');
  // not mirrored: the same wink is her left eye, and her head turns the other way
  const plain = faceSamples({ ...take, setup: { mirror: false } });
  assert.ok(Math.max(...plain.map((s) => s.expressions.blinkLeft)) > 0.6);
  assert.equal(plain.find((s) => s.head[0] !== 0).head[0], -samples.find((s) => s.head[0] !== 0).head[0]);
  // only some channels
  assert.deepEqual(Object.keys(faceSamples({ ...take, setup: { channels: ['smile'] } })[0].expressions), ['happy']);
  assert.equal(faceTracks({ ...take, setup: { channels: ['smile'] } }).length, 1);
  // a resting face given with the take: her face follows from the first sample
  const f = new FaceFilter({ neutral: { jaw: 0.05, smile: 0.1, browUp: 0.12, browDown: 0.05, yaw: 0, pitch: 0, roll: 0 } });
  f.push(face[0]); assert.equal(f.ready, true);
});

test('face samples from blendshape scores and from the shell\'s feature frames', () => {
  const s = faceFromBlendshapes({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.1, jawOpen: 0.4, mouthSmileLeft: 0.6, mouthSmileRight: 0.8, browInnerUp: 0.2, browOuterUpLeft: 0.5, browOuterUpRight: 0.7, browDownLeft: 0.3, browDownRight: 0.1 }, { yaw: 0.2, pitch: -0.1 });
  assert.deepEqual(s, { blinkL: 0.9, blinkR: 0.1, jaw: 0.4, smile: 0.7, browUp: 0.6, browDown: 0.3, yaw: 0.2, pitch: -0.1, roll: 0 });
  assert.equal(faceFromFeatures({ face: null }), null);
  assert.equal(faceFromFeatures({ face: { x: 0, y: 0, w: 0.3, yaw: 0.1, pitch: 0, roll: 0 } }), null, 'a face with no shape (the camera without the face take\'s landmarks) is no sample');
  assert.deepEqual(faceFromFeatures({ face: { yaw: 9, pitch: 9, roll: 9, shape: { blinkL: 1, blinkR: 0, jaw: 0.5, smile: 0.25, browUp: 0.1, browDown: 0, yaw: 0.1, pitch: 0.2, roll: -0.1 } } }),
    { blinkL: 1, blinkR: 0, jaw: 0.5, smile: 0.25, browUp: 0.1, browDown: 0, yaw: 0.1, pitch: 0.2, roll: -0.1 });
});

test('a take document is checked: its kind, its steps, and that its log is its own', () => {
  assert.deepEqual(checkTake(sampleTakes[0]), []);
  assert.match(checkTake({ ...sampleTakes[0], end: sampleTakes[0].end + 1 }).join(), /log\.input has 520 steps, the take 521/);
  assert.match(checkTake({ ...sampleTakes[1], target: 'mira' }).join(), /every event has a step and is the target's/);
  assert.match(checkTake({ ...sampleTakes[2], kind: 'mime' }).join(), /kind "mime"/);
  assert.throws(() => makeTake({ id: 'take 1', kind: 'face', target: 'mira', fps: 24, start: 5, end: 5, log: { face: [] } }), /id: letters[\s\S]*ends after it starts/);
  assert.throws(() => takeTracks({ format: 'vrmxg-take' }), /format is "vrmxg-take"/);
});

test('the sample\'s three logs give their golden tracks, and the film with them kept its golden text', () => {
  let film = parse(read('sequences/the-regular.vrmxs'));
  for (const take of sampleTakes) {
    const { tracks } = takeTracks(take);
    assert.equal(hashValue(tracks), golden.takes[take.id], `${take.id} (${take.kind}): its tracks' hash (acceptance/results/m4-takes.json has the same)`);
    film = withTake(film, take);
  }
  assert.equal(hashValue(serialize(film)), golden.film);
  const set = parse(read(film.set));
  assert.deepEqual(checkSequence(film.sequence, { nodeIds: new Set([...set.nodes, ...film.nodes].map((n) => n.id)) }), []);
  composeSequence(film, set);
  assert.deepEqual(takesOf(film.sequence).map((t) => [t.id, t.kind, t.target, t.tracks.length]), [['take-1', 'puppet', 'mira', 3], ['take-2', 'director', 'hana-1', 4], ['take-3', 'face', 'mira', 2]]);
  assert.equal(nextTakeId(film.sequence), 'take-4');
  assert.equal(nextTakeId(film.sequence, ['take-9', 'notes']), 'take-10', 'past the logs already in the project too');
});

test('keeping a take is one undo step; undo gives the film back byte for byte; removing one is a step too', () => {
  const text = read('sequences/the-regular.vrmxs'), set = parse(read('cafe.vrmxs'));
  const s = new EditorSession({ registry: m0Registry(), text, path: 'sequences/the-regular.vrmxs' });
  s.setDoc = set; s.targetIds = () => new Set(set.nodes.map((n) => n.id));
  const base = s.text();
  const k1 = keepTake(s, sampleTakes[0], { name: 'Mira' });
  assert.equal(k1.label, 'Take 1: Mira, puppet (8.7 s)');
  assert.deepEqual(k1.tracks, ['mira-walk-take-1', 'mira-gaze-take-1', 'mira-act-take-1']);
  assert.equal(s.history().undo, k1.label); assert.equal(s.history().undoDepth, 1, 'one step');
  assert.equal(s.validate().ok, true, JSON.stringify(s.validate().errors));
  const with1 = s.text();
  assert.equal(parse(with1).sequence.tracks.at(-3).id, 'mira-walk-take-1', 'a take\'s tracks go after the film\'s own');
  const k2 = keepTake(s, sampleTakes[1], { name: 'Hana' });
  assert.equal(k2.label, 'Take 2: Hana, director (10 s)');
  assert.deepEqual(s.doc.sequence.cast['hana-1'].behaviours, [{ use: 'brain', preset: 'actor' }], 'she was given a goal: the film casts her with the actor\'s brain');
  assert.equal(s.validate().ok, true, JSON.stringify(s.validate().errors));
  assert.equal(s.history().undoDepth, 2);
  s.undo();
  assert.equal(s.text(), with1, 'undo takes the whole take out: tracks and cast');
  s.undo();
  assert.equal(s.text(), base, 'and the film is as it was, byte for byte');
  s.redo(); s.redo();
  assert.deepEqual(takesOf(s.doc.sequence).map((t) => t.id), ['take-1', 'take-2']);
  // removing the director take puts her cast back; the puppet take stays
  const r = removeTake(s, 'take-2');
  assert.equal(r.label, 'Remove take 2');
  assert.equal(s.text(), with1);
  assert.throws(() => removeTake(s, 'take-2'), /no take "take-2"/);
  // keeping the same take again replaces it (no second copy), and a take with nothing in it is refused
  keepTake(s, sampleTakes[0], { name: 'Mira' });
  assert.equal(s.text(), with1);
  const empty = makeTake({ id: 'take-9', kind: 'face', target: 'mira', fps: 24, start: 10, end: 20, log: { face: [] } });
  assert.throws(() => keepTake(s, empty), /recorded nothing to keep/);
  assert.throws(() => withTake(s.doc, { ...sampleTakes[2], target: 'nobody' }, { nodeIds: s.targetIds() }), /target "nobody" isn't in the scene/);
  assert.equal(withoutTake(withTake(parse(base), sampleTakes[2]), 'take-3').sequence.tracks.length, parse(base).sequence.tracks.length);
});

test('a director take\'s brain: given only to a character who has none, and only that brain is taken away again', () => {
  const base = parse(read('sequences/the-regular.vrmxs')), director = sampleTakes[1];
  const brainOf = (doc) => doc.sequence.cast['hana-1'].behaviours, decisions = (doc, id) => doc.sequence.tracks.find((t) => t.take === id && t.type === 'decisions');
  // she has no brain: the take gives her the actor's and says so on its decisions track
  const kept = withTake(base, director);
  assert.deepEqual(brainOf(kept), [{ use: 'brain', preset: 'actor' }]);
  assert.equal(decisions(kept, 'take-2').cast, 'actor');
  assert.deepEqual(brainOf(withoutTake(kept, 'take-2')), [], 'removed with the take that gave it');
  assert.equal(serialize(withoutTake(kept, 'take-2')), serialize(base));
  assert.equal(decisions(withTake(kept, director), 'take-2').cast, 'actor', 'kept again, the take still answers for the brain');
  // she already has the actor's brain (the person cast her so): the take leaves it, and so does removing the take
  const own = structuredClone(base);
  own.sequence.cast['hana-1'].behaviours = [{ use: 'brain', preset: 'actor' }];
  const over = withTake(own, director);
  assert.equal(decisions(over, 'take-2').cast, undefined, 'the take did not give her this brain');
  assert.deepEqual(brainOf(withoutTake(over, 'take-2')), [{ use: 'brain', preset: 'actor' }], 'her own brain is still hers');
  assert.equal(serialize(withoutTake(over, 'take-2')), serialize(own));
  // another brain altogether is never touched either
  const host = structuredClone(base);
  host.sequence.cast['hana-1'].behaviours = [{ use: 'brain', preset: 'host' }];
  assert.deepEqual(brainOf(withoutTake(withTake(host, director), 'take-2')), [{ use: 'brain', preset: 'host' }]);
  // two director takes: the first gave the brain; removing it hands the brain to the second, and removing that takes it away
  const second = { ...structuredClone(director), id: 'take-7' };
  const two = withTake(kept, second);
  assert.equal(decisions(two, 'take-2').cast, 'actor'); assert.equal(decisions(two, 'take-7').cast, undefined);
  const one = withoutTake(two, 'take-2');
  assert.deepEqual(brainOf(one), [{ use: 'brain', preset: 'actor' }], 'the second take\'s decisions still need it');
  assert.equal(decisions(one, 'take-7').cast, 'actor', 'and it answers for the brain now');
  assert.deepEqual(brainOf(withoutTake(one, 'take-7')), []);
  assert.deepEqual(brainOf(withoutTake(two, 'take-7')), [{ use: 'brain', preset: 'actor' }], 'removing the second first leaves the first\'s brain');
});
