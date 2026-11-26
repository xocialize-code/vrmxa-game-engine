// Saves as files in a folder (Node: tools, tests, the MCP server). Not in the browser bundle (it imports node:fs).
import fs from 'node:fs';
import path from 'node:path';
import { compatOf } from './stores.js';

const safe = (slot) => { if (!/^[A-Za-z0-9_-]{1,64}$/.test(slot)) throw new Error(`a slot is letters, digits, - and _ ("${slot}")`); return slot; };

export class FsStore {
  /** @param {string} dir */
  constructor(dir) { this.dir = dir; fs.mkdirSync(dir, { recursive: true }); }
  file(slot) { return path.join(this.dir, `${safe(slot)}.vrmxgsave`); }
  async list() {
    return fs.readdirSync(this.dir).filter((f) => f.endsWith('.vrmxgsave')).sort().map((f) => {
      const text = fs.readFileSync(path.join(this.dir, f), 'utf8'), d = JSON.parse(text);
      return { slot: f.replace(/\.vrmxgsave$/, ''), name: d.name ?? null, savedAt: d.savedAt ?? null, step: d.summary?.step ?? null, seconds: d.summary?.seconds ?? null, scene: d.summary?.scene ?? null, bytes: text.length, build: d.extra?.build?.digest ?? null, game: d.extra?.build?.game ?? null, compat: compatOf(d) };
    });
  }
  async read(slot) { return JSON.parse(fs.readFileSync(this.file(slot), 'utf8')); }
  async write(slot, doc) { const text = JSON.stringify(doc); fs.writeFileSync(this.file(slot), text); return { slot, bytes: text.length, step: doc.summary?.step ?? null }; }
  async remove(slot) { fs.rmSync(this.file(slot), { force: true }); }
}
