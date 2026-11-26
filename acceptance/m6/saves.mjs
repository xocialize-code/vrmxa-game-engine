// M6 W5 (AB-T-0631, AB-D-0297 item 3): saves across game updates, on the sample game, "The Morning Rush".
//
//   node acceptance/m6/saves.mjs [--out acceptance/results/m6-saves/summary.json]
//
// The sample project is copied into a temporary folder and exported with the game app's runtime (build A). A session is
// played on A as the game app plays one (GameSession, the scripted player from M5 W10 on a stand-in gamepad), saved into
// slot-1 at step SAVE_AT, and played on for MORE steps: the hash after every one of those steps is the unbroken run.
// Then the copy is changed and exported again, one change at a time:
//
//   texture   an image inside props/espresso-machine.glb re-encoded with other pixels (a valid PNG; the model's
//             geometry untouched)          → the save loads, and the same input from there gives the same hashes
//   audio     sounds/music.wav's samples changed (the same header and length)  → the same
//   release   game.json's release 0.1.0 → 0.2.0                                  → the same
//   comment   a line added to game/behaviours.js: the game's own behaviours (pressToStart, tableZone) declare their
//             state (M6 W0), so their code may change                            → the same
//   declared  pressToStart's declared state rewritten (null → an object)         → refused: the behaviour's state
//   code      a build where pressToStart declares nothing (its describe renamed away), a save made there, then a line
//             added to the module                                                → refused: the behaviour's code
//   scene     the espresso machine in game/level.vrmxs moved 1 cm                                   → refused: scenes, game/level.vrmxs
//   item      a byte added to game/items/till.vrmxi (an item counts whole)       → refused: assets
//   input     an action added to game.json's action map                           → refused: input
//
// And A's session log is refused by the texture build's replay (a log replays only on the whole build it was played
// on). Needs the game app built (npm run build -w @vrmxg/game-app) and vrmxa-core beside the repository.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { VirtualDevice } from '@vrmxg/input';
import { MemoryStore } from '@vrmxg/save';
import { openFolder, behavioursImporter, exportToFolder } from '@vrmxg/bundle/node';
import { vrmxaCore, PATHS } from '../../engine/packages/character/test/fixtures.mjs';
import { gameScenes, worldLoader, freeWorld } from '../../apps/game/src/world.js';
import { GameSession, replaySession, firstDifference } from '../../apps/game/src/session.js';
import { assertFreshRuntime, GAME_RUNTIME } from '../../apps/game/scripts/test-game.mjs';
import { createRushPlayer } from '../m5/rush-player.js';
import { RUSH_PLANS } from '../m5/rush-node.mjs';

const here = import.meta.dirname, root = path.join(here, '../..');
const SAVE_AT = 60 * 50, MORE = 60 * 30, STAMP = () => '2026-11-26T09:00:00.000Z';
const args = process.argv.slice(2), outFile = args.includes('--out') ? path.resolve(args[args.indexOf('--out') + 1]) : path.join(root, 'acceptance/results/m6-saves/summary.json');
if (!fs.existsSync(PATHS.core)) { console.error('needs vrmxa-core beside the repository'); process.exit(1); }
assertFreshRuntime(GAME_RUNTIME);
installPortableMath();

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-m6-saves-')), project = path.join(tmp, 'project');
fs.cpSync(path.join(root, 'content/sample'), project, { recursive: true });
const R = await loadRapier(), core = await vrmxaCore(), closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));

let builds = 0;
/** Export the copy as it is now. */
async function exportNow() {
  const out = path.join(tmp, `build-${++builds}`);
  const r = await exportToFolder({ project, runtime: GAME_RUNTIME, out, gameFile: 'game/game.json' });
  return { dir: r.out, digest: r.manifest.digest, compat: r.manifest.compat };
}

