// The editor's keyboard shortcuts in one place (M5 W6, AB-T-0607 item 3): the window's own keys are bound from this
// table (App.vue's keydown handler finds the entry for a key here and runs its action), the Mac app's menu keys are
// listed beside the menu event each sends, and the keys other parts handle themselves (the number field, the
// timeline, the splitters, the fly camera) are listed with where they apply. The shortcuts sheet (Help › Keyboard
// Shortcuts) is drawn from it, and test/shortcuts.test.mjs fails when a key is bound anywhere and not listed here.
//
// An entry: { group, label, keys (as the sheet shows them), where, codes (the KeyboardEvent.key values; letters in lower
// case), cmd / shift (modifiers a window key needs), action (what the window runs), menu (the shell event the Mac app's
// menu item sends), editing (only while editing, not playing), flying: false (not while the fly camera has the keys) }.
// where: 'window' (App.vue), 'menu' (the Mac app's menu bar; in a browser the window takes the same key), 'number' (a
// number field), 'timeline', 'splitter' (a panel's edge), 'list' (a focused tree row, asset tile or folder), 'fly' (the
// fly camera's own keys, three's FlyControls), 'pointer' (mouse gestures, listed for the sheet), 'settings' (the project
// settings panel, M6 W3: its key capture takes any key).

