// Project templates (M6 W3, AB-T-0646): what New Project makes a game from. A template is a folder here with a
// `template.json`, the files it adds of its own (its game.json, scenes, LICENCES.md) and a list of content it copies
// in from elsewhere under content/ (the sample's cafe and characters today; the starter content, M6 W4, when it lands):
//
//   { "format": "vrmxg-template", "version": 1, "id": "level", "title": "One level", "description": "…", "order": 2,
//     "copy": [{ "from": "sample/sets/cafe.glb" }, { "from": "sample/animations/clips/*.vrma" }, { "from": "starter/x.glb", "to": "props/x.glb" }] }
//
// `from` is a path under content/ (`*` matches within one folder level); `to` is where it goes in the project, by default
// `from` without its first folder (`sample/sets/cafe.glb` → `sets/cafe.glb`). The template's own files go in at their
// paths in its folder. Nothing is duplicated in the repository: a project gets its own copy only when it is made.
//
// Plain functions over listings, so the editor's build (which ships the templates in its web content), the Mac shell's
// project.create (which copies them), Node's `tools/new-project.mjs` and MCP (M6 W8) read templates one way.

export const TEMPLATE_FILE = 'template.json';
export const TEMPLATE_FORMAT = 'vrmxg-template';
export const TEMPLATE_VERSION = 1;

const bad = (id, message) => new Error(`template ${id}: ${message}`);
/** A plain relative path: `/`-separated, no empty, hidden or upward segment, no backslash or colon. */
export const plainPath = (p) => typeof p === 'string' && p !== '' && !/[\\:\0-\x1f]/.test(p) && !p.startsWith('/') && p.split('/').every((s) => s !== '' && !s.startsWith('.'));

/**
 * A template.json checked, with its defaults filled in.
 * @param {any} doc @returns {{ id: string, title: string, description: string, order: number, copy: { from: string, to: string | null }[] }}
 */
export function checkTemplate(doc) {
  const id = doc?.id;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('a template.json is an object');
  if (doc.format !== TEMPLATE_FORMAT || doc.version !== TEMPLATE_VERSION) throw bad(id, `is not a ${TEMPLATE_FORMAT} version ${TEMPLATE_VERSION} document`);
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw bad(id, '"id" is lowercase letters, digits and hyphens');
  if (typeof doc.title !== 'string' || !doc.title.trim()) throw bad(id, '"title" is text');
  if (doc.copy !== undefined && !Array.isArray(doc.copy)) throw bad(id, '"copy" is a list of { from, to? }');
  const copy = (doc.copy ?? []).map((c) => {
    if (!plainPath(c?.from) || !c.from.includes('/')) throw bad(id, `copy "from" is a path under content/ (${JSON.stringify(c?.from)})`);
    if (c.to !== undefined && (!plainPath(c.to) || c.to.includes('*'))) throw bad(id, `copy "to" is a path in the project (${JSON.stringify(c.to)})`);
    if (c.to !== undefined && c.from.includes('*')) throw bad(id, `a pattern (${c.from}) keeps its files' paths: it takes no "to"`);
    return { from: c.from, to: c.to ?? null };
  });
  return { id, title: doc.title.trim(), description: typeof doc.description === 'string' ? doc.description : '', order: Number.isFinite(doc.order) ? doc.order : 100, copy };
}

const glob = (p) => new RegExp(`^${p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);

/**
 * Every file a project made from this template holds: `{ source, to }`, where `source` is a path under content/ (the
 * template's own files are `templates/<id>/<file>`). Sorted by `to`.
 * @param {ReturnType<typeof checkTemplate>} template
 * @param {{ own: string[], content: string[] }} listing own: the template folder's files (template.json is left out);
 *   content: every file under content/, for the copies (what a pattern matches)
 */
export function templateFiles(template, { own, content }) {
  const out = new Map();
  const add = (source, to) => {
    const key = to.toLowerCase();
    if (out.has(key)) throw bad(template.id, `${to} comes from both ${out.get(key).source} and ${source}`);
    out.set(key, { source, to });
  };
  for (const f of own) if (f !== TEMPLATE_FILE) add(`templates/${template.id}/${f}`, f);
  const have = new Set(content);
  for (const c of template.copy) {
    const strip = (p) => p.slice(p.indexOf('/') + 1);
    if (c.from.includes('*')) {
      const re = glob(c.from), hits = content.filter((f) => re.test(f));
      if (!hits.length) throw bad(template.id, `copy ${c.from} matches no file`);
      for (const f of hits.sort()) add(f, strip(f));
    } else {
      if (!have.has(c.from)) throw bad(template.id, `copy ${c.from}: there is no such file under content/`);
      add(c.from, c.to ?? strip(c.from));
    }
  }
  return [...out.values()].sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
}

/** A game id from a title: lowercase letters, digits and hyphens (`My Cafe Game!` → `my-cafe-game`). */
export function gameIdFrom(title) {
  return String(title ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/, '') || 'game';
}

/**
 * The template's game.json made the new game's: its id and title (and nothing else) replaced, written the way the
 * editor's settings write it (`JSON.stringify(doc, null, 1)` and a newline).
 * @param {string} text the template's game.json @param {{ id: string, title: string }} o
 */
export function personalGame(text, { id, title }) {
  const doc = JSON.parse(text);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error(`a game's id is lowercase letters, digits and hyphens ("${id}")`);
  if (typeof title !== 'string' || !title.trim()) throw new Error('a game needs a title');
  return `${JSON.stringify({ ...doc, id, title: title.trim() }, null, 1)}\n`;
}
