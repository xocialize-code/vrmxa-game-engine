// The sample game, "The Morning Rush" (M5 W10, AB-T-0620, design AB-D-0293): everything under game/ but the voice clips
// (tools/make-game-voice.py) and the behaviours (game/behaviours.js, written by hand). Re-run to regenerate; the outputs
// are committed, and a run that changes nothing writes the same bytes.
//
//   game/game.json                     the game document (vrmxg-game): title → level → won | lost → title
//   game/title.vrmxs, level.vrmxs,     the four scenes, validated against the registry and in canonical form
//     won.vrmxs, lost.vrmxs
//   game/brains/regular.json           the regulars' brain: walk in, sit, wait to be served, react, then stay and sip
//   game/items/order-{1,2,3}.vrmxi     the order trays (VRMXI pickups: waiting → ready, a take verb that carries)
//   game/items/till.vrmxi              the till (locked → open → closed, a use verb that closes it)
//   game/animations.json               the sample's animation set plus the carry clip and a `carry` slot (the sample's
//                                      own animations.json is left alone, so no existing replay can move)
//   game/voice/lines.json              the voiced lines (make-game-voice.py bakes them into game/voice/)
//
//   node content/sample/tools/make-game.mjs [--check]     --check: write nothing, exit 1 when a file would change
// Needs vrmxa-avatar-studio beside the repo (vrmxa-core packs the items and hashes the clip).
import fs from 'node:fs';
import path from 'node:path';
import { writeGLBTree } from '@vrmxg/model';
import { packItem } from '@vrmxg/item';
import { m0Registry } from '@vrmxg/registry/m0';
import { createValidator, parse, serialize } from '@vrmxg/scene';
import { vrmxaCore as loadCore } from '../../../engine/packages/character/test/fixtures.mjs';

const root = path.resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
const GEN = 'VRMXG sample game (content/sample/tools/make-game.mjs)';
const changed = [];
const write = (rel, bytes) => {
  const file = path.join(root, rel), data = typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes);
  const same = fs.existsSync(file) && Buffer.compare(fs.readFileSync(file), data) === 0;
  if (same) return;
  changed.push(rel);
  if (check) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  console.log('wrote', rel, data.length, 'bytes');
};
const json = (v) => `${JSON.stringify(v, null, 1)}\n`;
const core = await loadCore();

// ---------------------------------------------------------------- the lines (ids are the clips' names under game/voice/)
// Hana is af_heart (her voice in the sample); the regulars af_sky and af_bella (Mira's voice: she has no lines here,
// her words are the player's choices).
export const LINES = [
  { id: 'hana-brief', voice: 'af_heart', text: 'Morning, Mira! Three regulars are due. Take their orders, bring each one what I make, and close the till before ten.' },
  { id: 'hana-brief-ready', voice: 'af_heart', text: 'That\'s the spirit. Here comes Aoi!' },
  { id: 'hana-brief-coffee', voice: 'af_heart', text: 'After the rush! Here comes Aoi.' },
  { id: 'aoi-ask', voice: 'af_sky', text: 'Morning! Something warm and milky, please. Not too strong.' },
  { id: 'aoi-right', voice: 'af_sky', text: 'Perfect. Thank you!' },
  { id: 'aoi-wrong', voice: 'af_sky', text: 'Oh. Well, if you say so.' },
  { id: 'ren-ask', voice: 'af_bella', text: 'Hi! Something cold, please? It\'s already warm out.' },
  { id: 'ren-right', voice: 'af_bella', text: 'Lovely, thanks.' },
  { id: 'ren-wrong', voice: 'af_bella', text: 'Hot? Hm. All right, then.' },
  { id: 'yuki-ask', voice: 'af_sky', text: 'Just a green tea for me, please.' },
  { id: 'yuki-right', voice: 'af_sky', text: 'Thank you!' },
  { id: 'yuki-wrong', voice: 'af_sky', text: 'That\'s not what I said. But fine.' },
  { id: 'hana-up-1', voice: 'af_heart', text: 'Order up for table one!' },
  { id: 'hana-up-2', voice: 'af_heart', text: 'Order up for table two!' },
  { id: 'hana-up-3', voice: 'af_heart', text: 'Order up for table three!' },
  { id: 'hana-close', voice: 'af_heart', text: 'That\'s everyone! Close the till, Mira.' },
  { id: 'hana-won-clean', voice: 'af_heart', text: 'Not one mistake. Best morning rush ever, Mira!' },
  { id: 'hana-won-mixed', voice: 'af_heart', text: 'We made it! Even with a mix-up.' },
  { id: 'hana-won-bye', voice: 'af_heart', text: 'See you tomorrow.' },
  { id: 'hana-lost-time', voice: 'af_heart', text: 'Ten o\'clock, and the till is still open. We\'ll do better tomorrow.' },
  { id: 'hana-lost-orders', voice: 'af_heart', text: 'Two orders wrong. Let\'s call it a morning, and try again tomorrow.' },
];
const byId = new Map(LINES.map((l) => [l.id, l]));
const clip = (id) => `game/voice/${id}.wav`;
const line = (id, speaker, extra = {}) => ({ speaker, text: byId.get(id).text, clip: clip(id), ...extra });

