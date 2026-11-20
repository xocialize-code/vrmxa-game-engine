// Fetches the three MediaPipe models the spike measures into public/models/ (git-ignored) and copies the
// tasks-vision WASM into public/wasm/, so the page loads nothing from a CDN at run time. Approved downloads
// (2026-11-19): face_landmarker, gesture_recognizer, pose_landmarker_full (float16, Google, Apache-2.0).
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname, pub = path.join(here, '../public');
const MODELS = {
  'face_landmarker.task': 'face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
  'gesture_recognizer.task': 'gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task',
  'pose_landmarker_full.task': 'pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
};
fs.mkdirSync(path.join(pub, 'models'), { recursive: true });
for (const [file, rel] of Object.entries(MODELS)) {
  const out = path.join(pub, 'models', file);
  if (fs.existsSync(out)) { console.log(`have ${file}`); continue; }
  const r = await fetch(`https://storage.googleapis.com/mediapipe-models/${rel}`);
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  console.log(`fetched ${file} (${fs.statSync(out).size} bytes)`);
}
const wasm = path.join(here, '../node_modules/@mediapipe/tasks-vision/wasm');
fs.mkdirSync(path.join(pub, 'wasm'), { recursive: true });
for (const f of fs.readdirSync(wasm)) fs.copyFileSync(path.join(wasm, f), path.join(pub, 'wasm', f));
console.log('copied the tasks-vision wasm');
