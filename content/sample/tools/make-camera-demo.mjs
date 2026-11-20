// Writes input/camera-demo.json (M3 W5, AB-T-0544): a synthetic camera session as feature frames (no images): someone
// appears, waves, nods, shakes their head, points and leaves, at 15 fps, from @vrmxg/sense's test script. The playground
// replays it with ?camera&frames=input/camera-demo.json, so the camera's path can be seen and checked without a camera.
//   node content/sample/tools/make-camera-demo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { scriptFrames } from '../../../engine/packages/sense/test/synth.mjs';

const out = path.join(import.meta.dirname, '../input/camera-demo.json');
const doc = { format: 'vrmxg-camera-session', version: 1, synthetic: true, source: 'engine/packages/sense/test/synth.mjs (SCRIPT)', frames: scriptFrames() };
fs.writeFileSync(out, JSON.stringify(doc) + '\n');
console.log(`wrote ${path.relative(process.cwd(), out)}: ${doc.frames.length} frames`);
