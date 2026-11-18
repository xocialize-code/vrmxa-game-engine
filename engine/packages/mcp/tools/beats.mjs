// A scene's beats, for cutting a sequence to its brains (M2 W11): runs a scene or sequence headless and prints, step by
// step, each NPC brain's running branch and animation as it changes, every line spoken, and the camera cuts, with the
// sequence frame each happens on. "Morning at the cafe" was cut from this: lines go where the speaker stands at the
// listener, the steam where the server works the machine.
//   node engine/packages/mcp/tools/beats.mjs <project-root> <scene.vrmxs> [--steps N] [--vrmxa-core dir] [--behaviours m.js]
import fs from 'node:fs';
import { installPortableMath } from '@vrmxg/dmath';
import { parse } from '@vrmxg/scene';
import { Project, EngineSession } from '../src/index.js';

installPortableMath();
const argv = process.argv.slice(2), opt = (k) => { const i = argv.indexOf(k); return i < 0 ? undefined : argv[i + 1]; };
const [root, scene] = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
if (!root || !scene) { console.error('usage: beats.mjs <project-root> <scene.vrmxs> [--steps N] [--vrmxa-core dir] [--behaviours m.js]'); process.exit(2); }
const project = new Project(root, { behaviours: opt('--behaviours'), vrmxaCore: opt('--vrmxa-core') });
const doc = parse(fs.readFileSync(project.file(scene), 'utf8'));
const s = new EngineSession(project);
await s.load(doc, project.prefabs(doc));
const tree = s.tree, ai = tree.services.get('ai'), seq = tree.services.get('sequence');
const steps = Number(opt('--steps') ?? (seq?.seq ? seq.stepOf(seq.duration).step : 1800));
const when = () => `step ${String(tree.clock.step).padStart(5)}${seq?.seq ? ` frame ${seq.frameAt().toFixed(1).padStart(6)}` : ''}`;
const at = (n) => { const p = n.object3d.position; return `@${p.x.toFixed(2)},${p.z.toFixed(2)}`; };
for (const n of tree.all()) if (n.type === 'Character') tree.listen(n, 'spoke', (a) => console.log(`${when()}  ${n.id} says "${a.text}" ${at(n)}`));
const brain = tree.all().find((n) => n.type === 'CameraBrain');
if (brain) tree.listen(brain, 'cameraChanged', (p) => console.log(`${when()}  cut to ${p.to}`));
const last = new Map();
for (let i = 0; i < steps; i++) {
  while (!tree.step()) await tree.settle();
  for (const b of ai?.brains ?? []) {
    const g = b.node.graph, st = b.inspect();
    const line = `${st.running.map((x) => x.do ?? x.name ?? x.type).join(' > ')}${b.node.ctrl?.seat ? ' [seated]' : ''} (${g?.state}${g?.gesturing ? ` + ${g.layer.slot}` : ''})`;
    if (last.get(b.node.id) !== line) { last.set(b.node.id, line); console.log(`${when()}  ${b.node.id} ${at(b.node)}: ${line}`); }
  }
}
