// Writes input/play-items.json (M1 W10): a recorded take that plays the cafe with its items. Mira walks in through
// the entrance, takes the sword from the table, opens the cupboard, sits on a stool, gets up and switches the counter
// lights off. It is made by an autopilot that steers Mira through the real world (Node, the same world.js every runtime
// builds) with a virtual gamepad and the E key, and records only the input: replayed anywhere, the same take happens.
// The autopilot never touches the simulation, it just reads it to decide what to press next.
//   node content/sample/tools/make-take.mjs
import fs from 'node:fs';
import path from 'node:path';
import { installPortableMath } from '@vrmxg/dmath';
import { loadRapier } from '@vrmxg/physics';
import { VirtualDevice } from '@vrmxg/input';
import { loadSample, buildWorld } from '../../../apps/playground/src/world.js';
import { vrmxaCore, PATHS } from '../../../engine/packages/character/test/fixtures.mjs';
import * as projectBehaviours from '../behaviours.js';

installPortableMath();
const content = path.resolve(import.meta.dirname, '..');
const bytes = async (ref) => new Uint8Array(fs.readFileSync(path.join(content, ref)));
const behaviours = new Map(Object.entries(projectBehaviours).filter(([, v]) => typeof v === 'function'));
const closet = await import(PATHS.core.replace(/index\.js$/, 'closet/index.js'));
const opts = { vrmxaCore: await vrmxaCore(), closet, behaviours, stubTextures: true };
const R = await loadRapier();
const sample = await loadSample(bytes);
const W = await buildWorld(R, sample, opts);
const tree = W.tree, input = W.input, dev = input.addDevice(new VirtualDevice());
const mira = /** @type {any} */ (tree.find('mira'));
const log = (...a) => console.log(`[${String(tree.clock.step).padStart(4)}]`, ...a);

input.record();
async function step(n = 1) { for (let i = 0; i < n; i++) while (!tree.step()) await tree.settle(); }
const pos = () => mira.object3d.position;
const yaw = () => tree.services.get('cameras')?.current?.rigYaw ?? 0;
/** Push the stick towards a world point, at `amount` of full tilt (camera-relative, as the player controller reads it). */
function stickTowards(x, z, amount = 1) {
  const p = pos(), dx = x - p.x, dz = z - p.z, len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len, f = [Math.sin(yaw()), Math.cos(yaw())], r = [-f[1], f[0]];
  const my = (ux * f[0] + uz * f[1]) * amount, mx = (ux * r[0] + uz * r[1]) * amount;
  dev.setGamepad([mx, -my, 0, 0]);
}
const still = () => dev.setGamepad([0, 0, 0, 0]);

/** Walk to (x, z) within `tol` m. */
async function walkTo(x, z, tol = 0.15, limit = 900) {
  for (let i = 0; i < limit; i++) {
    const p = pos(); if (Math.hypot(x - p.x, z - p.z) < tol) { still(); await step(4); log(`at ${x}, ${z}`); return; }
    stickTowards(x, z, Math.hypot(x - p.x, z - p.z) < 0.6 ? 0.5 : 1);
    await step();
  }
  throw new Error(`didn't reach ${x}, ${z} (at ${pos().x.toFixed(2)}, ${pos().z.toFixed(2)})`);
}

/** Face a point (a few small nudges towards it), until the prompt for `verb` on `item` shows, then press E. */
async function interact(item, verb, fx, fz) {
  for (let i = 0; i < 120; i++) {
    const f = W.interact.prompts().find((p) => p.actor === 'mira');
    if (f?.item === item && f.verb === verb) {
      still(); await step(2);
      log(`prompt: ${f.prompt} (${f.item})`);
      dev.press('KeyE'); await step(1); dev.release('KeyE'); await step(1);
      return f;
    }
    if (i % 6 < 2) stickTowards(fx, fz, 0.12); else still();
    await step();
  }
  throw new Error(`no ${verb} prompt for ${item} (focus: ${JSON.stringify(W.interact.prompts())})`);
}

still(); await step(30);
await walkTo(-0.5, 4.0);                  // in through the left entrance door (it opens for her)
await walkTo(-1.2, 0.0);
await walkTo(-3.0, -1.35);                // the sword's table, from its open side
await interact('sword', 'take', -3.0, -1.95);
await step(60);
log('worn', W.closet.wornBy('mira').map((w) => w.state).join(', '));
await walkTo(-4.3, -1.3);
await walkTo(-4.85, -3.6);                // in front of the cupboard
await interact('cupboard', 'open', -5.76, -3.6);
await step(70);
log('cupboard', tree.find('cupboard').current);
await walkTo(-4.45, -2.2, 0.15);          // beside stool-7
await interact('stool-7', 'sit', -3.75, -2.2);
for (let i = 0; i < 240 && mira.graph.state !== 'sitIdle'; i++) await step();
log('seated', mira.graph.state, JSON.stringify(mira.ctrl.seat));
await step(90);
stickTowards(-3.75, 0, 1); await step(10); still();    // stand up
for (let i = 0; i < 240 && mira.ctrl.seat; i++) await step();
await step(40);
log('standing', mira.graph.state);
await walkTo(-3.75, -0.9, 0.25);
await walkTo(-1.0, -0.9, 0.25);           // round the tables and past Hana
await walkTo(1.5, -3.2, 0.25);
await walkTo(2.6, -3.2, 0.2);
await walkTo(2.6, -5.25, 0.15);           // under the light switch
await interact('light-switch', 'use', 2.6, -5.95);
await step(60);
log('switch', tree.find('light-switch').current);
await step(60);

const rec = input.stop();
const out = path.join(content, 'input/play-items.json');
fs.writeFileSync(out, JSON.stringify(rec) + '\n');
log(`wrote input/play-items.json: ${rec.frames.length} steps (${(rec.frames.length / 60).toFixed(1)} s)`);

// The take replayed in a fresh world does the same things: same final hash, same item states.
const { worldHashes, hashValue } = await import('@vrmxg/snapshot');
const a = hashValue(worldHashes(tree, { physicsBytes: true }));
const B = await buildWorld(R, sample, opts);
B.input.replay(JSON.parse(fs.readFileSync(out, 'utf8')));
for (let i = 0; i < rec.frames.length; i++) while (!B.tree.step()) await B.tree.settle();
const b = hashValue(worldHashes(B.tree, { physicsBytes: true }));
console.log(`replayed: ${b === a ? 'the same world' : 'DIFFERENT'} (${a} / ${b}); sword ${B.tree.find('sword') ? 'still there' : 'taken'}, cupboard ${B.tree.find('cupboard').current}, switch ${B.tree.find('light-switch').current}`);
if (a !== b) process.exit(1);
