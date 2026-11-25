// M5 W10 (AB-T-0620), exit check 8: writes the level-building AppProbe scenario and its checklist from the committed
// level (content/sample/game/level.vrmxs), so every field the scenario types is the level's own value:
//   apps/editor-mac/docs/hand-test/HAND-TEST-M5-LEVEL.scenario.md and apps/editor-mac/docs/HAND-TEST-M5-LEVEL.md.
// The scenario opens the level's room (acceptance/m5/rush-level.mjs base) in the Mac editor and builds the game layer
// back by hand through the inspector: nodes from the toolbar and the asset list, ids the editor gives them, parents from
// the Parent menu, numbers typed (some as arithmetic), maps and lists of structs row by row, conditions through their
// test menus, two Duplicates, several nodes edited at once. No JSON is typed anywhere. `rush-level.mjs compare` then holds
// the saved file against the committed level.
//   node acceptance/m5/rush-level-scenario.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { split } from './rush-level.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const SCENARIO = path.join(root, 'apps/editor-mac/docs/hand-test/HAND-TEST-M5-LEVEL.scenario.md');
const CHECKLIST = path.join(root, 'apps/editor-mac/docs/HAND-TEST-M5-LEVEL.md');
const { room, game, assetRef } = split();
const taken = new Set(room.nodes.map((n) => n.id));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'node';
const uniqueId = (base) => { if (!taken.has(base)) { taken.add(base); return base; } for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) { taken.add(`${base}-${i}`); return `${base}-${i}`; } };
const freshId = (id) => { const base = String(id).replace(/-\d+$/, '') || 'node'; for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) { taken.add(`${base}-${i}`); return `${base}-${i}`; } };
const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
const num = (x) => String(Math.round(x * 1e6) / 1e6);

