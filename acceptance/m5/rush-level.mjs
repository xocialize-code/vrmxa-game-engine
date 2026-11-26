// M5 W10 (AB-T-0620), exit check 8, completed in M6 W1 (AB-T-0638, M6 exit check 5): the sample game's level built by
// hand in the Mac editor (apps/editor-mac/docs/hand-test/HAND-TEST-M5-LEVEL.scenario.md), all of it: the game layer's
// nodes, every behaviour (the player's, the three regulars' brains with their vars, the three tableZones with their
// params) and all 19 connections, with the committed ids.
//
// The scenario starts from the level's room, written here from the committed level: its game layer taken out (the rules
// and everything under them, the dialogues, the table areas, the trays and the till), every behaviour and connection taken
// out, every asset entry kept (an entry the editor finds for a file it places is reused, so the entries keep the file's
// order). The scenario builds the rest back through the inspector; `compare` then holds what it saved against the
// committed level, byte for byte.
//
//   node acceptance/m5/rush-level.mjs base <out.vrmxs>            the room the scenario starts from
//   node acceptance/m5/rush-level.mjs compare <built.vrmxs> [--out <json>]
//        the saved file against the committed level: the same bytes, and where they differ, by id: nodes missing, extra
//        or differing (which fields), connections by place, asset entries. Exit 1 unless the bytes are the same.
import fs from 'node:fs';
import path from 'node:path';
import { parse, serialize, createValidator } from '@vrmxg/scene';
import { m0Registry } from '@vrmxg/registry/m0';
import { declareProjectBehaviours } from '@vrmxg/registry';

const root = path.resolve(import.meta.dirname, '../..');
const LEVEL = path.join(root, 'content/sample/game/level.vrmxs');
const GAME_TYPES = new Set(['GameRules', 'GameCounter', 'GameTimer', 'GameGoal', 'Checkpoint', 'Dialogue', 'Area']);
const GAME_ITEMS = /^game\/items\//;

/** The committed level split into its room (no game layer, no behaviours, no connections; every asset entry) and its game layer. */
export function split(doc = parse(fs.readFileSync(LEVEL, 'utf8'))) {
  const assetRef = new Map(doc.assets.map((a) => [a.id, a.ref]));
  const isGame = (n) => GAME_TYPES.has(n.type) || (n.type === 'Item' && GAME_ITEMS.test(assetRef.get(n.asset) ?? ''));
  const game = doc.nodes.filter(isGame), ids = new Set(game.map((n) => n.id));
  const room = { ...doc, nodes: doc.nodes.filter((n) => !ids.has(n.id)).map(({ behaviours: _b, ...n }) => n), connections: [] };
  const behaviours = doc.nodes.filter((n) => !ids.has(n.id) && n.behaviours?.length).map((n) => ({ id: n.id, behaviours: n.behaviours }));
  return { doc, room, game, behaviours, assetRef };
}

/** A registry with the Morning Rush's behaviours declared (their static describe, M6 W0), as the editor has it. */
export async function rushRegistry() {
  const reg = m0Registry();
  declareProjectBehaviours(reg, await import(path.join(root, 'content/sample/game/behaviours.js')));
  return reg;
}

const eq = (a, b) => JSON.stringify(sort(a)) === JSON.stringify(sort(b));
function sort(v) { return Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v; }

/**
 * A built scene against the committed level: `same` when the canonical texts are equal; otherwise where they differ, by
 * id (nodes and asset entries) and by place (the node order, connections).
 * @param {any} built a parsed .vrmxs document
 */
