// New Project and Open Recent (M6 W3, AB-T-0646). The editor ships the project templates in its web content
// (`templates/index.json`, written by vite.config.js from content/templates/), and the Mac shell's project.create
// (shell 0.14.0) copies one into a folder the person names: the template's own files and the content it brings (the
// sample's cafe and characters), with game.json made the new game's (its id and title). The recent projects are the
// shell's (project.recent, project.reopen), so File › Open Recent and the toolbar's list are one list.
import { gameIdFrom, personalGame } from '../../../content/templates/templates.js';
import { Project } from './project.js';
import { inShell, call } from '../../shell/js/shell.js';

export { gameIdFrom };
/** Where the editor keeps the templates' index in its web content. */
export const TEMPLATES_INDEX = './templates/index.json';

/**
 * The templates New Project offers: [{ id, title, description, files: [{ from, to }] }], `from` a path in the editor's
 * web content. @param {(url: string) => Promise<any>} [fetchJson]
 */
export async function loadTemplates(fetchJson = async (u) => { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(`the editor has no templates (${r.status})`); return r.json(); }) {
  const doc = await fetchJson(TEMPLATES_INDEX);
  return doc.templates ?? [];
}

/**
 * What project.create is asked to write for a template: every file copied from the web content but game.json, which
 * goes as text with the new game's id and title.
 * @param {{ id: string, files: { from: string, to: string }[] }} template @param {string} gameText the template's game.json
 * @param {{ title: string, id?: string }} o
 */
export function createRequest(template, gameText, { title, id = gameIdFrom(title) }) {
  const files = template.files.filter((f) => f.to !== 'game.json').map((f) => ({ from: f.from, to: f.to }));
  if (template.files.some((f) => f.to === 'game.json')) files.push({ to: 'game.json', text: personalGame(gameText, { id, title }) });
  return { title: 'New Project', name: title.trim().replace(/[/:\\]/g, '-').replace(/^\.+/, '') || 'New Game', files };
}

/**
 * Make a project from a template in a folder the person names (the Mac shell), and open it: → a Project.
 * @param {any} template one of loadTemplates() @param {{ title: string, id?: string }} o
 * @param {{ inShell: boolean, call: (m: string, p?: any) => Promise<any> }} [shell]
 * @param {(url: string) => Promise<string>} [fetchText]
 */
export async function newProjectFrom(template, o, shell = { inShell, call }, fetchText = async (u) => (await fetch(u, { cache: 'no-store' })).text()) {
  if (!shell.inShell) throw new Error('New Project needs the Mac app: a browser has no folder to make it in');
  const game = template.files.find((f) => f.to === 'game.json');
  const req = createRequest(template, game ? await fetchText(`./${game.from}`) : '{}', o);
  const r = await shell.call('project.create', req);
  return new Project({ base: r.base, files: r.files, name: r.name, path: r.path, writable: true, truncated: r.truncated === true });
}

/** The recent projects, newest first ([] outside the shell): [{ path, name, exists }]. */
export async function recentProjects(shell = { inShell, call }) {
  if (!shell.inShell) return [];
  try { return (await shell.call('project.recent')).projects ?? []; } catch { return []; }
}

/** Open a recent project with no panel: → a Project. */
export async function reopenProject(path, shell = { inShell, call }) {
  const r = await shell.call('project.reopen', { path });
  return new Project({ base: r.base, files: r.files, name: r.name, path: r.path, writable: true, truncated: r.truncated === true });
}

/**
 * The scene a project made or reopened here opens on: its game's entry (game.json), when the project has that scene;
 * else null (the editor's own choice, the first scene). Open Project keeps the first scene, as scenarios expect.
 * @param {{ has: (ref: string) => boolean, text: (ref: string) => Promise<string> }} project
 */
export async function entryScene(project) {
  if (!project.has('game.json')) return null;
  try { const e = JSON.parse(await project.text('game.json')).entry; return typeof e === 'string' && project.has(e) ? e : null; } catch { return null; }
}
