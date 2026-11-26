// Shared by the tests: the sample's script-built sequence and its set, cards made as plain data (so the casting tests
// run in CI, where vrmxa-core isn't beside the repository), and where vrmxa-core and the characters live when they are.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { serialize } from '@vrmxg/scene';
import { buildSequence } from '@vrmxg/script';
import { cardOf } from '../src/index.js';

export const SAMPLE = path.resolve(import.meta.dirname, '../../../../content/sample');
export const set = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'cafe.vrmxs'), 'utf8'));
export const prefabs = new Map(fs.readdirSync(path.join(SAMPLE, 'prefabs')).map((f) => [`prefabs/${f}`, JSON.parse(fs.readFileSync(path.join(SAMPLE, 'prefabs', f), 'utf8'))]));
export const script = fs.readFileSync(path.join(SAMPLE, 'scripts/cafe-order.fountain'), 'utf8');
export const marks = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'scripts/cafe-marks.json'), 'utf8')).marks;
/** The sample sequence as the script builds it: the committed file is voiced and fitted to its speech since M4 W7. */
export const sampleText = serialize(buildSequence(script, { set, marks, id: 'cafe-order', source: 'scripts/cafe-order.fountain' }).doc);
export const sequence = () => JSON.parse(sampleText);
export const sha = (s) => createHash('sha256').update(s).digest('hex');
export const text = (doc) => serialize(doc);
export const track = (doc, id) => doc.sequence.tracks.find((t) => t.id === id);
/** Every track aimed at a role, as bytes: its performance (and its dialogue, minus the bake). */
export const performance = (doc, role) => doc.sequence.tracks.filter((t) => t.target === role && t.type !== 'dialogue').map((t) => JSON.stringify(t)).join('\n');
export const words = (doc, role) => doc.sequence.tracks.filter((t) => t.target === role && t.type === 'dialogue').map((t) => JSON.stringify(t.clips.map((c) => [c.src, c.start, c.end, c.text]))).join('\n');

const persona = (name, voice_id, allowed, rest) => ({ name, voice_id, allowed_expressions: allowed, rest_expression: rest });
const preset = (id, name, p) => ({ id, name, origin: 'preset', engines: { 'kokoro-82m': { preset: p } } });
/** The studio's Hana and Mira as cards (what readCharacter gives for content/characters/out/approved/*.vrmxa). */
export const studioHana = cardOf({
  ref: 'characters/studio/hana.vrmxa', sha256: 'dcd2e6100ab463752b573f2fc8365c4694c22ffe6bee1cb6e1f283ab8e8cedc0', vrmxaId: 'studio-hana', title: 'Hana',
  persona: persona('Hana', 'v-hana', ['happy', 'relaxed', 'surprised', 'sad'], 'relaxed'),
  voices: [preset('v-hana', 'Hana (Kokoro)', 'af_heart')], defaultVoice: 'v-hana',
  wardrobe: { worn: ['top-h', 'shoes-h'], outfit: null, outfits: [], items: [{ id: 'hair-h', slot: 'hair', kind: 'worn' }, { id: 'top-h', slot: 'tops', kind: 'worn' }, { id: 'shoes-h', slot: 'shoes', kind: 'worn' }] },
});
export const studioMira = cardOf({
  ref: 'characters/studio/mira.vrmxa', sha256: '30676e8b75662a6108a638bb18793f0e2daf31cf78d9071c615ba9ea1b2aef21', vrmxaId: 'studio-mira', title: 'Mira',
  persona: persona('Mira', 'v-mira', ['happy', 'surprised', 'relaxed', 'angry'], 'neutral'),
  voices: [preset('v-mira', 'Mira (Kokoro)', 'af_bella')], defaultVoice: 'v-mira',
  wardrobe: { worn: ['top-m'], outfit: null, outfits: [{ id: 'o-1', name: 'Apron', items: ['apron-m'] }], items: [{ id: 'top-m', slot: 'tops', kind: 'worn' }, { id: 'apron-m', slot: 'outer', kind: 'worn' }] },
});
/** The sample's Mira (a fixture): a persona whose voice is a designed tone with no Kokoro preset. */
export const sampleMira = cardOf({
  ref: 'characters/mira.vrmxa', vrmxaId: 'a585e579-4903-4a2b-a593-f72a6d5b779f', title: 'Mira',
  persona: persona('Mira', 'v-tone', ['happy', 'angry', 'sad', 'relaxed', 'surprised'], 'neutral'),
  voices: [{ id: 'v-tone', name: 'Mira', origin: 'designed', engines: {} }], defaultVoice: 'v-tone',
  wardrobe: { worn: ['top', 'sword'], states: { sword: 'stowed' }, outfit: 'adv', outfits: [{ id: 'adv', name: 'Adventurer', items: ['top', 'sword'] }] },
});
/** The sample's Hana (the "Minimal" fixture): no persona at all. */
export const sampleHana = cardOf({ ref: 'characters/hana.vrmxa', vrmxaId: 'cc97eb67-3eac-41c3-9e91-c15029fb6595', title: 'Minimal' });
/** The sample's role → Kokoro preset map (tools/bake-lines.mjs --voices, voice/lines.json). */
export const PRESETS = { 'hana-1': 'af_heart', mira: 'af_bella' };

// vrmxa-core and the characters, beside the repository on the development Mac
const DEV = new URL('../../../../../', import.meta.url);
const at = (p) => fileURLToPath(new URL(p, DEV));
export const CORE = at('vrmxa-core/src/');
export const STUDIO = at('vrmxa-avatar-studio/content/characters/out/approved/');
export const haveCore = fs.existsSync(path.join(CORE, 'index.js'));
export const haveStudio = fs.existsSync(path.join(STUDIO, 'hana.vrmxa')) && fs.existsSync(path.join(STUDIO, 'mira.vrmxa'));
export async function vrmxaModules() {
  const mods = await Promise.all(['index.js', 'voice/index.js', 'persona/index.js', 'closet/index.js', 'anim/index.js'].map((f) => import(path.join(CORE, f))));
  return Object.assign({}, ...mods);
}