export function compare(built) {
  const doc = parse(fs.readFileSync(LEVEL, 'utf8'));
  const want = serialize(doc), got = serialize(built);
  const byId = (list) => new Map((list ?? []).map((x) => [x.id, x]));
  const wn = byId(doc.nodes), bn = byId(built.nodes);
  const nodes = [];
  for (const [id, w] of wn) {
    const b = bn.get(id);
    if (!b) { nodes.push({ node: id, found: false }); continue; }
    const fields = [...new Set([...Object.keys(w), ...Object.keys(b)])].filter((k) => !eq(w[k], b[k]));
    nodes.push({ node: id, found: true, same: !fields.length, ...(fields.length ? { fields } : {}) });
  }
  const extra = [...bn.keys()].filter((id) => !wn.has(id));
  const order = doc.nodes.map((n) => n.id).join(' ') === (built.nodes ?? []).map((n) => n.id).join(' ');
  const wc = doc.connections ?? [], bc = built.connections ?? [];
  const connections = wc.map((c, i) => ({ index: i, want: `${c.from}.${c.signal} → ${c.to}.${c.call}`, same: !!bc[i] && eq(c, bc[i]), ...(bc[i] && !eq(c, bc[i]) ? { got: bc[i] } : {}) }));
  const wa = byId(doc.assets), ba = byId(built.assets);
  const assets = { same: eq(doc.assets, built.assets), missing: [...wa.keys()].filter((id) => !eq(wa.get(id), ba.get(id))), extra: [...ba.keys()].filter((id) => !wa.has(id)) };
  const rest = ['format', 'version', 'id', 'settings'].filter((k) => !eq(doc[k], built[k]));
  return {
    same: want === got, bytes: { want: Buffer.byteLength(want), got: Buffer.byteLength(got) },
    nodes, extra, order, connections: { want: wc.length, got: bc.length, same: connections.filter((c) => c.same).length, list: connections, extra: bc.slice(wc.length) },
    assets, rest,
  };
}

const [cmd, file] = process.argv[1] === import.meta.filename ? process.argv.slice(2) : [null];
if (cmd === null) { /* imported */ } else if (cmd === 'base') {
  const { room, game, behaviours, doc } = split();
  const { check } = createValidator(m0Registry());
  const r = check(room, { prefabs: new Map() });
  if (!r.ok) { console.error(r.errors.join('\n')); process.exit(1); }
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, serialize(room));
  console.log(`${file}: the level's room, ${room.nodes.length} nodes (the game layer's ${game.length} nodes, ${behaviours.length + game.filter((n) => n.behaviours).length} nodes' behaviours and ${doc.connections.length} connections are the scenario's to add)`);
} else if (cmd === 'compare') {
  const built = parse(fs.readFileSync(file, 'utf8'));
  const { check } = createValidator(await rushRegistry());
  const valid = check(built, { prefabs: new Map() });
  const r = compare(built);
  for (const n of r.nodes) if (!n.found || !n.same) console.log(`${!n.found ? 'MISSING' : 'DIFFERS'} ${n.node}${n.fields ? `: ${n.fields.join(', ')}` : ''}`);
  for (const id of r.extra) console.log(`EXTRA   ${id}`);
  for (const c of r.connections.list) if (!c.same) console.log(`CONNECTION ${c.index + 1} ${c.want}: ${c.got ? `got ${JSON.stringify(c.got)}` : 'missing'}`);
  if (!r.order) console.log('the node order differs');
  if (!r.assets.same) console.log(`the asset entries differ: ${JSON.stringify(r.assets)}`);
  if (r.rest.length) console.log(`differs: ${r.rest.join(', ')}`);
  const ok = r.same && valid.ok;
  console.log(`${r.same ? 'the same bytes as the committed level' : 'NOT the committed level\'s bytes'} (${r.bytes.got} of ${r.bytes.want}): ${r.nodes.filter((n) => n.same).length} of ${r.nodes.length} nodes, ${r.connections.same} of ${r.connections.want} connections, ids included; the built scene is ${valid.ok ? 'valid' : `invalid: ${valid.errors.join('; ')}`}`);
  const at = process.argv.indexOf('--out');
  if (at > 0) fs.writeFileSync(process.argv[at + 1], `${JSON.stringify({ check: 'M6 exit check 5 / M5 exit check 8 (the sample game\'s level built in the Mac editor, all of it: AB-T-0620, AB-T-0638): the saved level against the committed one, byte for byte', ok, valid: valid.ok, ...r }, null, 1)}\n`);
  process.exit(ok ? 0 : 1);
} else { console.error('usage: node acceptance/m5/rush-level.mjs base <out.vrmxs> | compare <built.vrmxs> [--out <json>]'); process.exit(2); }
