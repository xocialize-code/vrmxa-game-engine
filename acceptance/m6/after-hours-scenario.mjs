// M6 W10 (AB-T-0651), M6's exit check 6: writes the AppProbe scenario that builds the second game, "After Hours", by hand
// in the Mac editor from New Project to Export Game (apps/editor-mac/docs/hand-test/HAND-TEST-M6-AFTER-HOURS.scenario.md and
// its WebGL twin), from the build plan (content/sample/tools/after-hours-plan.mjs).
//
// The plan is run through the editor's own EditorSession here, headless, as tools/make-after-hours.mjs runs it to write
// the committed scenes (content/sample/tools/make-after-hours.mjs): beside each op this writes the steps that make it in
// the app, reading the session as it goes, so every id the editor gives, every undo step's name and the scene's hash
// after each row are the ones the app must show. A row ends by holding the app's scene hash to the session's: a step that
// lands differently fails in its own row, and the last row of each scene wants the committed file's hash.
//
// What the rows do, none of it by typing JSON:
//   - File › New Project… from "One level" ("After Hours"), in the editor's container (VRMXG_SHELL_NEW_PROJECT);
//   - the game's own files come in from outside the app, as a builder copies them into the project's folder: the shelf
//     behaviour written by hand, the lost things, the starter content's shelf, the back room, the sample's door and
//     switch, and a licence row for each (apps/editor-mac/scripts/after-hours-files.mjs, which waits beside the
//     scenario for its trigger screenshot); File › Open Recent reopens the project to see them;
//   - Project Settings names the behaviours module (the field M6 W10 adds), and the project is reopened so the editor
//     loads it and knows the shelf by its describe;
//   - the level, then the title, the won and the lost scenes: New with the scene's file name, every node from the
//     toolbar or the assets panel, given its id, name, parent, place and turn, its props by their widgets (pins where a
//     value is its default), behaviours from the Behaviours panel, connections from the Connections panel; what every
//     scene shares (the environment, the cafe, the lights, the room tone) built once in the level and brought into the
//     others with the toolbar's Copy and Paste; each scene saved, reopened from disk and compared;
//   - Project Settings: the entry scene, the game's scenes in and the template's out;
//   - File › Export Game… writes the build (VRMXG_SHELL_BUILD).
// Afterwards, outside the app: acceptance/m6/after-hours-compare.mjs holds the project's saved scenes, game.json and
// behaviours to the committed ones and plays the exported build to both endings in Node.
//
//   node acceptance/m6/after-hours-scenario.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { propFields, pinValue, idPart } from '@vrmxg/editor-ui';
import { hashValue } from '@vrmxg/snapshot';
import { afterHoursRegistry, buildScenes } from '../../content/sample/tools/make-after-hours.mjs';
import { GAME, FILES, SCENE } from '../../content/sample/tools/after-hours-plan.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const SCENARIO = path.join(root, 'apps/editor-mac/docs/hand-test/HAND-TEST-M6-AFTER-HOURS.scenario.md');
const SCENARIO_WEBGL = path.join(root, 'apps/editor-mac/docs/hand-test/HAND-TEST-M6-AFTER-HOURS-webgl.scenario.md');
const TRIGGERS = '/tmp/vrmxg-w10-after-hours';
const PROJECT = 'After Hours';
const REG = await afterHoursRegistry();
const committed = (ref) => fs.readFileSync(path.join(root, 'content/sample', ref), 'utf8');

