// M6 W4 (AB-T-0647): the default animation set is whole. Runs everywhere: each clip's file is there with the SHA-256
// animations.json gives, is a VRMC_vrm_animation 1.0 GLB, CC0 and from mesh2motion; every slot names a clip of the
// document; the default set fills idle and the movement, posture, item and gesture slots the engine's characters play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CLIPS, SETS } from '../tools/starter-clips.mjs';

const root = path.join(import.meta.dirname, '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'animations.json'), 'utf8'));
const prov = JSON.parse(fs.readFileSync(path.join(root, 'animations/provenance.json'), 'utf8'));
const glbJson = (b) => JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());

test('every clip is there, with its SHA-256, a VRMC_vrm_animation 1.0 GLB, CC0, from mesh2motion', () => {
  assert.equal(doc.format, 'vrmxa-animations');
  assert.equal(doc.clips.length, CLIPS.length);
  for (const c of doc.clips) {
    const b = fs.readFileSync(path.join(root, c.file));
    assert.equal(createHash('sha256').update(b).digest('hex'), c.sha256, c.file);
    const j = glbJson(b);
    assert.equal(j.extensions?.VRMC_vrm_animation?.specVersion, '1.0', c.file);
    assert.ok(j.extensions.VRMC_vrm_animation.humanoid.humanBones.hips, `${c.file}: hips`);
    assert.equal(j.animations.length, 1);
    assert.equal(c.licence, 'CC0-1.0');
    assert.match(c.source, /^mesh2motion /);
    assert.equal(c.rootMotion, 'inPlace');
  }
  assert.deepEqual(prov.clips.map((p) => p.file).sort(), doc.clips.map((c) => c.file).sort());
  for (const p of prov.clips) assert.ok(p.limbErrorDegrees < 1, `${p.file}: the retarget's limbs agree with mesh2motion's (${p.limbErrorDegrees}°)`);
});

test('every slot names a clip of the document, and the default set fills what the engine plays', () => {
  const shas = new Set(doc.clips.map((c) => c.sha256));
  for (const s of doc.sets) for (const [slot, list] of Object.entries(s.slots)) for (const e of list) assert.ok(shas.has(e.clip), `${s.id}.${slot}`);
  const def = doc.sets.find((s) => s.default);
  for (const slot of ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'sit', 'sitIdle', 'stand', 'getUp', 'talk', 'use', 'equip', 'carry', 'greet', 'wave', 'nod', 'cheer', 'sip']) assert.ok(def.slots[slot]?.length, `default fills ${slot}`);
  // the move clips carry the ground speed they were measured at on Spec (VRMXA §8.4), walk slower than run
  const speed = (slot) => doc.clips.find((c) => c.sha256 === def.slots[slot][0].clip).speed;
  assert.ok(speed('walk') > 0.5 && speed('walk') < speed('run'), `walk ${speed('walk')} m/s, run ${speed('run')} m/s`);
  assert.deepEqual(doc.sets.map((s) => s.id), SETS.map((s) => s.id));
  // a slot is VRMXA's vocabulary, an engine slot the sample uses too (wave, cheer, sip, getUp, carry, hold), or x-
  const known = /^(idle|walk|run|jump|fall|land|sit|sitIdle|stand|talk|listen|think|greet|nod|shake|shrug|point|laugh|bow|clap|emote\.(happy|angry|sad|relaxed|surprised)|equip|unequip|use|wave|cheer|sip|getUp|carry|hold|x-[a-z0-9]+\.[A-Za-z0-9]+)$/;
  for (const s of doc.sets) for (const slot of Object.keys(s.slots)) assert.match(slot, known);
});
