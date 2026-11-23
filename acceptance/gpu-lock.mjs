// M4 W3 (AB-T-0575): one GPU runner at a time on this machine. Exact-frame checks only hold on a quiet GPU (AB-D-0278:
// macOS 27.3 beta's Metal draws a rare odd MSAA frame while another process loads the GPU, AB-T-0589), so every runner
// that draws for a result takes this lock first, from any repository or session. The lock is a directory made with
// mkdir (atomic) holding owner.json (pid, who, since). A lock whose pid is gone is stale and is taken over; one with no
// owner.json is stale after a minute (a runner that died between mkdir and writing it).
//   node acceptance/gpu-lock.mjs run [--who name] [--wait seconds] -- <command> [args…]   hold it while a command runs
//   node acceptance/gpu-lock.mjs status                                                   who holds it, if anyone
//   node acceptance/gpu-lock.mjs held                                                     exit 0 if VRMXG_GPU_LOCK_HELD names the live holder
//   import { acquireGpuLock } from './gpu-lock.mjs'; const release = await acquireGpuLock({ who }); … release();
// VRMXG_GPU_LOCK overrides the directory (default /tmp/vrmxg-gpu.lock). A child of a holder sees VRMXG_GPU_LOCK_HELD
// (the holder's pid) and doesn't take it again, so a locked runner can call other locked runners.
// Taking over a stale lock is serialised by a second directory (<lock>.takeover), and whoever takes the lock reads
// owner.json back: two waiters that both saw the same dead owner can't both end up holding it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const LOCK_DIR = process.env.VRMXG_GPU_LOCK ?? '/tmp/vrmxg-gpu.lock';
const OWNER = 'owner.json';

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readOwner = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, OWNER), 'utf8')); } catch { return null; } };

/**
 * Who holds the lock: { pid, who, since, alive }, or null when it is free. Safe against the holder releasing meanwhile
 * (the directory going between any two reads gives null, never a throw).
 */
export function lockStatus(dir = LOCK_DIR) {
  const o = readOwner(dir);
  if (o) return { ...o, alive: alive(o.pid) };
  let since;
  try { since = fs.statSync(dir).mtimeMs; } catch { return null; } // released (or never taken)
  const again = readOwner(dir); // owner.json may have been written between the two reads
  if (again) return { ...again, alive: alive(again.pid) };
  return { pid: null, who: null, since, alive: false, noOwner: true };
}

/**
 * Removes the lock if it is still the stale one seen (`seen`: the status that looked stale), under <dir>.takeover so
 * that only one waiter at a time clears it. Returns whether it removed it.
 */
function clearStale(dir, seen) {
  const stale = (s) => !!s && (s.noOwner ? Date.now() - s.since > 60000 : !s.alive);
  if (!stale(seen)) return false;
  const guard = `${dir}.takeover`;
  try { fs.mkdirSync(guard); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    // a takeover guard left by a waiter that died mid-takeover (the window is a few ms): stale after 10 s
    try { if (Date.now() - fs.statSync(guard).mtimeMs > 10000) fs.rmSync(guard, { recursive: true, force: true }); } catch { /* gone */ }
    return false;
  }
  try {
    const now = lockStatus(dir); // re-read under the guard: another waiter may already have taken it over
    if (!now || !stale(now) || now.pid !== seen.pid) return false;
    // rename first (atomic), then delete the renamed copy: nothing deletes a directory it didn't just move aside
    const aside = `${dir}.stale-${process.pid}-${Date.now()}`;
    try { fs.renameSync(dir, aside); } catch { return false; }
    fs.rmSync(aside, { recursive: true, force: true });
    return true;
  } finally { fs.rmSync(guard, { recursive: true, force: true }); }
}

/**
 * Takes the lock, waiting up to `waitMs` for the holder. Resolves to release(); rejects on time-out naming the holder.
 * release.held is the holder's pid (this process's, or the outer holder's when this was a no-op inside a holder's child).
 * Inside a holder's child (VRMXG_GPU_LOCK_HELD names the live holder) it resolves at once to a no-op.
 * @param {{ who?: string, waitMs?: number, dir?: string, onWait?: (holder: any) => void, pollMs?: number }} [o]
 * @returns {Promise<(() => void) & { held: number }>}
 */