const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
const num = (x) => String(Math.round(x * 1e6) / 1e6);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const rows = [];
let steps = [];
const row = (title) => { steps = []; rows.push({ title, steps }); };
const S = (...lines) => steps.push(...lines);
const valid = () => S('expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid');
const undoIs = (label) => S(`until find("id=undo").0.name == ${q(`Undo ${label}`)} timeout=5000`);
/** The scene in the app is the session's, byte for byte: its hash. */
const hashIs = (s, why = 'the scene so far is what the editor\'s session makes of the plan') => S(`until find("id=doc-state").0.name matches " hash ${s.hash()}$" timeout=10000   # ${why}`);
// A web view's select: focused, opened by Down, its item pressed by name (HAND-TEST-M5-LEVEL's way; AppProbe's typing
// reaches its type-ahead one letter at a time, set_value doesn't change it and `pick` sees no menu of WebKit's). Measured
// in the first full runs: now and then a Down opened nothing, or the menu closed again before its item was pressed (an
// edit schedules a rebuild of the edit view, and when it lands the inspector is drawn again). So each pick waits for the
// view to settle, then presses Down until the item is there: a menu's items are in the tree only while it is open.
const open = (target, want) => ['pause 700   # the edit before rebuilds the view, and its end redraws the inspector: an open menu would close', `act ${target} action=focus`, 'pause 900   # focus scrolls the inspector to it: a menu opened while it scrolls closes', 'keys down   # opens the select\'s menu', 'pause 600   # let it open (a second Down while it opens closes it again: slower on WebGL)', `until find("surface=app role=menuitem name='${want}' exact=true").count >= 1 do keys down tries=3   # a Down that opened nothing gets another`];
const choose = (target, find, want) => S(...open(target, want), `act surface=app role=menuitem name=${q(want)} exact=true action=press`, `until find("${find}").0.value == ${q(want)} timeout=5000`);
const pick = (id, want) => choose(`id=${id}`, `id=${id}`, want);
// a menu that resets once it has acted (Add a behaviour…, a new connection's parts): no value to wait for
const pickOnce = (id, want) => S(...open(`id=${id}`, want), `act surface=app role=menuitem name=${q(want)} exact=true action=press`, 'pause 600');
const select = (id) => S(`act id=node-${id} action=press`, `until find("id=inspector-id").0.name == "Node ${id}"`);
// focused first and given a moment: set_value types after 80 ms, and keys sent before the web view moves its focus reach
// the control focused before (a button just pressed: the toolbar Add pressed twice, an id typed into nothing)
const text = (id, value) => S(`act id=${id} action=focus`, 'pause 250', `act id=${id} action=set_value value=${q(value)}`, `until find("id=${id}").0.value == ${q(value)} timeout=5000`);
const number = (id, typed, value) => S(`act id=${id} action=set_value value=${q(typed)}${typed !== String(value) ? '   # arithmetic: the field commits its result' : ''}`, `until find("id=${id}").0.value == ${q(num(value))} timeout=5000`);
const tick = (id) => S(`act id=${id} action=press`, `until find("id=${id}").0.value == "1" timeout=5000`);
const uncheck = (id) => S(`act id=${id} action=press`, `until find("id=${id}").0.value == "0" timeout=5000`);
// a colour: typed as hex in the field beside its well (a well takes no value through accessibility)
const color = (id, value) => S(`act id=${id}--hex action=set_value value=${q(value)}   # the colour, as hex`, `until find("id=${id}--hex").0.value == ${q(value)} timeout=5000`);
const pin = (key, owner) => S(`act id=pin-${key} action=press   # the value shown is its default: the pin writes it`, `until find("id=pin-${key}").count == 0 timeout=5000`, `expect find("id=undo").0.name == ${q(`Undo Set ${owner}.${key}`)}`);
const fileId = (ref) => ref.replace(/[^A-Za-z0-9]+/g, '-');

