// A project as the editor reads it: its files by ref, fetched from where the project is served. The editor starts on
// the sample project bundled with it (read-only); in the Mac shell, Open Project mounts a folder at /project/ and
// saves go back into it (project.write).
import { parse } from '@vrmxg/scene';
import * as core from '@vrmxg/core';
import { inShell, call } from '../../shell/js/shell.js';

export class Project {
  /** @param {{ base: string, files: string[], name: string, path?: string | null, writable?: boolean, truncated?: boolean }} o */
  constructor({ base, files, name, path = null, writable = false, truncated = false }) {
    this.base = base; this.files = files; this.name = name; this.path = path; this.writable = writable;
    /** The shell's listing was cut short (more files than it holds): what needs every file, an export, refuses. */
    this.truncated = truncated;
    this._behaviours = null;
  }

  url(ref) { return this.base + ref.split('/').map(encodeURIComponent).join('/'); }
  has(ref) { return this.files.includes(ref); }
  async bytes(ref) {
    const r = await fetch(this.url(ref), { cache: 'no-store' });
    if (!r.ok) throw new Error(`${ref}: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  async text(ref) { return new TextDecoder().decode(await this.bytes(ref)); }

  /** The project's scenes (prefabs included: they open as scenes too). */
  scenes() { return this.files.filter((f) => f.endsWith('.vrmxs')); }

  /** Write a scene back into the project folder (the Mac shell; a bundled project is read-only). */
  async write(ref, text) {
    if (!this.writable || !inShell) throw new Error(`${this.name} is read-only here: open a project folder to save into it`);
    const r = await call('project.write', { path: ref, text });
    if (!this.files.includes(ref)) this.files = [...this.files, ref].sort();
    return r;
  }

  /** Write a binary file (a thumbnail) into the project folder. @param {string} ref @param {string} base64 */
  async writeBase64(ref, base64) {
    if (!this.writable || !inShell) throw new Error(`${this.name} is read-only here: open a project folder to write into it`);
    const r = await call('project.write', { path: ref, base64 });
    if (!this.files.includes(ref)) this.files = [...this.files, ref].sort();
    return r;
  }

  /** Recorded input in the project (input/*.json, takes/*.json): the takes it can export. */
  takes() { return this.files.filter((f) => /^(input|takes)\/.+\.json$/.test(f)); }

  /** Every prefab a scene uses, recursively, by ref. */
  async prefabs(doc, map = new Map(), depth = 0) {
    for (const a of doc.assets ?? []) {
      if (a.type !== 'vrmxs' || map.has(a.ref) || depth > 16 || !this.has(a.ref)) continue;
      const p = parse(await this.text(a.ref));
      map.set(a.ref, p);
      await this.prefabs(p, map, depth + 1);
    }
    return map;
  }

  /** The project's animation sets (animations.json and its clips), or null. */
  async animations() {
    if (!this.has('animations.json')) return null;
    const doc = JSON.parse(await this.text('animations.json'));
    const clips = new Map();
    for (const c of doc.clips) if (this.has(c.file)) clips.set(c.sha256, await this.bytes(c.file));
    return { doc, clips };
  }

  /** The project's behaviours (behaviours.js, its exports under the names scenes use). */
  async behaviours() {
    if (this._behaviours) return this._behaviours;
    if (!this.has('behaviours.js')) return (this._behaviours = new Map());
    globalThis.VRMXG_CORE = core; // what the import map's @vrmxg/core hands project modules
    const mod = await import(/* @vite-ignore */ new URL(this.url('behaviours.js'), location.href).href);
    return (this._behaviours = new Map(Object.entries(mod).filter(([, v]) => typeof v === 'function' && typeof v.prototype?.getState === 'function')));
  }
}

/** The sample project the editor ships with. */
export async function bundledProject() {
  const files = await (await fetch('./project-files.json', { cache: 'no-store' })).json();
  return new Project({ base: './', files, name: 'Sample (bundled)', writable: false });
}

/** Open a project folder through the Mac shell (a panel, or VRMXG_SHELL_PROJECT in automation). */
export async function openProjectFolder() {
  const r = await call('project.open', { title: 'Open Project' });
  return new Project({ base: r.base, files: r.files, name: r.name, path: r.path, writable: true, truncated: r.truncated === true });
}
