// Copies the snapshot harness's assets (Mira, Hana, the NPC, the CC0 clips, the cafe, its door prefabs, the recorded
// input) into web/public/models/, which git ignores: the models can't be committed. It takes them from this checkout's
// engine/packages/snapshot/harness/public/models if make-assets.mjs ran here, else from the main checkout's (a worktree
// shares its git directory with it). Every runtime then reads the same bytes, as in the render demo.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const here = import.meta.dirname, repo = path.resolve(here, '../../..');
const rel = 'engine/packages/snapshot/harness/public/models';
const common = path.resolve(repo, execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: repo, encoding: 'utf8' }).trim());
const candidates = [path.join(repo, rel), path.join(path.dirname(common), rel)];
const src = candidates.find((p) => fs.existsSync(path.join(p, 'mira.vrm')));
if (!src) throw new Error(`no harness models in ${candidates.join(' or ')}: run engine/packages/snapshot/harness/make-assets.mjs in the main checkout`);
const dst = path.join(here, '../public/models');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log(`copied ${fs.readdirSync(dst).length} entries from the harness (${path.relative(repo, src) || src}) to public/models`);