/** A session on a build, as the game app makes one, with a stand-in gamepad in every world. */
async function sessionOn(b, store) {
  const build = await openFolder(b.dir);
  const scenes = gameScenes(build.bytes, build.game), docs = await scenes.documents();
  const load = worldLoader({ R, scenes, behaviours: await build.behaviours(behavioursImporter(b.dir)), actions: await build.actions(), vrmxaCore: core, closet, options: () => ({ stubTextures: true }) });
  const pad = new VirtualDevice();
  const session = new GameSession({
    game: build.game, digest: build.manifest.digest, compat: build.manifest.compat ?? null, load, unload: freeWorld, store, stamp: STAMP,
    scenes: docs.scenes, prefabs: docs.prefabs, hashes: true, onWorld: (tree) => tree.services.get('input').addDevice(pad),
  });
  return { session, pad, build, docs, load };
}

/** One step with a decision on the pad (the scripted player's, or a recorded one). */
async function stepWith(s, d) {
  const tree = s.session.tree, buttons = new Array(17).fill(0);
  if (d.interact) buttons[2] = 1;
  s.pad.setGamepad([d.stick[0], -d.stick[1], 0, 0], buttons);
  if (d.choose) tree.services.get('input').choose('dialogue.choose', d.choose);
  while (!s.session.advance()) await s.session.flow.settle();
}

// build A: New Game, the winning plan to SAVE_AT, saved, then MORE steps with every decision kept
const t0 = performance.now();
const store = new MemoryStore();
const A = await exportNow();
const a = await sessionOn(A, store);
await a.session.newGame(); // the pad is in every world through onWorld, the first one too
const player = createRushPlayer(RUSH_PLANS.win);
while (a.session.step < SAVE_AT) await stepWith(a, player.decide(a.session.tree));
await a.session.saveSlot('slot-1');
const savedScene = a.session.scene, from = a.session.trace.length, decisions = [];
for (let i = 0; i < MORE; i++) { const d = player.decide(a.session.tree); decisions.push(d); await stepWith(a, d); }
const unbroken = a.session.trace.slice(from), logA = a.session.end();
console.log(`build A ${A.digest.slice(0, 12)} (fingerprint ${A.compat.digest.slice(0, 12)}): saved at step ${SAVE_AT} in ${savedScene}, ${MORE} steps on (${((performance.now() - t0) / 1000).toFixed(1)} s)`);

/** Load slot-1 on a build and play the recorded decisions: → { loaded, error, same } */
async function goOn(b, { slot = 'slot-1', play = true } = {}) {
  const s = await sessionOn(b, store);
  try {
    await s.session.loadSlot(slot);
  } catch (e) {
    return { loaded: false, error: e.message, code: e.code ?? null, parts: (e.problems ?? []).map((p) => p.part) };
  }
  if (!play) { s.session.end(); return { loaded: true }; }
  const start = s.session.trace.length;
  for (const d of decisions) await stepWith(s, d);
  const diff = firstDifference(s.session.trace.slice(start), unbroken);
  s.session.end();
  return { loaded: true, steps: decisions.length, firstDifference: diff, same: diff === -1 };
}

// the project's files, changed and put back
const file = (ref) => path.join(project, ref);
const original = new Map();
const change = (ref, fn) => { if (!original.has(ref)) original.set(ref, fs.readFileSync(file(ref))); fs.writeFileSync(file(ref), fn(fs.readFileSync(file(ref)))); };
const restore = () => { for (const [ref, bytes] of original) fs.writeFileSync(file(ref), bytes); original.clear(); };

