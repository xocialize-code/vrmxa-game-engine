// M6 W4 (AB-T-0647): the starter content works. Two checks on content/starter, run by its Node tests
// (content/starter/test/) and by the playground's ?mode=starter (the same code in a browser):
//   - animations: a VRMXA (the sample's Mira) cast with the starter's default animation set in place of her own, every
//     slot of every set played the way the engine plays it (locomotion by input, actions and masked gestures by
//     startAction, the rest on a layer), each one moving her and every bone staying finite;
//   - items: every starter item in a world of its own with Mira in front of it, its verb done through @vrmxg/interact as
//     its type says (open a door or a chest, press or pull a switch, sit on a seat, take a pickup), and what that shows
//     checked (the state, the moving part, the seat, the inventory); a prop stands still and a spawn point has its node.
// Pure simulation: nothing here reads a clock or draws.
import { SceneTree } from '@vrmxg/core';
import { m0Registry } from '@vrmxg/registry/m0';
import { installInput } from '@vrmxg/input';
import { installPhysics } from '@vrmxg/physics';
import { installCharacters } from '@vrmxg/character';
import { installItems } from '@vrmxg/item';
import { installInteraction } from '@vrmxg/interact';
import { CLIPS, SETS } from '../../../content/starter/tools/starter-clips.mjs';
import { ITEMS } from '../../../content/starter/tools/starter-items.mjs';

/** The character the checks cast (a ref the caller's `bytes` resolves: the sample's Mira). */
export const STARTER_CHARACTER = 'characters/mira.vrmxa';
// Mira's layers: the engine's four, and a full-body one for the slots that are neither locomotion, an action nor
// masked (a dance, a crouch, a kick): a game plays those the same way, on a layer of its own
const LAYERS = [
  { name: 'body', mask: 'fullBody', blend: 'overwrite' },
  { name: 'upperBody', mask: 'upperBody', blend: 'overwrite' }, { name: 'arms', mask: 'arms', blend: 'overwrite' },
  { name: 'face', mask: 'face', blend: 'overwrite' }, { name: 'additive', mask: 'fullBody', blend: 'additive' },
];
const ACTIONS = new Set(['use', 'take', 'talk', 'sit', 'sitIdle', 'stand', 'getUp']);
const LOCOMOTION = new Set(['idle', 'walk', 'run', 'jump', 'fall', 'land']);

/** The starter's animation document and its clips. @param {(ref: string) => Promise<Uint8Array>} starterBytes */
export async function loadStarterAnimations(starterBytes) {
  const doc = JSON.parse(new TextDecoder().decode(await starterBytes('animations.json')));
  const clips = new Map();
  for (const c of doc.clips) clips.set(c.sha256, await starterBytes(c.file));
  return { doc, clips };
}

/**
 * A world: a floor, Mira cast with the starter set, and the nodes given.
 * @param {any} R @param {{ bytes: (ref: string) => Promise<Uint8Array>, animations: any, vrmxaCore: any, stubTextures?: boolean, nodes?: any[], assets?: any[] }} o
 */
async function world(R, { bytes, animations, vrmxaCore, stubTextures = true, nodes = [], assets = [], seed = 7, at = null }) {
  const tree = new SceneTree({ registry: m0Registry(), seed });
  const input = installInput(tree);
  installPhysics(tree, R);
  const items = installItems(tree, { resolve: bytes, vrmxaCore, stubTextures });
  const chars = installCharacters(tree, { resolve: bytes, vrmxaCore, stubTextures });
  chars.setAnimations(STARTER_CHARACTER, animations); // cast with the starter set: it replaces her own sets
  const { interact, inventory } = installInteraction(tree);
  const doc = {
    format: 'vrmxs', version: 1, id: 'starter-check',
    assets: [{ id: 'mira', type: 'vrmxa', ref: STARTER_CHARACTER }, ...assets],
    nodes: [
      { id: 'floor', type: 'Collider', transform: { p: [0, -0.1, 0] }, props: { shape: 'box', size: [30, 0.2, 30] } },
      ...nodes,
      { id: 'mira', type: 'Character', asset: 'mira', ...(at ? { transform: at } : {}), props: { layers: LAYERS } },
    ],
  };
  await items.prepare(doc); await chars.prepare(doc);
  tree.instantiate(doc);
  return { tree, input, interact, inventory, mira: tree.find('mira') };
}