const rows = [];
let steps = [];
const row = (title) => { steps = []; rows.push({ title, steps }); };
const S = (...lines) => steps.push(...lines);
const valid = () => S('expect find("id=doc-state").0.name matches " valid "   # every edit kept the scene valid');
const pick = (id, text, want = text) => S(`act id=${id} action=focus   # a web view's select: type-ahead picks`, 'pause 1500', `keys text=${text}`, `until find("id=${id}").0.value == ${q(want)} timeout=5000`);
const select = (id) => S(`act id=node-${id} action=press`, `until find("id=inspector-id").0.name == "Node ${id}"`);
const addType = (type, typed) => {
  const id = uniqueId(slug(type));
  S('act id=file-name action=focus   # off the menu first, so focusing it again takes', 'act role=popupbutton name="Node type to add" action=focus', 'pause 1500', `keys text=${typed}`, `until find("role=popupbutton name='Node type to add'").0.value == "${type}" timeout=5000`);
  S('act id=add-node action=press', `until find("id=undo").0.name == "Undo Add ${id}" timeout=5000`);
  return id;
};
const text = (id, value) => S(`act id=${id} action=set_value value=${q(value)}`, `until find("id=${id}").0.value == ${q(value)} timeout=5000`);
const number = (id, typed, value) => S(`act id=${id} action=set_value value=${q(typed)}${typed !== String(value) ? '   # arithmetic: the field commits its result' : ''}`, `until find("id=${id}").0.value == ${q(num(value))} timeout=5000`);
const parent = (p) => pick('field-parent', p);
const tick = (id) => S(`act id=${id} action=press`, `until find("id=${id}").0.value == "1" timeout=5000`);
const uncheck = (id) => S(`act id=${id} action=press`, `until find("id=${id}").0.value == "0" timeout=5000`);
const position = (p) => { if (!p) return; ['x', 'y', 'z'].forEach((a, i) => number(`pos-${a}`, num(p[i]), p[i])); };
// a condition in a struct field: its test, then its own fields
function condition(id, c) {
  if (c.test !== 'state') pick(`${id}-test`, c.test);
  if (c.test === 'any' || c.test === 'all') { c.of.forEach((x, i) => { S(`act id=${id}-of--add action=press`, `until find("id=${id}-of-${i}").count == 1 timeout=5000`); condition(`${id}-of-${i}`, x); }); return; }
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

const byId = (id) => game.find((n) => n.id === id);
const rulesNode = byId('rules');

// ---------------------------------------------------------------- 1: the room
row('The level\'s room opens: the set, the doors and stools, Mira, Hana and the three regulars, with no rules yet.');
S('wait id=open-project enabled=true timeout_ms=40000', 'act id=open-project action=press', 'until find("id=project-name").0.name == "Project project-w10-level"');
S('act id=file-name action=set_value value=game/rush-built.vrmxs', 'act id=open-file action=press', `until find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs ${room.nodes.length} nodes saved valid " timeout=90000`);
S('expect find("id=node-aoi").count == 1', 'expect find("id=node-hana-1").count == 1', 'shot "the room"');

// ---------------------------------------------------------------- 2: the rules
row('The rules: a GameRules node with its seven flags (a map, key by key) and its lose condition (any of: the clock done, two wrong orders), built in the condition\'s menus and rows.');
const rules = addType('GameRules', 'GameR');
flagMap('prop-flags', rulesNode.props.flags);
S(`until find("id=prop-flags").0.name == "flags, ${Object.keys(rulesNode.props.flags).length} entries"`);
condition('prop-lose', rulesNode.props.lose);
valid();

// ---------------------------------------------------------------- 3: counters, clock, brew timers
row('The counters and the clock under the rules: keys, labels, a maximum typed as arithmetic, the clock\'s 240 seconds typed as 4*60.');
const ids = new Map([['rules', rules]]);
for (const want of game.filter((n) => n.type === 'GameCounter' || (n.type === 'GameTimer' && n.id === 'clock'))) {
  const id = addType(want.type, want.type === 'GameCounter' ? 'GameC' : 'GameT');
  ids.set(want.id, id);
  parent(rules);
  text('prop-key', want.props.key ?? want.id);
  if (want.props.label) text('prop-label', want.props.label);
  if (want.props.max !== undefined) number('prop-max', '1+2', want.props.max);
  if (want.props.seconds !== undefined) number('prop-seconds', '4*60', want.props.seconds);
}
valid();

row('Three brew timers: one made, Duplicated twice from the Edit menu, then all three selected and their seconds typed once for all (one undo step); each given its key.');
const brews = game.filter((n) => n.type === 'GameTimer' && n.id.startsWith('brew-'));
const first = addType('GameTimer', 'GameT');
parent(rules);
uncheck('prop-autostart');
const brewIds = [first];
for (let i = 1; i < brews.length; i++) {
  const copy = freshId(brewIds.at(-1));
  S(`menu "Edit › Duplicate" press`, `until find("id=node-${copy}").count == 1 timeout=5000`, `expect find("id=undo").0.name == "Undo Duplicate ${brewIds.at(-1)}"`);
  brewIds.push(copy);
}
select(brewIds[0]);
for (const id of brewIds.slice(1)) { S('act id=inspector-also action=focus', 'pause 1500', `keys text=${id}`); }
S(`until find("id=inspector-id").0.name == "${brewIds.length} nodes: ${brewIds.join(', ')}" timeout=5000`);
S(`act id=prop-seconds action=set_value value="2*3"   # every selected timer, one command`, `until find("id=undo").0.name == "Undo Set seconds on ${brewIds.length} nodes" timeout=5000`, `expect find("id=prop-seconds").0.value == "${brews[0].props.seconds}"`);
brews.forEach((want, i) => { ids.set(want.id, brewIds[i]); select(brewIds[i]); text('prop-key', want.id); });
valid();

// ---------------------------------------------------------------- 4: goals and the checkpoint
row('The two goals in order and the checkpoint, each with its condition built in the condition\'s fields.');
for (const want of game.filter((n) => n.type === 'GameGoal' || n.type === 'Checkpoint')) {
  const id = addType(want.type, want.type === 'GameGoal' ? 'GameG' : 'Che');
  ids.set(want.id, id);
  parent(rules);
  if (want.type === 'GameGoal') { text('prop-key', want.props.key ?? want.id); text('prop-text', want.props.text); }
  else { text('prop-slot', want.props.slot); text('prop-label', want.props.label); if (want.props.once) tick('prop-once'); }
  condition('prop-when', want.props.when);
}
valid();

// ---------------------------------------------------------------- 5: the table areas
row('The three table areas: one made and sized (a vector), Duplicated twice, then all three selected to see the size they share; each named and placed.');
const areas = game.filter((n) => n.type === 'Area');
const area = addType('Area', 'Are');
const size = areas[0].props.size;
['x', 'y', 'z'].forEach((a, i) => number(`prop-size-${a}`, num(size[i]), size[i]));
const areaIds = [area];
for (let i = 1; i < areas.length; i++) { const copy = freshId(areaIds.at(-1)); S(`menu "Edit › Duplicate" press`, `until find("id=node-${copy}").count == 1 timeout=5000`); areaIds.push(copy); }
S('act id=inspector-select-type action=press   # "Select every Area": several nodes at once without a modifier key', `until find("id=inspector-id").0.name matches "^${areaIds.length} nodes: " timeout=5000`, `expect find("id=prop-size-x").0.name != "size X (mixed values)"`, `expect find("id=prop-size-z").0.value == "${num(size[2])}"`);
areas.forEach((want, i) => { ids.set(want.id, areaIds[i]); select(areaIds[i]); text('field-name', want.name); position(want.transform.p); });
valid();

// ---------------------------------------------------------------- 6: trays and till
row('The three trays and the till from the asset list, each named, placed and given the state it starts in.');
for (const want of game.filter((n) => n.type === 'Item')) {
  const ref = assetRef.get(want.asset), base = slug(path.basename(ref).replace(/\.[^.]+$/, ''));
  const id = uniqueId(base);
  ids.set(want.id, id);
  S(`act id=add-${ref.replace(/[^A-Za-z0-9]+/g, '-')} action=press`, `until find("id=undo").0.name == "Undo Add ${id}" timeout=10000`);
  text('field-name', want.name);
  position(want.transform.p);
  text('prop-state', want.props.state);
}
valid();

// ---------------------------------------------------------------- 7, 8: the dialogues
function dialogue(want) {
  const id = addType('Dialogue', 'Dia');
  ids.set(want.id, id);
  if (want.name) text('field-name', want.name);
  if (want.props.autostart) tick('prop-autostart');
  want.props.lines.forEach((l, i) => {
    const L = `prop-lines-${i}`;
    S(`act id=prop-lines--add action=press`, `until find("id=prop-lines").0.name == "lines, ${i + 1} ${i ? 'rows' : 'row'}" timeout=5000`);
    if (l.id) text(`${L}-id`, l.id);
    text(`${L}-speaker`, l.speaker);
    text(`${L}-text`, l.text);
    text(`${L}-clip`, l.clip);
    if (l.next) text(`${L}-next`, l.next);
    if (l.when) { S(`act id=${L}-when--set action=press`); condition(`${L}-when`, l.when); }
    (l.choices ?? []).forEach((c, k) => {
      const C = `${L}-choices-${k}`;
      S(k === 0 ? `act id=${L}-choices--set action=press` : `act id=${L}-choices--add action=press`, `until find("id=${C}").count == 1 timeout=5000`);
      text(`${C}-id`, c.id);
      text(`${C}-text`, c.text);
      if (c.to) text(`${C}-to`, c.to);
      if (c.set) flagMap(`${C}-set`, c.set, { set: true });
    });
  });
}
const dialogues = game.filter((n) => n.type === 'Dialogue');
row('Hana\'s briefing: a Dialogue that starts by itself, three lines (speaker, text, clip, ids and the line after), the first offering two choices that branch.');
dialogue(dialogues[0]);
valid();
for (const want of dialogues.slice(1)) {
  row(`${want.name}: three lines, the regular's question offering two choices, each setting the order's flags (a map in a row of a list in a row of a list).`);
  dialogue(want);
  valid();
}

// ---------------------------------------------------------------- 9: saved
row('Saved, and read back from disk the same bytes, valid; the file is what rush-level.mjs compares with the committed level.');
S('act id=save action=press', 'until find("id=saved").0.name matches "^Saved game/rush-built.vrmxs · [0-9]+ bytes · [0-9a-f]{16}$" timeout=20000');
S('act id=verify action=press', 'until find("id=verify-result").0.name == "Reopened game/rush-built.vrmxs: same bytes as saved, valid" timeout=30000');
S(`expect find("id=doc-state").0.name matches "^Scene game/rush-built.vrmxs ${room.nodes.length + game.length} nodes saved valid "`, 'shot "the level built"');

// ---------------------------------------------------------------- write
const header = `# The sample game's level, built in the editor (M5 W10): AppProbe scenario

**Written by \`acceptance/m5/rush-level-scenario.mjs\` from \`content/sample/game/level.vrmxs\`: edit that, not this.**
Run \`apps/editor-mac/scripts/build.sh\`, launch the app once (its container must exist), then
\`apps/editor-mac/scripts/hand-test-fixtures-m5-level.sh\` (the scenario's own copy of the sample, \`project-w10-level\`, with
\`game/rush-built.vrmxs\`: the level's room, its game layer taken out), then, holding the GPU lock,
\`appprobe checklist scenario=apps/editor-mac/docs/hand-test/HAND-TEST-M5-LEVEL.scenario.md\`, and last
\`node acceptance/m5/rush-level.mjs compare <container>/tmp/project-w10-level/game/rush-built.vrmxs\`. No row types JSON:
nodes come from the toolbar and the asset list, maps and lists are edited key by key and row by row, conditions through
their test menus. The editor can't attach a behaviour or wire a connection (AB-T-0638), so the room keeps the behaviours
it has and the game layer's three \`tableZone\` behaviours and the level's connections are not built here.

\`\`\`scenario
app: VRMXG Editor
launch: ../../build/VRMXGEditor.app
checklist: ../HAND-TEST-M5-LEVEL.md
env: {"VRMXG_SHELL_PROJECT": "project-w10-level"}
fresh: false
\`\`\`
`;
const scenario = `${header}\n${rows.map((r) => `- [ ] ${r.title}\n  \`\`\`steps\n${r.steps.map((s) => `  ${s}`).join('\n')}\n  \`\`\``).join('\n\n')}\n`;
const checklist = `# The sample game's level, built in the editor (M5 W10, AB-T-0620)

