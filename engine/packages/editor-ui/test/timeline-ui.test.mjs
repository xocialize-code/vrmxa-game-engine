// What the timeline panel emits (M4 W5): every command a move, trim, nudge, delete, form or field becomes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemLabel, moveCommand, removeCommand, fieldCommand, trackSpec, clipSpec, keyCommand, nudgeCommand, isSelected, selectionOf, parseValue, needsTarget, timelineKey } from '../src/index.js';

const shotRow = { id: 'shots' }, camRow = { id: 'cams' }, faceRow = { id: 'hana-1-face' };
const shot = { kind: 'shot', id: 'shot-1', index: 0, start: 10, end: 58, label: '010' };
const clip = { kind: 'clip', index: 2, start: 24, end: 48, label: 'vc-wide' };
const key = { kind: 'key', index: 1, channel: 'happy', start: 30, label: 'happy' };

test('labels are what accessibility and the scenarios read', () => {
  assert.equal(itemLabel(shot), 'Shot 010 10 to 58');
  assert.equal(itemLabel(clip), 'Clip vc-wide 24 to 48');
  assert.equal(itemLabel(key), 'Key happy at 30');
  assert.equal(itemLabel({ kind: 'key', start: 5, label: '' }), 'Key at 5');
});

test('a move, a trim and a no-op', () => {
  assert.deepEqual(moveCommand(shotRow, shot, 12, 60), ['moveShot', 'shot-1', { start: 12, end: 60 }]);
  assert.deepEqual(moveCommand(camRow, clip, 20, 48, 'start'), ['moveClip', 'cams', 2, { start: 20 }]);
  assert.deepEqual(moveCommand(camRow, clip, 24, 50, 'end'), ['moveClip', 'cams', 2, { end: 50 }]);
  assert.equal(moveCommand(camRow, clip, 24, 48), null);
  assert.deepEqual(moveCommand(faceRow, key, 31), ['moveKey', 'hana-1-face', 1, 31, { channel: 'happy' }]);
  assert.equal(moveCommand(faceRow, key, 30), null);
});

test('arrow nudges: one frame, ten with shift, never before frame 0', () => {
  assert.deepEqual(nudgeCommand(camRow, clip, 1), ['moveClip', 'cams', 2, { start: 25, end: 49 }]);
  assert.deepEqual(nudgeCommand(faceRow, key, -1, true), ['moveKey', 'hana-1-face', 1, 20, { channel: 'happy' }]);
  // as the editor always did: the start clamps at 0 and the end still moves, so the item shortens
  assert.deepEqual(nudgeCommand(shotRow, { ...shot, start: 0, end: 4 }, -1), ['moveShot', 'shot-1', { start: 0, end: 3 }]);
});

test('selection and delete', () => {
  const s = selectionOf(faceRow, key);
  assert.deepEqual(s, { row: 'hana-1-face', kind: 'key', index: 1, channel: 'happy', id: undefined });
  assert.ok(isSelected(s, faceRow, key));
  assert.ok(!isSelected(s, faceRow, { ...key, channel: 'sad' }));
  assert.ok(isSelected(selectionOf(shotRow, shot), shotRow, { ...shot, index: 9 }), 'shots match by id');
  assert.deepEqual(removeCommand(s), ['removeKey', 'hana-1-face', 1, { channel: 'happy' }]);
  assert.deepEqual(removeCommand(selectionOf(shotRow, shot)), ['removeShot', 'shot-1']);
  assert.deepEqual(removeCommand(selectionOf(camRow, clip)), ['removeClip', 'cams', 2]);
  assert.equal(removeCommand({ row: 'cams', kind: 'row' }), null);
  assert.equal(removeCommand(null), null);
});

