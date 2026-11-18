// Generates the espresso machine on the counter with the local Gaea (MES on 127.0.0.1:17630): an image from
// Z-Image-Turbo (Apache-2.0), then a textured mesh from it with TRELLIS.2 (MIT; its DINOv3 conditioner asks for
// "Built with DINOv3"). Seeds are fixed; the request, the effective parameters and the licences each job reported
// are kept in props/sources/espresso-machine.json. The outputs are committed; re-run only to regenerate.
//   node content/sample/tools/generate-prop.mjs
import fs from 'node:fs';
import path from 'node:path';

const MES = 'http://127.0.0.1:17630/mes/v0', H = { 'MES-Version': '0.1' };
const root = path.resolve(import.meta.dirname, '..');
const out = (rel) => path.join(root, rel);
fs.mkdirSync(out('props/sources'), { recursive: true });

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

const prompt = 'a compact stainless steel espresso machine with a black portafilter and two small white cups on top, product photo, centered, plain light grey background, soft studio light, three-quarter view';
const img = await job({ operation: 'image.generate', model: 'z-image-turbo', inputs: { prompt }, params: { size: { width: 1024, height: 1024 }, seed: 11 } });
fs.writeFileSync(out('props/sources/espresso-machine.png'), img.bytes);

const up = await (await fetch(`${MES}/uploads`, { method: 'POST', headers: { ...H, 'Content-Type': img.mediaType ?? 'image/png' }, body: img.bytes })).json();
const mesh = await job({ operation: 'mesh.generate', model: 'trellis2-512', inputs: { image: { upload: up.upload_id } }, params: { seed: 5, size_m: 0.42, max_faces: 40000, texture_size: 1024 } });
fs.writeFileSync(out('props/espresso-machine.glb'), mesh.bytes);

// The licence each model's offer states (GET /operations), and the effective parameters without local paths.
const offers = await (await fetch(`${MES}/operations`, { headers: H })).json();
const licenceOf = (op, model) => offers.operations.find((o) => o.operation === op)?.models.find((m) => m.id === model)?.license ?? null;
const keep = (j) => {
  const effective = structuredClone(j.result?.effective ?? {});
  delete effective.model_params?.['x-gaea.worker']?.outputs;
  return { id: j.id, operation: j.operation, model: j.model, effective, licence: licenceOf(j.operation, j.model), warnings: j.result?.warnings ?? [] };
};
fs.writeFileSync(out('props/sources/espresso-machine.json'), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), prompt, image: keep(img.job), mesh: keep(mesh.job), glbBytes: mesh.bytes.length }, null, 1) + '\n');
console.log('wrote props/espresso-machine.glb', mesh.bytes.length, 'bytes');
