// M5 W10 (AB-T-0620), exit check 8, completed in M6 W1 (AB-T-0638, M6 exit check 5): writes the level-building AppProbe
// scenario from the committed level (content/sample/game/level.vrmxs), so every field the scenario sets is the level's own
// value: apps/editor-mac/docs/hand-test/HAND-TEST-M5-LEVEL.scenario.md and its WebGL twin.
//
// The scenario opens the level's room (acceptance/m5/rush-level.mjs base: no game layer, no behaviours, no connections) in
// the Mac editor and builds all of it back by hand through the inspector:
//   - the behaviours: the player's on Mira, a brain on each regular (its preset a path, its vars a number and a text by
//     their kind menus), a tableZone on each table area with its seven params (node menus, text, pins for the two that
//     equal their defaults), each added from the Behaviours panel;
//   - the game layer's nodes from the toolbar and the asset list, each given the committed id in the Id field, its place
//     set by the Before menu where it isn't the end (the till and trays sit before Mira); numbers typed (some as
//     arithmetic), maps and lists of structs row by row, conditions through their test menus, two Duplicates, several
//     nodes edited at once, pins where a committed value equals its default;
//   - all 19 connections in the committed order from the Connections panel (signal, target, action picked from lists),
//     their arguments by the action's schema.
// No JSON is typed anywhere. `rush-level.mjs compare` then holds the saved file against the committed level, byte for byte.
//   node acceptance/m5/rush-level-scenario.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { propFields, pinValue, idPart } from '@vrmxg/editor-ui';
import { split, rushRegistry } from './rush-level.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const SCENARIO = path.join(root, 'apps/editor-mac/docs/hand-test/HAND-TEST-M5-LEVEL.scenario.md');
const SCENARIO_WEBGL = path.join(root, 'apps/editor-mac/docs/hand-test/HAND-TEST-M5-LEVEL-webgl.scenario.md');
const { doc, room, game, behaviours: roomBehaviours, assetRef } = split();
const REG = await rushRegistry();
const taken = new Set(room.nodes.map((n) => n.id));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'node';
const uniqueId = (base) => { if (!taken.has(base)) { taken.add(base); return base; } for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) { taken.add(`${base}-${i}`); return `${base}-${i}`; } };
const freshId = (id) => { const base = String(id).replace(/-\d+$/, '') || 'node'; for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) { taken.add(`${base}-${i}`); return `${base}-${i}`; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const defaultOf = (type, key) => REG.get(type)?.props?.[key]?.schema?.default;
const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
const num = (x) => String(Math.round(x * 1e6) / 1e6);

const rows = [];
let steps = [];
const row = (title) => { steps = []; rows.push({ title, steps }); };
const S = (...lines) => steps.push(...lines);
const valid = () => S('expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid');
const undoIs = (label) => S(`until find("id=undo").0.name == ${q(`Undo ${label}`)} timeout=5000`);
// a web view's select: AppProbe's typing reaches its type-ahead one letter at a time (it cycles through the options that
// start with the first letter), so open its menu (Down on the focused select) and press the item by name
const choose = (target, find, want) => S(`act ${target} action=focus`, 'pause 300', 'keys down   # opens the select\'s menu', `act surface=app role=menuitem name=${q(want)} exact=true action=press`, `until find("${find}").0.value == ${q(want)} timeout=5000`);
const pick = (id, want) => choose(`id=${id}`, `id=${id}`, want);
// a menu that resets once it has acted (Add a behaviour…, a new connection's parts): no value to wait for
const pickOnce = (id, want) => S(`act id=${id} action=focus`, 'pause 300', 'keys down   # opens the select\'s menu', `act surface=app role=menuitem name=${q(want)} exact=true action=press`, 'pause 300');
const select = (id) => S(`act id=node-${id} action=press`, `until find("id=inspector-id").0.name == "Node ${id}"`);
const text = (id, value) => S(`act id=${id} action=set_value value=${q(value)}`, `until find("id=${id}").0.value == ${q(value)} timeout=5000`);
const number = (id, typed, value) => S(`act id=${id} action=set_value value=${q(typed)}${typed !== String(value) ? '   # arithmetic: the field commits its result' : ''}`, `until find("id=${id}").0.value == ${q(num(value))} timeout=5000`);
const tick = (id) => S(`act id=${id} action=press`, `until find("id=${id}").0.value == "1" timeout=5000`);
const uncheck = (id) => S(`act id=${id} action=press`, `until find("id=${id}").0.value == "0" timeout=5000`);
const parent = (p) => pick('field-parent', p);
const position = (p) => { if (!p) return; ['x', 'y', 'z'].forEach((a, i) => number(`pos-${a}`, num(p[i]), p[i])); };
// the toolbar adds a node where the view looks: one the level keeps at its parent's origin is put back there (the
// transform then leaves the file, as the committed node has none)
const origin = () => position([0, 0, 0]);
// a prop whose committed value is its default: the field shows it already, so its pin writes it into the file
const pin = (key, owner) => S(`act id=pin-${key} action=press   # the value shown is its default: the pin writes it`, `until find("id=pin-${key}").count == 0 timeout=5000`, ...(owner ? [`expect find("id=undo").0.name == ${q(`Undo Set ${owner}.${key}`)}`] : []));

/** Add a node of a type from the toolbar; → the id the editor gives it. */
function addType(type) {
  const id = uniqueId(slug(type));
  S('act id=file-name action=focus   # off the menu first, so focusing it again takes');
  choose('role=popupbutton name="Node type to add"', "role=popupbutton name='Node type to add'", type);
  S('act id=add-node action=press');
  undoIs(`Add ${id}`);
  return id;
}
/** The node selected in the inspector gets the committed id (every reference follows; none yet). */
function setId(given, want) {
  if (given === want) return want;
  S(`act id=field-id action=set_value value=${q(want)}   # the committed id`);
  undoIs(`Change id ${given} to ${want}`);
  S(`expect find("id=inspector-id").0.name == "Node ${want}"`);
  taken.delete(given); taken.add(want);
  return want;
}
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
// a condition in a struct field: its test, then its own fields
function condition(id, c, { unset = false } = {}) {
  // an unset condition shows its test as state but has no fields yet: picking another test and state again gives it them
  if (unset && c.test === 'state') { pick(`${id}-test`, 'all'); pick(`${id}-test`, 'state'); }
  if (c.test !== 'state') pick(`${id}-test`, c.test);
  // picking any or all makes its list with one row in it: rows after the first are added
  if (c.test === 'any' || c.test === 'all') { c.of.forEach((x, i) => { if (i) S(`act id=${id}-of--add action=press`); S(`until find("id=${id}-of-${i}").count == 1 timeout=5000`); condition(`${id}-of-${i}`, x); }); S(`expect find("id=${id}-of").0.name == "${id.replace(/^prop-/, '').replace(/-/g, ' ')} of, ${c.of.length} rows"`); return; }
  S('pause 500   # a row just made: let it settle before its "new" placeholder is replaced (typed too soon, the value lands after it)');
  text(`${id}-key`, c.key);
  if (c.op) pick(`${id}-op`, c.op);
  if (c.value !== undefined) { if (typeof c.value === 'number') number(`${id}-value`, String(c.value), c.value); else text(`${id}-value`, c.value); }
}
// a map of flags (boolean values)
function flagMap(id, map, { set = false } = {}) {
  if (set) S(`act id=${id}--set action=press`, `until find("id=${id}").count == 1 timeout=5000`);
  for (const [k, v] of Object.entries(map)) {
    S(`act id=${id}--newkey action=set_value value=${k}`, `act id=${id}--addkey action=press`, `until find("id=${id}-${k}").count == 1 timeout=5000`);
    if (v === true) tick(`${id}-${k}`);
  }
}
/** A behaviour added to the selected node from the Behaviours panel, then each of its params (in the committed entry). */
function behaviour(nodeId, entry) {
  const { use, ...params } = entry;
  pickOnce('beh-add', use);
  S('act id=beh-add-button action=press');
  undoIs(`Add ${use} to ${nodeId}`);
  S(`until find("id=beh-${idPart(use)}").count == 1 timeout=5000`);
  const fields = propFields(REG.behaviours.get(use).params, {});
  for (const [k, v] of Object.entries(params)) {
    const f = fields.find((x) => x.key === k);
    if (!f) throw new Error(`${use} has no param ${k}`);
    const id = `beh-${idPart(use)}-${idPart(k)}`;
    if (use === 'brain' && k === 'preset') { // a choice of kinds: a role, a path, an object; the path is typed
      pick(`${id}--kind`, 'path');
      S('pause 300');
      text(id, v);
    } else if (use === 'brain' && k === 'vars') { // an open struct: each key added, its value's kind picked
      for (const [vk, vv] of Object.entries(v)) {
        S(`act id=${id}--newkey action=set_value value=${q(vk)}`, `act id=${id}--addkey action=press`, `until find("id=${id}-${idPart(vk)}").count == 1 timeout=5000`, 'pause 300');
        if (typeof vv === 'number') { pick(`${id}-${idPart(vk)}--kind`, 'number'); S('pause 300'); number(`${id}-${idPart(vk)}`, String(vv), vv); } else text(`${id}-${idPart(vk)}`, vv);
      }
    } else field(id, f, v);
  }
}
/** Connection `index` of the committed level, made from the Connections panel of its sending node. */
function connection(c, index) {
  pickOnce('conn-new-signal', c.signal);
  pickOnce('conn-new-to', c.to);
  pickOnce('conn-new-call', c.call);
  S('act id=conn-new-add action=press');
  undoIs(`Connect ${c.from}.${c.signal} to ${c.to}.${c.call}`);
  S(`until find("id=conn-${index}").count == 1 timeout=5000`);
  const target = doc.nodes.find((n) => n.id === c.to);
  const defs = REG.surface(target).actions[c.call]?.args ?? {};
  const fields = propFields(defs, {});
  for (const [k, v] of Object.entries(c.args ?? {})) field(`conn-${index}-arg-${idPart(k)}`, fields.find((x) => x.key === k), v);
}

const byId = (id) => game.find((n) => n.id === id);

// ---------------------------------------------------------------- 1: the room
row('The level\'s room opens: the set, the doors and stools, Mira, Hana and the three regulars, with no rules, behaviours or connections yet.');
S('wait id=open-project enabled=true timeout_ms=40000', 'act id=open-project action=press', 'until find("id=project-name").0.name == "Project project-w10-level"');
S('act id=file-name action=set_value value=game/rush-built.vrmxs', 'act id=open-file action=press', `until find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs ${room.nodes.length} nodes saved valid " timeout=90000`);
S('expect find("id=renderer").0.name == "Renderer @RENDERER@"', 'expect find("id=node-aoi").count == 1', 'expect find("id=node-hana-1").count == 1', 'shot "the room"');

// ---------------------------------------------------------------- 2: the characters' behaviours
row('Mira plays and the regulars think: the player behaviour added to Mira, a brain to each regular, its preset a path (the brain\'s kind menu) and its vars a number and a seat (each value\'s kind menu), from the Behaviours panel.');
for (const { id, behaviours } of roomBehaviours) {
  select(id);
  for (const b of behaviours) behaviour(id, b);
}
S('expect find("id=beh-brain-vars-arrive").0.value == "60"   # Yuki\'s, the last one set', 'shot "a regular\'s brain"');
valid();

// ---------------------------------------------------------------- 3: the table areas
row('The three table areas: one made, its shape pinned and its size set (a vector), Duplicated twice, then all three selected to see the size they share; each given its id, name and place.');
const areas = game.filter((n) => n.type === 'Area');
const area = addType('Area');
pin('shape', area);
const size = areas[0].props.size;
['x', 'y', 'z'].forEach((a, i) => number(`prop-size-${a}`, num(size[i]), size[i]));
const areaIds = [area];
for (let i = 1; i < areas.length; i++) { const copy = freshId(areaIds.at(-1)); S(`act id=duplicate action=press   # the toolbar's Duplicate (Edit › Duplicate edits text while an inspector field has focus)`, `until find("id=node-${copy}").count == 1 timeout=5000`); areaIds.push(copy); }
S('act id=inspector-select-type action=press   # "Select every Area": several nodes at once without a modifier key', `until find("id=inspector-id").0.name matches "^${areaIds.length} nodes: " timeout=5000`, `expect find("id=prop-size-x").0.name != "size X (mixed values)"`, `expect find("id=prop-size-z").0.value == "${num(size[2])}"`);
areas.forEach((want, i) => { select(areaIds[i]); setId(areaIds[i], want.id); text('field-name', want.name); position(want.transform.p); });
valid();

// ---------------------------------------------------------------- 4: the rules
row('The rules: a GameRules node given its id, its seven flags (a map, key by key) and its lose condition (any of: the clock done, two wrong orders), built in the condition\'s menus and rows.');
const rulesNode = byId('rules');
setId(addType('GameRules'), 'rules');
origin();
flagMap('prop-flags', rulesNode.props.flags);
S(`until find("id=prop-flags").0.name == "flags, ${Object.keys(rulesNode.props.flags).length} entries"`);
condition('prop-lose', rulesNode.props.lose);
valid();

// ---------------------------------------------------------------- 5: counters, clock, brew timers
row('The counters and the clock under the rules, each given its id (its key in the game state follows it): labels, a maximum typed as arithmetic, the clock\'s 240 seconds typed as 4*60.');
for (const want of game.filter((n) => n.type === 'GameCounter' || (n.type === 'GameTimer' && n.id === 'clock'))) {
  setId(addType(want.type), want.id);
  parent('rules');
  origin();
  if (want.props.label) text('prop-label', want.props.label);
  if (want.props.max !== undefined) number('prop-max', '1+2', want.props.max);
  if (want.props.seconds !== undefined) number('prop-seconds', '4*60', want.props.seconds);
}
valid();

row('Three brew timers: one made, Duplicated twice, then all three selected and their seconds typed once for all (one undo step); each given its id.');
const brews = game.filter((n) => n.type === 'GameTimer' && n.id.startsWith('brew-'));
const first = addType('GameTimer');
parent('rules');
origin();
uncheck('prop-autostart');
const brewIds = [first];
for (let i = 1; i < brews.length; i++) {
  const copy = freshId(brewIds.at(-1));
  S(`act id=duplicate action=press   # the toolbar's Duplicate (Edit › Duplicate edits text while an inspector field has focus)`, `until find("id=node-${copy}").count == 1 timeout=5000`, `expect find("id=undo").0.name == "Undo Duplicate ${brewIds.at(-1)}"`);
  brewIds.push(copy);
}
select(brewIds[0]);
for (const id of brewIds.slice(1)) S('act id=inspector-also action=focus', 'pause 300', 'keys down   # "Also select": its menu', `act surface=app role=menuitem name=${q(id)} exact=true action=press`, 'pause 300');
S(`until find("id=inspector-id").0.name == "${brewIds.length} nodes: ${brewIds.join(', ')}" timeout=5000`);
S(`act id=prop-seconds action=set_value value="2*3"   # every selected timer, one command`, `until find("id=undo").0.name == "Undo Set seconds on ${brewIds.length} nodes" timeout=5000`, `expect find("id=prop-seconds").0.value == "${brews[0].props.seconds}"`);
brews.forEach((want, i) => { select(brewIds[i]); setId(brewIds[i], want.id); });
valid();

// ---------------------------------------------------------------- 6: goals and the checkpoint
row('The two goals in order and the checkpoint, each given its id and its condition built in the condition\'s fields; the checkpoint\'s once pinned (its default, written into the file).');
for (const want of game.filter((n) => n.type === 'GameGoal' || n.type === 'Checkpoint')) {
  const id = setId(addType(want.type), want.id);
  parent('rules');
  origin();
  if (want.type === 'GameGoal') text('prop-text', want.props.text);
  else {
    text('prop-slot', want.props.slot); text('prop-label', want.props.label);
    if (want.props.once !== undefined) { if (want.props.once === defaultOf('Checkpoint', 'once')) pin('once', id); else (want.props.once ? tick : uncheck)('prop-once'); }
  }
  condition('prop-when', want.props.when, { unset: true });
}
valid();

// ---------------------------------------------------------------- 7: trays and till
row('The till dragged from the assets panel onto the viewport (the real pointer), and the three trays added from the panel; each given its id, name, place and the state it starts in, and moved before Mira in the scene\'s order (the Before menu).');
const fileId = (ref) => ref.replace(/[^A-Za-z0-9]+/g, '-');
const before = doc.nodes[doc.nodes.findIndex((n) => n.id === game.filter((g) => g.type === 'Item').at(-1).id) + 1].id; // the room node after the last tray
for (const want of game.filter((n) => n.type === 'Item')) {
  const ref = assetRef.get(want.asset), base = slug(path.basename(ref).replace(/\.[^.]+$/, ''));
  const given = uniqueId(base);
  const word = path.basename(ref).replace(/\.[^.]+$/, '');
  S(`act id=assets-search action=set_value value=${word}   # the panel narrowed to this file`, `until find("id=asset-${fileId(ref)}").count == 1 timeout=10000`);
  if (want.id === 'till') {
    // an HTML drag from the tile to the viewport: only real mouse events start one (W6's row 4 does the same onto a slot)
    S(`find id=asset-${fileId(ref)}`, 'set FROM = $.0.ref', 'find name=Viewport exact=true', 'set TO = $.0.ref', 'pointer drag ref="${FROM}" to_ref="${TO}" steps=30   # the till\'s tile dropped on the viewport: placed where it lands');
  } else S(`act id=add-${fileId(ref)} action=press   # the panel's Add, for the trays`);
  S(`until find("id=undo").0.name == "Undo Add ${given}" timeout=10000`);
  setId(given, want.id);
  text('field-name', want.name);
  position(want.transform.p);
  text('prop-state', want.props.state);
  pick('field-before', before);
  undoIs(`Move ${want.id} before ${before}`);
}
S('act id=assets-search action=set_value value=" "   # a space: no words, the whole list again (set_value needs a value)');
valid();

// ---------------------------------------------------------------- 8, 9: the dialogues
function dialogue(want) {
  setId(addType('Dialogue'), want.id);
  origin();
  if (want.name) text('field-name', want.name);
  if (want.props.autostart !== undefined && want.props.autostart !== (defaultOf('Dialogue', 'autostart') ?? false)) (want.props.autostart ? tick : uncheck)('prop-autostart');
  want.props.lines.forEach((l, i) => {
    const L = `prop-lines-${i}`;
    S(`act id=prop-lines--add action=press`, `until find("id=prop-lines").0.name == "lines, ${i + 1} ${i ? 'rows' : 'row'}" timeout=5000`);
    S('pause 500');
    if (l.id) text(`${L}-id`, l.id);
    text(`${L}-speaker`, l.speaker);
    text(`${L}-text`, l.text);
    text(`${L}-clip`, l.clip);
    if (l.next) text(`${L}-next`, l.next);
    if (l.when) { S(`act id=${L}-when--set action=press`); condition(`${L}-when`, l.when); }
    (l.choices ?? []).forEach((c, k) => {
      const C = `${L}-choices-${k}`;
      S(k === 0 ? `act id=${L}-choices--set action=press` : `act id=${L}-choices--add action=press`, `until find("id=${C}").count == 1 timeout=5000`);
      S('pause 500');
      text(`${C}-id`, c.id);
      text(`${C}-text`, c.text);
      if (c.to) text(`${C}-to`, c.to);
      if (c.set) flagMap(`${C}-set`, c.set, { set: true });
    });
  });
}
const dialogues = game.filter((n) => n.type === 'Dialogue');
row('Hana\'s briefing: a Dialogue given its id, that starts by itself, three lines (speaker, text, clip, ids and the line after), the first offering two choices that branch.');
dialogue(dialogues[0]);
valid();
for (const want of dialogues.slice(1)) {
  row(`${want.name}: a Dialogue given its id, three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).`);
  dialogue(want);
  valid();
}

// ---------------------------------------------------------------- 10: the tables' behaviour
row('Each table area\'s tableZone, the game\'s own behaviour (declared by its describe), added from the Behaviours panel with its seven params: the regular, her order\'s dialogue and the player from node menus (the player pinned: its default), her tray\'s item and her flags typed, the points pinned (their default).');
for (const want of areas) {
  select(want.id);
  for (const b of want.behaviours) behaviour(want.id, b);
}
S('shot "a table\'s tableZone"');
valid();

// ---------------------------------------------------------------- 11: the connections
// grouped by the node that sends them, in the committed order (each new one is the last; its place is its index)
const groups = [];
doc.connections.forEach((c, i) => { const g = groups.at(-1); if (g && g.from === c.from) g.list.push([c, i]); else groups.push({ from: c.from, list: [[c, i]] }); });
const chunks = [groups.slice(0, 7), groups.slice(7)];
chunks.forEach((chunk, n) => {
  const count = chunk.reduce((a, g) => a + g.list.length, 0), at = chunk[0].list[0][1];
  row(n === 0
    ? `Connections ${at + 1} to ${at + count}, from the Connections panel of the node that sends each (signal, target and action picked from lists, arguments by the action's schema): the rules' ready to Hana's lookAt (a node argument), each order's chose to its brew timer and Hana's playLayer (a yes / no pinned false), each brew timer's timeout to its tray's state and Hana's line.`
    : `Connections ${at + 1} to ${at + count}: the serve goal to the till and Hana, the till's verb to setFlag, the till goal to the score (a number), won and lost to changeScene (a delay and a scene); the level's 19 connections, in order.`);
  for (const g of chunk) { select(g.from); for (const [c, i] of g.list) connection(c, i); }
  S(`expect find("id=connections").count == 1`);
  valid();
});

// ---------------------------------------------------------------- 12: a prefab override (W6)
row('A door prefab placed from the assets panel; a prop of its hinge overridden in the inspector, marked as an override (the dot, the Overrides list), reverted by its dot; the door taken out again with Undo, so the level is as committed.');
const door = uniqueId('door');
S('act id=assets-search action=set_value value=door', 'until find("id=add-prefabs-door-vrmxs").count == 1 timeout=10000');
S('act id=add-prefabs-door-vrmxs action=press   # the sample\'s own door prefab', `until find("id=undo").0.name == "Undo Add ${door}" timeout=10000`, `until find("id=node-${door}").0.name contains "inside" timeout=10000   # built: its prefab nodes are in the tree`);
S(`act id=fold-${door} action=press`, `until find("id=node-${door}/hinge").count == 1`, `act id=node-${door}/hinge action=press`, 'until find("id=inspector-inner").count == 1   # the inspector edits a prefab node, as overrides');
S('expect find("id=prop-mass").0.value == "12"   # the prefab\'s own mass', 'expect find("id=ov-mass").count == 0   # not overridden: no mark');
S('act id=prop-mass action=set_value value=20', `until find("id=undo").0.name == "Undo Override ${door}/hinge.mass" timeout=5000   # one undo step, an override`);
S('expect find("id=ov-mass").0.name == "mass overrides the prefab (prefab: 12): revert"   # the mark, with the prefab\'s value', `expect find("id=node-${door}").0.name contains "overridden"   # the tree marks the instance`, 'shot "the door\'s hinge mass overridden"');
S('act id=ov-mass action=press   # the dot reverts', 'until find("id=ov-mass").count == 0', 'expect find("id=prop-mass").0.value == "12"', `expect find("id=undo").0.name == "Undo Revert ${door}/hinge.mass"`);
S('act id=undo action=press', 'until find("id=ov-mass").count == 1   # Undo brings the override back', 'act id=undo action=press', 'until find("id=ov-mass").count == 0', 'act id=undo action=press   # and the door goes', `until find("id=node-${door}").count == 0 timeout=5000`);
S('act id=assets-search action=set_value value=" "');
taken.delete(door);
valid();

row('Saved, and read back from disk the same bytes, valid; the file is what rush-level.mjs compares with the committed level, byte for byte.');
S('act id=save action=press', 'until find("id=saved").0.name matches "^Saved game/rush-built.vrmxs · [0-9]+ bytes · [0-9a-f]{16}$" timeout=20000');
S('act id=verify action=press', 'until find("id=verify-result").0.name == "Reopened game/rush-built.vrmxs: same bytes as saved, valid" timeout=30000');
S(`expect find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs ${doc.nodes.length} nodes saved valid "`, 'shot "the level built"');

// ---------------------------------------------------------------- write
const header = `# The sample game's level, built in the editor (M5 W10, M6 W1): AppProbe scenario@TITLE@

**Written by \`acceptance/m5/rush-level-scenario.mjs\` from \`content/sample/game/level.vrmxs\`: edit that, not this.**
Run \`apps/editor-mac/scripts/build.sh\`, launch the app once (its container must exist), then
\`apps/editor-mac/scripts/hand-test-fixtures-m5-level.sh\` (the scenario's own copy of the sample, \`project-w10-level\`, its
game the Morning Rush, with \`game/rush-built.vrmxs\`: the level's room, its game layer, behaviours and connections taken
out), then, holding the GPU lock, \`appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M5-LEVEL.scenario.md\`,
and last \`node acceptance/m5/rush-level.mjs compare <container>/tmp/project-w10-level/game/rush-built.vrmxs\`, which wants
the committed level's bytes. No row types JSON: nodes come from the toolbar and the assets panel (the till dragged onto
the viewport with the real pointer, so the Mac must be unlocked), each is given the committed id in the Id field and its
place by the Before menu, maps and lists are edited key by key and row by row, conditions through their test menus,
behaviours and their params from the Behaviours panel, the 19 connections from the Connections panel; a door prefab's
override is made, seen and reverted.

\`\`\`scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M5-LEVEL.md
env: {@QUERY@"VRMXG_SHELL_PROJECT": "project-w10-level", "VRMXG_SHELL_SETTINGS": "w10-settings.json", "VRMXG_SHELL_CACHE": "w10-cache@CACHE@"}
fresh: false
\`\`\`
`;
const body = `${header}\n${rows.map((r) => `- [ ] ${r.title}\n  \`\`\`steps\n${r.steps.map((s) => `  ${s}`).join('\n')}\n  \`\`\``).join('\n\n')}\n`;
// the app's default renderer (WebGPU), and the same rows with WebGL forced (VRMXG_QUERY), each with its own thumbnail cache
const scenario = body.replace('@TITLE@', '').replace('@QUERY@', '').replace('@CACHE@', '').replace('@RENDERER@', 'WebGPU');
const scenarioWebGL = body.replace('@TITLE@', ', WebGL forced').replace('@QUERY@', '"VRMXG_QUERY": "renderer=webgl", ').replace('@CACHE@', '-webgl').replace('@RENDERER@', 'WebGL');
const check = process.argv.includes('--check');
let stale = false;
for (const [file, t] of [[SCENARIO, scenario], [SCENARIO_WEBGL, scenarioWebGL]]) {
  const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (check) { if (now !== t) stale = true; continue; }
  fs.writeFileSync(file, t);
}
if (check) { console.log(stale ? 'the scenario is out of date: node acceptance/m5/rush-level-scenario.mjs' : 'the scenario is up to date'); process.exit(stale ? 1 : 0); }
console.log(`${path.relative(root, SCENARIO)}: ${rows.length} rows, ${rows.reduce((a, r) => a + r.steps.length, 0)} steps`);
for (const r of rows) console.log(`- ${r.title}`);