/** One field of a registry schema (a behaviour's param, a connection's argument) set to `value` by its widget. */
function field(id, f, value) {
  if (same(value, pinValue(f)) && !f.set) { S(`act id=${id}--pin action=press   # the value shown (${JSON.stringify(value)}) written into the file`, `until find("id=${id}--clear").count == 1 timeout=5000`); return; }
  switch (f.widget) {
    case 'node': case 'enum': pick(id, value); break;
    case 'number': number(id, String(value), value); break;
    case 'boolean': (value ? tick : uncheck)(id); break;
    default: text(id, value);
  }
}
// a condition in a struct field: its test, then its own fields (as HAND-TEST-M5-LEVEL builds the Morning Rush's)
function condition(id, c, { unset = false } = {}) {
  // an unset condition shows its test as state but has no fields yet: picking another test and state again gives it them
  if (unset && c.test === 'state') { pick(`${id}-test`, 'all'); pick(`${id}-test`, 'state'); }
  if (c.test !== 'state') pick(`${id}-test`, c.test);
  // picking any or all makes its list with one row in it: rows after the first are added
  if (c.test === 'any' || c.test === 'all') { c.of.forEach((x, i) => { if (i) S(`act id=${id}-of--add action=press`); S(`until find("id=${id}-of-${i}").count == 1 timeout=5000`); condition(`${id}-of-${i}`, x); }); return; }
  S('pause 500   # a row just made: let it settle before its "new" placeholder is replaced (typed too soon, the value lands after it)');
  text(`${id}-key`, c.key);
  if (c.op) pick(`${id}-op`, c.op);
  if (c.value !== undefined) { if (typeof c.value === 'number') number(`${id}-value`, String(c.value), c.value); else text(`${id}-value`, c.value); }
}
/** A Dialogue's lines, row by row: each line's fields, its condition, its choices. */
function lines(list) {
  list.forEach((l, i) => {
    const L = `prop-lines-${i}`;
    S('act id=prop-lines--add action=press', `until find("id=prop-lines").0.name == "lines, ${i + 1} ${i ? 'rows' : 'row'}" timeout=5000`, 'pause 500');
    if (l.id) text(`${L}-id`, l.id);
    if (l.speaker) text(`${L}-speaker`, l.speaker);
    text(`${L}-text`, l.text);
    if (l.next) text(`${L}-next`, l.next);
    if (l.when) { S(`act id=${L}-when--set action=press`); condition(`${L}-when`, l.when); }
    (l.choices ?? []).forEach((c, k) => {
      const C = `${L}-choices-${k}`;
      S(k === 0 ? `act id=${L}-choices--set action=press` : `act id=${L}-choices--add action=press`, `until find("id=${C}").count == 1 timeout=5000`, 'pause 500');
      if (c.id) text(`${C}-id`, c.id);
      text(`${C}-text`, c.text);
      if (c.to) text(`${C}-to`, c.to);
    });
  });
}
/** A struct of name lists (GameRules' reads): each key unfolded, its kind a list, its rows typed. */
function nameLists(id, value) {
  for (const [k, list] of Object.entries(value)) {
    S(`act id=${id}-${k}--set action=press`, `until find("id=${id}-${k}").count == 1 timeout=5000`, 'pause 300');
    list.forEach((name, i) => { S(`act id=${id}-${k}--add action=press`, `until find("id=${id}-${k}-${i}").count == 1 timeout=5000`, 'pause 300'); text(`${id}-${k}-${i}`, name); });
  }
}

/** One prop of node `id` (its state before the edit is `before`) set by the inspector's widget for it. */
function prop(n, key, value) {
  const f = propFields(REG.get(n.type).props, n.props ?? {}).find((x) => x.key === key);
  if (!f) throw new Error(`${n.type} has no prop ${key}`);
  const id = `prop-${key}`;
  if (same(value, pinValue(f)) && !f.set && f.default !== undefined) { pin(key, n.id); return; }
  if (key === 'lines') return lines(value);
  if (key === 'reads') { S(`until find("id=${id}").count == 1 timeout=5000`); return nameLists(id, value); }
  if (key === 'lose' || key === 'when' || key === 'win') return condition(id, value, { unset: n.props?.[key] === undefined });
  switch (f.widget) {
    case 'number': return number(id, String(value), value);
    case 'boolean': return (value ? tick : uncheck)(id);
    case 'enum': case 'node': return pick(id, value);
    case 'color': return color(id, value);
    case 'vec': return ['x', 'y', 'z'].slice(0, value.length).forEach((a, i) => number(`${id}-${a}`, num(value[i]), value[i]));
    default: return text(id, value);
  }
}

