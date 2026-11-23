// The creator's project: the editor's (its files by ref, read from where the project is served; written back through
// the shell's project.write in the Mac app), plus files opened from elsewhere. A script, character or set opened
// with File › Open is put into the project under its folder (scripts/, characters/, sets/): in the Mac app it is
// written there at once (characters and sets: a short's sequence names them by ref) or on Save (a script); in a browser,
// where the bundled sample is read-only, it is held in memory for the session.
import { Project } from '../../editor/src/project.js';
import { inShell, call } from '../../shell/js/shell.js';

export class CreatorProject extends Project {
  constructor(o) { super(o); /** @type {Map<string, Uint8Array>} */ this.overlay = new Map(); }

  async bytes(ref) { return this.overlay.has(ref) ? this.overlay.get(ref).slice() : super.bytes(ref); }

  /** Files written this session that aren't on disk (a browser), by ref. */
  unsaved() { return [...this.overlay.keys()].sort(); }

  /** Put a file into the project: on disk in the Mac app, in memory in a browser. */
  async put(ref, bytes) {
    if (this.writable && inShell) {
      await call('project.write', { path: ref, base64: toBase64(bytes) });
      this.overlay.delete(ref);
    } else this.overlay.set(ref, bytes.slice());
    if (!this.files.includes(ref)) this.files = [...this.files, ref].sort();
  }

  async write(ref, text) {
    if (this.writable && inShell) return super.write(ref, text);
    await this.put(ref, new TextEncoder().encode(text)); // a browser: kept for the session
    return { path: ref, bytes: text.length, memory: true };
  }

  async writeBase64(ref, base64) {
    if (this.writable && inShell) return super.writeBase64(ref, base64);
    await this.put(ref, fromBase64(base64));
    return { path: ref, memory: true };
  }
}

export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64) { const s = atob(b64); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }

/** The sample project the creator ships with (read-only; opened files and saves stay in memory). */
export async function bundledProject() {
  const files = await (await fetch('./project-files.json', { cache: 'no-store' })).json();
  return new CreatorProject({ base: './', files, name: 'Sample (bundled)', writable: false });
}

/** Open a project folder through the Mac shell (a panel, or VRMXG_SHELL_PROJECT in automation). */
export async function openProjectFolder() {
  const r = await call('project.open', { title: 'Open Project' });
  return new CreatorProject({ base: r.base, files: r.files, name: r.name, path: r.path, writable: true });
}

/** File types File › Open takes: scripts, characters and sets. */
export const OPEN_TYPES = Object.freeze({ script: ['fountain'], character: ['vrmxa'], set: ['vrmxs', 'glb'] });

/**
 * A file the person picks (the shell's binary open, AB-A-0314: served at a URL, fetched here), or the files of an
 * Open Documents event. → { name, path, bytes }
 */
export async function pickFile(kind = 'any') {
  const types = kind === 'any' ? Object.values(OPEN_TYPES).flat() : OPEN_TYPES[kind];
  const r = await call('file.open', { title: kind === 'any' ? 'Open a script, character or set' : `Open ${kind}`, types, serve: true });
  return fetchOpened(r);
}

/** Read a file the shell serves (`url` from file.open with serve, or a file.opened event). */
export async function fetchOpened(r) {
  const res = await fetch(r.url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${r.name}: ${res.status}`);
  return { name: r.name, path: r.path ?? null, bytes: new Uint8Array(await res.arrayBuffer()) };
}

/** A file from an <input type=file> (a browser). */
export async function readPicked(file) { return { name: file.name, path: null, bytes: new Uint8Array(await file.arrayBuffer()) }; }
