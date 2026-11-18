// Where saves go (M2 W9). One shape for every store:
//   list() → [{ slot, name, savedAt, step, seconds, scene, bytes }]   read(slot) → doc   write(slot, doc)   remove(slot)
//   MemoryStore    tests, previews
//   IndexedDBStore a browser (the playground, the editor in a browser)
//   ShellStore     the Mac shell's saves folder (saves.* bridge methods: the app's own container, no panels)
//   FsStore        Node (./node: files in a folder)
const entry = (slot, doc, bytes) => ({ slot, name: doc.name ?? slot, savedAt: doc.savedAt ?? null, step: doc.summary?.step ?? null, seconds: doc.summary?.seconds ?? null, scene: doc.summary?.scene ?? null, bytes });

export class MemoryStore {
  constructor() { this.files = new Map(); }
  async list() { return [...this.files].map(([slot, text]) => entry(slot, JSON.parse(text), text.length)).sort((a, b) => (a.slot < b.slot ? -1 : 1)); }
  async read(slot) { const t = this.files.get(slot); if (!t) throw new Error(`no save "${slot}"`); return JSON.parse(t); }
  async write(slot, doc) { const t = JSON.stringify(doc); this.files.set(slot, t); return entry(slot, doc, t.length); }
  async remove(slot) { this.files.delete(slot); }
}

export class IndexedDBStore {
  /** @param {string} [db] the database's name (one per app) */
  constructor(db = 'vrmxg-saves') { this.dbName = db; this._db = null; }
  open() {
    this._db ??= new Promise((ok, fail) => {
      const r = indexedDB.open(this.dbName, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('saves');
      r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
    });
    return this._db;
  }
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((ok, fail) => { const t = db.transaction('saves', mode), s = t.objectStore('saves'), r = fn(s); t.oncomplete = () => ok(r?.result); t.onerror = () => fail(t.error); });
  }
  async list() {
    const db = await this.open();
    return new Promise((ok, fail) => {
      const out = [], c = db.transaction('saves').objectStore('saves').openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { const t = cur.value; out.push(entry(String(cur.key), JSON.parse(t), t.length)); cur.continue(); } else ok(out.sort((a, b) => (a.slot < b.slot ? -1 : 1))); };
      c.onerror = () => fail(c.error);
    });
  }
  async read(slot) { const t = await this.tx('readonly', (s) => s.get(slot)); if (!t) throw new Error(`no save "${slot}"`); return JSON.parse(t); }
  async write(slot, doc) { const t = JSON.stringify(doc); await this.tx('readwrite', (s) => s.put(t, slot)); return entry(slot, doc, t.length); }
  async remove(slot) { await this.tx('readwrite', (s) => s.delete(slot)); }
}

export class ShellStore {
  /** @param {(method: string, params?: any) => Promise<any>} call the shell bridge's call (apps/shell/js/shell.js) */
  constructor(call) { this.call = call; }
  async list() { return (await this.call('saves.list')).saves.map((s) => ({ slot: s.slot, bytes: s.bytes, ...(s.summary ?? {}) })); }
  async read(slot) { return JSON.parse((await this.call('saves.read', { slot })).text); }
  async write(slot, doc) {
    const text = JSON.stringify(doc);
    const summary = entry(slot, doc, text.length);
    await this.call('saves.write', { slot, text, summary });
    return summary;
  }
  async remove(slot) { await this.call('saves.remove', { slot }); }
}
