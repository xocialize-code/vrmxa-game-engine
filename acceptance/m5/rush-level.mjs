// M5 W10 (AB-T-0620), exit check 8: the sample game's level built by hand in the Mac editor
// (apps/editor-mac/docs/hand-test/HAND-TEST-M5-LEVEL.scenario.md). The editor can't attach a behaviour or wire a
// connection (AB-T-0638), so the scenario starts from the level's room: the set, lights, doors, stools, Mira, Hana and
// the three regulars with their behaviours, written here from the committed level by taking its game layer out (the
// rules and everything under them, the dialogues, the table areas, the trays, the till, and every connection). The
// scenario adds the game layer back by hand; `compare` then holds what it saved against the committed level.
//
//   node acceptance/m5/rush-level.mjs base <out.vrmxs>            the room the scenario starts from
//   node acceptance/m5/rush-level.mjs compare <built.vrmxs> [--out <json>]
//        every game-layer node of the committed level found in the built scene (by type and key, name or asset) with
//        the same parent, props and position; what the editor couldn't author (behaviours on the new nodes,
//        connections) listed apart. Exit 1 when a node is missing or differs.
import fs from 'node:fs';
import path from 'node:path';
import { parse, serialize } from '@vrmxg/scene';
import { m0Registry } from '@vrmxg/registry/m0';
import { createValidator } from '@vrmxg/scene';

const root = path.resolve(import.meta.dirname, '../..');
const LEVEL = path.join(root, 'content/sample/game/level.vrmxs');
const GAME_TYPES = new Set(['GameRules', 'GameCounter', 'GameTimer', 'GameGoal', 'Checkpoint', 'Dialogue', 'Area']);
const GAME_ITEMS = /^game\/items\//;

/** The committed level split into its room and its game layer. */
export function split(doc = parse(fs.readFileSync(LEVEL, 'utf8'))) {
  const assetRef = new Map(doc.assets.map((a) => [a.id, a.ref]));
  const isGame = (n) => GAME_TYPES.has(n.type) || (n.type === 'Item' && GAME_ITEMS.test(assetRef.get(n.asset) ?? ''));
  const game = doc.nodes.filter(isGame), ids = new Set(game.map((n) => n.id));
  const room = { ...doc, nodes: doc.nodes.filter((n) => !ids.has(n.id)), connections: [] };
  room.assets = doc.assets.filter((a) => room.nodes.some((n) => n.asset === a.id));
  return { doc, room, game, assetRef };
}

const REG = m0Registry();
const SPATIAL = new Set(['Area', 'Item']); // where a node stands matters; a rules node's place in the room doesn't
const KEYED = new Set(['GameCounter', 'GameTimer', 'GameGoal']);
const close = (a, b) => (a ?? [0, 0, 0]).every((x, i) => Math.abs(x - (b ?? [0, 0, 0])[i]) < 1e-3);
const eq = (a, b) => JSON.stringify(sort(a)) === JSON.stringify(sort(b));
function sort(v) { return Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v; }