// ---------------------------------------------------------------- the rows that aren't scenes
row('File › New Project… makes a game from "One level", named "After Hours": made in a new folder and opened on the template\'s level.');
S('wait id=new-project-open enabled=true timeout_ms=40000', 'until find("id=doc-state").0.name matches "^Scene cafe[^ ]* [0-9]+ nodes saved" timeout=60000   # the bundled sample first');
S('menu "File › New Project…" press', 'wait id=new-project timeout_ms=10000', 'expect find("id=template-level").0.value == "1"   # the level template is chosen by default');
S(`act id=new-project-title action=set_value value=${q(PROJECT)}`, `until find("id=new-project-id").0.value == ${q(GAME.id)}   # the id follows the title`);
S('act id=new-project-create action=press', 'wait id=new-project gone=true timeout_ms=30000');
S('until find("id=doc-state").0.name matches "^Scene level.vrmxs [0-9]+ nodes saved valid" timeout=60000', `expect find("id=project-name").0.name == "Project ${PROJECT}"`, 'expect find("role=alert").count == 0', 'expect find("id=renderer").0.name == "Renderer @RENDERER@"');

row('The game\'s own files come in from outside the app, as a builder copies them into the project\'s folder: the shelf behaviour written by hand, the lost things, the starter content\'s shelf, the back room, the sample\'s door and switch, a licence row for each; File › Open Recent reopens the project and the assets panel lists them.');
S(`screenshot path=${TRIGGERS}/bring-files.png   # the trigger: after-hours-files.mjs copies the files in`, 'pause 4000');
S(`menu "File › Open Recent › ${PROJECT}" press`, `until find("id=project-name").0.name == "Project ${PROJECT}" timeout=30000`, 'until find("id=doc-state").0.name matches "^Scene level.vrmxs [0-9]+ nodes saved valid" timeout=60000');
for (const ref of [FILES.scarf, FILES.shelf, FILES.backRoom, FILES.switch]) S(`act id=assets-search action=set_value value=${path.basename(ref).replace(/\.[^.]+$/, '')}`, `until find("id=asset-${fileId(ref)}").count == 1 timeout=15000   # ${ref} is in the project`);
S('act id=assets-search action=set_value value=" "   # a space: the whole list again');

row('Project Settings: the behaviours module is the hand-written after-hours/behaviours.js, one undo step written to game.json; the project opened again loads it, so the inspector knows the shelf by its describe.');
S('menu "File › Project Settings…" press', 'wait id=project-settings timeout_ms=10000');
pick('settings-behaviours', GAME.behaviours);
S(`until find("id=settings-undo").0.name == ${q(`Undo Behaviours ${GAME.behaviours}`)} timeout=5000   # one step, named for what it did`);
S('act id=settings-done action=press', 'wait id=project-settings gone=true timeout_ms=5000');
S(`menu "File › Open Recent › ${PROJECT}" press`, `until find("id=project-name").0.name == "Project ${PROJECT}" timeout=30000`, 'until find("id=doc-state").0.name matches "^Scene level.vrmxs [0-9]+ nodes saved valid" timeout=60000', 'expect find("role=alert").count == 0   # the module loaded and its declaration was taken');