// ---------------------------------------------------------------- items
const box3 = (size) => ({ type: 'box', box: { size } });
const META = { version: '1.0', authors: ['Xocialize LLC'], licenseUrl: 'https://vrm.dev/licenses/1.0/', commercialUsage: 'corporation', creditNotation: 'unnecessary', allowRedistribution: true, modification: 'allowModificationRedistribution' };
// The order trays: a tray on the counter (origin on the counter top), the drink shown once it is ready, a Reach sensor
// in front of the counter where Mira stands. Each table has its own (its own id, so the inventory tells them apart).
export const TRAYS = [
  { n: 1, id: '6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a61', cup: '#f3ead8', drink: 'latte' },
  { n: 2, id: '6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a62', cup: '#d9eef2', drink: 'iced tea' },
  { n: 3, id: '6f1c2a3e-4b5d-4e6f-8a7b-1c2d3e4f5a63', cup: '#e4f0d4', drink: 'green tea' },
];
const trayModel = (t) => writeGLBTree({ name: `Order ${t.n}`, generator: GEN, roots: ['Order'], nodes: [
  { name: 'Order', children: ['Tray', 'Number', 'Cup', 'Saucer', 'Reach'] },
  { name: 'Tray', t: [0, 0.01, 0], box: { size: [0.36, 0.02, 0.26], color: '#5b4636', roughness: 0.5 } },
  { name: 'Number', t: [-0.13, 0.025, 0.08], box: { size: [0.06, 0.01, 0.06 * t.n], color: '#e9e1d4' } },
  { name: 'Saucer', t: [0.04, 0.026, 0], box: { size: [0.14, 0.012, 0.14], color: '#ffffff', roughness: 0.3 } },
  { name: 'Cup', t: [0.04, 0.08, 0], box: { size: [0.08, 0.1, 0.08], color: t.cup, roughness: 0.3 } },
  { name: 'Reach', t: [0, -0.3, 0.75], trigger: box3([0.7, 1.6, 1.0]) },
] });
const trayManifest = (t) => ({
  format: 'vrmxi', version: 1, id: t.id, revision: 1, name: `Order for table ${t.n}`,
  generator: GEN, type: 'pickup', tags: ['order:tray', `order:table-${t.n}`], model: { file: 'model.glb' },
  states: [
    { name: 'waiting', tags: ['order:waiting'], show: [] },
    { name: 'ready', tags: ['order:ready'], show: ['Cup', 'Saucer'] },
  ],
  // carry: the tray pose on the upper body while she walks (M5 W7, @vrmxg/interact); an engine-side field on the take verb
  verbs: [{ verb: 'take', prompt: `Take table ${t.n}'s order`, states: ['ready'], reach: 'Reach', carry: 'carry' }],
  takeable: false, extensions: {}, meta: META,
  listing: null, origin: { made: 'authored', source: 'content/sample/tools/make-game.mjs' }, madeWith: null, thumbnail: null, files: [],
});
export const TILL_ID = '7a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c80';
const tillModel = () => writeGLBTree({ name: 'Till', generator: GEN, roots: ['Till'], nodes: [
  { name: 'Till', children: ['Body', 'Screen', 'Drawer', 'Lamp open', 'Lamp closed', 'Reach'] },
  { name: 'Body', t: [0, 0.09, 0], box: { size: [0.34, 0.18, 0.3], color: '#3a3a3e', roughness: 0.5 } },
  { name: 'Screen', t: [0, 0.24, -0.06], box: { size: [0.26, 0.14, 0.03], color: '#1d2a33', roughness: 0.2 } },
  { name: 'Drawer', t: [0, 0.03, 0.17], box: { size: [0.3, 0.06, 0.1], color: '#55555b', roughness: 0.5 } },
  { name: 'Lamp open', t: [0.12, 0.2, 0.1], box: { size: [0.04, 0.03, 0.04], color: '#59c76b', roughness: 0.2 } },
  { name: 'Lamp closed', t: [0.12, 0.2, 0.1], box: { size: [0.04, 0.03, 0.04], color: '#c75959', roughness: 0.2 } },
  { name: 'Reach', t: [0, -0.3, 0.75], trigger: box3([0.7, 1.6, 1.0]) },
] });
const tillManifest = {
  format: 'vrmxi', version: 1, id: TILL_ID, revision: 1, name: 'Till', generator: GEN, type: 'switch', tags: ['till'], model: { file: 'model.glb' },
  states: [
    { name: 'locked', tags: ['till:busy'], show: ['Drawer'] },
    { name: 'open', tags: ['till:open'], show: ['Drawer', 'Lamp open'] },
    { name: 'closed', tags: ['till:closed'], show: ['Lamp closed'] },
  ],
  verbs: [{ verb: 'use', prompt: 'Close the till', states: ['open'], to: 'closed', reach: 'Reach' }],
  takeable: false, extensions: {}, meta: META,
  listing: null, origin: { made: 'authored', source: 'content/sample/tools/make-game.mjs' }, madeWith: null, thumbnail: null, files: [],
};
for (const t of TRAYS) write(`game/items/order-${t.n}.vrmxi`, await packItem({ manifest: trayManifest(t), model: trayModel(t), vrmxaCore: core }));
write('game/items/till.vrmxi', await packItem({ manifest: tillManifest, model: tillModel(), vrmxaCore: core }));

