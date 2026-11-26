// M6 W3 (AB-T-0646): what the Mac editor's New Project scenario (apps/editor-mac/docs/hand-test/
// HAND-TEST-M6-NEW-PROJECT.scenario.md) left on disk. Each project holds exactly its template's files, every one with a
// licence row, and plans as a build; the settings rows' edits are in game.json as the scenario made them (the title,
// Jump on J after the undone move, the physics layers and their matrix), and nothing else of the template's changed.
//
//   node acceptance/m6/new-project-mac.mjs <container>/tmp/m6-projects
import fs from 'node:fs';
import path from 'node:path';
import { planBuild, parseLicences, licenceOf } from '@vrmxg/bundle';
import { folderReader } from '@vrmxg/bundle/node';
import { DEFAULT_ACTIONS } from '@vrmxg/input';
import { listTemplates, TEMPLATES } from '../../content/templates/tools/new-project.mjs';

const dir = path.resolve(process.argv[2] ?? '');
const checks = [], say = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const walk = (root, d = root, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const f = path.join(d, e.name); if (e.isDirectory()) walk(root, f, out); else out.push(path.relative(root, f).split(path.sep).join('/')); } return out; };
const templates = new Map(listTemplates().map((t) => [t.id, t]));

const projects = { 'Cafe Dash': { template: 'level', id: 'cafe-dash', title: 'Cafe Dash Deluxe' }, Blank: { template: 'empty', id: 'blank', title: 'Blank' } };
for (const [name, want] of Object.entries(projects)) {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) { say(`${name}: made`, false, `no folder ${p}`); continue; }
  const files = walk(p).sort(), expected = templates.get(want.template).files.map((f) => f.to).sort();
  say(`${name}: exactly the "${want.template}" template's files`, JSON.stringify(files) === JSON.stringify(expected), `${files.length} files`);
  const rows = parseLicences(fs.readFileSync(path.join(p, 'LICENCES.md'), 'utf8'));
  const unlicensed = files.filter((f) => !licenceOf(rows, f));
  say(`${name}: every file has a licence row`, unlicensed.length === 0, unlicensed.join(', '));
  const r = folderReader(p), plan = await planBuild({ project: { files: r.files, read: r.read }, all: true });
  say(`${name}: plans as a build`, plan.problems.length === 0, plan.problems.map((x) => x.message).join('; '));
  const game = JSON.parse(fs.readFileSync(path.join(p, 'game.json'), 'utf8'));
  const tpl = JSON.parse(fs.readFileSync(path.join(TEMPLATES, want.template, 'game.json'), 'utf8'));
  say(`${name}: game.json has the game's id and title`, game.id === want.id && game.title === want.title, `${game.id}, "${game.title}"`);
  if (want.template === 'level') {
    const actions = structuredClone(DEFAULT_ACTIONS);
    actions.jump.bindings[0] = { key: 'KeyJ' };
    say(`${name}: Jump is on J, Interact keeps E (the move to E undone)`, JSON.stringify(game.input.actions) === JSON.stringify(actions), JSON.stringify(game.input.actions.jump));
    const physics = { layers: ['default', 'player', 'pickup'], collides: { default: ['default', 'player'], pickup: ['player', 'pickup'] } };
    say(`${name}: the physics layers and their matrix, both ways`, JSON.stringify(game.physics) === JSON.stringify(physics), JSON.stringify(game.physics));
    const rest = (g) => { const { id, title, input, physics: _p, ...o } = g; return o; };
    say(`${name}: nothing else of the template's game.json changed`, JSON.stringify(rest(game)) === JSON.stringify(rest(tpl)));
  } else say(`${name}: the template's game.json but for its id and title`, JSON.stringify({ ...tpl, id: game.id, title: game.title }) === JSON.stringify(game));
}
process.exit(checks.every((c) => c.ok) ? 0 : 1);