// ---------------------------------------------------------------- the scenes
// rows are grouped by what they build; the plan's steps run in order, each group's title saying what is in it
const GROUPS = {
  [SCENE.level]: [
    [(n) => ['env', 'cafe', 'back-room', 'moon', 'counter-lamp', 'back-room-bulb', 'ambience'].includes(n.id), 'The level: New with its file name (after-hours/level.vrmxs), its root named; the environment at night (a gradient sky by its colour wells), the cafe and the back room from the assets panel, the moonlight, the counter lamp and the back room\'s bulb (colours, turns, numbers), the room tone.'],
    [(n) => ['front-left', 'front-right', 'staff-door', 'switch'].includes(n.id) || n.id?.startsWith('shelf-'), 'The doors and the switch from the assets panel (the front doors and the staff door locked, the staff door and the switch turned to their walls), the four starter shelves.'],
    [(n) => ['scarf', 'phone', 'book'].includes(n.id) || n.id?.endsWith('-shelved'), 'The three lost things where they were left (two on tables, turned; the book on the back room\'s shelf), and each again on its own shelf, out of sight (state away).'],
    [(n) => ['mira', 'hana', 'look-at', 'cam'].includes(n.id), 'Mira with the player behaviour (the Behaviours panel), Hana behind the counter, the camera over the room aimed at its marker.'],
    [(n) => n.type === 'Area', 'The shelves\' areas, each with the game\'s own shelf behaviour from the Behaviours panel and the item that belongs on it (its VRMXI id typed), and the counter\'s area; each area\'s shape pinned and its size a vector.'],
    [(n) => n.type?.startsWith('Game') || n.type === 'Checkpoint', 'The rules (lost when the clock runs out or after two wrong shelves, built in the condition\'s menus and rows), two counters, the clock, the goal and the checkpoint under them.'],
    [(n) => n.id === 'briefing', 'Hana\'s briefing: a Dialogue that starts by itself, three lines, the first offering two choices that branch.'],
    [(n) => n.id === 'hints', 'Hana\'s hints: a Dialogue of four lines, the first offering four choices.'],
    [(c) => ['ready', 'bodyEntered', 'verb'].includes(c.signal), 'Connections 1 to 3, from the Connections panel of the node that sends each (signal, target and action picked from lists, arguments by the action\'s schema): the rules\' ready to Hana\'s lookAt (a node argument), the counter\'s area to the hints, the switch\'s verb to the staff door\'s state.'],
    [(c) => c.signal && c.from?.startsWith('zone-'), 'Connections 4 to 15: each shelf\'s placed and refused, the game\'s own signals (declared by its describe), to the counter it adds to, the thing shown on its shelf, the wrong-shelf counter and a line from Hana.'],
    [(c) => c.from === 'rules' && ['won', 'lost'].includes(c.signal), 'Connections 16 and 17: won and lost to the scene change (a delay and a scene).'],
  ],
};

let current = null, lastScene = null, lastHash = null;
const connectRows = new Set();
/** A new row while a scene is being built: the row before it ends holding the scene's hash as the session had it then. */
function sceneRow(title) {
  if (lastHash) hashIs({ hash: () => lastHash });
  row(title);
}
/** The row a step of the level belongs in (a new row when its group changes). */
function groupRow(what) {
  const g = (GROUPS[lastScene.ref] ?? []).find(([test]) => test(what));
  if (g && current !== g) { current = g; sceneRow(g[1]); }
}
// a node's props as they were before each edit (the hooks are called after it): kept from its add, in plan order
const nodeStates = new Map();
const pasted = new Set();

