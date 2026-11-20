// Writes the M3 scenes (W12, AB-T-0551), each the cafe (cafe.vrmxs) with one change, so the editor, the playground's scene
// list and the companion can open them by name. The cafe itself stays as it is (the M0–M2 checks run it):
//   cafe-talk.vrmxs     Hana as a conversation partner (M3 W2's preset): wanders near the counter, talks when talked to
//                       (a director: the playground's ?director), and notices the person at the camera (W5)
//   cafe-follow.vrmxs   Hana follows Mira (the follower preset, Mira its leader) from beside her on the pavement
//   cafe-stairs.vrmxs   the stairs outside, Mira and Hana on the landing (W7's fall: apps/playground/src/stairs.js)
//   cafe-cart.vrmxs     the cart on the pavement, Mira beside its driver's door (W8: vehicle.js)
//   cafe-split.vrmxs    two players, Hana player 2 with her own camera (W9: split.js; the world needs players: 2)
// Each is validated against the registry, as make-content.mjs validates the cafe.
//   node content/sample/tools/make-scenes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { m0Registry } from '@vrmxg/registry/m0';
import { createValidator, parse, serialize } from '@vrmxg/scene';
import { withCamera } from '@vrmxg/sense';
import { withStairs } from '../../../apps/playground/src/stairs.js';
import { withCart } from '../../../apps/playground/src/vehicle.js';
import { withTwoPlayers } from '../../../apps/playground/src/split.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => parse(fs.readFileSync(path.join(root, f), 'utf8'));
const cafe = read('cafe.vrmxs');
const recast = (doc, id, change) => ({ ...doc, nodes: doc.nodes.map((n) => (n.id === id ? change(n) : n)) });
const named = (doc, id, name) => ({ ...doc, id, ...(doc.name !== undefined || name ? { name } : {}) });

const talk = withCamera(recast(cafe, 'hana-1', (n) => ({ ...n, behaviours: [{ use: 'brain', preset: 'conversationPartner' }] })), { notice: ['hana-1'], params: { say: { wave: 'Oh, hi there!' } } });
const follow = recast(cafe, 'hana-1', (n) => ({ ...n, transform: { p: [0.6, 0, 9.8], q: [0, 1, 0, 0] }, behaviours: [{ use: 'brain', preset: 'follower', vars: { leader: 'mira' } }] }));
const scenes = {
  'cafe-talk.vrmxs': named(talk, 'sample-cafe-talk'),
  'cafe-follow.vrmxs': named({ ...follow, connections: (follow.connections ?? []).filter((c) => c.to !== 'hana-1') }, 'sample-cafe-follow'),
  'cafe-stairs.vrmxs': named(withStairs(cafe, { camera: true }), 'sample-cafe-stairs'),
  'cafe-cart.vrmxs': named(withCart(cafe), 'sample-cafe-cart'),
  'cafe-split.vrmxs': named(withTwoPlayers(cafe), 'sample-cafe-split'),
};

const reg = m0Registry(), { check } = createValidator(reg);
const prefabs = new Map(['prefabs/door.vrmxs', 'prefabs/double-door.vrmxs'].map((f) => [f, read(f)]));
for (const [file, doc] of Object.entries(scenes)) {
  const r = check(doc, { prefabs });
  if (!r.ok) throw new Error(`${file}: ${r.errors.join('\n')}`);
  fs.writeFileSync(path.join(root, file), serialize(doc));
  console.log(`valid ${file}${r.warnings.length ? ` (${r.warnings.length} warnings: ${r.warnings.join('; ')})` : ''}`);
}