const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm', 'leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot'];
const poseOf = (m) => BONES.flatMap((b) => { const n = m.vrm.humanoid.getNormalizedBoneNode(b); return n ? [...n.quaternion.toArray(), ...(b === 'hips' ? n.position.toArray() : [])] : []; });
/** The largest turn (radians) of any bone between two poses. */
function turn(a, b) {
  let worst = 0;
  for (let i = 0, k = 0; k < BONES.length; k++) {
    const d = Math.abs(a[i] * b[i] + a[i + 1] * b[i + 1] + a[i + 2] * b[i + 2] + a[i + 3] * b[i + 3]);
    worst = Math.max(worst, 2 * Math.acos(Math.min(1, d)));
    i += BONES[k] === 'hips' ? 7 : 4;
  }
  return worst;
}

/**
 * Every slot of every starter set, played on Mira. → { slots: [{ set, slot, how, clip, moved (rad), finite, states? }], ok }
 * @param {{ R: any, bytes: (ref: string) => Promise<Uint8Array>, starterBytes: (ref: string) => Promise<Uint8Array>, vrmxaCore: any }} o
 *   bytes: the character's; starterBytes: content/starter's files
 */
export async function starterAnimationsCheck({ R, bytes, starterBytes, vrmxaCore }) {
  const animations = await loadStarterAnimations(starterBytes);
  const nameOf = new Map(animations.doc.clips.map((c) => [c.sha256, c.name]));
  const slots = [];
  for (const set of SETS) {
    for (const slot of Object.keys(set.slots)) {
      const w = await world(R, { bytes, animations, vrmxaCore });
      const m = w.mira;
      if (set.requires?.length) m.setEquippedTags(set.requires); // a sword in hand, a chest being opened
      w.tree.run(30);
      const rest = poseOf(m);
      const entry = { set: set.id, slot, clip: set.slots[slot].map((e) => e.clip), how: '', moved: 0, finite: true };
      const watch = (n) => { for (let k = 0; k < n; k++) { w.tree.step(); const p = poseOf(m); entry.finite &&= p.every(Number.isFinite); entry.moved = Math.max(entry.moved, turn(rest, p)); } };
      const states = new Set();
      const masked = set.slots[slot].every((e) => e.mask && e.mask !== 'fullBody');
      if (set.id !== 'default' && !LOCOMOTION.has(slot) && !ACTIONS.has(slot) && slot !== 'hold' && !masked) throw new Error(`${set.id}.${slot}: no way to play it here`);
      if (slot === 'idle') {
        entry.how = 'idle'; watch(120); states.add(m.graph.state);
        entry.picked = nameOf.get(m.graph.picks.idle?.clip) ?? null;
      } else if (slot === 'walk' || slot === 'run') {
        entry.how = 'input.move'; m.input.move = [0, slot === 'walk' ? 1.2 : 4.4]; for (let k = 0; k < 90; k++) { watch(1); states.add(m.graph.state); } m.input.move = [0, 0];
        entry.picked = nameOf.get(m.graph.picks[slot]?.clip) ?? null;
      } else if (slot === 'jump' || slot === 'fall' || slot === 'land') {
        entry.how = 'input.jump'; m.input.jump = true; for (let k = 0; k < 150; k++) { watch(1); states.add(m.graph.state); if (k === 2) m.input.jump = false; }
      } else if (slot === 'hold') {
        entry.how = 'hold (a sword in hand)'; watch(60);
      } else if (ACTIONS.has(slot) || slot === 'equip') {
        const act = slot === 'equip' ? 'take' : slot; // VRMXI's take plays the equip slot until VRMXA has take
        entry.how = `startAction('${act}')`; if (act === 'sitIdle' || act === 'stand') m.startAction('sit');
        m.startAction(act); for (let k = 0; k < 150; k++) { watch(1); states.add(m.graph.state); }
      } else if (masked) {
        entry.how = `startAction('${slot}') (masked)`; m.startAction(slot); watch(Math.min(240, 60 * 5));
        entry.gesture = true;
      } else {
        const layer = slot === 'carry' ? 'upperBody' : 'body';
        entry.how = `playLayer({ layer: '${layer}', slot })`; m.playLayer({ layer, slot, fade: 0.2 }); watch(120);
      }
      if (states.size) entry.states = [...states];
      // which clip the slot resolved to: the starter's, never one of Mira's own
      const pick = m.graph.picks[slot]?.clip ?? m.graph.slots[slot]?.clips?.[0]?.clip ?? null;
      entry.picked ??= pick ? nameOf.get(pick) ?? `not a starter clip (${pick.slice(0, 12)})` : null;
      slots.push(entry);
    }
  }
  const failures = slots.filter((s) => !s.finite || s.moved < 0.05 || (s.slot !== 'idle' && !s.clip.includes(s.picked)) || (s.states && s.slot !== 'idle' && !s.states.includes(s.slot === 'walk' || s.slot === 'run' ? 'move' : s.slot === 'equip' ? 'take' : s.slot)));
  return { character: STARTER_CHARACTER, clips: animations.doc.clips.length, expectedClips: CLIPS.length, slots, failures: failures.map((f) => `${f.set}.${f.slot}`), ok: !failures.length && animations.doc.clips.length === CLIPS.length };
}

