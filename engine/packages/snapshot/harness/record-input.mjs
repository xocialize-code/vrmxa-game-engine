// Records input.json once: 10 s of keyboard, mouse and gamepad through a VirtualDevice, played into the
// cafe in Node. Mira walks to the entrance (the right door swings open as she enters its trigger), runs,
// turns the camera with the mouse, jumps, strafes on the stick past Hana, switches the camera preset and
// walks back. Committed: every runtime replays these exact frames.
import fs from 'node:fs';
import { loadRapier } from '@vrmxg/physics';
import { VirtualDevice } from '@vrmxg/input';
import { loadAssets, buildWorld, STEPS } from './world.js';
import { files } from './files-node.mjs';

const R = await loadRapier();
const assets = await loadAssets({ ...files, json: (p) => (p === 'input.json' ? null : files.json(p)) });
const { tree, input } = await buildWorld(R, assets, { replay: false });
const dev = input.addDevice(new VirtualDevice());

function drive(k) {
  if (k === 20) dev.press('KeyW');
  if (k === 110) dev.press('ShiftLeft');
  if (k === 150) { dev.release('KeyW'); dev.release('ShiftLeft'); }
  if (k >= 170 && k < 230) dev.moveMouse(9, k % 3);
  if (k === 240) dev.press('Space');
  if (k === 242) dev.release('Space');
  if (k === 260) dev.setGamepad([0.7, -0.6, 0, 0]);
  if (k === 330) { const b = new Array(17).fill(0); b[0] = 1; dev.setGamepad([0.7, -0.6, 0.3, 0], b); }
  if (k === 332) dev.setGamepad([0.7, -0.6, 0.3, 0]);
  if (k === 400) dev.setGamepad([0, 0, 0, 0]);
  if (k === 420) dev.press('KeyC');
  if (k === 422) dev.release('KeyC');
  if (k === 440) dev.press('KeyS');
  if (k === 560) dev.release('KeyS');
}

input.record();
const mira = tree.find('mira'), right = tree.find('entrance/right/hinge').behaviours[0], left = tree.find('entrance/left/hinge').behaviours[0];
const log = [];
for (let k = 0; k < STEPS; k++) {
  drive(k); tree.step();
  if (k % 30 === 29) { const p = mira.object3d.position; log.push(`${k + 1}: mira ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}  doors L ${JSON.stringify(left.getState())} R ${JSON.stringify(right.getState())}  cam ${tree.find('cam').preset}`); }
}
const rec = input.stop();
fs.writeFileSync(new URL('./input.json', import.meta.url), JSON.stringify(rec) + '\n');
console.log(log.join('\n'));
console.log(`input.json: ${rec.frames.length} frames`);