const ui = {
  copy(ids) {
    row(`What every scene shares, brought from the level into the next with the toolbar's Copy: ${ids.join(', ')} selected (Also select), copied.`);
    select(ids[0]);
    for (const id of ids.slice(1)) S(...open('id=inspector-also', id), `act surface=app role=menuitem name=${q(id)} exact=true action=press`, 'pause 300');
    S(`until find("id=inspector-id").0.name == "${ids.length} nodes: ${ids.join(', ')}" timeout=5000`, 'act id=copy action=press', `until find("id=paste").0.name == "Paste ${ids.length} nodes" timeout=5000`);
  },
  newScene(scene) {
    current = null; lastScene = scene; lastHash = null; nodeStates.clear();
    if (scene.ref === SCENE.level) groupRow({ id: 'env' });
    else row(`The ${scene.root.toLowerCase()} scene: New with its file name (${scene.ref}), its root named, what the level shares pasted and given back its ids, then its own nodes.`);
    S(`act id=file-name action=set_value value=${scene.ref}`, 'act id=new-scene action=press', `until find("id=doc-state").0.name matches "^Scene ${scene.ref} 1 nodes " timeout=20000`);
    select('root');
    text('field-name', scene.root);
    undoIs('Rename root');
  },
  paste(roots, s) {
    S('act id=paste action=press   # what the level shares, with fresh ids', `until find("id=undo").0.name == ${q(`Undo ${s.history().undo}`)} timeout=10000`);
    for (const id of roots) { S(`until find("id=node-${id}").count == 1 timeout=5000`); pasted.add(id); }
  },
  add(n, given, s) {
    groupRow(n);
    if (n.from) {
      const word = path.basename(n.from).replace(/\.[^.]+$/, '');
      S(`act id=assets-search action=set_value value=${word}   # the panel narrowed to this file`, `until find("id=asset-${fileId(n.from)}").count == 1 timeout=10000`, `act id=add-${fileId(n.from)} action=press`);
    } else {
      S('act id=file-name action=focus   # off the menu first, so focusing it again takes');
      choose('role=popupbutton name="Node type to add"', "role=popupbutton name='Node type to add'", n.type);
      S('act id=add-node action=press');
    }
    S(`until find("id=undo").0.name == ${q(`Undo Add ${given}`)} timeout=10000`, `expect find("id=doc-state").0.name matches "^Scene ${lastScene.ref} ${s.doc.nodes.length} nodes "   # one node added, not two`);
    nodeStates.set(given, { id: given, props: {} });
  },
  setId(given, want, s) {
    // the field selects its text when it takes focus, so the id typed replaces the one the editor gave
    if (pasted.delete(given)) select(given); // a paste selects all it pasted: one at a time, for its id
    S('act id=field-id action=focus', 'pause 300', `act id=field-id action=set_value value=${q(want)}   # the plan's id`);
    S(`until find("id=undo").0.name == ${q(`Undo ${s.history().undo}`)} timeout=5000`, `expect find("id=inspector-id").0.name == "Node ${want}"`);
    const n = nodeStates.get(given) ?? { props: {} };
    nodeStates.delete(given); nodeStates.set(want, { ...n, id: want });
  },
  name(id, name) { text('field-name', name); },
  parent(id, p) { pick('field-parent', p); },
  // the toolbar and the panel place a node where the view looks: every axis is typed, the origin's too
  position(id, p) { ['x', 'y', 'z'].forEach((a, i) => number(`pos-${a}`, num(p[i]), p[i])); },
  rotate(id, axis, value) { number(`rot-${'xyz'[axis]}`, num(value), value); },
  prop(id, key, value, s) {
    const n = { ...(nodeStates.get(id) ?? { props: {} }), id, type: s.node(id).type };
    prop(n, key, value);
    nodeStates.set(id, { ...n, props: { ...n.props, [key]: value } });
  },
  behaviour(id, entry) {
    const { use, ...params } = entry;
    pickOnce('beh-add', use);
    S('act id=beh-add-button action=press');
    undoIs(`Add ${use} to ${id}`);
    S(`until find("id=beh-${idPart(use)}").count == 1 timeout=5000`);
    const fields = propFields(REG.behaviours.get(use).params, {});
    for (const [k, v] of Object.entries(params)) field(`beh-${idPart(use)}-${idPart(k)}`, fields.find((x) => x.key === k), v);
  },
  connect(c, index, s) {
    groupRow(c);
    if (!GROUPS[lastScene.ref] && !connectRows.has(lastScene.ref)) { connectRows.add(lastScene.ref); sceneRow(`The ${lastScene.root.toLowerCase()} scene's connection, from the Connections panel.`); }
    select(c.from);
    pickOnce('conn-new-signal', c.signal);
    pickOnce('conn-new-to', c.to);
    pickOnce('conn-new-call', c.call);
    S('act id=conn-new-add action=press');
    undoIs(`Connect ${c.from}.${c.signal} to ${c.to}.${c.call}`);
    S(`until find("id=conn-${index}").count == 1 timeout=5000`);
    const fields = propFields(REG.surface(s.node(c.to)).actions[c.call]?.args ?? {}, {});
    for (const [k, v] of Object.entries(c.args ?? {})) field(`conn-${index}-arg-${idPart(k)}`, fields.find((x) => x.key === k), v);
  },
  done(scene, s) {
    const want = committed(scene.ref);
    if (s.text() !== want) throw new Error(`${scene.ref}: the plan doesn't make the committed scene (run tools/make-after-hours.mjs)`);
    hashIs(s, 'all of it: the committed scene');
    valid();
    lastHash = null;
    row(`The ${scene.root.toLowerCase()} saved as ${scene.ref}, read back from disk the same bytes, valid: the committed file's bytes (${Buffer.byteLength(want)}, hash ${hashValue(want)}).`);
    S('act id=save action=press', `until find("id=saved").0.name == ${q(`Saved ${scene.ref} · ${Buffer.byteLength(want)} bytes · ${hashValue(want)}`)} timeout=20000   # the committed file's size and hash`);
    S('act id=verify action=press', `until find("id=verify-result").0.name == ${q(`Reopened ${scene.ref}: same bytes as saved, valid`)} timeout=30000`);
    S(`shot "${scene.root.toLowerCase()} built"`);
  },
};
// every hook but copy and done leaves the scene as the session has it: the hash a row that ends there wants
buildScenes(REG, Object.fromEntries(Object.entries(ui).map(([k, fn]) => [k, (...a) => { fn(...a); if (k !== 'copy' && k !== 'done') lastHash = a.at(-1).hash(); }])));

