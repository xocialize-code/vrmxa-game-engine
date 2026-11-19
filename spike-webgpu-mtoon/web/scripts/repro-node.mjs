// Load test in Node (no GPU): import three-vrm's node material and construct it, for
// three r187 and r186.1 × stock 3.5.5 and the patched copy. One child process per cell, because a
// failed ES module link can't be retried in the same process.
//   node scripts/repro-node.mjs [--save]      → results/repro-node.json with --save
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const web = path.resolve(import.meta.dirname, '..');
if (process.argv[2] === '--child') {
  const [, , , lib] = process.argv;
  const warnings = [];
  const warn = console.warn;
  console.warn = (...a) => { warnings.push(a.join(' ')); };
  const out = { ok: false };
  try {
    const THREE = await import('three/webgpu');
    out.revision = THREE.REVISION;
    const mod = lib === 'stock' ? await import('@pixiv/three-vrm/nodes') : await import(path.join(web, 'src/vendor/three-vrm-nodes.js'));
    const m = new mod.MToonNodeMaterial();
    const o = new mod.MToonNodeMaterial(); o.isOutline = true;
    out.ok = true;
    out.constructed = [m.type, o.type];
  } catch (e) {
    out.error = `${e.name}: ${e.message}`;
  }
  console.warn = warn;
  out.warnings = [...new Set(warnings)];
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// For r186 the child resolves `three` (and three/*) to the three-r186 alias package.
const hook = `data:text/javascript,${encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === 'three' || spec.startsWith('three/')) spec = 'three-r186' + spec.slice(5);
  return next(spec, ctx);
}`)}`;
const register = `data:text/javascript,${encodeURIComponent(`import { register } from 'node:module'; register(${JSON.stringify(hook)});`)}`;

const rows = [];
for (const three of ['187', '186']) {
  for (const lib of ['stock', 'patched']) {
    const args = [...(three === '186' ? ['--import', register] : []), path.join(web, 'scripts/repro-node.mjs'), '--child', lib];
    const r = JSON.parse(execFileSync(process.execPath, args, { cwd: web, encoding: 'utf8' }));
    rows.push({ three, lib, ...r });
    console.log(`three r${three} (${r.revision ?? '?'}), ${lib}: ${r.ok ? 'ok' : r.error}${r.warnings.length ? `  [${r.warnings.length} warning(s): ${r.warnings[0].slice(0, 90)}]` : ''}`);
  }
}
const result = { date: new Date().toISOString(), node: process.version, threeVrm: JSON.parse(fs.readFileSync(path.join(web, 'node_modules/@pixiv/three-vrm/package.json'), 'utf8')).version, rows };
if (process.argv.includes('--save')) {
  fs.mkdirSync(path.join(web, '../results'), { recursive: true });
  fs.writeFileSync(path.join(web, '../results/repro-node.json'), JSON.stringify(result, null, 2) + '\n');
}