// ---------------------------------------------------------------- the game's animation set: the sample's, plus carry
const CARRY = 'animations/clips/carry.vrma';
const sampleAnimations = JSON.parse(fs.readFileSync(path.join(root, 'animations.json'), 'utf8'));
const carrySha = await core.sha256(new Uint8Array(fs.readFileSync(path.join(root, CARRY))));
const animations = {
  ...sampleAnimations,
  clips: [...sampleAnimations.clips, { sha256: carrySha, file: CARRY, name: 'carry', duration: 2, loops: true, rootMotion: 'inPlace', tracks: ['humanoid'], licence: 'CC0-1.0', source: 'generated by engine/packages/character/test/fixtures.mjs (tools/make-carry.mjs)' }],
  sets: sampleAnimations.sets.map((s) => (s.default ? { ...s, slots: { ...s.slots, carry: [{ clip: carrySha, weight: 1, blendIn: 0.3 }] } } : s)),
};
write('game/animations.json', json(animations));

// ---------------------------------------------------------------- the regulars' brain
const A = (d, args = {}) => ({ type: 'action', do: d, args });
write('game/brains/regular.json', json({
  format: 'vrmxg-brain', version: 1, name: 'A regular',
  about: 'The Morning Rush (M5 W10): a regular waits outside until her time ($arrive seconds), walks in through the left leaf of the double door ($door, $inside, then $entry), sits on her own stool ($seat), watches Mira until she is served (the goal "served", given by the table\'s tableZone behaviour with params.right), smiles and cheers or looks sad, and stays, sipping now and then. She doesn\'t leave: one doorway for coming and going jams the double door.',
  plan: { arrive: 0, door: [-0.62, 0, 7.6], inside: [-0.62, 0, 5.0], entry: [-0.4, 0, 4.0], seat: null, watch: 'mira' },
  senses: { sight: { range: 8, fov: 140, every: 6 } },
  tree: {
    type: 'sequence', children: [
      A('wait', { seconds: '$arrive' }),
      A('goTo', { point: '$door', timeout: 40 }),
      A('goTo', { point: '$inside', timeout: 40 }),
      A('goTo', { point: '$entry', timeout: 40 }),
      A('goTo', { target: '$seat', within: 0.9, timeout: 40 }),
      A('interact', { item: '$seat', verb: 'sit' }),
      A('lookAt', { target: '$watch' }),
      { type: 'until', test: 'goal', name: 'served', timeout: 900 },
      { type: 'selector', children: [
        { type: 'sequence', children: [{ type: 'condition', test: 'bb', key: 'goal.params.right' }, A('emote', { name: 'happy' }), A('gesture', { slot: 'cheer' })] },
        A('emote', { name: 'sad' }),
      ] },
      A('lookAt', {}),
      { type: 'set', key: 'served', value: true },
      { type: 'repeat', child: { type: 'sequence', children: [A('gesture', { slot: 'sip' }), A('wait', { min: 4, max: 7 })] } },
    ],
  },
}));

