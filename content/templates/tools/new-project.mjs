// Make a game project from a template in Node (M6 W3), as the editor's New Project does in the Mac shell: the
// template's files and the content it copies, into a new or empty folder, with the game's own id and title.
//
//   node content/templates/tools/new-project.mjs <template> <folder> [--title "My Game"] [--id my-game]
//   node content/templates/tools/new-project.mjs --list
import fs from 'node:fs';
import path from 'node:path';
import { checkTemplate, templateFiles, gameIdFrom, personalGame, TEMPLATE_FILE } from '../templates.js';

export const CONTENT = path.resolve(import.meta.dirname, '../..');
export const TEMPLATES = path.join(CONTENT, 'templates');

const walk = (root, dir = root, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(root, f, out); else out.push(path.relative(root, f).split(path.sep).join('/'));
  }
  return out;
};

/** Every template: its checked template.json and the files a project made from it holds ({ source, to }). */
export function listTemplates() {
  const content = walk(CONTENT);
  return fs.readdirSync(TEMPLATES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(TEMPLATES, e.name, TEMPLATE_FILE)))
    .map((e) => {
      const t = checkTemplate(JSON.parse(fs.readFileSync(path.join(TEMPLATES, e.name, TEMPLATE_FILE), 'utf8')));
      if (t.id !== e.name) throw new Error(`template ${t.id} is in a folder named ${e.name}`);
      return { ...t, files: templateFiles(t, { own: walk(path.join(TEMPLATES, e.name)), content }) };
    })
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
}

/**
 * Make the project: `out` must not exist or be empty (hidden files aside). → { id, title, files }
 * @param {string} id the template's @param {string} out @param {{ title?: string, gameId?: string }} [o]
 */
export function makeProject(id, out, { title = 'New Game', gameId = gameIdFrom(title) } = {}) {
  const t = listTemplates().find((x) => x.id === id);
  if (!t) throw new Error(`no template "${id}"`);
  if (fs.existsSync(out) && fs.readdirSync(out).some((f) => !f.startsWith('.'))) throw new Error(`${out} isn't empty: a new project goes in a new or empty folder`);
  for (const f of t.files) {
    const dest = path.join(out, f.to);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (f.to === 'game.json') fs.writeFileSync(dest, personalGame(fs.readFileSync(path.join(CONTENT, f.source), 'utf8'), { id: gameId, title }));
    else fs.copyFileSync(path.join(CONTENT, f.source), dest);
  }
  return { id: gameId, title, files: t.files.map((f) => f.to) };
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes('--list')) { for (const t of listTemplates()) console.log(`${t.id}\t${t.title}\t${t.files.length} files`); process.exit(0); }
  const [id, out] = args.filter((a, i) => !a.startsWith('--') && !['--title', '--id'].includes(args[i - 1]));
  if (!id || !out) { console.error('usage: new-project.mjs <template> <folder> [--title "My Game"] [--id my-game]'); process.exit(2); }
  const title = opt('--title') ?? 'New Game';
  console.log(JSON.stringify(makeProject(id, path.resolve(out), { title, gameId: opt('--id') ?? gameIdFrom(title) })));
}
