// M2 W0 (AB-T-0523): the track core, pure (keys, eases, holds, blends, animation weights) and played by an
// AnimationPlayer in a SceneTree (properties, transforms, events, loop, seek, snapshot and restore, jump = play).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPortableMath } from '@vrmxg/dmath';
import { m0Registry } from '@vrmxg/registry/m0';
import { SceneTree } from '@vrmxg/core';
import { captureWorld, restoreWorld, worldHashes, hashValue } from '@vrmxg/snapshot';
import { sampleKeys, sampleAnimation, evaluateTrack, eventsBetween, heldFrame, checkTrack, cubicBezier, installTracks } from '@vrmxg/tracks';

installPortableMath();
const close = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('keys: linear between keys, held outside, eased into a key, step keys, colours and arrays blend', () => {
  const k = [[0, 0], [10, 1], [20, 1], [30, 5, 'step']];
  assert.equal(sampleKeys(k, -5), 0); assert.equal(sampleKeys(k, 99), 5);
  close(sampleKeys(k, 5), 0.5);
  assert.equal(sampleKeys(k, 25), 1, 'a step key holds the previous value until it');
  assert.equal(sampleKeys(k, 30), 5);
  close(sampleKeys([[0, 0], [10, 1, 'easeInOut']], 5), 0.5);
  close(sampleKeys([[0, 0], [10, 1, 'easeIn']], 5), 0.125);
  assert.equal(sampleKeys([[0, '#000000'], [10, '#ff8000']], 5), '#804000');
  assert.deepEqual(sampleKeys([[0, [0, 0, 0]], [4, [4, 8, -4]]], 1), [1, 2, -1]);
  assert.equal(sampleKeys([[0, 'a'], [10, 'b']], 9), 'a', 'strings hold');
  assert.equal(sampleKeys(k, 5, { interp: 'step' }), 0);
  close(cubicBezier([0, 0, 1, 1], 0.3), 0.3, 1e-8);
  close(cubicBezier([0.42, 0, 0.58, 1], 0.5), 0.5, 1e-8);
});

test('holds on twos and threes; transforms slerp; expressions per name', () => {
  assert.equal(heldFrame({ step: 2 }, 7), 6); assert.equal(heldFrame({ step: 3 }, 8.9), 6); assert.equal(heldFrame({}, 7.5), 7.5);
  const t = { type: 'property', target: 'x', path: 'props.v', step: 2, keys: [[0, 0], [10, 10]] };
  assert.equal(evaluateTrack(t, 5), 4); assert.equal(evaluateTrack(t, 4), 4);
  const half = Math.SQRT1_2;
  const tr = evaluateTrack({ type: 'transform', target: 'x', keys: [[0, { p: [0, 0, 0], q: [0, 0, 0, 1] }], [10, { p: [2, 0, 0], q: [0, half, 0, half] }]] }, 5);
  assert.deepEqual(tr.p, [1, 0, 0]);
  close(tr.q[1], Math.sin(Math.PI / 8), 1e-12); close(tr.q[3], Math.cos(Math.PI / 8), 1e-12);
  assert.deepEqual(evaluateTrack({ type: 'expression', target: 'h', keys: { happy: [[0, 0], [10, 1]], blink: [[0, 1]] } }, 5), { happy: 0.5, blink: 1 });
});

test('animation: clips cross-fade by their blend-ins, the track fades against locomotion, times in seconds', () => {
  const tr = { type: 'animation', target: 'mira', clips: [{ start: 0, end: 60, slot: 'idle', blendIn: 10 }, { start: 40, end: 90, clip: 'wave', blendIn: 10, blendOut: 15, speed: 2 }] };
  assert.equal(sampleAnimation(tr, -1, 30), null);
  const a = sampleAnimation(tr, 5, 30);
  close(a.weight, 0.5); assert.deepEqual(a.clips.map((c) => [c.slot ?? c.clip, c.weight]), [['idle', 1]]);
  const b = sampleAnimation(tr, 45, 30);
  close(b.weight, 1);
  assert.deepEqual(b.clips.map((c) => c.slot ?? c.clip), ['idle', 'wave']);
  close(b.clips[0].weight, 0.5); close(b.clips[1].weight, 0.5); close(b.clips[1].time, (5 / 30) * 2);
  const c = sampleAnimation(tr, 81, 30);
  close(c.weight, 9 / 15, 1e-12); assert.deepEqual(c.clips.map((x) => x.clip), ['wave']);
  assert.equal(sampleAnimation({ ...tr, step: 2 }, 45, 30).clips[1].time, (4 / 30) * 2, 'held on twos');
});