// ---------------------------------------------------------------- scenes
const PHYSICS = { physics: { build: 'deterministic', hz: 60 } };
const ENV = { id: 'env', type: 'Environment', parent: 'root', props: { ambientIntensity: 0.5, background: 'gradient', environmentIntensity: 0.35, skyHorizonColor: '#e6ecf2', skyTopColor: '#7aa6d6' } };
const SUN = { id: 'sun', type: 'DirectionalLight', parent: 'root', transform: { q: [-0.354, 0.354, 0.146, 0.854] }, props: { intensity: 2.4, shadowExtent: 10, shadowPreset: 'high' } };
const SET = [
  { id: 'set', type: 'Model', parent: 'root', asset: 'cafe' },
  { id: 'espresso', type: 'Model', parent: 'root', name: 'Espresso machine', asset: 'espresso', transform: { p: [1.2, 1.25, -4.3] }, props: { colliders: 'none' } },
];
const AMBIENCE = { id: 'ambience', type: 'AudioPlayer', parent: 'root', name: 'Room tone', asset: 'ambience', props: { autoplay: true, bus: 'ambience', loop: true, volume: 0.6 } };
const ASSET = {
  cafe: { id: 'cafe', type: 'glb', ref: 'sets/cafe.glb' },
  espresso: { id: 'espresso', type: 'glb', ref: 'props/espresso-machine.glb' },
  ambience: { id: 'ambience', type: 'audio', ref: 'sounds/cafe-ambience.wav' },
  music: { id: 'music', type: 'audio', ref: 'sounds/music.wav' },
  mira: { id: 'mira', type: 'vrmxa', ref: 'characters/mira.vrmxa' },
  hana: { id: 'hana', type: 'vrmxa', ref: 'characters/hana.vrmxa' },
  door: { id: 'cafe-door', type: 'vrmxi', ref: 'items/cafe-door.vrmxi' },
  stool: { id: 'stool', type: 'vrmxi', ref: 'items/stool.vrmxi' },
  till: { id: 'till', type: 'vrmxi', ref: 'game/items/till.vrmxi' },
};
const q90 = [0, 0.7071068, 0, 0.7071068], qm90 = [0, -0.7071068, 0, 0.7071068];
const STOOLS = [
  ['stool-1', [-3.75, 0, 1], q90], ['stool-2', [-2.25, 0, 1], qm90], ['stool-3', [2.25, 0, 1], q90], ['stool-4', [3.75, 0, 1], qm90],
  ['stool-5', [2.25, 0, -2], q90], ['stool-6', [3.75, 0, -2], qm90], ['stool-7', [-3.75, 0, -2.2], q90], ['stool-8', [-2.25, 0, -2.2], qm90],
].map(([id, p, q]) => ({ id, type: 'Item', parent: 'root', name: 'Stool', asset: 'stool', transform: { p, q } }));
const DOORS = [
  // propped open for the morning rush: three regulars coming in one after another jam a door that swings shut behind each
  { id: 'entrance-left', type: 'Item', parent: 'root', name: 'Entrance (left)', asset: 'cafe-door', transform: { p: [-0.5, 0, 6.1] }, props: { state: 'open' } },
  { id: 'entrance-right', type: 'Item', parent: 'root', name: 'Entrance (right)', asset: 'cafe-door', transform: { p: [0.5, 0, 6.1], q: [0, 1, 0, 0] }, props: { state: 'open' } },
  { id: 'door-staff', type: 'Item', parent: 'root', name: 'Staff door', asset: 'cafe-door', transform: { p: [6.1, 0, -3], q: [0, 0.7071068, 0, 0.7071068] }, props: { state: 'locked' } },
];
const hana = (p = [0.6, 0, -4.95]) => ({ id: 'hana-1', type: 'Character', parent: 'root', name: 'Hana', asset: 'hana', transform: { p }, props: { controller: 'npc' } });
const scene = (id, assets, nodes, connections) => ({ format: 'vrmxs', version: 1, id, assets, nodes: [{ id: 'root', type: 'Node3D', name: id[0].toUpperCase() + id.slice(1) }, ...nodes], connections, settings: PHYSICS });

