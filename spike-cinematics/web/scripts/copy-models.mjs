// Copies the spike-physics test models in (never committed: public/models is git-ignored).
import fs from 'node:fs';
import path from 'node:path';
const src = path.resolve(import.meta.dirname, '../../../spike-physics/web/public/models');
const dst = path.resolve(import.meta.dirname, '../public/models');
fs.mkdirSync(dst, { recursive: true });
for (const f of ['spec.vrm', 'vroid10.vrm', 'idle.vrma']) {
  if (!fs.existsSync(path.join(dst, f))) fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
console.log('models ready');
