// The repository's skills (AB-T-0608): each has a SKILL.md an agent client can read, and installs locally.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { toolList, OUTPUT_LIMIT } from '@vrmxg/mcp/tools';
import { shortToolList } from '@vrmxg/mcp/shorts';
import { m0Registry } from '@vrmxg/registry/m0';
import { createTools } from '../../engine/packages/mcp/src/headless.js';
import { Project } from '../../engine/packages/mcp/src/project.js';

const here = import.meta.dirname, skills = path.join(here, '..'), install = path.join(skills, 'install.mjs');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vrmxg-skills-'));
after(() => fs.rmSync(work, { recursive: true, force: true }));
const text = fs.readFileSync(path.join(skills, 'vrmxg/SKILL.md'), 'utf8');

test('the vrmxg skill: front matter a client reads, and a body small enough to load whole', () => {
  const fm = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(text);
  assert.ok(fm, 'front matter: name, then description');
  assert.equal(fm[1], 'vrmxg');
  assert.ok(fm[2].length > 80 && fm[2].length <= 1024, `description: ${fm[2].length} characters`);
  assert.ok(text.length < 20000, `${text.length} characters`);
  assert.ok(!/\/Users\/|\/Volumes\/|AB-[A-Z]-\d{4}/.test(text), 'no local paths or bridge ids');
});

test('the skill names only tools, modes and flags the server has', () => {
  const reg = m0Registry(), names = new Set([...toolList(reg, 'headless'), ...toolList(reg, 'editor'), ...shortToolList()].map((t) => t.name));
  for (const t of ['describe', 'tree', 'get_node', 'add_node', 'set', 'remove_node', 'reparent', 'connect', 'edit', 'validate', 'save', 'undo', 'engine_step', 'sequence', 'game', 'short', 'command', 'render', 'screenshot']) {
    assert.ok(names.has(t), `the server has no tool ${t}`);
    assert.ok(text.includes(`\`${t}`), `the skill doesn't mention ${t}`);
  }
  const server = fs.readFileSync(path.join(skills, '../engine/packages/mcp/src/server.js'), 'utf8');
  for (const flag of ['--editor', '--creator', '--behaviours', '--vrmxa-core', '--builds', '--runtime', '--projects', '--port']) {
    assert.ok(server.includes(`'${flag}'`), `server.js has no ${flag}`);
    assert.ok(text.includes(flag), `the skill doesn't mention ${flag}`);
  }
  assert.ok(text.includes(OUTPUT_LIMIT.toLocaleString('en-US')), 'the answer limit, as the server cuts it');
  const cmds = ['patch_script', 'write_script', 'recast', 'revoice', 'shot_camera', 'queue_export'];
  const agent = fs.readFileSync(path.join(skills, '../apps/creator/src/agent.js'), 'utf8');
  for (const c of cmds) assert.ok(agent.includes(`'${c}'`) && text.includes(c), c);
});

test('the building rules\' example runs as written on the sample cafe: one step, valid, each prop standing on the floor by its asset\'s real bounds', async () => {
  const section = text.slice(text.indexOf('## Building from parts'), text.indexOf('## Shorts in the creator'));
  const batch = JSON.parse(/```json\n([\s\S]+?)\n```/.exec(section)[1]);
  const t = createTools({ registry: m0Registry(), project: new Project(path.join(skills, '../content/sample')), scene: 'cafe.vrmxs' });
  const r = await t.call('edit', batch);
  assert.equal(r.isError, false, r.text);
  assert.match(r.text, /as one undo step \("Bus stop"\)/);
  assert.deepEqual(JSON.parse((await t.call('validate')).text), { ok: true, errors: [], warnings: [] });
  assert.deepEqual(JSON.parse((await t.call('game', { op: 'validate' })).text).problems, []);
  // each prop as the assets' own bounds have it (read from the .glb files, not from the text): its base sunk 0.02 m into
  // the floor, its collider the asset's height with the same base and at least its footprint (never saved)
  const node = (id) => t.doc.nodes.find((n) => n.id === id);
  assert.equal(node('stop').transform.p[1], 0, 'the group stands on the floor');
  for (const [part, file] of [['stop-bench', 'bench.glb'], ['stop-lamp', 'street-lamp.glb']]) {
    const b = glbBounds(path.join(skills, '../content/sample/props', file));
    const base = node(part).transform.p[1], look = node(`${part}-look`), solid = node(`${part}-solid`);
    assert.equal(look.props.colliders, 'none', `${part}: the asset brings no colliders of its own`);
    assert.ok(Math.abs(base - -0.02) < 1e-9, `${part} sinks 0.02 m into the floor`);
    assert.ok(Math.abs(base + look.transform.p[1] + b.min[1] - -0.02) < 0.001, `${part}'s model stands on its base: ${base + look.transform.p[1] + b.min[1]}`);
    const [w, h, d] = solid.props.size;
    assert.ok(Math.abs(base + solid.transform.p[1] - h / 2 - -0.02) < 1e-9, `${part}'s collider stands on the same base`);
    assert.ok(Math.abs(h - (b.max[1] - b.min[1])) < 0.001, `${part}'s collider is the asset's height`);
    assert.ok(w >= b.max[0] - b.min[0] - 0.001 && d >= b.max[2] - b.min[2] - 0.001, `${part}'s collider covers the asset's footprint`);
  }
});