test('the selection panel\'s fields', () => {
  assert.deepEqual(fieldCommand(selectionOf(shotRow, shot), 'start', '12'), ['moveShot', 'shot-1', { start: 12 }]);
  assert.deepEqual(fieldCommand(selectionOf(shotRow, shot), 'name', 'Open'), ['setShot', 'shot-1', { name: 'Open' }]);
  assert.deepEqual(fieldCommand(selectionOf(camRow, clip), 'camera', 'vc-cu'), ['setClip', 'cams', 2, { camera: 'vc-cu' }]);
  const k = selectionOf(faceRow, key);
  assert.deepEqual(fieldCommand(k, 'value', '0.5'), ['setKey', 'hana-1-face', 1, { value: 0.5 }, { channel: 'happy' }]);
  assert.deepEqual(fieldCommand(k, 'ease', ''), ['setKey', 'hana-1-face', 1, { ease: null }, { channel: 'happy' }]);
  assert.deepEqual(fieldCommand(k, 'frame', '40'), ['moveKey', 'hana-1-face', 1, 40, { channel: 'happy' }]);
});

test('the forms: tracks, clips by type, keys by channel', () => {
  assert.deepEqual(trackSpec({ type: 'animation', target: 'hana-1', path: 'x' }), { type: 'animation', target: 'hana-1' });
  assert.deepEqual(trackSpec({ type: 'property', target: 'lamp', path: 'props.intensity' }), { type: 'property', target: 'lamp', path: 'props.intensity' });
  assert.deepEqual(trackSpec({ type: 'camera', target: 'hana-1' }), { type: 'camera' });
  const form = { value: '1', clipLen: '24', camera: 'vc-wide', channel: 'happy' };
  assert.deepEqual(clipSpec({ type: 'animation' }, form, 10), { start: 10, end: 34, slot: 'talk', blendIn: 6, blendOut: 6 });
  assert.deepEqual(clipSpec({ type: 'dialogue' }, { ...form, value: 'Hi there' }, 0), { start: 0, end: 24, text: 'Hi there' });
  assert.deepEqual(clipSpec({ type: 'camera' }, form, 0), { start: 0, end: 24, camera: 'vc-wide' });
  assert.deepEqual(clipSpec({ type: 'lookAt', target: 'hana-1' }, form, 0, ['hana-1', 'mira']), { start: 0, end: 24, at: 'mira' });
  assert.equal(clipSpec({ type: 'expression' }, form, 0), null);
  assert.deepEqual(keyCommand({ id: 'f', type: 'expression' }, form, 8), ['addKey', 'f', 8, 1, { channel: 'happy' }]);
  assert.deepEqual(keyCommand({ id: 'ev', type: 'event' }, { ...form, value: '{"cue":"ring"}' }, 8), ['addKey', 'ev', 8, { cue: 'ring' }, {}]);
  assert.equal(keyCommand({ id: 'c', type: 'camera' }, form, 8), null);
  assert.equal(parseValue('nope'), 'nope');
  assert.ok(needsTarget('lookAt') && !needsTarget('camera'));
});

test('the timeline\'s keys: Delete removes a selected item even after the editor\'s window listener took the key (M5 W6 review)', () => {
  const on = { active: true, selected: true };
  // the editor's listener runs first and calls preventDefault on Delete: the timeline still removes its item
  assert.deepEqual(timelineKey({ key: 'Delete', defaultPrevented: true }, on), { action: 'remove' });
  assert.deepEqual(timelineKey({ key: 'Backspace' }, on), { action: 'remove' });
  assert.deepEqual(timelineKey({ key: 'ArrowLeft' }, on), { action: 'nudge', dir: -1 });
  assert.deepEqual(timelineKey({ key: 'ArrowRight' }, { active: true }), { action: 'scrub', dir: 1 });
  assert.deepEqual(timelineKey({ key: ' ' }, { active: true }), { action: 'play' });
  assert.deepEqual(timelineKey({ key: 'Escape' }, on), { action: 'clear' });
  assert.equal(timelineKey({ key: 'Delete' }, { active: true }), null, 'nothing selected: not the timeline\'s');
  assert.equal(timelineKey({ key: 'Delete' }, { ...on, typing: true }), null);
  assert.equal(timelineKey({ key: 'Delete', metaKey: true }, on), null);
  assert.equal(timelineKey({ key: 'Delete' }, { active: false, selected: true }), null);
});

