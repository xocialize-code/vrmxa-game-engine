// A child for gpu-lock.test.mjs: node lock-child.mjs <dir> <log> <mode> [n]
//   hold:  take the lock, log start, hold 60 ms, check owner.json is still this process's, log end, release
//   churn: take and release the lock n times as fast as it can
import fs from 'node:fs';
import { acquireGpuLock, lockStatus } from '../gpu-lock.mjs';

const [dir, log, mode, n = '1'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (mode === 'hold') {
  const release = await acquireGpuLock({ dir, who: `child ${process.pid}`, pollMs: 5 });
  fs.appendFileSync(log, `start ${process.pid} ${Date.now()}\n`);
  await sleep(60);
  const mine = lockStatus(dir)?.pid === process.pid;
  fs.appendFileSync(log, `end ${process.pid} ${Date.now()} ${mine ? 'mine' : 'STOLEN'}\n`);
  release();
} else if (mode === 'churn') {
  for (let i = 0; i < +n; i++) { const release = await acquireGpuLock({ dir, who: 'churn', pollMs: 1 }); release(); }
}