// ---------------------------------------------------------------- the rows after the scenes
row('Project Settings: the title scene is where the game starts, the game\'s four scenes are in it and the template\'s level and ending out, each one undo step written to game.json.');
S('menu "File › Project Settings…" press', 'wait id=project-settings timeout_ms=10000');
pick('settings-entry', GAME.entry);
S(`until find("id=settings-undo").0.name == ${q(`Undo Entry scene ${GAME.entry}`)} timeout=5000`);
for (const ref of GAME.scenes) S(`act id=settings-scene-${ref} action=press`, `until find("id=settings-undo").0.name == ${q(`Undo Add scene ${ref}`)} timeout=5000`);
for (const ref of GAME.drop) S(`act id=settings-scene-${ref} action=press`, `until find("id=settings-undo").0.name == ${q(`Undo Remove scene ${ref}`)} timeout=5000`);
S('act id=settings-done action=press', 'wait id=project-settings gone=true timeout_ms=5000');

row('File › Export Game… writes the game\'s build, named by its id: its entry the title scene.');
S('act id=export-open action=press   # the Export panel, where the result line is', 'wait id=export-game timeout_ms=5000', 'menu "File › Export Game…" press');
S(`until find("id=export-game-result").0.name matches "^Exported game ${GAME.id}: [0-9]+ files, [0-9]+ bytes, entry ${GAME.entry}, runtime vrmxg-game .*/w10-builds/${GAME.id}$" timeout=180000`, 'expect find("role=alert").count == 0');
S('partial: the project\'s files and the build are checked and played outside the app (acceptance/m6/after-hours-compare.mjs)');

