// Reads every runtime's results and evaluates M0's six exit checks (M0-PLAN.md "What M0 is done looking like").
// Writes results/summary.json and prints a line per check. Exit 1 if any automated check fails.
//   node acceptance/compare.mjs
import fs from 'node:fs';
import path from 'node:path';
import { compareRuns, unpackRun } from '@vrmxg/snapshot';

const here = import.meta.dirname, res = (f) => path.join(here, 'results', f);
const load = (f) => (fs.existsSync(res(f)) ? JSON.parse(fs.readFileSync(res(f), 'utf8')) : null);
const node = load('node.json'), chromium = load('chromium.json'), scheme = load('wkwebview-scheme.json'), loopback = load('wkwebview-loopback.json');
const browsers = { chromium, 'wkwebview-scheme': scheme, 'wkwebview-loopback': loopback };
const sim = (r) => r?.result?.simulation ?? r?.simulation;
// Key order isn't data (the WKWebView harness app writes its JSON with sorted keys): compare canonically.
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
const checks = [];
const check = (n, title, ok, evidence) => { checks.push({ n, title, ok, evidence }); console.log(`${ok ? '✔' : '✖'} ${n}. ${title}\n    ${evidence}`); };

// 1. The cafe runs in the playground, in WKWebView and Chromium, with set, player, NPC, door, lights, camera presets.
{
  const rows = Object.entries(browsers).map(([k, r]) => {
    const x = r?.result?.rendered, errs = (r?.errors?.length ?? 0) + (r?.console?.filter((l) => l.startsWith('error') || l.startsWith('pageerror')).length ?? 0);
    const ok = !!x && errs === 0 && x.frames >= 600 && x.scene.setMeshes > 0 && x.scene.player.includes('player') && x.scene.npc.includes('wander')
      && x.scene.doors.includes('entrance') && x.scene.lights.length >= 2 && x.doorSignals.some((s) => s.signal === 'opened') && Object.keys(x.presets).length === 6;
    return { k, ok, line: x ? `${k}: ${x.frames} frames, render ${x.renderMs.mean} ms, door opened at step ${x.doorSignals.find((s) => s.signal === 'opened')?.step}, ${Object.keys(x.presets).length} presets, ${errs} errors` : `${k}: no result` };
  });
  check(1, 'The cafe runs in the playground in WKWebView (scheme, loopback) and Chromium', rows.every((r) => r.ok), rows.map((r) => r.line).join('; '));
}

// 2. Walk, run, jump through the action map on the controller, with VRMXA slots, speed blend and root motion.
{
  const p = sim(node).play, d = node.devices;
  const ok = ['idle', 'move', 'jump', 'fall', 'land'].every((s) => p.states.includes(s)) && p.maxSpeed === 4 && p.maxRunWeight === 1 && p.travelSteps > 0 && p.airborneSteps > 0
    && p.idleClip === 'idle-sword' && d.keyboardWalk.speed === 1.4 && d.keyboardRun.speed === 4 && d.keyboardRun.runWeight === 1 && d.keyboardJump.landed && d.gamepadStick.movedM > 0.5 && d.gamepadJump.airborneSteps > 0 && d.mouseLook.yawChange !== 0;
  const same = Object.values(browsers).every((r) => canon(r?.result?.devices) === canon(d));
  check(2, 'Walk, run and jump by keyboard, mouse and gamepad, with VRMXA slots, speed blend and root motion', ok && same,
    `states ${p.states.join('/')}; speed up to ${p.maxSpeed} m/s, run weight ${p.maxRunWeight}; ${p.travelSteps} steps on travel root motion; jump ${p.maxHeight} m; idle slot "${p.idleClip}" (Mira wears ${p.equipped.join(', ')}); keyboard walk ${d.keyboardWalk.speed}, run ${d.keyboardRun.speed} m/s; gamepad moved ${d.gamepadStick.movedM} m and jumped; mouse turned the camera ${d.mouseLook.yawChange} rad; same in every runtime: ${same}`);
}

// 3. Bit for bit: per-step hashes identical in Node, Chromium, WKWebView scheme and loopback; snapshot/restore identical.
{
  const ref = unpackRun(sim(node).run);
  const rows = Object.entries(browsers).map(([k, r]) => { const d = r ? compareRuns(ref, unpackRun(sim(r).run)) : { step: -1, component: 'no result' }; return { k, d, snap: sim(r)?.snapshot.matchesAtRestore && sim(r)?.snapshot.rerunMatches, same: r?.result?.rendered?.sameAsHeadless }; });
  const ok = rows.every((r) => !r.d && r.snap && r.same) && sim(node).snapshot.rerunMatches;
  check(3, 'A 10 s recorded run hashes identically at every step everywhere; a snapshot at 300 re-simulates to 600 identically', ok,
    `${ref.length - 1} steps × ${sim(node).components} components; final ${sim(node).final}; ${rows.map((r) => `${r.k}: ${r.d ? `DIVERGES at ${r.d.step} in ${r.d.component}` : 'identical'}, snapshot ${r.snap ? 'identical' : 'DIFFERS'}, rendered = headless ${r.same}`).join('; ')}`);
}

// 4. Budget: 20 characters + physics < 5 ms per step in WKWebView loopback (the W6 harness, re-run at this commit).
{
  const b = JSON.parse(fs.readFileSync(path.join(here, '../engine/packages/snapshot/harness/results/wkwebview-loopback.json'), 'utf8')).budget;
  check(4, '20 characters plus physics step in under 5 ms in WKWebView over loopback (M5 Max)', b.characters === 20 && b.stepMs.mean < 5,
    `${b.characters} characters, ${b.stepMs.mean} ms mean, p95 ${b.stepMs.p95}, max ${b.stepMs.max} (engine/packages/snapshot/harness, ${b.steps} timed steps); not measured on a base M-series Mac`);
}

// 5. MCP, from the Claude Code session (results/mcp-session.json).
const mcp = fs.existsSync(res('mcp-session.json')) ? JSON.parse(fs.readFileSync(res('mcp-session.json'), 'utf8')) : null;
if (mcp) check(5, 'MCP: describe, inspect the running engine, edit with undo', mcp.ok, mcp.evidence);

// 6. Debug draw, counted in every browser.
{
  const rows = Object.entries(browsers).map(([k, r]) => { const x = r?.result?.rendered?.debug; return { k, x, ok: !!x && x.colliders + x.sensors.length + x.capsules.length === x.physicsColliders && x.sensors.length === 3 && x.capsules.length === 2 && x.rays > 0 }; });
  const x = rows[0].x;
  check(6, 'Debug draw shows colliders, sensors, rays and the character capsules', rows.every((r) => r.ok), `${x.colliders} colliders + ${x.sensors.length} sensors (${x.sensors.join(', ')}) + ${x.capsules.length} capsules (${x.capsules.join(', ')}) = ${x.physicsColliders} of ${x.physicsColliders}; ${x.rays} spring-arm ray; the same in ${rows.filter((r) => r.ok).map((r) => r.k).join(', ')}`);
}
checks.sort((a, b) => a.n - b.n);
fs.writeFileSync(res('summary.json'), JSON.stringify({ checks, runtimes: { node: node?.version, chromium: chromium?.version, wkwebview: scheme?.ua } }, null, 1) + '\n');
process.exit(checks.every((c) => c.ok) ? 0 : 1);