M5's exit check 8 for the sample game: its level built in the Mac editor by hand, with no JSON typed. The scenario
(\`hand-test/HAND-TEST-M5-LEVEL.scenario.md\`, written by \`acceptance/m5/rush-level-scenario.mjs\`) starts from the level's
room and builds its game layer through the inspector (W4's widgets, W5's Duplicate); \`acceptance/m5/rush-level.mjs
compare\` then finds every game-layer node of the committed level in the saved file, with the same parent, props and
place. Not built, because the editor can't yet: the three \`tableZone\` behaviours and the level's connections (AB-T-0638).

${rows.map((r) => `- [ ] ${r.title}`).join('\n')}

## Results
`;
const check = process.argv.includes('--check');
let stale = false;
for (const [file, body] of [[SCENARIO, scenario], [CHECKLIST, checklist]]) {
  const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (check) { if (file === SCENARIO && now !== body) stale = true; continue; }
  if (file === CHECKLIST && now !== null) continue; // the checklist carries a run's results: written once
  fs.writeFileSync(file, body);
}
if (check) { console.log(stale ? 'the scenario is out of date: node acceptance/m5/rush-level-scenario.mjs' : 'the scenario is up to date'); process.exit(stale ? 1 : 0); }
console.log(`${path.relative(root, SCENARIO)}: ${rows.length} rows, ${rows.reduce((a, r) => a + r.steps.length, 0)} steps; ids the editor gives: ${JSON.stringify(Object.fromEntries(ids))}`);