const results = {};
const check = async (name, what, fn, expect) => {
  fn();
  const b = await exportNow();
  const r = await goOn(b, { play: expect === 'loads' });
  restore();
  const ok = expect === 'loads' ? r.loaded && r.same && b.digest !== A.digest && b.compat.digest === A.compat.digest
    : !r.loaded && r.code === 'incompatible_save' && r.parts.length === 1 && r.parts[0] === expect;
  results[name] = { what, digestChanged: b.digest !== A.digest, fingerprintChanged: b.compat.digest !== A.compat.digest, ...r, expect, ok };
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${r.loaded ? `loaded, ${r.steps} steps on, ${r.same ? 'the same hashes' : `differs at ${r.firstDifference}`}` : `refused (${r.parts.join(', ')}): ${r.error}`}`);
  return b;
};

const T = await check('texture', 'an image inside props/espresso-machine.glb re-encoded with other pixels', () => change('props/espresso-machine.glb', (b) => recolourGlbImage(b, 0)), 'loads');
await check('audio', 'sounds/music.wav\'s samples changed (the same header and length)', () => change('sounds/music.wav', changeSamples), 'loads');
await check('release', 'game.json\'s release 0.1.0 → 0.2.0', () => change('game/game.json', (b) => editJson(b, (g) => { g.release = '0.2.0'; })), 'loads');
const addLine = (b) => Buffer.concat([b, Buffer.from('// a line added by acceptance/m6/saves.mjs\n')]);
await check('comment', 'a line added to game/behaviours.js (its behaviours declare their state: their code may change)', () => change('game/behaviours.js', addLine), 'loads');
const NULL_STATE = "state: { type: 'null', description: 'Nothing: it reads the input of the step it runs on.' },";
await check('declared', 'pressToStart\'s declared state rewritten from null to an object', () => change('game/behaviours.js', (b) => Buffer.from(String(b).replace(NULL_STATE, "state: { type: 'object', properties: { pressed: { type: 'boolean' } } },"))), 'behaviours');
await check('scene', 'the espresso machine in game/level.vrmxs moved 1 cm', () => change('game/level.vrmxs', (b) => editJson(b, moveANode)), 'scenes');
await check('item', 'a byte added to game/items/till.vrmxi', () => change('game/items/till.vrmxi', (b) => Buffer.concat([b, Buffer.from([0])])), 'assets');
await check('input', 'an action added to game.json\'s action map', () => change('game/game.json', (b) => editJson(b, (g) => { g.input.actions.crouch = { type: 'button', bindings: [{ key: 'KeyX' }] }; })), 'input');

// undeclared code: a build where pressToStart has no describe of its own (so it counts by the module's code), a save
// made there, then a line added to the module
const undeclare = (b) => { const t = String(b), i = t.indexOf('export class pressToStart extends Behaviour {'); if (i < 0 || t.indexOf('static describe = {', i) < 0) throw new Error('game/behaviours.js: no pressToStart with a describe'); const j = t.indexOf('static describe = {', i); return Buffer.from(t.slice(0, j) + 'static notDescribe = {' + t.slice(j + 'static describe = {'.length)); };
change('game/behaviours.js', undeclare);
const C1 = await exportNow();
const c1 = await sessionOn(C1, store);
await c1.session.newGame();
for (let i = 0; i < 30; i++) await stepWith(c1, { stick: [0, 0], interact: false, choose: null });
await c1.session.saveSlot('slot-2');
c1.session.end();
change('game/behaviours.js', addLine);
const C2 = await exportNow();
restore();
const cr = await goOn(C2, { slot: 'slot-2', play: false });
results.code = { what: 'pressToStart declares nothing; a line added to its module between two exports', tag: C1.compat.behaviours.pressToStart, ...cr, expect: 'behaviours', ok: /^code:/.test(C1.compat.behaviours.pressToStart) && !cr.loaded && cr.parts.join() === 'behaviours' && /the code of the behaviour pressToStart changed/.test(cr.error) };
console.log(`${results.code.ok ? 'ok  ' : 'FAIL'} code: ${cr.loaded ? 'loaded' : `refused: ${cr.error}`}`);
results.declared.ok &&= /the state the behaviour pressToStart keeps changed/.test(results.declared.error ?? '');

// a log from build A doesn't replay on the texture build: the whole digest
const t = await sessionOn(T, store);
const replay = await replaySession(logA, { digest: T.digest, load: t.load, unload: freeWorld, scenes: t.docs.scenes, prefabs: t.docs.prefabs }).then(() => null, (e) => e.message);
results.replay = { what: 'build A\'s session log replayed on the texture build', error: replay, ok: /a log replays only on the build it was played on/.test(replay ?? '') };
console.log(`${results.replay.ok ? 'ok  ' : 'FAIL'} replay: ${replay}`);

const ok = Object.values(results).every((r) => r.ok);
const summary = {
  task: 'AB-T-0631', what: 'saves across game updates on the Morning Rush (acceptance/m6/saves.mjs)', saveAt: SAVE_AT, steps: MORE, savedIn: savedScene,
  runtime: JSON.parse(fs.readFileSync(path.join(A.dir, 'vrmxg-build.json'), 'utf8')).runtime.version,
  build: { digest: A.digest, fingerprint: A.compat.digest, parts: A.compat.parts, behaviours: A.compat.behaviours },
  results, ok, seconds: Math.round((performance.now() - t0) / 100) / 10,
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 1)}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${ok ? 'PASS' : 'FAIL'} → ${path.relative(root, outFile)}`);
process.exit(ok ? 0 : 1);