export async function acquireGpuLock({ who = path.basename(process.argv[1] ?? 'node'), waitMs = 4 * 3600 * 1000, dir = LOCK_DIR, onWait = null, pollMs = 1000 } = {}) {
  const held = +(process.env.VRMXG_GPU_LOCK_HELD ?? 0), s0 = lockStatus(dir);
  if (held && s0?.pid === held && s0.alive) return Object.assign(() => {}, { held });
  const start = Date.now();
  let told = false;
  for (;;) {
    let made = false;
    try { fs.mkdirSync(dir); made = true; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    if (made) {
      fs.writeFileSync(path.join(dir, OWNER), JSON.stringify({ pid: process.pid, who, since: Date.now(), host: os.hostname() }) + '\n');
      // read it back: only the owner it names holds the lock
      if (readOwner(dir)?.pid === process.pid) {
        let released = false;
        const release = Object.assign(() => {
          if (released) return; released = true;
          if (readOwner(dir)?.pid === process.pid) {
            const aside = `${dir}.released-${process.pid}-${Date.now()}`;
            try { fs.renameSync(dir, aside); fs.rmSync(aside, { recursive: true, force: true }); } catch { /* already gone */ }
          }
          if (process.env.VRMXG_GPU_LOCK_HELD === String(process.pid)) delete process.env.VRMXG_GPU_LOCK_HELD;
          process.off('exit', release);
        }, { held: process.pid });
        process.on('exit', release);
        process.env.VRMXG_GPU_LOCK_HELD = String(process.pid);
        return release;
      }
      continue; // someone else's owner.json: back off
    }
    const s = lockStatus(dir);
    if (s && clearStale(dir, s)) continue;
    if (Date.now() - start > waitMs) { const h = lockStatus(dir); throw new Error(`gpu-lock: ${dir} is held by pid ${h?.pid} (${h?.who}) since ${new Date(h?.since ?? 0).toISOString()}`); }
    if (!told && s) { told = true; onWait?.(s); }
    await sleep(pollMs);
  }
}

/** Whether VRMXG_GPU_LOCK_HELD names the lock's live owner (the shell runners' check before re-running under it). */
export function heldByEnv(dir = LOCK_DIR) {
  const held = +(process.env.VRMXG_GPU_LOCK_HELD ?? 0), s = lockStatus(dir);
  return !!held && s?.pid === held && s.alive;
}

/** For runners: say who a waiting runner waits for. */
export const sayWaiting = (who) => (h) => console.error(`gpu-lock: ${who} waiting for pid ${h?.pid} (${h?.who})`);

if (process.argv[1] === import.meta.filename) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'status') {
    const s = lockStatus();
    console.log(s ? JSON.stringify(s) : 'free');
  } else if (cmd === 'held') {
    process.exit(heldByEnv() ? 0 : 1);
  } else if (cmd === 'run') {
    const sep = rest.indexOf('--');
    const opts = sep < 0 ? [] : rest.slice(0, sep), argv = sep < 0 ? rest : rest.slice(sep + 1);
    const opt = (k) => { const i = opts.indexOf(k); return i < 0 ? null : opts[i + 1]; };
    if (!argv.length) { console.error('usage: gpu-lock.mjs run [--who name] [--wait seconds] -- <command> [args…]'); process.exit(2); }
    const who = opt('--who') ?? path.basename(argv[0]);
    const release = await acquireGpuLock({ who, waitMs: opt('--wait') ? +opt('--wait') * 1000 : undefined, onWait: sayWaiting(who) });
    // the holder's pid, passed through: inside an outer holder that is the outer holder's, not this process's
    const child = spawn(argv[0], argv.slice(1), { stdio: 'inherit', env: { ...process.env, VRMXG_GPU_LOCK_HELD: String(release.held) } });
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
    child.on('exit', (code, sig) => { release(); process.exit(code ?? (sig ? 1 : 0)); });
  } else {
    console.error('usage: gpu-lock.mjs status | held | run [--who name] [--wait seconds] -- <command> [args…]');
    process.exit(2);
  }
}
