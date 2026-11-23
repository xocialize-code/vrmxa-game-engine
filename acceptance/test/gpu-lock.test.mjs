// M4 W3: the machine's GPU lock (acceptance/gpu-lock.mjs), on a lock directory of the test's own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { acquireGpuLock, lockStatus, heldByEnv } from '../gpu-lock.mjs';

const child = path.join(import.meta.dirname, 'lock-child.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-lock-test-'));
const run = (...args) => new Promise((resolve) => { const p = spawn(process.execPath, [child, ...args], { stdio: 'inherit', env: { ...process.env, VRMXG_GPU_LOCK_HELD: '' } }); p.on('exit', resolve); });
/** A pid that is certainly gone: a process that has exited. */
const deadPid = () => spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout.trim();

test('take, status, release; a second take waits for the first', async () => {
  const dir = path.join(tmp(), 'lock');
  const release = await acquireGpuLock({ dir, who: 'test' });
  assert.equal(lockStatus(dir).pid, process.pid);
  assert.equal(release.held, process.pid);
  assert.equal(process.env.VRMXG_GPU_LOCK_HELD, String(process.pid));
  assert.ok(heldByEnv(dir));
  release();
  assert.equal(lockStatus(dir), null);
  assert.equal(process.env.VRMXG_GPU_LOCK_HELD, undefined, 'released: the env no longer names a holder');
  // a live holder (this test's parent process) is waited for, and the wait times out naming it
  fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({ pid: process.ppid, who: 'live' }));
  await assert.rejects(acquireGpuLock({ dir, waitMs: 30, pollMs: 5 }), new RegExp(`held by pid ${process.ppid} \\(live\\)`));
  assert.equal(lockStatus(dir).pid, process.ppid, 'a live holder is never taken over');
  fs.rmSync(dir, { recursive: true });
});

test('a stale lock (dead owner) is taken over by exactly one of several waiters at a time', async () => {
  const base = tmp(), dir = path.join(base, 'lock'), log = path.join(base, 'log');
  fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({ pid: +deadPid(), who: 'dead' }));
  await Promise.all(Array.from({ length: 6 }, () => run(dir, log, 'hold')));
  const lines = fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => l.split(' '));
  assert.equal(lines.length, 12);
  assert.ok(lines.every((l) => l[0] === 'start' || l[3] === 'mine'), 'no holder lost the lock to another');
  // starts and ends alternate: never two holders at once
  lines.forEach((l, i) => assert.equal(l[0], i % 2 ? 'end' : 'start', `line ${i}: ${l.join(' ')}`));
  for (let i = 0; i < lines.length; i += 2) assert.equal(lines[i][1], lines[i + 1][1]);
  assert.equal(lockStatus(dir), null);
  assert.deepEqual(fs.readdirSync(base).filter((f) => f !== 'log'), [], 'no takeover guard or set-aside directory left');
});

test('a status read racing the holder\'s release never throws', async () => {
  const dir = path.join(tmp(), 'lock');
  let reads = 0, done = false;
  const churn = run(dir, '/dev/null', 'churn', '400').then(() => { done = true; });
  while (!done) { lockStatus(dir); reads++; if (reads % 50 === 0) await new Promise((r) => setImmediate(r)); }
  await churn;
  assert.ok(reads > 100);
});

test('inside a holder\'s child the take is a no-op that names the outer holder', async () => {
  const dir = path.join(tmp(), 'lock');
  const release = await acquireGpuLock({ dir, who: 'outer' });
  const inner = await acquireGpuLock({ dir, who: 'inner', waitMs: 0 });
  assert.equal(inner.held, process.pid);
  inner();
  assert.equal(lockStatus(dir).pid, process.pid, 'the inner no-op release leaves the outer lock');
  release();
});