// ---------------------------------------------------------------- the changes

function editJson(b, fn) { const doc = JSON.parse(String(b)); fn(doc); return Buffer.from(`${JSON.stringify(doc, null, 1)}\n`); }

/** Move the espresso machine (a model with no colliders) by 1 cm along x: a node changed, nothing else. */
function moveANode(doc) {
  const n = doc.nodes.find((x) => x.id === 'espresso');
  if (!Array.isArray(n?.transform?.p)) throw new Error('game/level.vrmxs has no espresso machine with a position');
  n.transform.p[0] += 0.01;
}

/** A WAV's samples changed after its header, keeping its length: another sound of the same duration. */
function changeSamples(b) {
  const out = Buffer.from(b);
  const data = out.indexOf('data', 12);
  for (let i = data + 8 + 64; i < out.length; i += 97) out[i] ^= 0x10;
  return out;
}

/** One embedded PNG of a GLB re-encoded with its pixels changed (a valid image), the GLB rebuilt around it. */
function recolourGlbImage(glb, index) {
  const jsonLen = glb.readUInt32LE(12), json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8, bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLen));
  const views = json.bufferViews.map((v) => Buffer.from(bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)));
  const vi = json.images[index].bufferView;
  views[vi] = recolourPng(views[vi]);
  const parts = [];
  let offset = 0;
  json.bufferViews.forEach((v, i) => { v.byteOffset = offset; v.byteLength = views[i].length; const pad = (4 - (views[i].length % 4)) % 4; parts.push(views[i], Buffer.alloc(pad)); offset += views[i].length + pad; });
  json.buffers[0].byteLength = offset;
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const binary = Buffer.concat(parts), head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + binary.length, 8);
  jh.writeUInt32LE(js.length, 0); jh.write('JSON', 4); bh.writeUInt32LE(binary.length, 0); bh.write('BIN\0', 4);
  return Buffer.concat([head, jh, js, bh, binary]);
}

function recolourPng(png) {
  const chunks = [];
  for (let p = 8; p < png.length;) { const len = png.readUInt32BE(p), type = png.toString('latin1', p + 4, p + 8); chunks.push({ type, data: png.subarray(p + 8, p + 8 + len) }); p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const ihdr = chunks.find((c) => c.type === 'IHDR').data, width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  const stride = (raw.length / height) | 0;
  for (let y = 0; y < height; y += 3) for (let x = 1; x < stride; x += 5) raw[y * stride + x] ^= 0x20; // filter bytes left alone
  const out = [png.subarray(0, 8)];
  const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32BE(data.length, 0); h.write(type, 4, 'latin1'); const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])) >>> 0, 0); return Buffer.concat([h, data, c]); };
  let wroteData = false;
  for (const c of chunks) {
    if (c.type === 'IDAT') { if (!wroteData) { out.push(chunk('IDAT', zlib.deflateSync(raw))); wroteData = true; } continue; }
    out.push(chunk(c.type, c.data));
  }
  if (!width) throw new Error('not a PNG');
  return Buffer.concat(out);
}
