// The shortcuts sheet lists every bound shortcut (M5 W6, AB-T-0607 item 3): this test reads where keys are bound (the
// window's handler, the Mac app's menu items, the menu events the page hears, the number field, the timeline, the
// splitters, the lists, the fly camera) and fails on any key or menu event the table doesn't list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SHORTCUTS, shortcutFor, shortcutGroups } from '../src/shortcuts.js';

const root = path.join(import.meta.dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const listed = (where, code) => SHORTCUTS.some((s) => s.where === where && s.codes?.includes(code));
/**
 * Every `key === 'X'` and `@keydown.x` in a source, as KeyboardEvent.key values in lower case. (A `switch (e.key)` with
 * `case 'X'` isn't read: none of these sources binds keys that way; three's FlyControls, which does, is read below.)
 */
function keysIn(text) {
  const out = new Set();
  for (const m of text.matchAll(/key\s*===\s*'([^']+)'/g)) out.add(m[1].toLowerCase());
  for (const m of text.matchAll(/@keydown\.([a-z]+)/g)) out.add(m[1]);
  return out;
}

test('the window binds its keys only through the table', () => {
  const app = read('apps/editor/src/App.vue');
  assert.deepEqual([...keysIn(app)], [], 'App.vue compares no keys of its own: they are SHORTCUTS entries');
  assert.match(app, /shortcutFor\(e/, 'its keydown handler asks the table');
  for (const f of fs.readdirSync(path.join(root, 'apps/editor/src'), { recursive: true }).map(String).filter((f) => /\.(js|vue)$/.test(f) && f !== 'shortcuts.js')) {
    const text = read(`apps/editor/src/${f}`);
    if (!/keydown/.test(text)) continue;
    for (const k of keysIn(text)) assert.ok(listed('window', k) || listed('list', k), `${f} binds "${k}": list it in SHORTCUTS`);
  }
});

test('a panel edge\'s arrow keys stop at the edge: the timeline (a window listener) skips a key already taken', () => {
  assert.match(read('apps/editor/src/App.vue'), /function keySplit[^\n]*e\.preventDefault\(\); e\.stopPropagation\(\)/);
  assert.match(read('engine/packages/editor-ui/src/Timeline.vue'), /function onKey\(e\) \{[^}]*e\.defaultPrevented\) return;/);
});

test('every menu event the page hears and every menu key of the Mac app is listed', () => {
  const app = read('apps/editor/src/App.vue');
  const events = [...app.matchAll(/on\('menu\.([A-Za-z]+)'/g)].map((m) => m[1]);
  assert.ok(events.length >= 8, events.join(', '));
  for (const ev of events) assert.ok(SHORTCUTS.some((s) => s.menu === ev), `menu.${ev} is bound: list it in SHORTCUTS`);
  const main = read('apps/editor-mac/Sources/VRMXGEditor/main.swift');
  const items = [...main.matchAll(/ShellMenuItem\("([^"]+)", event: "([^"]+)"(?:, key: "([^"]*)")?(?:, modifiers: \[([^\]]*)\])?/g)];
  assert.ok(items.length >= 3);
  for (const [, title, ev, key, mods] of items) {
    const s = SHORTCUTS.find((x) => x.menu === ev);
    assert.ok(s, `${title} (menu.${ev}) is a menu item: list it in SHORTCUTS`);
    if (key) {
      const want = `${/shift/.test(mods ?? '') ? '⇧' : ''}⌘${key.toUpperCase()}`;
      assert.equal(s.keys, want, `${title}'s key`);
    }
  }
});

test('the number field, timeline, splitters, lists and fly camera list their keys', () => {
  const groups = {
    number: 'engine/packages/editor-ui/src/NumberField.vue', timeline: 'engine/packages/editor-ui/src/Timeline.vue',
    splitter: 'engine/packages/editor-ui/src/panels.js', list: 'engine/packages/editor-ui/src/AssetsPanel.vue',
  };
  for (const [where, file] of Object.entries(groups)) for (const k of keysIn(read(file))) assert.ok(listed(where, k), `${file} binds "${k}": list it (where '${where}')`);
  // the splitter's arrows come from a table, not comparisons
  for (const k of ['arrowleft', 'arrowright', 'arrowup', 'arrowdown']) assert.ok(listed('splitter', k));
  for (const f of ['apps/editor/src/TreeItem.vue']) for (const k of keysIn(read(f))) assert.ok(listed('list', k), `${f} binds "${k}"`);
  const require = createRequire(path.join(root, 'apps/editor/package.json'));
  const fly = fs.readFileSync(require.resolve('three/examples/jsm/controls/FlyControls.js'), 'utf8');
  const codes = new Set([...fly.matchAll(/case '(Key[A-Z]|Arrow\w+|Shift)(?:Left|Right)?'/g)].map((m) => m[1].replace(/^Key/, '').toLowerCase()));
  assert.ok(codes.size >= 10);
  for (const k of codes) assert.ok(listed('fly', k), `FlyControls binds "${k}"`);
});

test('a key press finds its entry: the menus take theirs in the Mac app; fly and play modes leave some out', () => {
  assert.equal(shortcutFor({ key: 'w' }).action, 'gizmoMove');
  assert.equal(shortcutFor({ key: 'W' }).action, 'gizmoMove');
  assert.equal(shortcutFor({ key: 'w' }, { flying: true }), null, 'the fly camera has W');
  assert.equal(shortcutFor({ key: 'Backspace' }, { flying: true }).action, 'remove');
  assert.equal(shortcutFor({ key: 'Delete' }, { editing: false }), null);
  assert.equal(shortcutFor({ key: 'z', metaKey: true }).action, 'undo');
  assert.equal(shortcutFor({ key: 'z', metaKey: true, shiftKey: true }).action, 'redo');
  assert.equal(shortcutFor({ key: 'z', metaKey: true }, { inShell: true }), null, 'Edit › Undo has it');
  assert.equal(shortcutFor({ key: 'w', metaKey: true }), null);
  assert.equal(shortcutFor({ key: '/', ctrlKey: true }).action, 'shortcuts');
  const g = shortcutGroups();
  assert.deepEqual(g.map((x) => x.group), ['File', 'Edit', 'Viewport', 'Fly camera', 'Number fields', 'Timeline', 'Panels', 'Lists', 'Help']);
  assert.equal(g.reduce((n, x) => n + x.items.length, 0), SHORTCUTS.length);
});
