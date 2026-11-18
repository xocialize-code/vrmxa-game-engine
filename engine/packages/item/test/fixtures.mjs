// The VRMXI fixtures and checker live in VRMXA_Specification (fixtures-vrmxi/, tools/check). Until the draft merges
// they are on its branch's worktree; afterwards on main. Tests skip, and say so, when neither is beside the repo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEV = fileURLToPath(new URL('../../../../../', import.meta.url));
const candidates = [path.join(DEV, 'VRMXA_Specification'), path.join(DEV, 'VRMXA_Specification/.claude/worktrees/vrmxi-draft-4198c8')];
export const SPEC = candidates.find((d) => fs.existsSync(path.join(d, 'fixtures-vrmxi/expected.json'))) ?? null;
export const fixture = (rel) => new Uint8Array(fs.readFileSync(path.join(SPEC, 'fixtures-vrmxi', rel)));
export const expected = () => JSON.parse(fs.readFileSync(path.join(SPEC, 'fixtures-vrmxi/expected.json'), 'utf8'));

/** The specification's checker for game items (VRMXI §13), as its CLI builds it. */
export async function specChecker() {
  const lib = path.join(SPEC, 'tools/check/lib');
  const { createChecker, specBinds } = await import(path.join(lib, 'check.js'));
  const { createGameItemChecker } = await import(path.join(lib, 'vrmxi.js'));
  const schemas = Object.fromEntries(fs.readdirSync(path.join(SPEC, 'schemas')).filter((f) => f.endsWith('.schema.json')).map((f) => [f, JSON.parse(fs.readFileSync(path.join(SPEC, 'schemas', f), 'utf8'))]));
  const bases = JSON.parse(fs.readFileSync(path.join(SPEC, 'assets/spec/bases.json'), 'utf8')).bases;
  const specVrm = path.join(SPEC, 'assets/spec/spec.vrm');
  const bytes = fs.existsSync(specVrm) ? new Uint8Array(fs.readFileSync(specVrm)) : null;
  const binds = bytes && bytes.length > 1024 ? specBinds(bytes) : null;
  const items = createGameItemChecker({ schemas, itemChecker: createChecker({ schemas, bases, specBinds: binds }) });
  return (b) => items.checkGameItem(b);
}
