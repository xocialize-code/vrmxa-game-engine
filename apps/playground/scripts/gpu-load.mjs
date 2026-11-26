// What else is using the GPU (AB-T-0589): a result that must be exact is only as good as the load it ran under, so the
// runners record it. A snapshot is the GPU's utilisation (IOAccelerator's "Device Utilization %") and the processes of
// the kinds that draw or compute on it: WebKit (WebContent, GPU), Chromium and Chrome (and their GPU helpers), python, MLX,
// our harnesses (CinematicsSpike, the native Metal repro `machine`), node, (M4 W3) the person's own browsers with every helper,
// and (M5 W11) Gaea and its ML plugin workers. Anything else is unseen by name (AB-T-0640). Other apps' GPU helpers ("… Helper (GPU)")
// are counted, not named. Process names only, no paths or arguments.
//   import { snapshot, summarise } from './gpu-load.mjs'
//   node apps/playground/scripts/gpu-load.mjs sample <file.jsonl> [seconds]   append a snapshot every N seconds (15) until killed
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const KINDS = [
  ['webkit', /com\.apple\.WebKit\.(WebContent|GPU)/],
  // Chrome for Testing (the runners' headless browser) and Chromium, every helper; matched on the executable's path
  ['chromium', /Chrome for Testing|Chromium( Helper( \([^)]*\))?)?$/],
  // M4 W3: the person's own browsers, every helper (a busy "Google Chrome Helper (Aperitif)" loaded the GPU ~65 % unseen)
  ['browser', /Google Chrome( Helper( \([^)]*\))?)?$|Microsoft Edge|Brave Browser|Arc( Helper( \([^)]*\))?)?$|Firefox|plugin-container/],
  ['python', /(^|\/)python[0-9.]*$/i],
  ['mlx', /mlx/i],
  // M5 W11: Gaea and its ML plugin workers (another project's tests ran gaea-ace-step-worker at ~80 % CPU and the GPU at
  // up to 99 %, and the load was classed quiet)
  ['gaea', /(^|\/)Gaea$|gaea-[a-z0-9-]+-worker$|\.gaeaplugin\/|ace-step-inproc$/i],
  ['harness', /CinematicsSpike|RepeatHarness|AcceptanceHarness/],
  ['metal-repro', /repros\/metal\/machine$|(^|\/)machine$/],
  ['node', /(^|\/)node$/],
];

/** One snapshot: { at, gpuUtil, processes: [{ kind, name, pid, cpu }], otherGpuHelpers } */
export function snapshot() {
  let gpuUtil = null;
  try { const m = execFileSync('ioreg', ['-r', '-c', 'IOAccelerator', '-d', '1'], { encoding: 'utf8' }).match(/"Device Utilization %"=(\d+)/); gpuUtil = m ? +m[1] : null; } catch { /* no ioreg */ }
  const processes = []; let otherGpuHelpers = 0;
  let ps = '';
  try { ps = execFileSync('ps', ['-Ao', 'pid=,pcpu=,comm='], { encoding: 'utf8', maxBuffer: 1 << 24 }); } catch { /* no ps */ }
  for (const line of ps.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+([\d.]+)\s+(.*)$/); if (!m) continue;
    const [, pid, cpu, comm] = m, kind = KINDS.find(([, re]) => re.test(comm))?.[0];
    const name = comm.split('/').pop();
    if (kind) processes.push({ kind, name, pid: +pid, cpu: +cpu });
    else if (/Helper \(GPU\)$/.test(name)) { otherGpuHelpers++; if (+cpu >= 1) processes.push({ kind: 'gpu-helper', name, pid: +pid, cpu: +cpu }); } // M4 W3: other apps' GPU helpers when busy
  }
  return { at: Date.now(), gpuUtil, processes, otherGpuHelpers };
}

/**
 * The samples between two wall-clock times, summarised: the first and last snapshot's processes, the GPU's utilisation
 * (min, median, max) and every process kind and name seen with its highest CPU.
 * @param {any[]} samples snapshots @param {number} start @param {number} end (ms since the epoch)
 */
export function summarise(samples, start, end) {
  const inside = samples.filter((s) => s.at >= start - 15000 && s.at <= end + 15000);
  if (!inside.length) return null;
  const util = inside.map((s) => s.gpuUtil).filter((u) => u !== null).sort((a, b) => a - b);
  const seen = {};
  for (const s of inside) for (const p of s.processes) { const k = `${p.kind}:${p.name}`; seen[k] = Math.max(seen[k] ?? 0, p.cpu); }
  const brief = (s) => ({ at: s.at, gpuUtil: s.gpuUtil, processes: s.processes.filter((p) => p.cpu >= 1).map((p) => `${p.kind}:${p.name} ${p.cpu}%`), otherGpuHelpers: s.otherGpuHelpers });
  return { samples: inside.length, gpuUtil: util.length ? { min: util[0], median: util[util.length >> 1], max: util.at(-1) } : null, seen, first: brief(inside[0]), last: brief(inside.at(-1)) };
}

if (process.argv[2] === 'sample') {
  const file = process.argv[3], every = +(process.argv[4] ?? 15) * 1000;
  const tick = () => fs.appendFileSync(file, JSON.stringify(snapshot()) + '\n');
  tick(); setInterval(tick, every);
}
