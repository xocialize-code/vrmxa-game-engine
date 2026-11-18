// Writes input/walk-in.json: a recorded-input file the playground's "Replay demo walk" and the M0 checks play.
// It is written frame by frame (no device needed): Mira walks from the pavement through the entrance, runs to
// the counter, looks around, stops, walks back towards the door and jumps. Axes and buttons in the default
// action map's order (@vrmxg/input DEFAULT_ACTIONS); the frames start at the step the replay begins.
//   node content/sample/tools/make-input.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ActionMap } from '@vrmxg/input';

const map = new ActionMap();
const axis = (n) => map.axes.indexOf(n), bit = (n) => 1 << map.buttons.indexOf(n);
const frames = [];
const hold = (steps, a = {}, buttons = []) => {
  for (let i = 0; i < steps; i++) {
    const axes = map.axes.map(() => 0);
    for (const [k, v] of Object.entries(a)) axes[axis(k)] = typeof v === 'function' ? v(i) : v;
    frames.push([axes, buttons.reduce((b, n) => b | bit(n), 0) >>> 0]);
  }
};
hold(30);                                                     // stand
hold(200, { move_y: 1 });                                     // walk in through the left entrance door
hold(90, { move_y: 1 }, ['run']);                             // run towards the counter
hold(60, { look_x: (i) => (i < 30 ? 0.03 : -0.03) });         // look around (camera)
hold(40);                                                     // stop
hold(120, { move_y: -1 });                                    // walk back towards the door
hold(2, {}, ['jump']); hold(58);                              // jump, land
const rec = { version: 1, start: 0, axes: [...map.axes], buttons: [...map.buttons], frames };
const out = path.resolve(import.meta.dirname, '../input/walk-in.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(rec) + '\n');
console.log(`wrote input/walk-in.json: ${frames.length} steps (${(frames.length / 60).toFixed(1)} s)`);
