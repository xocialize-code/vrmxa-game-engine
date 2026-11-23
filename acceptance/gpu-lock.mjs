// M4 W3 (AB-T-0575): one GPU runner at a time on this machine. Exact-frame checks only hold on a quiet GPU (AB-D-0278:
// macOS 27.3 beta's Metal draws a rare odd MSAA frame while another process loads the GPU, AB-T-0589), so every runner
// that draws for a result takes this lock first, from any repository or session. The lock is a directory made with
// mkdir (atomic) holding owner.json (pid, who, since). A lock whose pid is gone is stale and is taken over; one with no
// owner.json is stale after a minute (a runner that died between mkdir and writing it).
//   node acceptance/gpu-lock.mjs run [--who name] [--wait seconds] -- <command> [args…]   hold it while a command runs
//   node acceptance/gpu-lock.mjs status                                                   who holds it, if anyone
//   import { acquireGpuLock } from './gpu-lock.mjs'; const release = await acquireGpuLock({ who }); … release();
// VRMXG_GPU_LOCK overrides the directory (default /tmp/vrmxg-gpu.lock). A child of a holder sees VRMXG_GPU_LOCK_HELD
// (the holder's pid) and doesn't take it again, so a locked runner can call other locked runners.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const LOCK_DIR = process.env.VRMXG_GPU_LOCK ?? '/tmp/vrmxg-gpu.lock';
const OWNER = 'owner.json';

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Who holds the lock: { pid, who, since, alive } or null. */
export function lockStatus(dir = LOCK_DIR) {
  if (!fs.existsSync(dir)) return null;
  try { const o = JSON.parse(fs.readFileSync(path.join(dir, OWNER), 'utf8')); return { ...o, alive: alive(o.pid) }; } catch { return { pid: null, who: null, since: fs.statSync(dir).mtimeMs, alive: false, noOwner: true }; }
}

/** Removes a stale lock (dead pid, or no owner.json for a minute). @returns {boolean} whether it was stale */
function clearStale(dir) {
  const s = lockStatus(dir);
  if (!s) return false;
  const stale = s.noOwner ? Date.now() - s.since > 60000 : !s.alive;
  if (stale) { fs.rmSync(dir, { recursive: true, force: true }); return true; }
  return false;
}

/**
 * Takes the lock, waiting up to `waitMs` for the holder. Resolves to release(); rejects on time-out naming the holder.
 * Inside a holder's child (VRMXG_GPU_LOCK_HELD names a live holder) it resolves at once to a no-op.
 * @param {{ who?: string, waitMs?: number, dir?: string, onWait?: (holder: any) => void }} [o]
 */
export async function acquireGpuLock({ who = path.basename(process.argv[1] ?? 'node'), waitMs = 4 * 3600 * 1000, dir = LOCK_DIR, onWait = null } = {}) {
  const held = +(process.env.VRMXG_GPU_LOCK_HELD ?? 0), s0 = lockStatus(dir);
  if (held && s0?.pid === held && s0.alive) return () => {};
  const start = Date.now();
  let told = false;
  for (;;) {
    try {
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, OWNER), JSON.stringify({ pid: process.pid, who, since: Date.now(), host: os.hostname() }) + '\n');
      let released = false;
      const release = () => {
        if (released) return; released = true;
        const s = lockStatus(dir);
        if (s?.pid === process.pid) fs.rmSync(dir, { recursive: true, force: true });
        process.off('exit', release);
      };
      process.on('exit', release);
      process.env.VRMXG_GPU_LOCK_HELD = String(process.pid);
      return release;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (clearStale(dir)) continue;
      if (Date.now() - start > waitMs) { const s = lockStatus(dir); throw new Error(`gpu-lock: ${dir} is held by pid ${s?.pid} (${s?.who}) since ${new Date(s?.since ?? 0).toISOString()}`); }
      if (!told) { told = true; onWait?.(lockStatus(dir)); }
      await sleep(1000);
    }
  }
}

if (process.argv[1] === import.meta.filename) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'status') {
    const s = lockStatus();
    console.log(s ? JSON.stringify(s) : 'free');
  } else if (cmd === 'run') {
    const sep = rest.indexOf('--');
    const opts = sep < 0 ? [] : rest.slice(0, sep), argv = sep < 0 ? rest : rest.slice(sep + 1);
    const opt = (k) => { const i = opts.indexOf(k); return i < 0 ? null : opts[i + 1]; };
    if (!argv.length) { console.error('usage: gpu-lock.mjs run [--who name] [--wait seconds] -- <command> [args…]'); process.exit(2); }
    const release = await acquireGpuLock({ who: opt('--who') ?? path.basename(argv[0]), waitMs: opt('--wait') ? +opt('--wait') * 1000 : undefined, onWait: (h) => console.error(`gpu-lock: waiting for pid ${h?.pid} (${h?.who})`) });
    const child = spawn(argv[0], argv.slice(1), { stdio: 'inherit', env: { ...process.env, VRMXG_GPU_LOCK_HELD: String(process.pid) } });
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
    child.on('exit', (code, sig) => { release(); process.exit(code ?? (sig ? 1 : 0)); });
  } else {
    console.error('usage: gpu-lock.mjs status | run [--who name] [--wait seconds] -- <command> [args…]');
    process.exit(2);
  }
}
