// The spike's faces: synthetic people, so no real person's face is in the repository or was needed to measure.
// Each identity is one generated portrait (Z-Image-Turbo, Apache-2.0), framed as a webcam sees someone at a desk; every
// other picture of that identity is an edit of it (FLUX.2 Klein 4B, Apache-2.0) that changes one thing: the eyes, the
// mouth, the brows or the way the head is turned. Both run on the local Gaea (MES on 127.0.0.1:17630). Seeds are fixed.
// The pictures go to faces/out/ (git-ignored); the manifest (prompts, seeds, models, licences) to results/faces.json.
//   node spike-face/faces/make-faces.mjs [--only id]        under the GPU lock (acceptance/gpu-lock.mjs run -- …)
import fs from 'node:fs';
import path from 'node:path';

const MES = 'http://127.0.0.1:17630/mes/v0', H = { 'MES-Version': '0.1' };
const here = import.meta.dirname, out = path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

async function job(body) {
  const r = await fetch(`${MES}/jobs`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = await r.json();
  if (!r.ok) throw new Error(`${body.operation}: ${r.status} ${JSON.stringify(j)}`);
  while (!['holding', 'done', 'failed', 'cancelled', 'expired'].includes(j.state)) j = await (await fetch(`${MES}/jobs/${j.id}?wait=10`, { headers: H })).json();
  if (j.state === 'failed') throw new Error(`${body.operation} failed: ${JSON.stringify(j.error)}`);
  const o = j.result.outputs[0];
  return { job: j, bytes: new Uint8Array(await (await fetch(new URL(o.href, MES + '/').href, { headers: H })).arrayBuffer()), mediaType: o.media_type };
}
const upload = async (bytes, type) => (await (await fetch(`${MES}/uploads`, { method: 'POST', headers: { ...H, 'Content-Type': type ?? 'image/png' }, body: bytes })).json()).upload_id;

const FRAMING = 'webcam photo of a person sitting at a desk facing the camera, head and shoulders, face centred and filling about a third of the frame, neutral relaxed expression, mouth closed, eyes open looking at the camera, even indoor daylight, plain off-white wall behind, sharp focus, natural skin';
export const IDENTITIES = [
  { id: 'a', seed: 101, who: 'a woman in her thirties with shoulder-length dark hair, no glasses' },
  { id: 'b', seed: 202, who: 'a man in his forties with short brown hair and light stubble, no glasses' },
  { id: 'c', seed: 303, who: 'a woman in her twenties with light skin and red hair tied back, no glasses' },
  { id: 'd', seed: 404, who: 'a man in his thirties with dark skin and very short black hair, no glasses' },
];
/** One change each, as an instruction to the editor. `truth` is what the picture should show, for the analysis. */
export const POSES = [
  { id: 'blink', truth: { blink: 1 }, say: 'Close both of the person\'s eyes fully, as in the middle of a blink. Keep everything else exactly the same: the same person, the same pose, the mouth closed.' },
  { id: 'wink', truth: { wink: 1 }, say: 'Make the person wink: close only the eye on the left side of the picture, keep the other eye open. Keep everything else exactly the same.' },
  { id: 'jaw', truth: { jaw: 1 }, say: 'Open the person\'s mouth wide, jaw dropped, as if saying "ah". Keep the eyes open and everything else exactly the same.' },
  { id: 'smile', truth: { smile: 1 }, say: 'Make the person smile broadly with a closed mouth, cheeks raised. Keep the eyes open and everything else exactly the same.' },
  { id: 'browUp', truth: { browUp: 1 }, say: 'Raise both of the person\'s eyebrows high, as in surprise, eyes open, mouth closed. Keep everything else exactly the same.' },
  { id: 'browDown', truth: { browDown: 1 }, say: 'Lower and draw together the person\'s eyebrows in a stern frown, eyes open, mouth closed. Keep everything else exactly the same.' },
  { id: 'left', truth: { yaw: -1 }, say: 'Turn the person\'s head about thirty degrees toward the left side of the picture, body unchanged, eyes following the head. Keep the expression neutral.' },
  { id: 'right', truth: { yaw: 1 }, say: 'Turn the person\'s head about thirty degrees toward the right side of the picture, body unchanged, eyes following the head. Keep the expression neutral.' },
  { id: 'left15', truth: { yaw: -1 }, say: 'Turn the person\'s face very slightly, only about ten degrees, toward the left side of the picture, as when glancing at something just beside the camera. Both eyes and both cheeks stay fully visible. Keep the expression neutral and everything else exactly the same.' },
  { id: 'right15', truth: { yaw: 1 }, say: 'Turn the person\'s face very slightly, only about ten degrees, toward the right side of the picture, as when glancing at something just beside the camera. Both eyes and both cheeks stay fully visible. Keep the expression neutral and everything else exactly the same.' },
  { id: 'up', truth: { pitch: 1 }, say: 'Tilt the person\'s head back so they look up toward the ceiling, chin raised about twenty degrees. Keep the expression neutral.' },
  { id: 'down', truth: { pitch: -1 }, say: 'Tilt the person\'s head forward so they look down at the desk, chin lowered about twenty degrees. Keep the expression neutral.' },
  { id: 'tilt', truth: { roll: 1 }, say: 'Tilt the person\'s head sideways toward their shoulder on the right side of the picture, about twenty degrees, still facing the camera. Keep the expression neutral.' },
];

const size = { width: 1024, height: 768 }, made = [];
const offers = await (await fetch(`${MES}/operations`, { headers: H })).json();
const licenceOf = (op, model) => offers.operations.find((o) => o.operation === op)?.models.find((m) => m.id === model)?.license?.spdx ?? null;
for (const who of IDENTITIES) {
  if (only && who.id !== only) continue;
  const base = path.join(out, `${who.id}-neutral.png`);
  if (!fs.existsSync(base)) { const r = await job({ operation: 'image.generate', model: 'z-image-turbo', inputs: { prompt: `${FRAMING}, ${who.who}` }, params: { size, seed: who.seed } }); fs.writeFileSync(base, r.bytes); }
  made.push({ file: `${who.id}-neutral.png`, identity: who.id, pose: 'neutral', truth: {}, model: 'z-image-turbo', seed: who.seed });
  console.log(`${who.id}-neutral`);
  for (const p of POSES) {
    const file = path.join(out, `${who.id}-${p.id}.png`);
    if (!fs.existsSync(file)) { // an upload serves one job
      const id = await upload(fs.readFileSync(base), 'image/png');
      const r = await job({ operation: 'image.edit', model: 'klein-4b', inputs: { images: [{ upload: id }], instruction: p.say }, params: { size, seed: who.seed + 1 } });
      fs.writeFileSync(file, r.bytes);
    }
    made.push({ file: `${who.id}-${p.id}.png`, identity: who.id, pose: p.id, truth: p.truth, model: 'klein-4b', seed: who.seed + 1 });
    console.log(`${who.id}-${p.id}`);
  }
}
if (!only) fs.writeFileSync(path.join(here, '../results/faces.json'), JSON.stringify({
  what: 'The spike\'s synthetic faces: 4 identities × (neutral + 13 single changes). No real person.',
  framing: FRAMING, identities: IDENTITIES, poses: POSES.map(({ id, truth, say }) => ({ id, truth, instruction: say })), size,
  models: { 'z-image-turbo': licenceOf('image.generate', 'z-image-turbo'), 'klein-4b': licenceOf('image.edit', 'klein-4b') }, files: made,
}, null, 1) + '\n');