// ---------------------------------------------------------------- write
const header = `# The second game, "After Hours", built in the editor from New Project to Export Game (M6 W10): AppProbe scenario@TITLE@

**Written by \`acceptance/m6/after-hours-scenario.mjs\` from \`content/sample/tools/after-hours-plan.mjs\`: edit those, not this.**
Run \`apps/editor-mac/scripts/build.sh\`, launch the app once (its container must exist), then
\`apps/editor-mac/scripts/hand-test-fixtures-m6-after-hours.sh\` (empty \`w10-projects/\` and \`w10-builds/\` in the editor's
container, its own settings and caches), then start the files helper beside the scenario
(\`node apps/editor-mac/scripts/after-hours-files.mjs\`, which waits for row 2's trigger screenshot), then, holding the GPU
lock, \`appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M6-AFTER-HOURS.scenario.md\`, and last
\`node acceptance/m6/after-hours-compare.mjs <container>/tmp/w10-projects/After\\ Hours <container>/tmp/w10-builds/after-hours\`.
No row types JSON. Every row ends by holding the app's scene hash to the one the editor's own session gives for the
plan at that point; each scene's last row wants the committed file's size and hash.

\`\`\`scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M6-AFTER-HOURS.md
env: {@QUERY@"VRMXG_SHELL_NEW_PROJECT": "w10-projects/", "VRMXG_SHELL_BUILD": "w10-builds/", "VRMXG_SHELL_SETTINGS": "w10-ah-settings.json", "VRMXG_SHELL_CACHE": "w10-ah-cache@CACHE@"}
fresh: false
\`\`\`
`;
const body = `${header}\n${rows.map((r) => `- [ ] ${r.title}\n  \`\`\`steps\n${r.steps.filter(Boolean).map((s) => `  ${s}`).join('\n')}\n  \`\`\``).join('\n\n')}\n`;
const scenario = body.replace('@TITLE@', '').replace('@QUERY@', '').replace('@CACHE@', '').replaceAll('@RENDERER@', 'WebGPU');
const scenarioWebGL = body.replace('@TITLE@', ', WebGL forced').replace('@QUERY@', '"VRMXG_QUERY": "renderer=webgl", ').replace('@CACHE@', '-webgl').replaceAll('@RENDERER@', 'WebGL');
const check = process.argv.includes('--check');
let stale = false;
for (const [file, t] of [[SCENARIO, scenario], [SCENARIO_WEBGL, scenarioWebGL]]) {
  const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (check) { if (now !== t) stale = true; continue; }
  fs.writeFileSync(file, t);
}
// the person's checklist: its rows are the scenario's, in order; a row already ticked (with its note) is kept as it is
const CHECKLIST = path.join(root, 'apps/editor-mac/docs/HAND-TEST-M6-AFTER-HOURS.md');
const OPEN = '<!-- rows: the scenario\'s, kept in step by acceptance/m6/after-hours-scenario.mjs -->', CLOSE = '<!-- /rows -->';
const listed = fs.existsSync(CHECKLIST) ? fs.readFileSync(CHECKLIST, 'utf8') : `# The second game, "After Hours", built in the editor (M6 W10, AB-T-0651)\n\n${OPEN}\n${CLOSE}\n\n## Results\n`;
const [before, rest] = listed.split(OPEN), [, after] = rest.split(CLOSE);
const kept = new Map(rest.split(CLOSE)[0].split('\n').filter((l) => l.startsWith('- [')).map((l) => [l.replace(/^- \[.\] /, '').split(' *')[0], l]));
const checklist = `${before}${OPEN}\n${rows.map((r) => kept.get(r.title) ?? `- [ ] ${r.title}`).join('\n')}\n${CLOSE}${after}`;
if (check ? checklist !== listed : false) stale = true;
if (!check && checklist !== listed) fs.writeFileSync(CHECKLIST, checklist);
if (check) { console.log(stale ? 'the scenario is out of date: node acceptance/m6/after-hours-scenario.mjs' : 'the scenario is up to date'); process.exit(stale ? 1 : 0); }
console.log(`${path.relative(root, SCENARIO)}: ${rows.length} rows, ${rows.reduce((a, r) => a + r.steps.length, 0)} steps`);
for (const r of rows) console.log(`- ${r.title}`);