// The title: the cafe from the street. Interact or jump opens the cafe, or six seconds pass.
const title = scene('title', [ASSET.cafe, ASSET.espresso, ASSET.ambience], [
  ENV, ...SET, SUN, AMBIENCE,
  // a fixed camera aims 1.5 m above its target (a character's head): the marker is on the ground
  { id: 'look-at', type: 'Marker', parent: 'root', transform: { p: [0, 0.1, 6] } },
  { id: 'cam', type: 'Camera', parent: 'root', transform: { p: [3.5, 1.8, 14] }, props: { focalLength: 28, preset: 'fixed', target: 'look-at' } },
  { id: 'rules', type: 'GameRules', parent: 'root', props: {} },
  { id: 'intro', type: 'GameTimer', parent: 'rules', props: { label: 'The cafe opens in', seconds: 6 } },
  { id: 'press-start', type: 'GameGoal', parent: 'rules', props: { optional: true, text: 'The Morning Rush: press E or Space to open the cafe' } },
  { id: 'start', type: 'Node3D', parent: 'root', behaviours: [{ actions: ['jump', 'interact'], to: 'game/level.vrmxs', use: 'pressToStart' }] },
], [
  { from: 'intro', signal: 'timeout', to: 'rules', call: 'changeScene', args: { to: 'game/level.vrmxs' } },
]);

