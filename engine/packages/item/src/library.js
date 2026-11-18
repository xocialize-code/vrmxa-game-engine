// Items (the "items" service): .vrmxi files read, checked and their models parsed once per file before the scene is
// instantiated (or before a runtime add), shared by every Item node that uses them.
import { parseGLB } from '@vrmxg/model';
import { readItem } from './read.js';
import { itemPhysics } from './physics.js';

export class ItemLibrary {
  /**
   * @param {object} opts
   * @param {(ref: string) => Promise<Uint8Array> | Uint8Array} opts.resolve bytes of a project file by ref
   * @param {any} opts.vrmxaCore vrmxa-core (its readZip), injected (AB-D-0249)
   * @param {(bytes: Uint8Array) => any[]} [opts.check] the specification's VRMXI checker (VRMXI §13); without it only what can't load is refused
   * @param {Map<string, any>} [opts.prefabs]
   * @param {boolean} [opts.stubTextures] headless: skip image decoding
   */
  constructor({ resolve, vrmxaCore, check, prefabs = new Map(), stubTextures = false }) {
    this.resolve = resolve; this.vrmxaCore = vrmxaCore; this.check = check; this.prefabs = prefabs; this.stubTextures = stubTextures;
    /** ref → { manifest, model bytes, wearable, scene, animations, json, plan, warnings } */ this.files = new Map();
    /** node id → ref */ this.refs = new Map();
  }

  /** Read every item a scene uses, prefab instances included. */
  async prepare(doc) {
    const walk = async (d, prefix, depth) => {
      if (depth > 16) return;
      const assets = new Map((d.assets ?? []).map((a) => [a.id, a]));
      for (const n of d.nodes) {
        const ref = assets.get(n.asset)?.ref;
        if (n.type === 'Item' && ref) await this.prepareNode(prefix + n.id, ref);
        else if (n.type === 'Instance' && ref && this.prefabs.has(ref)) await walk(this.prefabs.get(ref), `${prefix}${n.id}/`, depth + 1);
      }
    };
    await walk(doc, '', 0);
    return this;
  }

  /** Read one Item node's file (a runtime add). */
  async prepareNode(id, ref) {
    if (!this.files.has(ref)) this.files.set(ref, await this.load(ref));
    this.refs.set(id, ref);
  }

  async load(ref) {
    const read = readItem(await this.resolve(ref), { vrmxaCore: this.vrmxaCore, check: this.check, where: ref });
    const model = await parseGLB(read.model, { stubTextures: this.stubTextures });
    // where each glTF node sits in the scene's traversal order, so a clone's parts are found by index, not name
    const order = []; model.scene.traverse((o) => order.push(o));
    const nodeOrder = model.nodeObjects.map((o) => (o ? order.indexOf(o) : -1));
    return { ...read, ...model, nodeOrder, plan: itemPhysics(model.json) };
  }

  get(id) {
    const ref = this.refs.get(id);
    if (!ref) throw new Error(`item "${id}" isn't prepared: await items.prepare(doc) before instantiate`);
    return { ref, ...this.files.get(ref) };
  }
}