test('events fire once as playback crosses them; checks catch bad tracks', () => {
  const ev = { type: 'event', keys: [[10, { target: 'd', call: 'open' }], [20, { emit: 'cue' }]] };
  assert.deepEqual(eventsBetween(ev, 0, 10).map((e) => e.frame), [10]);
  assert.deepEqual(eventsBetween(ev, 10, 30).map((e) => e.frame), [20]);
  assert.deepEqual(eventsBetween(ev, 10, 19.9), []);
  assert.deepEqual(checkTrack({ id: 't', type: 'property', keys: [[5, 1], [2, 0]] }), ['t: a property track needs a target', 't: a property track needs a path', 't: property keys aren\'t in frame order (5 then 2)']);
  assert.deepEqual(checkTrack({ id: 'a', type: 'animation', target: 'm', clips: [{ start: 5, end: 5, slot: 'idle', clip: 'x' }] }), ['a: a clip must end after it starts (5 → 5)', 'a: an animation clip names a slot or a clip, one of them']);
  assert.deepEqual(checkTrack({ id: 'x', type: 'wobble' }), ['x: unknown type "wobble" (property, transform, expression, event, audio, animation)']);
});

// A tree with a lamp (a PointLight whose intensity a track keys), a crate a transform track moves, a marker an event
// hides, and the player.
function world(playerProps = {}) {
  const tree = new SceneTree({ registry: m0Registry(), seed: 1 });
  installTracks(tree);
  tree.instantiate({ format: 'vrmxs', version: 1, id: 'w0', nodes: [
    { id: 'root', type: 'Node3D' },
    { id: 'lamp', type: 'PointLight', parent: 'root', props: { intensity: 1 } },
    { id: 'crate', type: 'Node3D', parent: 'root' },
    { id: 'flag', type: 'Marker', parent: 'root' },
    { id: 'player', type: 'AnimationPlayer', parent: 'root', props: { fps: 30, autoplay: true, ...playerProps, tracks: [
      { id: 'light', type: 'property', target: 'lamp', path: 'props.intensity', keys: [[0, 1], [30, 4, 'easeOut'], [60, 0]] },
      { id: 'move', type: 'transform', target: 'crate', step: 2, keys: [[0, { p: [0, 0, 0] }], [60, { p: [3, 0, 0] }]] },
      { id: 'ev', type: 'event', keys: [[45, { target: 'flag', call: 'hide' }], [50, { emit: 'halfway' }]] },
    ] } },
  ] });
  const log = [];
  const emit = tree.emit.bind(tree);
  tree.emit = (n, s, p) => { log.push(`${tree.clock.step}:${n.id}.${s}${p?.name ? `:${p.name}` : ''}`); return emit(n, s, p); };
  return { tree, log };
}

test('an AnimationPlayer plays on the step clock: props, transforms on twos, events once, finished at its end', () => {
  const { tree, log } = world();
  const lamp = tree.find('lamp'), crate = tree.find('crate'), flag = tree.find('flag');
  tree.run(61); // steps 0–60: frame 30 at 30 fps is applied on step 60
  close(lamp.props.intensity, 4, 1e-12);
  assert.equal(crate.object3d.position.x, 1.5, 'frame 30 on twos');
  tree.run(30); // frame 45 (step 90): the hide
  assert.equal(tree.scaleOf(flag) === 0 || flag.hidden || !flag.object3d.visible, true, 'the event hid the flag');
  tree.run(40); // past the end (frame 60 = step 120)
  close(lamp.props.intensity, 0, 1e-12); assert.equal(crate.object3d.position.x, 3);
  assert.deepEqual(log.filter((l) => /player\./.test(l)), ['100:player.event:halfway', '120:player.finished']); // (started fired during instantiate, before the log)
  assert.equal(tree.find('player').playback.playing, false);
});

test('jumping to a frame shows what playing to it shows; snapshot and restore replay identically; loop and seek', () => {
  const played = world(); played.tree.run(85);
  const jumped = world({ autoplay: false }); jumped.tree.find('player').seek({ frame: 42 });
  const hashLamp = (t) => hashValue([t.find('lamp').props.intensity, t.find('crate').object3d.position.toArray()]);
  assert.equal(hashLamp(jumped.tree), hashLamp(played.tree), 'frame 42 (step 84 applied at step 84) jumped or played');
  const a = world(); a.tree.run(50);
  const snap = captureWorld(a.tree);
  a.tree.run(70); const ha = hashValue(worldHashes(a.tree));
  const b = world(); restoreWorld(b.tree, snap); b.tree.run(70);
  assert.equal(hashValue(worldHashes(b.tree)), ha, 'restored mid-play, the rest replays bit for bit');
  const l = world({ loop: true }); l.tree.run(130);
  assert.equal(l.tree.find('player').playback.playing, true, 'a loop keeps playing');
  close(l.tree.find('player').playback.frame, 4.5, 1e-9);
});