// The level. Tables: 1 at the front left (Aoi on stool-2), 2 at the front right (Ren on stool-3), 3 at the back right
// (Yuki on stool-5). Trays on the counter's front edge, the till at its left end.
export const TABLES = [
  { n: 1, customer: 'aoi', name: 'Aoi', seat: 'stool-2', zone: [-1.45, 1, 1], spawn: [-1.6, 0, 9.0], arrive: 8, voice: 'aoi', tray: [-0.9, 1.06, -3.95],
    choices: [{ id: 'latte', text: 'A latte, then.', right: true }, { id: 'espresso', text: 'A double espresso?', right: false }] },
  { n: 2, customer: 'ren', name: 'Ren', seat: 'stool-3', zone: [1.45, 1, 1], spawn: [-1.0, 0, 9.8], arrive: 35, voice: 'ren', tray: [-0.1, 1.06, -3.95],
    choices: [{ id: 'chocolate', text: 'A hot chocolate.', right: false }, { id: 'iced-tea', text: 'An iced tea.', right: true }] },
  { n: 3, customer: 'yuki', name: 'Yuki', seat: 'stool-5', zone: [1.45, 1, -2], spawn: [-0.3, 0, 10.5], arrive: 60, voice: 'yuki', tray: [0.6, 1.06, -3.95],
    choices: [{ id: 'green-tea', text: 'Green tea, coming up.', right: true }, { id: 'coffee', text: 'One black coffee.', right: false }] },
];
export const TILL = [-1.65, 1.06, -3.95];
export const CLOCK_SECONDS = 240, BREW_SECONDS = 6;
const level = scene('level', [
  ASSET.cafe, ASSET.espresso, ASSET.mira, ASSET.hana, ASSET.door, ASSET.stool, ASSET.till,
  ...TRAYS.map((t) => ({ id: `order-${t.n}`, type: 'vrmxi', ref: `game/items/order-${t.n}.vrmxi` })),
  ASSET.ambience, ASSET.music,
], [
  ENV, ...SET, SUN,
  { id: 'counter-light', type: 'SpotLight', parent: 'root', transform: { p: [0, 2.9, -3.2], q: [-0.643, 0, 0, 0.766] }, props: { angle: 40, color: '#ffe2b0', intensity: 18, range: 7 } },
  AMBIENCE,
  { id: 'music', type: 'AudioPlayer', parent: 'root', name: 'Music', asset: 'music', props: { autoplay: true, bus: 'music', loop: true, volume: 0.35 } },
  ...DOORS, ...STOOLS,
  { id: 'till', type: 'Item', parent: 'root', name: 'Till', asset: 'till', transform: { p: TILL }, props: { state: 'locked' } },
  ...TABLES.map((t) => ({ id: `tray-${t.n}`, type: 'Item', parent: 'root', name: `Order for table ${t.n}`, asset: `order-${t.n}`, transform: { p: t.tray }, props: { state: 'waiting' } })),
  { id: 'mira', type: 'Character', parent: 'root', name: 'Mira', asset: 'mira', transform: { p: [-0.4, 0, -2.9] }, behaviours: [{ use: 'player' }] },
  hana(),
  ...TABLES.map((t) => ({ id: t.customer, type: 'Character', parent: 'root', name: t.name, asset: 'hana', transform: { p: t.spawn, q: [0, 1, 0, 0] }, props: { controller: 'npc' },
    behaviours: [{ preset: 'game/brains/regular.json', use: 'brain', vars: { arrive: t.arrive, seat: t.seat } }] })),
  { id: 'look-at', type: 'Marker', parent: 'root', transform: { p: [0, 0, -0.8] } },
  { id: 'cam', type: 'Camera', parent: 'root', transform: { p: [0, 8.2, 8.6] }, props: { focalLength: 24, preset: 'fixed', target: 'look-at' } },
  ...TABLES.map((t) => ({ id: `table-${t.n}`, type: 'Area', parent: 'root', name: `Table ${t.n}`, transform: { p: t.zone }, props: { shape: 'box', size: [1.1, 2, 1.8] },
    behaviours: [{ use: 'tableZone', customer: t.customer, dialogue: `order-${t.n}`, item: TRAYS[t.n - 1].id, ordered: `ordered${t.n}`, right: `right${t.n}`, player: 'mira', points: 10 }] })),
  { id: 'rules', type: 'GameRules', parent: 'root', props: {
    flags: Object.fromEntries([...TABLES.flatMap((t) => [[`ordered${t.n}`, false], [`right${t.n}`, false]]), ['tillClosed', false]]),
    lose: { test: 'any', of: [{ key: 'timers.clock.done', test: 'state' }, { key: 'counters.mistakes', op: 'ge', test: 'state', value: 2 }] },
  } },
  { id: 'score', type: 'GameCounter', parent: 'rules', props: { label: 'Score' } },
  { id: 'served', type: 'GameCounter', parent: 'rules', props: { label: 'Served', max: 3 } },
  { id: 'mistakes', type: 'GameCounter', parent: 'rules', props: { label: 'Wrong orders' } },
  { id: 'clock', type: 'GameTimer', parent: 'rules', props: { label: 'Until ten o\'clock', seconds: CLOCK_SECONDS } },
  ...TABLES.map((t) => ({ id: `brew-${t.n}`, type: 'GameTimer', parent: 'rules', props: { autostart: false, seconds: BREW_SECONDS } })),
  // served, and not by way of a second wrong order: that delivery loses the game, and on its step the goal mustn't open
  // the till or have Hana say "close the till" (the goals are done before the step's result is decided)
  { id: 'serve', type: 'GameGoal', parent: 'rules', props: { text: 'Serve the three regulars', when: { test: 'all', of: [{ key: 'counters.served', op: 'ge', test: 'state', value: 3 }, { key: 'counters.mistakes', op: 'lt', test: 'state', value: 2 }] } } },
  { id: 'close-till', type: 'GameGoal', parent: 'rules', props: { text: 'Close the till', when: { key: 'flags.tillClosed', test: 'state' } } },
  { id: 'cp-first', type: 'Checkpoint', parent: 'rules', props: { label: 'First order served', once: true, slot: 'first-order', when: { key: 'counters.served', op: 'ge', test: 'state', value: 1 } } },
  { id: 'briefing', type: 'Dialogue', parent: 'root', props: { autostart: true, lines: [
    line('hana-brief', 'hana-1', { choices: [{ id: 'ready', text: 'On it!', to: 'ready' }, { id: 'coffee', text: 'Coffee first?', to: 'coffee' }] }),
    line('hana-brief-ready', 'hana-1', { id: 'ready', next: 'end' }),
    line('hana-brief-coffee', 'hana-1', { id: 'coffee' }),
  ] } },
  ...TABLES.map((t) => ({ id: `order-${t.n}`, type: 'Dialogue', parent: 'root', name: `${t.name}'s order`, props: { lines: [
    line(`${t.voice}-ask`, t.customer, { choices: t.choices.map((c) => ({ id: c.id, text: c.text, to: c.right ? 'right' : 'wrong', set: { [`ordered${t.n}`]: true, [`right${t.n}`]: c.right } })) }),
    line(`${t.voice}-right`, t.customer, { id: 'right', next: 'end' }),
    line(`${t.voice}-wrong`, t.customer, { id: 'wrong' }),
  ] } })),
], [
  { from: 'rules', signal: 'ready', to: 'hana-1', call: 'lookAt', args: { target: 'mira' } },
  ...TABLES.flatMap((t) => [
    { from: `order-${t.n}`, signal: 'chose', to: `brew-${t.n}`, call: 'start' },
    { from: `order-${t.n}`, signal: 'chose', to: 'hana-1', call: 'playLayer', args: { layer: 'upperBody', loop: false, slot: 'use' } },
    { from: `brew-${t.n}`, signal: 'timeout', to: `tray-${t.n}`, call: 'enterState', args: { state: 'ready' } },
    { from: `brew-${t.n}`, signal: 'timeout', to: 'hana-1', call: 'say', args: { clip: clip(`hana-up-${t.n}`), text: byId.get(`hana-up-${t.n}`).text } },
  ]),
  { from: 'serve', signal: 'completed', to: 'till', call: 'enterState', args: { state: 'open' } },
  { from: 'serve', signal: 'completed', to: 'hana-1', call: 'say', args: { clip: clip('hana-close'), text: byId.get('hana-close').text } },
  { from: 'till', signal: 'verb', to: 'rules', call: 'setFlag', args: { flag: 'tillClosed' } },
  { from: 'close-till', signal: 'completed', to: 'score', call: 'add', args: { by: 20 } },
  { from: 'rules', signal: 'won', to: 'rules', call: 'changeScene', args: { after: 3, to: 'game/won.vrmxs' } },
  { from: 'rules', signal: 'lost', to: 'rules', call: 'changeScene', args: { after: 3, to: 'game/lost.vrmxs' } },
]);

