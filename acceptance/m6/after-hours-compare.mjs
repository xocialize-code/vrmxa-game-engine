// M6 W10 (AB-T-0651), M6's exit check 6: what HAND-TEST-M6-AFTER-HOURS left, from outside the app. The project the scenario
// built from New Project against the committed game, byte for byte: its four scenes (ids included), its game.json (as the
// settings panel wrote it) and its behaviours module (the one file written by hand, copied in); then the build its Export
// Game wrote, checked whole against its manifest and played to both endings in Node by the scripted player.
//
//   node acceptance/m6/after-hours-compare.mjs <project folder> [<build folder>] [--out <json>]
import fs from 'node:fs';
import path from 'node:path';
import { parse, createValidator } from '@vrmxg/scene';
import { checkFolder } from '@vrmxg/bundle/node';
import { afterHoursRegistry } from '../../content/sample/tools/after-hours-build.mjs';
import { SCENES, GAME } from '../../content/sample/tools/after-hours-plan.mjs';
import { playAfterHours, AFTER_HOURS_PLANS } from './after-hours-node.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const [project, build] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
if (!project) { console.error('usage: node acceptance/m6/after-hours-compare.mjs <project folder> [<build folder>] [--out <json>]'); process.exit(2); }
const checks = [], say = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const committed = (ref) => fs.readFileSync(path.join(root, 'content/sample', ref));
const built = (ref) => (fs.existsSync(path.join(project, ref)) ? fs.readFileSync(path.join(project, ref)) : null);

const { check } = createValidator(await afterHoursRegistry());
for (const { ref } of SCENES) {
  const want = committed(ref), got = built(ref);
  let detail = got ? `${got.length} of ${want.length} bytes` : 'not saved';
  if (got && !got.equals(want)) {
    const w = parse(want.toString()), g = parse(got.toString()), byId = (d) => new Map(d.nodes.map((n) => [n.id, JSON.stringify(n)]));
    const wn = byId(w), gn = byId(g);
    const differ = [...wn.keys()].filter((id) => wn.get(id) !== gn.get(id)), extra = [...gn.keys()].filter((id) => !wn.has(id));
    detail += `; nodes missing or differing: ${differ.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}; connections ${g.connections.length} of ${w.connections.length}${JSON.stringify(g.connections) === JSON.stringify(w.connections) ? ' (the same)' : ' (they differ)'}; assets ${JSON.stringify(g.assets) === JSON.stringify(w.assets) ? 'the same' : 'differ'}`;
  }
  const valid = got ? check(parse(got.toString()), { prefabs: new Map() }) : { ok: false, errors: [] };
  say(`${ref}: the saved scene is the committed one, byte for byte, ids included, and valid`, !!got && got.equals(want) && valid.ok, detail + (valid.ok ? '' : `; invalid: ${valid.errors.join('; ')}`));
}
for (const [ref, mine] of [['game.json', `${path.dirname(GAME.behaviours)}/game.json`], [GAME.behaviours, GAME.behaviours]]) {
  const want = committed(mine), got = built(ref);
  say(`${ref}: the project's is the committed ${mine}, byte for byte`, !!got && got.equals(want), got ? `${got.length} of ${want.length} bytes` : 'missing');
}

let plays = null;
if (build) {
  const folder = checkFolder(build);
  say('the exported build is whole against its manifest', folder.ok, folder.ok ? `${folder.files ?? ''} files` : JSON.stringify(folder.problems ?? folder).slice(0, 300));
  plays = {};
  for (const name of ['win', 'lose']) {
    const r = await playAfterHours(build, AFTER_HOURS_PLANS[name]);
    const want = name === 'win' ? 'won' : 'lost';
    plays[name] = { decided: r.decided, ending: r.ending };
    say(`the editor's build plays to the ${want} ending in Node (the scripted player, ${name})`, r.decided?.result === want && r.ending?.scene === `after-hours/${want}.vrmxs`, `${JSON.stringify(r.decided)} → ${JSON.stringify(r.ending)}`);
  }
}

const ok = checks.every((c) => c.ok);
if (out) fs.writeFileSync(out, `${JSON.stringify({ check: 'M6 exit check 6 (AB-T-0651): "After Hours" built in the Mac editor from New Project; the saved scenes, game.json and behaviours against the committed ones, byte for byte; the exported build played to both endings', ok, checks, plays }, null, 1)}\n`);
console.log(ok ? 'all checks pass' : 'some checks failed');
process.exit(ok ? 0 : 1);
