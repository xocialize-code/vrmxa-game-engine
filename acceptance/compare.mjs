// Reads every runtime's results and evaluates M0's six exit checks (M0-PLAN.md "What M0 is done looking like"), plus
// M1's: audio (W5), the recorded take with items (W10) and Hana's line (W10).
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
      && x.scene.doors.includes('entrance-left') && x.scene.lights.length >= 2 && x.doorSignals.some((s) => s.to === 'open') && Object.keys(x.presets).length === 6;
    return { k, ok, line: x ? `${k}: ${x.frames} frames, render ${x.renderMs.mean} ms, door opened at step ${x.doorSignals.find((s) => s.to === 'open')?.step}, ${Object.keys(x.presets).length} presets, ${errs} errors` : `${k}: no result` };
  });
  check(1, 'The cafe runs in the playground in WKWebView (scheme, loopback) and Chromium', rows.every((r) => r.ok), rows.map((r) => r.line).join('; '));
}

// 2. Walk, run, jump through the action map on the controller, with VRMXA slots, speed blend and root motion.
{
  const p = sim(node).play, d = node.devices;
  const ok = ['idle', 'move', 'jump', 'fall', 'land'].every((s) => p.states.includes(s)) && p.maxSpeed === 4 && p.maxRunWeight === 1 && p.travelSteps > 0 && p.airborneSteps > 0
    && p.idleClip === 'idle' && d.takeSword?.idleBefore === 'default' && d.takeSword?.idleAfter === 'sword' && d.takeSword?.taken && d.keyboardWalk.speed === 1.4 && d.keyboardRun.speed === 4 && d.keyboardRun.runWeight === 1 && d.keyboardJump.landed && d.gamepadStick.movedM > 0.5 && d.gamepadJump.airborneSteps > 0 && d.mouseLook.yawChange !== 0;
  const same = Object.values(browsers).every((r) => canon(r?.result?.devices) === canon(d));
  check(2, 'Walk, run and jump by keyboard, mouse and gamepad, with VRMXA slots, speed blend and root motion', ok && same,
    `states ${p.states.join('/')}; speed up to ${p.maxSpeed} m/s, run weight ${p.maxRunWeight}; ${p.travelSteps} steps on travel root motion; jump ${p.maxHeight} m; idle slot "${p.idleClip}" (Mira wears ${p.equipped.join(', ')}); taking the sword (M1 W4): prompts ${d.takeSword?.prompts?.join(', ')}, idle set ${d.takeSword?.idleBefore} → ${d.takeSword?.idleAfter}, worn ${d.takeSword?.worn?.join(', ')}; keyboard walk ${d.keyboardWalk.speed}, run ${d.keyboardRun.speed} m/s; gamepad moved ${d.gamepadStick.movedM} m and jumped; mouse turned the camera ${d.mouseLook.yawChange} rad; same in every runtime: ${same}`);
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

// 6. Debug draw, counted in every browser (14 Reach sensors since M1 W9: doors, switch, sword, cupboard, 8 stools).
{
  const rows = Object.entries(browsers).map(([k, r]) => { const x = r?.result?.rendered?.debug; return { k, x, ok: !!x && x.colliders + x.sensors.length + x.capsules.length === x.physicsColliders && x.sensors.length === 14 && x.sensors.every((n) => n.endsWith('#Reach')) && x.capsules.length === 2 && x.rays > 0 }; });
  const x = rows[0].x;
  check(6, 'Debug draw shows colliders, sensors, rays and the character capsules', rows.every((r) => r.ok), `${x.colliders} colliders + ${x.sensors.length} sensors (${x.sensors.join(', ')}) + ${x.capsules.length} capsules (${x.capsules.join(', ')}) = ${x.physicsColliders} of ${x.physicsColliders}; ${x.rays} rays (the spring arm's, the interaction focus's); the same in ${rows.filter((r) => r.ok).map((r) => r.k).join(', ')}`);
}
// 7 (M1 W5). Sound is presentation: the items take heard through Web Audio hashes as the silent run; the offline mix of
// its recording is the same samples twice; the doors, the switch (positional), ambience, music and Hana's voice are heard.
{
  const want = ['node:music', 'node:ambience', 'node:entrance-open-sound', 'node:switch-sound', 'voice:hana-1'];
  const rows = Object.entries(browsers).map(([k, r]) => { const a = r?.result?.audio; return { k, a, ok: !!a && a.sameAsSilent && a.mix.same && a.mix.peak > 0 && want.every((x) => a.sounds.includes(x)) }; });
  const a = rows.find((r) => r.a)?.a;
  check(7, 'Audio: the run with sound hashes as without; the offline mix renders identically twice', rows.every((r) => r.ok),
    a ? rows.map((r) => `${r.k}: ${r.a ? `final ${r.a.final} ${r.a.sameAsSilent ? '= silent' : '≠ SILENT'}, mix ${r.a.mix.seconds} s ${r.a.mix.hashA}/${r.a.mix.hashB} ${r.a.mix.same ? 'same' : 'DIFFER'}, peak ${r.a.mix.peak}` : 'no result'}`).join('; ') + `; heard: ${a.sounds.join(', ')}` : 'no audio results');
}
// 8 (M1 W10). The recorded take with items: Mira takes the sword into her closet (held, her idle set changes), opens the
// cupboard, sits on a stool and gets up, switches the lights off: prompts, verbs and animation slots for each; identical
// per-step hashes in every runtime; a snapshot after the equip restored and re-simulated to the end identically.
const items = (r) => r?.result?.items ?? r?.items;
{
  const ref = items(node);
  const summary = (x) => x && canon({ prompts: x.prompts, states: x.states, seatedAt: x.seatedAt, swordTakenAt: x.swordTakenAt, closet: x.closet, items: x.items, itemSignals: x.itemSignals, hana: x.hana, final: x.final });
  const okRun = (x) => !!x && x.snapshot.afterEquip && x.snapshot.matchesAtRestore && x.snapshot.rerunMatches && ['take:sword', 'open:cupboard', 'sit:stool-7', 'use:light-switch'].every((p) => x.prompts[p])
    && ['take', 'use', 'sit', 'sitIdle', 'stand'].every((st) => x.states.includes(st)) && x.closet?.held.includes('held:sword') && x.closet?.idleSet === 'sword'
    && x.items.sword === 'taken' && x.items.cupboard === 'open' && x.items['light-switch'] === 'off' && x.seatedAt !== null;
  const rows = Object.entries(browsers).map(([k, r]) => { const x = items(r); const d = x && ref ? compareRuns(unpackRun(ref.run), unpackRun(x.run)) : { step: -1, component: 'no result' }; return { k, d, ok: okRun(x) && !d && summary(x) === summary(ref) }; });
  check(8, 'The take with items: sword into the closet, cupboard, stool, switch; identical everywhere, snapshot across the equip', !!ref && okRun(ref) && rows.every((r) => r.ok),
    ref ? `${ref.steps} steps × ${ref.components} components, final ${ref.final}; prompts ${Object.entries(ref.prompts).filter(([p]) => /sword|cupboard|stool-7|switch/.test(p)).map(([p, v]) => `${v.prompt} ${p.split(':')[1]} @${v.step}`).join(', ')}; states ${ref.states.join('/')}; sword taken @${ref.swordTakenAt}, worn ${ref.closet.worn.join('+')}, ${ref.closet.held.join(', ')}, idle set "${ref.closet.idleSet}"; seated @${ref.seatedAt}; cupboard ${ref.items.cupboard}, switch ${ref.items['light-switch']}; snapshot @${ref.snapshot.at} (after the equip) ${ref.snapshot.matchesAtRestore && ref.snapshot.rerunMatches ? 'identical' : 'DIFFERS'}; ${rows.map((r) => `${r.k}: ${r.d ? `DIVERGES at ${r.d.step} in ${r.d.component}` : r.ok ? 'identical' : 'DIFFERS'}`).join('; ')}` : 'no node result');
}

// 9 (M1 W10). Hana talks: walking up to her starts her line; her voice plays from her (check 7), her mouth follows it
// (the lip-sync lag is measured by @vrmxg/voice's test against the clip's loudness), she looks at Mira and blinks, and a
// caption says the line. Same in every runtime (part of check 8's summary).
{
  const h = items(node)?.hana, lag = (() => { try { return JSON.parse(fs.readFileSync(res('lipsync.json'), 'utf8')); } catch { return null; } })();
  const ok = !!h && h.speakingSteps > 60 && h.mouthMax > 0.3 && h.lookingAtMira > 0 && h.blinks >= 2 && !!h.caption?.text && (!lag || Math.abs(lag.bestLagMs) <= 50);
  check(9, 'Hana greets Mira: her line, mouth, look-at, blinks and caption', ok,
    h ? `line from step ${h.firstLineAt} for ${h.speakingSteps} steps, mouth up to ${h.mouthMax}, looking at Mira ${h.lookingAtMira} steps (${h.glances} glances), ${h.blinks} blinks, caption "${h.caption?.name}: ${h.caption?.text}"${lag ? `; lip sync ${lag.bestLagMs >= 0 ? '+' : ''}${lag.bestLagMs} ms against the clip (${lag.source})` : ''}` : 'no result');
}
checks.sort((a, b) => a.n - b.n);
fs.writeFileSync(res('summary.json'), JSON.stringify({ checks, runtimes: { node: node?.version, chromium: chromium?.version, wkwebview: scheme?.ua } }, null, 1) + '\n');
process.exit(checks.every((c) => c.ok) ? 0 : 1);