// The endings: Hana at the counter says how it went (her lines read the level's counters), then the title as a new game.
const ending = (id, lines) => scene(id, [ASSET.cafe, ASSET.espresso, ASSET.hana, ASSET.ambience], [
  ENV, ...SET, SUN, AMBIENCE, hana([0.2, 0, -3.3]),
  { id: 'look-at', type: 'Marker', parent: 'root', transform: { p: [0.2, -0.1, -3.3] } },
  { id: 'cam', type: 'Camera', parent: 'root', transform: { p: [0.9, 1.6, -0.6] }, props: { focalLength: 35, preset: 'fixed', target: 'look-at' } },
  { id: 'rules', type: 'GameRules', parent: 'root', props: { reads: { counters: ['score', 'served', 'mistakes'] } } },
  { id: 'outro', type: 'GameTimer', parent: 'rules', props: { label: 'Back to the title in', seconds: 12 } },
  { id: 'closing', type: 'Dialogue', parent: 'root', props: { autostart: true, lines } },
], [
  { from: 'outro', signal: 'timeout', to: 'rules', call: 'changeScene', args: { reset: true, to: 'game/title.vrmxs' } },
]);
const won = ending('won', [
  line('hana-won-clean', 'hana-1', { id: 'clean', next: 'bye', when: { key: 'counters.mistakes', op: 'eq', test: 'state', value: 0 } }),
  line('hana-won-mixed', 'hana-1', { id: 'mixed' }),
  line('hana-won-bye', 'hana-1', { id: 'bye' }),
]);
const lost = ending('lost', [
  line('hana-lost-orders', 'hana-1', { id: 'orders', next: 'end', when: { key: 'counters.mistakes', op: 'ge', test: 'state', value: 2 } }),
  line('hana-lost-time', 'hana-1', { id: 'time' }),
]);