/**
 * Every starter item, used as its type says. → { items: [{ file, type, verb, prompts, ok, … }], ok }
 * @param {{ R: any, bytes: (ref: string) => Promise<Uint8Array>, starterBytes: (ref: string) => Promise<Uint8Array>, vrmxaCore: any }} o
 */
export async function starterItemsCheck({ R, bytes, starterBytes, vrmxaCore }) {
  const animations = await loadStarterAnimations(starterBytes);
  const both = (ref) => (ref.startsWith('items/') ? starterBytes(ref) : bytes(ref));
  const results = [];
  for (const item of ITEMS) {
    const ref = `items/${item.file}`;
    // the item at the origin facing +Z (its front), Mira in front of it facing it (placed there, not moved there: a
    // character moved through a crate on its first step pushes it)
    const at = { p: [0, 0, item.try.stand ?? 0.75], q: [0, 1, 0, 0] };
    const w = await world(R, { bytes: both, animations, vrmxaCore, at, assets: [{ id: 'it', type: 'vrmxi', ref }], nodes: [{ id: 'it', type: 'Item', asset: 'it' }] });
    const node = w.tree.find('it'), m = w.mira;
    w.interact.addActor('mira'); // focus and prompts, as the player has them
    w.tree.run(60); // settled: a joint moves to its first state's target in the first steps
    const r = { file: ref, name: item.name, type: item.type, verb: item.try.verb ?? null, expect: item.try.expect, prompts: w.interact.prompts().map((p) => `${p.verb}:${p.prompt}`), ok: false };
    // three's loader puts underscores for spaces in node names (PropertyBinding.sanitizeNodeName)
    const part = item.try.part ? node.object3d.getObjectByName(item.try.part) ?? node.object3d.getObjectByName(item.try.part.replace(/\s/g, '_')) : null;
    if (item.try.part && !part) throw new Error(`${ref}: no part ${item.try.part}`);
    const where = () => { const o = part ?? node.object3d; o.updateWorldMatrix(true, false); return { p: o.getWorldPosition(o.position.clone()), q: o.getWorldQuaternion(o.quaternion.clone()) }; };
    const before = where();
    if (item.try.verb) {
      r.offered = w.interact.prompts().some((p) => p.item === 'it' && p.verb === item.try.verb);
      w.interact.request('mira', 'it', item.try.verb);
      w.tree.run(120);
    } else w.tree.run(120);
    if (item.try.expect === 'state') {
      const after = where();
      r.state = node.current;
      r.turned = +(2 * Math.acos(Math.min(1, Math.abs(before.q.dot(after.q))))).toFixed(3);
      r.ok = r.offered && r.state === item.try.to && (!part || r.turned > 0.3);
      r.slot = m.graph.state;
    } else if (item.try.expect === 'inventory') {
      r.inventory = w.inventory.list('mira').map((e) => e.name);
      r.gone = w.tree.find('it') === null;
      r.ok = r.offered && r.gone && r.inventory.length === 1;
    } else if (item.try.expect === 'seated') {
      r.seated = !!m.ctrl.seat; r.slot = m.graph.state;
      const seat = node.seatPoints()[0].node.getWorldPosition(m.object3d.position.clone());
      r.hipsOnSeat = +Math.hypot(m.object3d.position.x - seat.x, m.object3d.position.z - seat.z).toFixed(3);
      r.ok = r.offered && r.seated && r.slot === 'sitIdle' && r.hipsOnSeat < 0.01;
    } else if (item.try.expect === 'still') {
      const after = where();
      r.moved = +after.p.distanceTo(before.p).toFixed(4);
      r.at = after.p.toArray().map((v) => +v.toFixed(3));
      r.ok = r.prompts.length === 0 && r.moved < 0.01 && after.p.y > -0.01;
    } else if (item.try.expect === 'spawn') {
      const s = node.spawnPoint();
      r.spawn = s?.name ?? null;
      r.ok = !!s && r.prompts.length === 0;
    }
    results.push(r);
  }
  return { items: results, failures: results.filter((r) => !r.ok).map((r) => r.file), ok: results.every((r) => r.ok) };
}
