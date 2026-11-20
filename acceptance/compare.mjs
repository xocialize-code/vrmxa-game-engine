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
// 10 (M2 W0 + W2). Tracks and cinematic cameras: the walk with an AnimationPlayer (door by event, light fade, Hana's talk
// clip) and a CameraBrain blending three VirtualCameras onto a camera hashes identically at every step everywhere,
// the brain's output camera included; a snapshot taken mid-blend re-simulates identically.
{
  const cin = (r) => r?.result?.cinematic ?? r?.cinematic, ref = cin(node);
  const rows = Object.entries(browsers).map(([k, r]) => { const x = cin(r); const d = x && ref ? compareRuns(unpackRun(ref.run), unpackRun(x.run)) : { step: -1, component: 'no result' }; return { k, d, ok: !!x && !d && x.snapshot.rerunMatches }; });
  const ok = !!ref && ref.snapshot.rerunMatches && ref.doorAt !== null && ref.talkMax > 0.99 && ref.cameraChanges.length >= 2 && rows.every((r) => r.ok);
  check(10, 'Tracks and cinematic cameras: AnimationPlayer + CameraBrain blends identical everywhere, snapshot mid-blend', ok,
    ref ? `${ref.steps} steps × ${ref.components} components (the brain's camera included), final ${ref.final}; door opened @${ref.doorAt} (event key), light ${ref.light}, Hana's talk clip up to ${ref.talkMax}; camera changes ${ref.cameraChanges.join(', ')}; snapshot @${ref.snapshot.at} (mid-blend) ${ref.snapshot.rerunMatches ? 'identical' : 'DIFFERS'}; ${rows.map((r) => `${r.k}: ${r.d ? `DIVERGES at ${r.d.step} in ${r.d.component}` : r.ok ? 'identical' : 'DIFFERS'}`).join('; ')}` : 'no node result');
}
// 11 (M2 W3). The post stack: the anime look renders with no errors in every browser; a 4K frame scaled to 1080p looks
// like the 1080p frame (SSIM ≥ 0.98 without grain, which is per pixel by design); its cost and four viewports measured.
{
  const rows = Object.entries(browsers).map(([k, r]) => { const p = r?.result?.rendered?.post, errs = (r?.errors?.length ?? 0); return { k, p, ok: !!p && errs === 0 && p.ssim.noGrain >= 0.98 && p.passes.length >= 5 }; });
  check(11, 'Post: the anime stack renders everywhere; 4K matches 1080p (SSIM ≥ 0.98 without grain); costs and four viewports measured', rows.every((r) => r.ok),
    rows.map((r) => (r.p ? `${r.k}: SSIM ${r.p.ssim.noGrain} (grain ${r.p.ssim.grain}), anime ${r.p.costMs.anime1080p} / ${r.p.costMs.anime4k} ms vs none ${r.p.costMs.none1080p} / ${r.p.costMs.none4k} ms (1080p / 4K), 4 views ${r.p.views4Ms} ms` : `${r.k}: no result`)).join('; ') + (rows[0]?.p ? `; passes ${rows[0].p.passes.join(' → ')}` : ''));
}
// 12 (M2 W1). Sequences: sequences/morning.vrmxs in its set hashes identically at every step everywhere (its camera track,
// event key, eyes, line and shot override included), and scrubbing to any frame, backwards or forwards, from snapshots,
// lands on the world of the straight play.
{
  const sq = (r) => r?.result?.sequence ?? r?.sequence, ref = sq(node);
  const rows = Object.entries(browsers).map(([k, r]) => { const x = sq(r); const d = x && ref ? compareRuns(unpackRun(ref.run), unpackRun(x.run)) : { step: -1, component: 'no result' }; return { k, d, x, ok: !!x && !d && x.scrub.every((s) => s.matches) }; });
  const ok = !!ref && ref.scrub.every((s) => s.matches) && ref.cameraChanges.length === 4 && ref.spokeAt !== null && ref.lightInShot2 === 30 && rows.every((r) => r.ok);
  check(12, 'Sequences: the morning sequence identical everywhere; scrubbing lands on the straight play\'s world', ok,
    ref ? `${ref.steps} steps × ${ref.components} components, final ${ref.final}; cameras ${ref.cameraChanges.join(', ')}; shots ${ref.shots.join(', ')}; Hana's line @${ref.spokeAt}; counter light ${ref.lightInShot2} in s2, ${ref.light} after; Mira at ${ref.mira.join(', ')}; scrub ${ref.scrub.map((s) => `${s.frame}${s.matches ? '' : ' DIFFERS'} (${s.restored === null ? 'stepped' : `from ${s.restored}`} +${s.stepped}, ${s.ms} ms)`).join(', ')}; ${rows.map((r) => `${r.k}: ${r.d ? `DIVERGES at ${r.d.step} in ${r.d.component}` : r.ok ? `identical, scrub exact (${r.x.scrub.map((s) => s.ms).join('/')} ms)` : 'DIFFERS'}`).join('; ')}` : 'no node result');
}
// 13 (M2 W4). Particles: steam, dust, sparks and 40 more steam emitters in the cafe hash identically at every step
// everywhere (the particles are node state: seeded per step, portable maths), and a snapshot mid-effect re-simulates.
{
  const pt = (r) => r?.result?.particles ?? r?.particles, ref = pt(node);
  const rows = Object.entries(browsers).map(([k, r]) => { const x = pt(r); const d = x && ref ? compareRuns(unpackRun(ref.run), unpackRun(x.run)) : { step: -1, component: 'no result' }; return { k, d, x, ok: !!x && !d && x.snapshot.rerunMatches }; });
  const ok = !!ref && ref.snapshot.rerunMatches && ref.live.steam > 10 && ref.live.dust > 0 && rows.every((r) => r.ok);
  check(13, 'Particles: steam, dust and sparks identical everywhere at every step; snapshot mid-effect', ok,
    ref ? `${ref.steps} steps × ${ref.components} components, final ${ref.final}; ${ref.emitters} emitters, up to ${ref.peakParticles} particles, ${ref.batches} batches; live at the end: steam ${ref.live.steam}, dust ${ref.live.dust}, sparks ${ref.live.sparks}; particle step ${ref.stepMs} ms (node); snapshot @${ref.snapshot.at} ${ref.snapshot.rerunMatches ? 'identical' : 'DIFFERS'}; ${rows.map((r) => `${r.k}: ${r.d ? `DIVERGES at ${r.d.step} in ${r.d.component}` : r.ok ? `identical (step ${r.x.stepMs} ms)` : 'DIFFERS'}`).join('; ')}` : 'no node result');
}
// 14 (M2 W6 + W7). Navigation and NPC brains: Hana (server) and Mira (customer) on a navmesh baked from the cafe's
// colliders hash identically at every step everywhere (brains, memory, crowd included); the story happens in order; a
// snapshot mid-order re-simulates identically.
{
  const bx = (r) => r?.result?.brains ?? r?.brains, ref = bx(node);
  const rows = Object.entries(browsers).map(([k, r]) => { const x = bx(r); const d = x && ref ? compareRuns(unpackRun(ref.run), unpackRun(x.run)) : { step: -1, component: 'no result' }; return { k, d, x, ok: !!x && !d && x.snapshot.rerunMatches }; });
  const at = (text) => { const e = ref?.events.find((x) => x.includes(text)); return e ? Number(e.split(':')[0]) : null; };
  const order = [at('mira:sits'), at('What can I get you?'), at('A latte, please.'), at('Coming right up!'), at('Here you go.'), at('mira:stands')];
  const ok = !!ref && ref.snapshot.rerunMatches && order.every((v, i) => v !== null && (i === 0 || v > order[i - 1])) && ref.left && ref.nav.blocked.length > 0 && rows.every((r) => r.ok);
  check(14, 'Navigation and NPC brains: Hana serves Mira on the navmesh, identical everywhere; snapshot mid-order', ok,
    ref ? `${ref.steps} steps × ${ref.components} components, final ${ref.final}; navmesh ${ref.nav.polys} polys in ${ref.nav.tiles} tiles (${ref.nav.bakeMs} ms), blocked: ${ref.nav.blocked.join(', ')}; ${ref.events.join(' · ')}; Mira ${ref.left ? 'left' : 'DID NOT LEAVE'}; step ${ref.stepMs} ms (node); snapshot @${ref.snapshot.at} ${ref.snapshot.rerunMatches ? 'identical' : 'DIFFERS'}; ${rows.map((r) => `${r.k}: ${r.d ? `DIVERGES at ${r.d.step} in ${r.d.component}` : r.ok ? `identical (step ${r.x.stepMs} ms)` : 'DIFFERS'}`).join('; ')}` : 'no node result');
}
// 15 (M2 W9). Save games: the take with items saved at step 720 into a store (IndexedDB in the browsers) and read back is
// the same file everywhere; loaded into a fresh world it plays to the end with the same per-step hashes everywhere, and
// those are the hashes of the run that never stopped (check 8's).
{
  const sv = (r) => r?.result?.save ?? r?.save, ref = sv(node), items = node?.items;
  const tail = items ? unpackRun(items.run).filter((x) => x.step > (ref?.savedAt ?? 0)) : [];
  const sameAsUnbroken = !!ref && compareRuns(tail, unpackRun(ref.run));
  const rows = Object.entries(browsers).map(([k, r]) => { const x = sv(r); const d = x && ref ? compareRuns(unpackRun(ref.run), unpackRun(x.run)) : { step: -1, component: 'no result' }; return { k, d, x, ok: !!x && !d && x.file === ref?.file }; });
  const ok = !!ref && sameAsUnbroken === null && rows.every((r) => r.ok);
  check(15, 'Save games: saved at 720, loaded into a fresh world, the same per-step hashes to the end everywhere as the unbroken run', ok,
    ref ? `save file ${(ref.bytes / 1024).toFixed(0)} KB (${ref.file}), saved in ${ref.saveMs} ms, loaded in ${ref.loadMs} ms (node); ${ref.steps - ref.savedAt} steps after the load, final ${ref.final}; ${sameAsUnbroken === null ? 'identical to the unbroken run (check 8)' : `DIFFERS from the unbroken run at ${sameAsUnbroken.step} in ${sameAsUnbroken.component}`}; ${rows.map((r) => `${r.k}: ${r.d ? `DIVERGES at ${r.d.step} in ${r.d.component}` : r.ok ? `identical, same file via ${r.x.store} (load ${r.x.loadMs} ms)` : `DIFFERS (file ${r.x?.file})`}`).join('; ')}` : 'no node result');
}
// 16 (M2 W11). "Morning at the cafe": the 45 s film (brains cast from brain documents, four baked lines, steam, a music
// cue) hashes identically at every step everywhere; its beats land where the cut needs them (every line spoken with Hana
// at Mira's table, the steam while Hana is at the machine, served before the end, the music on its cue); a snapshot
// mid-film re-simulates identically.
{
  const fm = (r) => r?.result?.film ?? r?.film, ref = fm(node);
  const rows = Object.entries(browsers).map(([k, r]) => { const x = fm(r); const d = x && ref ? compareRuns(unpackRun(ref.run), unpackRun(x.run)) : { step: -1, component: 'no result' }; return { k, d, x, ok: !!x && !d && x.snapshot.rerunMatches }; });
  const b = ref?.beats;
  const beatsOk = !!b && b.lines.length === 4 && b.lines.every((l) => l.apart < 2.6) && !!b.steam && b.steam.hanaFromMachine < 1.2 && b.served !== null && b.served < ref.steps && b.music !== null && b.cameras.length >= 8;
  const ok = !!ref && ref.snapshot.rerunMatches && beatsOk && rows.every((r) => r.ok);
  check(16, 'Morning at the cafe: the 45 s film identical everywhere; lines, steam and served land on the cut; snapshot mid-film', ok,
    ref ? `${ref.steps} steps (${ref.seconds} s) × ${ref.components} components, final ${ref.final}; brains ${ref.brains.join(', ')}; lines ${b.lines.map((l) => `@${l.step} ${l.who} (${l.apart} m apart)`).join(', ')}; seated @${b.seated}; steam @${b.steam?.step} (Hana ${b.steam?.hanaFromMachine} m from the machine); served @${b.served}; music @${b.music}; ${b.cameras.length} camera changes; step ${ref.stepMs} ms (node); snapshot @${ref.snapshot.at} ${ref.snapshot.rerunMatches ? 'identical' : 'DIFFERS'}; ${rows.map((r) => `${r.k}: ${r.d ? `DIVERGES at ${r.d.step} in ${r.d.component}` : r.ok ? 'identical' : 'DIFFERS'}`).join('; ')}` : 'no node result');
}
// 17 (M3 W4). A recorded conversation replays with no model: takes/conversation.json (Mira walks in and talks with Hana
// for two minutes; the director's requests and decisions are in its ai log) replayed from its input and log alone hashes
// identically at every step everywhere; Hana says her six directed lines and serves the latte once; a snapshot halfway
// (a save) restored with the log's later entries plays to the same end.
{
  const cv = (r) => r?.result?.conversation ?? r?.conversation, ref = cv(node);
  const rows = Object.entries(browsers).map(([k, r]) => { const x = cv(r); const d = x && ref ? compareRuns(unpackRun(ref.run), unpackRun(x.run)) : { step: -1, component: 'no result' }; return { k, d, x, ok: !!x && !d && x.snapshot.rerunMatches }; });
  const served = ref?.lines.filter((l) => l.endsWith(':Here you go. Enjoy!')).length;
  const directed = ref?.lines.filter((l) => !/:(Here you go\. Enjoy!|Welcome in!|Hi! What can I get you\?|Coming right up!)$/.test(l)).length;
  const ok = !!ref && ref.snapshot.rerunMatches && served === 1 && directed === 6 && rows.every((r) => r.ok);
  check(17, 'A recorded conversation replays with no model, identical everywhere; a save halfway continues to the same end', ok,
    ref ? `${ref.steps} steps × ${ref.components} components, ${ref.events} logged events (${ref.decisions} decisions), final ${ref.final}; Hana: ${ref.lines.map((l) => l.replace(':', ' ')).join(' · ')}; served ${served}×; step ${ref.stepMs} ms (node); snapshot @${ref.snapshot.at} ${ref.snapshot.rerunMatches ? 'identical' : 'DIFFERS'}; ${rows.map((r) => `${r.k}: ${r.d ? `DIVERGES at ${r.d.step} in ${r.d.component}` : r.ok ? 'identical' : 'DIFFERS'}`).join('; ')}` : 'no node result');
}
// 18 (M3 W7). Ragdolls: Mira and Hana on a landing at the top of four steps, knocked down the stairs at step 30. Each
// falls as a ragdoll (one mapping from the humanoid, nothing per model), lies still and gets up below the landing,
// blending back into animation; every step hashes identically everywhere, and a snapshot mid-fall re-simulates to the end.
{
  const rg = (r) => r?.result?.ragdoll ?? r?.ragdoll, ref = rg(node);
  const rows = Object.entries(browsers).map(([k, r]) => { const x = rg(r); const d = x && ref ? compareRuns(unpackRun(ref.run), unpackRun(x.run)) : { step: -1, component: 'no result' }; return { k, d, x, ok: !!x && !d && x.snapshot.rerunMatches }; });
  const fell = ref && Object.values(ref.falls).every((f) => f.phases.map((p) => p.split('@')[0]).join(' ') === 'up falling down rising up' && f.lowestHips < ref.landing - 0.3 && f.end[1] < ref.landing - 0.15 && f.standing > 0.6);
  const ok = !!ref && fell && ref.snapshot.midFall && ref.snapshot.rerunMatches && rows.every((r) => r.ok);
  check(18, 'Ragdolls: knocked down the stairs, both characters fall, lie still and get up, identical everywhere; a snapshot mid-fall', ok,
    ref ? `${ref.steps} steps × ${ref.components} components, knocked at ${ref.knock}, final ${ref.final}; ${Object.entries(ref.falls).map(([id, f]) => `${id}: ${f.phases.join(' → ')}, hips down to ${f.lowestHips} m, up at [${f.end}] (hips ${f.standing} m)`).join('; ')}; step ${ref.stepMs} ms (node); snapshot @${ref.snapshot.at} ${ref.snapshot.midFall ? 'mid-fall' : 'NOT mid-fall'} ${ref.snapshot.rerunMatches ? 'identical' : 'DIFFERS'}; ${rows.map((r) => `${r.k}: ${r.d ? `DIVERGES at ${r.d.step} in ${r.d.component}` : r.ok ? 'identical' : 'DIFFERS'}`).join('; ')}` : 'no node result');
}
// 19 (M3 W8). Vehicles: the cart on the pavement. Mira gets in with the interact key, drives a recorded route (along the
// pavement, a lane change, the brakes) and gets out once it has stopped; the camera chases the cart while she drives.
// Every step hashes identically everywhere, the input recording replays into a fresh world with the same hashes, and a
// snapshot mid-drive re-simulates to the end.
{
  const vh = (r) => r?.result?.vehicle ?? r?.vehicle, ref = vh(node);
  const rows = Object.entries(browsers).map(([k, r]) => { const x = vh(r); const d = x && ref ? compareRuns(unpackRun(ref.run), unpackRun(x.run)) : { step: -1, component: 'no result' }; return { k, d, x, ok: !!x && !d && x.replay.matches && x.snapshot.rerunMatches }; });
  const dr = ref?.drive;
  const drove = !!dr && dr.seated !== null && dr.seated <= 40 && dr.left !== null && dr.cartEnd[0] < dr.cartFrom[0] - 4 && dr.cartEnd[2] - dr.cartFrom[2] > 0.5 && dr.maxSpeed > 2.5 && dr.chased > 200 && dr.parked;
  const ok = !!ref && drove && ref.replay.matches && ref.snapshot.midDrive && ref.snapshot.rerunMatches && rows.every((r) => r.ok);
  check(19, 'Vehicles: Mira gets in the cart, drives a recorded route and gets out; replays identically everywhere; a snapshot mid-drive', ok,
    ref ? `${ref.steps} steps × ${ref.components} components, final ${ref.final}; in at ${dr.seated}, out at ${dr.left}; the cart from [${dr.cartFrom}] to [${dr.cartEnd}], up to ${dr.maxSpeed} m/s, parked ${dr.parked}; camera chasing ${dr.chased} steps; the recording replayed ${ref.replay.matches ? 'identical' : 'DIFFERS'}; snapshot @${ref.snapshot.at} ${ref.snapshot.midDrive ? 'mid-drive' : 'NOT mid-drive'} ${ref.snapshot.rerunMatches ? 'identical' : 'DIFFERS'}; step ${ref.stepMs} ms (node); ${rows.map((r) => `${r.k}: ${r.d ? `DIVERGES at ${r.d.step} in ${r.d.component}` : r.ok ? 'identical' : 'DIFFERS'}`).join('; ')}` : 'no node result');
}
// 20 (M3 W9). Split screen: two players on one keyboard and one gamepad. Mira (WASD) and Hana (the arrows) each walk
// relative to their own camera and run apart; player 2 jumps and turns their camera with the gamepad's right stick, which
// leaves player 1's alone. Every step hashes identically everywhere, both players' recording replays into a fresh world,
// and a snapshot re-simulates. (The frame cost of two views against one: acceptance/m3/split-chromium.mjs.)
{
  const sp = (r) => r?.result?.split ?? r?.split, ref = sp(node);
  const rows = Object.entries(browsers).map(([k, r]) => { const x = sp(r); const d = x && ref ? compareRuns(unpackRun(ref.run), unpackRun(x.run)) : { step: -1, component: 'no result' }; return { k, d, x, ok: !!x && !d && x.replay.matches && x.snapshot.rerunMatches }; });
  const pl = ref?.play;
  const played = !!pl && pl.mira[1] < -1 && pl.hana[1] < -1 && pl.mira[0] < -2 && pl.hana[0] > 2 && pl.hanaAirSteps > 10 && Math.abs(pl.cam2Turned) > 0.3 && pl.cam1Turned === 0;
  const ok = !!ref && played && ref.replay.matches && ref.snapshot.rerunMatches && rows.every((r) => r.ok);
  check(20, 'Split screen: two players move two characters with their own cameras; both players\' recording replays identically everywhere', ok,
    ref ? `${ref.steps} steps × ${ref.components} components, ${ref.actions.axes} axes and ${ref.actions.buttons} buttons recorded, final ${ref.final}; Mira moved [x ${pl.mira[0]}, z ${pl.mira[1]}], Hana [x ${pl.hana[0]}, z ${pl.hana[1]}]; Hana ${pl.hanaAirSteps} steps in the air; player 2's camera turned ${pl.cam2Turned} rad, player 1's ${pl.cam1Turned}; the recording replayed ${ref.replay.matches ? 'identical' : 'DIFFERS'}; snapshot @${ref.snapshot.at} ${ref.snapshot.rerunMatches ? 'identical' : 'DIFFERS'}; step ${ref.stepMs} ms (node); ${rows.map((r) => `${r.k}: ${r.d ? `DIVERGES at ${r.d.step} in ${r.d.component}` : r.ok ? 'identical' : 'DIFFERS'}`).join('; ')}` : 'no node result');
}
checks.sort((a, b) => a.n - b.n);
fs.writeFileSync(res('summary.json'), JSON.stringify({ checks, runtimes: { node: node?.version, chromium: chromium?.version, wkwebview: scheme?.ua } }, null, 1) + '\n');
process.exit(checks.every((c) => c.ok) ? 0 : 1);