const { check: validate } = createValidator(m0Registry());
for (const [file, doc] of [['game/title.vrmxs', title], ['game/level.vrmxs', level], ['game/won.vrmxs', won], ['game/lost.vrmxs', lost]]) {
  const r = validate(doc, { prefabs: new Map() });
  if (!r.ok) throw new Error(`${file}: ${r.errors.join('\n')}`);
  if (r.warnings.length) console.log(`${file}: ${r.warnings.length} warnings: ${r.warnings.join('; ')}`);
  const text = serialize(doc);
  if (serialize(parse(text)) !== text) throw new Error(`${file}: not canonical after a round trip`);
  write(file, text);
}

// ---------------------------------------------------------------- the game document and the lines
const sampleGame = JSON.parse(fs.readFileSync(path.join(root, 'game.json'), 'utf8'));
write('game/game.json', json({
  format: 'vrmxg-game', version: 1, id: 'morning-rush', title: 'The Morning Rush', release: '0.1.0',
  entry: 'game/title.vrmxs', scenes: ['game/title.vrmxs', 'game/level.vrmxs', 'game/won.vrmxs', 'game/lost.vrmxs'],
  behaviours: 'game/behaviours.js', animations: 'game/animations.json', personas: 'personas.json',
  input: sampleGame.input,
}));
write('game/voice/lines.json', json(LINES));

if (check) {
  console.log(changed.length ? `would change: ${changed.join(', ')}` : 'game/ is up to date');
  process.exit(changed.length ? 1 : 0);
}
console.log(changed.length ? `${changed.length} files written` : 'nothing changed');