export const SHORTCUTS = [
  { group: 'File', label: 'New Project…', keys: '⇧⌘N', where: 'menu', menu: 'newProject', codes: ['n'], cmd: true, shift: true, action: 'newProject', editing: true },
  { group: 'File', label: 'Open Project…', keys: '⇧⌘O', where: 'menu', menu: 'openProject' },
  { group: 'File', label: 'Open Recent', keys: 'File › Open Recent', where: 'menu', menu: 'openRecent', note: 'or the toolbar\'s Recent list' },
  { group: 'File', label: 'Project Settings…', keys: '⇧⌘P', where: 'menu', menu: 'projectSettings', codes: ['p'], cmd: true, shift: true, action: 'projectSettings', editing: true },
  { group: 'File', label: 'Save', keys: '⌘S', where: 'menu', menu: 'save', codes: ['s'], cmd: true, action: 'save' },
  { group: 'File', label: 'Save As…', keys: '⇧⌘S', where: 'menu', menu: 'saveAs' },
  { group: 'File', label: 'Export Game…', keys: '⇧⌘E', where: 'menu', menu: 'exportGame' },
  { group: 'Edit', label: 'Undo', keys: '⌘Z', where: 'menu', menu: 'undo', codes: ['z'], cmd: true, action: 'undo' },
  { group: 'Edit', label: 'Redo', keys: '⇧⌘Z', where: 'menu', menu: 'redo', codes: ['z'], cmd: true, shift: true, action: 'redo' },
  { group: 'Edit', label: 'Duplicate', keys: '⌘D', where: 'menu', menu: 'duplicate', codes: ['d'], cmd: true, action: 'duplicate', editing: true },
  { group: 'Edit', label: 'Copy nodes', keys: '⌘C', where: 'menu', note: 'Edit › Copy, with nodes selected and no text' },
  { group: 'Edit', label: 'Paste nodes', keys: '⌘V', where: 'menu', note: 'Edit › Paste, outside a text field' },
  { group: 'Edit', label: 'Delete the selection', keys: '⌫', where: 'window', codes: ['delete', 'backspace'], action: 'remove', editing: true },
  { group: 'Viewport', label: 'Move gizmo', keys: 'W', where: 'window', codes: ['w'], action: 'gizmoMove', editing: true, flying: false },
  { group: 'Viewport', label: 'Rotate gizmo', keys: 'E', where: 'window', codes: ['e'], action: 'gizmoRotate', editing: true, flying: false },
  { group: 'Viewport', label: 'Scale gizmo', keys: 'R', where: 'window', codes: ['r'], action: 'gizmoScale', editing: true, flying: false },
  { group: 'Viewport', label: 'Frame the selection (or everything)', keys: 'F', where: 'window', codes: ['f'], action: 'frame', editing: true, flying: false },
  { group: 'Viewport', label: 'Select / add to the selection', keys: 'Click / ⇧-click', where: 'pointer' },
  { group: 'Viewport', label: 'Orbit, pan, dolly', keys: 'Drag / right-drag / scroll', where: 'pointer' },
  { group: 'Viewport', label: 'Select inside a rectangle', keys: '⌘-drag', where: 'pointer' },
  { group: 'Viewport', label: 'Grow a shape on both sides', keys: '⌥-drag a handle', where: 'pointer' },
  { group: 'Fly camera', label: 'Forward, left, back, right', keys: 'W A S D', where: 'fly', codes: ['w', 'a', 's', 'd'] },
  { group: 'Fly camera', label: 'Up, down', keys: 'R F', where: 'fly', codes: ['r', 'f'] },
  { group: 'Fly camera', label: 'Roll', keys: 'Q E', where: 'fly', codes: ['q', 'e'] },
  { group: 'Fly camera', label: 'Pitch and turn', keys: '↑ ↓ ← →', where: 'fly', codes: ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'] },
  { group: 'Fly camera', label: 'Slower', keys: '⇧', where: 'fly', codes: ['shift'] },
  { group: 'Number fields', label: 'Step up, down (⇧ ×10, ⌥ ×0.1)', keys: '↑ ↓', where: 'number', codes: ['arrowup', 'arrowdown'] },
  { group: 'Number fields', label: 'Commit what you typed (arithmetic too)', keys: '↩', where: 'number', codes: ['enter'] },
  { group: 'Number fields', label: 'Put it back; cancel a drag', keys: 'Esc', where: 'number', codes: ['escape'] },
  { group: 'Timeline', label: 'Play, pause', keys: 'Space', where: 'timeline', codes: [' '] },
  { group: 'Timeline', label: 'A frame back, forward; nudge the selection (⇧ more)', keys: '← →', where: 'timeline', codes: ['arrowleft', 'arrowright'] },
  { group: 'Timeline', label: 'Delete the selected item', keys: '⌫', where: 'timeline', codes: ['delete', 'backspace'] },
  { group: 'Timeline', label: 'Clear the selection', keys: 'Esc', where: 'timeline', codes: ['escape'] },
  { group: 'Panels', label: 'Resize a focused panel edge (⇧ more)', keys: '← → ↑ ↓', where: 'splitter', codes: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'] },
  { group: 'Panels', label: 'Smallest, largest', keys: 'Home End', where: 'splitter', codes: ['home', 'end'] },
  { group: 'Panels', label: 'Fold or unfold', keys: '↩', where: 'splitter', codes: ['enter'] },
  { group: 'Lists', label: 'Pick the focused tree row, asset or folder', keys: '↩', where: 'list', codes: ['enter'] },
  { group: 'Project settings', label: 'Undo, redo a settings change (while the panel is open)', keys: '⌘Z ⇧⌘Z', where: 'settings' },
  { group: 'Project settings', label: 'Change a control: press its new key; Esc leaves it as it was', keys: 'Any key', where: 'settings' },
  { group: 'Help', label: 'Keyboard Shortcuts', keys: '⌘/', where: 'menu', menu: 'shortcuts', codes: ['/'], cmd: true, action: 'shortcuts' },
  { group: 'Help', label: 'Close the shortcuts sheet', keys: 'Esc', where: 'window', codes: ['escape'], action: 'closeSheet', sheet: true },
];

/**
 * The window's entry for a key press, or null. `inShell`: the Mac app's menus take their own keys (an entry with `menu`
 * is the window's only in a browser). `flying`: the fly camera has the letter keys. `editing`: not playing.
 * @param {{ key: string, metaKey?: boolean, ctrlKey?: boolean, shiftKey?: boolean, altKey?: boolean }} e
 * `sheet`: the shortcuts sheet is open (Escape closes it; an entry with `sheet` is the window's only then).
 * @param {{ inShell?: boolean, flying?: boolean, editing?: boolean, sheet?: boolean }} ctx
 */
export function shortcutFor(e, { inShell = false, flying = false, editing = true, sheet = false } = {}) {
  const key = String(e.key ?? '').toLowerCase(), cmd = !!(e.metaKey || e.ctrlKey);
  for (const s of SHORTCUTS) {
    if (!s.action || !s.codes?.includes(key)) continue;
    if (s.where !== 'window' && s.where !== 'menu') continue;
    if (s.menu && inShell) continue;
    if (!!s.cmd !== cmd || (s.cmd && !!s.shift !== !!e.shiftKey)) continue;
    if (s.editing && !editing) continue;
    if (s.flying === false && flying) continue;
    if (s.sheet && !sheet) continue;
    return s;
  }
  return null;
}

/** The sheet: the entries by group, in the table's order. */
export function shortcutGroups(list = SHORTCUTS) {
  const out = [];
  for (const s of list) {
    let g = out.find((x) => x.group === s.group);
    if (!g) out.push(g = { group: s.group, items: [] });
    g.items.push({ label: s.label, keys: s.keys, note: s.note ?? '', where: s.where });
  }
  return out;
}
