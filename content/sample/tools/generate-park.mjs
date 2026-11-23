// The park's props (M4 W12, AB-T-0584: "a second set made with Gaea"), generated with the local Gaea (MES on
// 127.0.0.1:17630) as tools/generate-prop.mjs made the espresso machine: a picture from Z-Image-Turbo (Apache-2.0), then a
// textured mesh from it with TRELLIS.2 (MIT; its DINOv3 conditioner asks for "Built with DINOv3"), scaled by Gaea to
// each prop's real size and stood on the ground. Seeds are fixed; each prop's request, effective parameters and the
// licences the offers state are kept in props/sources/<prop>.json. The outputs are committed; re-run only to regenerate
// (one prop: give its name). tools/make-park.mjs builds the set around them.
//   node content/sample/tools/generate-park.mjs [bench|street-lamp|planter-tree|vending-machine …]
// Gaea runs its models on this Mac's GPU, so the run holds the machine's GPU lock (acceptance/gpu-lock.mjs) and exact-
// frame checks elsewhere wait for it.
import fs from 'node:fs';
import path from 'node:path';
import { acquireGpuLock, sayWaiting } from '../../../acceptance/gpu-lock.mjs';

const MES = 'http://127.0.0.1:17630/mes/v0', H = { 'MES-Version': '0.1' };
const root = path.resolve(import.meta.dirname, '..');
const out = (rel) => path.join(root, rel);

const LOOK = 'product photo, centered, whole object in frame, plain light grey background, soft even studio light';
/** The props: what to draw, the view, and how big the real thing is (its longest extent, metres). */
export const PROPS = [
  { name: 'bench', prompt: `a wooden park bench with dark green cast iron legs and armrests, slatted seat and back, front view, ${LOOK}`, size: 1.7, seed: 21, meshSeed: 7 },
  { name: 'street-lamp', prompt: `a black cast iron Victorian street lamp post with a single glass lantern on top, full height, ${LOOK}`, size: 3.4, seed: 22, meshSeed: 7 },
  { name: 'planter-tree', prompt: `a small leafy maple tree growing in a square concrete planter box, full height, ${LOOK}`, size: 2.9, seed: 23, meshSeed: 7 },
  { name: 'vending-machine', prompt: `a Japanese drinks vending machine, white and blue, rows of bottles behind glass, front view, ${LOOK}`, size: 1.85, seed: 24, meshSeed: 7 },
];

async function job(body) {
  const r = await fetch(`${MES}/jobs`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = await r.json();
  if (!r.ok) throw new Error(`${body.operation}: ${r.status} ${JSON.stringify(j)}`);
  const t0 = Date.now();
  while (!['holding', 'done', 'failed', 'cancelled', 'expired'].includes(j.state)) {
    j = await (await fetch(`${MES}/jobs/${j.id}?wait=10`, { headers: H })).json();
    process.stdout.write(`\r${body.operation} ${j.state} ${Math.round((Date.now() - t0) / 1000)} s   `);
  }
  console.log();
  if (j.state === 'failed') throw new Error(`${body.operation} failed: ${JSON.stringify(j.error)}`);
  const o = j.result.outputs[0];
  const bytes = new Uint8Array(await (await fetch(new URL(o.href, MES + '/').href, { headers: H })).arrayBuffer());
  return { job: j, bytes, mediaType: o.media_type };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const pick = process.argv.slice(2);
  const todo = PROPS.filter((p) => !pick.length || pick.includes(p.name));
  if (!todo.length) { console.error(`props: ${PROPS.map((p) => p.name).join(', ')}`); process.exit(2); }
  fs.mkdirSync(out('props/sources'), { recursive: true });
  const offers = await (await fetch(`${MES}/operations`, { headers: H })).json();
  const licenceOf = (op, model) => offers.operations.find((o) => o.operation === op)?.models.find((m) => m.id === model)?.license ?? null;
  // the job doesn't echo the model it ran, so the request's model names it (and its offer's licence)
  const keep = (j, model) => {
    const effective = structuredClone(j.result?.effective ?? {});
    delete effective.model_params?.['x-gaea.worker']?.outputs; // local paths
    return { id: j.id, operation: j.operation, model, effective, licence: licenceOf(j.operation, model), warnings: j.result?.warnings ?? [] };
  };
  const release = await acquireGpuLock({ who: 'content/sample/tools/generate-park.mjs (Gaea)', onWait: sayWaiting('generate-park.mjs') });
  try {
    for (const p of todo) {
      console.log(`${p.name}:`);
      const img = await job({ operation: 'image.generate', model: 'z-image-turbo', inputs: { prompt: p.prompt }, params: { size: { width: 1024, height: 1024 }, seed: p.seed } });
      fs.writeFileSync(out(`props/sources/${p.name}.png`), img.bytes);
      const up = await (await fetch(`${MES}/uploads`, { method: 'POST', headers: { ...H, 'Content-Type': img.mediaType ?? 'image/png' }, body: img.bytes })).json();
      const mesh = await job({ operation: 'mesh.generate', model: 'trellis2-512', inputs: { image: { upload: up.upload_id } }, params: { seed: p.meshSeed, size_m: p.size, max_faces: 40000, texture_size: 1024 } });
      fs.writeFileSync(out(`props/${p.name}.glb`), mesh.bytes);
      fs.writeFileSync(out(`props/sources/${p.name}.json`), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), prompt: p.prompt, size_m: p.size, image: keep(img.job, 'z-image-turbo'), mesh: keep(mesh.job, 'trellis2-512'), glbBytes: mesh.bytes.length }, null, 1) + '\n');
      console.log(`wrote props/${p.name}.glb (${mesh.bytes.length} bytes)`);
    }
  } finally {
    release();
  }
}