/** Compare a built scene's game layer with the committed level's. */
export function compare(built) {
  const { doc, game, assetRef } = split();
  const bAsset = new Map(built.assets.map((a) => [a.id, a.ref]));
  const used = new Set();
  // how a node is recognised: a game node by its key (its id when it has none), an Area by its name, an Item by its asset
  // (never by id: the editor gives its own). A Dialogue without a name by its first line, a Checkpoint by its slot.
  const sig = (n, refs) => {
    if (n.type === 'Item') return `Item:${refs.get(n.asset)}`;
    if (n.type === 'Area') return `Area:${n.name ?? ''}`;
    if (n.type === 'Dialogue') return `Dialogue:${n.name ?? n.props?.lines?.[0]?.text ?? ''}`;
    if (n.type === 'Checkpoint') return `Checkpoint:${n.props?.slot ?? ''}`;
    if (n.type === 'GameRules') return 'GameRules';
    return `${n.type}:${n.props?.key ?? n.id}`;
  };
  const byId = new Map(), rows = [];
  for (const want of game) {
    const s = sig(want, assetRef), got = built.nodes.find((n) => !used.has(n.id) && sig(n, bAsset) === s);
    if (got) { used.add(got.id); byId.set(want.id, got.id); }
    rows.push({ want, got, sig: s });
  }
  // a speaker or a node reference in the built scene uses the built ids: map the committed ids before comparing
  const roomIds = new Set(doc.nodes.map((n) => n.id).filter((id) => !game.some((g) => g.id === id)));
  const mapIds = (v) => JSON.parse(JSON.stringify(v ?? null), (k, x) => (typeof x === 'string' && byId.has(x) && !roomIds.has(x) ? byId.get(x) : x));
  const out = rows.map(({ want, got, sig: s }) => {
    if (!got) return { node: want.id, sig: s, found: false };
    const diffs = [];
    const parentWant = want.parent && byId.has(want.parent) ? byId.get(want.parent) : want.parent;
    if ((got.parent ?? 'root') !== (parentWant ?? 'root')) diffs.push(`parent ${got.parent} (want ${parentWant})`);
    if (SPATIAL.has(want.type) && !close(got.transform?.p, want.transform?.p)) diffs.push(`position ${JSON.stringify(got.transform?.p ?? null)} (want ${JSON.stringify(want.transform?.p ?? null)})`);
    if ((got.name ?? null) !== (want.name ?? null) && want.type !== 'GameRules') diffs.push(`name ${JSON.stringify(got.name ?? null)} (want ${JSON.stringify(want.name ?? null)})`);
    // a prop either side leaves out is its default (the registry's), and a game node's key is its id by default
    const def = (n, k) => (k === 'key' && KEYED.has(n.type) ? n.id : REG.get(n.type)?.props?.[k]?.schema?.default);
    const prop = (n, k) => n.props?.[k] ?? def(n, k);
    const keys = new Set([...Object.keys(want.props ?? {}), ...Object.keys(got.props ?? {})]);
    // a node reference into the game layer is mapped to the built ids; a key is a name in the game state, not a reference
    for (const k of keys) if (!eq(prop(got, k), k === 'key' ? prop(want, k) : mapIds(prop(want, k)))) diffs.push(`props.${k}`);
    return { node: want.id, sig: s, found: true, as: got.id, same: !diffs.length, diffs, behaviours: (want.behaviours ?? []).map((b) => b.use) };
  });
  const connections = doc.connections.length, builtConnections = (built.connections ?? []).length;
  return { nodes: out, connections, builtConnections };
}

const [cmd, file] = process.argv[1] === import.meta.filename ? process.argv.slice(2) : [null];
if (cmd === null) { /* imported */ } else if (cmd === 'base') {
  const { room } = split();
  const { check } = createValidator(m0Registry());
  const r = check(room, { prefabs: new Map() });
  if (!r.ok) { console.error(r.errors.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, serialize({ ...room, id: 'rush-built' }));
  console.log(`${file}: the level's room, ${room.nodes.length} nodes (the game layer, ${split().game.length} nodes and ${split().doc.connections.length} connections, is the scenario's to add)`);
} else if (cmd === 'compare') {
  const built = parse(fs.readFileSync(file, 'utf8'));
  const { check } = createValidator(m0Registry());
  const valid = check(built, { prefabs: new Map() });
  const r = compare(built);
  for (const n of r.nodes) console.log(`${!n.found ? 'MISSING' : n.same ? 'same   ' : 'DIFFERS'} ${n.sig.padEnd(44)} ${n.found ? `as ${n.as}` : ''}${n.diffs?.length ? `: ${n.diffs.join('; ')}` : ''}${n.behaviours?.length ? ` (its behaviours: ${n.behaviours.join(', ')}, AB-T-0638)` : ''}`);
  const ok = valid.ok && r.nodes.every((n) => n.found && n.same);
  console.log(`${r.nodes.filter((n) => n.same).length} of ${r.nodes.length} game-layer nodes as committed; the level's ${r.connections} connections not authored (the editor has no connections, AB-T-0638); the built scene is ${valid.ok ? 'valid' : `invalid: ${valid.errors.join('; ')}`}`);
  const at = process.argv.indexOf('--out');
  if (at > 0) fs.writeFileSync(process.argv[at + 1], `${JSON.stringify({ check: 'M5 exit check 8 (the sample game\'s level built in the Mac editor, AB-T-0620): the game layer the scenario built against the committed level', ok, valid: valid.ok, ...r }, null, 1)}\n`);
  process.exit(ok ? 0 : 1);
} else { console.error('usage: node acceptance/m5/rush-level.mjs base <out.vrmxs> | compare <built.vrmxs> [--out <json>]'); process.exit(2); }