/** A .glb's bounds in its own space, through its nodes' translations and scales (the sample's props have no rotations). */
function glbBounds(file) {
  const bytes = fs.readFileSync(file);
  const j = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const walk = (i, t, s) => {
    const n = j.nodes[i];
    assert.ok(!n.matrix && !(n.rotation && (n.rotation[0] || n.rotation[1] || n.rotation[2])), `${file}: a rotated node`);
    const tr = n.translation ?? [0, 0, 0], sc = n.scale ?? [1, 1, 1];
    const T = t.map((v, k) => v + s[k] * tr[k]), S = s.map((v, k) => v * sc[k]);
    for (const p of n.mesh != null ? j.meshes[n.mesh].primitives : []) {
      const a = j.accessors[p.attributes.POSITION];
      for (let k = 0; k < 3; k++) {
        const lo = T[k] + S[k] * a.min[k], hi = T[k] + S[k] * a.max[k];
        min[k] = Math.min(min[k], lo, hi); max[k] = Math.max(max[k], lo, hi);
      }
    }
    for (const c of n.children ?? []) walk(c, T, S);
  };
  for (const i of j.scenes[j.scene ?? 0].nodes) walk(i, [0, 0, 0], [1, 1, 1]);
  return { min, max };
}

test('install: into a folder, again over itself, never over someone else\'s, and as a link', () => {
  const dest = path.join(work, 'skills');
  execFileSync(process.execPath, [install, '--dest', dest]);
  assert.equal(fs.readFileSync(path.join(dest, 'vrmxg/SKILL.md'), 'utf8'), text);
  execFileSync(process.execPath, [install, '--dest', dest]); // its own install is replaced
  const other = path.join(work, 'taken');
  fs.mkdirSync(path.join(other, 'vrmxg'), { recursive: true });
  fs.writeFileSync(path.join(other, 'vrmxg/notes.txt'), 'mine');
  const r = spawnSync(process.execPath, [install, '--dest', other], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /holds a folder of something else: left alone/);
  assert.equal(fs.readFileSync(path.join(other, 'vrmxg/notes.txt'), 'utf8'), 'mine');
  const proj = path.join(work, 'game');
  execFileSync(process.execPath, [install, '--project', proj, '--link']);
  const linked = path.join(proj, '.claude/skills/vrmxg');
  assert.ok(fs.lstatSync(linked).isSymbolicLink());
  assert.equal(fs.realpathSync(linked), fs.realpathSync(path.join(skills, 'vrmxg')));
});

test('install never removes its own source, and a folder option needs a folder', () => {
  const copyRoot = path.join(work, 'repo-copy');
  fs.cpSync(skills, path.join(copyRoot, 'skills'), { recursive: true });
  const r = spawnSync(process.execPath, [path.join(copyRoot, 'skills/install.mjs'), '--dest', path.join(copyRoot, 'skills')], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /this skill's own source .*nothing installed there, --force or not/);
  assert.ok(fs.existsSync(path.join(copyRoot, 'skills/vrmxg/SKILL.md')), 'the source is still there');
  for (const k of ['--dest', '--project']) {
    const e = spawnSync(process.execPath, [install, k], { encoding: 'utf8' });
    assert.equal(e.status, 2);
    assert.match(e.stderr, new RegExp(`${k} needs a folder`));
  }
});

test('install refuses a target that contains its source (the repo cloned into the skills folder), even with --force', () => {
  const skillsHome = path.join(work, 'clone-home');
  const clone = path.join(skillsHome, 'vrmxg'); // the repository cloned as ~/.claude/skills/vrmxg
  fs.cpSync(skills, path.join(clone, 'skills'), { recursive: true });
  fs.writeFileSync(path.join(clone, 'README.md'), 'the rest of the repository');
  const r = spawnSync(process.execPath, [path.join(clone, 'skills/install.mjs'), '--dest', skillsHome, '--force'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /contains this skill's own source .*--force or not/);
  assert.ok(fs.existsSync(path.join(clone, 'README.md')) && fs.existsSync(path.join(clone, 'skills/vrmxg/SKILL.md')), 'the clone is untouched');
});

test('install: no home folder, a dangling link, and a copy with hand edits are each refused without --force', () => {
  const cwd = fs.mkdtempSync(path.join(work, 'cwd-'));
  const nohome = spawnSync(process.execPath, [install], { encoding: 'utf8', cwd, env: { ...process.env, HOME: '' } });
  assert.equal(nohome.status, 2);
  assert.match(nohome.stderr, /no home folder/);
  assert.deepEqual(fs.readdirSync(cwd), [], 'nothing written where it was run');
  const dest = path.join(work, 'edges');
  fs.mkdirSync(dest, { recursive: true });
  fs.symlinkSync(path.join(work, 'gone'), path.join(dest, 'vrmxg'));
  const dangling = spawnSync(process.execPath, [install, '--dest', dest], { encoding: 'utf8' });
  assert.equal(dangling.status, 1);
  assert.match(dangling.stderr, /holds a link to nothing: left alone/);
  execFileSync(process.execPath, [install, '--dest', dest, '--force']);
  assert.equal(fs.readFileSync(path.join(dest, 'vrmxg/SKILL.md'), 'utf8'), text);
  fs.appendFileSync(path.join(dest, 'vrmxg/SKILL.md'), '\nmy own note\n');
  const edited = spawnSync(process.execPath, [install, '--dest', dest], { encoding: 'utf8' });
  assert.equal(edited.status, 1);
  assert.match(edited.stderr, /holds a copy of this skill with changes in it: left alone/);
  assert.match(fs.readFileSync(path.join(dest, 'vrmxg/SKILL.md'), 'utf8'), /my own note/);
  execFileSync(process.execPath, [install, '--dest', dest, '--force']);
  assert.equal(fs.readFileSync(path.join(dest, 'vrmxg/SKILL.md'), 'utf8'), text);
});
